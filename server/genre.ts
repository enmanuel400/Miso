import type { AggregatedSearch, MediaKind, SearchResult, SourceStatus } from './sources/types.js';
import type { Genre } from './genres.js';
import { SOURCES, resolveDomain } from './sources/index.js';
import { briefSourceError } from './errors.js';
import { cacheGet, cacheSet } from './cache.js';

/**
 * Cuantos resultados se piden a cada fuente.
 *
 * Corre tres fuentes y una rejilla de genero se mira de arriba abajo, asi que
 * una fuente con veinticuatro entradas ya da una pantalla entera. Pedir mas
 * multiplica las descargas sin que nadie las mire.
 */
const POR_FUENTE = 24;

/** Techo por fuente, generoso: el genero puede obligar a pedir mas de una pagina. */
const PER_SOURCE_TIMEOUT = 9_000;

/**
 * TTL de la cache por genero.
 *
 * Mas largo que el de busqueda porque esto no lo pide el usuario termino a
 * termino: es un listado que cambia a diario. Cinco minutos de espera se
 * repetirian en cada clic sobre las mismas pestanas.
 */
const GENRE_TTL = 5 * 60 * 1000;

/** Envuelve una promesa con un techo de tiempo. */
function conTecho<T>(promesa: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`sin respuesta en ${ms} ms`)), ms);
    promesa.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/**
 * Busca un genero en todas las fuentes que sepan hacerlo.
 *
 * Reutiliza la misma forma que una busqueda (`AggregatedSearch`) a proposito: la
 * rejilla, el recuento y los avisos de fuente caida ya estan escritos una vez, y
 * un genero no necesita un camino aparte.
 */
export async function genreAll(genre: Genre, kind: MediaKind | null): Promise<AggregatedSearch> {
  const started = Date.now();
  const cacheKey = `genre:${genre.slug}:${kind ?? 'todo'}`;

  const cached = cacheGet<AggregatedSearch>(cacheKey);
  if (cached) return cached;

  const fuentes = SOURCES.filter((s) => typeof s.fetchByGenre === 'function');
  const probeBudget = Math.floor(PER_SOURCE_TIMEOUT / 3);

  const settled = await Promise.allSettled(
    fuentes.map(async (source) => {
      const inicio = Date.now();
      const domain = await resolveDomain(source, probeBudget);
      const restante = PER_SOURCE_TIMEOUT - probeBudget - (Date.now() - inicio);
      const crudas = await conTecho(
        source.fetchByGenre!(domain, genre, kind, POR_FUENTE),
        Math.max(2_000, restante),
      );
      // El filtro por tipo va aqui, no en el adaptador: cada uno devuelve lo que
      // puede, y `kind` es una peticion de la interfaz, no un contrato de fuente.
      const results = kind ? crudas.filter((r) => r.kind === kind) : crudas;
      const status: SourceStatus = {
        state: 'ok',
        count: results.length,
        ms: Date.now() - inicio,
      };
      return { source, results, status };
    }),
  );

  const results: SearchResult[] = [];
  const bySource: AggregatedSearch['bySource'] = {};

  settled.forEach((outcome, i) => {
    const source = fuentes[i];
    if (outcome.status === 'fulfilled') {
      results.push(...outcome.value.results);
      bySource[source.meta.id] = outcome.value.status;
    } else {
      bySource[source.meta.id] = {
        state: 'error',
        message: briefSourceError(outcome.reason),
        ms: 0,
      };
    }
  });

  const aggregated: AggregatedSearch = {
    query: genre.name,
    results,
    bySource,
    totalMs: Date.now() - started,
  };

  const anyError = Object.values(bySource).some((s) => s.state === 'error');
  if (!anyError) cacheSet(cacheKey, aggregated, GENRE_TTL);

  return aggregated;
}
