/** Cliente HTTP para hablar con las fuentes. */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const ACCEPT_LANGUAGE = 'es-ES,es;q=0.9,en;q=0.8';

/**
 * Reparacion de doble codificacion UTF-8.
 *
 * `pelisplushd.la` mezcla en la MISMA pagina texto UTF-8 correcto y el mismo
 * texto pasado dos veces por latin-1. Medido sobre una busqueda real:
 *
 *   "El coraz\xc3\x83\xc2\xb3n de la bestia"   doble codificado -> "corazón"
 *   "El coraz\xc3\xb3n de una bestia"          UTF-8 correcto, NO tocar
 *   "La bestia en m\xc3\xad"                    UTF-8 correcto, NO tocar
 *
 * El fallo anterior era re-decodificar el documento ENTERO de latin-1 a UTF-8.
 * Eso arregla el primer caso y rompe los otros dos: una "o" con acento bien
 * codificada es un solo caracter U+00F3, que al pasar por latin-1 se convierte
 * en el byte 0xF3, y 0xF3 suelto no es UTF-8 valido, asi que salia un U+FFFD.
 * El texto que ya venia bien acababa peor que el roto, y el guardia no lo
 * detectaba porque solo contaba apariciones de "A-tilde"/"A-circunflejo", que
 * en la salida ya son cero.
 *
 * La reparacion es ahora POR FRAGMENTO: se buscan tiradas de dos o mas
 * caracteres del rango latin-1, que es donde vive el texto doblemente
 * codificado, y se re-decodifica solo esa tirada. El resto del documento no se
 * toca, de modo que lo que venia bien no puede empeorar.
 *
 * El tramo cp1252 que falta: medir la pagina real de `pelisplushd.la` dio esto
 *
 *   El ->  c3 83 e2 80 b0
 *
 * El byte 0x89 es la "E" acentuada en UTF-8, pero al pasar por cp1252 se
 * convierte en U+2030 ("‰"), que cae FUERA del rango U+0080-U+00FF que el
 * guardian usaba. Por eso la palabra "El" se quedaba como "Ã‰l" mientras el
 * resto de la pagina si se reparaba. La segunda codificacion de la fuente usa
 * cp1252, no latin-1, y no se puede reducir a "decodificar latin-1".
 *
 * La reparacion sigue siendo POR FRAGMENTO y con las mismas dos comprobaciones,
 * de modo que lo que venia bien no puede empeorar.
 */

/**
 * Bytes 0x80-0x9F de cp1252, del caracter al byte. Al reves que `Buffer.from`,
 * que no los conoce (en latin-1 esos bytes son de control).
 *
 * Faltan 0x81, 0x8D, 0x8F, 0x90 y 0x9D: no estan definidos en cp1252, asi que
 * no tienen caracter al que volver y no pueden aparecer en una doble
 * codificacion hecha con esa tabla.
 */
const CP1252_ALTOS: ReadonlyMap<number, number> = new Map([
  [0x20ac, 0x80], // €
  [0x201a, 0x82], // ‚
  [0x0192, 0x83], // ƒ
  [0x201e, 0x84], // „
  [0x2026, 0x85], // …
  [0x2020, 0x86], // †
  [0x2021, 0x87], // ‡
  [0x02c6, 0x88], // ˆ
  [0x2030, 0x89], // ‰  <-- el de "Él", el que fallaba
  [0x0160, 0x8a], // Š
  [0x2039, 0x8b], // ‹
  [0x0152, 0x8c], // Œ
  [0x017d, 0x8e], // Ž
  [0x2018, 0x91], // '
  [0x2019, 0x92], // '
  [0x201c, 0x93], // "
  [0x201d, 0x94], // "
  [0x2022, 0x95], // •
  [0x2013, 0x96], // –
  [0x2014, 0x97], // —
  [0x02dc, 0x98], // ˜
  [0x2122, 0x99], // ™
  [0x0161, 0x9a], // š
  [0x203a, 0x9b], // ›
  [0x0153, 0x9c], // œ
  [0x017e, 0x9e], // ž
  [0x0178, 0x9f], // Ÿ
]);

/**
 * Caracteres que pueden formar parte de texto doblemente codificado: el rango
 * latin-1 mas el tramo alto de cp1252. Dos o mas seguidos.
 *
 * Se escribe con `new RegExp` y escapes `\u` porque el rango alto de cp1252 son
 * caracteres de verdad (comillas, el signo euro, el per mille) y ponerlos en
 * fuente a pelo haria el guardian ilegible.
 */
