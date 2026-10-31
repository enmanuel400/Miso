import type { SourceAdapter } from './shared.js';
import type { SourceInfo } from './types.js';
import { pelisplushd } from './pelisplushd.js';
import { cuevana3gs } from './cuevana3gs.js';
import { lamovie } from './lamovie.js';
import { sololatino } from './sololatino.js';
import { pelispedia } from './pelispedia.js';
import { fetchText } from '../http.js';
import { cacheGet, cacheSet } from '../cache.js';
import { isSourceEnabled } from '../settings.js';

/**
 * Catalogo de fuentes.
 *
 * Es la lista completa, no la que se consulta: que fuentes estan encendidas lo
 * resuelve `activeSources()` mas abajo, segun los ajustes del usuario.
 *
 * Se retiraron repelisplus y pelisflix. Las dos buscaban bien, pero sus
 * reproductores estaban muertos en cadena: repelisplus iba watchfun.top ->
 * nupload.my -> voe.sx (404) y pelisflix nuupload.my -> voe.sx (404). Declararlas
 * alive era peor que no declararlas, porque cada titulo suyo gastaba el
 * presupuesto de tiempo en dos o tres saltos muertos y el informe de fallos
 * acababa hablando de fuentes que ya no existen.
 *
 * Cuevana entro en su lugar, y no como reemplazo equivalente: se consulta por
 * API en vez de parsearse, devuelve los embeds ya resueltos y responde en un
 * tercio del tiempo.
 *
 * Ese Cuevana ya no existe: su backend `tmdb.cuevana3.sc` devuelve un 404 y el
 * adaptador no puede leer ni una busqueda. Lo relevan dos sitios del mismo tema
 * react pero con backend nuevo (`/wp-api/v1`): cuevana3.gs, que es la continuacion
 * de la marca, y lamovie.org. Los dos usan el adaptador generico `wpapi`, que no
 * parsea HTML. El viejo `cuevana.ts` se conserva solo como referencia para las
 * pruebas de parser (`scripts/check-parsers.ts`), fuera de la lista activa.
 *
 * Gnula se probo y se retiro. La idea era buena: cuevana y pelisplushd se apoyan
 * en la MISMA familia de hosters (vimeos, goodstream), asi que una caida de esa
 * familia deja a las dos sin reproducir a la vez, y gnula tiraba de uqload, voe
 * y hqq, que son de otra. El problema resulto ser del sitio, no del codigo: su
 * catalogo tiene los reproductores caducados y no se renueva. En 32 embeds de
 * unas veinte fichas, tres reprodujeron. El sintoma es literal:
 *
 *   uqload.com   "File is no longer available as it expired or has been deleted"
 *   hqq.to       "Not Found"
 *   voe.sx       404
 *
 * Lo que si funcionaba era un dato suelto: la pagina de `links.cuevana.ac`
 * lleva a veces un .mp4 en el HTML, y ahi se encontraba video sin navegador. Dos
 * aciertos de veinte no pagan +0,6 s en cada busqueda ni 32 s de presupuesto por
 * titulo fallido. Medido en tres pasadas: 12 titulos al azar (2), 14 de busqueda
 * (0), 6 de los mas nuevos (1).
 *
 * No era un hueco nuestro y no se arregla por el lado de Miso: cuando el
 * hostero dice que el fichero ya no esta, no hay nada que extraer. Ver
 * paginas-fuentes.md.
 *
 * sololatino.net llego por otra razon: catalogo de series y peliculas con
 * reproductores en mas idiomas y calidad mas alta. No entra por `wpapi` porque
 * su API no se parece en nada: la busqueda es un autocompletado JSON y los
 * embeds se piden con un POST sobre un testigo. Su adaptador resuelve el player
 * de embed69 antes de devolver la lista, de modo que el extractor arranca en el
 * hoster final (voe, streamwish, vidhide) y no en la pagina del player.
 */
export const SOURCES: SourceAdapter[] = [pelisplushd, cuevana3gs, lamovie, sololatino, pelispedia];

export const SOURCE_MAP = new Map(SOURCES.map((s) => [s.meta.id, s]));

export function getSource(id: string): SourceAdapter | undefined {
  return SOURCE_MAP.get(id);
}

/**
 * Fuentes que el usuario tiene activas.
 *
 * Es la lista que consultan la busqueda, el inicio y los generos. Se resuelve en
 * cada peticion y no una vez al arrancar: cambiar los ajustes tiene que surtir
 * efecto sin reiniciar el servidor.
 *
 * `getSource` sigue mirando el catalogo completo a proposito. Un titulo guardado
 * en favoritos de una fuente recien desactivada tiene que poder abrirse; lo que
 * no debe es volver a aparecer en las busquedas.
 */
