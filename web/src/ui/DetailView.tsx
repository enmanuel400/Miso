import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, report, resolve, title as fetchTitle } from '../lib/api.js';
import { recordHistory, toggleFavorite, useLibrary } from '../lib/library.js';
import { IconStar } from './Icons.js';
import type {
  Attempt,
  EpisodeInfo,
  EpisodeRef,
  PlaybackProgress,
  PlaybackState,
  ResolvedStream,
  SavedTitle,
  SearchResult,
  SeriesIndex,
  TitleCard,
  TitleDetail,
  TitleResponse,
} from '../lib/types.js';
import { VideoPlayer } from './Player.js';

/**
 * Vista de detalle y reproduccion.
 *
 * Aqui se juntan las cuatro cosas que el usuario puede cambiar: de que titulo, de
 * que fuente, de que capitulo y de que servidor. Cada cambio vuelve a resolver, y
 * cada resolucion puede tardar entre cinco y treinta segundos porque obliga a
 * arrancar un navegador sin cabeza. Por eso el estado de carga dice cuanto se
 * lleva, en vez de un spinner mudo.
 *
 * El capitulo va antes que el servidor en la jerarquia mental y tambien en el
 * orden en que se resuelve: un servidor es un embodiment de algo concreto, y sin
 * saber que capitulo se quiere reproducir no se puede ni preguntar por el.
 */

interface Props {
  card: TitleCard;
  accentBySource: Record<string, string>;
  onBack(): void;
  /**
   * Entrada guardada del historial, si se abrio desde ahi.
   *
   * Trae la temporada, el capitulo y el minuto en el que se dejo. Sin esto, abrir
   * un titulo empezado obligaria a elegir el capitulo a mano y a tantear por donde
   * iba, que es justo lo que esta memoria viene a evitar.
   */
  saved?: SavedTitle | null;
}

const KIND_LABEL: Record<string, string> = {
  movie: 'Película',
  series: 'Serie',
  anime: 'Anime',
};

/**
 * Reconexion automatica.
 *
 * Los enlaces de estos hosters caducan a los veinte o treinta minutos: los
 * segmentos empiezan a devolver 403, hls.js se rinde y, sin esto, la aplicacion
 * mandaba a elegir servidor otra vez. Ahora se vuelve a resolver el mismo titulo
 * (que produce un enlace fresco) y se reanuda donde iba.
 *
 *   - MIN: por debajo de este segundo no se reconecta. Un fallo al arrancar es
 *     otra cosa y se enseña tal cual.
 *   - MAX: intentos consecutivos. Si un enlace nuevo muere enseguida, no se
 *     entra en bucle.
 *   - SALUDABLE: si el enlace sobrevivio esta cantidad de segundos, el contador
 *     se reinicia. Un corte cada media hora es caducidad, no un bucle.
 */
const RECONEXION_MIN_SEC = 30;
const RECONEXION_MAX = 3;
const RECONEXION_SALUDABLE_SEC = 300;

/**
 * Una entrada por fuente, y solo una.
 *
 * El selector de fuente estaba encima de `entries`, y con el inicio eso sale
 * mal: una serie con tres capitulos recientes tiene tres entradas de la misma
 * fuente, y se pintaban tres botones "cuevana" iguales. Tres botones que hacen lo
 * mismo no son una eleccion, y ademas ocupan el sitio donde harian falta los de
 * las fuentes de verdad.
 *
 * La capitulacion ya no se pierde por agrupar: si la fuente esta en varias
 * entradas, se coge la primera y el capitulo se elige con el selector de
 * temporada, que es donde se han puesto todas las coordenadas.
 */
function porFuente(entries: readonly SearchResult[]): {
  ids: string[];
  mapa: Map<string, SearchResult>;
} {
  const mapa = new Map<string, SearchResult>();
  for (const e of entries) if (!mapa.has(e.source)) mapa.set(e.source, e);
  return { ids: [...mapa.keys()], mapa };
}

