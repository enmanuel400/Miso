import type { ServerStatus } from '../lib/types.js';

/**
 * Barra inferior: estado del servidor y la accion para detenerlo.
 *
 * Vive siempre visible, incluso viendo una pelicula. El servidor es un proceso
 * con un navegador sin cabeza detras, y la unica forma que tiene el usuario de
 * entender por que la aplicacion va lenta es poder apagarlo.
 */

interface Props {
  status: ServerStatus;
  canStop: boolean;
  onStop(): void;
}

const LABEL: Record<ServerStatus['state'], string> = {
  apagado: 'Servidor apagado',
  arrancando: 'Arrancando…',
  'en-funcionamiento': 'Servidor en marcha',
  deteniendo: 'Deteniendo…',
  error: 'Servidor caído',
};

export function BottomBar({ status, canStop, onStop }: Props) {
  const busy = status.state === 'deteniendo' || status.state === 'arrancando';

  return (
    <footer className="bottombar">
      <span className="bottombar-state" data-state={status.state}>
        <span className="bottombar-dot" aria-hidden="true" />
        {LABEL[status.state]}
        {status.pid ? <span className="bottombar-pid">pid {status.pid}</span> : null}
      </span>

      {canStop && (
        <button type="button" className="ghost" onClick={onStop} disabled={busy}>
          Detener servidor
        </button>
      )}
    </footer>
  );
}
