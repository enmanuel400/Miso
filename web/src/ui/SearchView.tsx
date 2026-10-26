import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, home as fetchHome, search } from '../lib/api.js';
import { useLibrary } from '../lib/library.js';
import { restante } from '../lib/progress.js';
import { failedSources, mergeResults } from '../lib/merge.js';
import type { AggregatedSearch, SourceMeta, TitleCard } from '../lib/types.js';
import { IconClose } from './Icons.js';
import { ResultCard } from './ResultCard.js';
import { SkeletonGrid } from './Skeletons.js';

/**
 * Pantalla de busqueda.
 *
 * Un solo campo de texto y una rejilla. Todo lo demas esta en la barra inferior
 * o en la barra de detalle, porque en v1 lo unico que se hace aqui es buscar y
 * elegir.
 *
 * Cuando el campo esta vacio, que es como abre la aplicacion, la rejilla no esta
 * vacia: enseña lo mas nuevo de cada fuente. Ver el texto de ayuda y nada mas
 * hacia pensar que la aplicacion no sabe lo que ofrece, cuando en realidad ya hay
 * titulos que mirar y el usuario no lo sabe todavia.
 */

interface Props {
  sources: SourceMeta[];
  accentBySource: Record<string, string>;
  onOpen(card: TitleCard): void;
  /** Cambia cada vez que se pulsa el icono de buscar: vuelve a enfocar el campo. */
  focusSignal?: number;
  /** La disposicion deja el buscador como icono: el campo se despliega al pedirlo. */
  buscadorAbierto: boolean;
  onCerrarBusqueda(): void;
}

/**
 * Separador antes de la fuente numero `i` de una enumeracion.
 *
 * La preposicion la pone quien escribe la frase, no esta, y esa es toda la
 * razon de que sea un parametro. En castellano se repite delante del ultimo
 * elemento ("pregunta a X y a Y", no "pregunta a X y Y"), asi que el separador
 * tiene que saber cual es. Estaba fija en "a" porque solo se usaba en una frase,
 * y al reutilizarla en la del inicio salio "capitulos de pelisplushd y a cuevana":
 * el codigo daba por hecho que todas las frases del mundo llevan "a".
 *
 * Los nombres vienen del servidor y no estan escritos aqui a proposito. Estaban
 * escritos, y se quedaron diciendo "Miso pregunta a X y a Y" cuando la lista ya
 * no era esa. Una enumeracion a mano es una promesa que el codigo no cumple en
 * cuanto se toca la lista de fuentes.
 */
function separador(i: number, total: number, preposicion: string): string {
  if (i === 0) return '';
  return `${i === total - 1 ? ' y' : ','} ${preposicion} `;
}

type Phase =
  | { kind: 'vacio' }
  | { kind: 'buscando'; query: string }
  | { kind: 'listo'; data: AggregatedSearch }
  | { kind: 'fallo'; mensaje: string };

/**
 * Estado del contenido de inicio.
 *
 * Va aparte de la busqueda a proposito. Son dos cosas que no se estorban: el
 * usuario puede buscar mientras la pantalla de inicio carga, y al borrar la
 * busqueda vuelve a aparecer lo que ya estaba descargado en vez de volver a
 * pedirlo. Meterlo en la fase de busqueda obligaria a pedir el inicio cada vez
 * que se borra el campo.
 */
interface Inicio {
  data: AggregatedSearch | null;
  cargando: boolean;
  error: string | null;
}

