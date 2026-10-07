import { useCallback, useEffect, useRef, useState } from 'react';
import type { ResolvedStream } from '../lib/types.js';

/**
 * Reproductor de HLS con controles propios.
 *
 * Se descartan los controles nativos a proposito. Los de Chromium son un
 * rectangulo gris que cambia segun la version del sistema, no se integrates con
 * el resto de la aplicacion y ocupan un ancho fijo que ignora el tamano real del
 * video. Ademas no ofrecen nada de lo que aqui hace falta: barra de búfer,
 * atajos de teclado y un estado de carga legible.
 *
 * `hls.js` se carga bajo demanda y solo cuando hace falta: son casi 400 kB que
 * no tienen nada que ver con buscar titulos.
 */

export interface PlayableStream {
  url: string;
  type: ResolvedStream['type'];
  proxied?: boolean;
}

interface Props {
  stream: PlayableStream;
  title: string;
  poster: string | null;
  onFail(motivo: string, trace: string[]): void;
}

/** URL de reproduccion, ya pasada por el proxy cuando hace falta. */
function playbackUrl(stream: PlayableStream): string {
  if (!stream.proxied && !/^\/api\//.test(stream.url)) {
    return `/api/hls?u=${encodeURIComponent(stream.url)}`;
  }
  return stream.url;
}

const SKIP_SEC = 10;

