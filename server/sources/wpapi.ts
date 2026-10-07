import type {
  EpisodeInfo,
  MediaKind,
  PlaybackServer,
  SearchResult,
  SeasonInfo,
  SourceMeta,
  TitleDetail,
} from './types.js';
import type { SourceAdapter } from './shared.js';
import {
  cleanText,
  dedupeResults,
  entrelazar,
  extractYear,
  hostOf,
  indiceDeSerie,
  isJunkTitle,
  isMissingPoster,
  primerCapitulo,
  sinAnio,
} from './shared.js';
import { fetchText } from '../http.js';
import { cacheGet, cacheSet } from '../cache.js';

/**
 * Adaptador generico para la familia de sitios "Cuevana react" (cuevana3.gs,
 * lamovie.org...).
 *
 * Los dos sitios son el MISMO tema de WordPress con un backend Laravel servido
 * bajo `/wp-api/v1`, y no hay HTML que parsear: la pagina es un SPA y su contenido
 * sale entero de ese JSON. Por eso este adaptador no usa cheerio, solo habla con
 * la API. Los endpoints que se usan, medidos contra ambos sitios:
 *
 *   GET /search?q=...&postType=any&postsPerPage=N
 *       -> { data: { posts: [...] } }
 *   GET /listing/movies?postType=movies|tvshows|animes&orderBy=created_at&order=desc
 *       -> { data: { posts: [...] } }                 (inicio)
 *   GET /single/{tipo}?slug=...&postType={tipo}
 *       -> { data: { _id, title, images, overview, ... } }   (ficha)
 *   GET /single/episodes/list?_id={show}&season=N&page=1&postsPerPage=N
 *       -> { data: { posts, seasons, pagination } }
 *   GET /player?postId={id}
 *       -> { data: { embeds: [{ url, server, lang, quality }] } }
 *
 * El parametro `postId` del reproductor es el `_id` del post: el de la pelicula
 * para una pelicula, el del CAPITULO para una serie (por eso hay que resolver
 * antes el `_id` del capitulo con `/single/episodes/list`).
 *
 * Identificador interno: `{tipo}/{_id}/{slug}`. Lleva el `_id` porque la API lo
 * necesita constantemente y asi no hay que volver a resolverlo; el slug va detras
 * para poder construir la URL humana sin otra llamada. `splitId` tolera el caso
 * sin `_id` (devuelve null) para no reventar con identificadores de otras fuentes.
 */

const CACHE_TTL = 60 * 60 * 1000;

/** Forma de un post de la API. Todos los campos son opcionales: se valida antes de usar. */
interface WpPost {
  _id?: number | string;
  title?: string;
  slug?: string;
  type?: string;
  overview?: string;
  release_date?: string;
  rating?: string;
  runtime?: string | number;
  images?: { poster?: string; backdrop?: string; logo?: string };
  poster?: string;
  season_number?: number | string;
  episode_number?: number | string;
  date?: string;
}

interface WpEmbed {
  url?: string;
  server?: string;
  lang?: string;
  quality?: string;
}

interface WpRespuesta<T> {
  error?: boolean;
  message?: string;
  data?: T;
}

interface EpisodesData {
  posts?: WpPost[];
  seasons?: unknown[];
  pagination?: { total?: number };
}

interface SeasonList {
  posts: WpPost[];
  total: number;
  seasons: number[];
}

function api(domain: string): string {
  return `https://${domain}/wp-api/v1`;
}

function kindDe(type: string | undefined): MediaKind | null {
  if (type === 'movies') return 'movie';
  if (type === 'tvshows') return 'series';
  if (type === 'animes') return 'anime';
  return null;
}

/** El segmento de la URL humana segun el tipo de la API. */
function tipoRuta(type: string): string {
  if (type === 'tvshows') return 'series';
  if (type === 'animes') return 'animes';
  return 'peliculas';
}

function urlHumana(domain: string, type: string, slug: string): string {
  return `https://${domain}/${tipoRuta(type)}/${slug}/`;
}

function makeId(type: string, id: number | string, slug: string): string {
  return `${type}/${id}/${slug}`;
}

function splitId(id: string): { type: string; num: number | null; slug: string } {
  const partes = id.split('/');
  const type = partes[0] || 'movies';
  const num = Number(partes[1]);
  const slug = partes.slice(2).join('/') || partes[1] || '';
  return { type, num: Number.isFinite(num) && num > 0 ? num : null, slug };
}

