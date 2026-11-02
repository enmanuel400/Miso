const CHROME = '/home/demon0/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
let browserPromise = null;
let puppeteerModule = null;
let pageActual = null;
let fallosConsecutivos = 0;
const MAX_FALLOS_ANTES_RECREAR = 3;

function getChromeArgs() {
  return ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'];
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

/**
 * Cierra la página actual (sesión) para forzar cookies limpias en el próximo capítulo.
 * Esto evita que Cloudflare marque la misma sesión tras varios capítulos.
 */
async function cerrarSesion() {
  if (pageActual) {
    try { await pageActual.close(); } catch {}
    pageActual = null;
  }
  browserPromise = null; // fuerzar nuevo browser la próxima vez
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

async function getPage() {
  const browser = await getBrowser();
  if (!pageActual || pageActual.isClosed()) {
    pageActual = await browser.newPage();
    await pageActual.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    await pageActual.setExtraHTTPHeaders({ 'Accept-Language': 'es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7' });
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

async function resolverConNavegador(pageUrl, labelFiltro) {
  let page;
  try {
    page = await getPage();
  } catch {
    registrarFallo();
    return [];
  }

  const urls = [];
  const seen = new Set();
  page.on('response', async (resp) => {
    try {
      const u = resp.url();
      if (u.includes('/api/player-url')) {
        const json = await resp.json().catch(() => null);
        if (json && json.url && !seen.has(json.url)) {
          seen.add(json.url);
          urls.push(json.url);
        }
      }
    } catch {}
  });

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
    // Navegar a la URL del capítulo en la misma página (mantiene cookies de sesión)
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

    await page.waitForSelector('[data-player-token]', { timeout: 5000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 3000));

    const reStr = labelFiltro && labelFiltro.source ? labelFiltro.source : null;
    const reFlags = labelFiltro && labelFiltro.flags ? labelFiltro.flags : 'i';

    try {
      await page.evaluate((src, flags) => {
        const doc = globalThis.document;
        if (!doc) return;
        const re = src ? new RegExp(src, flags || 'i') : null;
        const btns = [...doc.querySelectorAll('[data-player-token]')];
        if (btns.length === 0) return;
        for (const b of btns) {
          const t = (b.textContent || '').toLowerCase();
          if (t.includes('principal') || t.includes('premium')) continue;
          if (re && !re.test(b.textContent || '')) continue;
          try { b.click(); return; } catch {}
        }
        for (const b of btns) {
          const t = (b.textContent || '').toLowerCase();
          if (t.includes('principal') || t.includes('premium')) continue;
          try { b.click(); return; } catch {}
        }
      }, reStr, reFlags);
    } catch {}

    const start = Date.now();
    while (Date.now() - start < 5000 && urls.length === 0) {
      await new Promise((r) => setTimeout(r, 200));
    }

    if (urls.length === 0) {
      const extra = await page.evaluate(async (src, flags) => {
        const res = [];
        const csrf = document.querySelector('meta[name="csrf-token"]')?.content || document.querySelector('meta[name="X-CSRF-TOKEN"]')?.content;
        const re = src ? new RegExp(src, flags || 'i') : null;
        const btns = [...document.querySelectorAll('[data-player-token]')];
        let list = btns.filter((b) => {
          const t = (b.textContent||'').toLowerCase();
          if (t.includes('principal')||t.includes('premium')) return false;
          if (re) return re.test(b.textContent||'');
          return /fembed|latino|vip|mixdrop|dood/i.test(b.textContent||'');
        });
        if (list.length === 0) list = btns.filter((b) => !/(principal|premium)/i.test(b.textContent||''));
        for (const b of list) {
          const tok = b.getAttribute('data-player-token');
          if (!tok) continue;
          try {
            const headers = {'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest'};
            if (csrf) headers['X-CSRF-TOKEN'] = csrf;
            const r = await fetch('/api/player-url', {
              method: 'POST',
              headers,
              body: JSON.stringify({t: tok}),
              credentials: 'include'
            });
            if (r.ok) {
              const j = await r.json().catch(()=>null);
              if (j && j.url) { res.push(j.url); break; }
            }
          } catch {}
        }
        return res;
      }, reStr, reFlags).catch(()=>[]);
      for (const u of extra) if (!seen.has(u)) urls.push(u);
    }

    if (bloqueado || urls.length === 0) {
      registrarFallo();
      // Si Cloudflare bloqueó esta sesión, cerrarla para que el próximo capítulo empiece limpio
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
