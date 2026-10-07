import type { AggregatedSearch, SearchResult, SourceId, SourceStatus } from './sources/types.js';
import { SOURCES, resolveDomain } from './sources/index.js';
import { fetchText } from './http.js';
import { briefSourceError } from './errors.js';
import { cacheGet, cacheSet } from './cache.js';

/** TTL de la cache de busquedas. Suficiente para no castigar al origen. */
const SEARCH_TTL = 5 * 60 * 1000;

/**
 * Techo por fuente para el fan-out de busqueda.
 *
 * Medido con las dos fuentes que quedan: de 200 a 730 ms en frio, y 10 ms con
 * la caché. Una pagina de busqueda que tarda mas de seis segundos no esta
 * lenta, esta colgada, y esperarla solo hace que el usuario mire una pantalla
 * vacia mientras la otra fuente ya trajo sus resultados.
 *
 * Ojo con subir esto por timididad: el coste no lo paga quien falla, lo paga
 * quien funciona. Con 18 s, una sola fuente caida convertia una busqueda de
 * 0,7 s en una de 26 s.
 */
const PER_SOURCE_TIMEOUT = 6_000;

async function searchOne(source: (typeof SOURCES)[number], query: string): Promise<{
  results: SearchResult[];
  status: SourceStatus;
}> {
  const started = Date.now();

  // Un solo presupuesto para toda la fuente, con el reparto explícito.
  //
  // El sondeo de dominio se queda con su propio techo corto y la busqueda con
  // lo que quede. Medido: si el sondeo puede usar los seis segundos enteros, en
  // un mal momento se los come entero y la busqueda, que por si sola responde en
  // 400 ms, se queda sin tiempo. El reparto evita que lo lento de un paso anule
  // lo rapido del otro.
  const probeBudget = Math.floor(PER_SOURCE_TIMEOUT / 3);

  try {
    const domain = await resolveDomain(source, probeBudget);
    const url = source.searchUrl(domain, query);
    const rest = PER_SOURCE_TIMEOUT - probeBudget - (Date.now() - started);
    const html = await fetchText(url, { timeoutMs: Math.max(500, rest) });
    const results = source.parseResults(html, domain);

    return {
      results,
      status: { state: 'ok', count: results.length, ms: Date.now() - started },
    };
  } catch (err) {
    return {
      results: [],
      status: {
        state: 'error',
        message: briefSourceError(err),
        ms: Date.now() - started,
      },
    };
  }
}

/**
 * Busca en todas las fuentes en paralelo y une los resultados.
 *
 * Cada fuente se consulta de forma independiente y se reporta por separado. Si
 * una falla, las otras dos siguen dando resultados y la interfaz muestra cual
 * respondio y cual no, en lugar de un error global. Para eso usamos
 * allSettled y no all.
 */
export async function searchAll(query: string): Promise<AggregatedSearch> {
  const started = Date.now();
  const trimmed = query.trim();

  if (trimmed.length < 2) {
    return { query: trimmed, results: [], bySource: {}, totalMs: 0 };
  }

  const cacheKey = `search:${trimmed.toLowerCase()}`;
  const cached = cacheGet<AggregatedSearch>(cacheKey);
  if (cached) return cached;

  const settled = await Promise.allSettled(
    SOURCES.map((source) => searchOne(source, trimmed)),
  );

  const results: SearchResult[] = [];
  const bySource: Record<SourceId, SourceStatus> = {};

  settled.forEach((outcome, i) => {
    const source = SOURCES[i];
    if (outcome.status === 'fulfilled') {
      results.push(...outcome.value.results);
      bySource[source.meta.id] = outcome.value.status;
    } else {
      bySource[source.meta.id] = {
        state: 'error',
        message: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
        ms: 0,
      };
    }
  });

  const aggregated: AggregatedSearch = {
    query: trimmed,
    results,
    bySource,
    totalMs: Date.now() - started,
  };

  // Solo cacheamos si no hubo fallos: cachear un resultado parcial
  // perpetuaria el fallo durante minutos.
  const anyError = Object.values(bySource).some((s) => s.state === 'error');
  if (!anyError) cacheSet(cacheKey, aggregated, SEARCH_TTL);

  return aggregated;
}