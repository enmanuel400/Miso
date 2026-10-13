import type {
  EpisodeInfo,
  EpisodeRef,
  Genre,
  MediaKind,
  PlaybackServer,
  SearchResult,
  SeriesIndex,
  SeasonInfo,
  SourceMeta,
  TitleDetail,
} from './types.js';

/**
 * Un adaptador de fuente es declarativo: describe como construir una URL de
 * busqueda y como leer los resultados del HTML. No contiene logica imperativa,
 * para que adaptar o reponer una fuente sea editar datos, no reescribir codigo.
 */
export interface SourceAdapter {
  meta: SourceMeta;
  /** Dominios candidatos. El primero vivo es el que se usa. */
  domains: string[];
  /** Construye la URL de busqueda para un termino, dado el dominio activo. */
  searchUrl(domain: string, query: string): string;
  /** Lee los resultados del HTML de busqueda ya descargado. */
  parseResults(html: string, domain: string): SearchResult[];
  /**
   * Construye la URL de la pagina del reproductor a partir del slug de detalle.
   * Se usa cuando la pagina de detalle no expone el embed de forma estatica.
   *
   * `pos` es el capitulo pedido, o null para una pelicula. Las fuentes cuya
   * pagina de detalle ya es la del reproductor lo ignoran; las de series, donde
   * la pagina de la serie no tiene ninguno, devuelven la del capitulo.
   */
  playUrl(domain: string, id: string, pos?: EpisodeRef | null): string;
  /** Extrae detalle (sinopsis, servidores) del HTML de la pagina de titulo. */
  parseDetail(html: string, domain: string, id: string): TitleDetail;
  /**
   * Ficha completa, cuando construirla exige mas de una descarga.
   *
   * Opcional y alternativa a `playUrl` + `parseDetail`: si esta, `resolveTitle`
   * la usa en su lugar. La necesitan las fuentes de API cuya ficha y cuyo indice
   * de temporadas viven en endpoints distintos (los sitios Cuevana react: el
   * detalle en `/single` y los capitulos en `/single/episodes/list`), donde una
   * sola descarga no alcanza.
   *
   * Recibe el capitulo pedido para poder bajar la temporada que se va a ver, y no
   * siempre la primera: asi el rango de esa temporada es exacto y no hay que
   * pedirla otra vez. Con `pos` nulo se usa la temporada por defecto.
   */
  fetchDetail?(domain: string, id: string, pos?: EpisodeRef | null): Promise<TitleDetail>;
  /**
   * Servidores de reproduccion que no viajan en la pagina de detalle.
   *
   * Fuente opcional, y deliberadamente aparte de `parseDetail` para no romper
   * el contrato declarativo: este metodo hace red, y los otros dos no la hacen.
   * Solo la necesitan las fuentes con API, donde los metadatos y los embeds
   * viven en endpoints separados y una sola descarga no alcanza. Las fuentes de
   * HTML la omiten.
   *
   * `pos` es el capitulo pedido, o null para una pelicula. Las fuentes que no
   * tienen capitulos lo ignoran.
   *
   * Si falla, el titulo sigue siendo reproducible mediante la pagina de
   * reproduccion de la propia fuente, que siempre se prueba como ultimo
   * recurso.
   */
  fetchServers?(
    domain: string,
    id: string,
    pos?: EpisodeRef | null,
  ): Promise<PlaybackServer[]>;

  /**
   * Capitulos de una temporada, que en estas fuentes viven en otra pagina.
   *
   * `parseDetail` ya deja el indice de temporadas relleno cuando cabe en la misma
   * descarga, y con el la lista de capitulos de la temporada por defecto. Aqui se
   * pide solo lo que falta: la lista de una temporada que no es la primera.
   *
   * Por eso una fuente que trae el mapa entero en el HTML de la serie si tiene
   * este metodo (pelisplushd vuelve a bajar esa pagina), mientras que una que
   * expone la lista en un endpoint propio lo implementa del modo normal
   * (cuevana pide `/seasons/{N}`). Lo que no tiene sentido es implementarlo solo
   * para devolver lo que ya venia en el detalle.
   *
   * Devuelve null cuando esa temporada no tiene capitulos. Un fallo aqui no es
   * grave: la serie se sigue pudiendo ver en su temporada por defecto.
   */
  fetchEpisodes?(
    domain: string,
    id: string,
    season: number,
    seasons: SeasonInfo[],
  ): Promise<EpisodeInfo[] | null>;

