import type { Genre } from './sources/types.js';

/**
 * Catalogo de generos que ofrece la aplicacion.
 *
 * No se deduce de las fuentes en tiempo de ejecucion a proposito. Las tres
 * exponen su lista de maneras distintas (y una, pelisplushd, solo por URL), asi
 * que "que generos existen" seria la interseccion de tres respuestas que cambian
 * de forma; y una rejilla de generos tiene que ser igual de estable que el menu
 * de cualquier app, no bailar segun que fuente este viva hoy.
 *
 * `name` es el termino EXACTO que espera la taxonomia de las fuentes de API
 * (cuevana3/lamovie). Medido contra las dos: "Bélica" existe, "Guerra" no;
 * "Ciencia ficcion" no existe en su taxonomia —solo en pelisplushd—, asi que esa
 * entrada funciona con una sola; el resto responde en las tres.
 *
 * `slug` es el que usa pelisplushd en `/generos/`. No coincide siempre con el
 * nombre (Belica <-> belica), y por eso el genero es la pareja y no el nombre.
 */
export const GENRES: Genre[] = [
  { name: 'Acción', slug: 'accion' },
  { name: 'Aventura', slug: 'aventura' },
  { name: 'Animación', slug: 'animacion' },
  { name: 'Comedia', slug: 'comedia' },
  { name: 'Crimen', slug: 'crimen' },
  { name: 'Documental', slug: 'documental' },
  { name: 'Drama', slug: 'drama' },
  { name: 'Familia', slug: 'familia' },
  { name: 'Fantasía', slug: 'fantasia' },
  { name: 'Terror', slug: 'terror' },
  { name: 'Misterio', slug: 'misterio' },
  { name: 'Romance', slug: 'romance' },
  { name: 'Ciencia ficción', slug: 'ciencia-ficcion' },
  { name: 'Suspense', slug: 'suspense' },
  { name: 'Bélica', slug: 'belica' },
  { name: 'Historia', slug: 'historia' },
  { name: 'Música', slug: 'musica' },
  { name: 'Western', slug: 'western' },
];

/** Normaliza para comparar sin acentos ni caja. */
function normalizar(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Encuentra un genero del catalogo por su nombre o su slug, sin distinguir
 * acentos ni mayusculas. Devuelve null si no esta: solo se ofrecen generos
 * conocidos, y una peticion a uno inventado es un error de quien pregunta.
 */
export function findGenre(raw: string | undefined | null): Genre | null {
  const key = normalizar(raw ?? '');
  if (!key) return null;
  return GENRES.find((g) => normalizar(g.name) === key || g.slug === key) ?? null;
}

export type { Genre };
