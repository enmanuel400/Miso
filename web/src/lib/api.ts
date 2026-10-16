import type {
  AggregatedSearch,
  EpisodeRef,
  Genre,
  ResolvedStream,
  SavedTitle,
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
  preferServer?: string | null,
): Promise<TitleResponse> {
  const base = `/api/title/${encodeURIComponent(source)}/${id.split('/').map(encodeURIComponent).join('/')}`;
  const params = new URLSearchParams();
  if (pos && Number.isInteger(pos.season) && Number.isInteger(pos.episode)) {
    params.set('season', String(pos.season));
    params.set('episode', String(pos.episode));
  }
  if (preferServer) params.set('prefer', preferServer);
  const query = params.toString() ? `?${params.toString()}` : '';
  return request<TitleResponse>(base + query, { signal });
}

/**
 * Reporta un fallo del reproductor al registro del servidor.
 *
 * Es "dispara y olvida" a proposito: si el servidor no esta o la peticion falla,
 * el problema original sigue siendo el que importa. Nunca lanza.
 */
export function report(scope: string, message: string, detail?: string): void {
  try {
    void fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope, message, detail: detail ?? null }),
    }).catch(() => undefined);
  } catch {
    /* el diagnostico no puede romper la reproduccion */
  }
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

// -------------------------------------------------------------------- generos

/** El catalogo de generos. No toca las fuentes: es fijo. */
export function genres(): Promise<{ genres: Genre[] }> {
  return request('/api/genres');
}

/** Un genero federado, con el filtro opcional por tipo. */
export function byGenre(
  genero: Genre,
  kind: 'movie' | 'series' | 'anime' | null,
  signal: AbortSignal,
): Promise<AggregatedSearch> {
  const params = new URLSearchParams({ g: genero.name });
  if (kind) params.set('kind', kind);
  return request<AggregatedSearch>(`/api/genre?${params.toString()}`, { signal });
}

// ------------------------------------------------------------------ biblioteca

export function getLibrary(signal?: AbortSignal): Promise<{
  history: SavedTitle[];
  favorites: SavedTitle[];
}> {
  return request('/api/library', { signal });
}

export function pushHistory(entry: SavedTitle): Promise<{ history: SavedTitle[] }> {
  return request('/api/library/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
}

/** Olvida una entrada, o todo el historial si no se da clave. */
export function dropHistory(key?: string): Promise<{ history: SavedTitle[] }> {
  const suffix = key ? `?key=${encodeURIComponent(key)}` : '';
  return request(`/api/library/history${suffix}`, { method: 'DELETE' });
}

export function favorite(entry: SavedTitle): Promise<{
  favorited: boolean;
  favorites: SavedTitle[];
}> {
  return request('/api/library/favorites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
}

export function health(): Promise<{ ok: boolean; browser: boolean; memoryMB: number }> {
  return request('/api/health');
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
    return { state: 'en-funcionamiento', port: null, pid: null, message: null };
  } catch {
    return { state: 'apagado', port: null, pid: null, message: null };
  }
}