const TIRADA_DOBLE = new RegExp(
  '[\\u0080-\\u00ff\\u20ac\\u201a\\u0192\\u201e\\u2026\\u2020\\u2021' +
    '\\u02c6\\u2030\\u0160\\u2039\\u0152\\u017d\\u2018\\u2019' +
    '\\u201c\\u201d\\u2022\\u2013\\u2014\\u02dc\\u2122\\u0161' +
    '\\u203a\\u0153\\u017e\\u0178]{2,}',
  'g',
);

export function repairEncoding(input: string): string {
  return input.replace(TIRADA_DOBLE, (run) => {
    // Cada caracter de la tirada vuelve a su byte: los del rango latin-1 son
    // ellos mismos, y los del tramo alto de cp1252 salen de la tabla de arriba.
    const bytes = [...run].map((ch) => {
      const cp = ch.codePointAt(0)!;
      if (cp <= 0xff) return cp;
      return CP1252_ALTOS.get(cp) ?? 0x3f; // '?': caracter suelta, no era doble
    });

    const decoded = Buffer.from(bytes).toString('utf8');

    // Si la tirada no era UTF-8 valido aparece U+FFFD: no era doble
    // codificacion sino texto latino genuine, y se deja como estaba.
    if (decoded.includes('\ufffd')) return run;
    // Desdoblar tiene que REDUCIR el numero de caracteres. Sin esta comprobacion
    // aceptariamos pares de letras acentuadas latinas que casualmente forman
    // UTF-8 valido y que no hay que tocar.
    return [...decoded].length < [...run].length ? decoded : run;
  });
}

export interface FetchOptions {
  timeoutMs?: number;
  /** Cabecera Referer, algunas fuentes lo exigen. */
  referer?: string;
  /** Cookie ya establecida, para mantener sesion. */
  cookie?: string;
}

/** Opciones de `fetchJson`: las mismas que `FetchOptions` mas el metodo y el cuerpo. */
export interface FetchJsonOptions extends FetchOptions {
  /** Verbo HTTP. Por defecto GET. */
  method?: 'GET' | 'POST';
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export async function fetchText(url: string, opts: FetchOptions = {}): Promise<string> {
  const { timeoutMs = 20_000, referer, cookie } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': ACCEPT_LANGUAGE,
        ...(referer ? { Referer: referer } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
    });

    if (!res.ok) {
      throw new HttpError(`HTTP ${res.status} en ${url}`, res.status);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    // Decodificamos como UTF-8 y despues reparamos lo que venga doblemente
    // codificado. Es mas fiable que fiarse solo del header, porque ninguna
    // fuente lo declara de forma consistente.
    return repairEncoding(buf.toString('utf8'));
  } catch (err) {
    if (err instanceof HttpError) throw err;
    const reason = err instanceof Error ? err.message : String(err);
    throw new HttpError(`Fallo de red en ${url}: ${reason}`, 0);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pide JSON a una fuente, con GET o POST.
 *
 * Existe porque no todas las fuentes dejan el embed escrito en el HTML: algunas
 * exponen la lista de reproductores por un endpoint que hay que POSTEAR (asi
 * funciona sololatino.net, que cifra cada enlace en un token y solo lo devuelve
 * `POST /api/player-url` con `{ t: token }`).
 *
 * Comparte la `User-Agent` y el `Accept-Language` con `fetchText` a proposito:
 * son peticiones que el navegador de la fuente haria con esas cabeceras y hay
 * sitios que responden distinto segun el cliente. `Accept` y `Content-Type` si
 * cambian, porque aqui el cuerpo es JSON y no HTML.
 */
export async function fetchJson<T>(
  url: string,
  body: unknown,
  opts: FetchJsonOptions = {},
): Promise<T> {
  const { timeoutMs = 20_000, referer, cookie, method = 'POST' } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method,
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': UA,
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': ACCEPT_LANGUAGE,
        ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
        'X-Requested-With': 'XMLHttpRequest',
        ...(referer ? { Referer: referer } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
    });

    if (!res.ok) {
      throw new HttpError(`HTTP ${res.status} en ${url}`, res.status);
    }

    return JSON.parse(await res.text()) as T;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    const reason = err instanceof Error ? err.message : String(err);
    throw new HttpError(`Fallo de red en ${url}: ${reason}`, 0);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchBinary(
  url: string,
  opts: FetchOptions = {},
): Promise<{ body: Buffer; contentType: string }> {
  const { timeoutMs = 20_000, referer } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': UA,
        Accept: '*/*',
        'Accept-Language': ACCEPT_LANGUAGE,
        ...(referer ? { Referer: referer } : {}),
      },
    });
    if (!res.ok) throw new HttpError(`HTTP ${res.status} en ${url}`, res.status);
    return {
      body: Buffer.from(await res.arrayBuffer()),
      contentType: res.headers.get('content-type') || 'application/octet-stream',
    };
  } finally {
    clearTimeout(timer);
  }
}