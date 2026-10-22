import { useCallback, useEffect, useState } from 'react';
import { sources } from './lib/api.js';
import { useLibrary } from './lib/library.js';
import { isDesktop, useServer } from './lib/useServer.js';
import type { SavedTitle, SourceInfo, TitleCard } from './lib/types.js';
import { AppHeader, type Seccion } from './ui/AppHeader.js';
import { BottomBar } from './ui/BottomBar.js';
import { DetailView } from './ui/DetailView.js';
import { GenresView } from './ui/GenresView.js';
import { LibraryView } from './ui/LibraryView.js';
import { SearchView } from './ui/SearchView.js';
import { SettingsView } from './ui/SettingsView.js';
import { Splash } from './ui/Splash.js';

/**
 * Raiz de la aplicacion.
 *
 * Dos decisiones que se ven en este archivo:
 *
 *  - El detalle no es una seccion de la navegacion, es una capa por encima.
 *    `abierto` recuerda que titulo se esta viendo y al cerrarlo se vuelve a la
 *    seccion donde se estaba, no siempre al inicio. Antes, volver del detalle
 *    devolvia la busqueda aunque se hubiera llegado desde el historial.
 *  - La cabecera vive fuera de las secciones. La marca y la navegacion son de
 *    la aplicacion entera; solo el inicio tiene campo de busqueda.
 */

export function App() {
  const { status, start, stop, versions } = useServer();
  const [metas, setMetas] = useState<SourceInfo[]>([]);
  const [seccion, setSeccion] = useState<Seccion>('inicio');
  const library = useLibrary();

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

  const [abierto, setAbierto] = useState<{ card: TitleCard; saved: SavedTitle | null } | null>(
    null,
  );

  const open = useCallback(
    (card: TitleCard) => {
      // Se busca la entrada del historial por la clave de la tarjeta: es la que
      // trae la temporada, el capitulo y el minuto en el que se dejo. Si el
      // titulo no se ha visto nunca, no hay nada guardado y se abre desde cero.
      const saved = library.history.find((h) => h.key === card.key) ?? null;
      setAbierto({ card, saved });
    },
    [library.history],
  );
  const close = useCallback(() => setAbierto(null), []);

  const enArranque =
    status.state === 'apagado' ||
    status.state === 'error' ||
    status.state === 'arrancando' ||
    status.state === 'deteniendo';

  return (
    <div className="app">
      {enArranque ? (
        <Splash status={status} versions={versions} onStart={() => void start()} />
      ) : (
        <>
          {/*
           * El armazon NO se desmonta al abrir el detalle: se oculta.
           *
           * Antes esto era un `abierto ? detalle : armazon`, y cambiar de rama
           * desmontaba la seccion entera. Al cerrar el detalle, React volvia a
           * montar la seccion desde cero, con lo que la busqueda escrita y sus
           * resultados desaparecian y aparecia el inicio. Ocultarlo con `hidden`
           * conserva el estado (el texto del campo, la respuesta de las fuentes,
           * la posicion) y al volver se ve exactamente lo que se estaba viendo.
           */}
          <div className="shell" hidden={abierto !== null}>
            <AppHeader seccion={seccion} onSeccion={setSeccion} />
            <main className="view">
              {seccion === 'inicio' && (
                <SearchView sources={metas} accentBySource={accentBySource} onOpen={open} />
              )}
              {seccion === 'generos' && (
                <GenresView accentBySource={accentBySource} onOpen={open} />
              )}
              {seccion === 'favoritos' && (
                <LibraryView tipo="favoritos" accentBySource={accentBySource} onOpen={open} />
              )}
              {seccion === 'historial' && (
                <LibraryView tipo="historial" accentBySource={accentBySource} onOpen={open} />
              )}
              {seccion === 'ajustes' && <SettingsView sources={metas} onChange={setMetas} />}
            </main>
          </div>

          {abierto && (
            <DetailView
              card={abierto.card}
              saved={abierto.saved}
              accentBySource={accentBySource}
              onBack={close}
            />
          )}
        </>
      )}

      <BottomBar
        status={status}
        canStop={isDesktop && status.state === 'en-funcionamiento'}
        onStop={() => void stop()}
      />
    </div>
  );
}
