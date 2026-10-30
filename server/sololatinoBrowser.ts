// @ts-ignore
const puppeteer = require('puppeteer-core/lib/puppeteer/puppeteer-core.js');

const CHROME = '/home/demon0/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
let browserPromise: any = null;

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

export async function resolverConNavegador(pageUrl: string, labelFiltro: RegExp): Promise<string[]> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
  const urls: string[] = [];
  page.on('response', async (resp: any) => {
    try {
      if (resp.url().includes('/api/player-url')) {
        const json = await resp.json().catch(() => null);
        if (json?.url) urls.push(json.url);
      }
    } catch {}
  });
  try {
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await new Promise((r) => setTimeout(r, 20000));
    await page.evaluate((re: any) => {
      const doc: any = (globalThis as any).document;
      if (!doc) return;
      const btns = [...doc.querySelectorAll('[data-player-token]')];
      const el =
        btns.find((b: any) => re.test(b.textContent || '')) ||
        btns.find((b: any) => !/principal|premium/i.test(b.textContent || ''));
      if (el && typeof el.click === 'function') el.click();
    }, labelFiltro);
    await new Promise((r) => setTimeout(r, 15000));
    return urls;
  } finally {
    try {
      await page.close();
    } catch {}
  }
}