/**
 * Poster del post.
 *
 * `images.poster` es el thumbnail propio del sitio (`/thumbs/...webp`, servido
 * bajo `/wp-content/uploads`); `poster` es la ruta cruda de TMDB. Se prefiere el
 * primero porque no depende de un tercero. Medido: ninguno de los dos da 404 en
 * los dos sitios.
 */
function posterDe(post: WpPost, domain: string): string | null {
  const local = cleanText(post.images?.poster);
  if (local) {
    return /^https?:\/\//i.test(local) ? local : `https://${domain}/wp-content/uploads${local}`;
  }
  const tmdb = cleanText(post.poster);
  if (tmdb) {
    return /^https?:\/\//i.test(tmdb) ? tmdb : `https://image.tmdb.org/t/p/w300${tmdb}`;
  }
  return null;
}

function anioDe(post: WpPost): string | null {
  return extractYear(post.release_date) ?? extractYear(post.title) ?? null;
}

/**
 * Nombre del hoster.
 *
 * El campo `server` suele traerlo, pero en las peliculas de cuevana3.gs llega
 * como "Online" para todos y los servidores salian con la misma etiqueta. En ese
 * caso se recurre al parametro `server=` de `player.php` (vimeos, voe...) y, si
 * no, al host de la URL.
 */
function nombreServidor(embed: WpEmbed): string {
  const declarado = cleanText(embed.server);
  if (declarado && !/^online$/i.test(declarado)) return declarado;

  try {
    const url = new URL(embed.url ?? '');
    const parametro = cleanText(url.searchParams.get('server'));
    if (parametro) return parametro;
    return url.hostname.replace(/^www\./, '');
  } catch {
    return declarado || 'Online';
  }
}

/** Etiqueta legible del servidor: idioma y calidad por delante del hoster. */
function etiquetaServidor(embed: WpEmbed): string {
  const partes = [cleanText(embed.lang), cleanText(embed.quality), nombreServidor(embed)].filter(
    Boolean,
  );
  return partes.join(' · ') || hostOf(embed.url ?? '');
}

async function pedirJson<T>(url: string, domain: string): Promise<WpRespuesta<T>> {
  const body = await fetchText(url, { referer: `https://${domain}/`, timeoutMs: 20_000 });
  return JSON.parse(body) as WpRespuesta<T>;
}

/** Convierte un post de la API en un resultado de busqueda/inicio. */
function dePost(
  post: WpPost,
  domain: string,
  meta: SourceMeta,
  nota: string | null,
): SearchResult | null {
  const type = cleanText(post.type) || 'movies';
  const slug = cleanText(post.slug);
  // El anio se saca del titulo crudo y viaja en `year`; el titulo se muestra sin
  // el para que agrupe con las demas fuentes (ver `sinAnio`).
  const title = sinAnio(post.title);
  const rawId = post._id;

  if (!slug || !title || rawId === undefined || rawId === null) return null;
  if (isJunkTitle(title)) return null;

  const poster = posterDe(post, domain);
  return {
    id: makeId(type, rawId, slug),
    source: meta.id,
    sourceLabel: meta.label,
    title,
    url: urlHumana(domain, type, slug),
    poster: isMissingPoster(poster) ? null : poster,
    kind: kindDe(type),
    year: anioDe(post),
    rating: cleanText(post.rating) || null,
    episode: null,
    note: nota,
  };
}

function temporadaDePosts(posts: WpPost[]): EpisodeInfo[] {
  const out: EpisodeInfo[] = [];
  for (const p of posts) {
    const episode = Number(p.episode_number);
    if (!Number.isInteger(episode) || episode <= 0) continue;
    const season = Number(p.season_number);
    out.push({
      season: Number.isInteger(season) && season > 0 ? season : 1,
      episode,
      title: null,
      // `date` es cuando se anadio el capitulo al sitio, no su fecha de emision;
      // no hay campo de emision en esta API, asi que no se inventa una.
      airDate: null,
      runtime: Number(p.runtime) ? Math.round(Number(p.runtime)) : null,
      available: true,
    });
  }
  out.sort((a, b) => a.season - b.season || a.episode - b.episode);
  return out;
}

async function traerSingle(domain: string, type: string, slug: string): Promise<WpPost> {
  const url = `${api(domain)}/single/${type}?slug=${encodeURIComponent(slug)}&postType=${type}`;
  const json = await pedirJson<WpPost>(url, domain);
  return json.data ?? {};
}

