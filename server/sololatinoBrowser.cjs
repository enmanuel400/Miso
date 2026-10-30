const CHROME = '/home/demon0/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    const puppeteer = require('puppeteer-core/lib/puppeteer/puppeteer-core.js');
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
  page.on('response', async (resp) => {
    try {
      const u = resp.url();
      if (u.includes('/api/player-url')) {
        const json = await resp.json().catch(() => null);
        if (json && json.url) urls.push(json.url);
      }
    } catch {}
  });
  try {
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await new Promise((r) => setTimeout(r, 25000));
    const reStr = labelFiltro && labelFiltro.source ? labelFiltro.source : null;
    const reFlags = labelFiltro && labelFiltro.flags ? labelFiltro.flags : 'i';
    await page.evaluate((src, flags) => {
      const doc = globalThis.document;
      if (!doc) return;
      const re = src ? new RegExp(src, flags || 'i') : null;
      const btns = [...doc.querySelectorAll('[data-player-token]')];
      let el = null;
      if (re) el = btns.find((b) => re.test(b.textContent || ''));
      if (!el) el = btns.find((b) => /latino|vip|mixdrop|dood/i.test(b.textContent || ''));
      if (!el) el = btns.find((b) => !/principal|premium/i.test(b.textContent || ''));
      if (el && typeof el.click === 'function') el.click();
    }, reStr, reFlags);
    await new Promise((r) => setTimeout(r, 25000));
    return [...new Set(urls)];
  } finally {
    try {
      await page.close();
    } catch {}
  }
}

module.exports = { resolverConNavegador };
