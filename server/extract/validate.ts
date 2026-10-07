import { fetchText, HttpError } from '../http.js';
import type { ResolvedStream } from '../sources/types.js';

/**
 * Validacion de un stream HLS antes de ofrecerlo al reproductor.
 *
 * Durante el desarrollo se describio un caso real: algunos servidores de estas
 * fuentes responden con HTTP 200 y un manifiesto HLS perfectamente formado,
 * pero TODOS sus segmentos son imagenes de anuncio servidas por una red de
 * publicidad (tiktokcdn y similares). El reproductor lo acepta como valido y
 * se queda en negro sin explicar por que.
 *
 * Comprobando el manifiesto detectamos ese caso en menos de un segundo, nos
 * saltamos ese servidor y probamos el siguiente. Sin esto el usuario ve un
 * reproductor congelado y no sabe si fallo Miso o el servidor esta muerto.
 */

/** Hosts que solo sirven material publicitario, jamas video. */
const AD_HOSTS = [
  'tiktokcdn.com',
  'p19-ad-site-sign-sg.tiktokcdn.com',
  'p16-ad-site-sign-sg.tiktokcdn.com',
  'doubleclick.net',
  'googlesyndication.com',
  'adservice.google.com',
  'popads.net',
  'propellerads.com',
  'adsterra.com',
  'hilltopads.net',
  'onclickalgo.com',
  'exoclick.com',
  'unionads.net',
  'bannersdr.com',
  'trafficjunky.net',
];

/** MPEG-TS empieza con el byte de sincronizacion 0x47. */
const TS_MAGIC = 0x47;
/** fMP4 empieza con una caja 'ftyp' o 'styp', y los segmentos con 'moof'. */
const MP4_BOXES = ['ftyp', 'styp', 'moof'];

function isAdHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return AD_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

function isManifestUrl(url: string): boolean {
  try {
    return /\.m3u8(?:$|\?)/i.test(new URL(url, 'https://placeholder.invalid').pathname);
  } catch {
    return /\.m3u8(?:$|\?)/i.test(url);
  }
}

export interface StreamValidation {
  ok: boolean;
  /**
   * Motivo corto y legible, el que va a la interfaz.
   *
   * Nunca lleva la URL. Estas direcciones vienen firmadas y con caducidad
   * (?t=...&s=...&e=...), asi que copiarlas a la pantalla del usuario no aporta
   * nada y expone un token. El detalle tecnico va en `detail`.
   */
  reason: string | null;
  /** Detalle tecnico con la URL y el error crudo, solo para la traza. */
  detail: string | null;
  /** Segmentos inspeccionados, para diagnostico. */
  sampled: number;
}

/**
 * Traduce un fallo de descarga a una frase corta.
 *
 * Se distingue el 404 porque es el unico caso donde la accion util es cambiar
 * de servidor con certeza; el resto se resume como "no respondio".
 */
function briefFetchFailure(err: unknown): string {
  const status = err instanceof HttpError ? err.status : 0;
  if (status === 404 || status === 410) return 'ese servidor ya no existe';
  if (status === 403 || status === 401) return 'ese servidor no deja entrar';
  if (status >= 500) return 'ese servidor está teniendo problemas';
  return 'ese servidor no respondio';
}

/** Detalle tecnico de un fallo de descarga, con la URL y el error original. */
function detailFetchFailure(err: unknown, url: string): string {
  return `${err instanceof Error ? err.message : String(err)} (${url})`;
}

/**
 * Recorre un manifiesto y baja por las listas variantes hasta los segmentos.
 *
 * Sin esto, el primer URI de un manifiesto maestro es OTRO manifiesto
 * (index-v1-a1.m3u8), no un segmento. Al descargarlo obteniamos texto
 * empezando por '#EXTM3U' (byte 0x23) y lo interpretabamos como un segmento
 * invalido, rechazando streams que si funcionaban.
 */
async function collectSegments(
  manifestUrl: string,
  referer: string | undefined,
  maxDepth = 3,
): Promise<string[]> {
  const text = await fetchText(manifestUrl, { referer, timeoutMs: 12_000 });
  if (/^\s*<(!doctype|html)/i.test(text)) return [];

  const uris = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      try {
        return new URL(l, manifestUrl).toString();
      } catch {
        return l;
      }
    });

  if (uris.length === 0) return [];

  // Si el primer elemento sigue siendo un manifiesto, hay que bajar un nivel.
  if (maxDepth > 1 && isManifestUrl(uris[0])) {
    try {
      const nested = await collectSegments(uris[0], referer, maxDepth - 1);
      if (nested.length > 0) return nested;
    } catch {
      // Si no se puede bajar seguimos con lo que ya tenemos.
    }
  }

  return uris;
}

