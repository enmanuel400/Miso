import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app.js';
import { isDesktop } from './lib/useServer.js';
import './app.css';

/**
 * Punto de entrada unico.
 *
 * El prototipo de tres direcciones que se uso para elegir la direccion visual
 * se borro al decidirse: nada de esto depende ya de el.
 */

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/**
 * Registro del service worker, solo en el navegador.
 *
 * Fuera de Electron el service worker es lo que permite instalar la interfaz
 * como aplicacion en el movil. Dentro de Electron no aporta nada (la ventana ya
 * es una aplicacion), asi que se omite para no dejar cache entre medias.
 *
 * `isSecureContext` filtra el caso de acceder por la red local desde el movil
 * (`http://192.168.x.x`): sin https no hay contexto seguro y el registro falla;
 * contra `127.0.0.1`, en cambio, si.
 */
if (!isDesktop && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
