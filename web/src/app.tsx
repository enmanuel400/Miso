import { useCallback, useEffect, useState } from 'react';
import { sources } from './lib/api.js';
import { isDesktop, useServer } from './lib/useServer.js';
import type { SourceMeta, TitleCard } from './lib/types.js';
import { BottomBar } from './ui/BottomBar.js';
import { DetailView } from './ui/DetailView.js';
import { SearchView } from './ui/SearchView.js';
import { Splash } from './ui/Splash.js';

/**
 * Raiz de la aplicacion.
 *
 * Decide entre tres estados y poco mas: servidor apagado (arranque), servidor
 * en marcha (busqueda) y titulo abierto (detalle y reproduccion). No hay
 * enrutador porque en v1 no hay una tercera pantalla que justifique la
 * dependencia; la consulta viva en la URL para que el boton de atras del
 * sistema funcione como la gente espera.
 */

type View = { kind: 'search' } | { kind: 'titulo'; card: TitleCard };

export function App() {
  const { status, start, stop, touch, versions } = useServer();
  const [view, setView] = useState<View>({ kind: 'search' });
  const [metas, setMetas] = useState<SourceMeta[]>([]);

  const accentBySource = Object.fromEntries(metas.map((m) => [m.id, m.accent]));

  // Los acentos de las fuentes los decide el servidor, no la interfaz: si una
  // fuente nueva aparece, su color llega solo.
  useEffect(() => {
    if (status.state !== 'en-funcionamiento') return;
    let alive = true;
    void sources()
      .then((r) => {
        if (alive) setMetas(r.sources);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [status.state]);

  // Actividad del usuario: alimenta los dos niveles de inactividad del proceso
  // principal. Se escucha en fase de captura porque interesa cualquier
  // interaccion, incluida la rueda sobre el video.
  useEffect(() => {
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    for (const e of events) window.addEventListener(e, touch, { passive: true, capture: true });
    return () => {
      for (const e of events) window.removeEventListener(e, touch, { capture: true });
    };
  }, [touch]);

  const open = useCallback((card: TitleCard) => setView({ kind: 'titulo', card }), []);

  const back = useCallback(() => {
    setView({ kind: 'search' });
  }, []);

  const serverUp = status.state === 'en-funcionamiento' || status.state === 'suspendido';

  return (
    <div className="app">
      {status.state === 'apagado' || status.state === 'error' ? (
        <Splash status={status} versions={versions} onStart={() => void start()} />
      ) : status.state === 'arrancando' || status.state === 'deteniendo' ? (
        <Splash status={status} versions={versions} onStart={() => void start()} />
      ) : view.kind === 'titulo' ? (
        <DetailView card={view.card} accentBySource={accentBySource} onBack={back} />
      ) : (
        <SearchView sources={metas} accentBySource={accentBySource} onOpen={open} />
      )}

      <BottomBar
        status={status}
        canStop={isDesktop && (status.state === 'en-funcionamiento' || status.state === 'suspendido')}
        onStop={() => void stop()}
      />

      {/* Durante una busqueda larga el proceso principal puede suspender el
          navegador por inactividad; la interfaz tiene que poder despertarlo. */}
      {serverUp && null}
    </div>
  );
}
