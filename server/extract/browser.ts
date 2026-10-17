import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Busca un ejecutable por nombre dentro de un arbol de directorios.
 *
 * Los nombres de las carpetas de Chromium cambian entre versiones de Playwright
 * y entre sistemas (`chrome-linux64`, `chrome-linux`, `chrome-win64`, ...) y la
 * carpeta raiz lleva la version pegada (`chromium-1243`). En vez de fijar esos
 * nombres —y romperse en la siguiente actualizacion o al empaquetar para otro
 * sistema operativo— se recorre el arbol hasta dar con el binario.
 */
function buscarEjecutable(dir: string, nombre: string, profundidad = 4): string | undefined {
  let entradas: string[];
  try {
    entradas = readdirSync(dir);
  } catch {
    return undefined;
  }

  for (const entrada of entradas) {
    const ruta = path.join(dir, entrada);
    let esDirectorio = false;
    try {
      esDirectorio = statSync(ruta).isDirectory();
    } catch {
      continue;
    }

    if (!esDirectorio) {
      if (entrada === nombre) return ruta;
      continue;
    }

    if (profundidad > 0) {
      const encontrado = buscarEjecutable(ruta, nombre, profundidad - 1);
      if (encontrado) return encontrado;
    }
  }

  return undefined;
}

/**
 * Ruta del Chromium que hay que lanzar.
 *
 * En desarrollo devuelve `undefined` a proposito: sin Electron no hay
 * `resourcesPath` y Playwright tira de su propio registro de navegadores, que es
 * lo que uno espera tras `npx playwright install chromium`.
 *
 * Empaquetada, la aplicacion copia el navegador a `resources/playwright/chromium`
 * con `scripts/stage-playwright.mjs`, de modo que la ruta no depende de la
 * carpeta personal de quien compilo. Antes aqui estaba `chromium-1243` fijo y en
 * Windows la subcarpeta se llamaba distinto, asi que el binario no se encontraba.
 */
function resolveChromiumExecutable(): string | undefined {
  const desdeEntorno =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  if (desdeEntorno) return desdeEntorno;

  const resources = (process as unknown as { resourcesPath?: string }).resourcesPath;
  if (!resources) return undefined;

  const nombre = process.platform === 'win32' ? 'chrome.exe' : 'chrome';
  return buscarEjecutable(path.join(resources, 'playwright'), nombre);
}
import type { PlaybackServer } from '../sources/types.js';
import { classifyStream } from './static.js';

/**
 * Extraccion con navegador headless.
 *
 * Es la unica via para obtener el stream real, porque estas fuentes no
 * publican la URL del video en su HTML: la construyen al ejecutar su
 * Javascript. Al cargar la pagina en un ChromiumHeadless obtenemos tres senales
 * a la vez y las combinamos:
 *
 *   1. RED      - la peticion que el reproductor hace al pedir el .m3u8
 *   2. DOM      - los atributos src ya resueltos en <video> e <iframe>
 *   3. PLAYER   - la configuracion interna del player (JW Player)
 *
 * Un solo paso de navegador recoge las tres, asi que NO se paga tres veces.
 */

const DEFAULT_BUDGET_MS = 25_000;

/**
 * Cuanto se espera a que una pagina entregue algo, en el peor caso.
 *
 * Medido: cuando el medio llega, aparece entre los 0.8 y los 3.2 segundos.
 * Ninguna extraccion que funciono llego a los 3.3 s. Seis segundos era margen de
 * sobra, y ese margen se pagaba en cada servidor fallido, que es el caso
 * frecuente: son segundos de reloj por cada intento que no iba a dar nada.
 */
const PAGE_CEILING_MS = 4_500;

/** Dominios de publicidad y telemetria que ralentizan y no aportan nada. */
const BLOCKED_HOSTS = [
  'doubleclick.net',
  'googlesyndication.com',
  'google-analytics.com',
  'googletagmanager.com',
  'adservice.google.com',
  'popads.net',
  'propellerads.com',
  'adsterra.com',
  'hilltopads.net',
  'onclickalgo.com',
  'exoclick.com',
  'trafficjunky.net',
];

