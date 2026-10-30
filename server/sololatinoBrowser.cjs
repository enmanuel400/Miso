const puppeteer = require('puppeteer-core/lib/puppeteer/puppeteer-core.js');

const CHROME = '/home/demon0/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      executablePath: CHROME,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
    });
  }
  return browserPromise;
}

async function resolverConNavegador(pageUrl, labelFiltro) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7' });
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
  try {
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('[data-player-token]', { timeout: 15000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 12000));
    const reStr = labelFiltro && labelFiltro.source ? labelFiltro.source : null;
    const reFlags = labelFiltro && labelFiltro.flags ? labelFiltro.flags : 'i';
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
    const start = Date.now();
    while (Date.now() - start < 20000 && urls.length === 0) {
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
    return urls;
  } finally {
    try { await page.close(); } catch {}
  }
}

async function buscarConNavegador(domain, query) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7' });
  try {
    await page.goto(`https://${domain}/`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
    await new Promise((r) => setTimeout(r, 8000));
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
    return body;
  } finally {
    try { await page.close(); } catch {}
  }
}

module.exports = { resolverConNavegador, buscarConNavegador };
