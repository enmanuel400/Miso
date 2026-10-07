import { existsSync, readFileSync } from 'node:fs';
import { pelisplushd } from '../server/sources/pelisplushd.js';
import {
  capituloMasCercano,
  capitulosDe,
  cuevana,
  entradasDeInicio,
  servidoresDe,
  temporadasDe,
} from '../server/sources/cuevana.js';
import { cuevana3gs } from '../server/sources/cuevana3gs.js';
import { lamovie } from '../server/sources/lamovie.js';
import { sinAnio } from '../server/sources/shared.js';
import { repairEncoding } from '../server/http.js';
import { mergeResults } from '../web/src/lib/merge.js';

let failures = 0;

function fallo(msg: string): void {
  console.error(`  FALLO: ${msg}`);
  failures++;
}

// ----------------------------------------------------------------------
// Fuentes de HTML: se leen paginas reales guardadas en disco.
// ----------------------------------------------------------------------

/**
 * Paginas reales, guardadas aparte y no siempre presentes. Si no estan, la
 * fuente se salta con un aviso en vez de romper el script: los casos de abajo
 * son autocontenidos y siempre se ejecutan.
 */
const paginas: { nombre: string; adapter: typeof pelisplushd; file: string; domain: string }[] = [
  { nombre: 'pelisplushd', adapter: pelisplushd, file: '/tmp/opencode/recon/phd.html', domain: 'pelisplushd.la' },
];

for (const c of paginas) {
  if (!existsSync(c.file)) {
    console.log(`\n=== ${c.nombre}: sin pagina guardada en ${c.file}, se omite`);
    continue;
  }

  // Aplicamos la misma reparacion de codificacion que usa el servidor real.
  const html = repairEncoding(readFileSync(c.file, 'utf8'));
  const results = c.adapter.parseResults(html, c.domain);

  console.log(`\n=== ${c.nombre}: ${results.length} resultados`);
  for (const r of results.slice(0, 3)) {
    console.log(`  title : ${r.title}`);
    console.log(`  url   : ${r.url}`);
    console.log(`  poster: ${r.poster ? 'si' : 'NO'}`);
    console.log(`  kind  : ${r.kind ?? '-'}  year: ${r.year ?? '-'}  rating: ${r.rating ?? '-'}`);
    console.log(`  ---`);
  }

  if (results.length === 0) fallo(`${c.nombre} no devolvio resultados`);

  const bad = results.filter((r) => /Ã.|Â./.test(r.title));
  if (bad.length) fallo(`${bad.length} titulo(s) con doble codificacion en ${c.nombre}`);
}

// ----------------------------------------------------------------------
// Layouts de detalle de pelisplushd
// ----------------------------------------------------------------------

/**
 * pelisplushd declara sus servidores de dos formas distintas y excluyentes, y
 * durante un tiempo solo se leia una. Medido sobre paginas reales:
 *
 *   A  <li data-url="...">            9 servidores en "carrera-de-bestias"
 *   B  <li data-id="N"> + #link_url    5 servidores en "shrek-tercero"
 *
 * Con el layout B sin leer, esos titulos devolvian cero servidores, se quedaba
 * solo la pagina propia, y el fallo que veia el usuario no tenia relacion con su
 * causa. Estos fragmentos estan copiados de las paginas reales, no inventados,
 * porque el valor de la prueba esta en que se parecen a lo que llega de verdad.
 */
const layouts: { nombre: string; html: string; esperados: string[] }[] = [
  {
    nombre: 'layout A: la URL esta en la propia pestana',
    html: `
      <h1>Carrera de bestias</h1>
      <a class="divseason" title="Español Latino">Español Latino</a>
      <ul class="VideoPlayer nav nav-tabs">
        <li data-url="https://streamwish.to/e/ciuoc6bjp6z8" data-name="Español Latino" class="playurl"><a>streamwish</a></li>
        <li data-url="https://vidhidepro.com/v/t2299ywz6sjl" data-name="Español Latino" class="playurl"><a>vidhide</a></li>
      </ul>`,
    esperados: ['https://streamwish.to/e/ciuoc6bjp6z8', 'https://vidhidepro.com/v/t2299ywz6sjl'],
  },
  {
    nombre: 'layout B: las URLs viven en #link_url, unidas por numero',
    html: `
      <h1>Shrek tercero</h1>
      <a class="divseason"><img alt="Familia">Español Latino</a>
      <ul class="VideoPlayer nav nav-tabs" role="tablist">
        <li role="presentation" data-id="1" class=""><a href="#option1">voesx</a></li>
        <li role="presentation" data-id="2" class=""><a href="#option2">streamwish</a></li>
        <li role="presentation" data-id="3" class=""><a href="#option3">streamtape</a></li>
        <li role="presentation" data-id="4" class=""><a href="#option4">netu</a></li>
        <li role="presentation" data-id="5" class=""><a href="#option5">filelions</a></li>
      </ul>
      <div id="link_url">
        <span lid="1" url="https://voe.sx/e/rizgktpfkw1y"></span>
        <span lid="2" url="https://streamwish.to/e/hfyzct9n2rju"></span>
        <span lid="3" url="https://streamtape.com/e/9621JWGaXOt6w2"></span>
        <span lid="4" url="https://waaw.to/f/6z7m0enJ7qSj"></span>
        <span lid="5" url="https://filelions.to/v/yrw7nvtmvf26"></span>
      </div>`,
    esperados: [
      'https://voe.sx/e/rizgktpfkw1y',
      'https://streamwish.to/e/hfyzct9n2rju',
      'https://streamtape.com/e/9621JWGaXOt6w2',
      'https://waaw.to/f/6z7m0enJ7qSj',
      'https://filelions.to/v/yrw7nvtmvf26',
    ],
  },
];

console.log('\n=== layouts de detalle de pelisplushd');
for (const l of layouts) {
  const d = pelisplushd.parseDetail(l.html, 'pelisplushd.la', 'pelicula/x');

  const obtenidas = d.servers.map((s) => s.embedUrl);
  const faltan = l.esperados.filter((u) => !obtenidas.includes(u));

  console.log(`  ${l.nombre}: ${d.servers.length} servidor(es)`);
  for (const s of d.servers) console.log(`    ${s.id}  ${s.label.padEnd(30)} ${s.embedUrl}`);

  if (faltan.length) fallo(`no se lei ${faltan.length} servidor(es): ${faltan.join(', ')}`);

  // Sin nombre de hoster la etiqueta seria inutil, asi que se comprueba que
  // ninguna se quede solo con el grupo de audio o con un numero.
  const sinNombre = d.servers.filter(
    (s) => !/\S/.test(s.label.replace(/^(Español Latino|Subtitulado)\s*·\s*/, '')),
  );
  if (sinNombre.length) fallo(`${sinNombre.length} servidor(es) sin nombre de reproductor`);
}