/**
 * La lista de iframes que no son reproductores vive en sources/shared.ts, no
 * aqui. Este modulo la reexporta porque es el que la consume al seguir una
 * cadena, pero la escriben a la vez el extractor y los adaptadores de fuente:
 * al tener dos copias, gnula se colaba un reCAPTCHA de su propia pagina como
 * si fuera un servidor, que es justo el fallo que la lista existe para evitar.
 */
import { isNoiseHost } from '../sources/shared.js';
export { isNoiseHost };

export interface BrowserExtraction {
  /** Candidatos ordenados, del mas probable al menos. */
  candidates: PlaybackServer[];
  /** Metodo que produjo el primer candidato util. */
  method: string | null;
  /** Traza de lo que se observo, util para diagnosticar una fuente caida. */
  trace: string[];
  /** URL final de la pagina donde se resolvio (puede redirigir). */
  finalUrl: string | null;
  /** Estado HTTP de la navegacion, para reconocer un 404 sin releer el cuerpo. */
  status: number | null;
  durationMs: number;
  /**
   * Reto anti-bot detectado en la pagina, con su nombre ("captcha",
   * "recaptcha", "turnstile"...), o null si no hay ninguno.
   *
   * Existe para poder decirlo con su nombre en el informe de fallo. Antes de
   * esto un servidor que exigia captcha salia como "no se pudo extraer
   * ninguna direccion de video", que no dice nada: parece un fallo pasajero y
   * el usuario espera en balde a que se resuelva solo.
   */
  challenge: string | null;
}

/**
 * Senales de un reto anti-bot.
 *
 * Se miran en el titulo de la pagina y en el texto visible, no en todo el HTML:
 * un hoster corriente carga reCAPTCHA aunque su propio reto sea invisible, y
 * contarlo como captcha seria mentir sobre el motivo real del fallo.
 */
const CHALLENGE_HINTS: { name: string; re: RegExp }[] = [
  { name: 'recaptcha', re: /recaptcha/i },
  { name: 'turnstile', re: /turnstile/i },
  { name: 'hcaptcha', re: /hcaptcha/i },
  { name: 'captcha', re: /captcha|verifica que eres|confirm.*human/i },
];

/** Un iframe http ya presente, de origen distinto al de la pagina. */
async function hasIframe(page: Page): Promise<boolean> {
  const found = await page
    .evaluate(
      'Array.from(document.querySelectorAll("iframe")).some((f) => /^https?:/i.test(f.src || ""))',
    )
    .catch(() => false);

  return found === true;
}

/**
 * Espera activa hasta que haya algo que valga, o se agote el techo.
 *
 * Dos salidas tempranas, no una. Sondea en lugar de dormir porque la diferencia
 * entre acertar pronto y agotar la espera ciega son segundos, y con una cadena
 * de tres saltos por titulo se nota.
 *
 * La primera es el medio ya pedido en la red. La segunda es el iframe. Medido: nupload.my y watchfun.top envuelven
 * su player en un iframe y no piden nunca el medio en su propia red, asi que la
 * espera se consumia entera para nada y el salto se hacia despues, cuando ya
 * se podia haber hecho antes. Se espera un minimo antes de aceptar ese atajo,
 * para no perder el caso de que la pagina casi entregue el medio directo.
 */
async function waitForMedia(
  page: Page,
  networkHits: Map<string, string>,
  ceilingMs: number,
  hasIframeNow: () => Promise<boolean>,
): Promise<{ early: boolean; followable: boolean; waitedMs: number }> {
  const started = Date.now();
  const deadline = started + ceilingMs;
  // Margen antes de aceptar el atajo del iframe.
  //
  // Medido: cuando el medio si llega, aparece entre los 0.8 y los 3.2 segundos.
  // Un margen por debajo de 3s cortaria en seco casos que si funcionaban y
  // entregaria el video bueno para terminar siguiendo un iframe que no lleva a
  // ninguna parte. Tres segundos es el punto donde el atajo sigue ahorrando
  // tiempo sin apostarlo todo a una medida.
  const graceMs = 3_000;

  while (Date.now() < deadline) {
    if (networkHits.size > 0) {
      return { early: true, followable: false, waitedMs: Date.now() - started };
    }

    if (Date.now() - started >= graceMs && (await hasIframeNow())) {
      return { early: false, followable: true, waitedMs: Date.now() - started };
    }

    await page.waitForTimeout(400);
  }

  return { early: false, followable: false, waitedMs: Date.now() - started };
}

