const CHROME = '/home/demon0/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
let browserPromise = null;
let puppeteerModule = null;
let pageActual = null;
let userAgentIndex = -1;
let fallosConsecutivos = 0;
const MAX_FALLOS_ANTES_RECREAR = 3;

/** User-agents reales de Chrome en diferentes plataformas para rotar. */
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
];

function siguienteUserAgent() {
  userAgentIndex = (userAgentIndex + 1) % USER_AGENTS.length;
  return USER_AGENTS[userAgentIndex];
}

function getChromeArgs() {
  return [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-site-isolation-trials',
    '--no-first-run',
    '--disable-extensions',
    '--disable-default-apps',
    '--disable-translate',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--window-size=1920,1080',
    '--start-maximized',
    '--disable-web-security',
    '--disable-features=site-per-process,IsolateOrigins',
    '--disable-features=Translate',
    '--disable-ipc-flooding-protection',
    '--enable-features=NetworkService,NetworkServiceInProcess',
  ];
}

async function closeBrowser() {
  if (pageActual) {
    try { await pageActual.close(); } catch {}
    pageActual = null;
  }
  if (browserPromise) {
    try {
      const browser = await browserPromise;
      await browser.close();
    } catch {}
  }
  browserPromise = null;
  fallosConsecutivos = 0;
}

async function cerrarSesion() {
  closeBrowser();
}

async function getBrowser() {
  if (!puppeteerModule) {
    puppeteerModule = await import('puppeteer-core/lib/puppeteer/puppeteer-core.js');
  }
  const puppeteer = puppeteerModule.default ?? puppeteerModule;
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      executablePath: CHROME,
      headless: true,
      args: getChromeArgs(),
    });
  }
  return browserPromise;
}

async function limpiarSesion(page) {
  try {
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  } catch {}
  try {
    const client = await page.createCDPSession();
    await client.send('Network.clearBrowserCookies');
    await client.send('Storage.clearDataForOrigin', {
      origin: '*',
      storageTypes: 'all',
    });
    await client.detach();
  } catch {}
}

async function getPage() {
  const browser = await getBrowser();
  if (!pageActual || pageActual.isClosed()) {
    pageActual = await browser.newPage();
    const ua = siguienteUserAgent();
    await pageActual.setUserAgent(ua);
    await pageActual.setExtraHTTPHeaders({
      'Accept-Language': 'es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
    });
    await limpiarSesion(pageActual);

    // Ocultar señales de automatización para que Cloudflare no detecte Puppeteer
    await pageActual.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      Object.defineProperty(navigator, 'languages', {
        get: () => ['es-ES', 'es', 'en'],
      });
      window.chrome = {
        runtime: {},
        app: { isInstalled: false },
      };
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters)
      );
    });
  }
  return pageActual;
}

function registrarExito() {
  fallosConsecutivos = 0;
}

function registrarFallo() {
  fallosConsecutivos += 1;
  if (fallosConsecutivos >= MAX_FALLOS_ANTES_RECREAR) {
    closeBrowser();
  }
  return fallosConsecutivos;
}

function esPaginaBloqueada(url, status, body) {
  if (/cloudflare/i.test(url)) return true;
  if (/challenge|captcha|verify-you-are-human|just-a-moment/i.test(body || '')) return true;
  return false;
}

/**
 * Extrae las URLs resueltas directamente del DOM.
 *
 * El sitio ya resuelve los testigos en el lado del cliente y los guarda en
 * el atributo `data-resolved-url` de cada botón. Esto nos permite obtener
 * las URLs reales sin hacer click en ningún botón ni interceptar respuestas
 * de red, evitando que el navegador seleccione el botón equivocado
 * (Principal/Premium en lugar de LATINO).
 */