  /**
   * Lo mas nuevo de la fuente, para la pantalla de inicio.
   *
   * Opcional a proposito: una fuente que no exponga un listado ordenado por
   * fecha no debe inventarse uno. Lo que devuelva se mezcla con el de las demas y
   * se recorta al total, asi que puede devolver mas de los que hagan falta.
   */
  /**
   * Lo mas nuevo de la fuente, para la pantalla de inicio.
   *
   * Opcional a proposito: una fuente que no exponga un listado ordenado por
   * fecha no debe inventarse uno. Lo que devuelva se mezcla con el de las demas y
   * se recorta al total, asi que puede devolver mas de los que hagan falta.
   */
  fetchHome?(domain: string, limit: number): Promise<SearchResult[]>;

  /**
   * Titulos de un genero.
   *
   * Opcional, igual que `fetchHome`: solo la implementan las fuentes que
   * exponen un listado por genero. Devuelve el genero entero o, si la fuente
   * sabe separar por tipo, solo el tipo pedido; el orquestador no asume ninguna
   * de las dos cosas y filtra por `kind` al final.
   */
  fetchByGenre?(
    domain: string,
    genre: Genre,
    kind: MediaKind | null,
    limit: number,
  ): Promise<SearchResult[]>;
}

/** Normaliza texto: colapsa espacios, recorta y repara entidades basicas. */
export function cleanText(raw: string | undefined | null): string {
  if (!raw) return '';
  return raw
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Limpia una sinopsis y descarta el relleno.
 *
 * Las fuentes tipo Cuevana traen la MISMA frase de relleno cuando no hay
 * resumen: "Aún no hemos añadido un resumen para este título. Puedes
 * ayudarnos…". No es una sinopsis, y pintarla ocupa justo el hueco donde
 * deberia leerse la descripcion; asi que se trata como el caso vacio.
 */
export function sinopsisUtil(raw: string | undefined | null): string | null {
  const t = cleanText(raw);
  if (!t) return null;
  const low = t.toLowerCase();
  if (
    /a[uú]n no (hemos )?a[ñn]adido/.test(low) ||
    /no (hemos|hay) (a[ñn]adido|){0,1}(un )?(resumen|sinopsis)/.test(low)
  ) {
    return null;
  }
  return t;
}

/**
 * Convierte un titulo en un slug. Las fuentes usan slugs parecidas, lo que
 * mejora la deduplicacion cuando el mismo titulo aparece en mas de una.
 */
export function slugify(input: string): string {
  return cleanText(input)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

/** Titulos vacios o Pureamente de navegacion, que no son contenido real. */
export function isJunkTitle(title: string): boolean {
  const t = title.trim().toLowerCase();
  if (t.length < 1) return true;
  return [
    'ver online gratis hd',
    'ver online',
    'online gratis hd',
    'reproducir',
    'descargar',
    'ver pelicula',
  ].includes(t);
}

/**
 * Deduplica por titulo normalizado, no por id de URL.
 *
 * Medido en las fuentes de entonces: la misma pelicula aparecia varias veces
 * con el slug numerado (`solo-por-una-noche-8`, `-7`, `-6`) y en algunas
 * entradas faltaba el poster. Si deduplicaramos por id, la tarjeta apareceria
 * tres veces. Cuando dos entradas comparten titulo nos quedamos con la que tenga
 * poster, que suele ser la entrada canonica.
 *
 * Cuevana necesita esto por otro motivo: mantiene `tvshow` y `anime` como
 * catalogos separados, asi que "Star Wars Rebels" vuelve con el mismo
 * identificador en los dos, y `anime/60554` no es una tarjeta distinta de
 * `tvshow/60554`.
 */
export function dedupeResults(results: SearchResult[]): SearchResult[] {
  const byTitle = new Map<string, SearchResult>();

  for (const r of results) {
    const key = slugify(r.title);
    if (!key) continue;
    const existing = byTitle.get(key);

    if (!existing) {
      byTitle.set(key, r);
      continue;
    }

    // Sustituimos el existente solo si el nuevo aporta poster y el otro no.
    if (!existing.poster && r.poster) {
      byTitle.set(key, r);
    }
  }

  return [...byTitle.values()];
}

/** Placeholder de poster: cuando la fuente sirve una imagen "404x", no hay poster. */
export function isMissingPoster(url: string | undefined | null): boolean {
  if (!url) return true;
  return /404x|no-poster|noimage|placeholder|\/404\./i.test(url);
}

/** Interpreta el texto de tipo que usan las fuentes ("Pelicula", "Serie"...). */
/**
 * Host de una URL, o un recorte corto si no se puede leer.
 *
 * Se usa como ultimo recurso para nombrar un servidor: cuando la pagina no
 * declara el nombre del hoster, el dominio es mejor que "Servidor 4", porque al
 * menos dice de donde sale el enlace.
 */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.slice(0, 40);
  }
}