/**
 * Lee el titulo y el texto visible de la pagina.
 *
 * Va como cadena, y no como funcion, por la misma razon que READ_PLAYER_STATE:
 * el codigo corre dentro del navegador y no debe mezclarse con el tipado del
 * servidor, que no tiene DOM.
 */
const READ_VISIBLE_TEXT =
  '`${document.title}\\n${document.body ? document.body.innerText : ""}`.slice(0, 3000)';

/**
 * Texto visible de la pagina: titulo mas lo que el usuario veria en pantalla.
 *
 * Se lee `innerText` y no el HTML a proposito. El HTML crudo esta lleno de
 * scripts que nombran captcha aunque la pagina se reproduzca bien, asi que
 * buscar en el daria falsos positivos en paginas que si funcionan.
 */
async function visibleText(page: import('playwright').Page): Promise<string> {
  const text = await page.evaluate(READ_VISIBLE_TEXT).catch(() => null);
  return typeof text === 'string' ? text : '';
}

/** Texto del reto visible, con los nombres largos de los servicios quitados. */
function detectChallenge(html: string): string | null {
  const head = html.slice(0, 4000);

  for (const { name, re } of CHALLENGE_HINTS) {
    if (!re.test(head)) continue;

    // hCaptcha y reCAPTCHA suelen venir en paginas que si reproducen. Si ademas
    // hay un texto de bloqueo, el reto es el que nos para y eso es lo que
    // hay que decir.
    const blocked =
      /verifica que eres|comprueba que eres|no (?:eres|has sido) un robot|access denied|demasiadas peticiones|too many requests/i.test(
        head,
      );

    return blocked ? `${name} (bloquea el acceso)` : name;
  }

  return null;
}

let browserPromise: Promise<Browser> | null = null;

function isBlocked(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return BLOCKED_HOSTS.some((b) => host === b || host.endsWith(`.${b}`));
  } catch {
    return false;
  }
}

/**
 * Correccion de huella del navegador.
 *
 * Al menos una de las fuentes envia la lista de marcas del navegador a su
 * servidor de seguridad, y ahi aparecia literalmente "HeadlessChrome", tras lo
 * cual el reproductor nunca se montaba. No estamos saltando ninguna proteccion
 * de acceso: se esta presentando un navegador real como lo que es, porque lo
 * que buscamos son streams que estas fuentes ofrecen publicamente.
 */
const STEALTH = `
(() => {
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  const define = (o, k, v) => { try { Object.defineProperty(o, k, { get: () => v, configurable: true }); } catch (_) {} };

  define(navigator, 'webdriver', undefined);
  define(navigator, 'userAgent', ua);
  define(navigator, 'platform', 'Win32');
  define(navigator, 'languages', ['es-ES', 'es', 'en']);
  define(navigator, 'vendor', 'Google Inc.');
  define(navigator, 'brands', [
    { brand: 'Chromium', version: '131' },
    { brand: 'Not_A Brand', version: '24' },
    { brand: 'Google Chrome', version: '131' },
  ]);

  if (!window.chrome) {
    define(window, 'chrome', { runtime: {}, app: { isInstalled: false }, csi: () => {}, loadTimes: () => {} });
  }
})();
`;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({
        headless: true,
        executablePath: resolveChromiumExecutable(),
        args: [
          // Varias de estas webs miran si el navegador parece automatizado.
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--mute-audio',
        ],
      })
      .catch((err) => {
        // Si falla el arranque no dejamos una promesa envenenada cacheada,
        // o el siguiente intento reutilizaria un rejection antigo.
        browserPromise = null;
        throw err;
      });
  }
  return browserPromise;
}

/**
 * Cierra el navegador headless. Se usa en dos momentos:
 * la suspension por inactividad (nivel 1) y el apagado completo (nivel 2).
 */