// ----------------------------------------------------------------------
// Cuevana: la fuente con API, que no parsea HTML sino JSON.
// ----------------------------------------------------------------------

/**
 * Respuestas reales de `tmdb.cuevana3.sc`, copiadas de la API.
 *
 * Van embebidas y no leidas de disco a proposito: son cortas, y un fichero
 * externo que se pierde dejaria esta seccion sin comprobar, que es justo lo
 * que un parser necesita. La busqueda se recorta a los titulos que devuelven
 * algo, porque el resto no dice nada del parser.
 */

const busqueda: unknown = {
  schema_version: 3,
  query: 'dune',
  total: 55,
  items: [
    {
      tmdb_id: 1339713,
      kind: 'movie',
      title: 'Obsesión',
      original_title: 'Obsession',
      slug: 'obsesión',
      poster_path: '/rmCkNtzYR2xTOO3ZXmIqB5zgYdE.jpg',
      year: 2026,
      vote_average: 6.4,
    },
    {
      tmdb_id: 114502,
      kind: 'tvshow',
      title: 'Cars: Aventuras en el camino',
      poster_path: '/z58JCUkxDEm7CdZnE8ThW4xiamC.jpg',
      year: 2022,
      vote_average: 7.4,
    },
    {
      tmdb_id: 60554,
      kind: 'anime',
      title: 'Star Wars Rebels',
      poster_path: '/a1.jpg',
      year: 2014,
    },
    {
      tmdb_id: 60554,
      kind: 'tvshow',
      title: 'Star Wars Rebels',
      poster_path: '/a1.jpg',
      year: 2014,
    },
    {
      tmdb_id: 999999,
      kind: 'movie',
      title: '',
      poster_path: null,
      year: null,
    },
  ],
};

console.log('\n=== cuevana: busqueda');
const resultados = cuevana.parseResults(JSON.stringify(busqueda), 'cuevana3.sc');
for (const r of resultados) {
  console.log(`  ${r.id.padEnd(16)} ${r.kind ?? '-'.padEnd(6)} ${r.year ?? '-'.padEnd(6)} ${r.title}`);
  console.log(`  ${''.padEnd(16)} ${r.url}`);
  console.log(`  ${''.padEnd(16)} poster: ${r.poster ?? 'NO'}`);
  console.log(`  ---`);
}

if (resultados.length !== 3) {
  fallo(`se esperaban 3 resultados (5 items, 1 titulo vacio y 1 duplicado) y salieron ${resultados.length}`);
}

// El id DEBE llevar el tipo delante: `/v1/items/{kind}/{id}` lo exige, y sin el
// la API contesta "invalid content type" en vez de un 404 identificable.
if (!resultados[0]?.id.startsWith('movie/')) fallo(`id mal formado: ${resultados[0]?.id}`);
if (!resultados[1]?.id.startsWith('tvshow/')) fallo(`id mal formado: ${resultados[1]?.id}`);

// `anime` y `tvshow` con el mismo tmdb_id son el mismo titulo en dos catalogos.
// Sin deduplicar, la tarjeta aparece dos veces.
if (resultados.filter((r) => r.title === 'Star Wars Rebels').length !== 1) {
  fallo('el mismo titulo aparece mas de una vez por estar en dos catalogos');
}

// La API distingue tvshow de anime; para el usuario ambas son series, y una
// serie que senosoloca como "pelicula" rompe el detalle.
if (resultados[1]?.kind !== 'series') fallo(`tvshow debería mapear a series, salio ${resultados[1]?.kind}`);
if (resultados[2]?.kind !== 'series') fallo(`anime debería mapear a series, salio ${resultados[2]?.kind}`);

/** Un cuerpo que no es el JSON esperado no puede reventar la busqueda entera. */
if (cuevana.parseResults('<!doctype html><html>no soy json</html>', 'cuevana3.sc').length !== 0) {
  fallo('una respuesta que no es JSON debería dar cero resultados, no datos inventados');
}

console.log('\n=== cuevana: ficha');
const item: unknown = {
  schema_version: 3,
  item: {
    tmdb_id: 1339713,
    kind: 'movie',
    title: 'Obsesión',
    poster_path: '/rmCkNtzYR2xTOO3ZXmIqB5zgYdE.jpg',
    year: 2026,
    overview: 'A raíz de un colapso ambiental, una cena familiar estalla en caos.',
    tagline: 'El capítulo final.',
  },
};
const ficha = cuevana.parseDetail(JSON.stringify(item), 'cuevana3.sc', 'movie/1339713');
console.log(`  title   : ${ficha.title}`);
console.log(`  url     : ${ficha.url}`);
console.log(`  poster  : ${ficha.poster ?? 'NO'}`);
console.log(`  synopsis: ${ficha.synopsis}`);
console.log(`  kind    : ${ficha.kind}   servers: ${ficha.servers.length}`);

if (ficha.title !== 'Obsesión') fallo(`titulo mal leido: ${ficha.title}`);
if (!ficha.poster?.startsWith('https://image.tmdb.org/')) fallo(`poster no absoluto: ${ficha.poster}`);
if (!ficha.synopsis?.startsWith('A raíz')) fallo(`sinopsis mal leida: ${ficha.synopsis}`);

console.log('\n=== cuevana: reproducciones');
const playbackPelicula: unknown = {
  schema_version: 3,
  tmdb_id: 1339713,
  kind: 'movie',
  embeds: [
    { url: 'https://vimeos.net/embed-7xmo9cdmn6vs.html', server: 'Online', host: 'vimeos.net', lang: 'Latino', quality: 'Full HD' },
    { url: 'https://goodstream.one/embed-sw47ga2ovh9v.html', server: 'Online', host: 'goodstream.one', lang: 'Latino', quality: 'WEBRip' },
    { url: 'no-es-una-url', host: 'roto', lang: 'Latino', quality: 'HD' },
    { url: 'https://sin-host.net/e/abc', lang: null, quality: null },
  ],
};

