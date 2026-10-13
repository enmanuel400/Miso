import { useCallback, useEffect, useRef, useState } from 'react';
import { probeStatus } from './api.js';
import type { ServerStatus } from './types.js';

/**
 * Puente de Electron, declarado aqui para que el resto de la interfaz no tenga
 * que comprobar si existe.
 *
 * El preload lo inyecta en `window`. Cuando no esta (desarrollo en el
 * navegador), aqui simplemente no hay nada y la aplicacion lo detecta.
 */

interface MisoBridge {
  start(): Promise<ServerStatus>;
  stop(): Promise<ServerStatus>;
  status(): Promise<ServerStatus>;
  onStatus(cb: (s: ServerStatus) => void): () => void;
  versions(): Promise<{ app: string; electron: string; chrome: string; node: string }>;
  isDesktop: true;
}

declare global {
  interface Window {
    miso?: MisoBridge;
  }
}

export const bridge: MisoBridge | undefined =
  typeof window !== 'undefined' ? window.miso : undefined;

export const isDesktop = Boolean(bridge);

/** Estado en reposo, usado antes de la primera respuesta del proceso principal. */
const IDLE: ServerStatus = {
  state: 'apagado',
  port: null,
  pid: null,
  message: null,
};

export interface ServerController {
  status: ServerStatus;
  start(): Promise<void>;
  stop(): Promise<void>;
  versions: { app: string; electron: string; chrome: string; node: string } | null;
}

/**
 * Estado del servidor y acciones para cambiarlo.
 *
 * Fuera de Electron (navegador, durante el desarrollo) no hay nada que
 * arrancar ni detener: el servidor ya esta corriendo en otra terminal. En ese
 * caso se deduce del endpoint de salud y los botones no se ofrecen.
 */
export function useServer(): ServerController {
  const [status, setStatus] = useState<ServerStatus>(IDLE);
  const [versions, setVersions] = useState<ServerController['versions']>(null);
  const known = useRef(false);

  useEffect(() => {
    let alive = true;

    if (bridge) {
      void bridge.status().then((s) => {
        if (alive) setStatus(s);
      });
      const off = bridge.onStatus((s) => {
        if (alive) setStatus(s);
      });
      void bridge.versions().then((v) => {
        if (alive) setVersions(v);
      });
      return () => {
        alive = false;
        off();
      };
    }

    void probeStatus().then((s) => {
      if (alive && !known.current) setStatus(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  const start = useCallback(async () => {
    if (!bridge) return;
    setStatus((s) => ({ ...s, state: 'arrancando' }));
    setStatus(await bridge.start());
  }, []);

  const stop = useCallback(async () => {
    if (!bridge) return;
    setStatus((s) => ({ ...s, state: 'deteniendo' }));
    setStatus(await bridge.stop());
  }, []);

  return { status, start, stop, versions };
}
