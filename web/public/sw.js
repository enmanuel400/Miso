/*
 * Service worker de Miso.
 *
 * Existe por dos motivos, y ninguno es "funcionar sin conexion":
 *
 *  - Permite instalar la interfaz como aplicacion (icono en la pantalla de
 *    inicio, ventana a pantalla completa sin barra del navegador). Android exige
 *    un service worker con manejador de `fetch` para ofrecer la instalacion.
 *  - Guarda una copia de los estaticos para que un recargado en mal momento no
 *    deje la pantalla en blanco.
 *
 * La estrategia es red primero: el servidor vive en el propio equipo
 * (127.0.0.1 en el movil, o el equipo de la red), asi que siempre esta mas cerca
 * que la cache y una version nueva de la interfaz se ve al primer recargado. La
 * cache solo entra si la red falla.
 *
 * Nunca se cachea nada bajo `/api/`: ahi van la busqueda, las imagenes y, sobre
 * todo, los fragmentos de video del proxy HLS, que no deben acabar en disco.
 */

const CACHE = 'miso-v1';

self.addEventListener('install', () => {
  // No precargamos nada: la primera peticion real ya llena la cache. Con esto
  // una version nueva del worker toma el control sin esperar a cerrar pestanas.
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const claves = await caches.keys();
      await Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Solo GET del propio origen y fuera de la API. Todo lo demas pasa de largo.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    (async () => {
      try {
        const res = await fetch(req);
        // `basic` descarta respuestas opacas (por ejemplo, un redirect externo):
        // guardarlas dejaria una copia que no se puede leer.
        if (res && res.ok && res.type === 'basic') {
          const copia = res.clone();
          void caches.open(CACHE).then((c) => c.put(req, copia)).catch(() => undefined);
        }
        return res;
      } catch (err) {
        const guardada = await caches.match(req);
        if (guardada) return guardada;
        // Una navegacion sin red cae al armazon; el resto de estaticos, si no
        // estan, simplemente fallan, que es lo honesto.
        if (req.mode === 'navigate') {
          const shell = await caches.match('/');
          if (shell) return shell;
        }
        throw err;
      }
    })(),
  );
});