/**
 * Valida que un HLS contiene video real y no solo anuncios.
 *
 * Estrategia de menor a mayor coste:
 *  1. El origen no devuelve un manifiesto (viene HTML) -> invalido
 *  2. Los segmentos apuntan a una red de publicidad     -> invalido
 *  3. El primer segmento no tiene firma de video        -> invalido
 */
export async function validateHls(url: string, referer?: string): Promise<StreamValidation> {
  // 1. ¿Es siquiera un manifiesto?
  let head: string;
  try {
    head = await fetchText(url, { referer, timeoutMs: 12_000 });
  } catch (err) {
    return {
      ok: false,
      reason: briefFetchFailure(err),
      detail: `no se pudo descargar el manifiesto: ${detailFetchFailure(err, url)}`,
      sampled: 0,
    };
  }

  if (/^\s*<(!doctype|html)/i.test(head)) {
    return {
      ok: false,
      reason: 'el origen devolvió una página web en lugar de un vídeo',
      detail: 'la respuesta empieza por una etiqueta HTML, no por #EXTM3U',
      sampled: 0,
    };
  }
  if (!/^\s*#EXTM3U/.test(head)) {
    return {
      ok: false,
      reason: 'el origen no devolvió una lista de reproducción',
      detail: `la respuesta no empieza por #EXTM3U (${head.slice(0, 80)})`,
      sampled: 0,
    };
  }

  // 2. Bajamos hasta los segmentos reales.
  let uris: string[];
  try {
    uris = await collectSegments(url, referer);
  } catch (err) {
    return {
      ok: false,
      reason: 'no se pudo leer la lista de segmentos',
      detail: `no se pudo recorrer el manifiesto: ${detailFetchFailure(err, url)}`,
      sampled: 0,
    };
  }

  if (uris.length === 0) {
    return {
      ok: false,
      reason: 'la lista de reproducción está vacía',
      detail: 'el manifiesto no contiene ninguna linea de segment',
      sampled: 0,
    };
  }

  // 3. ¿Apuntan a una red de publicidad?
  const adSegments = uris.filter(isAdHost);
  if (adSegments.length === uris.length) {
    return {
      ok: false,
      reason: 'solo entrega anuncios, no vídeo',
      detail: `los ${uris.length} segmentos son anuncios de ${new URL(uris[0]).hostname}`,
      sampled: uris.length,
    };
  }
  if (adSegments.length > 0) {
    return {
      ok: false,
      reason: `mezcla anuncios y vídeo (${adSegments.length} de ${uris.length})`,
      detail: `redes de publicidad en ${adSegments.length}/${uris.length} segmentos`,
      sampled: uris.length,
    };
  }

  // 4. El primer segmento deberia empezar con firma MPEG-TS o ser fMP4.
  try {
    const res = await fetch(uris[0], {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        ...(referer ? { Referer: referer } : {}),
      },
      signal: AbortSignal.timeout(12_000),
    });
    const buf = Buffer.from(await res.arrayBuffer());

    if (buf.byteLength < 100) {
      return {
        ok: false,
        reason: 'el primer segmento llegó vacío',
        detail: `el segmento inicial solo tiene ${buf.byteLength} bytes`,
        sampled: uris.length,
      };
    }

    const first = buf[0];
    const looksTs = first === TS_MAGIC;
    const looksMp4 = MP4_BOXES.some((b) =>
      buf.subarray(4, 4 + b.length).toString('latin1').includes(b),
    );

    if (!looksTs && !looksMp4) {
      return {
        ok: false,
        reason: 'lo que envía no es un vídeo',
        detail: `el primer segmento no tiene firma MPEG-TS ni fMP4 (byte 0x${first.toString(16)})`,
        sampled: uris.length,
      };
    }
  } catch {
    // Si no se puede inspeccionar el segmento no lo invalidamos: puede ser un
    // problema de red puntual, no un stream muerto.
  }

  return { ok: true, reason: null, detail: null, sampled: uris.length };
}

/**
 * Valida un stream resuelto. Solo aplica a HLS; los ficheros directos y los
 * embeds se aceptan tal cual porque no hay forma barata de inspeccionarlos.
 */
export async function validateStream(
  stream: ResolvedStream | null,
  referer?: string,
): Promise<{ stream: ResolvedStream | null; invalidReason: string | null }> {
  if (!stream) return { stream: null, invalidReason: 'no se resolvio ningun stream' };
  if (stream.type !== 'hls') return { stream, invalidReason: null };

  const validation = await validateHls(stream.url, referer);
  return validation.ok
    ? { stream, invalidReason: null }
    : { stream: null, invalidReason: validation.reason };
}