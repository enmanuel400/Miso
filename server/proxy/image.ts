import type { Request, Response } from 'express';
import { assertPublicUrl, ProxyBlockedError, upstreamHeaders } from './guard.js';

/**
 * Proxy de imagenes.
 *
 * No es opcional: los posters viven en CDNs como cnddim.xyz que responden 200
 * pero SIN Access-Control-Allow-Origin. El navegador los bloquearia, asi que
 * el servidor los pide y los sirve de su propio origen.
 */

export async function imageProxy(req: Request, res: Response): Promise<void> {
  const raw = typeof req.query.u === 'string' ? req.query.u : '';
  if (!raw) {
    res.status(400).json({ error: 'falta el parametro u' });
    return;
  }

  try {
    const url = await assertPublicUrl(raw);
    const upstream = await fetch(url, {
      headers: upstreamHeaders(typeof req.query.ref === 'string' ? req.query.ref : null),
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    });

    if (!upstream.ok) {
      res.status(502).json({ error: `origen devolvio ${upstream.status}` });
      return;
    }

    const type = upstream.headers.get('content-type') || 'image/jpeg';
    if (!type.startsWith('image/')) {
      // Si el origen no es una imagen no la sirvamos: este endpoint existe
      // para posters, no para bajar ficheros arbitrarios.
      res.status(415).json({ error: 'el origen no es una imagen' });
      return;
    }

    const body = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.setHeader('Content-Length', String(body.byteLength));
    res.end(body);
  } catch (err) {
    if (err instanceof ProxyBlockedError) {
      res.status(403).json({ error: err.message });
      return;
    }
    // Un poster roto no debe romper la interfaz: devolvemos 204 y la tarjeta
    // dibuja su marcador de posicion.
    res.status(204).end();
  }
}

/**
 * Construye una URL del proxy de imagenes lista para usar en un <img>.
 * Si la URL ya es local o no es http, se devuelve sin tocar.
 */
export function imageProxyUrl(src: string | null | undefined, referer?: string): string | null {
  if (!src || !/^https?:\/\//i.test(src)) return null;
  const params = new URLSearchParams({ u: src });
  if (referer) params.set('ref', referer);
  return `/api/img?${params.toString()}`;
}