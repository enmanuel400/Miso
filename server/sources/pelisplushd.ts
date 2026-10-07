import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
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
import {
  cleanText,
  dedupeResults,
  entrelazar,
  extractYear,
  hostOf,
  indiceDeSerie,
  isJunkTitle,
  isMissingPoster,
  normalizeKind,
  primerCapitulo,
} from './shared.js';
import { fetchText } from '../http.js';

/**
 * pelisplushd.la
 *
 * Es la fuente mas normalizada de las dos: clases semanticas estables
 * (.Posters-link, .listing-content, .movies). Sirve ademas el tipo de medio
 * y la puntuacion en la propia tarjeta, lo que mejora la UI sin coste extra.
 *
 * IMPORTANTE: su HTML mezcla codificacion correcta y doblemente codificada
 * ("corazon" y "corazÃ³n" conviven). La reparacion se hace en server/http.ts,
 * antes de que el HTML llegue aqui.
 *
 * URL de busqueda: /search?s={termino}
 *
 * Y sobre series hay un detalle que condiciona todo el diseno: la pagina de la
 * serie NO contiene reproductores. Son las tarjetas de las temporadas, y cada
 * temporada lleva a un panel con un boton por capitulo. Los reproductores estan
 * en la pagina del capitulo. Medido sobre /serie/rick-y-morty:
 *
 *   <ul class="TbVideoNv nav nav-tabs">
 *     <a href=" #pills-vertical-3" class="nav-link">TEMPORADA 3</a>
 *   <div role="tabpanel" id="pills-vertical-3">
 *     <a href="/serie/rick-y-morty/temporada/3/capitulo/1">Rick y Morty 3x1</a>
 *
 * Por eso el detalle sale de la pagina de la serie y los servidores de la del
 * capitulo, que son dos descargas distintas. La buena noticia es que la primera
 * trae el indice de temporadas y los capitulos de todas ellas de regalo, asi que
 * el selector no cuesta ni una peticion extra.
 *
 * Los animes usan el mismo esquema con prefijo /anime/ en vez de /serie/
 * (medido en /anime/attack-on-titan: cinco paneles, 89 capitulos). Las peliculas
 * tienen el contenedor de temporadas pero vacio, sin un solo panel.
 */

/** Paginas de estrenos. Traen 24 posters cada una, con la misma forma que la busqueda. */
const ESTRENOS_PELICULAS = '/peliculas/estrenos';
const ESTRENOS_SERIES = '/series/estrenos';

/** Prefijos de ruta que son series o animes. Una pelicula nunca lo es. */
const RUTA_DE_SERIE = /^(serie|anime)\//;

/**
 * Nombres de hoster conocidos.
 *
 * Sirven para decidir de que campo fiarse cuando los dos existen y ninguno dice
 * claramente cual es el nombre del reproductor: `data-name` repite el audio del
 * grupo ("Subtitulado") mientras que el texto del enlace interior si trae el
 * hoster.
 */
const HOSTER_CONOCIDO =
  /^(voe|streamwish|vidhide|mixdrop|filemoon|mycloud|megacloud|okru|streamtape|abyss|okvod|waaw|netu|filelions|myflix|lumy|vidoza|mp4upload)/i;

/** Enlace de capitulo: /serie/{slug}/temporada/{N}/capitulo/{M} */
const RE_CAPITULO = /\/(?:serie|anime)\/[^/]+\/temporada\/(\d+)\/capitulo\/(\d+)/;

/**
 * Lee los servidores declarados en la pagina.
 *
 * Son dos layouts excluyentes, medidos sobre paginas reales:
 *
 *   Layout A, "carrera-de-bestias": 9 elementos con la URL en la propia
 *   pestana, ningun bloque link_url.
 *
 *     <li data-url="https://streamwish.to/e/..." data-name="streamwish">
 *
 *   Layout B, "shrek-tercero": la pestana solo lleva el numero y el nombre,
 *   y las URLs viven aparte, en un bloque que el JavaScript recorre.
 *
 *     <li role="presentation" data-id="2"><a href="#option2">streamwish</a></li>
 *     <div id="link_url"><span lid="2" url="https://streamwish.to/e/..."></span></div>
 *
 * Antes solo se leia A, y todo titulo de layout B devolvia cero servidores. No es
 * un fallo de la fuente ni del sitio: la pagina los declara igual, solo que en
 * otro sitio del HTML.
 *
 * Vive fuera de `parseDetail` porque se necesita en dos paginas distintas: la del
 * titulo y, en series, la del capitulo.
 */
