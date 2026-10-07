import type { PlaybackServer } from '../sources/types.js';

/**
 * Extraccion estatica: todo lo que se puede leer del HTML sin ejecutar
 * Javascript. Es la tecnica mas barata (una peticion HTTP) y por eso se
 * intenta siempre la primera.
 */

/** Patrones de streams que aparecen literal en el HTML de la fuente. */
const STREAM_PATTERNS = [
  /https?:\/\/[^\s"'<>\\]+?\.m3u8(?:\?[^\s"'<>\\]*)?/gi,
  /https?:\/\/[^\s"'<>\\]+?\.mp4(?:\?[^\s"'<>\\]*)?/gi,
  // JW Player a veces publica el feed como JSON con la ruta dentro.
  /https?:\/\/[^\s"'<>\\]+?\/playlists\/[^\s"'<>\\]+?\.m8u8/gi,
];

const MEDIA_EXT = /\.m3u8(?:$|\?)/i;
const FILE_EXT = /\.(mp4|webm|m4v|mov)(?:$|\?)/i;

/** Dominios que sabemos que son reproductores intermedios, no el stream final. */
const KNOWN_EMBED_HOSTS = ['nupload.my', 'nupload.me'];

/**
 * Busca streams literales en un HTML.
 * `isFinal` distingue un .m3u8 real de un simple enlace a otro HTML.
 */
export function findLiteralStreams(html: string): PlaybackServer[] {
  const found = new Map<string, PlaybackServer>();
  let auto = 0;

  for (const pattern of STREAM_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of html.matchAll(pattern)) {
      const url = match[0];
      if (found.has(url)) continue;
      found.set(url, {
        id: `static-${auto++}`,
        label: 'Directo',
        embedUrl: url,
        method: 'static-literal',
      });
    }
  }

  return [...found.values()];
}

/** Descifra base64 tolerante; solo acepta el resultado si parece una URL. */
export function decodeBase64(value: string): string | null {
  try {
    let normalized = value.trim().replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4;
    if (padding) normalized += '='.repeat(4 - padding);
    const decoded = Buffer.from(normalized, 'base64').toString('utf8');
    return /^https?:\/\//i.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

/**
 * Extrae embeds codificados en base64 (`data-url="..."`), el patron que usa
 * pelisflix. Devuelve los embeds intermedios, que luego el navegador headless
 * tiene que Developar hasta el HLS final.
 */
export function findBase64Embeds(html: string): PlaybackServer[] {
  const out: PlaybackServer[] = [];
  const attrRe = /(?:data-url|data-embed|data-src-embed)\s*=\s*"([A-Za-z0-9+/=_\-]{24,})"/gi;

  let index = 0;
  for (const match of html.matchAll(attrRe)) {
    const decoded = decodeBase64(match[1]);
    if (!decoded) continue;
    out.push({
      id: `b64-${index++}`,
      label: `Servidor ${index}`,
      embedUrl: decoded,
      method: 'static-base64',
    });
  }
  return out;
}

/**
 * Clasifica una URL de embed en Reproductor intermedio o stream ya final.
 * Un `.m3u8` siempre es final; un `.mp4` tambien. Un HTML de otro dominio
 * es solo un embed y habra que Developarlo en navegador.
 */
export function classifyStream(url: string): 'hls' | 'file' | 'embed' {
  if (MEDIA_EXT.test(url)) return 'hls';
  if (FILE_EXT.test(url)) return 'file';
  return 'embed';
}

export function isEmbedHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return KNOWN_EMBED_HOSTS.includes(host);
  } catch {
    return false;
  }
}

/**
 * Ordena candidatos de extraccion por probabilidad de ser el stream real.
 * Un .m3u8 directo gana siempre; un embed de host conocido, no.
 */
export function rankCandidates(candidates: PlaybackServer[]): PlaybackServer[] {
  return [...candidates].sort((a, b) => {
    const score = (s: PlaybackServer) => {
      const kind = classifyStream(s.embedUrl);
      if (kind === 'hls') return 0;
      if (kind === 'file') return 1;
      if (isEmbedHost(s.embedUrl)) return 3;
      return 2;
    };
    return score(a) - score(b);
  });
}