export function normalizeKind(raw: string | undefined | null): MediaKind | null {
  const t = cleanText(raw).toLowerCase();
  if (!t) return null;
  if (/anime|animaci/.test(t)) return 'anime';
  if (/serie|televisi|tv show|serie de/.test(t)) return 'series';
  if (/pel[ií]cula|film|movie|peliculas/.test(t)) return 'movie';
  return null;
}

/** Extrae un anio de 4 digitos de un texto suelto. */
export function extractYear(raw: string | undefined | null): string | null {
  const m = cleanText(raw).match(/\b(19|20)\d{2}\b/);
  return m ? m[0] : null;
}

/**
 * Quita el anio final de un titulo cuando viene entre parentesis o corchetes.
 *
 * Las fuentes WordPress devuelven "Nombre (2026)" en `title` y ademas el anio en
 * `year`. Dejar el anio en el titulo rompe dos cosas: la ficha lo repite (titulo
 * con "(2026)" y dato "2026") y, peor, la agrupacion del cliente —que es por
 * titulo— deja de unir la misma pelicula cuando la otra fuente la titula sin
 * anio. Se midio en el inicio: "Family Guy Happy Hell-o-ween" (sin anio) y su
 * version "(2026)" salian como dos tarjetas distintas.
 *
 * Solo se recorta al final entre parentesis/corchetes. Un " 2026" suelto NO se
 * toca, porque hay titulos que son un anio ("Blade Runner 2049") y recortarlos
 * cambiaria el nombre.
 */
export function sinAnio(raw: string | undefined | null): string {
  return cleanText(raw)
    .replace(/\s*[([（【]\s*(?:19|20)\d{2}\s*[)\]）】]\s*$/, '')
    .trim();
}

/**
 * Iframes que hay en estas paginas y no son reproductores.
 *
 * Vive aqui y no en el extractor porque lo escriben los dos: el extractor al
 * seguir una cadena de iframes, y los adaptadores al construir la lista de
 * servidores. Con dos copias se cuelan cosas. Se paso de verdad con gnula (fuente
 * retirada, ver paginas-fuentes.md), cuyo formulario de aviso de pelicula lleva
 * un reCAPTCHA de Google: el adaptador tenia su propia lista, le faltaba ese
 * caso, y el reCAPTCHA de la pagina salia
 * en la lista de servidores del titulo. A la vez, el extractor lo seguia como si
 * fuera el siguiente salto, gastaba cinco segundos de navegador y acababa
 * diagnosticando "el servidor pide recaptcha" cuando el reto lo ponia la pagina
 * y no el hoster. Dos errores de golpe: tiempo y un motivo de fallo falso.
 *
 * Medido antes: al seguir el primer iframe de una pagina de pelisplushd se
 * acababa en t.sharethis.com, el boton de compartir. El reproductor no estaba
 * roto; el boton salia antes en el DOM y nos ibamos detras.
 *
 * Se filtra el dominio entero y no la URL porque lo que importa es de quien es el
 * iframe, no que pagina concreta sea. google.com se filtra completo porque un
 * iframe de google nunca es un reproductor: si lo parece, es un reto, un mapa o
 * un boton de compartir.
 */
const NOISE_HOSTS = [
  'sharethis.com',
  'addthis.com',
  'facebook.com',
  'facebook.net',
  'twitter.com',
  't.me',
  'telegram.org',
  'whatsapp.com',
  'pinterest.com',
  'linkedin.com',
  'reddit.com',
  'disqus.com',
  'livechatinc.com',
  'hotjar.com',
  'crisp.chat',
  'intercom.io',
  'coinmarketcap.com',
  'googletagmanager.com',
  'google.com',
];

