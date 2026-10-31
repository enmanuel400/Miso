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
  extractYear,
  hostOf,
  indiceDeSerie,
  isJunkTitle,
  isMissingPoster,
  primerCapitulo,
  sinopsisUtil,
} from './shared.js';
import { fetchText } from '../http.js';

function absoluteUrl(href: string, domain: string): string | null {
  const t = cleanText(href);
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  return t.startsWith('/') ? `https://${domain}${t}` : `https://${domain}/${t}`;
}

function getKindFromUrl(id: string): MediaKind | null {
  if (id.startsWith('serie/')) return 'series';
  if (id.startsWith('pelicula/')) return 'movie';
  return null;
}

export const pelispedia: SourceAdapter = {
  meta: {
    id: 'pelispedia',
    label: 'Pelispedia',
    accent: '#1caddd',
  },

  domains: ['pelispedia.mov'],

  searchUrl(domain, query) {
    return `https://${domain}/?s=${encodeURIComponent(query.trim())}`;
  },

  parseResults(html, domain): SearchResult[] {
    const $ = cheerio.load(html);
    const out: SearchResult[] = [];

    $('a[href*="/pelicula/"], a[href*="/serie/"]').each((_, el) => {
      const $a = $(el);
      const href = cleanText($a.attr('href'));
      if (!href) return;

      const absolute = absoluteUrl(href, domain);
      if (!absolute) return;

      let slug = absolute.replace(/^https?:\/\/[^/]+/, '').replace(/^\/|\/$/g, '');
      if (!slug || !(slug.startsWith('pelicula/') || slug.startsWith('serie/'))) return;

      // Skip links with anchors like #s1-e1
      if (slug.includes('#')) return;

      const title =
        cleanText($a.find('.title, .card-title, h3, h4').first().text()) ||
        cleanText($a.attr('title')) ||
        cleanText($a.find('img').first().attr('alt')) ||
        slug.split('/').pop()?.replace(/-/g, ' ') ||
        '';

      if (!title || isJunkTitle(title)) return;

      const img = $a.find('img').first();
      let poster = img.attr('data-src') ?? img.attr('src') ?? img.attr('data-lazy-src') ?? null;
      if (poster && poster.startsWith('/')) poster = `https://${domain}${poster}`;

      const kind = getKindFromUrl(slug);

      out.push({
        id: slug,
        source: 'pelispedia',
        sourceLabel: 'Pelispedia',
        title,
        url: absolute,
        poster: isMissingPoster(poster) ? null : poster,
        kind,
        year: extractYear(title) ?? null,
        rating: null,
        episode: null,
        note: null,
      });
    });

    return dedupeResults(out);
  },

  playUrl(domain, id, pos) {
    if (pos && id.startsWith('serie/')) {
      return `https://${domain}/${id}#s${pos.season}-e${pos.episode}`;
    }
    return `https://${domain}/${id}`;
  },

  parseDetail(html, domain, id): TitleDetail {
    const $ = cheerio.load(html);

    const title =
      cleanText($('h1').first().text()) ||
      cleanText($('meta[property="og:title"]').attr('content')) ||
      id.split('/').pop()?.replace(/-/g, ' ') ||
      id;

    let poster =
      $('meta[property="og:image"]').attr('content') ||
      $('img.poster, .cover img').first().attr('src') ||
      $('img').first().attr('src') ||
      null;
    if (poster && poster.startsWith('/')) poster = `https://${domain}${poster}`;

    const synopsis =
      sinopsisUtil($('meta[property="og:description"]').attr('content')) ||
      sinopsisUtil($('meta[name="description"]').attr('content')) ||
      sinopsisUtil($('.description, .sinopsis, .plot').first().text());

    const seasons: SeasonInfo[] = [];
    const episodesMap = new Map<number, EpisodeInfo[]>();

    if (id.startsWith('serie/')) {
      $('button[data-season-toggle]').each((_, el) => {
        const seasonIndex = Number($(el).attr('data-season-index'));
        if (!Number.isFinite(seasonIndex)) return;
        const seasonNum = seasonIndex + 1;

        if (!seasons.find(s => s.season === seasonNum)) {
          seasons.push({
            season: seasonNum,
            name: `Temporada ${seasonNum}`,
            first: 1,
            last: 0,
            poster: null,
          });
        }

        $(`#season-${seasonIndex} a[data-season][data-episode]`).each((__, a) => {
          const epSeason = Number($(a).attr('data-season'));
          const epNum = Number($(a).attr('data-episode'));
          if (!Number.isFinite(epSeason) || !Number.isFinite(epNum)) return;

          const lista = episodesMap.get(epSeason) ?? [];
          lista.push({
            season: epSeason,
            episode: epNum,
            title: `Capítulo ${epNum}`,
            airDate: null,
            runtime: null,
            available: true,
          });
          episodesMap.set(epSeason, lista);
        });
      });

      for (const [s, list] of episodesMap) {
        list.sort((a, b) => a.episode - b.episode);
        const seasonInfo = seasons.find(x => x.season === s);
        if (seasonInfo) {
          seasonInfo.first = list[0]?.episode ?? 1;
          seasonInfo.last = list[list.length - 1]?.episode ?? 0;
        }
      }
      seasons.sort((a, b) => a.season - b.season);
    }

    const porDefecto = primerCapitulo(seasons);
    const capitulos = porDefecto ? (episodesMap.get(porDefecto.season) ?? []) : [];

    return {
      source: 'pelispedia',
      id,
      title,
      url: `https://${domain}/${id}`,
      poster: isMissingPoster(poster) ? null : poster,
      synopsis,
      year: extractYear(title) ?? null,
      kind: getKindFromUrl(id),
      servers: [],
      episodes: id.startsWith('serie/') && seasons.length > 0 ? indiceDeSerie(seasons, capitulos, porDefecto) : null,
    };
  },

  async fetchServers(domain, id, pos) {
    const pageUrl = this.playUrl(domain, id, pos ?? null);
    let html = await fetchText(pageUrl, { referer: `https://${domain}/` });

    // Buscar iframe con vidurl
    const $ = cheerio.load(html);
    let vidUrl: string | null = null;
    $('iframe').each((_, el) => {
      const src = $(el).attr('src') || '';
      if (src.includes('/vidurl/')) {
        vidUrl = src.startsWith('http') ? src : `https://${domain}${src}`;
      }
    });

    if (!vidUrl) {
      // Buscar en el HTML
      const match = html.match(/\/vidurl\/[^"']+/);
      if (match) {
        vidUrl = match[0].startsWith('http') ? match[0] : `https://${domain}${match[0]}`;
      }
    }

    if (!vidUrl) return [];

    try {
      const vidHtml = await fetchText(vidUrl, { referer: pageUrl });
      const $2 = cheerio.load(vidHtml);
      
      // Buscar dataLink con servidores
      const match = vidHtml.match(/let dataLink = (\[.*?\]);/s);
      if (match) {
        try {
          // Intentar parsear - aunque está cifrado, algunos servidores pueden estar disponibles
          // Por ahora devolvemos el iframe vidurl como servidor
          return [{
            id: 'pelispedia-1',
            label: 'Reproductor',
            embedUrl: vidUrl,
            method: 'dom',
          }];
        } catch {}
      }
    } catch {}

    return [{
      id: 'pelispedia-1',
      label: 'Reproductor',
      embedUrl: vidUrl,
      method: 'dom',
    }];
  },

  async fetchEpisodes(domain, id, season) {
    if (!id.startsWith('serie/')) return [];
    const html = await fetchText(`https://${domain}/${id}`, { referer: `https://${domain}/` });
    const $ = cheerio.load(html);
    const episodes: EpisodeInfo[] = [];
    
    const seasonIndex = season - 1;
    $(`#season-${seasonIndex} a[data-season][data-episode]`).each((_, a) => {
      const epSeason = Number($(a).attr('data-season'));
      const epNum = Number($(a).attr('data-episode'));
      if (!Number.isFinite(epSeason) || !Number.isFinite(epNum)) return;
      if (epSeason !== season) return;

      episodes.push({
        season: epSeason,
        episode: epNum,
        title: `Capítulo ${epNum}`,
        airDate: null,
        runtime: null,
        available: true,
      });
    });

    episodes.sort((a, b) => a.episode - b.episode);
    return episodes;
  },

  async fetchHome(domain, limit) {
    const html = await fetchText(`https://${domain}/`, { timeoutMs: 15_000 }).catch(() => '');
    const results = this.parseResults(html, domain).slice(0, limit);
    return results;
  },

  async fetchByGenre(domain, genre) {
    const url = `https://${domain}/peliculas?genero=${encodeURIComponent(genre.slug)}`;
    const html = await fetchText(url, { referer: `https://${domain}/`, timeoutMs: 15_000 }).catch(() => '');
    return this.parseResults(html, domain);
  },
};
