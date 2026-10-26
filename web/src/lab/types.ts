/**
 * Tipos y valores por defecto de los laboratorios de disposicion.
 *
 * Los laboratorios no son la aplicacion: son dos paginas aparte (`/lab` y
 * `/lab/player`) que sirven para probar una disposicion antes de implementarla.
 * Cada una exporta un JSON; con ese JSON se toca `app.css` y los componentes de
 * verdad. No leen el almacen ni piden nada al servidor.
 *
 * Hay una configuracion por dispositivo porque una rejilla de seis columnas en
 * escritorio y dos en el movil son decisiones distintas, y mezclarlas en un solo
 * juego de valores obliga a inventar reglas raras al aplicarlas.
 */

export type Device = 'desktop' | 'tablet' | 'mobile';

export const DEVICES: { id: Device; label: string }[] = [
  { id: 'desktop', label: 'Escritorio' },
  { id: 'tablet', label: 'Tablet' },
  { id: 'mobile', label: 'Móvil' },
];

// ----------------------------------------------------------------------
// Armazon (Inicio, Generos, Favoritos, Historial, Ajustes)
// ----------------------------------------------------------------------

export type SeccionId = 'continuar' | 'novedades' | 'resultados';

export const SECCIONES: { id: SeccionId; label: string }[] = [
  { id: 'continuar', label: 'Continuar viendo' },
  { id: 'novedades', label: 'Lo más nuevo' },
  { id: 'resultados', label: 'Rejilla de resultados' },
];

export interface SeccionDisposicion {
  id: SeccionId;
  visible: boolean;
  /** Rejilla (varias columnas) o fila horizontal con desplazamiento. */
  formato: 'rejilla' | 'fila';
  /** Ancho minimo en rejilla; ancho fijo en fila. En pixeles. */
  tamano: number;
  /** Separacion entre tarjetas. En pixeles. */
  separacion: number;
  /** Cuantas tarjetas se pintan como maximo. */
  cantidad: number;
}

export interface ArmazonDisposicion {
  cabecera: 'arriba' | 'lateral';
  buscador: 'cabecera' | 'fila' | 'icono';
  secciones: SeccionDisposicion[];
  barraInferior: 'auto' | 'siempre' | 'oculta';
  /** Ancho maximo del contenido; 0 = todo el ancho disponible. */
  anchoContenido: number;
}

export type ArmazonDisposiciones = Record<Device, ArmazonDisposicion>;

function seccion(
  id: SeccionId,
  extra: Partial<Omit<SeccionDisposicion, 'id'>> = {},
): SeccionDisposicion {
  return {
    id,
    visible: true,
    formato: 'rejilla',
    tamano: 168,
    separacion: 16,
    cantidad: id === 'continuar' ? 6 : 10,
    ...extra,
  };
}

export const ARMAZON_POR_DEFECTO: ArmazonDisposiciones = {
  desktop: {
    cabecera: 'arriba',
    buscador: 'cabecera',
    secciones: [seccion('continuar'), seccion('novedades'), seccion('resultados')],
    barraInferior: 'auto',
    anchoContenido: 0,
  },
  tablet: {
    cabecera: 'arriba',
    buscador: 'fila',
    secciones: [
      seccion('continuar', { tamano: 156, cantidad: 4 }),
      seccion('novedades', { tamano: 156 }),
      seccion('resultados', { tamano: 156 }),
    ],
    barraInferior: 'auto',
    anchoContenido: 0,
  },
  mobile: {
    cabecera: 'arriba',
    buscador: 'fila',
    secciones: [
      seccion('continuar', { tamano: 132, separacion: 10, cantidad: 4 }),
      seccion('novedades', { tamano: 132, separacion: 10 }),
      seccion('resultados', { tamano: 132, separacion: 10 }),
    ],
    barraInferior: 'auto',
    anchoContenido: 0,
  },
};

// ----------------------------------------------------------------------
// Reproduccion (ficha + reproductor)
// ----------------------------------------------------------------------

export interface ReproductorDisposicion {
  /** El reproductor va dentro del contenido o a todo el ancho de la ficha. */
  reproductor: 'contenido' | 'ancho';
  /** Donde va el poster de la ficha. */
  poster: 'lateral' | 'cabecera' | 'oculto';
  /** Que ocupa la columna lateral derecha. */
  panel: 'capitulos' | 'informacion' | 'ninguno';
  /** Donde van los capitulos cuando no ocupan la columna lateral. */
  capitulos: 'panel' | 'debajo' | 'desplegable';
  temporadas: 'fila' | 'desplegable';
  servidores: 'debajo' | 'encima' | 'menu';
  acciones: 'titulo' | 'debajo';
  avisos: 'esquina' | 'arriba' | 'centro';
  /** Ancho maximo de la ficha. En pixeles. */
  ancho: number;
  /** Separacion entre bloques. En pixeles. */
  separacion: number;
}

export type ReproductorDisposiciones = Record<Device, ReproductorDisposicion>;

export const REPRODUCTOR_POR_DEFECTO: ReproductorDisposiciones = {
  desktop: {
    reproductor: 'contenido',
    poster: 'lateral',
    panel: 'capitulos',
    capitulos: 'panel',
    temporadas: 'fila',
    servidores: 'debajo',
    acciones: 'titulo',
    avisos: 'esquina',
    ancho: 1240,
    separacion: 24,
  },
  tablet: {
    reproductor: 'ancho',
    poster: 'cabecera',
    panel: 'informacion',
    capitulos: 'debajo',
    temporadas: 'fila',
    servidores: 'debajo',
    acciones: 'titulo',
    avisos: 'esquina',
    ancho: 960,
    separacion: 20,
  },
  mobile: {
    reproductor: 'ancho',
    poster: 'oculto',
    panel: 'ninguno',
    capitulos: 'desplegable',
    temporadas: 'desplegable',
    servidores: 'menu',
    acciones: 'titulo',
    avisos: 'arriba',
    ancho: 480,
    separacion: 16,
  },
};

/** JSON que se le pasa al agente para implementar la disposicion elegida. */
export function jsonDeArmazon(disposiciones: ArmazonDisposiciones): string {
  return JSON.stringify({ laboratorio: 'armazon', version: 1, disposiciones }, null, 2);
}

export function jsonDeReproductor(disposiciones: ReproductorDisposiciones): string {
  return JSON.stringify({ laboratorio: 'reproductor', version: 1, disposiciones }, null, 2);
}
