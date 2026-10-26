import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type {
  EpisodeInfo,
  MediaKind,
  PlaybackServer,
  SearchResult,
  SeasonInfo,
} from './types.js';
import type { SourceAdapter } from './shared.js';
import {
  cleanText,
  dedupeResults,
  entrelazar,
  extractYear,
  indiceDeSerie,
  isJunkTitle,
  isMissingPoster,
  primerCapitulo,
  sinAnio,
  sinopsisUtil,
} from './shared.js';
import { fetchJson, fetchText, HttpError } from '../http.js';
import { cacheGet, cacheSet, dedupe } from '../cache.js';
import { descifrarEmbed69, esEmbed69, nombreIdioma } from './embed69.js';
import { esVidhide, resolverVidhide } from './hosters.js';

// ----------------------------------------------------------------------
// Limite de peticiones del resolvedor de servidores
// ----------------------------------------------------------------------
//
// `POST /api/player-url` admite 20 peticiones y responde 429 con `retry-after`
// cuando se agotan. La aplicacion pedia dos por capitulo (una por cada boton) y
// en rafaga, asi que abrir varios capitulos seguidos dejaba la fuente sin
// servidores unos segundos. Medido: el mismo capitulo devuelve 3 servidores con
// calma y 0 en rafaga; en el navegador, una sola peticion, funciona.
//
// Tres reglas para no reproducir el fallo: una peticion por capitulo (el boton
// LATINO es el unico util), una espera minima entre peticiones y reintento
// respetando lo que pida la fuente.

const ESPACIO_ENTRE_PETICIONES_MS = 400;
const MAX_REINTENTOS_429 = 2;
const ESPERA_MAXIMA_429_MS = 15_000;
const CACHE_SERVIDORES_MS = 3 * 60_000;

/** Turno global: el limite es de la fuente, no de un capitulo. */
let siguienteTurno = 0;

async function esperarTurno(): Promise<void> {
  const ahora = Date.now();
  const turno = Math.max(ahora, siguienteTurno);
  siguienteTurno = turno + ESPACIO_ENTRE_PETICIONES_MS;
  const espera = turno - ahora;
  if (espera > 0) await new Promise((listo) => setTimeout(listo, espera));
}

function dormir(ms: number): Promise<void> {
  return new Promise((listo) => setTimeout(listo, ms));
}

/**
 * Cambia un testigo por su URL real, reintentando si la fuente limita.
 *
 * El ultimo error se propaga tal cual: la capa de arriba necesita saber que fue
 * un 429 para explicarlo, en vez de decir que el capitulo no tiene servidores.
 */
async function pedirUrlDelToken(
  domain: string,
  token: string,
): Promise<{ url?: string; type?: string }> {
  let ultimo: unknown = null;

  for (let intento = 0; intento <= MAX_REINTENTOS_429; intento++) {
    await esperarTurno();
    try {
      // Sin `Referer`: el `VerifyCsrfToken` de Laravel responde 419 cuando la
      // peticion lo trae (medido: mismo POST, 200 sin cabecera y 419 con ella).
      // El navegador del sitio no lo envia en este POST.
      return await fetchJson<{ url?: string; type?: string }>(
        `https://${domain}/api/player-url`,
        { t: token },
        { timeoutMs: 12_000 },
      );
    } catch (err) {
      ultimo = err;
      const esLimite = err instanceof HttpError && err.status === 429;
      if (!esLimite || intento === MAX_REINTENTOS_429) break;
      const espera = Math.min(ESPERA_MAXIMA_429_MS, (err.retryAfterMs ?? 1_500) + 150);
      await dormir(espera);
    }
  }

  throw ultimo;
}

/**
 * sololatino.net
 *
 * Fuente Laravel + Vue. No expone el catalogo por un endpoint limpio: la
 * busqueda se hace contra su autocompletado (`/api/search/suggest`) y el resto
 * (ficha, genero, listados) es HTML server-rendered.
 *
 * Lo que la hace distinta de las demas fuentes no es la busqueda sino el
 * reproductor. Sus botones llevan un testigo cifrado (`data-player-token`) y no
 * una URL:
 *
 *   POST /api/player-url  {t: <testigo>}  ->  {url, type}
 *
 * El boton "PREMIUM" responde con `player.pelisserieshoy.com`, que exige cuenta
 * VIP y revienta cualquier carga que no venga de su iframe; se descarta. El
 * boton "LATINO" responde con `embed69.org`, un player cuyo JS lleva los enlaces
 * de los hosters cifrados. `embed69.ts` los descifra (proof-of-work + AES), asi
 * que aqui se entregan los hosters finales (voe, streamwish, vidhide) en sus
 * cuatro idiomas y el extractor arranca ya en ellos, sin navegador.
 *
 * Identificador de titulo: la ruta del sitio. Una pelicula es `pelicula/<slug>`
 * y una serie `serie/<slug>`; ambas caben en la misma cadena, que es todo lo que
 * necesita `playUrl` para reconstruir la URL.
 */
