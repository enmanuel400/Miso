import type { ServerStatus } from '../lib/types.js';
import { LogoMark } from './Logo.js';

/**
 * Pantalla de arranque.
 *
 * Solo aparece con el servidor apagado. El boton es el unico camino para
 * arrancar, y es deliberado: la app no levanta un servidor en segundo plano al
 * abrirse. Arrancarlo sin querer deja un proceso de Node y un navegador sin
 * cabeza encendidos sin que nadie los haya pedido, y el usuario no tendria
 * forma de apagarlos sin cerrar la ventana entera.
 */

interface Props {
  status: ServerStatus;
  versions: { app: string; electron: string; chrome: string; node: string } | null;
  onStart(): void;
}

export function Splash({ status, versions, onStart }: Props) {
  const starting = status.state === 'arrancando';

  return (
    <div className="splash">
      <div className="splash-center">
        <LogoMark className="splash-logo" size={46} />
        <h1 className="splash-mark">Miso</h1>
        {/* Sin numero: esta pantalla sale con el servidor apagado, y la lista de
            fuentes no se puede pedir todavia. "varias" no caduca. */}
        <p className="splash-sub">Busca en varias fuentes y reproduce aquí.</p>

        {status.state === 'error' && status.message && (
          <p className="splash-error">{status.message}</p>
        )}

        <button type="button" className="primary" onClick={onStart} disabled={starting}>
          {starting ? 'Arrancando…' : 'Iniciar servidor'}
        </button>

        {starting && (
          <p className="splash-note">
            Se abre un navegador sin cabeza la primera vez que busques, no ahora.
          </p>
        )}

        {versions && (
          <dl className="splash-versions">
            <div>
              <dt>versión</dt>
              <dd>{versions.app}</dd>
            </div>
            <div>
              <dt>electron</dt>
              <dd>{versions.electron}</dd>
            </div>
            <div>
              <dt>chromium</dt>
              <dd>{versions.chrome}</dd>
            </div>
            <div>
              <dt>node</dt>
              <dd>{versions.node}</dd>
            </div>
          </dl>
        )}
      </div>
    </div>
  );
}
