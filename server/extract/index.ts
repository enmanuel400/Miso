import type {
  EpisodeInfo,
  EpisodeRef,
  ResolvedStream,
  TitleDetail,
  PlaybackServer,
} from '../sources/types.js';
import { getSource, resolveDomain } from '../sources/index.js';
import { capituloAjustado, indiceDeSerie } from '../sources/shared.js';
import { fetchText, HttpError } from '../http.js';
import {
  classifyStream,
  findBase64Embeds,
  findLiteralStreams,
  rankCandidates,
} from './static.js';
import { extractWithBrowser, isNoiseHost } from './browser.js';
import { validateHls } from './validate.js';

/**
 * Orquestador de extraccion.
 *
 * Encadena las tecnicas de menor a mayor coste y se detiene en cuanto una
 * entrega algo reproducible:
 *
 *   1. LITERAL   - un .m3u8 escrito en el HTML          (gratis, ~0 ms)
 *   2. BASE64    - embeds codificados en el HTML        (gratis, ~0 ms)
 *   3. NAVEGADOR - red + DOM + API del player           (~7 s)
 *
 * Las dos vias rapidas no las usa ninguna fuente activa ahora mismo: cuevana
 * llega con los embeds ya resueltos desde su API y pelisplushd los calcula en el
 * cliente. Se quedan porque son gratuitas y porque estas webs rotan: la
 * siguiente fuente puede devolver el stream escrito en el HTML, y en ese caso
 * la via rapida gana sin tocar una linea.
 *
 * El navegador es el recurso habitual, no el de emergencia: en ambas fuentes
 * activas el HTML estatico no contiene ninguna URL de video, asi que hace falta
 * casi siempre.
 */

/**
 * Tiempo total que se dedica a recorrer los servidores de un titulo.
 *
 * Antes habia un tope de cuatro servidores. Era un numero sin fundamento y
 * ademas un fallo real: pelisplushd declara nueve servidores, y uno de los que
 * si funcionaba estaba por detras de la cuarta posicion. Los titulos cuyo
 * servidor bueno caia mas alla de ese punto se declaraban muertos sin haberse
 * probado nunca, y el informe llegaba a decir "los servidores de esta fuente
 * fallaron" cuando solo se habian mirado cuatro de seis.
 *
 * Un presupuesto de tiempo no miente sobre lo que se dejo sin mirar: si se
 * agota, el informe dice cuantos se probaron y cuantos quedaban.
 *
 * Treinta y dos segundos. Es el punto donde seguir esperando cuesta mas de lo
 * que aporta: el usuario lleva medio minuto mirando un cartel y ya no sabe si
 * la aplicacion esta trabajando o se ha colgado. Mejor detenerse y decir con
 * precision cuantos servidores quedaron sin mirar que arriesgarse a que el
 * tiempo se vaya en un servidor que no iba a funcionar.
 */
const TITLE_BUDGET_MS = 32_000;

/**
 * Techo por servidor dentro de un titulo.
 *
 * Sin esto, un solo hoster muerto se come el presupuesto entero. No es teoria:
 * `resolveStream` usa 25 s por defecto y el bucle solo comprobaba el presupuesto
 * ENTRE intentos, nunca durante uno. Medido con gnula, cuyo catalogo mezcla
 * hosteros que no contestan: `fembed.com` acepta la conexion y no contesta
 * nunca, asi que un titulo con tres servidores se gastaba 25 s en el primero y
 * los otros dos no se llegaban a mirar aunque uno funcionara.
 *
 * Catorce segundos deja trabajar a un hoster vivo con margen de sobra (medido:
 * voe.sx 1,6 s, hqq.to instantaneo, uqload 3-7 s) y sigue dejando parte del
 * presupuesto para probar lo que viene despues, que es justo lo que hace falta
 * cuando el primero no era el bueno.
 */
const PER_SERVER_MS = 14_000;

