import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app.js';
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
