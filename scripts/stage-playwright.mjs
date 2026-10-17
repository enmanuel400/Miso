/**
 * Prepara los navegadores de Playwright dentro de `dist/` antes de empaquetar.
 *
 * El empaquetado de escritorio necesita el binario de Chromium al lado de la
 * aplicacion, pero `package.json` no puede saber donde lo guarda cada maquina.
 * Antes apuntaba a `/home/<usuario>/.cache/ms-playwright/...`, que solo existia
 * en el equipo donde se escribio: al compilar en otro sistema operativo —o en
 * otra cuenta— electron-builder buscaba ficheros que no estaban y el paquete
 * salia sin navegador.
 *
 * Aqui se localiza la cache de Playwright con su propia API (o con su variable
 * de entorno) y se copia a `dist/playwright/<nombre>`, una ruta relativa que el
 * `extraResources` de `package.json` entiende en cualquier plataforma.
 *
 * Si no aparece ningun navegador, se avisa y se dejan los directorios vacios:
 * el empaquetado no falla, pero la app solo usara la extraccion estatica hasta
 * que se ejecute `npx playwright install chromium`.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = path.join(RAIZ, 'dist', 'playwright');

/** Carpeta donde Playwright guarda sus navegadores en esta maquina. */
function raizNavegadores() {
  const desdeEntorno = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (desdeEntorno && desdeEntorno !== '0') return desdeEntorno;

  // La via fiable: preguntarle a Playwright donde tiene el binario y subir hasta
  // el directorio que contiene las carpetas `chromium-*`.
  try {
    const { chromium } = require('playwright');
    let dir = path.dirname(chromium.executablePath());
    while (path.dirname(dir) !== dir) {
      if (path.basename(dir) === 'ms-playwright') return dir;
      dir = path.dirname(dir);
    }
  } catch {
    /* Playwright no esta instalado o no tiene navegadores descargados */
  }

  // Respaldo por plataforma, para cuando la API anterior no esta disponible.
  if (process.platform === 'win32') {
    const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(base, 'ms-playwright');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
  }
  const cache = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
  return path.join(cache, 'ms-playwright');
}

/** La carpeta `chromium-<version>` mas reciente cuyo nombre empieza por `prefijo`. */
function buscarCarpeta(raiz, prefijo) {
  if (!existsSync(raiz)) return null;

  const candidatos = readdirSync(raiz)
    .filter((nombre) => nombre.startsWith(prefijo))
    .map((nombre) => path.join(raiz, nombre))
    .filter((ruta) => existsSync(ruta))
    // Orden descendente por numero de version (1243 > 999) y, si empataran, por
    // nombre: la primera es la mas nueva.
    .sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));

  return candidatos[0] ?? null;
}

const raiz = raizNavegadores();
const origenes = [
  { destino: 'chromium', origen: buscarCarpeta(raiz, 'chromium-') },
  { destino: 'chromium-headless-shell', origen: buscarCarpeta(raiz, 'chromium_headless_shell-') },
];

rmSync(DESTINO, { recursive: true, force: true });
let copiados = 0;

for (const { destino, origen } of origenes) {
  const salida = path.join(DESTINO, destino);

  if (!origen) {
    // El directorio existe aunque este vacio: `extraResources` no admite una
    // ruta que falte, y un directorio vacio no rompe el empaquetado.
    mkdirSync(salida, { recursive: true });
    continue;
  }

  mkdirSync(path.dirname(salida), { recursive: true });
  cpSync(origen, salida, { recursive: true });
  copiados += 1;
  console.log(`[playwright] ${path.relative(RAIZ, origen)} -> dist/playwright/${destino}`);
}

if (copiados === 0) {
  console.warn(
    '\n[miso] No se encontro ningun navegador de Playwright en esta maquina.\n' +
      '       El paquete se generara igual, pero solo funcionara la extraccion\n' +
      '       estatica. Para incluir el navegador, ejecuta antes:\n' +
      '           npx playwright install chromium\n',
  );
} else {
  console.log(`[miso] navegadores preparados para empaquetar: ${copiados}.`);
}
