/**
 * Comprobacion de `repairEncoding` contra bytes reales de pelisplushd.
 *
 * Esta funcion ya rompio una vez y el fallo no se vio: re-decodificaba el
 * documento entero y convertia el texto UTF-8 correcto en U+FFFD. Solo se
 * detectaba mirando la salida final con los caracteres de reemplazo, y un
 * U+FFFD entre 69 resultados parece ruido en vez de un fallo de codificacion.
 * Por eso queda como comprobacion fija y no como un detalle del parser.
 *
 * Las tres primeras filas son volcados literales del HTML crudo de
 * `https://pelisplushd.la/search?s=bestia`.
 */

import { repairEncoding } from '../server/http.js';

/**
 * Rehace aqui el doble encode que hace la fuente: UTF-8 -> cp1252 -> UTF-8.
 *
 * Existe para no escribir a mano el texto roto. La primera vez que se metio un
 * caso cp1252 con los caracteres ya transformados, el test fallo porque la
 * entrada estaba mal escrita a mano: eso no demuestra nada sobre el codigo que
 * se quiere probar. Si `doble()` es lo que rompe, se ve en el propio sitio, y
 * si el guardian falla, falla con la entrada REAL de la fuente.
 */
function doble(limpio: string): string {
  // El unico tramo en el que cp1252 y latin-1 se diferencian es 0x80-0x9F.
  const ALTO_A_BYTE: ReadonlyMap<number, number> = new Map([
    [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85],
    [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a],
    [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92],
    [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
    [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c],
    [0x017e, 0x9e], [0x0178, 0x9f],
  ]);
  const BYTE_A_ALTO: ReadonlyMap<number, number> = new Map(
    [...ALTO_A_BYTE].map(([c, b]) => [b, c] as const),
  );

  let intermedio = '';
  for (const byte of Buffer.from(limpio, 'utf8')) {
    const cp = byte >= 0x80 && byte <= 0x9f ? (BYTE_A_ALTO.get(byte) ?? byte) : byte;
    intermedio += String.fromCodePoint(cp);
  }
  // Volvemos a UTF-8: es lo que recibe el servidor al hacer
  // `Buffer.toString('utf8')` sobre los bytes de la pagina.
  return Buffer.from(intermedio, 'utf8').toString('utf8');
}

interface Case {
  /** Descripcion de por que este caso importa. */
  why: string;
  /** Texto tal y como llega tras `Buffer.toString('utf8')`. */
  input: string;
  /** Lo que hay que obtener. */
  want: string;
}

const CASES: Case[] = [
  {
    why: 'doblemente codificado: hay que deshacerlo',
    input: 'El corazÃ³n de la bestia',
    want: 'El corazón de la bestia',
  },
  {
    why: 'UTF-8 correcto con acento: no se toca',
    input: 'El corazón de una bestia',
    want: 'El corazón de una bestia',
  },
  {
    why: 'UTF-8 correcto con enye: no se toca',
    input: 'La bestia en mí',
    want: 'La bestia en mí',
  },
  {
    why: 'los dos casos mezclados, como en la pagina real',
    input: 'El corazÃ³n de la bestia / El corazón de una bestia / La bestia en mí',
    want: 'El corazón de la bestia / El corazón de una bestia / La bestia en mí',
  },
  {
    why: 'acentos y signos españoles: no debe inventar U+FFFD',
    input: 'Español, año ñandú, ¿qué? «comillas»',
    want: 'Español, año ñandú, ¿qué? «comillas»',
  },
  {
    why: 'tilde y circunflejo juntos: el mas comun de los dobles',
    input: 'Ã©Ã­Ã³Ãº',
    want: 'éíóú',
  },
  {
    why: 'texto ya limpio: no se toca nada',
    input: 'Bestias divinas',
    want: 'Bestias divinas',
  },
  {
    why: 'cadena vacia',
    input: '',
    want: '',
  },

  // ---------------------------------------------------------------
  // El segundo encode de la fuente es cp1252, no latin-1. Medido sobre
  // `https://pelisplushd.la/serie/rick-y-morty`, la meta description llega con
  // estos bytes:
  //
  //   c3 83 e2 80 b0  =  "Ã" + U+2030  =  la palabra "Él" rota
  //
  // El 0x89 (la "É" de UTF-8) paso por cp1252 y salio como U+2030, que cae
  // fuera del rango U+0080-U+00FF, asi que el guardian de latin-1 lo dejaba
  // pasar y el texto roto llegaba a la interfaz tal cual.
  //
  // Las entradas de abajo NO se escriben a mano: `doble()` rehace aqui mismo el
  // UTF-8 -> cp1252 -> UTF-8 que hace la fuente. Escribir el texto roto a mano
  // fue justo el error que hizo fallar este test la primera vez.
  // ---------------------------------------------------------------
  {
    why: 'cp1252: la palabra "El" con E acentuada, el caso que fallaba',
    input: doble('Él pasa los álamos'),
    want: 'Él pasa los álamos',
  },
  {
    why: 'cp1252: la meta description real de la pagina de serie',
    input: doble(
      'Serie Rick y Morty:Rick Sánchez es un genio científico alcohólico que ' +
        'se ha mudado con la familia de su hija Beth. Él pasa los ...',
    ),
    want:
      'Serie Rick y Morty:Rick Sánchez es un genio científico alcohólico que ' +
      'se ha mudado con la familia de su hija Beth. Él pasa los ...',
  },
  {
    why: 'cp1252: comillas tipograficas y euro, doblemente codificados',
    input: doble('“Aquí está bien€”'),
    want: '“Aquí está bien€”',
  },
  {
    why: 'cp1252: mayusculas y minusculas acentuadas de una vez',
    input: doble('ÁÉÍÓÚÜÑ áéíóúüñ ¿¡'),
    want: 'ÁÉÍÓÚÜÑ áéíóúüñ ¿¡',
  },
  {
    why: 'el signo euro de verdad no se toca: no es doble codificacion',
    input: 'precio 50€ y luego 60€',
    want: 'precio 50€ y luego 60€',
  },
  {
    why: 'el simbolo de marca de verdad no se toca',
    input: 'marca™ registrada™',
    want: 'marca™ registrada™',
  },
  {
    why: 'el per mille de verdad no se toca: es justo el caracter del fallo',
    input: 'rendimiento 5‰ y 8‰',
    want: 'rendimiento 5‰ y 8‰',
  },
  {
    why: 'comillas latinas de verdad: forman bytes que no son UTF-8 valido',
    input: '«así» entre «comillas»',
    want: '«así» entre «comillas»',
  },
  {
    why: 'dos letras acentuadas latinas juntas: byte a byte no es UTF-8',
    input: 'corazónción',
    want: 'corazónción',
  },
];

let failures = 0;

for (const c of CASES) {
  const got = repairEncoding(c.input);
  const ok = got === c.want && !got.includes('\ufffd');

  if (!ok) failures++;
  console.log(
    `${ok ? 'ok  ' : 'FALLO'}  ${c.why}\n` +
      `        entrada : ${JSON.stringify(c.input)}\n` +
      `        esperada: ${JSON.stringify(c.want)}\n` +
      `        obtenida: ${JSON.stringify(got)}`,
  );
}

/** El sintoma que delato el fallo original, comprobado sobre la pagina real. */
const MIXED =
  'El corazÃ³n de la bestia El corazÃ³n de una bestia La bestia en mÃ­';
const mixedOut = repairEncoding(MIXED);
const clean = mixedOut.split(' ').filter((w) => /[a-záéíóúñ]/i.test(w));
const withFffd = clean.filter((w) => w.includes('\ufffd')).length;

console.log(`\n${CASES.length - failures}/${CASES.length} casos, ${withFffd} con U+FFFD`);

if (failures > 0 || withFffd > 0) {
  console.error('\nEncoding roto: se devolveria texto con caracteres de reemplazo.');
  process.exit(1);
}
console.log('Codificacion correcta.');