export const sololatino: SourceAdapter = {
  meta: { id: 'sololatino', label: 'sololatino', accent: '#3ec9a7' },

  domains: ['sololatino.net'],

  /**
   * La busqueda va contra el autocompletado del sitio, que devuelve JSON.
   *
   * Devuelve poco (el desplegable de su barra de busqueda) y su pagina `/buscar`
   * esta detras de Cloudflare. Aun asi es la unica via: el buscador de Miso pide
   * ese endpoint y lee el JSON, exactamente como el navegador del sitio.
   */
  searchUrl(domain, query) {
    return `https://${domain}/api/search/suggest?q=${encodeURIComponent(query.trim())}`;
  },

  parseResults(body, _domain) {
    return parseSugerencias(body);
  },

  /**
   * URL de la pagina humana. En series la ficha no lleva el reproductor, asi que
   * el capitulo concreto es `/serie/<slug>/temporada-N/episodio-M`.
   */
  playUrl(domain, id, pos) {
    if (pos && id.startsWith('serie/')) {
      return `https://${domain}/${id}/temporada-${pos.season}/episodio-${pos.episode}`;
    }
    return `https://${domain}/${id}`;
  },

  parseDetail(html, domain, id) {
    const $ = cheerio.load(html);
    const ld = datosJsonLd($);
    const kind: MediaKind | null = id.startsWith('pelicula/')
      ? 'movie'
      : id.startsWith('serie/')
        ? 'series'
        : null;

    const title =
      sinAnio(ld?.name) ||
      sinAnio($('h1').first().text()) ||
      sinAnio($('meta[property="og:title"]').attr('content')) ||
      slugLegible(id);

    const posterRaw =
      absoluta(ld?.image, domain) ?? absoluta($('meta[property="og:image"]').attr('content'), domain);

    const synopsis =
      sinopsisUtil(ld?.description) ??
      sinopsisUtil($('meta[property="og:description"]').attr('content')) ??
      sinopsisUtil($('meta[name="description"]').attr('content'));

    const { seasons, episodes } = capitulosDe($);
    const porDefecto = primerCapitulo(seasons);
    const capitulos = porDefecto ? (episodes.get(porDefecto.season) ?? []) : [];

    return {
      source: 'sololatino',
      id,
      title,
      url: `https://${domain}/${id}`,
      poster: isMissingPoster(posterRaw) ? null : posterRaw,
      synopsis,
      year: extractYear(ld?.datePublished) ?? extractYear(title),
      kind,
      // Los servidores viven detras de un POST; los aporta `fetchServers`.
      servers: [],
      episodes: kind === 'series' ? indiceDeSerie(seasons, capitulos, porDefecto) : null,
    };
  },

  /**
   * Resuelve los embeds: baja la pagina (pelicula o capitulo), cambia cada
   * `data-player-token` por su URL real y, si es un embed69, lo descifra para
   * entregar los hosters finales.
   *
   * No se devuelve `player.pelisserieshoy.com` (el boton PREMIUM): su pagina se
   * borra a si misma cuando no va dentro de un iframe, asi que probarla en el
   * navegador solo gastaria presupuesto para fallar.
   */
  async fetchServers(domain, id, pos) {
    const pageUrl = this.playUrl(domain, id, pos ?? null);
    const cacheKey =
      `sololatino:servers:${domain}:${id}:${pos?.season ?? 'x'}:${pos?.episode ?? 'x'}`;

    // Abrir el mismo capitulo dos veces (reintentar, reconectar, volver atras)
    // no debe costar otra peticion: el limite es corto y se agota en rafaga.
    const cached = cacheGet<PlaybackServer[]>(cacheKey);
    if (cached) return cached;

    return dedupe(cacheKey, async () => {
      // Otra peticion identica pudo terminar mientras esta esperaba turno.
      const yaEsta = cacheGet<PlaybackServer[]>(cacheKey);
      if (yaEsta) return yaEsta;

      const html = await fetchText(pageUrl, { referer: `https://${domain}/` });
      const $ = cheerio.load(html);

      const testigos: { label: string; token: string }[] = [];
      $('[data-player-token]').each((_, el) => {
        const token = cleanText($(el).attr('data-player-token'));
        if (!token) return;
        testigos.push({ label: cleanText($(el).text()) || 'Servidor', token });
      });

      // "⭐ Principal" apunta a player.pelisserieshoy.com, que se descarta mas
      // abajo; pedirlo solo gastaria una de las 20 peticiones. Se prefiere
      // LATINO (embed69) y, si no estuviera, cualquier boton que no sea premium.
      const latinos = testigos.filter((t) => /latino/i.test(t.label));
      const candidatos =
        latinos.length > 0
          ? latinos
          : testigos.filter((t) => !/principal|premium/i.test(t.label));

      const urls: string[] = [];
      for (const t of candidatos) {
        try {
          const data = await pedirUrlDelToken(domain, t.token);
          if (data.url) urls.push(data.url);
        } catch (err) {
          // Con 429 no tiene sentido seguir: los demas botones tambien fallaran
          // y solo alargarian el bloqueo. Se propaga para poder explicarlo.
          if (err instanceof HttpError && err.status === 429) throw err;
          // Un boton roto no invalida los demas.
        }
      }

      // Los embeds se bajan en paralelo: ya no pasan por el limite de la API.
      const players = await Promise.all(
        urls
          .filter((url) => esEmbed69(url))
          .map(async (url) => {
            const playerHtml = await fetchText(url, { referer: pageUrl }).catch(() => '');
            return descifrarEmbed69(playerHtml);
          }),
      );

      const servers: PlaybackServer[] = [];
      for (const enlaces of players) {
        // La familia vidhide entrega el video real detras de un manifiesto
        // senuelo; se resuelve aqui, en Node, para que el extractor reciba un
        // `.m3u8` directo y no gaste navegador ni publicidad. El resto (voe pide
        // captcha, streamwish esconde el player en un JS ofuscado aparte) se deja
        // como embed, que es un recurso de reserva honesto.
        const enlacesResueltos = await Promise.all(
          enlaces.map(async (enlace) => {
            if (!esVidhide(enlace.url)) return enlace;
            const directo = await resolverVidhide(enlace.url).catch(() => null);
            return directo ? { ...enlace, url: directo } : enlace;
          }),
        );

        for (const enlace of enlacesResueltos) {
          servers.push({
            id: `sol-${servers.length + 1}`,
            label: `${nombreIdioma(enlace.language)} · ${enlace.server}`,
            embedUrl: enlace.url,
            method: 'embed69',
          });
        }
      }

      // Solo se cachea lo que sirvio. Un fallo puntual no debe quedarse pegado
      // tres minutos: justo despues de un 429 el reintento suele funcionar.
      if (servers.length > 0) cacheSet(cacheKey, servers, CACHE_SERVIDORES_MS);
      return servers;
    });
  },

  /**
   * Capitulos de una temporada que no es la primera.
   *
   * La pagina de la serie trae TODAS las temporadas (Rick y Morty viene con sus
   * nueve paneles), asi que `parseDetail` ya dejo el indice entero; volver a
   * bajarla es mas simple que recordar cual era y solo cuesta una descarga.
   */
  async fetchEpisodes(domain, id, season) {
    if (!id.startsWith('serie/')) return null;
    const html = await fetchText(`https://${domain}/${id}`, { referer: `https://${domain}/` });
    const { episodes } = capitulosDe(cheerio.load(html));
    return episodes.get(season) ?? null;
  },

  /**
   * Lo mas nuevo: los listados `/peliculas`, `/series` y `/animes`, que sirven
   * ordenados por fecha de alta. Su portada es tres veces mas pesada y trae lo
   * mismo en carruseles, asi que se leen los listados.
   */
  async fetchHome(domain, limit) {
    const mitad = Math.max(1, Math.ceil(limit / 2));
    const [pelis, series, animes] = await Promise.all([
      fetchText(`https://${domain}/peliculas`).catch(() => ''),
      fetchText(`https://${domain}/series`).catch(() => ''),
      fetchText(`https://${domain}/animes`).catch(() => ''),
    ]);

    const recorta = (html: string) =>
      parseTarjetas(html, domain)
        .slice(0, mitad)
        .map((r) => ({ ...r, note: 'Estreno' }));

    return entrelazar(entrelazar(recorta(pelis), recorta(series)), recorta(animes)).slice(0, limit);
  },

  /**
   * Genero por `/genero/<slug>`.
   *
   * El orden por defecto del sitio ("Mas populares") llena la primera pagina de
   * peliculas aunque el genero tenga series; pidiendo "Mas recientes" la mezcla
   * es real y el filtro por tipo de Miso tiene algo que filtrar. Los slugs del
   * catalogo de Miso coinciden con los del sitio (accion, belica, western...).
   */
  async fetchByGenre(domain, genre, kind, limit) {
    const url = `https://${domain}/genero/${encodeURIComponent(genre.slug)}?orden=${encodeURIComponent('Más recientes')}`;
    const html = await fetchText(url, { referer: `https://${domain}/` });
    const tarjetas = parseTarjetas(html, domain);
    const filtradas = kind ? tarjetas.filter((r) => r.kind === kind) : tarjetas;
    return filtradas.slice(0, limit);
  },
};

