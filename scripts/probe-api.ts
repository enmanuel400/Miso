import { chromium } from 'playwright';

/** Captura las respuestas de API que usa una pagina para montar su player. */
const target = process.argv[2];
const apiPattern = new RegExp(process.argv[3] || 'player\\.php|\\.php|api|embed', 'i');

const browser = await chromium.launch({
  headless: true,
  args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'],
});
const context = await browser.newContext({
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  locale: 'es-ES',
  viewport: { width: 1280, height: 800 },
});
let pages = 0;
context.on('page', (p) => {
  pages++;
  if (pages > 1) void p.close().catch(() => {});
});
const page = await context.newPage();

const media: string[] = [];

page.on('response', async (res) => {
  const url = res.url();
  if (/\.(m3u8|m8u8|mp4|webm|m4v|mov)(\?|$)/i.test(url)) media.push(url);
  if (!apiPattern.test(url)) return;
  if (/\.(css|png|jpg|jpeg|svg|woff2?|gif|webp|js)(\?|$)/i.test(url)) return;
  let body = '';
  try {
    body = (await res.text()).slice(0, 2500);
  } catch {
    body = '<cuerpo no legible>';
  }
  console.log(`\n=== ${res.request().method()} ${url}`);
  const postData = res.request().postData();
  if (postData) console.log(`POST DATA: ${postData.slice(0, 400)}`);
  console.log(`RESPUESTA (${body.length} chars):\n${body}`);
});

await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 25_000 }).catch((e) => console.log('goto:', e.message));
await page.waitForTimeout(4000);

// Quitar anuncios y buscar un disparador de reproduccion.
await page.evaluate(() => {
  document
    .querySelectorAll('.adcla,[class*="popup"],[id*="popunder"],[class*="popunder"],[class*="adsbox"]')
    .forEach((e) => e.remove());
});
await page.waitForTimeout(1000);

// Pulsar lo que haya pulsable: botón de play, overlay, tarjeta.
const clicked = await page.evaluate(() => {
  const words = /play|reproducir|ver |ver$|iniciar|▶/i;
  const candidates = [...document.querySelectorAll('button, a, div[class*="play"], i[class*="play"], [onclick], .video, .player')];
  const hit = candidates.find((el) => {
    const t = (el.textContent || '').trim();
    const cls = el.className?.toString() || '';
    return words.test(t) || /play|repro|start/i.test(cls);
  });
  if (hit) {
    (hit as HTMLElement).click();
    return (hit.textContent || hit.className || 'elemento').slice(0, 60);
  }
  return null;
});
console.log(`\npulsado: ${clicked ?? 'nada pulsable'}`);
await page.waitForTimeout(6000);

const state = await page.evaluate(() => ({
  iframes: [...document.querySelectorAll('iframe')].map((f) => (f as HTMLIFrameElement).src || '(vacia)'),
  videos: [...document.querySelectorAll('video')].map((v) => (v as HTMLVideoElement).currentSrc || (v as HTMLVideoElement).src),
  finalUrl: location.href,
}));
console.log(`\nURL final: ${state.finalUrl}`);
console.log(`iframes  : ${JSON.stringify(state.iframes, null, 1)}`);
console.log(`videos   : ${JSON.stringify(state.videos, null, 1)}`);
console.log(`\nmultimedia capturada (${media.length}):`);
for (const m of [...new Set(media)]) console.log(`   ${m.slice(0, 130)}`);

await browser.close();