async function traerLista(domain: string, showId: number, season: number): Promise<SeasonList> {
  const url =
    `${api(domain)}/single/episodes/list?_id=${showId}` +
    `&season=${season}&page=1&postsPerPage=200`;
  const json = await pedirJson<EpisodesData>(url, domain);
  const posts = Array.isArray(json.data?.posts) ? json.data!.posts! : [];
  const total = Number(json.data?.pagination?.total) || posts.length;
  const seasons = Array.isArray(json.data?.seasons)
    ? [
        ...new Set(
          json
            .data!.seasons!.map(Number)
            .filter((n) => Number.isInteger(n) && n > 0),
        ),
      ].sort((a, b) => a - b)
    : [];
  return { posts, total, seasons };
}

function totalKey(domain: string, showId: number, season: number): string {
  return `wpf:total:${domain}:${showId}:${season}`;
}

function guardarTotal(domain: string, showId: number, season: number, total: number): void {
  if (total > 0) cacheSet(totalKey(domain, showId, season), total, CACHE_TTL);
}

function leerTotal(domain: string, showId: number, season: number): number | null {
  return cacheGet<number>(totalKey(domain, showId, season)) ?? null;
}

/**
 * El `_id` del capitulo, que es lo que pide `/player`.
 *
 * Se resuelve desde la lista de la temporada. La cache evita repetir la descarga
 * que `fetchDetail` ya hizo para construir el indice en la misma resolucion.
 */
async function idDeCapitulo(
  domain: string,
  showId: number,
  season: number,
  episode: number,
): Promise<number | null> {
  const key = `wpf:eps:${domain}:${showId}:${season}`;
  const cache = cacheGet<Record<string, number>>(key);
  if (cache && cache[String(episode)] !== undefined) return cache[String(episode)];

  try {
    const lista = await traerLista(domain, showId, season);
    guardarTotal(domain, showId, season, lista.total);
    const mapa: Record<string, number> = {};
    for (const p of lista.posts) {
      const ep = Number(p.episode_number);
      const id = Number(p._id);
      if (Number.isInteger(ep) && Number.isInteger(id)) mapa[String(ep)] = id;
    }
    cacheSet(key, mapa, CACHE_TTL);
    return mapa[String(episode)] ?? null;
  } catch {
    return null;
  }
}

/** Ficha minima, valida incluso cuando `single` falla. */
function detalleBase(
  meta: SourceMeta,
  domain: string,
  id: string,
  post: WpPost,
  type: string,
  slug: string,
): TitleDetail {
  const poster = posterDe(post, domain);
  return {
    source: meta.id,
    id,
    title: sinAnio(post.title) || slug.replace(/-/g, ' '),
    url: urlHumana(domain, type, slug),
    poster: isMissingPoster(poster) ? null : poster,
    synopsis: cleanText(post.overview) || null,
    year: anioDe(post),
    kind: kindDe(type),
    servers: [],
    episodes: null,
  };
}

/**
 * Temporadas de una serie y capitulos de la que se va a ver.
 *
 * La temporada objetivo es la pedida, o la primera con capitulos. Se pide
 * justamente esa para conocer su total real, que es lo que despues usa
 * `capituloAjustado` para no ofrecer un capitulo que no existe. Para las demas
 * temporadas solo hay una estimacion (el total de la pedida) hasta que se abren;
 * el salto de temporada sigue aterrizando en un capitulo valido.
 */
async function indiceDeTemporada(
  domain: string,
  showId: number,
  pos: { season: number; episode: number } | null,
): Promise<{ seasons: SeasonInfo[]; episodes: EpisodeInfo[] } | null> {
  const pedida = Number.isInteger(pos?.season) && (pos?.season ?? 0) > 0 ? pos!.season : null;
  const lista = await traerLista(domain, showId, pedida ?? 1);
  if (lista.posts.length === 0) return null;

  guardarTotal(domain, showId, pedida ?? 1, lista.total);
  const numeros = lista.seasons.length > 0 ? lista.seasons : [pedida ?? 1];
  const objetivo = pedida ?? numeros[0];

  const seasons: SeasonInfo[] = numeros.map((n) => ({
    season: n,
    name: `Temporada ${n}`,
    first: 1,
    last: Math.max(n === objetivo ? lista.total : leerTotal(domain, showId, n) ?? lista.total, 1),
    poster: null,
  }));

  return { seasons, episodes: temporadaDePosts(lista.posts) };
}