/**
 * Estados en los que un 404 es una respuesta definitiva.
 *
 * Si la pagina del embed responde 404, arrancar un Chromium contra ella es
 * tiempo tirado: se abre, se ve el 404 y no hay nada que extraer. Se descarta
 * antes, y el ahorro es de siete segundos por servidor muerto.
 */
const DEFINITIVE_MISS = new Set([404, 410, 451]);

/**
 * Descarta embeds repetidos.
 *
 * Medido: pelisplushd declaraba nueve servidores que eran en realidad seis
 * direcciones distintas, porque la pagina repite el mismo bloque por cada
 * idioma. Probar los nueve gastaba el doble de tiempo en servidores que ya se
 * sabian muertos.
 *
 * La comparacion es solo por URL, nunca por etiqueta, y las etiquetas no se tocan.
 * Dos motivos:
 *
 *  - Si se renumeraran ("streamwish (1)", "streamwish (2)"), la etiqueta ya no
 *    coincidiria con ninguna de la lista que muestra la interfaz, y el servidor
 *    que gano se quedaria sin resaltar. El servidor reporta ahora su id, que es
 *    la unica referencia fiable cuando hay etiquetas repetidas.
 *  - Dos entradas con la misma URL son el mismo embed con dos nombres: probar la
 *    segunda no puede dar un resultado distinto al de la primera.
 *
 * Las entradas con URL distinta se conservan aunque compartan etiqueta, porque
 * pueden ser audios o calidades diferentes. Medido: en "Carrera de bestias" el
 * cuarto streamwish, con otra URL, fue el unico que sirvio.
 */
function dedupeServers(servers: PlaybackServer[]): PlaybackServer[] {
  const seen = new Set<string>();
  const out: PlaybackServer[] = [];

  for (const s of servers) {
    if (seen.has(s.embedUrl)) continue;
    seen.add(s.embedUrl);
    out.push(s);
  }

  return out;
}

/**
 * Saltos ya muertos en esta sesion.
 *
 * Al seguir los iframes aparece una cadena repetida. Medido en pelisflix: sus
 * cinco servidores desembocan los cinco en voe.sx, que responde 404. Sin
 * recordar eso, cada servidorava a recorrer de nuevo los mismos tres saltos y
 * se quemaba el presupuesto de tiempo en trabajo ya hecho: se llegaba a cinco
 * servidores probados de nueve y el resto quedaba sin mirar.
 *
 * Solo se guardan los que responderon con un codigo definitivo, no los que
 * fallaron por red. Un 404 puede no volver, pero un fallo de conexion si, y
 * confundir los dos convertiria una caida de red en "esto no existe".
 */
const deadHops = new Set<string>();

export interface ResolveOptions {
  /** URL de la pagina del titulo, usada como Referer. */
  referer?: string;
  /** Etiqueta del servidor elegido, para mostrarla en el reproductor. */
  serverLabel?: string | null;
  /**
   * Id del servidor que hay que probar primero.
   *
   * Lo usa la reconexion: cuando la reproduccion se corta a mitad, interesa
   * volver al mismo servidor que se estaba viendo y no aterrizar en otro
   * cualquiera. Si ese servidor ya no esta, el resto de la lista sigue intacto.
   */
  preferServer?: string | null;
  budgetMs?: number;
  /** Si es false no se permite arrancar el navegador headless. */
  allowBrowser?: boolean;
  /**
   * Capitulo pedido. null o ausente significa "el que le toque a la fuente",
   * que es el primero de la primera temporada con capitulos.
   *
   * Solo lo usa `resolveTitle`. En `resolveStream` no tiene sentido: ahi ya se
   * le ha dado un embed concreto.
   */
  pos?: EpisodeRef | null;
  /** Traza de diagnostico, se rellena durante la resolucion. */
  onTrace?: (message: string) => void;
  /**
   * Aviso de que el hoster ha pedido un reto anti-bot, con el nombre del reto.
   * Lo usa resolveTitle para explicar el fallo en vez de dejar un motivo generico.
   */
  onChallenge?: (challenge: string) => void;
  /**
   * Paginas ya abiertas en esta resolucion, para no volver a entrar en ellas.
   *
   * Hace falta porque al seguir el iframe de un hoster se puede volver al punto
   * de partida: nupload.my envuelve a voe.sx, y si voe.sx volviera a envolver a
   * nupload.my el recorrido no terminaria nunca. Cada salto anade su URL aqui.
   */
  visited?: Set<string>;
}