const pelicula = servidoresDe(JSON.stringify(playbackPelicula), 'movie/1339713');
console.log(`  pelicula: ${pelicula.length} servidor(es)`);
for (const s of pelicula) console.log(`    ${s.id}  ${s.label.padEnd(40)} ${s.embedUrl}`);

// Las entradas sin URL utilizable se descartan: son las que arrastrarian al
// extractor a un 404 por servidor.
if (pelicula.length !== 3) fallo(`se esperaban 3 servidores y salieron ${pelicula.length}`);
if (pelicula.some((s) => !/^https?:\/\//i.test(s.embedUrl))) fallo('se devolvio un servidor sin URL valida');

// La API llama "Online" a todos: si esa palabra llegara a la etiqueta, las
// entradas serian indistinguibles en la lista de servidores.
if (pelicula.some((s) => /\bOnline\b/.test(s.label))) fallo('la etiqueta repite el "Online" que no distingue nada');

// Idioma, calidad y host son las tres partes que hacen falta: dos entradas con
// el mismo host pero distinto audio tienen que distinguirse.
if (!pelicula[0]?.label.includes('vimeos.net')) fallo(`el host no aparece en la etiqueta: ${pelicula[0]?.label}`);
if (!pelicula[0]?.label.includes('Latino')) fallo(`el idioma no aparece en la etiqueta: ${pelicula[0]?.label}`);
if (!pelicula[1]?.label.includes('WEBRip')) fallo(`la calidad no aparece en la etiqueta: ${pelicula[1]?.label}`);

// Una entrada sin idioma ni calidad se queda con el host a secas. Es lo correcto:
// es lo unico que se sabe de ella, y un guion suelto se lee peor que el nombre.
if (pelicula[2]?.label !== 'sin-host.net') fallo(`etiqueta inesperada sin datos: ${pelicula[2]?.label}`);

// Los identificadores se numeran sobre lo aceptado: si la tercera entrada vino
// sin URL, la siguiente es cv-2 y no cv-3. Un hueco parece un fallo de lectura.
const ids = pelicula.map((s) => s.id);
if (ids.join(',') !== 'cv-0,cv-1,cv-2') fallo(`identificadores con huecos: ${ids.join(',')}`);

// Sin host en la respuesta se usa el del propio enlace, no una etiqueta vacia.
if (!pelicula[2]?.label.includes('sin-host.net')) fallo(`no se dedujo el host: ${pelicula[2]?.label}`);

// Una serie tiene que decir QUE episodio es. Sin esto, la lista de servidores de
// una serie seria una promesa que el reproductor no cumple.
const serie = servidoresDe(JSON.stringify(playbackPelicula), 'tvshow/1399');
console.log(`  serie:    ${serie.length} servidor(es)`);
for (const s of serie) console.log(`    ${s.id}  ${s.label}`);

// Cuando la respuesta no dice que capitulo es, no se inventa uno. Antes se
// escribia "T1E1" a ciegas: para una serie cuya temporada 1 no esta disponible
// era mentira, y el reproductor/playback ya habia pedido otro capitulo distinto.
if (serie.some((s) => /T\d+E\d+/.test(s.label))) {
  fallo(`se invento un numero de capitulo: ${serie[0]?.label}`);
}

// Cuando si lo dice, se escribe el suyo y no el del primer capitulo.
const playbackSerie: unknown = {
  schema_version: 3,
  tmdb_id: 60625,
  kind: 'tvshow',
  season: 9,
  episode: 9,
  embeds: [
    { url: 'https://vimeos.net/embed-a1.html', host: 'vimeos.net', lang: 'Latino', quality: 'Full HD' },
    { url: 'https://goodstream.one/embed-b2.html', host: 'goodstream.one', lang: 'Latino', quality: 'WEBRip' },
  ],
};
const serie9 = servidoresDe(JSON.stringify(playbackSerie), 'tvshow/60625');
for (const s of serie9) console.log(`    ${s.id}  ${s.label}`);
if (!serie9.every((s) => s.label.startsWith('T9E9 · '))) {
  fallo(`una serie debe decir el capitulo que declara la respuesta: ${serie9[0]?.label}`);
}

// El capitulo pedido manda sobre el que declara la respuesta: quien llama sabe
// que quiere ese, y la respuesta podria venir de otra copia en cache.
const serie9forzado = servidoresDe(JSON.stringify(playbackSerie), 'tvshow/60625', { season: 3, episode: 1 });
if (!serie9forzado[0]?.label.startsWith('T3E1 · ')) {
  fallo(`el capitulo pedido no manda: ${serie9forzado[0]?.label}`);
}

// Una pelicula no lleva numero de capitulo, ni aunque la respuesta lo traiga:
// no hay capitulo que nombrar.
const peliculaConTemporada = servidoresDe(JSON.stringify(playbackSerie), 'movie/1339713');
if (peliculaConTemporada.some((s) => /T\d+E\d+/.test(s.label))) {
  fallo(`una pelicula no debe llevar capitulo: ${peliculaConTemporada[0]?.label}`);
}

// Una respuesta que no es el JSON esperado no puede reventar la resolucion.
if (servidoresDe('<!doctype html>hola', 'movie/1').length !== 0) {
  fallo('una respuesta que no es JSON debería dar cero servidores');
}

// ----------------------------------------------------------------------
// Temporadas y capitulos
// ----------------------------------------------------------------------

/**
 * Los indices de temporada de cuevana, copiados de `/v1/items/tvshow/60625`.
 *
 * Traen las dos trampas que se midieron y que hacen fallar cosas de verdad:
 *
 *   - `number_of_seasons` dice 10 y `episode_seasons` trae 9. La temporada 10 no
 *     esta emitida y pedir un capitulo ahi devuelve un error de la API.
 *   - La temporada 9 declara `count: 10` pero `last_episode: 9`. Contar por
 *     `count` ofrecería un capitulo 10 que la fuente rechaza.
 *
 * Las dos se comprueban contra el mismo dato: lo que manda es si hay capitulo, no
 * lo que el catalogo anuncie.
 */
console.log('\n=== cuevana: indice de temporadas');

const seasonsApi: unknown = [
  { season: 1, name: 'Temporada 1', poster_path: '/s1.jpg', count: 11, available_count: 11, first_episode: 1, last_episode: 11 },
  { season: 3, name: 'Temporada 3', poster_path: '/s3.jpg', count: 10, available_count: 10, first_episode: 1, last_episode: 10 },
  // Anunciada pero sin capitulos: tiene que desaparecer.
  { season: 10, name: 'Temporada 10', poster_path: '/s10.jpg', count: 10, available_count: 0, first_episode: 1, last_episode: 0 },
  { season: 9, name: 'Temporada 9', poster_path: '/s9.jpg', count: 10, available_count: 9, first_episode: 1, last_episode: 9 },
  // Temporada vacia o sin forma: no debe reventar el lector.
  { season: 0, name: 'Especiales', poster_path: null, count: 2, available_count: 0 },
];

const seasons = temporadasDe(seasonsApi as never);
for (const s of seasons) {
  console.log(`  T${String(s.season).padEnd(3)} ${String(s.name).padEnd(14)} ${s.first}-${s.last}   poster: ${s.poster ?? 'NO'}`);
}

if (seasons.length !== 3) fallo(`se esperaban 3 temporadas con capitulos y salieron ${seasons.length}: ${seasons.map((s) => s.season).join(',')}`);
if (seasons.some((s) => s.season === 10)) fallo('una temporada sin capitulos disponibles aparecio en el indice');
if (seasons.some((s) => s.season === 9 && s.last !== 9)) fallo('la temporada 9 deberia acabar en el capitulo 9, no en el 10');
if (!seasons.find((s) => s.season === 3)?.poster) fallo('la temporada deberia traer su cartel');

// El indice sale ordenado por temporada. Sin ordenar, "T9" puede aparecer antes que
// "T10" y el selector seria una lista sin sentido.
if (seasons.map((s) => s.season).join(',') !== '1,3,9') fallo(`temporadas sin ordenar: ${seasons.map((s) => s.season).join(',')}`);

// Una respuesta sin temporadas no puede reventar nada.
if (temporadasDe(undefined).length !== 0) fallo('una ficha sin temporadas deberia dar un indice vacio');
if (temporadasDe([] as never).length !== 0) fallo('una lista vacia deberia dar un indice vacio');

console.log('\n=== cuevana: capitulos de una temporada');

const episodesApi: unknown = [
  { season: 9, episode: 1, title: 'Loco por Morty', air_date: '2026-05-24', runtime: 22, playable: true },
  { season: 9, episode: 3, title: 'Rick-Fusion', air_date: '2026-06-07', runtime: 22, playable: true },
  { season: 9, episode: 2, title: '', air_date: '2026-05-31', runtime: 23, playable: false },
];

const capitulos = capitulosDe(episodesApi as never);
for (const c of capitulos) {
  console.log(`  T9E${c.episode}  ${String(c.title).padEnd(14)} ${c.airDate ?? '-'}  ${c.runtime ?? '-'} min  ${c.available ? 'disponible' : 'NO disponible'}`);
}

// Ordenados por numero. La API llega en orden, pero la interfaz los pinta en
// fila y un capitulo 3 antes que el 2 se lee como un fallo.
if (capitulos.map((c) => c.episode).join(',') !== '1,2,3') fallo(`capitulos sin ordenar: ${capitulos.map((c) => c.episode).join(',')}`);

// Un capitulo sin titulo recibe uno provisional. Un boton con el numero 2 y sin
// texto al lado no dice nada, pero uno con "T9E2" delante si.
if (capitulos[1]?.title !== 'Episodio 2') fallo(`capitulo sin titulo: ${capitulos[1]?.title}`);

// Un capitulo que la fuente declara sin reproductor se conserva y se marca. El
// selector lo apaga; borrarlo dejaria huecos en la numeracion sin explicacion.
if (capitulos[1]?.available !== false) fallo('un capitulo con playable:false deberia marcarse como no disponible');

// `playable` ausente se supone disponible, que es lo que hace la web de origen al
// pintar el boton de reproducir.
const sinPlayable = capitulosDe([{ season: 1, episode: 1, title: 'X' }] as never);
if (sinPlayable[0]?.available !== true) fallo('sin campo playable deberia suponerse disponible');

if (capitulosDe(undefined).length !== 0) fallo('una respuesta sin capitulos deberia dar una lista vacia');

// El capitulo pedido manda sobre el que declara la respuesta. Aqui es lo que
// decide que el reproductor y el selector lleven al mismo sitio.
console.log('\n=== cuevana: capitulo mas cercano');
const masCerca = capituloMasCercano(capitulos, { season: 9, episode: 12 });
if (masCerca?.episode !== 3) fallo(`un capitulo inexistente deberia caer en el ultimo: ${masCerca?.episode}`);
const masCercaBajo = capituloMasCercano(capitulos, { season: 9, episode: 0 });
if (masCercaBajo?.episode !== 1) fallo(`un capitulo 0 deberia caer en el primero: ${masCercaBajo?.episode}`);
if (capituloMasCercano(capitulos, { season: 9, episode: 2 })?.episode !== 2) {
  fallo('un capitulo que existe deberia quedarse como esta');
}
if (capituloMasCercano([], { season: 1, episode: 1 }) !== null) fallo('una lista vacia no puede devolver un capitulo');
console.log(`  E12 -> E${masCerca?.episode},  E0 -> E${masCercaBajo?.episode}`);

// ----------------------------------------------------------------------
// Pantalla de inicio
// ----------------------------------------------------------------------

/**
 * Respuesta real de `/v1/episodes`, recortada.
 *
 * Es la que alimenta el inicio, y lo mas importante de ella es que cada elemento
 * trae la serie Y el capitulo. Sin el capitulo, la tarjeta de "lo mas nuevo"
 * abriria la serie entera, que es justo lo que la web de origen no hace.
 */
console.log('\n=== cuevana: capitulos recientes (inicio)');

const recientesApi: unknown = {
  schema_version: 3,
  generation: 1,
  items: [
    {
      show: {
        tmdb_id: 60625,
        kind: 'tvshow',
        title: 'Rick y Morty',
        poster_path: '/rYM.jpg',
        year: 2013,
        vote_average: 8.9,
      },
      episode: { tmdb_id: 1, season: 9, episode: 9, title: 'Saluda a tus Morts', air_date: '2026-07-19', runtime: 23, playable: true },
    },
    {
      show: { tmdb_id: 60625, kind: 'tvshow', title: 'Rick y Morty', poster_path: '/rYM.jpg', year: 2013 },
      episode: { season: 9, episode: 8, title: 'Rickuiem Mort un sueño', air_date: '2026-07-12', runtime: 22, playable: true },
    },
    // Serie sin titulo: se descarta en vez de inventar uno.
    { show: { tmdb_id: 1, kind: 'tvshow', title: '' }, episode: { season: 1, episode: 1 } },
    // Capitulo sin numeracion: no se puede abrir, asi que no se ofrece.
    { show: { tmdb_id: 2, kind: 'tvshow', title: 'Sin numerar' }, episode: { title: 'Cap' } },
  ],
};

const inicio = entradasDeInicio(JSON.stringify(recientesApi), 'cuevana3.sc', 12);
for (const r of inicio) {
  console.log(`  ${r.id.padEnd(16)} T${r.episode?.season}E${r.episode?.episode}  ${r.title}`);
  console.log(`  ${''.padEnd(16)} ${r.note}`);
}

if (inicio.length !== 2) fallo(`se esperaban 2 entradas del inicio y salieron ${inicio.length}`);

// La coordenada del capitulo tiene que venir en la entrada. Sin ella, la tarjeta
// abre la serie entera y el usuario no llega al capitulo nuevo.
if (inicio[0]?.episode?.season !== 9 || inicio[0]?.episode?.episode !== 9) {
  fallo(`la entrada del inicio no lleva su capitulo: ${JSON.stringify(inicio[0]?.episode)}`);
}

// La nota explica la tarjeta. Sin ella, "Rick y Morty" no dice si es la serie o
// el capitulo de ayer.
if (inicio[0]?.note !== 'T9E9 · Saluda a tus Morts') fallo(`nota inesperada: ${inicio[0]?.note}`);

// Una serie aparece tantas veces como capitulos tenga. El agrupado de la interfaz
// las funde en una sola tarjeta; el limite se aplica despues.
if (new Set(inicio.map((r) => r.id)).size !== 1) fallo('se esperaban dos capitulos de la misma serie');

if (entradasDeInicio('<!doctype html>no soy json', 'cuevana3.sc', 12).length !== 0) {
  fallo('una respuesta que no es JSON deberia dar cero entradas de inicio');
}

// El limite se respeta aunque la respuesta traiga mas.
if (entradasDeInicio(JSON.stringify(recientesApi), 'cuevana3.sc', 1).length !== 1) {
  fallo('el limite de entradas del inicio no se respeta');
}

// ----------------------------------------------------------------------
// Series en pelisplushd
// ----------------------------------------------------------------------

/**
 * Una pagina de serie real, recortada a la estructura que importa.
 *
 * Es el caso que motiva todo el trabajo de capitulos: la pagina de la serie NO
 * tiene reproductores. Lo unico que trae son las pestanas de temporada y, dentro
 * de cada una, un boton por capitulo. Los reproductores estan en la pagina del
 * capitulo.
 *
 * Antes de esto, abrir una serie en pelisplushd terminaba en una lista de cero
 * servidores y un unico candidato: la pagina de la serie, que tampoco reproduce.
 */
console.log('\n=== pelisplushd: pagina de serie');

const paginaSerie = `
  <h1>Rick y Morty</h1>
  <meta name="description" content="Un viajero dimensional y su nieto criminal enrulados en adventures." />
  <ul class="TbVideoNv nav nav-tabs" role="tablist">
    <li class="presentation"><a href=" #pills-vertical-1" class="nav-link " role="tab">TEMPORADA 1 </a></li>
    <li class="presentation"><a href=" #pills-vertical-3" class="nav-link " role="tab">TEMPORADA 3 </a></li>
  </ul>
  <div role="tabpanel" class="tab-pane fade in " id="pills-vertical-1">
    <a href="/serie/rick-y-morty/temporada/1/capitulo/1" class="btn btn btn-primary btn-block">Rick y Morty 1x1</a>
    <a href="/serie/rick-y-morty/temporada/1/capitulo/2" class="btn btn btn-primary btn-block">Rick y Morty 1x2</a>
  </div>
  <div role="tabpanel" class="tab-pane fade " id="pills-vertical-3">
    <a href="/serie/rick-y-morty/temporada/3/capitulo/1" class="btn btn btn-primary btn-block">Rick y Morty 3x1</a>
    <a href="/serie/rick-y-morty/temporada/3/capitulo/10" class="btn btn btn-primary btn-block">Rick y Morty 3x10</a>
  </div>`;

const seriePhd = pelisplushd.parseDetail(paginaSerie, 'pelisplushd.la', 'serie/rick-y-morty');
console.log(`  title    : ${seriePhd.title}`);
console.log(`  kind     : ${seriePhd.kind}`);
console.log(`  seasons  : ${seriePhd.episodes?.seasons.map((s) => `T${s.season}(${s.first}-${s.last})`).join(' ') ?? 'NINGUNA'}`);
console.log(`  capitulos: ${seriePhd.episodes?.episodes.map((c) => `T${c.season}E${c.episode}`).join(' ') ?? '-'}`);
console.log(`  por defecto: T${seriePhd.episodes?.episode?.season}E${seriePhd.episodes?.episode?.episode ?? '-'}`);
console.log(`  servidores: ${seriePhd.servers.length}`);

if (!seriePhd.episodes) fallo('la pagina de serie deberia traer indice de capitulos');
if (seriePhd.episodes?.seasons.length !== 2) fallo(`se esperaban 2 temporadas y salieron ${seriePhd.episodes?.seasons.length}`);
if (seriePhd.episodes?.seasons[0]?.name !== 'Temporada 1') fallo(`nombre de temporada mal leido: ${seriePhd.episodes?.seasons[0]?.name}`);

// El rango de la temporada sale de los capitulos que hay, no de una cuenta.
if (seriePhd.episodes?.seasons[1]?.last !== 10) fallo(`la temporada 3 deberia acabar en el 10: ${seriePhd.episodes?.seasons[1]?.last}`);

// El capitulo por defecto es el primero de la primera temporada con capitulos.
if (seriePhd.episodes?.episode?.season !== 1 || seriePhd.episodes?.episode?.episode !== 1) {
  fallo(`capitulo por defecto inesperado: ${JSON.stringify(seriePhd.episodes?.episode)}`);
}

// Solo se trae la lista de capitulos de la temporada que se esta viendo. Pedir las
// nueve temporadas para usar una es gasto sin motivo.
if (seriePhd.episodes?.episodes.length !== 2) {
  fallo(`se esperaban 2 capitulos de la temporada 1 y salieron ${seriePhd.episodes?.episodes.length}`);
}

// El nombre del capitulo quita la coordenada que el boton lleva pegada.
// "Rick y Morty 3x1" es el titulo de la serie mas la coordenada, no el nombre.
if (seriePhd.episodes?.episodes[0]?.title === 'Rick y Morty 1x1') {
  fallo('el titulo del capitulo deberia venir sin la coordenada');
}

// ESTA es la comprobacion que protege el fallo real. La pagina de la serie no
// tiene reproductores, y si se leyeran como si los tuviera el extractor
// gastaria el presupuesto probando paginas que no reproducen nada.
if (seriePhd.servers.length !== 0) {
  fallo(`la pagina de serie no deberia declarar servidores, y declaro ${seriePhd.servers.length}`);
}

console.log('\n=== pelisplushd: pagina de pelicula');
const paginaPelicula = `
  <h1>Dune 2</h1>
  <ul class="TbVideoNv nav nav-tabs"></ul>
  <li data-url="https://streamwish.to/e/abc123" data-name="Español Latino"><a>streamwish</a></li>`;
const peliPhd = pelisplushd.parseDetail(paginaPelicula, 'pelisplushd.la', 'pelicula/dune-2');
console.log(`  kind      : ${peliPhd.kind}`);
console.log(`  seasons   : ${peliPhd.episodes === null ? 'null (correcto)' : 'PRESENTE (mal)'}`);
console.log(`  servidores: ${peliPhd.servers.length}`);

// Una pelicula no puede dibujar un selector de capitulos. Si `episodes` fuera un
// indice vacio en vez de null, la interfaz enseñaria "Temporada 1" sin episodes.
if (peliPhd.episodes !== null) fallo('una pelicula no deberia traer indice de capitulos');
if (peliPhd.servers.length !== 1) fallo(`la pagina de pelicula deberia traer su servidor, trajo ${peliPhd.servers.length}`);

/** Una pagina de capitulo de pelisplushd, con sus cinco reproductores. */
console.log('\n=== pelisplushd: pagina de capitulo');
const paginaCapitulo = `
  <h1>Rick y Morty: Temporada 3, Capitulo 3 - Episode 1</h1>
  <a class="divseason"><img src="/x.svg" alt="Aventura">Español Latino</a>
  <div id="link_url">
    <span lid="1" url="https://streamwish.to/e/aaa"></span>
    <span lid="2" url="https://filelions.to/v/bbb"></span>
    <span lid="3" url="https://voe.sx/e/ccc"></span>
    <span lid="4" url="https://streamtape.com/e/ddd"></span>
    <span lid="5" url="https://waaw.to/f/eee"></span>
  </div>`;
const capPhd = pelisplushd.parseDetail(paginaCapitulo, 'pelisplushd.la', 'serie/rick-y-morty/temporada/3/capitulo/1');
console.log(`  servidores: ${capPhd.servers.length}`);
for (const s of capPhd.servers) console.log(`    ${s.id}  ${s.label}`);

if (capPhd.servers.length !== 5) fallo(`se esperaban 5 servidores en la pagina de capitulo y salieron ${capPhd.servers.length}`);

// La pagina de capitulo tiene reproductores pero no indice de capitulos: el
// selector sale de la pagina de la serie.
if (capPhd.episodes !== null) fallo('la pagina de capitulo no deberia traer indice de capitulos');

// ----------------------------------------------------------------------
// Agrupado de la interfaz
// ----------------------------------------------------------------------

/**
 * `mergeResults` decide que se ve en la rejilla, asi que va aqui aunque no tenga
 * nada que ver con los parsers.
 *
 * Es logica pura y es donde se rompen las cosas sin que se note: un cambio
 * pequeno en la clave de agrupacion no lanza ningún error, solo mueve unos
 * titulos de una tarjeta a otra. Con estos datos se ve a ojo.
 *
 * Y hay un motivo concreto para que este fichero sea su sitio: hasta ahora no
 * habia ninguna comprobacion de la capa de la interfaz, asi que todo lo que se
 * decidia ahi (que capitulos se ven juntos, que dice la nota) se comprobaba
 * abriendo la aplicacion y mirando. Eso no se puede repetir cada vez que se
 * toca algo.
 */
console.log('\n=== interfaz: agrupado de resultados');

type Falso = {
  source: string;
  title: string;
  kind?: string | null;
  year?: string | null;
  episode?: { season: number; episode: number } | null;
  note?: string | null;
};

/**
 * Una entrada de ejemplo con los valores por defecto de una serie de cuevana.
 *
 * El parcial es `Partial` a proposito: cada prueba escribe solo lo que le importa
 * y el resto se queda en el valor por defecto. Con el tipo entero habia que
 * repetir source y title en cada linea, y en cuanto se olvidaba una el
 * compilador avisaba de algo que no era lo que se iba a comprobar.
 */
function entrada(parcial: Partial<Falso>): Falso {
  return {
    source: 'cuevana',
    title: 'Rick y Morty',
    kind: 'series',
    year: '2013',
    episode: null,
    note: null,
    ...parcial,
  };
}

// Una serie con tres capitulos recientes es UNA tarjeta con tres capitulos, no
// tres tarjetas de la misma serie. Tres tarjetas serian una pantalla llena de lo
// mismo, y pulsando cualquiera llevaria a un capitulo distinto sin previo aviso.
const tresCapitulos = [
  entrada({ episode: { season: 9, episode: 9 }, note: 'T9E9 \u00b7 Saluda a tus Morts' }),
  entrada({ episode: { season: 9, episode: 8 }, note: 'T9E8 \u00b7 Rickuiem Mort un sueno' }),
  entrada({ episode: { season: 9, episode: 7 }, note: 'T9E7 \u00b7 El final' }),
];

const una = mergeResults(tresCapitulos as never);
console.log(`  3 capitulos de una serie -> ${una.length} tarjeta(s)`);
for (const c of una) console.log(`    ${c.title}  entradas: ${c.entries.length}  nota: ${c.note}`);

if (una.length !== 1) fallo(`tres capitulos de la misma serie dieron ${una.length} tarjetas, deberia ser 1`);
if (una[0]?.entries.length !== 3) fallo(`la tarjeta deberia guardar los 3 capitulos, guardo ${una[0]?.entries.length}`);

// ESTA es la comprobacion que quedo pasar sin que nadie lo notara. Con la nota
// copiada de la primera entrada deia "T9E9 - Saluda a tus Morts", como si el unico
// capitulo alcanzable desde la tarjeta fuera el noveno, cuando los tres estan a un
// clic. El listado de novedades llega del mas reciente al mas antiguo, asi que el
// tramo tiene que ordenarse: sin eso salia "T9E9-T9E7".
if (una[0]?.note !== 'T9E7\u2013T9E9 \u00b7 3 cap\u00edtulos nuevos') {
  fallo(`nota de varios capitulos mal: ${una[0]?.note}`);
}

// Un solo capitulo conserva su nota, con el nombre del capitulo, que es mejor que
// un recuento.
const solo = mergeResults([entrada({ episode: { season: 9, episode: 9 }, note: 'T9E9 \u00b7 Saluda a tus Morts' })] as never);
if (solo[0]?.note !== 'T9E9 \u00b7 Saluda a tus Morts') fallo(`nota de un capitulo: ${solo[0]?.note}`);

// Un estreno sin capitulo se explica con su propia nota, y no con un recuento de
// capitulos que no existen.
const estreno = mergeResults([entrada({ title: 'Dune 2', kind: 'movie', note: 'Estreno' })] as never);
if (estreno[0]?.note !== 'Estreno') fallo(`nota de un estreno: ${estreno[0]?.note}`);

// Capitulos de temporadas distintas no se pueden resumir en un tramo: "T9E9-T1E1"
// no significa nada. Se listan uno a uno, y el recuento sigue diciendo cuantos hay.
const dosTemporadas = mergeResults([
  entrada({ episode: { season: 1, episode: 1 }, note: 'T1E1' }),
  entrada({ episode: { season: 9, episode: 9 }, note: 'T9E9' }),
] as never);
console.log(`  2 temporadas -> ${dosTemporadas[0]?.note}`);
if (dosTemporadas[0]?.note !== 'T1E1, T9E9 \u00b7 2 cap\u00edtulos nuevos') {
  fallo(`temporadas distintas deberian ir una a una: ${dosTemporadas[0]?.note}`);
}

// Una busqueda normal: el mismo titulo en dos fuentes es una tarjeta con dos
// entradas, y ninguna nota (ahi el titulo ya se explica solo).
const dosFuentes = mergeResults([
  entrada({ source: 'cuevana' }),
  entrada({ source: 'pelisplushd', kind: null, year: null }),
] as never);
if (dosFuentes.length !== 1) fallo(`el mismo titulo en dos fuentes dio ${dosFuentes.length} tarjetas`);
if (dosFuentes[0]?.entries.length !== 2) fallo(`deberian quedar 2 entradas, quedaron ${dosFuentes[0]?.entries.length}`);
if (dosFuentes[0]?.note !== null) fallo(`una busqueda no lleva nota: ${dosFuentes[0]?.note}`);

// La misma fuente con el mismo capitulo dos veces (la pagina de busqueda repite
// el mismo poster en dos bloques) se deja una sola vez.
const repetido = mergeResults([
  entrada({ source: 'pelisplushd', episode: { season: 1, episode: 1 } }),
  entrada({ source: 'pelisplushd', episode: { season: 1, episode: 1 } }),
] as never);
if (repetido[0]?.entries.length !== 1) fallo(`un capitulo repetido deberia quedar una vez, quedaron ${repetido[0]?.entries.length}`);

// El mismo capitulo en dos fuentes distintas son dos entradas: se ven por donde se
// puede mirar, que es justo lo que promete la insignia de la fuente.
const mismoCapituloDosFuentes = mergeResults([
  entrada({ source: 'cuevana', episode: { season: 1, episode: 1 } }),
  entrada({ source: 'pelisplushd', episode: { season: 1, episode: 1 } }),
] as never);
if (mismoCapituloDosFuentes[0]?.entries.length !== 2) {
  fallo(`el mismo capitulo en dos fuentes deberia dar 2 entradas, dio ${mismoCapituloDosFuentes[0]?.entries.length}`);
}

// Títulos que la fuente escribe de forma distinta se agrupan igual.
const conTildes = mergeResults([
  entrada({ title: 'Corazón' }),
  entrada({ title: 'Corazon' }),
] as never);
if (conTildes.length !== 1) fallo(`"Corazón" y "Corazon" son la misma pelicula y dieron ${conTildes.length} tarjetas`);

// Titulos que solo se parecen NO se agrupan. Este es el limite de la tolerancia:
// "Beast" y "La Bestia" son la misma, pero "Bestias divinas" no.
const distintos = mergeResults([
  entrada({ title: 'Beast - La Bestia' }),
  entrada({ title: 'La Bestia Del Pantano' }),
  entrada({ title: 'Bestias divinas' }),
] as never);
console.log(`  "Beast", "La Bestia del Pantano" y "Bestias divinas" -> ${distintos.length} tarjeta(s)`);
if (distintos.length < 2) fallo(`titulos distintos se estan fundiendo: ${distintos.length} tarjetas`);

if (mergeResults([] as never).length !== 0) fallo('una lista vacia no deberia dar tarjetas');

// ----------------------------------------------------------------------
// API JSON de los sitios Cuevana react (cuevana3.gs, lamovie.org)
// ----------------------------------------------------------------------

/**
 * Una respuesta de `/wp-api/v1/search`, recortada a lo que importa.
 *
 * Los dos sitios son el mismo backend, asi que una prueba cubre a los dos; lo que
 * cambia entre ellos es el dominio y la etiqueta, y eso se comprueba aparte. Hay
 * una pelicula y una serie porque `postType=any` devuelve las dos y el `kind` solo
 * se puede deducir mirando el `type`.
 */
console.log('\n=== cuevana3gs / lamovie: API JSON de busqueda');

const busquedaWp = {
  error: false,
  data: {
    posts: [
      {
        _id: 45189,
        title: 'Sonic 3: La Película (2024)',
        slug: 'sonic-3-la-pelicula-2024',
        type: 'movies',
        release_date: '2024-12-20',
        rating: '7.2',
        images: { poster: '/thumbs/abc_hd.webp' },
      },
      {
        _id: 13741,
        title: 'Sonic Prime (2022)',
        slug: 'sonic-prime-2022',
        type: 'tvshows',
        release_date: '2022-12-15',
        rating: '8.1',
        images: { poster: '/thumbs/def_hd.webp' },
      },
    ],
  },
};

const resultadosWp = cuevana3gs.parseResults(JSON.stringify(busquedaWp), 'cuevana3.gs');
console.log(`  ${resultadosWp.length} resultado(s)`);
for (const r of resultadosWp) {
  console.log(`    ${r.source.padEnd(10)} ${(r.kind ?? '-').padEnd(6)} ${r.id}  ${r.title}`);
}

if (resultadosWp.length !== 2) fallo(`se esperaban 2 resultados y salieron ${resultadosWp.length}`);

// El identificador lleva el `_id` delante porque la API lo necesita para la ficha,
// los capitulos y el reproductor. Sin el habria que resolverlo en cada paso.
if (resultadosWp[0]?.id !== 'movies/45189/sonic-3-la-pelicula-2024') {
  fallo(`id inesperado: ${resultadosWp[0]?.id}`);
}

// El kind sale del `type` de la API, no de adivinar por el titulo.
if (resultadosWp[0]?.kind !== 'movie' || resultadosWp[1]?.kind !== 'series') {
  fallo(`kind mal deducido: ${resultadosWp[0]?.kind} / ${resultadosWp[1]?.kind}`);
}

// El poster es un thumbnail propio del sitio; se compone con el dominio activo,
// no con un CDN externo que podria bloquear la app.
if (resultadosWp[0]?.poster !== 'https://cuevana3.gs/wp-content/uploads/thumbs/abc_hd.webp') {
  fallo(`poster mal compuesto: ${resultadosWp[0]?.poster}`);
}

// El año se saca de la fecha de estreno, no del titulo entre parentesis.
if (resultadosWp[0]?.year !== '2024') fallo(`año mal leido: ${resultadosWp[0]?.year}`);

// El titulo se entrega SIN el año: viaja en `year`. Si no, la tarjeta de pelicula
// lo mostraria dos veces (en el titulo y en el año) y la agrupacion del cliente no
// uniria este titulo con la misma pelicula titulada sin año por otra fuente.
if (resultadosWp[0]?.title !== 'Sonic 3: La Película') {
  fallo(`el titulo conserva el año entre parentesis: ${resultadosWp[0]?.title}`);
}
if (resultadosWp[1]?.title !== 'Sonic Prime') {
  fallo(`el titulo de serie conserva el año: ${resultadosWp[1]?.title}`);
}

// Recorte del año del titulo. Lo que NO debe tocar importa tanto como lo que si:
// "Blade Runner 2049" es un titulo, no un año entre parentesis.
console.log('\n=== sinAnio');
const casosAnio: [string, string][] = [
  ['Sonic 3: La Película (2024)', 'Sonic 3: La Película'],
  ['Mentes Criminales (2005)', 'Mentes Criminales'],
  ['Avatar [2009]', 'Avatar'],
  ['Con espacio (2026)   ', 'Con espacio'],
  ['Blade Runner 2049', 'Blade Runner 2049'],
  ['1984', '1984'],
  ['Sin año', 'Sin año'],
  ['', ''],
];
for (const [entrada, esperado] of casosAnio) {
  const obtenido = sinAnio(entrada);
  console.log(`  ${JSON.stringify(entrada).padEnd(32)} -> ${JSON.stringify(obtenido)}`);
  if (obtenido !== esperado) fallo(`sinAnio(${JSON.stringify(entrada)}) = ${JSON.stringify(obtenido)}, se esperaba ${JSON.stringify(esperado)}`);
}

// Una respuesta que no es JSON no puede reventar la busqueda de las otras fuentes.
if (cuevana3gs.parseResults('<!doctype html><html>no soy json</html>', 'cuevana3.gs').length !== 0) {
  fallo('una respuesta que no es JSON deberia dar cero resultados');
}

// Cada fuente compone su URL de busqueda en su propio dominio.
if (!cuevana3gs.searchUrl('cuevana3.gs', 'dune').startsWith('https://cuevana3.gs/wp-api/v1/search?')) {
  fallo('la URL de busqueda de cuevana3gs no apunta a su API');
}
if (!lamovie.searchUrl('lamovie.org', 'dune').startsWith('https://lamovie.org/wp-api/v1/search?')) {
  fallo('la URL de busqueda de lamovie no apunta a su API');
}

// La URL humana usa el segmento de ruta correcto por tipo: una serie vive en
// /series/, un anime en /animes/ y una pelicula en /peliculas/.
if (cuevana3gs.playUrl('cuevana3.gs', 'tvshows/13741/x') !== 'https://cuevana3.gs/series/x/') {
  fallo(`playUrl de serie inesperada: ${cuevana3gs.playUrl('cuevana3.gs', 'tvshows/13741/x')}`);
}
if (lamovie.playUrl('lamovie.org', 'animes/37507/y') !== 'https://lamovie.org/animes/y/') {
  fallo(`playUrl de anime inesperado: ${lamovie.playUrl('lamovie.org', 'animes/37507/y')}`);
}
if (lamovie.playUrl('lamovie.org', 'movies/1/x') !== 'https://lamovie.org/peliculas/x/') {
  fallo('la URL humana de lamovie para pelicula es incorrecta');
}

// La ficha minima conserva el kind y la URL aunque el JSON venga vacio: es lo que
// permite seguir probando reproductores aunque falle `/single`.
console.log('\n=== cuevana3gs: ficha JSON');
const detalleWp = cuevana3gs.parseDetail(
  JSON.stringify({ error: false, data: {} }),
  'cuevana3.gs',
  'movies/1/sonic-x',
);
console.log(`  kind : ${detalleWp.kind}`);
console.log(`  url  : ${detalleWp.url}`);
if (detalleWp.kind !== 'movie') fallo(`una pelicula sin ficha deberia conservar su kind: ${detalleWp.kind}`);
if (detalleWp.url !== 'https://cuevana3.gs/peliculas/sonic-x/') fallo(`url de ficha inesperada: ${detalleWp.url}`);

console.log(failures === 0 ? '\nOK: los parsers producen resultados limpios' : `\n${failures} fallo(s)`);
process.exit(failures === 0 ? 0 : 1);