/**
 * Si una URL viene de aqui, no es el reproductor.
 *
 * Una URL que no se puede leer se considera ruido: no hay nada que abrir y, si se
 * abriera, no seria un reproductor.
 */
export function isNoiseHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return NOISE_HOSTS.some((n) => host === n || host.endsWith(`.${n}`));
  } catch {
    return true;
  }
}

/**
 * Alterna dos listas mientras ambas tengan elementos.
 *
 * Al terminar sigue con la que quede. Sirve para que fuentes y tipos de
 * contenido aparezcan repartidos en vez de por bloques: doce peliculas seguidas de
 * doce series llenan media pantalla de una sola cosa, y en una rejilla de doce
 * sitio se nota.
 */
export function entrelazar<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  const largo = Math.max(a.length, b.length);
  for (let i = 0; i < largo; i++) {
    if (i < a.length) out.push(a[i]);
    if (i < b.length) out.push(b[i]);
  }
  return out;
}

/**
 * Capitulo por defecto de una serie: el primero de la primera temporada que
 * tenga capitulos.
 *
 * Es lo que hacen las dos fuentes cuando el usuario abre una serie sin elegir
 * nada, y por eso no es una decision de Miso sino lo que el usuario veria
 * abriendo la pagina en el navegador. Antes cuevana lo hacia a ciegas con
 * `?season=1&episode=1`, lo que fallaba en cuanto la temporada 1 no era la que
 * tocaba; aqui sale del indice real.
 *
 * Se ignoran las temporadas sin capitulos disponibles. Medido: una serie
 * anuncia temporadas que aun no se han emitido, y pedir un capitulo de ahi
 * devuelve un error de la API en vez de un capitulo.
 */
export function primerCapitulo(seasons: SeasonInfo[]): EpisodeRef | null {
  for (const s of seasons) {
    if (s.last >= s.first) return { season: s.season, episode: s.first };
  }
  return null;
}

/** La temporada pedida existe y tiene capitulos. */
export function temporadaConCapitulos(
  seasons: SeasonInfo[],
  season: number,
): SeasonInfo | undefined {
  return seasons.find((s) => s.season === season && s.last >= s.first);
}

/**
 * Corrige el capitulo pedido para que exista de verdad.
 *
 * Hace falta porque el rango declarado por la fuente y su disponibilidad no
 * siempre coinciden: cuevana anuncia diez capitulos en la temporada 9 de "Rick y
 * Morty" y solo nueve tienen reproductor, asi que pedir el 10 devuelve un error
 * de la API en lugar de un capitulo.
 *
 * Ajustar aqui, y no en el servidor de cada fuente, evita que las dos hagan lo
 * mismo de dos maneras. Cuando el capitulo no existe, quien llama lo dice en la
 * traza: corregir en silencio y ensenar otro seria mentir sobre lo que se ha
 * reproducido.
 */
export function capituloAjustado(
  seasons: SeasonInfo[],
  pos: EpisodeRef | null,
): EpisodeRef | null {
  if (seasons.length === 0) return null;
  if (!pos) return primerCapitulo(seasons);

  const temporada = seasons.find((s) => s.season === pos.season);
  // Una temporada que no existe no es un error de capitulo sino de temporada: se
  // empieza por el principio, que es lo que haria el usuario al abrir la serie.
  if (!temporada) return primerCapitulo(seasons);

  if (pos.episode < temporada.first) return { season: temporada.season, episode: temporada.first };
  if (pos.episode > temporada.last) return { season: temporada.season, episode: temporada.last };
  return pos;
}

/**
 * Monta el indice de capitulos de una serie.
 *
 * Devuelve null cuando no hay ninguna temporada: es la senal de que el titulo no
 * es una serie y la interfaz no debe dibujar selector de capitulos. Un
 * `SeriesIndex` con `seasons` vacio haria que apareciera un desplegable con una
 * temporada sin nombre.
 */
export function indiceDeSerie(
  seasons: SeasonInfo[],
  episodes: EpisodeInfo[],
  pos: EpisodeRef | null,
): SeriesIndex | null {
  if (seasons.length === 0) return null;
  return {
    seasons,
    episodes,
    season: pos?.season ?? null,
    episode: pos,
  };
}

export type { EpisodeInfo, EpisodeRef, SearchResult, SeriesIndex, TitleDetail };