/**
 * Resultado de probar un servidor.
 *
 * Se devuelve estructurado y no solo como texto de traza porque el usuario
 * necesita saber por que la pelicula no se reproduce. "No funciona" no ayuda
 * a nadie; "este servidor ya no existe" o "este otro solo entrega anuncios" si
 * explica el fallo y orienta a cambiar de fuente.
 */
export interface Attempt {
  /** Id del servidor en la lista de la pagina. */
  serverId: string;
  label: string;
  ok: boolean;
  /** Motivo del fallo, si lo hubo. */
  reason: string | null;
}

/**
 * Resuelve un stream reproducible a partir de la URL de un embed.
 * Es el punto de entrada que usa la API.
 */
export async function resolveStream(
  embedUrl: string,
  opts: ResolveOptions = {},
): Promise<ResolvedStream | null> {
  const {
    referer,
    serverLabel = null,
    // El reloj de arriba necesita un valor, y el que se usa cuando nadie impone
    // uno es el del navegador: 25 s. Lo que imponen resolveTitle y la API, que
    // siempre pasan uno, llega por opts.
    budgetMs = 25_000,
    allowBrowser = true,
    onTrace,
    onChallenge,
    visited = new Set<string>(),
  } = opts;

  visited.add(embedUrl);

  // Una URL que YA es un stream final no se resuelve: abrir un navegador para
  // leer algo que ya sabemos que es un `.m3u8` (o un `.mp4`) solo gastaria
  // segundos en volver a encontrarlo. El adaptador de sololatino, por ejemplo,
  // descifra sus hosters y entrega la direccion directa; el extractor debe
  // aceptarla tal cual y dejar que el llamante la valide.
  const tipoDirecto = classifyStream(embedUrl);
  if (tipoDirecto !== 'embed') {
    return {
      url: embedUrl,
      type: tipoDirecto,
      method: 'direct',
      durationSec: null,
      serverLabel,
      proxied: false,
    };
  }

  // Un solo reloj para toda la resolucion, cadena de iframes incluida.
  //
  // `budgetMs` es un TOTAL, no un permiso por salto. Sin esto, `...opts` lo
  // propagaba intacto a cada salto y una cadena de tres iframes podia gastar el
  // triple: medido con gnula, cuyo "Repductor de la fuente" sigue tres iframes
  // hasta un reCAPTCHA de Google y tardaba 39 s con un presupuesto de 32.
  const fin = Date.now() + budgetMs;
  const restante = () => Math.max(800, fin - Date.now());

  // Un salto que ya sabemos muerto no se vuelve a abrir. Es la diferencia entre
  // recorrer cinco veces la misma cadena hasta voe.sx y recorrerla una.
  if (deadHops.has(embedUrl)) {
    onTrace?.(`saltos ya conocido como muerto: ${hostOf(embedUrl)}`);
    return null;
  }

  // --- 1 y 2: tecnicas estaticas sobre el HTML -------------------------
  // Solo tiene sentido si lo que nos pasan es una pagina, no un .m3u8.
  if (classifyStream(embedUrl) === 'embed') {
    try {
      const html = await fetchText(embedUrl, { referer, timeoutMs: Math.min(15_000, restante()) });

      const literals = findLiteralStreams(html);
      const direct = literals.find((s) => classifyStream(s.embedUrl) !== 'embed');
      if (direct) {
        onTrace?.(`stream literal encontrado en ${new URL(embedUrl).hostname}`);
        return toStream(direct, serverLabel, direct.method, false);
      }

      const b64 = findBase64Embeds(html);
      const next = rankCandidates(b64)[0];
      if (next && next.embedUrl !== embedUrl) {
        onTrace?.(`embeds base64: ${b64.length}, siguiendo ${new URL(next.embedUrl).hostname}`);
        // El embed base64 es una pagina intermedia: hay que desarrollarla.
        return resolveStream(next.embedUrl, {
          ...opts,
          budgetMs: restante(),
          serverLabel: serverLabel ?? next.label,
          visited,
        });
      }
    } catch (err) {
      onTrace?.(`via estatica fallo: ${err instanceof Error ? err.message : String(err)}`);

      // Un 404 es una respuesta definitiva: la pagina del embed no existe.
      // Arrancar un Chromium contra ella gastaria unos siete segundos para
      // volver a leer el mismo 404, asi que se descarta aqui.
      if (err instanceof HttpError && DEFINITIVE_MISS.has(err.status)) {
        onTrace?.(`descartado sin navegador: el embed responde ${err.status}`);
        deadHops.add(embedUrl);
        return null;
      }
    }
  }

  // --- 3: navegador headless -------------------------------------------
  if (!allowBrowser) return null;

  const extraction = await extractWithBrowser(embedUrl, referer, restante());
  onTrace?.(`navegador: ${extraction.trace.join(' | ')}`);

  // Un 404 que solo se ve al abrir el navegador tambien es definitivo. Sin
  // registrarlo aqui, la cadena que pasa por el se recorre entera otra vez en
  // cuanto el siguiente servidor desemboque en el mismo sitio.
  if (extraction.status !== null && DEFINITIVE_MISS.has(extraction.status)) {
    onTrace?.(`descartado: el embed responde ${extraction.status}`);
    deadHops.add(embedUrl);
    return null;
  }

  const best = extraction.candidates.find((c) => classifyStream(c.embedUrl) !== 'embed');
  if (best) {
    return toStream(best, serverLabel, best.method, false);
  }

  // Sin stream directo, pero puede que el hoster esconda el player dentro de un
  // iframe. En ese caso hay que abrirlo y buscar dentro.
  //
  // Medido: nupload.my envuelve su player en un iframe a voe.sx, y watchfun.top
  // (repelisplus) envuelve a nupload.my, que a su vez envuelve a voe.sx. Son
  // tres saltos encadenados. Antes detectabamos ese iframe y lo dabamos por
  // perdido sin visitarlo nunca, asi que esas dos fuentes no podian funcionar
  // ni cuando su destino estaba vivo. Es el mismo caso que los embeds en
  // base64 de mas arriba, que si se desarrollaban.
  //
  // Solo uno por nivel y con un conjunto de visitados: un hoster puede apuntar
  // a si mismo, y el recorrido tiene que terminar en algun sitio.
  const nested = extraction.candidates.find((c) => c.method === 'dom-iframe' && !isNoiseHost(c.embedUrl));
  if (nested && nested.embedUrl !== embedUrl && !visited.has(nested.embedUrl)) {
    const destino = hostOf(nested.embedUrl);
    onTrace?.(`siguiendo el iframe a ${destino}`);

    visited.add(nested.embedUrl);
    const developed = await resolveStream(nested.embedUrl, {
      ...opts,
      // Lo que quede, no el presupuesto entero: este salto es una continuacion
      // del anterior, no una resolucion nueva.
      budgetMs: restante(),
      serverLabel: serverLabel ?? nested.label,
      visited,
    });

    if (developed) return developed;
    onTrace?.(`el iframe tampoco dio video (${destino})`);
  }

  // Un reto anti-bot se avisa aqui, que es el punto donde ya no queda nada que
  // hacer. Se nombra para que el usuario entienda que esperar no lo va a
  // arreglar, en vez de un fallo generico que parece falta de paciencia.
  if (extraction.challenge) {
    onTrace?.(`el hoster pide ${extraction.challenge}`);
    onChallenge?.(extraction.challenge);
  }

  // Ninguna tecnica produjo algo reproducible: devolvemos el embed para que el
  // cliente al menos pueda mostrarlo en un iframe. Es un recurso de ultimo
  // caso, no un exito, y por eso se marca como tipo 'embed'.
  return toStream(
    { id: 'fallback', label: 'Reproductor original', embedUrl, method: 'embed-fallback' },
    serverLabel,
    'embed-fallback',
    false,
  );
}

