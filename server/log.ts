import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';
import { PATHS } from './config.js';

/**
 * Registro de diagnostico.
 *
 * Escribe en `miso.log` dentro de la carpeta de datos del usuario. No es un
 * capricho: en la aplicacion empaquetada no hay terminal donde leer `stderr`, y
 * cuando una reproduccion se corta a los veinte minutos la unica forma de saber
 * por que es que alguien lo haya apuntado. Aqui acaban los errores del proxy de
 * video y los que reporta el propio reproductor.
 *
 * Todo es tolerante a fallos: registrar nunca puede tumbar la peticion que lo
 * provoco. Si no se puede escribir, se sigue igual.
 */

const FILE = path.join(PATHS.userData, 'miso.log');

/** Tope del fichero. Al superarlo se rota a `miso.log.1` y se empieza de cero. */
const MAX_BYTES = 2 * 1024 * 1024;

function rotate(): void {
  try {
    if (statSync(FILE).size < MAX_BYTES) return;
    renameSync(FILE, `${FILE}.1`);
  } catch {
    // El fichero todavia no existe: no hay nada que rotar.
  }
}

export function logLine(message: string): void {
  const line = `${new Date().toISOString()} ${message}\n`;
  try {
    mkdirSync(PATHS.userData, { recursive: true });
    rotate();
    appendFileSync(FILE, line, 'utf8');
  } catch {
    /* el registro nunca tumba nada */
  }
  process.stderr.write(`[miso] ${message}\n`);
}

/** Linea con un ambito (`hls`, `reproductor`, `biblioteca`...) y un detalle opcional. */
export function logEvent(scope: string, message: string, extra?: unknown): void {
  let cola = '';
  if (extra !== undefined && extra !== null) {
    cola = ` · ${typeof extra === 'string' ? extra : safeJson(extra)}`;
  }
  logLine(`[${scope}] ${message}${cola}`);
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
