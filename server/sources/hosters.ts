/**
 * Resolucion en Node de hosters que montan su reproductor desde JavaScript
 * empaquetado.
 *
 * La familia vidhide (hoy servida desde `morencius.com`, antes `vidhidepro.com`)
 * publica el reproductor con el empaquetador clasico de Dean Edwards:
 *
 *   eval(function(p,a,c,k,e,d){...}('CODIGO',36,538,'palabra|...'.split('|')))
 *
 * Ese `eval` construye un objeto `links` con la direccion de cada calidad. El
 * detalle que enganya a un extractor normal es que `links.hls4` (el que el
 * reproductor pone como `sources[0].file`) NO es video: es un manifiesto SENUELO
 * cuyos 933 segmentos son imagenes PNG de una red de anuncios. El video real
 * esta en `links.hls2` (y su gemelo `hls3`), en otro CDN y con segmentos
 * MPEG-TS de verdad.
 *
 * Por eso aqui se empaqueta al reves y se elige `hls2` explicitamente, en vez de
 * coger el primer `.m3u8` que aparezca, que seria el senuelo. Es la misma tarea
 * que hace el navegador del sitio; hacerla en Node evita abrir Chromium y
 * esperar a que la pagina se deshaga de su propia publicidad.
 *
 * Todo es tolerante a fallos: si el sitio cambia de empaquetador, esto devuelve
 * null y el titulo se sigue intentando con el resto de servidores.
 */

import { fetchText } from '../http.js';

/** Hosts conocidos de la familia vidhide. */
const VIDHIDE_HOSTS = [
  'morencius.com',
  'vidhide.com',
  'vidhidepro.com',
  'vidhidepre.com',
  'vidhidevip.com',
  'streamhide.to',
  'minochinos.com',
];

function hostnameOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

/** true si la URL parece de la familia vidhide. */
export function esVidhide(url: string | null | undefined): boolean {
  const host = hostnameOf(url);
  if (!host) return false;
  return (
    VIDHIDE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)) ||
    /(^|\.)vidhide[a-z]*\./.test(host)
  );
}

/** Reescapa los literales JS mas comunes de una cadena ya entrecomillada. */
function desescapar(raw: string): string {
  return raw.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_m, esc: string) => {
    if (esc[0] === 'u') return String.fromCharCode(parseInt(esc.slice(1), 16));
    if (esc[0] === 'x') return String.fromCharCode(parseInt(esc.slice(1), 16));
    switch (esc) {
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      case 'b':
        return '\b';
      case 'f':
        return '\f';
      default:
        return esc;
    }
  });
}

/** Lee un literal entrecomillado con comillas simples desde `quoteAt`. */
function leerLiteral(src: string, quoteAt: number): { value: string; end: number } | null {
  if (src[quoteAt] !== "'") return null;
  let i = quoteAt + 1;
  let raw = '';
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\') {
      raw += ch + (src[i + 1] ?? '');
      i += 2;
      continue;
    }
    if (ch === "'") return { value: desescapar(raw), end: i + 1 };
    raw += ch;
    i++;
  }
  return null;
}

/**
 * Deshace un bloque del empaquetador de Dean Edwards.
 *
 * `e(n)` reconstruye el testigo de base `a` que identifica la palabra `n`; luego
 * se reemplaza ese testigo, como palabra completa, por la palabra original. Se
 * recorre de mayor a menor indice porque el propio empaquetador lo hace asi: los
 * testigos de mas de un caracter podrian contener otros ya reemplazados.
 */
function desempaquetarBloque(p: string, a: number, c: number, palabras: string): string {
  const k = palabras.split('|');
  const e = (n: number): string => {
    const resto = n % a;
    const digito = resto > 35 ? String.fromCharCode(resto + 29) : resto.toString(36);
    return n < a ? digito : e(Math.floor(n / a)) + digito;
  };

  let texto = p;
  for (let i = c - 1; i >= 0; i--) {
    if (!k[i]) continue;
    const token = e(i);
    if (!token) continue;
    const re = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
    // Reemplazo por funcion: el texto original lleva `$` (jQuery) y pasarlo como
    // cadena haria que se interpretase como `$&`, `$1`, etc.
    texto = texto.replace(re, () => k[i]);
  }
  return texto;
}

