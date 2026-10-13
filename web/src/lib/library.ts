import { useEffect, useSyncExternalStore } from 'react';
import { dropHistory, favorite, getLibrary, pushHistory } from './api.js';
import type { EpisodeRef, SavedTitle, TitleCard } from './types.js';

/**
 * Biblioteca local: historial y favoritos.
 *
 * El estado vive en el servidor (`.miso/library.json`) porque tiene que
 * sobrevivir al cierre de la ventana y a limpiar la cache de Chromium. Aqui solo
 * hay una copia reactiva para que la interfaz se entere de los cambios sin
 * repintar a mano cada pantalla que toca un titulo.
 *
 * Es un almacen externo y no un `useState` en la raiz a proposito: el historial
 * se escribe desde el detalle, se lee en el inicio y los favoritos se marcan
 * desde cualquier tarjeta. Repartir eso por props obligaria a pasar cuatro cosas
 * por cinco niveles de componentes.
 */

interface LibraryData {
  history: SavedTitle[];
  favorites: SavedTitle[];
}

const VACIA: LibraryData = { history: [], favorites: [] };

let data: LibraryData = VACIA;
let iniciado = false;
const oyentes = new Set<() => void>();

function emitir(): void {
  for (const cb of oyentes) cb();
}

function suscribir(cb: () => void): () => void {
  oyentes.add(cb);
  return () => {
    oyentes.delete(cb);
  };
}

function instantanea(): LibraryData {
  return data;
}

function actualizar(next: LibraryData): void {
  data = next;
  emitir();
}

/** Carga una sola vez, en el primer componente que use la biblioteca. */
function asegurarCarga(): void {
  if (iniciado) return;
  iniciado = true;
  void getLibrary()
    .then((b) => actualizar({ history: b.history ?? [], favorites: b.favorites ?? [] }))
    .catch(() => undefined);
}

export function useLibrary(): LibraryData {
  useEffect(asegurarCarga, []);
  return useSyncExternalStore(suscribir, instantanea, instantanea);
}

function posicion(last: EpisodeRef | null | undefined): EpisodeRef | null {
  if (last && Number.isInteger(last.season) && Number.isInteger(last.episode)) return last;
  return null;
}

function entrada(card: TitleCard, last?: EpisodeRef | null): SavedTitle {
  return { key: card.key, card, at: Date.now(), last: posicion(last) };
}

/**
 * Anota un titulo como visto.
 *
 * La clave es la tarjeta agrupada, asi que volver a abrir el mismo titulo lo
 * mueve al frente en vez de duplicarlo; y se guarda la tarjeta entera para poder
 * reabrir el historial aunque la fuente haya caducado.
 */
export function recordHistory(card: TitleCard, last?: EpisodeRef | null): void {
  const nueva = entrada(card, last);
  actualizar({
    ...data,
    history: [nueva, ...data.history.filter((h) => h.key !== nueva.key)].slice(0, 120),
  });
  void pushHistory(nueva).catch(() => undefined);
}

/** Quita un titulo del historial. */
export function forgetHistory(key: string): void {
  actualizar({ ...data, history: data.history.filter((h) => h.key !== key) });
  void dropHistory(key).catch(() => undefined);
}

/** Vacia el historial entero. */
export function clearHistory(): void {
  actualizar({ ...data, history: [] });
  void dropHistory().catch(() => undefined);
}

/**
 * Marca o desmarca un favorito.
 *
 * Se pinta el cambio antes de que conteste el servidor y se revierte si falla:
 * una estrella que tarda medio segundo en encenderse se siente rota, y este
 * cambio es reversible por definicion.
 */
export function toggleFavorite(card: TitleCard): void {
  const antes = data.favorites;
  const yaEsta = antes.some((f) => f.key === card.key);
  const entrada2 = entrada(card);

  actualizar({
    ...data,
    favorites: yaEsta ? antes.filter((f) => f.key !== card.key) : [entrada2, ...antes],
  });

  void favorite(entrada2)
    .then((res) => {
      // El servidor manda: su lista es la que se guarda en disco.
      actualizar({ ...data, favorites: res.favorites });
    })
    .catch(() => {
      actualizar({ ...data, favorites: antes });
    });
}

/** Consulta si una tarjeta esta en favoritos, para pintarla. */
export function esFavorito(datos: LibraryData, key: string): boolean {
  return datos.favorites.some((f) => f.key === key);
}