export function activeSources(): SourceAdapter[] {
  return SOURCES.filter((s) => isSourceEnabled(s.meta.id));
}

/** El catalogo completo con el estado de activacion, para los ajustes. */
export function sourceMeta(): SourceInfo[] {
  return SOURCES.map((s) => ({ ...s.meta, enabled: isSourceEnabled(s.meta.id) }));
}

const DOMAIN_TTL = 10 * 60 * 1000;

/**
 * TTL del fallback cuando ningun dominio responde.
 *
 * Corto a proposito: si la fuente esta caida, no queremos pagar el sondeo en cada
 * busqueda, pero tampoco queremos quedarnos diez minutos con un dominio muerto
 * cuando la web vuelva.
 */
const DOMAIN_FALLBACK_TTL = 60 * 1000;

/**
 * Presupuesto por defecto del sondeo.
 *
 * Corto a proposito. El sondeo es una PREFERENCIA: sirve para acertar con el
 * dominio bueno cuando la web ha rotado, no para decidir si se puede buscar.
 * Estas paginas de inicio tardan de verdad poco: medido entre 0,3 y 0,5 s.
 *
 * Hay una trampa en darle el presupuesto entero de la busqueda, que fue lo
 * primero que se intento. Si el sondeo se hace lento en un mal momento, se come
 * los seis segundos y la busqueda, que por si sola responde en 400 ms, se queda
 * sin nada. El resultado era una fuente a veces lenta y a veces rapida sin
 * relacion con la web: la culpa la tenia el sondeo, no el servidor. Por eso el
 * sondeo tiene su propio techo corto y la busqueda se queda con el resto.
 */
const PROBE_BUDGET_MS = 2_000;

/**
 * Descubre que dominio de una fuente esta vivo.
 *
 * Estas webs rotan de dominio con frecuencia (pelisflix1.today <-> .tv) y
 * algunas veces el primero de la lista ya no responde. El orden de la lista
 * importa y por eso NO es una carrera libre.
 *
 * Primero se prueba solo el primer dominio. Si contesta, se usa, aunque otro
 * hubiera contestado antes: el orden codifica una preferencia (la marca que ve
 * el usuario, la portada que se abre en el navegador) y una carrera libre lo
 * convierte en sorteo. Con los cuatro espejos de Cuevana sevio exactamente eso:
 * la insignia decia "cuevana" y el enlace abria pelisplus.fo, porque ese
 * respondio 40 ms antes.
 *
 * Si el primero falla, los demas se prueban A LA VEZ y gana el primero que
 * conteste, porque ahi ya no hay preferencia que respetar y si se recorren en
 * orden, con un techo de 8 s por candidato, dos dominios muertos costaban 16 s
 * de pantalla vacia en cada busqueda.
 *
 * @param budgetMs Techo del sondeo de cada dominio. Corto, para no robarle
 *   tiempo a la busqueda.
 * @returns El dominio elegido, o el primero de la lista como mejor apuesta.
 */
export async function resolveDomain(
  source: SourceAdapter,
  budgetMs = PROBE_BUDGET_MS,
): Promise<string> {
  const key = `domain:${source.meta.id}`;
  const cached = cacheGet<string>(key);
  if (cached) return cached;

  const probe = (domain: string) => fetchText(`https://${domain}/`, { timeoutMs: budgetMs });

  let chosen: string;
  let alive = true;

  try {
    // El preferido, solo y con el techo entero.
    await probe(source.domains[0]);
    chosen = source.domains[0];
  } catch {
    try {
      // `Promise.any` resuelve con la primera que se cumple y solo rechaza
      // cuando todas fallan, que es justo la semantica que queremos aqui.
      const rest = await Promise.any(source.domains.slice(1).map(probe));
      chosen = rest;
    } catch {
      alive = false;
      // Ninguno respondio: usamos el primero como mejor apuesta para que el
      // error que llegue al usuario sea el de la fuente y no un "dominio no
      // encontrado".
      chosen = source.domains[0];
    }
  }

  // El ganador se cachea 10 minutos; el fallback, solo un minuto, para que una
  // fuente recuperada se vuelva a usar pronto sin castigar mientras esta caida.
  cacheSet(key, chosen, alive ? DOMAIN_TTL : DOMAIN_FALLBACK_TTL);
  return chosen;
}

export type { SourceAdapter };