/** Host de una URL, o un texto corto si no se puede leer. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.slice(0, 40);
  }
}

/**
 * Capitulos de la temporada que se va a ver.
 *
 * El orden es: primero la lista que la fuente ya dejo en el detalle, y solo si no
 * vale la pena ir a pedirla. Ese orden no es un ahorro, es una correccion.
 *
 * Hay fuentes (pelisplushd) que dejan el mapa entero de temporadas y capitulos en
 * la pagina de la serie, y por eso `parseDetail` ya deja la lista de la temporada
 * por defecto en `detail.episodes`. Estas no tienen `fetchEpisodes`: no hay nada
 * que pedir. Si aqui se devolvia `null` igualmente, el paso de montaje de abajo
 * montaba el indice con una lista vacia y el selector de capitulos se quedaba sin
 * botones, con las nueve temporadas a la vista y ningun capitulo debajo. Medido:
 * `/api/title/pelisplushd/serie/rick-y-morty` devolvia `episodes: []` con
 * `seasons: 9`, o sea una temporada seleccionada sin un solo capitulo que elegir.
 *
 * La lista del detalle solo se reutiliza si es de la temporada pedida. Es de la
 * temporada por defecto, asi que con `?season=3` no vale, y en ese caso hay que ir
 * a buscarla de verdad.
 *
 * Devuelve null cuando no hay nada que dar (pelicula, o fuente sin endpoint de
 * capitulos y sin lista propia) y tambien cuando la fuente contesta que esa
 * temporada no existe. Un fallo aqui degrada el selector, no la reproduccion: la
 * serie se sigue viendo en la temporada por defecto.
 */