export function SearchView({
  sources,
  accentBySource,
  onOpen,
  focusSignal = 0,
  buscadorAbierto,
  onCerrarBusqueda,
}: Props) {
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'vacio' });
  const [inicio, setInicio] = useState<Inicio>({ data: null, cargando: true, error: null });
  const abort = useRef<AbortController | null>(null);
  const homeAbort = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { history } = useLibrary();

  const nombres = sources.map((s) => s.label);
  const cuantas = nombres.length;

  useEffect(() => {
    if (!buscadorAbierto) return;
    inputRef.current?.focus();
  }, [focusSignal, buscadorAbierto]);

  /**
   * Cerrar la busqueda devuelve el inicio tal como estaba.
   *
   * Se vacia el campo a proposito: si se ocultara la caja dejando la consulta,
   * al volver a abrirla aparecerian unos resultados que ya no se recuerdan
   * haber pedido. Cerrar es salir de la busqueda, no esconderla.
   */
  const cerrar = useCallback(() => {
    abort.current?.abort();
    setInput('');
    setPhase({ kind: 'vacio' });
    onCerrarBusqueda();
  }, [onCerrarBusqueda]);

  /**
   * Carga lo mas nuevo una vez, al montar.
   *
   * Se pide aqui y no cuando el campo se vacia porque la pantalla de inicio es lo
   * primero que ve el usuario al abrir la aplicacion: si espera a que vacie un
   * campo que ya viene vacio, no se entera de que existe.
   *
   * El error no borra lo que ya estaba: si una recarga falla, sigue lo anterior,
   * con una linea de aviso al lado. Un fallo puntual no puede dejar la pantalla en
   * blanco.
   */
  const cargarInicio = useCallback(() => {
    homeAbort.current?.abort();
    const ctl = new AbortController();
    homeAbort.current = ctl;
    setInicio((prev) => ({ ...prev, cargando: true, error: null }));

    void (async () => {
      try {
        const data = await fetchHome(ctl.signal);
        if (ctl.signal.aborted) return;
        setInicio({ data, cargando: false, error: null });
      } catch (err) {
        if (ctl.signal.aborted) return;
        setInicio((prev) => ({
          data: prev.data,
          cargando: false,
          error: err instanceof ApiError ? err.message : 'No se pudo cargar lo más nuevo.',
        }));
      }
    })();

    return () => ctl.abort();
  }, []);

  useEffect(() => {
    const cleanup = cargarInicio();
    return () => {
      cleanup();
      homeAbort.current?.abort();
    };
  }, [cargarInicio]);

  // Cancelamos la busqueda en curso si el usuario escribe otra cosa. Las fuentes
  // tardan entre uno y veinte segundos: seguir esperando por una consulta que ya
  // no interesa solo hace perder el tiempo del usuario.
  useEffect(() => {
    const query = input.trim();
    abort.current?.abort();

    if (query.length < 2) {
      setPhase({ kind: 'vacio' });
      return;
    }

    const ctl = new AbortController();
    abort.current = ctl;
    setPhase({ kind: 'buscando', query });

    // Un pequeño retardo: mientras se escribe, casi siempre todavia no se ha
    // terminado la palabra, y cada consulta golpea todas las fuentes.
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const data = await search(query, ctl.signal);
          if (!ctl.signal.aborted) setPhase({ kind: 'listo', data });
        } catch (err) {
          if (ctl.signal.aborted) return;
          setPhase({
            kind: 'fallo',
            mensaje: err instanceof ApiError ? err.message : 'Falló la búsqueda.',
          });
        }
      })();
    }, 320);

    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [input]);

  const cards = phase.kind === 'listo' ? mergeResults(phase.data.results) : [];
  const failed = phase.kind === 'listo' ? failedSources(phase.data) : [];

  const inicioCards = inicio.data ? mergeResults(inicio.data.results) : [];
  const inicioFailed = inicio.data ? failedSources(inicio.data) : [];

  /**
   * "Continuar viendo" no es lo mismo que el historial: aqui solo caben los
   * ultimos que se abrieron, para que el inicio siga siendo de un vistazo. La
   * lista completa esta en su seccion.
   *
   * Se separan los que estan a medias de los que solo se abrieron o ya se
   * terminaron: "continuar" promete retomar algo empezado, y meter ahi una serie
   * recien terminada (progreso en cero) seria una promesa falsa. Un titulo sin
   * `progress` tampoco entra: no hay nada que continuar todavia.
   */
  const continuar = useMemo(() => {
    const aMedias = history.filter((s) => s.progress && s.progress.seconds > 0);
    return (aMedias.length > 0 ? aMedias : history).slice(0, 6);
  }, [history]);

  return (
    <div className="search" data-buscador={buscadorAbierto ? 'abierto' : 'cerrado'}>
      {buscadorAbierto && (
        <header className="search-head">
          <div className="searchbar">
            <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path
                d="M11 11l3.4 3.4"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') cerrar();
              }}
              placeholder={
                cuantas ? `Busca una película en ${cuantas} fuentes` : 'Busca una película'
              }
              aria-label="Buscar"
              spellCheck={false}
              autoComplete="off"
            />
            {phase.kind === 'buscando' && <span className="searchbar-spinner" aria-hidden="true" />}
            <button
              type="button"
              className="searchbar-close"
              onClick={cerrar}
              aria-label="Cerrar búsqueda"
              title="Cerrar búsqueda"
            >
              <IconClose size={14} />
            </button>
          </div>

          {phase.kind === 'listo' && (
            <span className="search-count">
              {cards.length} {cards.length === 1 ? 'título' : 'títulos'}
              <span className="search-ms"> · {(phase.data.totalMs / 1000).toFixed(2)} s</span>
            </span>
          )}
        </header>
      )}

      <div className="search-body">
        {phase.kind === 'fallo' && (
          <p className="hint hint-error">
            {phase.mensaje}
            <button
              type="button"
              className="hint-retry"
              onClick={() => setInput((v) => `${v} `)}
            >
              Reintentar
            </button>
          </p>
        )}

        {/* Una fuente caida se dice en una linea y el resto sigue a la vista.
            Ocultarla seria mentir sobre lo que se ha encontrado.

            Se usa el motivo que da el servidor en vez de un "no respondió"
            generico: distinguir "nos está limitando" de "está caída" cambia lo
            que el usuario espera, porque lo primero se le pasa en un minuto y
            lo segundo no. */}
        {failed.length > 0 && (
          <p className="warning">
            {failed.map((f) => (
              <span key={f.id}>
                <strong>{f.id}</strong>
                {f.message ? `: ${f.message}` : ' no respondió'}
              </span>
            ))}
            , así que sus resultados no aparecen.
          </p>
        )}

        {/*
         * Inicio: lo mas nuevo de cada fuente, con el texto de ayuda encima.

         * El encabezado va antes que la rejilla y no al reves porque es lo que
         * explica la pantalla: sin el, doce entradas sin contexto parecen un
         * resultado de algo que el usuario pidio y no pidio.
         */}
        {phase.kind === 'vacio' && (
          <>
            {continuar.length > 0 && (
              <>
                <h2 className="home-title">Continuar viendo</h2>
                <ul className="grid">
                  {continuar.map((s, i) => {
                    const cap = s.last ? `T${s.last.season}E${s.last.episode}` : null;
                    const queda = restante(s.progress);
                    const note = [cap, queda].filter(Boolean).join(' · ');
                    return (
                      <ResultCard
                        key={`h-${s.key}`}
                        card={note ? { ...s.card, note } : s.card}
                        accentBySource={accentBySource}
                        onOpen={onOpen}
                        index={i}
                      />
                    );
                  })}
                </ul>
              </>
            )}

            <h2 className="home-title">Lo más nuevo</h2>
            <p className="hint">
              {cuantas
                ? 'Estrenos y últimos capítulos de '
                : 'Estrenos y últimos capítulos de las fuentes. '}
              {nombres.map((n, i) => (
                <span key={n}>
                  {separador(i, cuantas, 'de')}
                  <strong>{n}</strong>
                </span>
              ))}
              {cuantas > 0 &&
                (buscadorAbierto
                  ? '. También puedes escribir el nombre de algo.'
                  : '. Usa la lupa para buscar algo.')}
            </p>

            {inicio.error && (
              <p className="warning">
                {inicio.error}
                <button type="button" className="hint-retry" onClick={cargarInicio}>
                  Reintentar
                </button>
              </p>
            )}

            {inicioFailed.map((f) => (
              <p className="warning" key={f.id}>
                <strong>{f.id}</strong>
                {f.message ? `: ${f.message}` : ' no respondió'}
                , así que no aparece en el inicio.
              </p>
            ))}

            {inicio.cargando && inicioCards.length === 0 && <SkeletonGrid />}

            {inicioCards.length > 0 && (
              <ul className="grid">
                {inicioCards.map((card, i) => (
                  <ResultCard
                    key={card.key}
                    card={card}
                    accentBySource={accentBySource}
                    onOpen={onOpen}
                    index={i}
                  />
                ))}
              </ul>
            )}

            {!inicio.cargando && !inicio.error && inicioCards.length === 0 && (
              <p className="hint">Ninguna fuente tiene novedades ahora mismo.</p>
            )}
          </>
        )}

        {phase.kind === 'buscando' && cards.length === 0 && <SkeletonGrid />}

        {cards.length > 0 && (
          <ul className="grid">
            {cards.map((card, i) => (
              <ResultCard
                key={card.key}
                card={card}
                accentBySource={accentBySource}
                onOpen={onOpen}
                index={i}
              />
            ))}
          </ul>
        )}

        {phase.kind === 'listo' && cards.length === 0 && (
          <p className="hint">Ninguna fuente tiene nada con «{phase.data.query}».</p>
        )}
      </div>
    </div>
  );
}
