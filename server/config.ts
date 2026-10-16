import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

/** Puerto por defecto. Alto y poco usado para no chocar con otras apps. */
export const DEFAULT_PORT = 7345;

/**
 * Origenes con los que trabaja Miso. NO es una lista blanca: el proxy acepta
 * cualquier servidor publico de http/https (ver proxy/guard.ts), porque los
 * CDNs de video cambian de subdominio en cada titulo y una lista fija los
 * dejaria fuera a mitad de pelicula.
 *
 * Esto se expone en /api/sources y sirve para diagnostico: saber de golpe que
 * origenes ha pedido la aplicacion, sin tener que leer los registros a mano.
 * Los hosteros se listan por su dominio raiz (vimeos.zip, no p3.vimeos.zip)
 * porque el subdominio cambia entre peticiones.
 */
export const PROXY_ALLOWLIST = [
  // CDNs de posters y media
  'cnddim.xyz',
  'pelisplushd.la',
  'image.tmdb.org',
  // Cuevana: la web y sus cuatro espejos
  'cuevana3.sc',
  'compucalitv.tv',
  'mega1080.me',
  'pelisplus.fo',
  // Sucesores del tema Cuevana react (backend /wp-api/v1). Sus reproductores son
  // enlaces directos al hoster o un player.php que solo hace de iframe.
  'cuevana3.gs',
  'lamovie.org',
  'videoapp.zip',
  // sololatino.net: la web, su player embed69 y los hosters que este descifra.
  'sololatino.net',
  'embed69.org',
  'player.pelisserieshoy.com',
  'morencius.com',
  'hglink.to',
  // Hosteros de la familia streamwish
  'vimeos.net',
  'vimeos.zip',
  'goodstream.one',
  'streamwish.to',
  'vidhidepro.com',
  'streamtape.com',
  'waaw.to',
  'filelions.to',
  'voe.sx',
  // Hosters que declara pelisplushd ademas de la familia streamwish. Se listan
  // aunque aparezcan muertos a menudo (fembed.com acepta la conexion y no
  // contesta nunca): la lista es para diagnostico y el descarte se hace en
  // vivo. Quitarlos del HTML no arregla nada y hace que el usuario vea menos
  // opciones de las que la pagina ofrece.
  'netu.me',
  'streamlare.com',
  'watchsb.com',
  'streamsb.com',
  'fembed.com',
  // Proveedores de video
  'jwplatform.com',
  'jwpcdn.com',
  'content.jwplatform.com',
];

export function resolvePath(...segments: string[]): string {
  return path.join(repoRoot, ...segments);
}

/**
 * Carpeta de datos del usuario: biblioteca (historial y favoritos) y registros.
 *
 * El orden de prioridad importa:
 *
 *   1. `MISO_USER_DATA`, que inyecta el proceso principal de Electron con
 *      `app.getPath('userData')`. Es la unica ruta correcta cuando la aplicacion
 *      va empaquetada.
 *   2. Si el servidor vive dentro de un `app.asar` (empaquetado pero nadie paso
 *      la variable) se busca un directorio escribible del usuario. Dentro del
 *      asar NO se puede escribir: sin este respaldo los favoritos se guardaban
 *      solo en memoria y desaparecian al cerrar, sin ningun error visible.
 *   3. En desarrollo, `repo/.miso`, que es comodo y ya se usaba.
 */
function resolveUserData(): string {
  if (process.env.MISO_USER_DATA) return process.env.MISO_USER_DATA;

  if (repoRoot.includes('.asar')) {
    const base =
      process.env.XDG_CONFIG_HOME ||
      (process.platform === 'win32'
        ? process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
        : process.platform === 'darwin'
          ? path.join(os.homedir(), 'Library', 'Application Support')
          : path.join(os.homedir(), '.config'));
    return path.join(base, 'miso');
  }

  return path.join(repoRoot, '.miso');
}

export const PATHS = {
  repoRoot,
  /** Donde Electron guarda configuracion, logs y cache entre sesiones. */
  userData: resolveUserData(),
  /** Assets web ya compilados, servidos por el propio servidor en produccion. */
  webDist: path.join(repoRoot, 'dist', 'web'),
} as const;

if (!existsSync(PATHS.userData)) {
  // Se creara de forma perezosa; solo verificamos que la ruta es utilizable.
  PATHS.userData;
}

export const SERVER_PORT = Number(process.env.MISO_PORT || DEFAULT_PORT);