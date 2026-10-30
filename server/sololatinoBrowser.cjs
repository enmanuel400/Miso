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
    await new Promise((r) => setTimeout(r, 10000));
    const reStr = labelFiltro && labelFiltro.source ? labelFiltro.source : null;
    const reFlags = labelFiltro && labelFiltro.flags ? labelFiltro.flags : 'i';
    await page.evaluate((src, flags) => {
      const doc = globalThis.document;
      if (!doc) return;
      const re = src ? new RegExp(src, flags || 'i') : null;
      const btns = [...doc.querySelectorAll('[data-player-token]')];
      if (btns.length === 0) return;
      // Click only first non-premium button
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
    while (Date.now() - start < 15000 && urls.length === 0) {
      await new Promise((r) => setTimeout(r, 200));
    }
    return urls;
  } finally {
    try { await page.close(); } catch {}
  }
}

module.exports = { resolverConNavegador };