function servidoresDe($: CheerioAPI): PlaybackServer[] {
  const servers: PlaybackServer[] = [];

  // El grupo de audio sale del .divseason de la cabecera del reproductor
  // ("Español Latino", "Subtitulado"). Es comun a los dos layouts.
  const groupText =
    cleanText($('a.divseason').first().attr('title')) || cleanText($('a.divseason').first().text());

  // --- Layout A: la URL esta en la propia pestana ------------------------
  $('li[data-url]').each((i, el) => {
    const $li = $(el);
    const embedUrl = cleanText($li.attr('data-url'));
    if (!embedUrl || !/^https?:\/\//i.test(embedUrl)) return;

    const inner = cleanText($li.find('a').first().text());
    const attr = cleanText($li.attr('data-name'));
    const name = HOSTER_CONOCIDO.test(inner)
      ? inner
      : HOSTER_CONOCIDO.test(attr)
        ? attr
        : inner || attr || `Servidor ${i + 1}`;

    servers.push({
      id: `phd-a${i}`,
      label: groupText ? `${groupText} · ${name}` : name,
      embedUrl,
      method: 'dom',
    });
  });

  // --- Layout B: las URLs viven en #link_url, unidas por numero ------------
  if (servers.length === 0) {
    // Nombre de cada numero de pestana: data-id -> texto del <a> interior.
    const nombres = new Map<string, string>();
    $('li[data-id]').each((_, el) => {
      const $li = $(el);
      const lid = cleanText($li.attr('data-id'));
      if (!lid) return;
      const nombre = cleanText($li.find('a').first().text());
      if (nombre) nombres.set(lid, nombre);
    });

    $('[id="link_url"] span[lid][url]').each((i, el) => {
      const $span = $(el);
      const embedUrl = cleanText($span.attr('url'));
      if (!embedUrl || !/^https?:\/\//i.test(embedUrl)) return;

      const lid = cleanText($span.attr('lid'));
      const name = nombres.get(lid) || hostOf(embedUrl);

      servers.push({
        id: `phd-b${i}`,
        label: groupText ? `${groupText} · ${name}` : name,
        embedUrl,
        method: 'dom',
      });
    });
  }

  return servers;
}

/**
 * Temporadas y capitulos de la pagina de una serie.
 *
 * Las dos cosas salen de la misma descarga y de las mismas marcas: las pestanas
 * nombran las temporadas y cada panel de temporada lleva un boton por capitulo.
 * Se leen por ruta, no por el texto del boton ("Rick y Morty 3x1"), porque el
 * texto es cosmetico y la ruta es lo que responde.
 *
 * Devuelve listas vacias en una pelicula: el contenedor de temporadas existe
 * tambien ahi, pero sin un solo panel dentro, y por eso la comprobacion es
 * "hay capitulos" y no "hay pestanas".
 */
function capitulosDe($: CheerioAPI): { seasons: SeasonInfo[]; episodes: Map<number, EpisodeInfo[]> } {
  const nombres = new Map<number, string>();

  $('ul.TbVideoNv a.nav-link').each((_, el) => {
    const texto = cleanText($(el).text());
    const m = texto.match(/temporada\s+(\d+)/i);
    if (!m) return;
    const n = Number(m[1]);
    // "TEMPORADA 3" se devuelve como "Temporada 3": es lo que pone el sitio y
    // esta vez con la caja con la que lo escribe el usuario.
    nombres.set(n, `Temporada ${n}`);
  });

  const porTemporada = new Map<number, EpisodeInfo[]>();

  $('div[role="tabpanel"][id^="pills-vertical-"]').each((_, el) => {
    const panel = Number(cleanText($(el).attr('id')).replace('pills-vertical-', ''));
    if (!Number.isFinite(panel)) return;

    $(el)
      .find('a[href]')
      .each((__, a) => {
        const href = cleanText($(a).attr('href'));
        const m = href.match(RE_CAPITULO);
        if (!m) return;
        const season = Number(m[1]);
        const episode = Number(m[2]);
        if (!Number.isFinite(season) || !Number.isFinite(episode)) return;

        const lista = porTemporada.get(season) ?? [];
        lista.push({
          season,
          episode,
          title: tituloDeCapitulo(cleanText($(a).text()), season, episode),
          airDate: null,
          runtime: null,
          available: true,
        });
        porTemporada.set(season, lista);
      });
  });

  const seasons: SeasonInfo[] = [...porTemporada.keys()]
    .sort((a, b) => a - b)
    .map((season) => {
      const lista = porTemporada.get(season) ?? [];
      const numeros = lista.map((e) => e.episode).sort((a, b) => a - b);
      return {
        season,
        name: nombres.get(season) ?? `Temporada ${season}`,
        first: numeros[0] ?? 1,
        last: numeros.at(-1) ?? 0,
        // Esta fuente no da cartel de temporada. Se deja null en vez de inventar
        // uno con el poster de la serie, que ensenaria lo mismo nueve veces.
        poster: null,
      };
    });

  for (const lista of porTemporada.values()) lista.sort((a, b) => a.episode - b.episode);

  return { seasons, episodes: porTemporada };
}

/**
 * Titulo del capitulo a partir del texto del boton.
 *
 * El boton dice "Rick y Morty 3x1", que es el titulo de la serie mas la
 * coordenada, no el nombre del capitulo. Es lo unico que hay: esta fuente no
 * expone los titulos, y las peliculas ya tienen bastante con encontrar el
 * servidor que funciona.
 */
function tituloDeCapitulo(texto: string, season: number, episode: number): string | null {
  const marca = new RegExp(`\\s${season}x${episode}\\s*$`, 'i');
  const limpio = texto.replace(marca, '').trim();
  return limpio || `Capítulo ${episode}`;
}

/** Filtra la lista de capitulos a una temporada y la ordena. */
function capitulosDeLaTemporada(
  porTemporada: Map<number, EpisodeInfo[]>,
  season: number,
): EpisodeInfo[] {
  return porTemporada.get(season) ?? [];
}

/** URL de la pagina de un capitulo, a partir del identificador de la serie. */
function urlDeCapitulo(domain: string, id: string, pos: EpisodeRef): string {
  return `https://${domain}/${id}/temporada/${pos.season}/capitulo/${pos.episode}`;
}

export const pelisplushd: SourceAdapter = {
  meta: {
    id: 'pelisplushd',
    label: 'pelisplushd',
    accent: '#4a9ee8',
  },

  domains: ['pelisplushd.la', 'pelisplushd.in'],

  searchUrl(domain, query) {
    return `https://${domain}/search?s=${encodeURIComponent(query.trim())}`;
  },

  parseResults(html, domain): SearchResult[] {
    const $ = cheerio.load(html);
    const out: SearchResult[] = [];

    // Cubre /pelicula/ y /serie/, y tambien las variantes con subcarpetas.
    $('a.Posters-link[href]').each((_, el) => {
      const $a = $(el);
      const href = cleanText($a.attr('href'));
      if (!href) return;

      const absolute = href.startsWith('http') ? href : `https://${domain}${href}`;
      const slug = absolute.replace(/^https?:\/\/[^/]+/, '').replace(/^\/|\/$/g, '');
      if (!slug) return;

      // El titulo limpio vive en .listing-content p; el data-title viene
      // inflado con "VER ... Online Gratis HD".
      const title =
        cleanText($a.find('.listing-content p').first().text()) ||
        cleanText($a.attr('data-title')).replace(/^VER\s+/i, '').replace(/\s+Online Gratis HD$/i, '');

      if (!title || isJunkTitle(title)) return;

      const img = $a.find('img').first();
      const rawPoster =
        img.attr('data-src') ?? img.attr('data-srcset')?.split(/\s+/)[0] ?? img.attr('src') ?? null;
      const poster = rawPoster && rawPoster.startsWith('/') ? `https://${domain}${rawPoster}` : rawPoster;

      const kindLabel = cleanText($a.find('.movies, .series, .movie-type').first().text());
      const kind: MediaKind | null = normalizeKind(kindLabel);

      // El tipo tambien se deduce de la propia ruta: /pelicula/ vs /serie/.
      const kindFromUrl: MediaKind | null = RUTA_DE_SERIE.test(slug)
        ? 'series'
        : /^\/?pelicula\//.test(slug)
          ? 'movie'
          : null;

      const ratingText = cleanText($a.find('.rating span').first().text());

      out.push({
        id: slug,
        source: 'pelisplushd',
        sourceLabel: 'pelisplushd',
        title,
        url: absolute,
        poster: isMissingPoster(poster) ? null : poster,
        kind: kind ?? kindFromUrl,
        year: extractYear(title) ?? null,
        rating: /^\d+(\.\d+)?\s*\/\s*10$/.test(ratingText) ? ratingText : null,
        episode: null,
        note: null,
      });
    });

    return dedupeResults(out);
  },

  /**
   * Pagina del reproductor.
   *
   * Con `pos` es la del capitulo, y es la que se usa como ultimo recurso cuando
   * ningun servidor declarado entrega video. Sin `pos` es la del titulo, que es
   * de donde salen el nombre, el cartel y el indice de capitulos.
   */
  playUrl(domain, id, pos) {
    if (pos && RUTA_DE_SERIE.test(id)) return urlDeCapitulo(domain, id, pos);
    return `https://${domain}/${id}`;
  },

  parseDetail(html, domain, id): TitleDetail {
    const $ = cheerio.load(html);

    const title =
      cleanText($('h1').first().text()) ||
      cleanText($('meta[property="og:title"]').attr('content')) ||
      id.split('/').pop()?.replace(/-/g, ' ') ||
      id;

    const img =
      $('meta[property="og:image"]').attr('content') ??
      $('img').first().attr('data-src') ??
      $('img').first().attr('src') ??
      null;
    const poster = img && img.startsWith('/') ? `https://${domain}${img}` : img;

    const synopsis =
      cleanText($('meta[name="description"]').attr('content')) ||
      cleanText($('.movie-description, .sinopsis, .description').first().text()) ||
      null;

    const { seasons, episodes } = capitulosDe($);
    const porDefecto = primerCapitulo(seasons);

    return {
      source: 'pelisplushd',
      id,
      title,
      url: `https://${domain}/${id}`,
      poster: isMissingPoster(poster) ? null : poster,
      synopsis,
      year: extractYear(title) ?? null,
      kind: normalizeKind($('.movie-type, .movies').first().text()) ?? (/serie|anime/.test(id) ? 'series' : 'movie'),
      // En una serie la pagina no declara reproductores: sale vacio a proposito,
      // y `fetchServers` va a por los del capitulo. Poner aqui la pagina entera
      // como si fuera un servidor haria que se probara el indice nueve veces.
      servers: seasons.length === 0 ? servidoresDe($) : [],
      episodes: indiceDeSerie(
        seasons,
        porDefecto ? capitulosDeLaTemporada(episodes, porDefecto.season) : [],
        porDefecto,
      ),
    };
  },

  /**
   * Los reproductores de un capitulo.
   *
   * Viven en la pagina del capitulo, no en la de la serie, asi que hay que
   * bajarla. Con una pelicula no hay nada que hacer: los servidores ya estaban
   * en el detalle y aqui solo se devolveria una lista vacia.
   */
  async fetchServers(domain, id, pos) {
    if (!pos || !RUTA_DE_SERIE.test(id)) return [];

    const html = await fetchText(urlDeCapitulo(domain, id, pos), {
      referer: `https://${domain}/${id}`,
      timeoutMs: 20_000,
    });
    return servidoresDe(cheerio.load(html));
  },

  /**
   * Los capitulos de una temporada.
   *
   * Esta fuente no tiene endpoint para esto: el mapa entero esta escrito en el
   * HTML de la pagina de la serie (las pestanas de temporada y, dentro de cada
   * una, un boton por capitulo). Asi que la unica forma de leer una temporada que
   * no sea la primera es volver a bajar esa misma pagina.
   *
   * Sale mas barato de lo que parece porque `resolveTitle` lo pide en paralelo
   * con los reproductores del capitulo, no antes. Medido: la pagina de la serie
   * tarda unos 400 ms y va en paralelo con la del capitulo, asi que abrir T3 no
   * cuesta mas que abrir T1.
   *
   * Con una pelicula no hay nada que leer: no hay capitulos y la respuesta es una
   * lista vacia, no un error.
   */
  async fetchEpisodes(domain, id, season) {
    if (!RUTA_DE_SERIE.test(id)) return [];

    const html = await fetchText(`https://${domain}/${id}`, {
      referer: `https://${domain}/`,
      timeoutMs: 20_000,
    });
    const { episodes } = capitulosDe(cheerio.load(html));
    return capitulosDeLaTemporada(episodes, season);
  },

  /**
   * Lo mas nuevo de la pagina: estrenos de peliculas y de series.
   *
   * Son dos paginas y se piden a la vez. Se entrelaza la mitad de cada una: un
   * solo bloque de doce peliculas seguido de doce series deja media pantalla con
   * un unico tipo de cosa, y en una rejilla de doce sitio se nota.
   */
  async fetchHome(domain, limit) {
    const mitad = Math.max(1, Math.ceil(limit / 2));

    const [peliculas, series] = await Promise.all([
      fetchText(`https://${domain}${ESTRENOS_PELICULAS}`, { timeoutMs: 12_000 }).catch(() => ''),
      fetchText(`https://${domain}${ESTRENOS_SERIES}`, { timeoutMs: 12_000 }).catch(() => ''),
    ]);

    const conNota = (html: string) =>
      this.parseResults(html, domain).map((r) => ({ ...r, note: 'Estreno' }));

    return entrelazar(conNota(peliculas).slice(0, mitad), conNota(series).slice(0, mitad)).slice(
      0,
      limit,
    );
  },
};