// ----------------------------------------------------------------------
// Busqueda (JSON del autocompletado)
// ----------------------------------------------------------------------

interface Sugerencia {
  type?: string;
  title?: string;
  year?: number | string;
  poster?: string | null;
  url?: string;
}

/** Tipo del autocompletado a tipo de Miso. `person` no es contenido. */
function tipoMedia(type: string): MediaKind | null {
  switch (cleanText(type).toLowerCase()) {
    case 'movie':
      return 'movie';
    case 'series':
      return 'series';
    case 'anime':
    case 'toon':
      return 'anime';
    default:
      return null;
  }
}

function parseSugerencias(body: string): SearchResult[] {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];

  const out: SearchResult[] = [];
  for (const item of data as Sugerencia[]) {
    const kind = tipoMedia(item.type ?? '');
    if (!kind) continue;
    const id = idDeUrl(item.url);
    if (!id || !/^(pelicula|serie)\//.test(id)) continue;

    const titulo = sinAnio(item.title);
    if (!titulo || isJunkTitle(titulo)) continue;

    const poster = cleanText(item.poster);
    out.push({
      id,
      source: 'sololatino',
      sourceLabel: 'sololatino',
      title: titulo,
      url: `https://sololatino.net/${id}`,
      poster: isMissingPoster(poster) ? null : poster,
      kind,
      year: item.year != null ? String(item.year) : extractYear(titulo),
      rating: null,
      episode: null,
      note: null,
    });
  }
  return dedupeResults(out);
}

