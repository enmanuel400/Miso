import type { PlaybackProgress } from './types.js';

/**
 * Texto de cuanto queda de un titulo a medias.
 *
 * Vive en su propio modulo porque lo usan el historial y el inicio, y duplicarlo
 * seria la forma mas rapida de que los dos digan cosas distintas del mismo dato.
 *
 * Sin duracion devuelve null: "quedan 23 min" exige saber el total, y un numero
 * inventado es peor que ninguno. El ultimo minuto se redondea a "menos de 1 min"
 * en vez de a 0, que se leeria como un error.
 */
export function restante(progress: PlaybackProgress | null | undefined): string | null {
  if (!progress || !progress.duration || progress.duration <= 0) return null;
  const seg = Math.max(0, progress.duration - progress.seconds);
  if (seg < 60) return 'menos de 1 min';
  const min = Math.round(seg / 60);
  if (min < 60) return `quedan ${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `quedan ${h} h ${m} min` : `quedan ${h} h`;
}

/**
 * Fraccion vista, de 0 a 1, o null si no se puede calcular.
 *
 * Sin duracion no hay fraccion honesta: devolver 0 pintaria una barra vacia en un
 * titulo empezado, que es peor que no pintarla.
 */
export function fraccionVista(progress: PlaybackProgress | null | undefined): number | null {
  if (!progress || !progress.duration || progress.duration <= 0) return null;
  return Math.min(1, Math.max(0, progress.seconds / progress.duration));
}
