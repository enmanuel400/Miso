import type {
  AggregatedSearch,
  EpisodeRef,
  ResolvedStream,
  ServerStatus,
  SourceMeta,
  TitleResponse,
} from './types.js';

/**
 * Cliente HTTP del servidor local.
 *
 * Todas las rutas van relativas a proposito: la interfaz la sirve el propio
 * servidor, asi que siempre es del mismo origen y no hay ningun puerto que
 * descobrir ni que codificar en el bundle.
 */

/** Error con el mensaje que el servidor ya explico, para mostrarlo tal cual. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Traza de extraccion, cuando el fallo viene del servidor de video. */
    readonly trace: string[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { Accept: 'application/json', ...init?.headers },
    });
  } catch (err) {
    // Solo ocurre si el servidor esta caido, que en una app de escritorio
    // significa que se detuvo. El mensaje tiene que decirlo sin jerga.
    throw new ApiError(
      'No hay conexion con el servidor local. Quizá se detuvo.',
      0,
      [err instanceof Error ? err.message : String(err)],
    );
  }

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!res.ok) {
    const b = body as { error?: string; trace?: string[] } | null;
    throw new ApiError(b?.error ?? `El servidor respondio ${res.status}`, res.status, b?.trace ?? []);
  }

  return body as T;
}

export function search(query: string, signal: AbortSignal): Promise<AggregatedSearch> {
  return request<AggregatedSearch>(`/api/search?q=${encodeURIComponent(query)}`, { signal });
}

/**
 * Lo mas nuevo de cada fuente, para la pantalla de inicio.
 *
 * Devuelve la misma forma que `search`, con `query` vacio, para que el cliente
 * reuse la agrupacion y el recuento de fuentes sin tener dos caminos para pintar
 * lo mismo.
 */
export function home(signal: AbortSignal): Promise<AggregatedSearch> {
  return request<AggregatedSearch>('/api/home', { signal });
}

/**
 * Ficha y stream de un titulo, en un capitulo concreto.
 *
 * `pos` va en la consulta y no en el cuerpo porque es parte de la identidad de lo
 * que se pide: la misma serie en dos capitulos son dos respuestas distintas, y
 * por eso las lleva la URL y sobreviven a recargar y a compartir el enlace.
 */
export function title(
  source: string,
  id: string,
  signal: AbortSignal,
  pos?: EpisodeRef | null,
): Promise<TitleResponse> {
  const base = `/api/title/${encodeURIComponent(source)}/${id.split('/').map(encodeURIComponent).join('/')}`;
  const query =
    pos && Number.isInteger(pos.season) && Number.isInteger(pos.episode)
      ? `?season=${pos.season}&episode=${pos.episode}`
      : '';
  return request<TitleResponse>(base + query, { signal });
}

/**
 * Resuelve un servidor concreto hasta un stream.
 *
 * Es lo que usa el selector de servidores: el usuario elige otra opcion y solo
 * se pide esa, sin repetir todo el recorrido de las demas.
 */
export function resolve(
  embedUrl: string,
  referer: string,
  serverLabel: string,
  signal?: AbortSignal,
): Promise<{ stream: ResolvedStream | null; trace: string[] }> {
  return request('/api/resolve', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embedUrl, referer, serverLabel }),
  });
}

export function sources(): Promise<{ sources: SourceMeta[] }> {
  return request('/api/sources');
}

export function health(): Promise<{ ok: boolean; browser: boolean; memoryMB: number }> {
  return request('/api/health');
}

/** Pide reanudar el trabajo tras una suspension por inactividad. */
export function wake(): Promise<{ ok: boolean }> {
  return request('/api/health').then(() => ({ ok: true }));
}

export function shutdownServer(): Promise<{ ok: boolean }> {
  return request('/api/shutdown', { method: 'POST' });
}

/**
 * Estado del servidor para cuando no estamos dentro de Electron.
 *
 * En el navegador de desarrollo no hay proceso principal al que preguntar, asi
 * que se deduce del endpoint de salud. Solo sirve para no tener que bifurcar la
 * interfaz; la app de escritorio nunca pasa por aqui.
 */
export async function probeStatus(): Promise<ServerStatus> {
  try {
    await health();
    return {
      state: 'en-funcionamiento',
      port: null,
      pid: null,
      message: null,
      suspendInSec: null,
      stopInSec: null,
    };
  } catch {
    return {
      state: 'apagado',
      port: null,
      pid: null,
      message: null,
      suspendInSec: null,
      stopInSec: null,
    };
  }
}
