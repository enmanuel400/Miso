import { chromium } from 'playwright';

/**
 * Prueba si la deteccion de headless es lo que impide montar el player.
 * Usa el Chromium completo (canal 'chromium', nuevo headless) y corrige la
 * huella que reporta el navegador.
 */

const STEALTH = `
(() => {
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  const plain = (o, k, v) => Object.defineProperty(o, k, { get: () => v, configurable: true });

  // 1. La senal principal de automatizacion.
  plain(navigator, 'webdriver', undefined);
  plain(navigator, 'userAgent', ua);
  plain(navigator, 'platform', 'Win32');
  plain(navigator, 'languages', ['es-ES', 'es', 'en']);

  // 2. La lista de marcas: aqui aparecia "HeadlessChrome" y delata el entorno.
  plain(navigator, 'brands', [
    { brand: 'Chromium', version: '131' },
    { brand: 'Not_A Brand', version: '24' },
    { brand: 'Google Chrome', version: '131' },
  ]);
  plain(navigator, 'vendor', 'Google Inc.');

  // 3. Chrome Headless Shell no trae estas APIs; las fuentes pueden mirarlas.
  if (!window.chrome) {
    plain(window, 'chrome', { runtime: {}, app: { isInstalled: false }, csi: () => {}, loadTimes: () => {} });
  }

  // 4. WebGL y permisos que delatan un entorno sin GPU.
  const origQuery = navigator.permissions && navigator.permissions.query;
  if (origQuery) {
    navigator.permissions.query = (p) =>
      p && p.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission, onchange: null })
        : origQuery(p);
  }
})();
`;

const target = process.argv[2];
const useChannel = process.argv[3] !== 'shell';

const browser = await chromium.launch({
  headless: true,
  ...(useChannel ? { channel: 'chromium' } : {}),
  args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'],
});
const context = await browser.newContext({
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  locale: 'es-ES',
  viewport: { width: 1280, height: 800 },
});
await context.addInitScript(STEALTH);

let pages = 0;
context.on('page', (p) => {
  pages++;
  if (pages > 1) void p.close().catch(() => {});
});
const media: string[] = [];
const page = await context.newPage();
page.on('request', (r) => {
  if (/\.(m3u8|m8u8|mp4|webm|m4v|mov)(\?|$)/i.test(r.url())) media.push(r.url());
});

console.log(`modo: ${useChannel ? 'chromium completo' : 'headless shell'}`);
console.log(`version: ${browser.version()}`);

// 'commit' resuelve en cuanto el servidor responde, sin esperar a que la pagina
// termine de montar. Estas webs cargan anuncios y scripts que bloquean
// DOMContentLoaded durante mas de 25 s, asi que esperar a ese evento nos
// agotaria el presupuesto sin motivo.
await page.goto(target, { waitUntil: 'commit', timeout: 30_000 }).catch((e) => console.log('goto:', e.message));
await page.waitForTimeout(6000);

const brands = await page.evaluate(() => JSON.stringify((navigator as any).brands));
console.log(`brands reportados: ${brands}`);

await page.evaluate(() => {
  document.querySelectorAll('.adcla,[class*="popup"],[id*="popunder"],[class*="popunder"]').forEach((e) => e.remove());
});
await page.evaluate(() => {
  (window as any).jwplayer?.().play?.();
  document.querySelectorAll('video').forEach((v) => { (v as HTMLVideoElement).muted = true; (v as HTMLVideoElement).play?.().catch(() => {}); });
});
await page.waitForTimeout(6000);

const state = await page.evaluate(() => ({
  iframes: [...document.querySelectorAll('iframe')].map((f) => (f as HTMLIFrameElement).src || '(vacia)'),
  videos: [...document.querySelectorAll('video')].map((v) => (v as HTMLVideoElement).currentSrc || (v as HTMLVideoElement).src),
}));
console.log(`iframes: ${JSON.stringify(state.iframes, null, 1)}`);
console.log(`videos : ${JSON.stringify(state.videos, null, 1)}`);
console.log(`multimedia (${media.length}): ${[...new Set(media)].map((m) => m.slice(0, 110)).join('\n   ')}`);

await browser.close();