export async function closeBrowser(): Promise<void> {
  const pending = browserPromise;
  browserPromise = null;
  if (!pending) return;
  try {
    const browser = await pending;
    await browser.close();
  } catch {
    // ya estaba cerrado
  }
}

export function isBrowserRunning(): boolean {
  return browserPromise !== null;
}

/**
 * Script que se inyecta en TODOS los frames, incluidos los iframes de otros
 * origenes donde suele vivir el reproductor (nupload.my embebido en
 * watchfun.top, por ejemplo).
 *
 * Se registra con addInitScript y se programa a si mismo, porque cuando el
 * documento arranca el player todavia no existe: hay que reintentar.
 */
const BOOTSTRAP = `
(() => {
  if (window.__misoKick) return;
  window.__misoKick = true;

  const cleanAds = () => {
    const junk = [
      '.adcla', '.ad-cla', '.ads-box', '.advertisement', '[class*="popup"]',
      '[id*="popunder"]', '[class*="popunder"]', '.modal-backdrop',
      'ins.adsbygoogle', '[class*="adsbygoogle"]'
    ];
    for (const sel of junk) {
      try { document.querySelectorAll(sel).forEach((el) => el.remove()); } catch (_) {}
    }
    try {
      document.querySelectorAll('body > div[style*="position:fixed"]').forEach((el) => {
        const s = getComputedStyle(el);
        if (s.zIndex !== 'auto' && Number(s.zIndex) > 900) el.remove();
      });
    } catch (_) {}
  };

  const kick = () => {
    cleanAds();

    // JW Player arranca con autostart:false y preload:none. Si no se le
    // ordena reproducir, NUNCA pide el .m3u8, que es justo lo que buscamos.
    try {
      const w = window;
      if (typeof w.jwplayer === 'function') {
        const tryPlay = (inst) => { try { inst && inst.play && inst.play(); } catch (_) {} };
        tryPlay(w.jwplayer());
        // El player suele registrarse con un id concreto ('player'), y la
        // llamada sin argumentos no siempre devuelve la instancia buena.
        try {
          const el = document.getElementById('player');
          if (el) tryPlay(w.jwplayer(el.id));
        } catch (_) {}
      }
    } catch (_) {}

    // Videos nativos con <source>, a veces montados a mano por la fuente.
    try {
      document.querySelectorAll('video').forEach((v) => {
        try {
          v.muted = true;
          if (!v.src) {
            const s = v.querySelector('source[src]');
            if (s) v.src = s.src;
          }
          const p = v.play();
          if (p && p.catch) p.catch(() => {});
        } catch (_) {}
      });
    } catch (_) {}
  };

  let ticks = 0;
  const timer = setInterval(() => {
    kick();
    if (++ticks > 25) clearInterval(timer);
  }, 600);
  kick();
})();
`;

/**
 * Lee el estado interno del reproductor desde el contexto de la pagina.
 * JW Player guarda aqui la ruta real del medio, que es la senal mas fiable
 * cuando el stream se sirve con token de sesion.
 */
const READ_PLAYER_STATE = `
(() => {
  const out = { player: [], dom: [], iframe: [] };

  // --- API del player ---------------------------------------------------
  try {
    const jp = window.jwplayer;
    if (typeof jp === 'function') {
      const inst = jp();
      const push = (file, kind) => {
        if (typeof file === 'string' && /^https?:/i.test(file)) {
          out.player.push({ file, kind: kind || null });
        }
      };
      if (inst) {
        if (typeof inst.getMediaItem === 'function') {
          const item = inst.getMediaItem();
          (item && item.sources || []).forEach((s) => push(s.file, s.type));
        }
        if (typeof inst.getPlaylistItem === 'function') {
          const item = inst.getPlaylistItem();
          (item && item.sources || []).forEach((s) => push(s.file, s.type));
        }
        if (typeof inst.getMedia === 'function') push(inst.getMedia(), 'file');
        if (typeof inst.getPlaylist === 'function') {
          (inst.getPlaylist() || []).forEach((i) =>
            (i.sources || []).forEach((s) => push(s.file, s.type))
          );
        }
      }
    }
  } catch (_) {}

  // --- DOM: <video> y <source> -----------------------------------------
  document.querySelectorAll('video').forEach((v) => {
    if (v.currentSrc) out.dom.push({ file: v.currentSrc, kind: 'video' });
    else if (v.src) out.dom.push({ file: v.src, kind: 'video' });
    v.querySelectorAll('source').forEach((s) => {
      if (s.src) out.dom.push({ file: s.src, kind: s.type || null });
    });
  });

  // --- DOM: <iframe> ya resueltos --------------------------------------
  document.querySelectorAll('iframe').forEach((f) => {
    if (f.src && /^https?:/i.test(f.src)) out.iframe.push({ file: f.src });
  });

  return out;
})();
`;

