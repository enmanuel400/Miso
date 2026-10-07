/**
 * Comprobacion en vivo de la navegacion de capitulos, contra las fuentes de
 * verdad y con el navegador de verdad.
 *
 * No sustituye a `check-parsers`, que es offline y determinista: aquelos fijan
 * que los lectores de HTML y JSON leen bien lo que se les da, y este comprueba
 * que la red entrega lo que esos lectores dan por hecho. Los dos fallos que mas
 * caro salen (una temporada que la fuente anuncia pero no tiene, un capitulo que
 * devuelve un error en vez de un capitulo) solo se ven con la fuente delante.
 *
 * Se ejecuta contra un servidor ya arrancado, porque si no lo que se midiendo
 * seria el arranque otra vez, y de eso ya se encarga `check-arranque`.
 *
 *   node dist/tools/check-vivo.mjs http://127.0.0.1:8791
 *
 * Sale con codigo 1 en cuanto una comprobacion falla, para poder encadenarlo.
 */

export {}; // hace de este fichero un modulo, sin lo cual el await de arriba no es legal

const BASE = process.argv[2] ?? 'http://127.0.0.1:8791';
const fallos: string[] = [];

function fallo(msg: string): void {
  console.error(`  FALLO: ${msg}`);
  fallos.push(msg);
}

async function pedir(ruta: string): Promise<{ body: any; ms: number }> {
  const t0 = Date.now();
  const r = await fetch(BASE + ruta, { signal: AbortSignal.timeout(70_000) });
  const body = await r.json();
  return { body, ms: Date.now() - t0 };
}

/** "T3E1" a partir de una coordenada de capitulo, o "-" si no la hay. */
function linea(ep?: { season: number; episode: number } | null): string {
  return ep ? `T${ep.season}E${ep.episode}` : '-';
}

function capitulos(ep: any): string[] {
  return (ep?.episodes ?? []).map((c: any) => `T${c.season}E${c.episode}`);
}

/** T1(1-11) T2(1-10) ... para no repetir el bucle en cada impresion. */
function indice(ep: any): string {
  return (ep?.seasons ?? []).map((s: any) => `T${s.season}(${s.first}-${s.last})`).join(' ');
}

// ======================================================================
// Fuentes nuevas (API /wp-api/v1): cuevana3gs y lamovie
// ======================================================================

/**
 * Cada fuente nueva se prueba de punta a punta por lo que de verdad usa el
 * usuario: se busca una serie, se abre su ficha y se pide una temporada y un
 * capitulo concretos.
 *
 * Se busca por texto en lugar de fijar el identificador a proposito: el
 * identificador lleva el `_id` interno del sitio, y una prueba que lo fije deja
 * de probar la busqueda y se rompe sola el dia que el sitio recree el post. Lo
 * que no puede cambiar es que "Mentes Criminales" exista y caiga en la misma
 * coordenada en las dos fuentes.
 */
const FUENTES_NUEVAS = ['cuevana3gs', 'lamovie'] as const;