// ----------------------------------------------------------------------
// Tarjetas de listado (inicio y genero)
// ----------------------------------------------------------------------

function parseTarjetas(html: string, _domain: string): SearchResult[] {
  const $ = cheerio.load(html);
  const out: SearchResult[] = [];

  $('.card').each((_, el) => {
    const $card = $(el);
    const href = cleanText($card.find('a[href]').first().attr('href'));
    const id = idDeUrl(href);
    if (!id || !/^(pelicula|serie)\//.test(id)) return;

    const img = $card.find('img').first();
    const titulo = sinAnio($card.find('.card__title').first().text()) || sinAnio(img.attr('alt'));
    if (!titulo || isJunkTitle(titulo)) return;

    const posterRaw = cleanText(img.attr('src') || img.attr('data-src'));
    const ratingRaw = cleanText($card.find('.card__rating').first().text()).replace(/[^\d.]/g, '');
    const claseBadge = $card.find('.card__badge').first().attr('class') ?? '';

    out.push({
      id,
      source: 'sololatino',
      sourceLabel: 'sololatino',
      title: titulo,
      url: `https://sololatino.net/${id}`,
      poster: isMissingPoster(posterRaw) ? null : posterRaw,
      kind: kindDeBadge(claseBadge, id),
      year: extractYear($card.find('.card__year').first().text()),
      rating: /^\d+(\.\d+)?$/.test(ratingRaw) ? ratingRaw : null,
      episode: null,
      note: null,
    });
  });

  return dedupeResults(out);
}

/** El tipo que declara la insignia; si no esta, se deduce de la ruta. */
function kindDeBadge(clase: string, id: string): MediaKind | null {
  if (/badge-(anime|toon)/.test(clase)) return 'anime';
  if (/badge-movie/.test(clase)) return 'movie';
  if (/badge-series/.test(clase)) return 'series';
  return id.startsWith('pelicula/') ? 'movie' : 'series';
}

// ----------------------------------------------------------------------
// Temporadas y capitulos
// ----------------------------------------------------------------------

const RE_CAPITULO = /\/serie\/[^/]+\/temporada-(\d+)\/episodio-(\d+)/;

function capitulosDe($: CheerioAPI): {
  seasons: SeasonInfo[];
  episodes: Map<number, EpisodeInfo[]>;
} {
  const porTemporada = new Map<number, EpisodeInfo[]>();

  $('a.ep-item[href]').each((_, el) => {
    const href = cleanText($(el).attr('href'));
    const m = href.match(RE_CAPITULO);
    if (!m) return;
    const season = Number(m[1]);
    const episode = Number(m[2]);
    if (!Number.isFinite(season) || !Number.isFinite(episode)) return;

    const titulo = cleanText($(el).find('p').not('.ep-num').first().text());
    const lista = porTemporada.get(season) ?? [];
    lista.push({
      season,
      episode,
      title: titulo || `Capítulo ${episode}`,
      airDate: null,
      runtime: null,
      available: true,
    });
    porTemporada.set(season, lista);
  });

  for (const lista of porTemporada.values()) lista.sort((a, b) => a.episode - b.episode);

  const seasons: SeasonInfo[] = [...porTemporada.keys()]
    .sort((a, b) => a - b)
    .map((season) => {
      const lista = porTemporada.get(season) ?? [];
      return {
        season,
        name: `Temporada ${season}`,
        first: lista[0]?.episode ?? 1,
        last: lista[lista.length - 1]?.episode ?? 0,
        poster: null,
      };
    });

  return { seasons, episodes: porTemporada };
}

// ----------------------------------------------------------------------
// Ayudas
// ----------------------------------------------------------------------

/** Ruta del titulo sin barra inicial: "pelicula/duna-2" o "serie/rick-y-morty". */
function idDeUrl(raw: string | undefined | null): string | null {
  const t = cleanText(raw);
  if (!t) return null;
  try {
    return new URL(t, 'https://sololatino.net').pathname.replace(/^\/+|\/+$/g, '') || null;
  } catch {
    return null;
  }
}

/** Ultimo segmento de la ruta, legible, como ultimo recurso de titulo. */
function slugLegible(id: string): string {
  return (id.split('/').pop() ?? id).replace(/-/g, ' ');
}

/** Absolutiza una URL de la ficha; null si no hay nada usable. */
function absoluta(raw: string | undefined | null, domain: string): string | null {
  const t = cleanText(raw);
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  return t.startsWith('/') ? `https://${domain}${t}` : `https://${domain}/${t}`;
}

interface FichaJsonLd {
  name?: string;
  description?: string;
  datePublished?: string;
  image?: string;
  rating?: string;
}

/**
 * Lee la ficha del JSON-LD del sitio.
 *
 * Es la via fiable aqui: `description` trae la sinopsis entera y `image` el
 * poster, sin depender de clases CSS que cambian. Devuelve null si no hay
 * bloque Movie/TVSeries.
 */
function datosJsonLd($: CheerioAPI): FichaJsonLd | null {
  let encontrado: FichaJsonLd | null = null;

  $('script[type="application/ld+json"]').each((_, el) => {
    if (encontrado) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse($(el).text());
    } catch {
      return;
    }
    const nodo = nodosJsonLd(parsed).find((n) => n['@type'] === 'Movie' || n['@type'] === 'TVSeries');
    if (!nodo) return;

    const imagen = nodo.image;
    const rating = nodo.aggregateRating?.ratingValue;
    encontrado = {
      name: typeof nodo.name === 'string' ? nodo.name : undefined,
      description: typeof nodo.description === 'string' ? nodo.description : undefined,
      datePublished: typeof nodo.datePublished === 'string' ? nodo.datePublished : undefined,
      image: leerImagen(imagen),
      rating: rating != null ? String(rating) : undefined,
    };
  });

  return encontrado;
}

function leerImagen(image: unknown): string | undefined {
  if (typeof image === 'string') return image;
  if (Array.isArray(image) && typeof image[0] === 'string') return image[0];
  if (image && typeof image === 'object') {
    const url = (image as { url?: unknown }).url;
    if (typeof url === 'string') return url;
  }
  return undefined;
}

interface NodoJsonLd {
  '@type'?: string;
  name?: string;
  description?: string;
  datePublished?: string;
  image?: unknown;
  aggregateRating?: { ratingValue?: number | string };
}

/** Aplana un JSON-LD con `@graph` en la lista de nodos. */
function nodosJsonLd(value: unknown): NodoJsonLd[] {
  if (!value || typeof value !== 'object') return [];
  const obj = value as { '@graph'?: unknown } & NodoJsonLd;
  if (Array.isArray(obj['@graph'])) {
    return obj['@graph'].filter((n): n is NodoJsonLd => !!n && typeof n === 'object');
  }
  return [obj];
}
