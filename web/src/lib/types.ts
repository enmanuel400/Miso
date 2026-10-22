/**
 * Tipos del lado del cliente.
 *
 * Los del servidor se reexportan tal cual desde el modulo compartido: si el
 * contrato cambia, el error sale aqui y no por duplicar la definicion a mano.
 */

import type {
  AggregatedSearch,
  EpisodeInfo,
  EpisodeRef,
  Genre,
  MediaKind,
  PlaybackProgress,
  PlaybackServer,
  ResolvedStream,
  SavedTitle,
  SearchResult,
  SeriesIndex,
  SeasonInfo,
  SourceId,
  SourceInfo,
  SourceMeta,
  SourceStatus,
  TitleCard,
  TitleDetail,
} from '../../../server/sources/types.js';

/**
 * Se reexportan tal cual, no se redeclaran: si el contrato del servidor cambia,
 * el error sale en la definicion y no en dos sitios a la vez.
 */
export type {
  AggregatedSearch,
  EpisodeInfo,
  EpisodeRef,
  Genre,
  MediaKind,
  PlaybackProgress,
  PlaybackServer,
  ResolvedStream,
  SavedTitle,
  SearchResult,
  SeriesIndex,
  SeasonInfo,
  SourceId,
  SourceInfo,
  SourceMeta,
  SourceStatus,
  TitleCard,
  TitleDetail,
};

/**
 * Estado del reproductor para una fuente concreta.
 *
 * El caso 'embed' se distingue a proposito de 'listo': es un embed sin stream
 * reproducible, y ensenarlo dentro del reproductor produce exactamente la
 * pantalla que el usuario describio, un cartel de la pelicula y un boton de
 * play que no hace nada. Se reporta como fallo, no como reproduccion.
 */
export type PlaybackState =
  | { phase: 'iniciando' }
  | {
      phase: 'listo';
      url: string;
      type: 'hls' | 'file' | 'embed';
      serverLabel: string | null;
      /**
       * Si la URL ya viene reescrita para pasar por nuestro proxy. Es la
       * diferencia entre "usar tal cual" y "envolver en /api/hls": equivocarse
       * aqui produce una peticion a un CDN que no contesta por CORS.
       */
      proxied: boolean;
      /**
       * Segundo en el que hay que reanudar, cuando el stream se ha vuelto a
       * resolver tras un corte. Ausente en una reproduccion normal.
       */
      resumeAt?: number;
    }
  | {
      phase: 'fallo';
      motivo: string;
      trace: string[];
      /** Que se probo de cada servidor, para explicar el fallo. */
      attempts: Attempt[];
      /** Ids de servidores ya descartados. Evita ofrecer reintentar uno que fallo. */
      probados: string[];
      /** Pagina original, ofrecida como salida manual. */
      paginaOriginal: string | null;
    };

/** Estado del servidor tal y como lo communica el proceso principal. */
export type ServerState =
  | 'apagado'
  | 'arrancando'
  | 'en-funcionamiento'
  | 'deteniendo'
  | 'error';

export interface ServerStatus {
  state: ServerState;
  port: number | null;
  pid: number | null;
  message: string | null;
}

/**
 * Respuesta de `/api/title`.
 *
 * El servidor devuelve el detalle y el stream ya resueltos, envueltos: la
 * extraccion puede tardar hasta treinta segundos y el cliente quiere poder
 * pintar el detalle antes, aunque todavia no haya video.
 */
export interface TitleResponse {
  detail: TitleDetail;
  stream: ResolvedStream | null;
  trace: string[];
  /** Que se probo de cada servidor y por que fallo. Solo hay algo que mirar si nada reproduce. */
  attempts: Attempt[];
  /**
   * Id del servidor que gano.
   *
   * Se pide explicitamente en vez de deducirlo comparando la etiqueta del stream
   * con la lista: varias entradas comparten etiqueta ("Español Latino ·
   * streamwish"), asi que la comparacion puede marcar el boton equivocado.
   */
  serverId: string | null;
  /**
   * Servidores que no llegaron a probarse porque se agoto el presupuesto.
   *
   * El backend recorre los servidores por tiempo, no por numero, asi que esta
   * cifra es la que separa "todos fallaron" de "solo fallaron estos tres". Con
   * valor mayor que cero el titular del informe no puede afirmar lo primero.
   */
  sinProbar: number;
}

/** Un servidor probado y su resultado. */
export interface Attempt {
  /** Id del servidor en la lista de la pagina, para no ofrecerlo otra vez. */
  serverId: string;
  label: string;
  ok: boolean;
  reason: string | null;
}
