/**
 * Tipos compartidos entre servidor y cliente web.
 * El servidor los exporta también por HTTP; aqui viven las definiciones.
 */

export type MediaKind = 'movie' | 'series' | 'anime';

/** Identificador corto y estable de una fuente. */
export type SourceId = string;

/**
 * Un genero del catalogo.
 *
 * Las fuentes lo piden de dos maneras distintas: las de API (cuevana, lamovie)
 * buscan por el **nombre** exacto de la taxonomia ("Acción"), mientras que
 * pelisplushd usa un **slug** en su URL (/generos/accion). El catalogo vive una
 * sola vez y lleva las dos formas, para que cada adaptador use la suya sin que
 * la interfaz tenga que saber de ninguna.
 */
export interface Genre {
  /** Nombre canonico, tal y como lo espera la API de WordPress. */
  name: string;
  /** Slug en minusculas para las fuentes de HTML. */
  slug: string;
}

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
   * Sinopsis corta, cuando la fuente la trae ya en el listado.
   *
   * Solo la rellenan las fuentes de API (cuevana/lamovie devuelven `overview` en
   * la busqueda). Las de HTML no la exponen ahi, y la interfaz no la usa en la
   * tarjeta: la sinopsis se lee al abrir el titulo, donde va entera.
   */
  synopsis?: string | null;
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

/**
 * Una fuente con su estado de activacion, para la pantalla de ajustes.
 *
 * `enabled` no forma parte de `SourceMeta` a proposito: el adaptador describe la
 * fuente (id, etiqueta, color), mientras que activarla o no es un ajuste del
 * usuario que decide el servidor en tiempo de ejecucion.
 */
export interface SourceInfo extends SourceMeta {
  enabled: boolean;
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

/**
 * Un titulo unificado, con una entrada por fuente disponible.
 *
 * El mismo nombre aparece en varias fuentes con mucha frecuencia: se midio 23
 * veces sobre 68 resultados de la busqueda "bestia". Mostrarlo tres veces con
 * el mismo cartel solo cambia la insignia de fuente y hace la pantalla mas
 * pobre de lo que es, asi que se agrupa y se muestran todas las fuentes
 * disponibles en la misma tarjeta.
 *
 * Vive aqui, y no solo en el cliente, porque el historial y los favoritos lo
 * guardan tal cual en disco: guardar la tarjeta entera permite reabrir un titulo
 * sin volver a pegarle a las fuentes.
 */
export interface TitleCard {
  /** Clave estable para React, derivada de las entradas agrupadas. */
  key: string;
  title: string;
  poster: string | null;
  kind: SearchResult['kind'];
  year: string | null;
  rating: string | null;
  /** Sinopsis corta, si alguna de las entradas la trae. */
  synopsis?: string | null;
  /** Una entrada por fuente, en el orden en que las devolvio la busqueda. */
  entries: SearchResult[];
  /**
   * Linea de contexto de la entrada agrupada, si alguna la traia.
   *
   * Solo aparece en la pantalla de inicio, donde las entradas no se han buscado
   * por su nombre y hace falta decir por que estan ahi: "T9E9 · Saluda a tus
   * Morts" en un capitulo que se acaba de emitir, "Estreno" en una pelicula. En
   * la busqueda es null, porque ahi el titulo ya se explica solo.
   */
  note: string | null;
}

/**
 * Un titulo guardado: historial o favoritos.
 *
 * Guarda la tarjeta entera para poder pintarla y reabrirla sin volver a
 * consultar las fuentes. Los identificadores de las fuentes cambian con el
 * tiempo, asi que un guardado puede caducar; por eso el titulo y el cartel
 * viajan dentro y la pantalla sigue teniendo algo que mostrar.
 */
export interface SavedTitle {
  /** Clave de la tarjeta agrupada, la misma que usa la rejilla. */
  key: string;
  card: TitleCard;
  /** Cuando se vio (historial) o se marco (favoritos), en ms. */
  at: number;
  /** Ultimo capitulo visto, en series. Null en peliculas. */
  last: EpisodeRef | null;
  /**
   * Donde se dejo la reproduccion, para reanudar sin tantear.
   *
   * `seconds` es el minuto exacto en el que iba y `duration` la duracion total
   * si la fuente la conocia. Ausente en un guardado viejo o en un titulo que
   * solo se abrio sin llegar a reproducir: en ese caso se empieza desde cero,
   * que es lo que el usuario espera y no un fallo.
   */
  progress?: PlaybackProgress | null;
}

/** Posicion de reproduccion guardada en el historial. */
export interface PlaybackProgress {
  /** Segundo en el que iba la ultima vez. */
  seconds: number;
  /** Duracion total en segundos, si el reproductor la conocia. */
  duration: number | null;
}