export function DetailView({ card, accentBySource, onBack, saved }: Props) {
  /**
   * Entrada a la que se abre.
   *
   * Si el historial recuerda la fuente con la que se vio, se abre esa y no la
   * primera de la tarjeta: el titulo puede estar en varias fuentes y volver a la
   * de siempre evita que el capitulo guardado no exista en otra.
   */
  const [entry, setEntry] = useState(() => {
    if (saved?.last) {
      const misma = card.entries.find((e) => e.source === saved.card.entries[0]?.source);
      if (misma) return misma;
    }
    return card.entries[0];
  });
  const { ids: fuentes, mapa: entradasPorFuente } = porFuente(card.entries);
  const [detail, setDetail] = useState<TitleDetail | null>(null);
  const [playback, setPlayback] = useState<PlaybackState>({ phase: 'iniciando' });
  const [serverId, setServerId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const abort = useRef<AbortController | null>(null);

  /**
   * Capitulo pedido, o null si el titulo no tiene capitulos.
   *
   * Se guarda aparte del detalle que devuelve el servidor porque el servidor lo
   * ajusta: si se pide un capitulo que la fuente no tiene, contesta con el primer
   * capitulo de la primera temporada y lo dice en la traza. Guardar el valor
   * pedido y no el recibido evita que la interfaz se desincronice con lo que se
   * esta viendo.
   *
   * El historial manda sobre la primera entrada de la tarjeta: si se dejo la serie
   * en T3E7, se abre en T3E7 y no en el primer capitulo de la lista.
   */
  const [pos, setPos] = useState<EpisodeRef | null>(saved?.last ?? card.entries[0].episode ?? null);

  /**
   * Segundo del que hay que reanudar, una sola vez.
   *
   * Se consume al primer montaje del reproductor en el capitulo guardado y se
   * limpia en cuanto el usuario cambia de capitulo: reanudar T3E7 es correcto,
   * pero al saltar a T3E8 arrancar en el minuto del anterior seria un salto
   * absurdo. Se guarda en estado y no en ref para que el reproductor lo vea al
   * montar y desmonte cuando ya no aplica.
   */
  const [resumeAt, setResumeAt] = useState<number | null>(() => {
    const p = saved?.progress;
    return p && p.seconds > 0 ? p.seconds : null;
  });

  /**
   * Espejo de `resumeAt` para el efecto de carga.
   *
   * El efecto que resuelve el titulo no puede depender de `resumeAt`: si lo
   * hiciera, limpiar el minuto tras usarlo volveria a resolver todo el titulo y
   * arrancaria un segundo navegador sin cabeza solo para no reanudar. La ref le
   * deja leer el valor del momento sin entrar en las dependencias.
   */
  const resumeAtRef = useRef(resumeAt);
  resumeAtRef.current = resumeAt;

  /**
   * Servidores que ya se fallaron, en este montaje.
   *
   * Se lleva aparte del estado de fallo porque un fallo del reproductor no crea
   * un estado de servidor fallido: ocurre con un stream que el backend ya dio
   * por bueno y que, sin embargo, no se puede reproducir.
   */
  const [probados, setProbados] = useState<string[]>([]);

  /**
   * Reconexion en curso.
   *
   * Es un booleano y no un estado de reproduccion porque el reproductor se deja
   * montado y congelado debajo del aviso: desmontarlo lo haria parpadear y
   * perderia el fotograma que el usuario estaba viendo.
   */
  const [recuperando, setRecuperando] = useState(false);

  /** Intentos consecutivos, para no entrar en un bucle de reconexiones. */
  const intentos = useRef(0);
  /** Cerrojo sincrono: evita que el reproductor viejo dispare dos recuperaciones. */
  const recuperandoRef = useRef(false);

  // Cambiar de fuente cambia de pagina de origen: el detalle, los capitulos y los
  // servidores no tienen nada que ver con los de otra. El capitulo vuelve al que
  // traia la entrada, porque es la unica pista que hay de donde venia.
  const pickSource = useCallback((e: SearchResult) => {
    setEntry(e);
    setPos(e.episode ?? null);
    // Fuente nueva: el minuto guardado era de otra, asi que no se reanuda.
    setResumeAt(null);
  }, []);

  /**
   * Cambia de capitulo dentro de la misma serie.
   *
   * Cierra los servidores descartados: son de otro capitulo y no dicen nada sobre
   * este. Dejarlos abiertos daria al boton "probar otro" la posibilidad de llevar
   * a un servidor que ya fallo en un capitulo distinto, y reprobarlo gastaria
   * los mismos siete segundos para acabar en el mismo sitio.
   */
  const pickEpisode = useCallback((next: EpisodeRef) => {
    setProbados([]);
    setServerId(null);
    setPos(next);
    // Cambiar de capitulo invalida el minuto del anterior.
    setResumeAt(null);
  }, []);

  const posKey = pos ? `${pos.season}:${pos.episode}` : '';

  const { favorites } = useLibrary();
  const favorito = favorites.some((f) => f.key === card.key);

  /**
   * Ultimo progreso conocido, en ref.
   *
   * El historial se reescribe al cambiar de capitulo (para recordar por donde
   * iba), y en ese momento el progreso pertinente es el del capitulo que se
   * acaba de dejar, no el nuevo. Sin esta ref, el efecto de abajo guardaria la
   * posicion nueva con `progress: null` y borraria el minuto recien guardado.
   */
  const progresoRef = useRef<PlaybackProgress | null>(saved?.progress ?? null);

  /*
   * Abrir el titulo ya es "haberlo visto": no esperamos a que haya imagen para
   * apuntarlo. Se vuelve a escribir cada vez que cambia de capitulo, porque el
   * historial tiene que recordar por donde iba y no solo que lo abrio, y la clave
   * es la tarjeta agrupada, asi que reabrir mueve al frente en vez de duplicar.
   */
  useEffect(() => {
    recordHistory(card, pos, progresoRef.current);
  }, [card, pos]);

  /**
   * Guarda el avance del reproductor.
   *
   * Llega con moderacion (el reproductor solo avisa cada diez segundos, en pausa
   * y al salir) para no escribir el JSON en cada fotograma. Se guarda en la ref y
   * se vuelca al historial sin tocar `pos`: cambiar de capitulo reescribe la
   * entrada y ese volcado tiene que seguir viendo el progreso.
   */
  const guardarProgreso = useCallback(
    (seconds: number, duration: number | null) => {
      progresoRef.current = { seconds: Math.round(seconds), duration };
      recordHistory(card, pos, progresoRef.current);
    },
    [card, pos],
  );

  // Carga el detalle y deja que el servidor elija el servidor que funciona.
  // Una sola pasada para la fuente y el capitulo: los dos entran en la misma
  // peticion y reinician exactamente el mismo estado.
  useEffect(() => {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;

    startedAt.current = performance.now();
    // Fuente o capitulo nuevo: la cuenta de reconexiones vuelve a cero.
    intentos.current = 0;
    recuperandoRef.current = false;
    setRecuperando(false);
    setPlayback({ phase: 'iniciando' });
    setDetail(null);

    void (async () => {
      try {
        const data = await fetchTitle(entry.source, entry.id, ctl.signal, pos);
        if (ctl.signal.aborted) return;

        setDetail(data.detail);

        if (!data.stream) {
          const tried = new Set<string>();
          for (const a of data.attempts) tried.add(a.serverId);
          setProbados([...tried]);
          setPlayback(
            fallo(
              resumenDeFallos(data.attempts, data.sinProbar),
              data.trace,
              data.attempts,
              [...tried],
              data.detail.url,
            ),
          );
          return;
        }

        // El servidor puede haber descartado servidores por el camino, asi que
        // el que gana no es necesariamente el primero de la lista. Nos lo dice
        // el backend, que es quien lo ha probado.
        setServerId(data.serverId);
        setProbados((prev) => {
          const tried = new Set(prev);
          for (const a of data.attempts) tried.add(a.serverId);
          return [...tried];
        });
        const listo = toPlayback(data.stream, data.detail.url, data);
        // Reanudar donde se dejo: solo aplica a la primera carga del capitulo
        // guardado. Al cambiar de capitulo `resumeAt` ya es null y esto no hace
        // nada, que es lo correcto.
        const arranque = resumeAtRef.current;
        setPlayback(
          listo.phase === 'listo' && arranque && arranque > 0
            ? { ...listo, resumeAt: arranque }
            : listo,
        );
      } catch (err) {
        if (ctl.signal.aborted) return;
        setPlayback(
          fallo(
            err instanceof ApiError ? err.message : 'No se pudo abrir el título.',
            err instanceof ApiError ? err.trace : [],
            [],
            [],
            null,
          ),
        );
      }
    })();

    return () => ctl.abort();
  }, [entry.source, entry.id, posKey]);

  // Cuenta atras mientras se resuelve. Es informacion util: si pasa de un minuto
  // el usuario empieza a pensar que la aplicacion se ha colgado.
  useEffect(() => {
    if (playback.phase !== 'iniciando') return;
    const t = setInterval(
      () => setElapsed(Math.round((performance.now() - startedAt.current) / 1000)),
      500,
    );
    return () => clearInterval(t);
  }, [playback.phase]);

  const serverAbort = useRef<AbortController | null>(null);

  /** Cambia de servidor dentro del mismo capitulo. */
  const pickServer = useCallback(
    async (id: string) => {
      if (!detail) return;
      const server = detail.servers.find((s) => s.id === id);
      if (!server) return;

      serverAbort.current?.abort();
      const ctl = new AbortController();
      serverAbort.current = ctl;

      setServerId(server.id);
      setPlayback({ phase: 'iniciando' });
      startedAt.current = performance.now();
      // Elegir servidor a mano reinicia la cuenta de reconexiones.
      intentos.current = 0;

      setProbados((prev) => {
        if (prev.includes(server.id)) return prev;
        return [...prev, server.id];
      });

      try {
        const res = await resolve(server.embedUrl, detail.url, server.label, ctl.signal);
        if (ctl.signal.aborted) return;

        if (res.stream) {
          setPlayback(toPlayback(res.stream, detail.url));
        } else {
          setProbados((prev) => {
            const base = prev.includes(server.id) ? prev : [...prev, server.id];
            if (ctl.signal.aborted) return base;
            setPlayback(
              fallo(
                'Ese servidor no devolvió ningún stream.',
                res.trace,
                [{ serverId: server.id, label: server.label, ok: false, reason: 'sin stream reproducible' }],
                base,
                detail.url,
              ),
            );
            return base;
          });
        }
      } catch (err) {
        if (ctl.signal.aborted) return;
        setProbados((prev) => {
          const base = prev.includes(server.id) ? prev : [...prev, server.id];
          setPlayback(
            fallo(
              err instanceof ApiError ? err.message : 'Falló ese servidor.',
              err instanceof ApiError ? err.trace : [],
              [{ serverId: server.id, label: server.label, ok: false, reason: 'fallo de red' }],
              base,
              detail.url,
            ),
          );
          return base;
        });
      }
    },
    [detail],
  );

  /**
   * Vuelve a resolver el titulo para conseguir un enlace fresco y reanudar.
   *
   * Se pide el mismo servidor (`preferServer`) para no cambiar de reproductor
   * sin motivo; si ese ya no responde, el extractor prueba los demas.
   */
  const recuperar = useCallback(
    async (enSegundo: number) => {
      recuperandoRef.current = true;
      setRecuperando(true);

      abort.current?.abort();
      const ctl = new AbortController();
      abort.current = ctl;

      try {
        const data = await fetchTitle(entry.source, entry.id, ctl.signal, pos, serverId);
        if (ctl.signal.aborted) return;

        if (!data.stream) {
          recuperandoRef.current = false;
          setRecuperando(false);
          setPlayback(
            fallo(
              resumenDeFallos(data.attempts, data.sinProbar),
              data.trace,
              data.attempts,
              probados,
              data.detail.url,
            ),
          );
          return;
        }

        // El servidor puede habernos movido a otro reproductor: se refresca el
        // detalle para que el boton resaltado y el capitulo sigan siendo ciertos.
        setDetail(data.detail);
        setServerId(data.serverId);
        recuperandoRef.current = false;
        setRecuperando(false);
        // `data.stream` es un stream real, asi que `toPlayback` da el caso
        // 'listo'; el guardia es para el tipo, porque la union admite los otros.
        const listo = toPlayback(data.stream, data.detail.url, data);
        setPlayback(listo.phase === 'listo' ? { ...listo, resumeAt: enSegundo } : listo);
      } catch (err) {
        if (ctl.signal.aborted) return;
        recuperandoRef.current = false;
        setRecuperando(false);
        setPlayback(
          fallo(
            'Se cortó la reproducción y no se pudo reconectar.',
            err instanceof ApiError ? err.trace : [],
            [],
            probados,
            detail?.url ?? null,
          ),
        );
      }
    },
    [entry.source, entry.id, pos, serverId, probados, detail],
  );

  /**
   * El reproductor se ha caido a mitad. Antes de rendirse, se reconecta.
   *
   * Solo se intenta si ya habia reproduccion avanzada (`enSegundo`): un fallo al
   * arrancar es un servidor que no sirve, y eso se enseña, no se reintenta en
   * bucle.
   */
  const manejarFalloReproductor = useCallback(
    (motivo: string, trace: string[], enSegundo: number) => {
      // Ya hay una reconexion en marcha: este aviso viene del reproductor viejo.
      if (recuperandoRef.current) return;

      report('reproductor', motivo, `t=${Math.round(enSegundo)}s`);

      const base = playback.phase === 'listo' ? (playback.resumeAt ?? 0) : 0;
      const reproducido = Math.max(0, enSegundo - base);
      if (reproducido >= RECONEXION_SALUDABLE_SEC) intentos.current = 0;

      if (enSegundo >= RECONEXION_MIN_SEC && intentos.current < RECONEXION_MAX) {
        intentos.current += 1;
        void recuperar(enSegundo);
        return;
      }

      setPlayback(fallo(motivo, trace, [], probados, detail?.url ?? null));
    },
    [playback, probados, detail, recuperar],
  );

  const title = detail?.title ?? card.title;
  const poster = detail?.poster ?? card.poster;
  const pending = playback.phase === 'iniciando';

  /**
   * Que se esta probando ahora mismo.
   *
   * Antes ponia "hasta 4 servidores" y era mentira en dos sentidos: el backend no
   * se detiene en cuatro, sino por tiempo (treinta y dos segundos), y ademas el
   * numero dependia de un tope fijo que no existia en ninguna parte del servidor.
   * Decir un techo que nadie aplica hace que el usuario espere cuatro cuando en
   * realidad puede ser que se prueben nueve, y que no entienda por donde se ha
   * quedado.
   *
   * Ahora sale del propio detalle: o hay servidores declarados y se anuncia
   * cuantos son, o no hay ninguno y se dice que se esta probando el reproductor
   * de la propia fuente, que es el caso real de las series.
   */
  const enPrueba = useMemo(() => {
    const n = detail?.servers.length ?? 0;
    if (!detail) return 'leyendo la página de la fuente';
    if (n === 0) return 'probando el reproductor de la fuente';
    return n === 1 ? 'probando 1 servidor' : `probando ${n} servidores`;
  }, [detail]);

  // El siguiente servidor que NO se ha probado todavia. Si todos los de la lista
  // quedaron descartados, el boton no aparece: reintentar uno que ya fallo gastaria
  // otros siete segundos para dar exactamente el mismo resultado.
  const nextId = detail?.servers.find((s) => !probados.includes(s.id))?.id;

  const indice = detail?.episodes ?? null;

  return (
    <div className="detail">
      <div className="detail-bar">
        <button type="button" className="detail-back" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M19 12H5M11 6l-6 6 6 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Resultados
        </button>
      </div>

      <div className="detail-grid">
        <div className="detail-side">
          <div className="detail-art">
            {poster ? (
              <img src={`/api/img?u=${encodeURIComponent(poster)}`} alt="" decoding="async" />
            ) : (
              <div className="card-fallback" aria-hidden="true">
                <span>{title.charAt(0).toUpperCase()}</span>
              </div>
            )}
          </div>

          <h1 className="detail-title">{title}</h1>
          <p className="detail-facts">
            {detail?.kind
              ? KIND_LABEL[detail.kind]
              : card.kind
                ? KIND_LABEL[card.kind]
                : 'Película'}
            {card.year && <span aria-hidden="true"> · </span>}
            {card.year}
            {card.rating && <span className="card-rating">{card.rating}</span>}
          </p>

          {(detail?.synopsis ?? card.synopsis) && (
            <p className="detail-synopsis">{detail?.synopsis ?? card.synopsis}</p>
          )}

          <button
            type="button"
            className="fav-btn"
            data-on={favorito || undefined}
            aria-pressed={favorito}
            onClick={() => toggleFavorite(card)}
          >
            <IconStar size={15} filled={favorito} />
            {favorito ? 'En favoritos' : 'Añadir a favoritos'}
          </button>

          {fuentes.length > 1 && (
            <div className="switcher">
              <h2 className="switcher-label">Fuente</h2>
              <div className="switcher-options">
                {fuentes.map((id) => {
                  const e = entradasPorFuente.get(id)!;
                  return (
                    <button
                      key={id}
                      type="button"
                      className="switcher-option"
                      data-active={e.source === entry?.source || undefined}
                      style={{ ['--accent' as string]: accentBySource[id] ?? '#8d8983' }}
                      onClick={() => pickSource(e)}
                    >
                      {e.sourceLabel}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {indice && indice.seasons.length > 0 && (
            <EpisodePicker indice={indice} pending={pending} onPick={pickEpisode} />
          )}

          {detail && detail.servers.length > 0 && (
            <div className="switcher">
              <h2 className="switcher-label">
                Servidor
                {detail.servers.length > 1 && (
                  <span className="switcher-hint">si uno falla, prueba otro</span>
                )}
              </h2>
              <div className="switcher-options">
                {detail.servers.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="switcher-option"
                    data-active={s.id === serverId || undefined}
                    disabled={pending}
                    onClick={() => void pickServer(s.id)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="detail-stage">
          {pending && (
            <div className="stage-wait" role="status">
              <span className="stage-spinner" aria-hidden="true" />
              <p className="stage-wait-title">
                {indice?.episode ? `Buscando T${indice.episode.season}E${indice.episode.episode}` : 'Buscando un servidor que funcione'}
              </p>
              <p className="stage-wait-sub">
                {elapsed} s · {enPrueba}
              </p>
              <p className="stage-wait-note">
                Arrancamos un navegador para descifrar la dirección del vídeo. Tarda.
              </p>
            </div>
          )}

          {playback.phase === 'listo' && (
            <PlayerBridge
              state={playback}
              title={title}
              poster={poster}
              reconnecting={recuperando}
              onFail={manejarFalloReproductor}
              onProgress={guardarProgreso}
            />
          )}

          {playback.phase === 'fallo' && (
            <Failure
              playback={playback}
              onTryAnother={nextId ? () => void pickServer(nextId) : undefined}
              onChangeSource={
                fuentes.length > 1
                  ? () => {
                      const i = fuentes.indexOf(entry?.source ?? fuentes[0]);
                      pickSource(entradasPorFuente.get(fuentes[(i + 1) % fuentes.length])!);
                    }
                  : undefined
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Selector de temporada y capitulo.
 *
 * Tres cosas en un bloque, y en este orden por un motivo concreto: primero de que
 * temporada, luego de que capitulo, y el nombre del capitulo debajo como
 * respuesta a la pregunta de "que voy a ver ahora". El nombre va al final porque es
 * lo que se lee despues de haber pulsado, no lo que se busca.
 *
 * Anterior y siguiente cambian de capitulo y saltan de temporada en el borde.
 * Cruzar de temporada cuesta una peticion mas, porque cada fuente guarda la lista
 * de capitulos de una temporada en un sitio distinto: en pelisplushd esta en la
 * pagina de la serie y en cuevana hay que pedirla. No es un coste por capitulo, es
 * un coste por temporada, asi que a cambio de un clic mas en el borde se puede
 * pasar de T9E10 a T10E1 sin volver al principio.
 */
function EpisodePicker({
  indice,
  pending,
  onPick,
}: {
  indice: SeriesIndex;
  pending: boolean;
  onPick(pos: EpisodeRef): void;
}) {
  const { seasons, episodes, episode } = indice;

  const vecindad = useMemo(() => vecinos(episodes, episode, seasons), [episodes, episode, seasons]);
  const actual = episodes.find((e) => e.episode === episode?.episode) ?? null;
  const temporada = seasons.find((s) => s.season === episode?.season) ?? null;
  const total = episodes.length || (temporada ? temporada.last - temporada.first + 1 : 0);

  return (
    <div className="switcher ep">
      <h2 className="switcher-label">
        Temporada
        {seasons.length > 1 && <span className="switcher-hint">{seasons.length} disponibles</span>}
      </h2>
      <div className="switcher-options ep-seasons">
        {seasons.map((s) => (
          <button
            key={s.season}
            type="button"
            className="switcher-option ep-season"
            data-active={s.season === episode?.season || undefined}
            title={s.name ?? `Temporada ${s.season}`}
            disabled={pending}
            onClick={() => onPick({ season: s.season, episode: s.first })}
          >
            T{s.season}
          </button>
        ))}
      </div>

      <h2 className="switcher-label ep-label">
        <span>
          Episodio
          {total > 0 && <span className="switcher-hint">{total}</span>}
        </span>
        <span className="ep-nav">
          <button
            type="button"
            className="ep-step"
            disabled={pending || !vecindad.anterior}
            onClick={() => vecindad.anterior && onPick(vecindad.anterior)}
            aria-label="Capítulo anterior"
          >
            ‹
          </button>
          <button
            type="button"
            className="ep-step"
            disabled={pending || !vecindad.siguiente}
            onClick={() => vecindad.siguiente && onPick(vecindad.siguiente)}
            aria-label="Capítulo siguiente"
          >
            ›
          </button>
        </span>
      </h2>

      <div className="switcher-options ep-episodes">
        {episodes.length === 0 ? (
          <p className="ep-empty">No se pudo leer la lista de capítulos de esta temporada.</p>
        ) : (
          episodes.map((e) => (
            <EpisodeButton
              key={e.episode}
              ep={e}
              active={e.episode === episode?.episode}
              pending={pending}
              onPick={onPick}
            />
          ))
        )}
      </div>

      {actual && (
        <p className="ep-note">
          <strong>Capítulo {actual.episode}</strong>
          {actual.title && <span> · {actual.title}</span>}
          <span className="ep-meta">
            {actual.runtime ? ` · ${actual.runtime} min` : ''}
            {actual.airDate ? ` · ${formatarFecha(actual.airDate)}` : ''}
          </span>
        </p>
      )}
    </div>
  );
}

/**
 * Capitulo actual.
 *
 * Un capitulo que la fuente declara sin reproductor se apaga pero no desaparece:
 * saber que el 10 existe y que no se puede ver es distinto de que no exista, y un
 * hueco en la numeracion sin explicacion parece un fallo de lectura.
 */
function EpisodeButton({
  ep,
  active,
  pending,
  onPick,
}: {
  ep: EpisodeInfo;
  active: boolean;
  pending: boolean;
  onPick(pos: EpisodeRef): void;
}) {
  return (
    <button
      type="button"
      className="switcher-option ep-ep"
      data-active={active || undefined}
      disabled={pending || !ep.available}
      title={ep.title ?? undefined}
      onClick={() => onPick({ season: ep.season, episode: ep.episode })}
    >
      {ep.episode}
    </button>
  );
}

/**
 * Capitulo anterior y siguiente.
 *
 * Dentro de la temporada salen de la lista que ya esta en memoria. En el borde
 * cruzan de temporada y usan el rango que declara el indice de temporadas, que es
 * el unico dato fiable sin haber pedido esa lista.
 */
function vecinos(
  episodes: EpisodeInfo[],
  episode: EpisodeRef | null,
  seasons: { season: number; first: number; last: number }[],
): { anterior: EpisodeRef | null; siguiente: EpisodeRef | null } {
  if (!episode) return { anterior: null, siguiente: null };

  const i = episodes.findIndex((e) => e.episode === episode.episode);
  if (i >= 0) {
    return {
      anterior: i > 0 ? capDe(episodes[i - 1]) : temporadaAnterior(seasons, episode.season),
      siguiente:
        i < episodes.length - 1
          ? capDe(episodes[i + 1])
          : temporadaSiguiente(seasons, episode.season),
    };
  }

  // La lista no esta cargada todavia: solo se puede saltar de temporada.
  return {
    anterior: temporadaAnterior(seasons, episode.season),
    siguiente: temporadaSiguiente(seasons, episode.season),
  };
}

function capDe(e: EpisodeInfo): EpisodeRef {
  return { season: e.season, episode: e.episode };
}

function temporadaAnterior(
  seasons: { season: number; first: number; last: number }[],
  season: number,
): EpisodeRef | null {
  const antes = seasons.filter((s) => s.last >= s.first && s.season < season).at(-1);
  return antes ? { season: antes.season, episode: antes.last } : null;
}

function temporadaSiguiente(
  seasons: { season: number; first: number; last: number }[],
  season: number,
): EpisodeRef | null {
  const despues = seasons.find((s) => s.last >= s.first && s.season > season);
  return despues ? { season: despues.season, episode: despues.first } : null;
}

/** "2017-08-06" en castellano, sin la zona horaria que no viene. */
function formatarFecha(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const meses = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  return `${Number(m[3])} de ${meses[Number(m[2]) - 1]} de ${m[1]}`;
}

/**
 * Envoltura del reproductor.
 *
 * Antes aqui se metia un 'embed' dentro del reproductor cuando la fuente solo
 * ofrecia eso. El iframe que devuelve la fuente muestra su propio cartel y su
 * propio boton de play, y ese boton no hace nada desde aqui: es un reproductor
 * que no funciona y parece que si. Ahora `toPlayback` convierte ese caso en
 * 'fallo' antes de llegar aqui, de modo que esta funcion solo recibe streams
 * reales y no tiene nada que decidir.
 */
function PlayerBridge({
  state,
  title,
  poster,
  reconnecting,
  onFail,
  onProgress,
}: {
  state: Extract<PlaybackState, { phase: 'listo' }>;
  title: string;
  poster: string | null;
  reconnecting: boolean;
  onFail(motivo: string, trace: string[], enSegundo: number): void;
  onProgress(seconds: number, duration: number | null): void;
}) {
  return (
    <VideoPlayer
      stream={state}
      title={title}
      poster={poster}
      reconnecting={reconnecting}
      onFail={onFail}
      onProgress={onProgress}
    />
  );
}

/**
 * Titular del informe de fallo.
 *
 * Se construye a partir de lo que se probo de verdad, nunca de la lista
 * completa. Con un servidor con captcha y el resto sin mirar, decir "ninguno de
 * los servidores dio stream" era falso y confundia mas que ayudaba: hacia
 * pensar que la fuente estaba rota entera cuando habia servidores sin tocar.
 *
 * Por eso el texto siempre lleva el recuento real y, si queda algo sin probar,
 * lo dice. Es peor-sounding y mas cierto, que es el orden correcto.
 */
function resumenDeFallos(attempts: Attempt[], sinProbar: number): string {
  const probados = attempts.length;
  if (probados === 0) return 'No se encontró ningún servidor en esta fuente.';

  const plural = (x: number, s: string, p: string) => `${x} ${x === 1 ? s : p}`;

  if (sinProbar > 0) {
    return (
      `Probamos ${plural(probados, 'servidor', 'servidores')} y ninguno entregó vídeo, ` +
      `pero ${plural(sinProbar, 'quedó', 'quedaron')} sin probar.`
    );
  }

  return probados === 1
    ? 'El único servidor de esta fuente falló.'
    : `Los ${probados} servidores de esta fuente fallaron.`;
}

function fallo(
  motivo: string,
  trace: string[],
  attempts: Attempt[],
  probados: string[],
  paginaOriginal: string | null,
): PlaybackState {
  return { phase: 'fallo', motivo, trace, attempts, probados, paginaOriginal };
}

/**
 * Traduce la respuesta del backend al estado de la vista.
 *
 * Un embed no se traduce a 'listo'. Se marca como fallo y se guarda la pagina a
 * mano, porque es justo el caso que se describe como "el reproductor con el
 * cartel de la pelicula y no se le puede dar play".
 *
 * Cuando ocurre, el embed es solo el plan B: el backend ya habia descartado
 * varios servidores reales por el camino. Sus motivos se conservan y se enseña
 * la respuesta completa, porque "esta fuente solo entrega un incrustado" sin
 * decir cuales se probaron y por que fallaron deja al usuario sin ninguna idea
 * de si probar mas servidores tiene sentido.
 */
function toPlayback(
  stream: ResolvedStream,
  paginaOriginal: string,
  respuesta?: TitleResponse,
): PlaybackState {
  if (stream.type === 'embed') {
    const fallidos = respuesta?.attempts.filter((a) => !a.ok) ?? [];

    // El titular no puede decir "fallaron" si dejamos servidores sin mirar.
    // El helper ya tiene en cuenta `sinProbar`, asi que aqui solo hace falta
    // distinguir el caso sin ningun servidor que mirar, que es otro problema.
    const motivo = fallidos.length
      ? resumenDeFallos(fallidos, respuesta?.sinProbar ?? 0)
      : 'Esta fuente solo entrega un reproductor incrustado, sin una dirección de vídeo que podamos reproducir aquí.';

    return {
      phase: 'fallo',
      motivo,
      trace: respuesta?.trace ?? [],
      attempts: fallidos,
      probados: respuesta ? respuesta.attempts.map((a) => a.serverId) : [],
      paginaOriginal: stream.url || paginaOriginal,
    };
  }
  return {
    phase: 'listo',
    url: stream.url,
    type: stream.type,
    serverLabel: stream.serverLabel,
    proxied: stream.proxied,
  };
}

/**
 * Junta los servidores que fallaron por lo mismo.
 *
 * Medido: cinco servidores de pelisflix, tres con la misma frase repetida y
 * las etiquetas casi identicas. En fila, el informe ocupaba media pantalla para
 * decir dos veces lo mismo, y ademas hacia pensar que eran fallos distintos.
 * Esa confusion era la que llevaba a concluir que la fuente entera estaba
 * rota. Agrupado se lee de un vistazo: estos tres fallan por esto, estos
 * otros dos por lo otro.
 */
function agruparPorMotivo(attempts: Attempt[]): { motivo: string; etiquetas: string[] }[] {
  const porMotivo = new Map<string, string[]>();

  for (const a of attempts) {
    const motivo = a.reason ?? 'sin motivo registrado';
    const lista = porMotivo.get(motivo);
    if (lista) lista.push(a.label);
    else porMotivo.set(motivo, [a.label]);
  }

  return [...porMotivo].map(([motivo, etiquetas]) => ({ motivo, etiquetas }));
}

/** Panel de fallo: explica, en vez de dejar un reproductor muerto en pantalla. */
function Failure({
  playback,
  onTryAnother,
  onChangeSource,
}: {
  playback: Extract<PlaybackState, { phase: 'fallo' }>;
  onTryAnother?: () => void;
  onChangeSource?: () => void;
}) {
  const grupos = agruparPorMotivo(playback.attempts);

  return (
    <div className="stage-fail">
      <p className="stage-fail-title">No se pudo reproducir</p>
      <p className="stage-fail-reason">{playback.motivo}</p>
      {grupos.length > 0 && (
        <ul className="stage-fail-list">
          {grupos.map((g) => (
            <li key={g.motivo} className="stage-fail-item">
              <span className="stage-fail-server">{g.etiquetas.join(', ')}</span>
              <span className="stage-fail-why">{g.motivo}</span>
            </li>
          ))}
        </ul>
      )}

      {(onTryAnother || onChangeSource) && (
        <div className="stage-fail-actions">
          {onTryAnother && (
            <button type="button" className="primary" onClick={onTryAnother}>
              Probar otro servidor
            </button>
          )}
          {onChangeSource && (
            <button type="button" className="ghost" onClick={onChangeSource}>
              Cambiar de fuente
            </button>
          )}
        </div>
      )}

      {playback.paginaOriginal && (
        <a
          className="stage-fail-link"
          href={playback.paginaOriginal}
          target="_blank"
          rel="noreferrer noopener"
        >
          Abrir la página en el navegador
        </a>
      )}

      {/*
       * La traza va siempre, haya intentos o no.
       *
       * Antes solo se mostraba cuando no habia intentos, porque la lista de
       * motivos ya explicaba el fallo. Pero ahora los motivos son frases cortas
       * a proposito, sin URLs, y el detalle queda aqui: es el unico sitio donde
       * tiene sentido ver por que se cayo el servidor.
       */}
      {playback.trace.length > 0 && (
        <details className="trace">
          <summary>Detalle técnico ({playback.trace.length})</summary>
          <ol className="trace-list">
            {playback.trace.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
