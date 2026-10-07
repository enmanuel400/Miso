/**
 * Cache en memoria con TTL.
 *
 * Las fuentes son lentas yfragiles. Cacheamos por clave unicamente lo que
 * escaro e inmutable (HTML de busqueda, detalle de titulo), nunca los
 * tokens de reproduccion, que caducan.
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, Entry<unknown>>();

/** Limpieza periodica de entradas caducadas para que no crezca sin limite. */
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
}, 60_000);
// `unref` evita que este temporizador mantenga vivo el proceso del servidor.
sweeper.unref?.();

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/**
 * Cache de deduplicacion para peticiones simultaneas identicas.
 * Si dos peticiones llegan al mismo tiempo para la misma clave, solo una
 * sale a la red; la otra espera su resultado.
 */
const inFlight = new Map<string, Promise<unknown>>();

export async function dedupe<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = run().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

export function cacheClear(): void {
  store.clear();
}

export function cacheStats(): { entries: number; inFlight: number } {
  return { entries: store.size, inFlight: inFlight.size };
}