/**
 * Copia a `dist/` los ficheros que Electron necesita leer tal cual.
 *
 * No hay alternativa: el proceso principal busca la pantalla de arranque con
 * `__dirname`, y un HTML no se importa desde un bundle de esbuild. Sin este paso
 * el fichero se queda en `electron/` y, al arrancar la aplicacion, la ventana
 * carga una ruta que no existe y se queda en blanco.
 *
 * Se hace en Node y no con `cp` a proposito: el proyecto se compila en Windows y
 * `cp` no existe alli, asi que un comando de shell dejaria la aplicacion rota
 * justo en la plataforma para la que se empaqueta.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

/** De donde sale cada fichero, y donde tiene que estar al arrancar. */
const FICHEROS = [['electron/arranque.html', 'dist/electron/arranque.html']];

for (const [desde, hasta] of FICHEROS) {
  const destino = join(RAIZ, hasta);
  mkdirSync(dirname(destino), { recursive: true });
  copyFileSync(join(RAIZ, desde), destino);
  console.log(`copiado ${desde} -> ${hasta}`);
}