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
  suspendido: 'Servidor suspendido',
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

      {/* Los dos niveles de inactividad, contados. Verlos evita la sorpresa de
          que una busqueda tarde: se sabe que queda poco para que se apague. */}
      <span className="bottombar-clocks">
        {status.suspendInSec !== null && status.state === 'en-funcionamiento' && (
          <span title="El navegador sin cabeza se cierra al rato de no hacer nada">
            navegador en {format(status.suspendInSec)}
          </span>
        )}
        {status.stopInSec !== null && (
          <span title="El servidor se detiene al rato de no hacer nada">
            servidor en {format(status.stopInSec)}
          </span>
        )}
      </span>

      {canStop && (
        <button type="button" className="ghost" onClick={onStop} disabled={busy}>
          Detener servidor
        </button>
      )}
    </footer>
  );
}

/** Segundos a mm:ss, o "ahora" cuando ya toca. */
function format(sec: number): string {
  if (sec <= 0) return 'ahora';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}
