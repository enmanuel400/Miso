import { useEffect, useSyncExternalStore } from 'react';
import { dropHistory, favorite, getLibrary, pushHistory } from './api.js';
import type { EpisodeRef, PlaybackProgress, SavedTitle, TitleCard } from './types.js';
import { watchedKey } from './types.js';

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

/**
 * Entrada nueva para favoritos.
 *
 * Los favoritos no arrastran progreso ni vistos: son una marca, no un registro
 * de visionado. Se crea con la posicion que traiga la tarjeta, si trae alguna.
 */
function entrada(card: TitleCard): SavedTitle {
  return {
    key: card.key,
    card,
    at: Date.now(),
    last: posicion(card.entries[0]?.episode ?? null),
    progress: null,
  };
}

function normalizarProgreso(
  progress: PlaybackProgress | null | undefined,
): PlaybackProgress | null {
  if (!progress) return null;
  if (typeof progress.seconds !== 'number' || !Number.isFinite(progress.seconds) || progress.seconds < 0) {
    return null;
  }
  const duration =
    typeof progress.duration === 'number' && Number.isFinite(progress.duration) && progress.duration > 0
      ? Math.round(progress.duration)
      : null;
  return { seconds: Math.round(progress.seconds), duration };
}

/**
 * Anota un titulo como visto.
 *
 * La clave es la tarjeta agrupada, asi que volver a abrir el mismo titulo lo
 * mueve al frente en vez de duplicarlo; y se guarda la tarjeta entera para poder
 * reabrir el historial aunque la fuente haya caducado.
 *
 * `progress` es el minuto exacto en el que iba. Se guarda junto a la temporada y
 * el capitulo para poder reanudar sin que el usuario tenga que tantear. Es
 * opcional: una llamada sin el deja la entrada sin posicion, que arranca desde
 * cero.
 *
 * Se FUSIONA con la entrada anterior en lugar de reemplazarla. Sin eso, abrir un
 * titulo borraria sus marcas de visto y el avance que tuviera guardado de otros
 * capitulos, que es justo lo contrario de lo que promete un historial.
 */
export function recordHistory(
  card: TitleCard,
  last?: EpisodeRef | null,
  progress?: PlaybackProgress | null,
): void {
  const antes = data.history.find((h) => h.key === card.key);
  const pos = posicion(last);
  const prog = normalizarProgreso(progress);

  // El avance por capitulo se actualiza solo cuando hay posicion y avance: una
  // apertura sin reproduccion no debe escribir un cero sobre lo que ya habia.
  let byEpisode = antes?.byEpisode ?? null;
  if (pos && prog) {
    byEpisode = { ...(byEpisode ?? {}), [watchedKey(pos)]: prog };
  }

  const nueva: SavedTitle = {
    key: card.key,
    card,
    at: Date.now(),
    last: pos,
    progress: prog,
    watched: antes?.watched ?? null,
    byEpisode,
  };

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

/**
 * Marca o desmarca un capitulo (o una pelicula) como visto.
 *
 * Es una anotacion manual y por eso vive en el mismo sitio que el resto del
 * historial: sobrevive al cierre y se ve desde cualquier pantalla. Si el titulo
 * aun no estaba en el historial, se crea la entrada, porque marcar como visto es
 * ya una forma de decir "esto lo he tocado".
 */
export function toggleWatched(card: TitleCard, pos: EpisodeRef | null): void {
  const clave = watchedKey(pos);
  const actual = data.history.find((h) => h.key === card.key);
  const watched = { ...(actual?.watched ?? {}) };

  if (watched[clave]) delete watched[clave];
  else watched[clave] = true;

  // Sin marcas, se deja el campo en null en vez de un objeto vacio: el fichero
  // se reescribe entero y un `{}` por cada titulo es ruido puro.
  const mapa = Object.keys(watched).length > 0 ? watched : null;

  const nueva: SavedTitle = {
    key: card.key,
    card: actual?.card ?? card,
    at: actual?.at ?? Date.now(),
    last: actual?.last ?? posicion(pos),
    progress: actual?.progress ?? null,
    watched: mapa,
    byEpisode: actual?.byEpisode ?? null,
  };

  actualizar({
    ...data,
    history: [nueva, ...data.history.filter((h) => h.key !== card.key)],
  });
  void pushHistory(nueva).catch(() => undefined);
}

/** Si un capitulo (o la pelicula) esta marcado como visto. */
export function esVisto(datos: LibraryData, key: string, pos: EpisodeRef | null): boolean {
  const entrada = datos.history.find((h) => h.key === key);
  return Boolean(entrada?.watched?.[watchedKey(pos)]);
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