export function VideoPlayer({ stream, title, poster, onFail }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);

  /**
   * El aviso de fallo se guarda en una ref y no en una dependencia.
   *
   * El padre lo pasa como funcion suelta, asi que cambia de identidad en cada
   * render. Si el efecto que registra los oyentes del <video> la declarara como
   * dependencia, se desregistraria y volveria a registrar en cada render, lo
   * cual ademas puede perder un `error` justo en el instante en que ocurre.
   */
  const onFailRef = useRef(onFail);
  onFailRef.current = onFail;
  const avisarFallo = useCallback(
    (motivo: string, trace: string[]) => onFailRef.current(motivo, trace),
    [],
  );

  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [idle, setIdle] = useState(false);
  const [engine, setEngine] = useState<string | null>(null);

  const url = playbackUrl(stream);

  // ---------------------------------------------------------------- motor

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.pause();
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    setBuffered(0);

    if (stream.type !== 'hls') {
      video.src = url;
      void video.play().catch(() => undefined);
      setEngine('directo');
      return;
    }

    let hls: { destroy(): void } | null = null;
    let cancelled = false;

    void import('hls.js')
      .then(({ default: Hls }) => {
        if (cancelled) return;

        // El orden de estas dos comprobaciones no es el intuitivo.
        //
        // Chromium responde "maybe" a canPlayType('application/vnd.apple.mpegurl')
        // aunque NO pueda reproducir HLS: necesita MSE. Medido en esta app, ese
        // atajo dejaba el <video> con error 4 y sin sonar, que es la peor
        // forma de fallo posible, la de un reproductor que parece vivo.
        //
        // Por eso se pregunta primero por hls.js, que es el que usa MSE de
        // verdad. Solo si no puede trabajar tiene sentido el reproductor nativo,
        // que existe para Safari y no para nosotros.
        if (Hls.isSupported()) {
          const instance = new Hls({
            enableWorker: true,
            lowLatencyMode: false,
            manifestLoadingTimeOut: 30_000,
            levelLoadingTimeOut: 30_000,
            fragLoadingTimeOut: 45_000,
          });

          instance.loadSource(url);
          instance.attachMedia(video);
          instance.on(Hls.Events.ERROR, (_e: unknown, data: { fatal: boolean; details?: string }) => {
            if (data.fatal) avisarFallo(`Fallo de reproducción: ${data.details ?? 'desconocido'}`, []);
          });

          hls = instance;
          setEngine('hls.js');
          return;
        }

        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = url;
          void video.play().catch(() => undefined);
          setEngine('nativo');
          return;
        }

        avisarFallo('Este navegador no puede reproducir este formato de vídeo.', []);
      })
      .catch(() => {
        if (!cancelled) avisarFallo('No se pudo cargar el reproductor de vídeo.', []);
      });

    return () => {
      cancelled = true;
      hls?.destroy();
    };
  }, [url, stream.type, avisarFallo]);

  // ------------------------------------------------------------- progreso

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTime = () => setCurrent(video.currentTime);
    const onMeta = () => setDuration(Number.isFinite(video.duration) ? video.duration : 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onWaiting = () => setWaiting(true);
    const onPlaying = () => setWaiting(false);
    const onVolume = () => {
      setVolume(video.volume);
      setMuted(video.muted);
    };
    const onProgress = () => {
      if (!video.buffered.length || !video.duration) return setBuffered(0);
      setBuffered(video.buffered.end(video.buffered.length - 1) / video.duration);
    };
    // El error del propio elemento hay que escucharlo. hls.js solo informa de
    // sus propios fallos: si el <video> no puede con la respuesta que le llega,
    // se queda en error y en silencio, y el usuario ve un reproductor que no
    // hace nada y ninguna explicacion.
    const onError = () => {
      const code = video.error?.code;
      const motivo =
        code === 1
          ? 'la reproducción se canceló'
          : code === 2
            ? 'no se pudo leer el vídeo desde el servidor'
            : code === 3
              ? 'no se pudo descifrar el vídeo'
              : code === 4
                ? 'el formato del vídeo no es compatible'
                : 'el vídeo no se pudo reproducir';
      avisarFallo(`No se pudo reproducir: ${motivo}.`, []);
    };

    video.addEventListener('timeupdate', onTime);
    video.addEventListener('durationchange', onMeta);
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('volumechange', onVolume);
    video.addEventListener('progress', onProgress);
    video.addEventListener('error', onError);

    return () => {
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('durationchange', onMeta);
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('volumechange', onVolume);
      video.removeEventListener('progress', onProgress);
      video.removeEventListener('error', onError);
    };
  }, [avisarFallo]);

  // Los controles se ocultan mientras se mira, y vuelven al mover el raton.
  useEffect(() => {
    if (!playing) return setIdle(false);
    let t: ReturnType<typeof setTimeout>;
    const wake = () => {
      setIdle(false);
      clearTimeout(t);
      t = setTimeout(() => setIdle(true), 2600);
    };
    wake();
    const events = ['pointermove', 'pointerdown', 'keydown'] as const;
    for (const e of events) window.addEventListener(e, wake, { passive: true });
    return () => {
      clearTimeout(t);
      for (const e of events) window.removeEventListener(e, wake);
    };
  }, [playing]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // -------------------------------------------------------------- acciones

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
  }, []);

  const seek = useCallback((to: number) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration)) return;
    v.currentTime = Math.max(0, Math.min(v.duration, to));
  }, []);

  const nudge = useCallback((delta: number) => seek((videoRef.current?.currentTime ?? 0) + delta), [seek]);

  const toggleFullscreen = useCallback(() => {
    const shell = shellRef.current;
    if (!shell) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void shell.requestFullscreen().catch(() => undefined);
  }, []);

  const setVol = useCallback((next: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = Math.max(0, Math.min(1, next));
    v.muted = next === 0;
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
  }, []);

  // Atajos: los mismos que la gente ya tiene en la cabeza de otros reproductores.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          toggle();
          break;
        case 'ArrowRight':
          e.preventDefault();
          nudge(SKIP_SEC);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          nudge(-SKIP_SEC);
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case 'ArrowUp':
          e.preventDefault();
          setVol(volume + 0.1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVol(volume - 0.1);
          break;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, nudge, toggleFullscreen, toggleMute, setVol, volume]);

  const progress = duration > 0 ? current / duration : 0;

  return (
    <div
      ref={shellRef}
      className="vp"
      data-idle={idle && playing ? '' : undefined}
      onDoubleClick={toggleFullscreen}
    >
      <video
        ref={videoRef}
        className="vp-video"
        poster={poster ? `/api/img?u=${encodeURIComponent(poster)}` : undefined}
        playsInline
        aria-label={title}
        onClick={toggle}
      />

      {!playing && !waiting && (
        <button type="button" className="vp-bigplay" onClick={toggle} aria-label="Reproducir">
          <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
          </svg>
        </button>
      )}

      {waiting && (
        <div className="vp-buffering" role="status">
          <span className="stage-spinner" aria-hidden="true" />
          <span>Cargando vídeo…</span>
        </div>
      )}

      <div className="vp-bar">
        <button
          type="button"
          className="vp-btn"
          onClick={toggle}
          aria-label={playing ? 'Pausa' : 'Reproducir'}
        >
          {playing ? (
            <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" />
            </svg>
          ) : (
            <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
            </svg>
          )}
        </button>

        <span className="vp-time">{clock(current)}</span>

        <div
          className="vp-track"
          role="slider"
          tabIndex={0}
          aria-label="Progreso"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(current)}
          aria-valuetext={`${clock(current)} de ${clock(duration)}`}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') nudge(SKIP_SEC);
            if (e.key === 'ArrowLeft') nudge(-SKIP_SEC);
          }}
          onPointerDown={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            seek(((e.clientX - rect.left) / rect.width) * duration);
          }}
        >
          <span className="vp-track-rail" />
          <span className="vp-track-buffer" style={{ width: `${buffered * 100}%` }} />
          <span className="vp-track-fill" style={{ width: `${progress * 100}%` }} />
          <span className="vp-track-knob" style={{ left: `${progress * 100}%` }} />
        </div>

        <span className="vp-time vp-time-total">{clock(duration)}</span>

        <button
          type="button"
          className="vp-btn"
          onClick={toggleMute}
          aria-label={muted ? 'Quitar silencio' : 'Silenciar'}
        >
          <Icon muted={muted || volume === 0} level={volume} />
        </button>

        <input
          className="vp-volume"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          onChange={(e) => setVol(Number(e.target.value))}
          aria-label="Volumen"
        />

        <button
          type="button"
          className="vp-btn"
          onClick={toggleFullscreen}
          aria-label={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
        >
          {fullscreen ? (
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>
      </div>

      {engine && (
        <span className="vp-engine" aria-hidden="true">
          {engine}
        </span>
      )}
    </div>
  );
}

/** Segundos a m:ss o h:mm:ss. */
function clock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return h > 0 ? `${h}:${mm}:${String(s).padStart(2, '0')}` : `${mm}:${String(s).padStart(2, '0')}`;
}

function Icon({ muted, level }: { muted: boolean; level: number }) {
  if (muted) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
        <path d="M16 9.5l5 5M21 9.5l-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      {level > 0.02 && (
        <path
          d="M16.5 8.5a5 5 0 010 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      )}
      {level > 0.55 && (
        <path
          d="M19 6a8.5 8.5 0 010 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
