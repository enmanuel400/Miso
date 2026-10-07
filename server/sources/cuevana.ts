import type {
  EpisodeInfo,
  EpisodeRef,
  MediaKind,
  PlaybackServer,
  SearchResult,
  SeasonInfo,
  TitleDetail,
} from './types.js';
import type { SourceAdapter } from './shared.js';
import { fetchText } from '../http.js';
import { dedupeResults, indiceDeSerie, isMissingPoster, primerCapitulo } from './shared.js';

/**
 * Cuevana
 *
 * A diferencia de pelisplushd, esta no se parsea: se consulta. La web es
 * una aplicacion de una sola pagina cuyo HTML son 1,8 kB de shell, y todo el
 * catalogo se dibuja en el cliente. Pero el bundle construye sus peticiones a
 * `https://tmdb.` seguido del dominio del sitio, y ahi hay una API REST limpia:
 *
 *   GET /v1/search?q=termino               -> { total, items: [...] }
 *   GET /v1/items/{kind}/{idTmdb}          -> { item: {...} }
 *   GET /v1/items/{kind}/{idTmdb}/seasons  -> { seasons: [...] }
 *   GET /v1/items/{kind}/{idTmdb}/seasons/{N} -> { season: { episodes: [...] } }
 *   GET /v1/playback/{kind}/{idTmdb}       -> { embeds: [...] }
 *   GET /v1/episodes                       -> { items: [{ show, episode }] }
 *
 * Es la mejor fuente que ha tenido Miso por dos motivos que no son academicos.
 *
 *   - La busqueda responde en 350 ms con 55 resultados. La otra lo hace en
 *     400-650 ms sobre paginas de cientos de kilobytes.
 *   - `/v1/playback` devuelve los embeds YA RESUELTOS, con host, idioma y
 *     calidad. La otra fuente obliga a arrancar un Chromium contra cada
 *     servidor, siete segundos por servidor, para adivinar el mismo dato.
 *
 * Derivar el host de la API a partir del dominio activo no es una comodidad:
 * es lo que hacen los cuatro sitios de la lista. Por eso los cuatro sirven, y
 * por eso, cuando uno cae, los otros tres siguen contestando con el mismo
 * catalogo (medido: 55 resultados identicos y embeds identicos).
 *
 * Lo que NO se hace es tratar los cuatro como cuatro fuentes distintas. No lo
 * son: son el mismo backend con cuatro portadas distintas, asi que estan aqui
 * como dominios alternativos y no como fuentes que dupliquen tarjetas.
 */

/** Dominios que sirven el mismo backend. El primero vivo es el que se usa. */
const DOMAINS = ['cuevana3.sc', 'cuevana3.gs', 'compucalitv.tv', 'mega1080.me', 'pelisplus.fo'];

/** Imagenes de TMDB. No envian ACAO, asi que pasan por nuestro proxy. */
const IMAGE_BASE = 'https://image.tmdb.org/t/p';

/**
 * Tipos de esta API a los nuestros.
 *
 * La fuente separa `tvshow` de `anime` porque mantiene dos catalogos, pero para
 * el usuario ambas son series y se comportan exactamente igual.
 */
function toKind(raw: string | undefined | null): MediaKind | null {
  if (raw === 'movie') return 'movie';
  if (raw === 'tvshow' || raw === 'anime' || raw === 'series') return 'series';
  return null;
}

/** Dominio registrable, igual que hace la web para derivar `tmdb.`. */
function registrable(host: string): string {
  const parts = host.toLowerCase().replace(/\.$/, '').split('.').filter(Boolean);
  if (parts.length <= 2) return host;
  const dosNiveles = new Set(['ac', 'co', 'com', 'edu', 'gob', 'gov', 'net', 'org']);
  const tld = parts.at(-1) ?? '';
  const sld = parts.at(-2) ?? '';
  return tld.length === 2 && dosNiveles.has(sld) && parts.length >= 3
    ? parts.slice(-3).join('.')
    : parts.slice(-2).join('.');
}

function apiBase(domain: string): string {
  return `https://tmdb.${registrable(domain)}`;
}

/** Identificador de titulo: `{kind}/{idTmdb}`, tal y como lo espera la API. */
function makeId(kind: string, tmdbId: number): string {
  return `${kind}/${tmdbId}`;
}

