import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PATHS } from './config.js';
import type { EpisodeRef, PlaybackProgress, SavedTitle, TitleCard } from './sources/types.js';

/**
 * Biblioteca local: historial y favoritos.
 *
 * Vive en un unico JSON dentro de la carpeta de datos (`PATHS.userData`), no en
 * el navegador. La razon es la misma por la que el servidor existe: es el unico
 * sitio que sobrevive a limpiar la cache de Chromium y el unico que podria
 * compartirse con otro dispositivo de la red mas adelante. El coste es que la
 * aplicacion no puede leerlo con el servidor apagado, y eso ya daba igual:
 * sin servidor no hay nada que buscar ni reproducir.
 *
 * Las escrituras son atomicas (fichero temporal + rename) para que un corte a
 * mitad no deje un JSON truncado que rompa el siguiente arranque.
 */

const FILE = path.join(PATHS.userData, 'library.json');

/**
 * Tope del historial.
 *
 * Es un historial para reencontrar algo, no un registro: por encima del
 * centenar nadie baja y el fichero solo crece. Al recortar se tira lo mas
 * antiguo, que es lo que menos se va a echar de menos.
 */
const MAX_HISTORY = 120;

interface Library {
  version: 1;
  history: SavedTitle[];
  favorites: SavedTitle[];
}

let cache: Library | null = null;

/**
 * Ultimo error de escritura, si lo hubo.
 *
 * Existe para que un fallo al guardar deje de ser invisible: antes solo se
 * escribia en `stderr`, que en la aplicacion empaquetada no lo lee nadie, y el
 * usuario veia como los favoritos se esfumaban en cada cierre sin ninguna pista.
 * Se expone en `/api/health`.
 */
let ultimoError: string | null = null;

function empty(): Library {
  return { version: 1, history: [], favorites: [] };
}

function load(): Library {
  if (cache) return cache;

  try {
    if (existsSync(FILE)) {
      const raw = JSON.parse(readFileSync(FILE, 'utf8')) as Partial<Library>;
      cache = {
        version: 1,
        history: Array.isArray(raw.history) ? raw.history.filter(isSavedTitle) : [],
        favorites: Array.isArray(raw.favorites) ? raw.favorites.filter(isSavedTitle) : [],
      };
      return cache;
    }
  } catch (err) {
    // Un fichero corrupto no puede impedir usar la aplicacion: se empieza de
    // cero, que es exactamente lo que el usuario esperaria de un historial roto.
    process.stderr.write(`[miso] biblioteca ilegible, se reinicia: ${String(err)}\n`);
  }

  cache = empty();
  return cache;
}

function save(lib: Library): void {
  cache = lib;
  try {
    mkdirSync(PATHS.userData, { recursive: true });
    const tmp = `${FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify(lib), 'utf8');
    renameSync(tmp, FILE);
    ultimoError = null;
  } catch (err) {
    // El estado en memoria ya cambio; perder la escritura es malo pero no debe
    // tumbar la peticion que la provoco. Se guarda el motivo para poder
    // denunciarlo despues, en lugar de perderlo en un stderr que nadie lee.
    ultimoError = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[miso] no se pudo guardar la biblioteca: ${ultimoError}\n`);
  }
}

/**
 * Estado del fichero de biblioteca, para diagnostico.
 *
 * `error` en null significa que la ultima escritura fue bien (o que aun no se
 * ha escrito nada, que no es un problema: se crea de forma perezosa).
 */
export function libraryStatus(): { file: string; error: string | null } {
  return { file: FILE, error: ultimoError };
}

/**
 * Comprueba que lo que llega por HTTP es un guardado con la forma esperada.
 *
 * El cliente es de confianza relativa (es nuestra propia interfaz), pero esto
 * tambien se sirve en 0.0.0.0 para el movil: sin esta puerta, cualquier cosa en
 * la red podria colar un JSON arbitrario en el fichero.
 */
function isSavedTitle(value: unknown): value is SavedTitle {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<SavedTitle>;
  return (
    typeof v.key === 'string' &&
    v.key.length > 0 &&
    typeof v.at === 'number' &&
    Boolean(v.card) &&
    typeof (v.card as TitleCard).title === 'string'
  );
}

/**
 * Normaliza la posicion de reproduccion guardada.
 *
 * Se acepta solo un segundo finito y no negativo: un NaN o un negativo (que
 * llegan si el reproductor se movio antes de tener metadatos) rompería el
 * calculo de la barra sin aportar nada. `duration` puede faltar y sigue siendo
 * valida la entrada, porque hay fuentes que no la anuncian.
 */
function sanitizeProgress(input: unknown): PlaybackProgress | null {
  if (!input || typeof input !== 'object') return null;
  const p = input as Partial<PlaybackProgress>;
  if (typeof p.seconds !== 'number' || !Number.isFinite(p.seconds) || p.seconds < 0) return null;
  const duration =
    typeof p.duration === 'number' && Number.isFinite(p.duration) && p.duration > 0
      ? p.duration
      : null;
  return { seconds: Math.round(p.seconds), duration: duration === null ? null : Math.round(duration) };
}

/** Normaliza un guardado entrante, o null si no es valido. */
export function sanitize(input: unknown): SavedTitle | null {
  if (!isSavedTitle(input)) return null;
  const { key, card, at, last, progress } = input as SavedTitle;
  const pos: EpisodeRef | null =
    last && Number.isInteger(last.season) && Number.isInteger(last.episode)
      ? { season: last.season, episode: last.episode }
      : null;
  return { key, card, at, last: pos, progress: sanitizeProgress(progress) };
}

export function readLibrary(): { history: SavedTitle[]; favorites: SavedTitle[] } {
  const lib = load();
  return { history: lib.history, favorites: lib.favorites };
}

/** Mete o actualiza un titulo al frente del historial. */
export function recordHistory(entry: SavedTitle): SavedTitle[] {
  const lib = load();
  const history = [entry, ...lib.history.filter((e) => e.key !== entry.key)].slice(0, MAX_HISTORY);
  save({ ...lib, history });
  return history;
}

export function forgetHistory(key: string | null): SavedTitle[] {
  const lib = load();
  const history = key ? lib.history.filter((e) => e.key !== key) : [];
  save({ ...lib, history });
  return history;
}

/** Anade o quita un favorito y dice en que quedo. */
export function toggleFavorite(entry: SavedTitle): { favorited: boolean; favorites: SavedTitle[] } {
  const lib = load();
  const yaEsta = lib.favorites.some((e) => e.key === entry.key);
  const favorites = yaEsta
    ? lib.favorites.filter((e) => e.key !== entry.key)
    : [entry, ...lib.favorites];
  save({ ...lib, favorites });
  return { favorited: !yaEsta, favorites };
}