/** Un listado de la API ("lo mas nuevo") convertido en resultados. */
async function listado(
  domain: string,
  type: string,
  limit: number,
  meta: SourceMeta,
): Promise<SearchResult[]> {
  const url =
    `${api(domain)}/listing/movies?postType=${type}` +
    `&orderBy=created_at&order=desc&postsPerPage=${limit}`;
  const json = await pedirJson<{ posts?: WpPost[] }>(url, domain);
  const posts = Array.isArray(json.data?.posts) ? json.data!.posts! : [];
  return posts
    .map((p) => dePost(p, domain, meta, 'Estreno'))
    .filter((r): r is SearchResult => r !== null);
}

export function crearFuenteWpApi(meta: SourceMeta, domains: string[]): SourceAdapter {
  return {
    meta,
    domains,

    searchUrl(domain, query) {
      return `${api(domain)}/search?q=${encodeURIComponent(query)}&postType=any&postsPerPage=24&page=1`;
    },

    parseResults(body, domain): SearchResult[] {
      let json: WpRespuesta<{ posts?: WpPost[] }>;
      try {
        json = JSON.parse(body) as WpRespuesta<{ posts?: WpPost[] }>;
      } catch {
        return [];
      }
      const posts = json.data?.posts;
      if (!Array.isArray(posts)) return [];
      const out = posts
        .map((p) => dePost(p, domain, meta, null))
        .filter((r): r is SearchResult => r !== null);
      return dedupeResults(out);
    },

    playUrl(domain, id) {
      const { type, slug } = splitId(id);
      return urlHumana(domain, type, slug);
    },

    parseDetail(body, domain, id): TitleDetail {
      const { type, slug } = splitId(id);
      let single: WpRespuesta<WpPost> | null = null;
      try {
        single = JSON.parse(body) as WpRespuesta<WpPost>;
      } catch {
        single = null;
      }
      return detalleBase(meta, domain, id, single?.data ?? {}, type, slug);
    },

    async fetchDetail(domain, id, pos) {
      const { type, num, slug } = splitId(id);

      let post: WpPost = {};
      try {
        post = await traerSingle(domain, type, slug);
      } catch {
        // Sin ficha se sigue con un detalle minimo: el reproductor es lo importante.
      }

      const base = detalleBase(meta, domain, id, post, type, slug);
      if (type === 'movies' || num === null) return base;

      try {
        const estado = await indiceDeTemporada(domain, num, pos ?? null);
        if (!estado) return base;
        const inicial = pos ?? primerCapitulo(estado.seasons);
        return { ...base, episodes: indiceDeSerie(estado.seasons, estado.episodes, inicial) };
      } catch {
        return base;
      }
    },

    async fetchServers(domain, id, pos): Promise<PlaybackServer[]> {
      const { type, num } = splitId(id);
      if (num === null) return [];

      let postId: number | null = num;
      if (type !== 'movies') {
        if (!pos) return [];
        postId = await idDeCapitulo(domain, num, pos.season, pos.episode);
      }
      if (postId === null) return [];

      const json = await pedirJson<{ embeds?: WpEmbed[] }>(
        `${api(domain)}/player?postId=${postId}`,
        domain,
      );
      const embeds = Array.isArray(json.data?.embeds) ? json.data!.embeds! : [];
      return embeds
        .filter((e): e is WpEmbed => Boolean(e?.url && /^https?:\/\//i.test(e.url)))
        .map((e, i) => ({
          id: `${meta.id}-${i}`,
          label: etiquetaServidor(e),
          embedUrl: e.url as string,
          method: 'player-api',
        }));
    },

    async fetchEpisodes(domain, id, season): Promise<EpisodeInfo[] | null> {
      const { type, num } = splitId(id);
      if (type === 'movies' || num === null) return [];

      const lista = await traerLista(domain, num, season);
      guardarTotal(domain, num, season, lista.total);
      const eps = temporadaDePosts(lista.posts).filter((e) => e.season === season);
      return eps.length ? eps : null;
    },

    async fetchHome(domain, limit) {
      const mitad = Math.max(1, Math.ceil(limit / 2));
      const [peliculas, series] = await Promise.all([
        listado(domain, 'movies', mitad, meta).catch(() => [] as SearchResult[]),
        listado(domain, 'tvshows', mitad, meta).catch(() => [] as SearchResult[]),
      ]);
      return entrelazar(peliculas, series).slice(0, limit);
    },
  };
}