for (const fuente of FUENTES_NUEVAS) {
  console.log(`\n=== ${fuente}: serie por busqueda + temporada pedida`);

  const busca = await pedir(`/api/search?q=${encodeURIComponent('mentes criminales')}`);
  const entrada = (busca.body?.results ?? []).find((r: any) => r.source === fuente);

  if (!entrada) {
    fallo(`${fuente}: la busqueda no devolvio "Mentes Criminales"`);
    continue;
  }

  console.log(`  ${(busca.ms / 1000).toFixed(1)}s  ${entrada.title}  kind=${entrada.kind}  year=${entrada.year}`);
  console.log(`  id: ${entrada.id}`);

  // El titulo tiene que venir SIN el año: el año viaja en `year`. Si viniera
  // dentro, la tarjeta de pelicula lo mostraria dos veces y esta fuente no
  // agruparia con las otras cuando titulan sin año.
  if (/\((19|20)\d{2}\)/.test(entrada.title)) {
    fallo(`${fuente}: el titulo de busqueda conserva el año: ${entrada.title}`);
  }
  if (entrada.year !== '2005') fallo(`${fuente}: año inesperado: ${entrada.year}`);
  if (!entrada.poster) fallo(`${fuente}: la tarjeta de serie no trae poster`);
  if (entrada.kind !== 'series') fallo(`${fuente}: "Mentes Criminales" no se leyo como serie: ${entrada.kind}`);

  // Pedimos T2E3, que existe en las dos fuentes.
  const det = await pedir(`/api/title/${fuente}/${entrada.id}?season=2&episode=3`);
  const d = det.body?.detail ?? {};
  const eps = d.episodes;

  console.log(`  ${(det.ms / 1000).toFixed(1)}s  ${d.title}  kind=${d.kind}  year=${d.year}`);

  if (!eps) {
    fallo(`${fuente}: la ficha no trae indice de capitulos`);
    continue;
  }

  console.log(`  indice: ${indice(eps)}`);
  console.log(`  capitulos de T2 (${eps.episodes.length}): ${capitulos(eps).join(' ')}`);
  console.log(`  seleccionado: ${linea(eps.episode)}  ${eps.episode?.title ?? ''}`);
  for (const s of d.servers ?? []) console.log(`    servidor ${s.id}: ${s.label}`);

  // El capitulo pedido manda: si la ficha cayera en el primero, el reproductor
  // seria el del capitulo equivocado.
  if (!eps.episode || eps.episode.season !== 2 || eps.episode.episode !== 3) {
    fallo(`${fuente}: pidio T2E3 y quedo en ${linea(eps.episode)}`);
  }

  // La lista de capitulos tiene que ser la de la temporada pedida, no una mezcla.
  if (eps.episodes.some((c: any) => c.season !== 2)) {
    fallo(`${fuente}: la lista de capitulos mezcla temporadas: ${capitulos(eps).join(' ')}`);
  }

  // El indice tiene que ofrecer mas de una temporada para poder navegar.
  if (eps.seasons.length < 2) {
    fallo(`${fuente}: el indice trae ${eps.seasons.length} temporada(s), no se puede saltar de temporada`);
  }

  // El rango que declara la temporada tiene que cubrir sus capitulos listados:
  // un capitulo fuera del rango es un boton que la fuente rechaza.
  for (const c of eps.episodes) {
    const s = eps.seasons.find((x: any) => x.season === c.season);
    if (s && (c.episode < s.first || c.episode > s.last)) {
      fallo(`${fuente}: T${c.season}E${c.episode} cae fuera del rango de su temporada (${s.first}-${s.last})`);
    }
  }

  // La pagina del capitulo tiene que declarar reproductores; sin ellos no hay
  // nada que extraer y el fallo del usuario no tendria causa visible.
  if ((d.servers ?? []).length === 0) {
    fallo(`${fuente}: la ficha de T2E3 no trajo ningun reproductor`);
  }

  // Y el titulo de la ficha tambien sin año.
  if (/\((19|20)\d{2}\)/.test(d.title ?? '')) {
    fallo(`${fuente}: el titulo de la ficha conserva el año: ${d.title}`);
  }

  // Sin temporada ni capitulo, la ficha tiene que abrirse igualmente en un
  // capitulo valido (el primero disponible), no vacia.
  const porDefecto = await pedir(`/api/title/${fuente}/${entrada.id}`);
  const sel = porDefecto.body?.detail?.episodes?.episode;
  console.log(`  por defecto: ${linea(sel)}  ${sel?.title ?? ''}`);
  if (!sel || sel.episode < 1 || sel.season < 1) {
    fallo(`${fuente}: sin capitulo pedido la ficha quedo en ${linea(sel)}`);
  }
}

// ======================================================================
// pelisplushd
// ======================================================================

console.log('\n=== pelisplushd: pagina de serie');

const ph = await pedir('/api/title/pelisplushd/serie/rick-y-morty');
const detPh = ph.body?.detail ?? {};
const epsPh = detPh.episodes;

console.log(`  ${(ph.ms / 1000).toFixed(1)}s  ${detPh.title}  kind=${detPh.kind}`);

if (!epsPh) {
  fallo('no trae indice de capitulos');
} else {
  console.log(`  indice: ${indice(epsPh)}`);
  console.log(`  capitulos de la temporada actual: ${capitulos(epsPh).join(' ')}`);
  console.log(`  seleccionado: ${linea(epsPh.episode)}  ${epsPh.episode?.title ?? ''}`);

  // La pagina de la serie no trae reproductores: estan en la pagina de cada
  // capitulo, y `fetchServers` va a por ellos. Que aqui se vean cinco no es un
  // fallo, es que el servidor ya los busco para T1E1. Lo que si se comprueba es
  // que la lista de capitulos de la temporada este entregada, que es el fallo que
  // hubo: nueve temporadas a la vista y cero capitulos debajo.
  console.log(`  reproductores ya resueltos para ${linea(epsPh.episode)}: ${(detPh.servers ?? []).length}`);

  if (epsPh.episodes.length === 0) {
    fallo(`la temporada ${epsPh.episode?.season} se muestra sin ningun capitulo que elegir`);
  }

  if (capitulos(epsPh).some((c) => !c.startsWith(`T${epsPh.episode?.season}E`))) {
    fallo(`la lista mezcla temporadas: ${capitulos(epsPh).join(' ')}`);
  }

  // La cuenta tiene que cuadrar con lo que el indice dice que hay: si el indice
  // promete once capitulos y se listan diez, el selector tiene un hueco sin
  // explicar y no se sabe si falta uno o si el indice mintio.
  const primera = epsPh.seasons[0];
  const capitulosT1 = capitulos(epsPh).filter((c) => c.startsWith('T1E')).length;

  if (primera && primera.last >= primera.first && capitulosT1 > 0) {
    const esperados = primera.last - primera.first + 1;
    console.log(`  T1 declara ${esperados} capitulos y se listan ${capitulosT1}`);
    if (capitulosT1 !== esperados) {
      fallo(`T1 declara ${esperados} capitulos y se listan ${capitulosT1}`);
    }
  }
}

