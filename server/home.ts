import type { AggregatedSearch, SearchResult, SourceId, SourceStatus } from './sources/types.js';
import { activeSources, resolveDomain } from './sources/index.js';
import { entrelazar } from './sources/shared.js';
import { briefSourceError } from './errors.js';
import { cacheGet, cacheSet } from './cache.js';

/**
 * Cuantas entradas se piden a cada fuente para la pantalla de inicio.
 *
 * Se piden mas de las que se muestran porque despues se mezclan y se recortan, y
 * porque cada fuente devuelve cosas que la agrupacion puede fundir: doce
 * capitulos recientes de la misma serie son doce entradas que en pantalla son
 * una sola tarjeta. Pedir de mas y descartar es mas barato que enseyar un "no hay
 * nada" cuando en realidad habia titulos de menos.
 */
const POR_FUENTE = 24;

/** Cuantas entradas se muestran. Un dozen. */
const TOTAL = 12;

/**
 * TTL de la cache del inicio.
 *
 * Mas corto que el de busqueda, a proposito: esto no es lo que el usuario ha
 * pedido, es lo que se le ofrece para que tenga por donde empezar, y no debe
 * estar congelado cinco minutos. Ademas el contenido de "estrenos" cambia cada
 * pocos dias, no cada cinco minutos.
 */
const HOME_TTL = 2 * 60 * 1000;

/**
 * Techo por fuente.
 *
 * El mismo que en busqueda, y por el mismo motivo: una fuente colgada no puede
 * impedir que la pantalla de inicio aparezca. Con lo que da el tiempo, una fuente
 * que tarda mas de esto esta colgada.
 */
const PER_SOURCE_TIMEOUT = 6_000;

/**
 * La pantalla de inicio.
 *
 * Devuelve exactamente la misma forma que una busqueda, con una diferencia: el
 * campo `query` va vacio. No es un detalle de forma, es lo que permite que el
 * cliente reutilice la agrupacion, el recuento y el aviso de fuentes caidas sin
 * tener dos caminos para lo mismo.
 */
export async function homeAll(): Promise<AggregatedSearch> {
  const started = Date.now();

  const cacheKey = 'home';
  const cached = cacheGet<AggregatedSearch>(cacheKey);
  if (cached) return cached;

  const conHome = activeSources().filter((s) => s.fetchHome);

  // El sondeo es una preferencia para acertar con el dominio bueno, no una parte
  // del trabajo, asi que se queda con su propio techo corto. Lo que viene
  // despues trae el suyo, porque son descargas distintas y las hace la fuente.
  const probeBudget = Math.floor(PER_SOURCE_TIMEOUT / 3);

  const settled = await Promise.allSettled(
    conHome.map(async (source) => {
      const inicio = Date.now();
      const domain = await resolveDomain(source, probeBudget);
      const results = await source.fetchHome!(domain, POR_FUENTE);
      const status: SourceStatus = {
        state: 'ok',
        count: results.length,
        ms: Date.now() - inicio,
      };
      return { source, results, status };
    }),
  );

  // Las listas de cada fuente se entrelazan al final, no aqui: una fuente que
  // contesta rapido no debe llenar la pantalla antes de que la otra responda.
  const porFuente: SearchResult[][] = [];
  const bySource: Record<SourceId, SourceStatus> = {};

  settled.forEach((outcome, i) => {
    const source = conHome[i];
    if (outcome.status === 'fulfilled') {
      porFuente.push(outcome.value.results);
      bySource[source.meta.id] = outcome.value.status;
    } else {
      porFuente.push([]);
      bySource[source.meta.id] = {
        state: 'error',
        message: briefSourceError(outcome.reason),
        ms: 0,
      };
    }
  });

  // El entrelazado es de dos en dos, asi que con mas de dos fuentes se reduce
  // por parejas hasta quedar en dos. El recorte a TOTAL va al final, cuando ya
  // estan mezcladas: si no, una fuente que llega la primera llenaria la pantalla
  // entera y la otra no apareceria.
  let mezcladas = porFuente;
  while (mezcladas.length > 2) {
    const siguiente: SearchResult[][] = [];
    for (let i = 0; i < mezcladas.length; i += 2) {
      siguiente.push(entrelazar(mezcladas[i], mezcladas[i + 1] ?? []));
    }
    mezcladas = siguiente;
  }

  const results = (mezcladas.length === 2
    ? entrelazar(mezcladas[0], mezcladas[1])
    : (mezcladas[0] ?? [])
  ).slice(0, TOTAL);

  const aggregated: AggregatedSearch = {
    query: '',
    results,
    bySource,
    totalMs: Date.now() - started,
  };

  // Igual que en busqueda: un resultado con errores no se cachea, porque
  // perpetuaria una fuente caida durante minutos.
  const anyError = Object.values(bySource).some((s) => s.state === 'error');
  if (!anyError) cacheSet(cacheKey, aggregated, HOME_TTL);

  return aggregated;
}
