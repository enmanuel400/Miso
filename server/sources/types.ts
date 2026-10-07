/**
 * Tipos compartidos entre servidor y cliente web.
 * El servidor los exporta también por HTTP; aqui viven las definiciones.
 */

export type MediaKind = 'movie' | 'series' | 'anime';

/** Identificador corto y estable de una fuente. */
export type SourceId = string;

export interface SearchResult {
  /** Identificador unico dentro de la fuente (normalmente el slug de la URL). */
  id: string;
  source: SourceId;
  /** Nombre legible de la fuente: "pelisplushd", "cuevana", etc. */
  sourceLabel: string;
  title: string;
  /** URL absoluta de la pagina del titulo en la fuente original. */
  url: string;
  /** Poster absoluto. Puede venir de un CDN de terceros (necesita proxy). */
  poster: string | null;
  kind: MediaKind | null;
  year: string | null;
  rating: string | null;
  /**
   * Capitulo concreto al que apunta esta entrada, si lo es.
   *
   * Solo lo rellenan las fuentes que exponen capitulos sueltos (hoy cuevana, en
   * su listado de capitulos recientes). Sin esto, abrir una tarjeta de "lo mas
   * nuevo" llevaba a la serie entera y no al capitulo que la hizo aparecer, que
   * es justo lo que hace la web de origen.
   */
  episode: EpisodeRef | null;
  /**
   * Linea corta que explica por que esta entrada sale en el inicio.
   *
   * Es contexto, no etiqueta de depuracion: "T9E9 · Saluda a tus Morts" o
   * "Estreno". En la busqueda normal es null, porque ahi el titulo ya se
   * explica solo.
   */
  note: string | null;
}

/** Posicion dentro de una serie. */
export interface EpisodeRef {
  season: number;
  episode: number;
}

/**
 * Una temporada, con lo unico que hace falta para dibujarla.
 *
 * `first` y `last` van sueltos y no un `count` porque no siempre coinciden:
 * medido en cuevana, "Rick y Morty" declara diez capitulos en la temporada 9
 * pero solo nueve disponibles, y `last_episode` vale 9. Un `count` obligaria a
 * offering un capitulo que no existe.
 */
export interface SeasonInfo {
  season: number;
  name: string | null;
  /** Primer capitulo disponible. */
  first: number;
  /** Ultimo capitulo disponible. */
  last: number;
  poster: string | null;
}

export interface EpisodeInfo extends EpisodeRef {
  title: string | null;
  /** Fecha de emision, si la fuente la da. */
  airDate: string | null;
  /** Duracion en minutos, si la fuente la da. */
  runtime: number | null;
  /** false cuando la fuente no ofrece reproductores para este capitulo. */
  available: boolean;
}

/**
 * Temporadas de una serie y capitulos de la que se esta viendo.
 *
 * Solo vienen las temporadas en `episodes`. Es deliberado: el indice de
 * temporadas cabe siempre en unos pocos kilobytes, mientras que la lista de
 * capitulos de Rick y Morty son 91. Pedirla al abrir es una peticion de 5 kB y
 * 300 ms; pedirlas todas las nueve temporadas para que el usuario pueda saltar
 * de una a otra sin esperar son nueve peticiones por abrir un titulo, y encima
 * solo se usaria una.
 */
export interface SeriesIndex {
  seasons: SeasonInfo[];
  /** Capitulos de `season`. Vacio si no hay indice. */
  episodes: EpisodeInfo[];
  /** Temporada de la que vienen `episodes`. null si no se detailed ninguna. */
  season: number | null;
  /** Capitulo pedido o por defecto. */
  episode: EpisodeRef | null;
}

export interface SourceMeta {
  id: SourceId;
  label: string;
  /** Color de acento sugerido para la insignia de la fuente. */
  accent: string;
}

export type SourceStatus =
  | { state: 'ok'; count: number; ms: number }
  | { state: 'error'; message: string; ms: number }
  | { state: 'pending' };

export interface AggregatedSearch {
  query: string;
  results: SearchResult[];
  /** Estado por fuente, en el mismo orden que la consulta. */
  bySource: Record<SourceId, SourceStatus>;
  /** Milisegundos totales del fan-out. */
  totalMs: number;
}

/** Un servidor de reproduccion alternativos para un titulo. */
export interface PlaybackServer {
  id: string;
  label: string;
  /** URL del embed o del player, tal como la expone la fuente. */
  embedUrl: string;
  /** Cual de las tecnicas de extraccion produjo esta entrada. */
  method: string;
}

export interface TitleDetail {
  source: SourceId;
  id: string;
  title: string;
  url: string;
  poster: string | null;
  synopsis: string | null;
  year: string | null;
  kind: MediaKind | null;
  servers: PlaybackServer[];
  /**
   * Temporadas y capitulos, solo en series.
   *
   * Lo rellena `parseDetail` cuando cabe en la misma descarga, que es el caso de
   * pelisplushd: su pagina de serie ya trae las nueve pestañas de temporada y los
   * 91 enlaces de capitulo, asi que leerlos no cuesta nada. Cuando la fuente lo
   * tiene en otro endpoint, queda null y lo aporta `fetchEpisodes`.
   */
  episodes: SeriesIndex | null;
}

/**
 * Un stream listo para reproducir. Puede ser HLS (.m3u8), archivo directo
 * (.mp4) o un embed que solo se puede mostrar en iframe.
 */
export interface ResolvedStream {
  url: string;
  type: 'hls' | 'file' | 'embed';
  /** Como se obtuvo: 'static-base64' | 'network' | 'dom' | 'player-api'. */
  method: string;
  /** Duracion aproximada en segundos, si la fuente la expone. */
  durationSec: number | null;
  /** Texto de la etiqueta del servidor, si aplica. */
  serverLabel: string | null;
  /** true cuando el stream fue reescrito para pasar por nuestro proxy HLS. */
  proxied: boolean;
}