console.log('\n=== pelisplushd: temporada 3 capitulo 1');

const ph3 = await pedir('/api/title/pelisplushd/serie/rick-y-morty?season=3&episode=1');
const detPh3 = ph3.body?.detail ?? {};
const selPh3 = detPh3.episodes?.episode;

console.log(`  ${(ph3.ms / 1000).toFixed(1)}s  seleccionado ${linea(selPh3)}  ${selPh3?.title ?? ''}`);
console.log(`  indice: ${indice(detPh3.episodes)}`);
console.log(`  capitulos de T3: ${capitulos(detPh3.episodes).join(' ')}`);
for (const s of detPh3.servers ?? []) console.log(`    servidor ${s.id}: ${s.label}`);

if (!selPh3 || selPh3.season !== 3 || selPh3.episode !== 1) {
  fallo(`pidio T3E1 y quedo en ${linea(selPh3)}`);
}

// Aqui si tiene que haber reproductores: es la pagina del capitulo.
if ((detPh3.servers ?? []).length === 0) {
  fallo('la pagina del capitulo no trajo ningun reproductor');
}

if (detPh3.episodes?.episodes?.some((c: any) => c.season !== 3)) {
  fallo(`la lista de capitulos mezcla temporadas: ${capitulos(detPh3.episodes).join(' ')}`);
}

// ======================================================================
// pantalla de inicio
// ======================================================================

console.log('\n=== inicio');

const home = await pedir('/api/home');
const hr = home.body?.results ?? [];

console.log(`  ${(home.ms / 1000).toFixed(1)}s  ${hr.length} entradas  query=${JSON.stringify(home.body?.query)}`);
const porFuente: Record<string, { state: string; count: number; ms: number; message?: string }> =
  home.body?.bySource ?? {};

for (const [id, info] of Object.entries(porFuente)) {
  console.log(`    ${id.padEnd(12)} ${info.state.padEnd(10)} ${String(info.count).padStart(3)} en ${info.ms}ms  ${info.message ?? ''}`);
}

for (const r of hr) {
  console.log(`    ${r.source.padEnd(12)} ${String(r.kind ?? '-').padEnd(7)} ${linea(r.episode).padEnd(7)} ${r.title.slice(0, 30).padEnd(32)} ${r.note ?? ''}`);
}

if (hr.length === 0) fallo('el inicio vino vacio');

if (home.body?.query !== '') fallo(`el inicio deberia traer query vacia, trajo ${JSON.stringify(home.body?.query)}`);

// Cada entrada del inicio tiene que decir por que esta ahi. Sin la nota, un
// titulo suelto en la pantalla de inicio parece un resultado que el usuario
// pidio y no pidio.
const sinNota = hr.filter((r: any) => !r.note);
if (sinNota.length > 0) {
  fallo(`${sinNota.length} entradas del inicio sin nota: ${sinNota.slice(0, 3).map((r: any) => r.title).join(', ')}`);
}

// Las fuentes nuevas tienen que estar en el inicio. Si una cae, el usuario ve
// parte del catalogo y no se entera de por que. Se exigen las dos fuentes
// nuevas, que son las que anadio este trabajo; pelisplushd se cuenta pero no se
// exige, porque si su web tiene un mal dia no debe hacer fallar la comprobacion
// de las otras.
const fuentes = new Set(hr.map((r: any) => r.source));
for (const f of ['cuevana3gs', 'lamovie']) {
  if (!fuentes.has(f)) fallo(`el inicio no trae ${f}: ${[...fuentes].join(', ')}`);
}
if (fuentes.size < 2) fallo(`el inicio solo trae ${[...fuentes].join(', ')}`);

// ======================================================================

console.log();

if (fallos.length > 0) {
  console.log(`${fallos.length} fallo(s)`);
  process.exit(1);
}

console.log('todo correcto');