async function pedirCapitulos(
  source: NonNullable<ReturnType<typeof getSource>>,
  domain: string,
  id: string,
  pos: EpisodeRef | null,
  seasons: readonly { season: number }[],
  detalle: TitleDetail,
  trace: ((message: string) => void) | undefined,
): Promise<EpisodeInfo[] | null> {
  const enElDetalle = capitulosDeLaTemporada(detalle.episodes?.episodes, pos);
  if (!source.fetchEpisodes || !pos || seasons.length === 0) return enElDetalle;
  if (enElDetalle) {
    trace?.(`capitulos de la temporada ${pos.season}: ${enElDetalle.length} (ya estaban en el detalle)`);
    return enElDetalle;
  }

  try {
    const capitulos = await source.fetchEpisodes(
      domain,
      id,
      pos.season,
      seasons as Parameters<NonNullable<typeof source.fetchEpisodes>>[3],
    );
    if (!capitulos) {
      trace?.(`la fuente no tiene capitulos de la temporada ${pos.season}`);
      return null;
    }
    trace?.(`capitulos de la temporada ${pos.season}: ${capitulos.length}`);
    return capitulos;
  } catch (err) {
    trace?.(
      `no se pudieron pedir los capitulos de la temporada ${pos.season}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * La lista de capitulos del detalle, si es de la temporada que se va a ver.
 *
 * Devolver una lista de otra temporada seria peor que no devolver nada: el
 * selector enseinaria los capitulos de la temporada 1 mientras el encabezado dice
 * que se esta viendo la 3, y pulsando cualquiera se abriria el capitulo
 * equivocado.
 */
function capitulosDeLaTemporada(
  capitulos: readonly EpisodeInfo[] | undefined,
  pos: EpisodeRef | null,
): EpisodeInfo[] | null {
  if (!capitulos || capitulos.length === 0 || !pos) return null;
  return capitulos.every((c) => c.season === pos.season) ? [...capitulos] : null;
}

/**
 * Servidores del capitulo.
 *
 * Va aparte de `parseDetail` porque hace red, y eso lo hace opcional por
 * diseño: una ficha sin servidores no esta rota, la pagina de reproduccion de la
 * propia fuente se prueba siempre como ultimo recurso. Si este paso falla, se
 * pierde una via rapida, no la capacidad de reproducir.
 */
async function pedirServidores(
  source: NonNullable<ReturnType<typeof getSource>>,
  domain: string,
  id: string,
  pos: EpisodeRef | null,
  detail: TitleDetail,
  trace: ((message: string) => void) | undefined,
): Promise<PlaybackServer[]> {
  // En una serie la pagina de la serie no declara ninguno: la del capitulo si.
  // En una pelicula, si la propia pagina los trae, ya estan leidos y no hay nada
  // que ir a buscar.
  if (!source.fetchServers) return detail.servers;
  if (detail.servers.length > 0 && !pos) return detail.servers;

  try {
    const extra = await source.fetchServers(domain, id, pos);
    if (extra.length === 0) {
      trace?.('la fuente no devolvio ningun servidor para este capitulo');
      return detail.servers;
    }
    trace?.(`servidores declarados por la fuente: ${extra.map((s) => s.label).join(', ')}`);
    return extra;
  } catch (err) {
    trace?.(
      `no se pudieron pedir los servidores a la fuente: ${err instanceof Error ? err.message : String(err)}`,
    );
    return detail.servers;
  }
}

/**
 * Resuelve un titulo completo: lee su pagina de detalle, recoge los servidores
 * que la fuente ofrece y va probando hasta obtener un stream reproducible.
 */
export async function resolveTitle(
  sourceId: string,
  id: string,
  opts: ResolveOptions = {},
): Promise<{
  detail: TitleDetail;
  stream: ResolvedStream | null;
  attempts: Attempt[];
  /** Id del servidor que produjo el stream, para resaltarlo en la interfaz. */
  serverId: string | null;
  /**
   * Servidores que quedaban sin probar cuando se agoto el presupuesto.
   *
   * En cero el informe puede decir que fallaron todos. Con este numero delante,
   * no: si son tres de nueve, el titular tiene que hablar de los tres que se
   * probaron y admitir que seis no se llegaron a mirar. Sin este campo la
   * aplicacion afirma cosas que no sabe.
   */
  sinProbar: number;
} | null> {
  const source = getSource(sourceId);
  if (!source) return null;

  const domain = await resolveDomain(source);
  const trace = opts.onTrace;

  let detail: TitleDetail;
  try {
    // Las fuentes de API traen la ficha y el indice de temporadas en endpoints
    // distintos, asi que exponen `fetchDetail` y aqui se prefiere. Las de HTML
    // siguen con `playUrl` + `parseDetail`, que es una sola descarga.
    if (source.fetchDetail) {
      detail = await source.fetchDetail(domain, id, opts.pos ?? null);
    } else {
      const html = await fetchText(source.playUrl(domain, id, null), {
        referer: `https://${domain}/`,
        timeoutMs: 20_000,
      });
      detail = source.parseDetail(html, domain, id);
    }
    trace?.(`detalle leido: "${detail.title}"`);
  } catch (err) {
    trace?.(`no se pudo leer el detalle: ${err instanceof Error ? err.message : String(err)}`);
    // Sin detalle seguimos con una ficha minima: el player es lo importante.
    detail = {
      source: sourceId,
      id,
      title: id.replace(/^\/(pelicula|serie)\//, '').replace(/-/g, ' '),
      url: source.playUrl(domain, id, null),
      poster: null,
      synopsis: null,
      year: null,
      kind: null,
      servers: [],
      episodes: null,
    };
  }

  // ------------------------------------------------------------------
  // Capitulo
  // ------------------------------------------------------------------
  //
  // Va antes que los servidores porque de el dependen dos cosas: la pagina que se
  // prueba como ultimo recurso y los embeds que se piden. En una serie sin
  // eleccion, el capitulo es el primero de la primera temporada con capitulos,
  // que es lo que haria el usuario abriendo la pagina en el navegador.
  //
  // Antes esto no existia y por eso cuevana reproducia siempre T1E1: pedia
  // `?season=1&episode=1` sin mirar si la serie tenia esa temporada, y en una
  // serie cuya temporada 1 no estaba disponible la API contestaba un error.

  const seasons = detail.episodes?.seasons ?? [];
  const pedido = opts.pos ?? null;
  const pos = capituloAjustado(seasons, pedido);

  if (seasons.length > 0 && pedido && pos && (pedido.season !== pos.season || pedido.episode !== pos.episode)) {
    trace?.(
      `el capitulo pedido T${pedido.season}E${pedido.episode} no existe; se usa T${pos.season}E${pos.episode}`,
    );
  }
  if (pos) trace?.(`capitulo: T${pos.season}E${pos.episode}`);

  // Los capitulos de la temporada y los reproductores van en paralelo: son dos
  // descargas distintas que dependen del mismo numero y no una de la otra. Medido
  // en cuevana, 200 ms cada una; en serie serian 400 ms de mas por abrir un
  // titulo.
  const [capitulos, servidores] = await Promise.all([
    pedirCapitulos(source, domain, id, pos, seasons, detail, trace),
    pedirServidores(source, domain, id, pos, detail, trace),
  ]);

  // El indice se rehace siempre que haya temporadas, incluso sin lista de
  // capitulos: lo que importa es que diga cual es el capitulo que se va a ver,
  // que es el pedido y no el que la fuente tenga por defecto.
  detail = { ...detail, servers: servidores };
  if (seasons.length > 0) {
    detail = { ...detail, episodes: indiceDeSerie(seasons, capitulos ?? [], pos) };
  }

  // La pagina de reproduccion del propio titulo se incluye SIEMPRE como
  // ultimo candidato. No es un adorno: se observo que en pelisplushd los tres
  // servidores declarados (streamwish, vidhidepro, voe.sx) desembocan todos en
  // el mismo upstream, que ademas estaba muerto, mientras que el reproductor
  // montado en la propia pagina si entregaba video. Sin este ultimo recurso,
  // declarar servidores nos habria hecho perder una fuente que antes funcionaba.
  //
  // En una serie es la pagina del capitulo, no la de la serie: la de la serie no
  // tiene reproductor, y probarla gastaria siete segundos de navegador para
  // descubrir otra vez lo mismo que ya sabemos.
  const playPage = source.playUrl(domain, id, pos);
  const candidates: PlaybackServer[] = [
    ...rankCandidates(dedupeServers(detail.servers)),
    {
      id: 'own-page',
      label: pos ? `Reproductor de la fuente (T${pos.season}E${pos.episode})` : 'Reproductor de la fuente',
      embedUrl: playPage,
      method: 'own-page',
    },
  ];

  if (detail.servers.length > 0 && candidates.length - 1 < detail.servers.length) {
    trace?.(
      `servidores repetidos eliminados: ${detail.servers.length} -> ${candidates.length - 1}`,
    );
  }

  const attempts: Attempt[] = [];
  let fallback: ResolvedStream | null = null;
  // El presupuesto empieza aqui, cuando ya sabemos que servidores hay. Contarlo
  // desde antes penalizaria a las fuentes lentas por algo que no elegimos: lo
  // que el usuario espera es el tiempo que tardamos en PROBARLOS.
  const deadline = Date.now() + TITLE_BUDGET_MS;

  // La reconexion manda: si venimos de un servidor concreto, se prueba ese
  // primero. El resto conserva su orden original.
  const ordenados = opts.preferServer
    ? [
        ...candidates.filter((c) => c.id === opts.preferServer),
        ...candidates.filter((c) => c.id !== opts.preferServer),
      ]
    : candidates;

  // IMPORTANTE: no nos quedamos con el primer servidor. Estas fuentes mezclan
  // reproductores que funcionan con otros rotos, y ningun ranking razonable
  // sabe cual es cual hasta que lo prueba. Probamos en orden y nos quedamos
  // con el primero que produzca un stream reproducible de verdad.
  //
  // El bucle se detiene por tiempo, no por numero. Lo que no se ha probado se
  // cuenta y se dice: es la unica forma de que un fallo siga siendo honesto
  // cuando la lista es larga.
  for (const candidate of ordenados) {
    if (Date.now() > deadline) {
      trace?.(
        `presupuesto agotado: se probaron ${attempts.length} de ${candidates.length} ` +
          `servidor(es), ${candidates.length - attempts.length} sin mirar`,
      );
      break;
    }

    trace?.(`probando servidor: ${candidate.label}`);

    // Lo que queda de presupuesto es el techo de este servidor. Sin esto, cada
    // intento puede dure lo que quiera (25 s por defecto) y basta con que el
    // primero este muerto para que los demas no se miren nunca.
    const restante = deadline - Date.now();
    const techoServidor = Math.max(2_000, Math.min(restante, PER_SERVER_MS));

    let challenge: string | null = null;
    const stream = await resolveStream(candidate.embedUrl, {
      ...opts,
      budgetMs: Math.min(techoServidor, opts.budgetMs ?? techoServidor),
      referer: detail.url,
      serverLabel: opts.serverLabel ?? candidate.label,
      onChallenge: (c) => {
        challenge = c;
      },
    });

    if (stream && stream.type !== 'embed') {
      // Un HLS puede estar bien formado y aun asi no tener video dentro
      // (solo anuncios). Comprobamos antes de darlo por bueno, porque el
      // usuario veria un reproductor en negro sin entender el motivo.
      if (stream.type === 'hls') {
        const validation = await validateHls(stream.url, detail.url);
        if (!validation.ok) {
          // La traza lleva el detalle con la URL; la interfaz solo recibe la
          // frase corta, sin URLs firmadas.
          trace?.(`servidor descartado: ${candidate.label} -> ${validation.detail ?? validation.reason}`);
          attempts.push({
            serverId: candidate.id,
            label: candidate.label,
            ok: false,
            reason: validation.reason,
          });
          continue;
        }
      }
      trace?.(`servidor valido: ${candidate.label} -> ${stream.type}`);
      attempts.push({ serverId: candidate.id, label: candidate.label, ok: true, reason: null });
      return { detail, stream, attempts, serverId: candidate.id, sinProbar: candidates.length - attempts.length };
    }

    // Este servidor solo devolvio un embed, o nada. No lo damos por bueno: se
    // apunta el motivo y se sigue con el siguiente.
    //
    // Si el hoster pidio un reto anti-bot, ese es el motivo real y gana sobre el
    // motivo generico. Un "no se pudo extraer" invita a esperar; "pide captcha"
    // explica que esperar no va a servir.
    const reason = challenge
      ? `el servidor pide ${challenge} y no lo resuelve solo`
      : stream
        ? 'solo entrega un reproductor incrustado, sin stream reproducible'
        : 'no se pudo extraer ninguna dirección de vídeo';

    attempts.push({ serverId: candidate.id, label: candidate.label, ok: false, reason });
    if (stream) fallback = stream;
  }

  // La pagina propia siempre esta en la lista, asi que este caso solo puede
  // darse si se construyo una lista vacia: mantenemos la proteccion.
  if (candidates.length === 0) {
    const stream = await resolveStream(playPage, {
      ...opts,
      budgetMs: Math.max(2_000, deadline - Date.now()),
      referer: detail.url,
    });
    return { detail, stream, attempts, serverId: null, sinProbar: 0 };
  }

  trace?.('ningun servidor devolvio un stream directo');
  return { detail, stream: fallback, attempts, serverId: null, sinProbar: candidates.length - attempts.length };
}

function toStream(
  server: PlaybackServer,
  serverLabel: string | null,
  method: string,
  proxied: boolean,
): ResolvedStream {
  return {
    url: server.embedUrl,
    type: classifyStream(server.embedUrl),
    method,
    durationSec: null,
    serverLabel: serverLabel ?? server.label ?? null,
    proxied,
  };
}

export { closeBrowser, isBrowserRunning } from './browser.js';
export { classifyStream };