async function extraerUrlsDelDom(page) {
  return page.evaluate(() => {
    const btns = [...document.querySelectorAll('[data-player-token]')];
    if (btns.length === 0) return [];

    // Separar por prioridad: LATINO primero, luego fembed, luego otros
    // Nunca incluir player.pelisserieshoy.com (Premium/Principal, no funciona)
    const latinos = [];
    const fembed = [];
    const otros = [];

    for (const b of btns) {
      const label = (b.textContent || '').toLowerCase();
      if (label.includes('principal') || label.includes('premium')) continue;

      const resolvedUrl = b.getAttribute('data-resolved-url');
      if (!resolvedUrl) continue;

      // Descartar player.pelisserieshoy.com
      if (/player\.pelisserieshoy\.com/i.test(resolvedUrl)) continue;

      const entry = { label: b.textContent?.trim() || 'Servidor', url: resolvedUrl };

      if (/latino/i.test(label)) latinos.push(entry);
      else if (/fembed/i.test(label)) fembed.push(entry);
      else otros.push(entry);
    }

    return [...latinos, ...fembed, ...otros];
  });
}

/**
 * Resolvedor con navegador (Puppeteer).
 *
 * Extrae las URLs resueltas directamente del DOM (atributo
 * data-resolved-url) en lugar de hacer click en botones. Esto evita que
 * el navegador seleccione el botón equivocado (Principal en lugar de
 * LATINO) y elimina la dependencia de interceptar respuestas de red.
 */
async function resolverConNavegador(pageUrl, labelFiltro) {
  let page;
  try {
    page = await getPage();
  } catch {
    registrarFallo();
    return [];
  }

  let bloqueado = false;
  page.on('response', async (resp) => {
    try {
      const u = resp.url();
      const txt = await resp.text().catch(() => '');
      if (esPaginaBloqueada(u, resp.status(), txt)) {
        bloqueado = true;
      }
    } catch {}
  });

  try {
    // Navegar a la URL del capítulo
    try {
      await Promise.race([
        page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 10000 }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('goto timeout')), 12000)),
      ]);
    } catch {
      try { await page.close(); } catch {}
      pageActual = null;
      registrarFallo();
      return [];
    }

    // Esperar a que Cloudflare resuelva su desafío automático si aparece.
    await new Promise((r) => setTimeout(r, 2000));
    const cloudflareStart = Date.now();
    while (Date.now() - cloudflareStart < 6000) {
      const url = page.url();
      const title = await page.title().catch(() => '');
      const body = await page.content().catch(() => '');
      if (!/cloudflare|challenge|just-a-moment|verify-you-are-human/i.test(url + ' ' + title + ' ' + body)) {
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    // Esperar a que los botones [data-player-token] aparezcan en el DOM
    await page.waitForSelector('[data-player-token]', { timeout: 8000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 2000));

    // Extraer URLs resueltas directamente del DOM
    const urls = await extraerUrlsDelDom(page);

    if (bloqueado || urls.length === 0) {
      registrarFallo();
      if (bloqueado) {
        try { await page.close(); } catch {}
        pageActual = null;
      }
    } else {
      registrarExito();
    }
    return urls;
  } finally {
    // No cerrar la página aquí: la reusamos para el siguiente capítulo salvo que esté bloqueada
  }
}

async function buscarConNavegador(domain, query) {
  let page;
  try {
    page = await getPage();
  } catch {
    registrarFallo();
    return null;
  }
  try {
    await page.goto(`https://${domain}/`, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null);
    await new Promise((r) => setTimeout(r, 3000));
    const body = await page.evaluate(async (qq) => {
      try {
        const r = await fetch(`/api/search/suggest?q=${encodeURIComponent(qq)}`, {
          method: 'GET',
          headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json, text/plain, */*' },
          credentials: 'include',
        });
        if (!r.ok) return null;
        return await r.text();
      } catch {
        return null;
      }
    }, query);
    registrarExito();
    return body;
  } catch (err) {
    registrarFallo();
    return null;
  }
}

module.exports = { resolverConNavegador, buscarConNavegador, cerrarSesion };
