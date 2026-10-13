/**
 * Descifrador del player compartido de `embed69.org`.
 *
 * `sololatino.net` no expone el enlace del hoster directamente: su boton
 * "LATINO" devuelve un iframe a `https://embed69.org/f/<id>`, y esa pagina
 * guarda los enlaces REALES (voe, streamwish, vidhide...) cifrados en un array
 * `dataLink` que solo descifra su propio JavaScript.
 *
 * Cifrado, medido sobre la pagina real:
 *
 *   - Hay un proof-of-work: se busca el primer `nonce` tal que
 *     `sha256(POW_CHALLENGE + nonce)` empieza por `POW_DIFFICULTY` ceros.
 *   - La clave AES es `sha256(POW_CHALLENGE + nonce + POW_SALT)`.
 *   - Cada enlace es base64 de `IV(16 bytes) || AES-256-CBC(cifrado)`.
 *
 * Esto NO es un captcha: no hay reto humano. Es la misma tarea que el
 * navegador del propio sitio resuelve en un Web Worker al abrir la pagina, y
 * resolverla aqui evita levantar Playwright solo para ejecutarla. Por eso el
 * adaptador entrega los hosters ya resueltos y el extractor empieza en ellos,
 * en vez de pelearse con el `window.self === window.top` que la pagina usa
 * para reventar cualquier carga fuera de su iframe.
 *
 * Todas las funciones son tolerantes a fallos: si el sitio cambia su esquema,
 * esto devuelve una lista vacia y el titulo sigue intentandose por la pagina
 * propia de la fuente. Nunca lanza.
 */

import { createDecipheriv, createHash } from 'node:crypto';

export interface EnlaceEmbed69 {
  /** Idioma tal como lo declara el sitio: LAT, ESP, SUB, JAP... */
  language: string;
  /** Nombre del hoster: voe, streamwish, vidhide... */
  server: string;
  /** URL real del hoster, ya descifrada. */
  url: string;
}

const HOST = 'embed69.org';

/** true si la URL pertenece al player que sabemos descifrar. */
export function esEmbed69(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase() === HOST;
  } catch {
    return false;
  }
}

/**
 * Limite de intentos del proof-of-work.
 *
 * Con la dificultad medida (3) el nonce aparece sobre los 4.000 intentos. El
 * techo es una red de seguridad para un cambio de dificultad: 20 millones de
 * hashes son unos pocos segundos, y a partir de ahi es mas util rendirse que
 * dejar colgada la peticion del titulo.
 */
const MAX_INTENTOS = 20_000_000;
const PRESUPUESTO_POW_MS = 4_000;

/** Resuelve el proof-of-work y devuelve la clave AES, o null si no lo logra. */
function claveAes(
  challenge: string,
  difficulty: number,
  salt: string,
): Buffer | null {
  const prefijo = '0'.repeat(Math.max(1, Math.min(difficulty, 8)));
  const inicio = Date.now();

  for (let nonce = 0; nonce < MAX_INTENTOS; nonce++) {
    const hash = createHash('sha256').update(challenge + nonce).digest('hex');
    if (hash.startsWith(prefijo)) {
      return createHash('sha256').update(challenge + nonce + salt).digest();
    }
    if ((nonce & 0x3fff) === 0 && Date.now() - inicio > PRESUPUESTO_POW_MS) {
      return null;
    }
  }
  return null;
}

/** Descifra un enlace: base64 -> IV || AES-256-CBC. Null si no se puede leer. */
function descifrar(link: string, key: Buffer): string | null {
  try {
    const raw = Buffer.from(link, 'base64');
    if (raw.length <= 16) return null;
    const iv = raw.subarray(0, 16);
    const ciphertext = raw.subarray(16);
    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    const claro = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return claro.toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Extrae el array `dataLink` del HTML por conteo de corchetes.
 *
 * No se usa una expresion regular porque el array lleva cadenas base64 con
 * `/`, `+` y `=` y saltos de linea: cualquier `.*?` no codicioso cortaria en el
 * primer `]` mal puesto. El conteo de profundidad respeta las cadenas para no
 * contar corchetes que van dentro de un texto.
 */
function extraerDataLink(html: string): unknown[] | null {
  const ancla = html.indexOf('dataLink');
  if (ancla < 0) return null;
  const inicio = html.indexOf('[', ancla);
  if (inicio < 0) return null;

  let depth = 0;
  let inString = false;
  let quote = '';
  let i = inicio;
  for (; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (c === '\\') {
        i++;
        continue;
      }
      if (c === quote) inString = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = true;
      quote = c;
      continue;
    }
    if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }

  try {
    const parsed = JSON.parse(html.slice(inicio, i)) as unknown;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

interface GrupoEmbed69 {
  video_language?: string;
  sortedEmbeds?: { servername?: string; link?: string }[];
}

/**
 * Lee el HTML de una pagina `/f/<id>` de embed69 y devuelve los enlaces reales.
 * Lista vacia si el esquema no esta o falla en cualquier paso.
 */
export function descifrarEmbed69(html: string): EnlaceEmbed69[] {
  if (!html) return [];

  const challenge = html.match(/POW_CHALLENGE\s*=\s*'([^']+)'/)?.[1];
  const difficulty = html.match(/POW_DIFFICULTY\s*=\s*(\d+)/)?.[1];
  const salt = html.match(/POW_SALT\s*=\s*'([^']+)'/)?.[1];
  if (!challenge || !difficulty || !salt) return [];

  const key = claveAes(challenge, Number(difficulty), salt);
  if (!key) return [];

  const grupos = extraerDataLink(html) as GrupoEmbed69[] | null;
  if (!grupos) return [];

  const out: EnlaceEmbed69[] = [];
  for (const grupo of grupos) {
    const language = String(grupo.video_language ?? '').trim().toUpperCase() || '?';
    for (const embed of grupo.sortedEmbeds ?? []) {
      if (!embed?.link) continue;
      const url = descifrar(embed.link, key);
      if (url && /^https?:\/\//i.test(url)) {
        out.push({ language, server: String(embed.servername ?? 'servidor').trim(), url });
      }
    }
  }
  return out;
}

/**
 * Nombre legible de un idioma de embed69.
 *
 * El sitio abrevia (LAT, ESP, SUB, JAP) y esas siglas en la lista de servidores
 * no dicen nada: "LAT" y "ESP" se confunden a simple vista. Se traducen.
 */
export function nombreIdioma(code: string): string {
  const tabla: Record<string, string> = {
    LAT: 'Latino',
    ESP: 'Español',
    CAST: 'Castellano',
    SUB: 'Subtitulado',
    JAP: 'Japonés',
    ENG: 'Inglés',
  };
  return tabla[code.toUpperCase()] ?? code;
}