/** Ruta de la ficha en el sitio, que es lo que se abre en el navegador. */
function pageUrl(domain: string, kind: string, tmdbId: number): string {
  const carpeta = kind === 'movie' ? 'pelicula' : kind === 'anime' ? 'anime' : 'serie';
  return `https://${domain}/${carpeta}/${tmdbId}`;
}

/** Lee el JSON de una respuesta, o null si no es el objeto que esperamos. */
function readJson<T>(body: string): T | null {
  try {
    const data = JSON.parse(body) as T;
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

interface ApiItem {
  tmdb_id: number;
  kind: string;
  title?: string;
  poster_path?: string | null;
  year?: number | null;
  vote_average?: number | null;
  overview?: string | null;
  tagline?: string | null;
  /** Temporadas con capitulos. Solo en series. */
  episode_seasons?: ApiSeason[];
}

interface SearchResponse {
  total?: number;
  items?: ApiItem[];
}

interface ItemResponse {
  item?: ApiItem;
}

interface ApiEmbed {
  url?: string;
  host?: string;
  lang?: string | null;
  quality?: string | null;
}

interface PlaybackResponse {
  kind?: string;
  season?: number | null;
  episode?: number | null;
  embeds?: ApiEmbed[];
}

/** Temporada tal y como la declara la API. */
interface ApiSeason {
  season: number;
  name?: string | null;
  poster_path?: string | null;
  count?: number;
  available_count?: number;
  first_episode?: number;
  last_episode?: number;
}

/** Capitulo tal y como lo declara la API. */
interface ApiEpisode {
  season: number;
  episode: number;
  title?: string | null;
  air_date?: string | null;
  runtime?: number | null;
  playable?: boolean;
}

interface SeasonsResponse {
  seasons?: ApiSeason[];
}

interface SeasonResponse {
  season?: { episodes?: ApiEpisode[] };
}

interface EpisodesResponse {
  items?: { show?: ApiItem; episode?: ApiEpisode }[];
}

/** El id de un titulo de esta fuente siempre lleva el tipo delante. */
function esSerie(id: string): boolean {
  return id.startsWith('tvshow/') || id.startsWith('anime/');
}

/**
 * Convierte la respuesta de `/v1/playback` en la lista de servidores.
 *
 * Va separada de la descarga a proposito. Todo lo que puede salir mal aqui (una
 * entrada sin URL utilizable, un host vacio, un idioma que no llega, el prefijo
 * de episodio) es logica pura, y separarla permite comprobarla con una
 * respuesta guardada, sin red y en milisegundos, en vez de depender de que el
 * servidor de Cuevana este despierto cuando se ejecuta la prueba.
 *
 * @param body Cuerpo de la respuesta tal cual llega de la API.
 * @param id Identificador del titulo, `{kind}/{idTmdb}`.
 * @param pos Capitulo pedido. Si la fuente es una serie y no se indica ninguno,
 *   la etiqueta lo dice explicitamente en vez de fingir que es el primero.
 */
export function servidoresDe(
  body: string,
  id: string,
  pos: EpisodeRef | null = null,
): PlaybackServer[] {
  const data = readJson<PlaybackResponse>(body);
  if (!data || !Array.isArray(data.embeds)) return [];

  // Para series y animes la API exige temporada y capitulo. Si no se sabe cual
  // es, se escribe el que dice la propia respuesta en lugar de suponer el
  // primero: presentar "T1E1" sin avisar seria decir una cosa y ensenar otra.
  // En una pelicula no se pone ninguno, porque no hay capitulo que nombrar.
  const capitulo = esSerie(id) ? (pos ?? capituloDeLaRespuesta(data)) : null;

  const servers: PlaybackServer[] = [];

  data.embeds.forEach((embed) => {
    const embedUrl = (embed.url ?? '').trim();
    if (!/^https?:\/\//i.test(embedUrl)) return;

    // La API llama "Online" a todos los servidores, asi que ese campo no sirve
    // de etiqueta. El host si: es lo que distingue una entrada de otra, y el
    // idioma y la calidad son justo por lo que se elige entre ellas.
    let host = (embed.host ?? '').trim();
    if (!host) {
      try {
        host = new URL(embedUrl).hostname.replace(/^www\./, '');
      } catch {
        host = 'reproductor';
      }
    }

    const datos = [embed.lang?.trim(), embed.quality?.trim()].filter(Boolean) as string[];
    const etiqueta = datos.length ? `${datos.join(' · ')} · ${host}` : host;

    servers.push({
      // El indice va sobre lo ya aceptado, no sobre la posicion en la respuesta:
      // si la tercera entrada vino sin URL, el cuarto servidor se llama cv-2 y
      // no cv-3. Un hueco en la numeracion parece un fallo de lectura.
      id: `cv-${servers.length}`,
      label: capitulo ? `T${capitulo.season}E${capitulo.episode} · ${etiqueta}` : etiqueta,
      embedUrl,
      method: 'api',
    });
  });

  return servers;
}

/** Capitulo que declara la propia respuesta de playback, si declara alguno. */
function capituloDeLaRespuesta(data: PlaybackResponse): EpisodeRef | null {
  const season = data.season;
  const episode = data.episode;
  if (typeof season !== 'number' || typeof episode !== 'number') return null;
  return { season, episode };
}

/**
 * Temporadas de una serie, a partir de `item.episode_seasons` o de la respuesta
 * de `/seasons`. Ambas tienen las mismas claves, asi que el lector vale para las
 * dos.
 *
 * Se ignoran las temporadas sin capitulos disponibles. Es una distincion que
 * importa: "Rick y Morty" declara `number_of_seasons: 10` pero solo nueve
 * temporadas tienen capitulos, y pedir la decima devuelve un error de la API en
 * lugar de un capitulo.
 *
 * Y dentro de una temporada, `last_episode` manda sobre `count`. La misma serie
 * anuncia diez capitulos en la temporada 9 y tiene nueve, asi que un `count`
 * obligaria a ofrecer un capitulo 10 que la API rechaza con un error.
 */
export function temporadasDe(lista: ApiSeason[] | undefined): SeasonInfo[] {
  if (!Array.isArray(lista)) return [];

  return lista
    .filter((s) => typeof s?.season === 'number')
    .map((s) => {
      const first = typeof s.first_episode === 'number' ? s.first_episode : 1;
      const last =
        typeof s.last_episode === 'number'
          ? s.last_episode
          : Math.max(first - 1, (s.available_count ?? s.count ?? 0));
      return {
        season: s.season,
        name: (s.name ?? '').trim() || `Temporada ${s.season}`,
        first,
        last,
        poster: s.poster_path ? `${IMAGE_BASE}/w342${s.poster_path}` : null,
      };
    })
    .filter((s) => s.last >= s.first)
    .sort((a, b) => a.season - b.season);
}

/** Capitulos de una temporada, ordenados y con el estado de disponibilidad. */
export function capitulosDe(lista: ApiEpisode[] | undefined): EpisodeInfo[] {
  if (!Array.isArray(lista)) return [];

  return lista
    .filter((e) => e && typeof e.episode === 'number' && typeof e.season === 'number')
    .map((e) => ({
      season: e.season,
      episode: e.episode,
      title: (e.title ?? '').trim() || `Episodio ${e.episode}`,
      airDate: (e.air_date ?? '').trim() || null,
      runtime: typeof e.runtime === 'number' ? e.runtime : null,
      // `playable` no viene en todas las respuestas; si falta, se supone que si,
      // que es lo que hace la propia web al pintar el boton de reproducir.
      available: e.playable !== false,
    }))
    .sort((a, b) => a.episode - b.episode);
}

/** Busca el capitulo pedido en una lista, o el mas cercano por arriba o por abajo. */
export function capituloMasCercano(
  capitulos: EpisodeInfo[],
  pedido: EpisodeRef | null,
): EpisodeRef | null {
  if (capitulos.length === 0) return null;
  if (!pedido) return capitulos[0];

  const mismo = capitulos.find((c) => c.episode === pedido.episode);
  if (mismo) return { season: mismo.season, episode: mismo.episode };

  // Pedir un capitulo que no existe no puede fallar en silencio: se devuelve el
  // mas proximo, que es lo que vera el usuario, y la interfaz lo dira al
  // mostrar la temporada.
  const posteriores = capitulos.filter((c) => c.episode > pedido.episode);
  const elegido = posteriores[0] ?? capitulos.at(-1)!;
  return { season: elegido.season, episode: elegido.episode };
}

export const cuevana: SourceAdapter = {
  meta: {
    id: 'cuevana',
    label: 'cuevana',
    accent: '#2fb8a6',
  },

  domains: DOMAINS,

  searchUrl(domain, query) {
    return `${apiBase(domain)}/v1/search?q=${encodeURIComponent(query.trim())}`;
  },

  parseResults(body, domain): SearchResult[] {
    const data = readJson<SearchResponse>(body);
    if (!data || !Array.isArray(data.items)) return [];

    const out: SearchResult[] = [];

    for (const item of data.items) {
      const title = (item.title ?? '').trim();
      if (!title || typeof item.tmdb_id !== 'number' || typeof item.kind !== 'string') continue;

      const poster = item.poster_path ? `${IMAGE_BASE}/w342${item.poster_path}` : null;

      out.push({
        id: makeId(item.kind, item.tmdb_id),
        source: 'cuevana',
        sourceLabel: 'cuevana',
        title,
        url: pageUrl(domain, item.kind, item.tmdb_id),
        poster: isMissingPoster(poster) ? null : poster,
        kind: toKind(item.kind),
        year: typeof item.year === 'number' ? String(item.year) : null,
        rating:
          typeof item.vote_average === 'number' && item.vote_average > 0
            ? `${item.vote_average.toFixed(1)}/10`
            : null,
        episode: null,
        note: null,
      });
    }

    return dedupeResults(out);
  },

  // La ficha (poster, sinopsis, anio) y los reproductores viven en endpoints
  // distintos, asi que aqui se lee la ficha y `fetchServers` trae los embeds.
  playUrl(domain, id) {
    return `${apiBase(domain)}/v1/items/${id}`;
  },

  parseDetail(body, domain, id): TitleDetail {
    const data = readJson<ItemResponse>(body);
    const item = data?.item;
    const poster = item?.poster_path ? `${IMAGE_BASE}/w780${item.poster_path}` : null;

    // El indice de temporadas ya viene en la ficha, asi que leerlo aqui no cuesta
    // ninguna peticion: son 4 kB en un JSON de 12 kB que ya habia que bajar.
    const seasons = esSerie(id) ? temporadasDe(item?.episode_seasons) : [];
    const porDefecto = primerCapitulo(seasons);

    return {
      source: 'cuevana',
      id,
      title: (item?.title ?? '').trim() || id.replace(/^\w+\//, ''),
      url:
        item && typeof item.tmdb_id === 'number' ? pageUrl(domain, item.kind, item.tmdb_id) : `https://${domain}/`,
      poster: isMissingPoster(poster) ? null : poster,
      // Sinopsis primero y lema despues: el lema es una frase corta que sin
      // contexto ("El capitulo final.") se lee como si fuera otro titulo.
      synopsis: item?.overview?.trim() || item?.tagline?.trim() || null,
      year: typeof item?.year === 'number' ? String(item.year) : null,
      kind: toKind(item?.kind),
      servers: [],
      episodes: indiceDeSerie(seasons, [], porDefecto),
    };
  },

  /**
   * Los embeds de un capitulo, que es justo lo que la otra fuente obliga a
   * adivinar con un navegador.
   *
   * Para series y animes la API exige temporada y capitulo, y por eso van en la
   * consulta. Cuando no se sabe cual es, se pide el primero, que es lo que
   * hacia la web de origen.
   */
  async fetchServers(domain, id, pos) {
    const query = esSerie(id) ? (pos ?? { season: 1, episode: 1 }) : null;
    const url =
      `${apiBase(domain)}/v1/playback/${id}` +
      (query ? `?season=${query.season}&episode=${query.episode}` : '');

    const body = await fetchText(url, { referer: `https://${domain}/`, timeoutMs: 10_000 });

    return servidoresDe(body, id, query);
  },

  /**
   * Capitulos de una temporada.
   *
   * Vive en un endpoint propio porque el indice de temporadas dice cuantos hay
   * pero no como se llaman: "Rick y Morty" temporada 9 declara diez capitulos y
   * nueve disponibles, y el titulo del capitulo solo esta aqui.
   *
   * El indice se vuelve a pedir por si la ficha venia sin el, que es lo que pasa
   * con peliculas y con una respuesta a medias. Son 4 kB y 330 ms, y solo en ese
   * caso.
   */
  async fetchEpisodes(domain, id, season, seasons) {
    let conocidas = seasons;
    if (conocidas.length === 0) {
      const body = await fetchText(`${apiBase(domain)}/v1/items/${id}/seasons`, {
        referer: `https://${domain}/`,
        timeoutMs: 10_000,
      });
      conocidas = temporadasDe(readJson<SeasonsResponse>(body)?.seasons);
    }

    // Sin esa comprobacion se pediria un capitulo de una temporada que la fuente
    // no tiene, y la respuesta seria un error en vez de una lista vacia.
    if (!conocidas.some((s) => s.season === season)) return null;

    const body = await fetchText(`${apiBase(domain)}/v1/items/${id}/seasons/${season}`, {
      referer: `https://${domain}/`,
      timeoutMs: 10_000,
    });

    return capitulosDe(readJson<SeasonResponse>(body)?.season?.episodes);
  },

  /**
   * Lo mas nuevo de la fuente.
   *
   * Es el listado de capitulos recientes, y se eligio a proposito entre las tres
   * opciones que expone la API. Las otras dos no sirven:
   *
   *   /v1/now   No esta ordenado por fecha. Medido: la primera pagina mezcla
   *             "Terminator" (1984) con "Zootopia 2" (2025) en orden arbitrario.
   *   /v1/top   Es una clasificacion, no una lista de novedades.
   *
   * `/v1/episodes` si lo esta, y de forma utilizable: viene ordenado por fecha de
   * emision descendente y cada elemento trae el capitulo concreto. Medido sobre
   * Rick y Morty, el elemento mas reciente era T9E9 con fecha 2026-07-19, que es
   * el ultimo capitulo emitido. Ademas cada entrada abre en su capitulo, que es
   * justo lo que se pidio: la tarjeta de "lo mas nuevo" tiene que llevar al
   * capitulo nuevo y no a la serie entera.
   */
  async fetchHome(domain, limit) {
    const url = `${apiBase(domain)}/v1/episodes?limit=${limit * 2}`;
    const body = await fetchText(url, { referer: `https://${domain}/`, timeoutMs: 12_000 });
    return entradasDeInicio(body, domain, limit);
  },
};

/**
 * Lee el listado de capitulos recientes y lo convierte en entradas de la pantalla
 * de inicio.
 *
 * Va fuera del adaptador a proposito, igual que `servidoresDe`: es logica pura
 * sobre un JSON, y separarla permite comprobarla con una respuesta guardada, sin
 * red y en milisegundos, en vez de depender de que la API este despierta cuando
 * se ejecuta la prueba.
 *
 * Cada capitulo da una entrada. Una serie sale tantas veces como capitulos
 * recientes tenga, y se deja a proposito: son capitulos distintos y abren en sitio
 * distinto. El agrupado de la interfaz funde las de una misma serie en una sola
 * tarjeta con todos sus capitulos, y ahi es donde el exceso se descarta.
 */
export function entradasDeInicio(body: string, domain: string, limit: number): SearchResult[] {
  const data = readJson<EpisodesResponse>(body);
  if (!data || !Array.isArray(data.items)) return [];

  const out: SearchResult[] = [];

  for (const fila of data.items) {
    const show = fila.show;
    const cap = fila.episode;
    if (!show || !cap || typeof show.tmdb_id !== 'number' || typeof show.kind !== 'string') continue;
    if (typeof cap.season !== 'number' || typeof cap.episode !== 'number') continue;

    const titulo = (show.title ?? '').trim();
    if (!titulo) continue;

    const poster = show.poster_path ? `${IMAGE_BASE}/w342${show.poster_path}` : null;
    const nombreCap = (cap.title ?? '').trim();

    out.push({
      id: makeId(show.kind, show.tmdb_id),
      source: 'cuevana',
      sourceLabel: 'cuevana',
      title: titulo,
      url: pageUrl(domain, show.kind, show.tmdb_id),
      poster: isMissingPoster(poster) ? null : poster,
      kind: toKind(show.kind),
      year: typeof show.year === 'number' ? String(show.year) : null,
      rating:
        typeof show.vote_average === 'number' && show.vote_average > 0
          ? `${show.vote_average.toFixed(1)}/10`
          : null,
      episode: { season: cap.season, episode: cap.episode },
      // La nota es lo unico que explica por que esta tarjeta sale en el inicio.
      // Con el titulo del capitulo al lado, "Rick y Morty" por si solo no dice si
      // es la serie entera o el capitulo de ayer.
      note: nombreCap ? `T${cap.season}E${cap.episode} · ${nombreCap}` : `T${cap.season}E${cap.episode}`,
    });
  }

  return out.slice(0, limit);
}
