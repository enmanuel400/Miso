import type { Request, Response } from 'express';
import { assertPublicUrl, ProxyBlockedError, upstreamHeaders } from './guard.js';
import { logEvent } from '../log.js';

/**
 * Proxy de streaming HLS.
 *
 * Es obligatorio, no una comodidad. Se comprobó que los CDN de video de estas
 * fuentes (playnixes.com, sv3.ibra.lat, hgplaycdn.com...) responden con 200
 * pero sin Access-Control-Allow-Origin, asi que el navegador bloquearía la
 * reproducción aunque la URL fuese correcta. Ademas hay CDNs que exigen un
 * Referer concreto.
 *
 * El proxy ademas reescribe el manifiesto para que los segmentos y las claves
 * de cifrado vuelvan a pasar por aqui, que es lo unico que permite eludir el
 * problema de origen sin tocar el navegador.
 */

const MANIFEST_RE = /\.m3u8(?:$|\?)/i;

/**
 * Registro a lo sumo una vez por segundo.
 *
 * Cuando un enlace caduca, el reproductor sigue pidiendo segmentos y todos
 * fallan con el mismo 403. Sin este tope, un corte a mitad de pelicula llenaria
 * el registro de miles de lineas identicas y taparia el resto.
 */
let ultimoRegistroHls = 0;
function registrar(host: string, path: string, mensaje: string): void {
  const ahora = Date.now();
  if (ahora - ultimoRegistroHls < 1000) return;
  ultimoRegistroHls = ahora;
  logEvent('hls', mensaje, `${host}${path}`);
}

/** Reconstruye una URL del proxy para un recurso del manifiesto. */
function proxyUrl(target: string, referer: string | null): string {
  const params = new URLSearchParams({ u: target });
  if (referer) params.set('ref', referer);
  return `/api/hls?${params.toString()}`;
}

function resolveRef(base: string, ref: string): string {
  try {
    return new URL(ref, base).toString();
  } catch {
    return ref;
  }
}

/**
 * Reescribe todas las referencias de un manifiesto para que pasen por el proxy.
 *
 * No basta con reescribir las lineas de segmentos: HLS tambien apunta a otros
 * recursos dentro de etiquetas, y saltarselos rompe la reproduccion.
 *   - #EXT-X-KEY   -> clave AES-128; sin reescribirla, el segmento no descifra
 *   - #EXT-X-MAP   -> fragmento inicial (fMP4); sin el, el video no arranca
 *   - #EXT-X-MEDIA-> playlists de audio o subtitulos alternativos
 */
export function rewriteManifest(
  manifest: string,
  baseUrl: string,
  referer: string | null,
): string {
  const lines = manifest.split(/\r?\n/);

  const out = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    // Etiquetas con URI embebida.
    if (trimmed.startsWith('#')) {
      if (!/URI\s*=/.test(trimmed)) return line;
      return line.replace(/URI\s*=\s*"([^"]+)"/g, (match, uri: string) => {
        if (/^https?:/i.test(uri) || uri.startsWith('data:')) return match;
        return `URI="${proxyUrl(resolveRef(baseUrl, uri), referer)}"`;
      });
    }

    // Linea de URI: un segmento o un manifiesto variante.
    if (/^https?:/i.test(trimmed)) return proxyUrl(trimmed, referer);
    return proxyUrl(resolveRef(baseUrl, trimmed), referer);
  });

  return out.join('\n');
}

export async function hlsProxy(req: Request, res: Response): Promise<void> {
  const raw = typeof req.query.u === 'string' ? req.query.u : '';
  const referer = typeof req.query.ref === 'string' ? req.query.ref : null;

  if (!raw) {
    res.status(400).json({ error: 'falta el parametro u' });
    return;
  }

  let target: URL;
  try {
    target = await assertPublicUrl(raw);
  } catch (err) {
    if (err instanceof ProxyBlockedError) {
      res.status(403).json({ error: err.message });
      return;
    }
    res.status(400).json({ error: 'URL invalida' });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);

  try {
    const upstream = await fetch(target, {
      headers: upstreamHeaders(referer),
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!upstream.ok) {
      registrar(target.host, target.pathname, `origen devolvio ${upstream.status}`);
      res.status(502).json({ error: `origen devolvio ${upstream.status}` });
      return;
    }

    // --- Segmento o archivo plano: lo servimos tal cual ------------------
    if (!MANIFEST_RE.test(target.pathname)) {
      const type = upstream.headers.get('content-type') || 'video/mp2t';
      res.setHeader('Content-Type', type);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      // Range: hls.js pide byte ranges en algunos reproductores.
      const range = req.headers.range;
      if (range) {
        res.status(206);
        const contentRange = upstream.headers.get('content-range');
        if (contentRange) res.setHeader('Content-Range', contentRange);
        const acceptRanges = upstream.headers.get('accept-ranges');
        if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
      } else {
        res.status(200);
      }
      const length = upstream.headers.get('content-length');
      if (length) res.setHeader('Content-Length', length);

      if (!upstream.body) {
        res.end();
        return;
      }
      // Node 18+ soportaReadableStream sobre web streams.
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.end(buf);
      return;
    }

    // --- Manifiesto: lo reescribimos ------------------------------------
    const text = await upstream.text();

    // Si el origen nos devuelve HTML en lugar de un manifiesto (tipico cuando
    // el enlace ha caducado o el origen ha recibido una reclamacion DMCA),
    // avisamos con codigo 502 y un mensaje legible en vez de pasarle HTML al
    // reproductor, que solo produciria un error de sintaxis incomprensible.
    if (/^\s*<(!doctype|html)/i.test(text)) {
      registrar(target.host, target.pathname, 'el origen devolvio HTML en vez de un manifiesto');
      res.status(502).json({ error: 'el origen no devolvio un manifiesto HLS', detail: 'posible enlace caducado' });
      return;
    }

    const rewritten = rewriteManifest(text, target.toString(), referer);
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-store');
    res.send(rewritten);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      registrar(target.host, target.pathname, 'el origen tardo mas de 25 s');
      res.status(504).json({ error: 'el origen tardo demasiado' });
      return;
    }
    registrar(target.host, target.pathname, `fallo al traer el recurso: ${err instanceof Error ? err.message : String(err)}`);
    res.status(502).json({
      error: 'fallo al traer el recurso',
      detail: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearTimeout(timer);
  }
}