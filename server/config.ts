import { existsSync } from 'node:fs';
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

export const PATHS = {
  repoRoot,
  /** Donde Electron guarda configuracion, logs y cache entre sesiones. */
  userData: process.env.MISO_USER_DATA || path.join(repoRoot, '.miso'),
  /** Assets web ya compilados, servidos por el propio servidor en produccion. */
  webDist: path.join(repoRoot, 'dist', 'web'),
} as const;

if (!existsSync(PATHS.userData)) {
  // Se creara de forma perezosa; solo verificamos que la ruta es utilizable.
  PATHS.userData;
}

export const SERVER_PORT = Number(process.env.MISO_PORT || DEFAULT_PORT);