/**
 * Resuelve un embed hasta un stream reproducible.
 *
 * @param embedUrl  URL del embed o de la pagina del player.
 * @param referer   Pagina de origen; algunas fuentes rechazan peticiones sin el.
 * @param budgetMs  Tiempo maximo que se concede a esta resolucion.
 */
export async function extractWithBrowser(
  embedUrl: string,
  referer?: string,
  budgetMs = DEFAULT_BUDGET_MS,
): Promise<BrowserExtraction> {
  const started = Date.now();
  const trace: string[] = [];

  let context: BrowserContext | null = null;
  const networkHits = new Map<string, string>();

  try {
    const browser = await getBrowser();

    // Contexto aislado: cada extraccion empieza sin cookies heredadas.
    context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: 'es-ES',
      viewport: { width: 1280, height: 800 },
      bypassCSP: true,
    });

    // Cortamos publicidad y telemetria: no aportan el stream y alargan la carga.
    await context.route('**/*', (route) => {
      const url = route.request().url();
      if (isBlocked(url)) return route.abort();
      return route.continue();
    });

    // Se inyecta en cada documento, incluidos los iframes de otros origenes,
    // que es donde suele estar el player que nos interesa.
    await context.addInitScript(STEALTH);
    await context.addInitScript(BOOTSTRAP);

    // Las paginas de questeos abren ventanas de publicidad. Cerramos todas
    // menos la primera, que es la nuestra.
    // Contamos en lugar de comparar referencias porque el evento 'page' de
    // Playwright tambien se emite durante newPage(), cuando nuestra variable
    // todavia no esta inicializada.
    let pagesOpened = 0;
    context.on('page', (p) => {
      pagesOpened++;
      if (pagesOpened > 1) void p.close().catch(() => {});
    });

    const mainPage: Page = await context.newPage();

    mainPage.on('request', (req) => {
      const url = req.url();
      if (/\.m3u8|\.m8u8(?:$|\?)/i.test(url)) {
        networkHits.set(url, 'network');
      } else if (/\.(mp4|webm|m4v|mov)(?:$|\?)/i.test(url)) {
        networkHits.set(url, 'network');
      }
    });

    mainPage.on('response', (res) => {
      const url = res.url();
      if (/\.m3u8|\.m8u8(?:$|\?)/i.test(url)) networkHits.set(url, 'network');
      else if (/\.(mp4|webm|m4v|mov)(?:$|\?)/i.test(url)) networkHits.set(url, 'network');
    });

    // 'commit' resuelve en cuanto el servidor responde. Estas paginas cargan
    // publicidad y scripts que bloquean DOMContentLoaded mas de 25 s, asi que
    // esperar a ese evento agotaria el presupuesto sin motivo.
    const response = await mainPage.goto(embedUrl, {
      waitUntil: 'commit',
      timeout: Math.min(budgetMs, 25_000),
      referer,
    });
    trace.push(`goto ${response?.status() ?? 'sin-status'}`);

    // BOOTSTRAP ya se esta reintentando solo en cada frame. Hay que darle
    // tiempo a montar el player y disparar la peticion del medio, pero esperar
    // siempre los seis segundos completos es lo que hace que la aplicacion se
    // sienta lenta de principio a fin.
    //
    // Con una cadena de tres saltos, como la de repelisplus, son casi veinte
    // segundos de espera fija por titulo: el usuario no ve nada moverse y no
    // sabe si esta trabajando o colgada. Asi que se sondea y se sale en cuanto
    // aparece algo reproducible. El techo se mantiene para los fallos, que son
    // los que necesitan agotar la espera.
    // El techo de la espera nunca puede pasar del presupuesto que queda: si a
    // este salto le quedan 900 ms, esperar 4,5 s seria pasarse. Con la cadena de
    // iframes, el ultimo salto es siempre el que mas tight tiene.
    const esperaMedia = Math.min(PAGE_CEILING_MS, Math.max(1_000, budgetMs - 400));
    const espera = await waitForMedia(mainPage, networkHits, esperaMedia, () => hasIframe(mainPage));
    trace.push(
      espera.early
        ? `medio detectado en ${espera.waitedMs}ms, sin agotar la espera`
        : espera.followable
          ? `iframe disponible en ${espera.waitedMs}ms, seguimos esa cadena`
          : `espera agotada: ${espera.waitedMs}ms sin medio ni iframe`,
    );

    // Recorremos TODOS los frames, no solo el principal: el player suele
    // vivir en un iframe de otro origen, y su estado no es legible desde
    // fuera. Playwright si nos deja evaluarlo frame a frame.
    type PlayerState = {
      player: { file: string; kind: string | null }[];
      dom: { file: string; kind: string | null }[];
      iframe: { file: string }[];
    };
    const states: PlayerState[] = [];
    for (const frame of mainPage.frames()) {
      const st = (await frame.evaluate(READ_PLAYER_STATE).catch(() => null)) as PlayerState | null;
      if (st) states.push(st);
    }

    const candidates = new Map<string, PlaybackServer>();
    let index = 0;
    const add = (file: string, method: string) => {
      if (!file || candidates.has(file)) return;
      candidates.set(file, {
        id: `br-${index++}`,
        label: 'Navegador',
        embedUrl: file,
        method,
      });
    };

    // Prioridad: red (el token ya es valido) > API del player > DOM > iframe.
    for (const url of networkHits.keys()) add(url, 'network');
    for (const st of states) {
      for (const p of st.player) add(p.file, 'player-api');
      for (const d of st.dom) add(d.file, 'dom');
    }
    for (const st of states) {
      for (const f of st.iframe) {
        // Los widgets de compartir y los chats tambien son <iframe>. Meterlos en
        // la lista de candidatos hace que parezcan un servidor mas, y luego el
        // informe los enseña como si hubieran sido probados.
        if (isNoiseHost(f.file)) continue;
        add(f.file, 'dom-iframe');
      }
    }

    const totals = states.reduce(
      (acc, st) => ({
        player: acc.player + st.player.length,
        dom: acc.dom + st.dom.length,
        iframe: acc.iframe + st.iframe.length,
      }),
      { player: 0, dom: 0, iframe: 0 },
    );
    trace.push(`frames=${states.length} red=${networkHits.size} player=${totals.player} dom=${totals.dom} iframe=${totals.iframe}`);

    // El HLS manda sobre el resto: es lo unico que hls.js puede reproducir
    // de forma nativa sin Convertir a MP4.
    const ordered = [...candidates.values()].sort((a, b) => {
      const w = (c: PlaybackServer) => (classifyStream(c.embedUrl) === 'hls' ? 0 : classifyStream(c.embedUrl) === 'file' ? 1 : 2);
      return w(a) - w(b);
    });

    const best = ordered.find((c) => classifyStream(c.embedUrl) !== 'embed');

    // El reto se mira solo cuando no hemos sacado nada: si hay stream, el
    // captcha que trailing en la pagina es ruido, no un problema.
    const challenge = best ? null : detectChallenge(await visibleText(mainPage));

    if (challenge) trace.push(`reto detectado: ${challenge}`);

    return {
      candidates: ordered,
      method: best?.method ?? null,
      trace,
      finalUrl: mainPage.url(),
      status: response?.status() ?? null,
      durationMs: Date.now() - started,
      challenge,
    };
  } catch (err) {
    trace.push(`error: ${err instanceof Error ? err.message : String(err)}`);
    return {
      candidates: [],
      method: null,
      trace,
      finalUrl: null,
      status: null,
      durationMs: Date.now() - started,
      challenge: null,
    };
  } finally {
    await context?.close().catch(() => {});
  }
}