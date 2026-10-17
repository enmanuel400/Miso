import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PATHS } from './config.js';

/**
 * Ajustes de la aplicacion, persistidos junto a la biblioteca.
 *
 * Hoy solo guarda que fuentes ha desactivado el usuario, y por eso se guardan
 * las DESACTIVADAS y no las activas: asi una fuente que se anada mas adelante
 * entra encendida sin tener que tocar nada, que es lo que espera quien no ha
 * pedido nada. Guardar la lista de activas obligaria a actualizarla cada vez que
 * el catalogo de fuentes cambia.
 *
 * Vive en `PATHS.userData/settings.json`, con el mismo patron que la biblioteca
 * (carga perezosa, escritura atomica con fichero temporal y rename). El
 * documento se ensena en Desarrollo, pero el estado real lo decide el servidor:
 * la interfaz no guarda preferencias en el navegador.
 */

const FILE = path.join(PATHS.userData, 'settings.json');

interface Settings {
  version: 1;
  /** Ids de fuentes desactivadas. Ausente en el fichero es "todas activas". */
  disabledSources: string[];
}

let cache: Settings | null = null;

/**
 * Ultimo error de escritura, para diagnostico.
 *
 * Igual que en la biblioteca: un fallo al guardar no puede tumbar la peticion
 * que lo provoco, pero tampoco puede quedar invisible en un registro que en la
 * aplicacion empaquetada no lee nadie.
 */
let ultimoError: string | null = null;

function empty(): Settings {
  return { version: 1, disabledSources: [] };
}

function load(): Settings {
  if (cache) return cache;

  try {
    if (existsSync(FILE)) {
      const raw = JSON.parse(readFileSync(FILE, 'utf8')) as Partial<Settings>;
      const desactivadas = Array.isArray(raw.disabledSources)
        ? raw.disabledSources.filter((id): id is string => typeof id === 'string' && id.length > 0)
        : [];
      cache = { version: 1, disabledSources: [...new Set(desactivadas)] };
      return cache;
    }
  } catch (err) {
    // Un fichero corrupto no puede impedir usar la aplicacion: se empieza con
    // todas las fuentes activas, que es el estado neutro.
    process.stderr.write(`[miso] ajustes ilegibles, se reinician: ${String(err)}\n`);
  }

  cache = empty();
  return cache;
}

function save(settings: Settings): void {
  cache = settings;
  try {
    mkdirSync(PATHS.userData, { recursive: true });
    const tmp = `${FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify(settings), 'utf8');
    renameSync(tmp, FILE);
    ultimoError = null;
  } catch (err) {
    ultimoError = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[miso] no se pudieron guardar los ajustes: ${ultimoError}\n`);
  }
}

/** Estado del fichero de ajustes, para `/api/health`. */
export function settingsStatus(): { file: string; error: string | null } {
  return { file: FILE, error: ultimoError };
}

/** Si la fuente esta activa. Por defecto, si. */
export function isSourceEnabled(id: string): boolean {
  return !load().disabledSources.includes(id);
}

/** Activa o desactiva una fuente. El id lo valida quien llama contra el catalogo. */
export function setSourceEnabled(id: string, enabled: boolean): void {
  const actual = load();
  const sinEsta = actual.disabledSources.filter((otro) => otro !== id);
  save({ ...actual, disabledSources: enabled ? sinEsta : [...sinEsta, id] });
}

/** Vista de solo lectura para la respuesta HTTP. */
export function readSettings(): { disabledSources: string[] } {
  return { disabledSources: [...load().disabledSources] };
}
