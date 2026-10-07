import { contextBridge, ipcRenderer } from 'electron';

/**
 * Puente entre el proceso principal y la interfaz.
 *
 * Se expone una superficie minima y explicita. Nada de `ipcRenderer` en crudo ni
 * de un canal abierto: la interfaz solo puede pedir lo que el proceso principal
 * decide que es legitimo, y por aqui tampoco se expone nada del sistema de
 * ficheros.
 *
 * `nodeIntegration` esta desactivado y `contextIsolation` activo en la ventana,
 * asi que este objeto es el unico camino entre los dos mundos.
 */

export type ServerState =
  | 'apagado'
  | 'arrancando'
  | 'en-funcionamiento'
  | 'suspendido'
  | 'deteniendo'
  | 'error';

export interface ServerStatus {
  state: ServerState;
  /** Puerto en el que escucha el servidor, util para diagnostico. */
  port: number | null;
  pid: number | null;
  /** Motivo del estado 'error', si lo hay. */
  message: string | null;
  /** Segundos que faltan para la suspension automatica. */
  suspendInSec: number | null;
  /** Segundos que faltan para el apagado automatico. */
  stopInSec: number | null;
}

const api = {
  /** Pide arrancar el servidor. Es idempotente. */
  start: (): Promise<ServerStatus> => ipcRenderer.invoke('server:start'),

  /** Pide detener el servidor. Es idempotente. */
  stop: (): Promise<ServerStatus> => ipcRenderer.invoke('server:stop'),

  /** Estado actual, sin efectos. */
  status: (): Promise<ServerStatus> => ipcRenderer.invoke('server:status'),

  /**
   * Registra actividad del usuario. Reinicia los temporizadores de inactividad
   * que apagan el navegador y luego el servidor. Se llama en cada pulsacion o
   * cambio de teclado, no en un `setInterval`, para que la cuenta sea real.
   */
  touch: (): void => {
    ipcRenderer.send('app:touch');
  },

  /** Notificacion push del proceso principal cuando cambia el estado. */
  onStatus: (cb: (s: ServerStatus) => void): (() => void) => {
    const handler = (_e: unknown, s: ServerStatus) => cb(s);
    ipcRenderer.on('server:status', handler);
    return () => ipcRenderer.removeListener('server:status', handler);
  },

  /** Version de la app y del servidor, para la pantalla de arranque. */
  versions: (): Promise<{ app: string; electron: string; chrome: string; node: string }> =>
    ipcRenderer.invoke('app:versions'),

  /**
   * Indica si estamos dentro de Electron. Permite que la misma interfaz
   * funcione en el navegador durante el desarrollo sin bifurcar el codigo.
   */
  isDesktop: true as const,
};

contextBridge.exposeInMainWorld('miso', api);

export type MisoBridge = typeof api;