interface Bloque {
  start: number;
  end: number;
  code: string;
}

/**
 * Desempaqueta los bloques `eval(function(p,a,c,k,e,d){...})` de un HTML.
 *
 * El corte entre el cuerpo de la funcion y sus argumentos se busca desde
 * `.split('|')` hacia atras, no desde el principio: el cuerpo del empaquetador
 * tambien lleva llaves y parentesis, pero el unico `}('` inmediatamente anterior
 * a `.split('|')` es el limite real.
 */
export function desempaquetar(src: string): string {
  const marca = 'eval(function(p,a,c,k,e,d)';
  const bloques: Bloque[] = [];
  let from = 0;

  while (true) {
    const start = src.indexOf(marca, from);
    if (start < 0) break;
    const splitAt = src.indexOf(".split('|')", start);
    if (splitAt < 0) {
      from = start + marca.length;
      continue;
    }
    const b = src.lastIndexOf("}('", splitAt);
    if (b < start) {
      from = start + marca.length;
      continue;
    }

    const packed = leerLiteral(src, b + 2);
    const cabecera = packed ? /^,\s*(\d+)\s*,\s*(\d+)\s*,\s*'/.exec(src.slice(packed.end, splitAt)) : null;
    if (!packed || !cabecera) {
      from = start + marca.length;
      continue;
    }

    const kStart = packed.end + cabecera[0].length - 1;
    const palabras = leerLiteral(src, kStart);
    if (!palabras || src.slice(palabras.end, splitAt).trim() !== '') {
      from = start + marca.length;
      continue;
    }

    bloques.push({
      start,
      end: splitAt + ".split('|')".length,
      code: desempaquetarBloque(packed.value, Number(cabecera[1]), Number(cabecera[2]), palabras.value),
    });

    // El bloque tiene la forma `eval(function(...){...}(ARGS))`: despues de
    // `.split('|')` quedan los parentesis de cierre, que hay que consumir para
    // no dejar restos (`))`) en el texto desempaquetado.
    let fin = bloques[bloques.length - 1].end;
    while (src[fin] === ')') fin++;
    bloques[bloques.length - 1].end = fin;
    from = fin;
  }

  if (bloques.length === 0) return src;

  bloques.sort((x, y) => x.start - y.start);
  let out = '';
  let last = 0;
  for (const bloque of bloques) {
    out += src.slice(last, bloque.start) + bloque.code;
    last = bloque.end;
  }
  return out + src.slice(last);
}

/** Saca el objeto `links = {...}` del JS ya desempaquetado. */
function extraerLinks(code: string): Record<string, string> | null {
  const m = /links\s*=\s*(\{[^{}]*\})/.exec(code);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[1]) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') out[key] = value;
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Pura: dado el HTML de un embed vidhide, devuelve la URL del video real.
 *
 * Se prefiere `hls2` porque es un `.m3u8` de verdad (el extractor lo reconoce
 * como HLS sin abrir navegador); `hls3` es el mismo video con extension `.txt`,
 * que obligaria a tratarlo como pagina. El senuelo `hls4` no se usa nunca.
 */
export function descifrarVidhide(html: string): string | null {
  if (!html) return null;
  const code = desempaquetar(html);

  const links = extraerLinks(code);
  if (links?.hls2) return links.hls2;
  if (links?.hls3) return links.hls3;

  // Respaldo: cualquier `.m3u8` que no viva en el host del propio embed (el del
  // mismo host es el senuelo de segmentos PNG).
  const host = hostnameOf(html) ?? '';
  for (const m of code.matchAll(/https?:\/\/[^\s"'<>\\]+?\.m3u8(?:\?[^\s"'<>\\]*)?/gi)) {
    const url = m[0];
    if (hostnameOf(url) !== host) return url;
  }
  return null;
}

/**
 * Resuelve un embed de la familia vidhide a la URL directa de su video.
 * Devuelve null si no se puede leer; nunca lanza.
 */
export async function resolverVidhide(embedUrl: string): Promise<string | null> {
  const html = await fetchText(embedUrl, { timeoutMs: 12_000 }).catch(() => '');
  if (!html) return null;
  const directo = descifrarVidhide(html);
  if (!directo) return null;
  try {
    return new URL(directo, embedUrl).href;
  } catch {
    return null;
  }
}
