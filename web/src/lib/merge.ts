import type { AggregatedSearch, SearchResult, TitleCard } from './types.js';

/**
 * Nota de una tarjeta: por que esta aqui y a donde lleva.
 *
 * Se calcula al final, con todas las entradas dentro, y no se copia la de la
 * primera. Eso era lo que hacia antes y mentia en cuanto una serie tenia dos
 * capitulos recientes: la tarjeta de "El mapa de los" con T1E4, T1E5 y
 * T1E6 decia "T1E6 - Vuelve a la casilla de salida", como si el unico capitulo
 * al que se pudiera llegar desde ahi fuera el sexto. Se leia como una verdad y no
 * lo era: la tarjeta abre el capitulo mas reciente, y los otros dos estan tambien,
 * una fila mas abajo, en el selector de temporada.
 *
 * Con varios capitulos se dice el tramo entero. "T1E4\u2013T1E6 \u00b7 3 capitulos nuevos"
 * ocupa lo mismo que el nombre de uno y no oculta lo que hay debajo.
 */
function notaDeTarjeta(entries: SearchResult[]): string | null {
  const conCapitulo = entries.filter((e) => e.episode);
  const sinCapitulo = entries.filter((e) => !e.episode);

  // Capitulos de una sola serie: se puede decir el tramo. Si mezclan temporadas el
  // tramo no significa nada y se listan uno a uno.
  if (conCapitulo.length > 1) {
    // El orden de llegada es el del listado de novedades, que va del capitulo mas
    // reciente al mas antiguo. Sin ordenar aqui el tramo salia del reves
    // ("T1E6-T1E4"), que ademas de raro hacia dudar de lo que significaba.
    const coords = conCapitulo
      .map((e) => e.episode!)
      .sort((a, b) => a.season - b.season || a.episode - b.episode);

    const temporadas = new Set(coords.map((e) => e.season));
    const primero = coords[0];
    const ultimo = coords[coords.length - 1];
    const n = coords.length;

    const tramo =
      temporadas.size === 1
        ? `T${primero.season}E${primero.episode}\u2013T${ultimo.season}E${ultimo.episode}`
        : coords.map((e) => `T${e.season}E${e.episode}`).join(', ');

    const recuento = `${n} ${n === 1 ? 'cap\u00edtulo nuevo' : 'cap\u00edtulos nuevos'}`;

    // Una entrada sin capitulo (un estreno) trae una nota propia que explica mas
    // que cualquier recuento, asi que si hay una se prefiere.
    const propia = sinCapitulo.find((e) => e.note)?.note;
    if (propia) return propia;

    return `${tramo} \u00b7 ${recuento}`;
  }

  return entries.find((e) => e.note)?.note ?? null;
}

/**
 * Agrupa resultados por titulo normalizado.
 *
 * La clave de agrupacion tiene que ser tolerante: las fuentes escriben el
 * mismo nombre de forma distinta ("Beast - La Bestia", "La Bestia Del
 * Pantano", "Bestias divinas"), con acentos distintos, conarticles pegados y
 * con ruido de traduccion. Solo se agrupa cuando el nombre coincide de verdad,
 * y se conserva el titulo mas largo de los encontrados, porque suele ser el
 * mejor escrito.
 */
function groupKey(result: SearchResult): string {
  return result.title
    .toLowerCase()
    .normalize('NFD')
    // quitamos los diacriticos: "corazón" y "corazon" son la misma pelicula
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Consolida duplicados por titulo, conservando una entrada por fuente.
 *
 * Si una misma fuente trae el titulo dos veces (ocurre cuando la pagina de
 * busqueda repite el mismo poster en dos bloques), nos quedamos con la primera:
 * son el mismo destino y mostrarlo dos veces no aporta nada.
 */
export function mergeResults(results: SearchResult[]): TitleCard[] {
  const byKey = new Map<string, TitleCard>();

  for (const result of results) {
    const key = groupKey(result);
    const card = byKey.get(key);

    if (!card) {
      byKey.set(key, {
        key,
        title: result.title,
        poster: result.poster,
        kind: result.kind,
        year: result.year,
        rating: result.rating,
        entries: [result],
        // La nota no se copia aqui: sale de `notaDeTarjeta` al final, cuando ya se
        // sabe cuantas entradas tiene la tarjeta. Copiarla ahora obliga a
        // adivinarla despues.
        note: null,
      });
      continue;
    }

    // Actualizamos los campos vacios con los primeros datos que encontremos, y
    // mejoramos el titulo si el nuevo es mas largo (suele estar mas completo).
    card.poster ??= result.poster;
    card.kind ??= result.kind;
    card.year ??= result.year;
    card.rating ??= result.rating;
    if (result.title.length > card.title.length) card.title = result.title;

    const yaEsta = (e: SearchResult) =>
      e.source === result.source &&
      e.episode?.season === result.episode?.season &&
      e.episode?.episode === result.episode?.episode;

    // Una misma fuente puede traer la misma serie dos veces en el inicio, una por
    // capitulo: son capitulos distintos y abren en sitio distinto, asi que se
    // guardan los dos. En la busqueda no pasa, porque alli el mismo titulo
    // repetido es literalmente la misma pagina, y comparar el capitulo (que alli
    // es null en los dos) lo sigue descartando igual.
    if (!card.entries.some(yaEsta)) card.entries.push(result);
  }

  const tarjetas = [...byKey.values()];

  for (const card of tarjetas) card.note = notaDeTarjeta(card.entries);

  return tarjetas;
}

/**
 * Cuantas fuentes devolvieron algo, para el resumen de la pantalla.
 *
 * No cuenta como disponibles las fuentes que respondieron con error: el
 * usuario tiene que ver la diferencia entre "no hay nada de esa fuente" y
 * "esa fuente no respondio".
 */
export function deliveredSources(search: AggregatedSearch): number {
  return Object.values(search.bySource).filter((s) => s.state === 'ok').length;
}

export function failedSources(search: AggregatedSearch): {
  id: string;
  message: string;
}[] {
  return Object.entries(search.bySource)
    .filter(([, s]) => s.state === 'error')
    .map(([id, s]) => ({ id, message: s.state === 'error' ? s.message : '' }));
}
