import { chromium } from 'playwright';

/** Sonda de diagnostico: que ve realmente el navegador en una pagina de player. */
const target = process.argv[2] || 'https://vimeos.net/embed-kfox00c86cwh.html';
const selectorHint = process.argv[3] || '';

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
const requests: string[] = [];
const frames: string[] = [];
context.on('request', (r) => requests.push(r.url()));
let pages = 0;
context.on('page', (p) => {
  pages++;
  if (pages > 1) void p.close().catch(() => {});
});
const page = await context.newPage();
await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 25_000 }).catch((e) => console.log('goto:', e.message));
await page.waitForTimeout(3000);

// Quitar anuncios, como hace el extractor real.
await page.evaluate(() => {
  document.querySelectorAll('.adcla,[class*="popup"],[id*="popunder"],[class*="popunder"]').forEach((e) => e.remove());
});
await page.waitForTimeout(1500);

// Intentar arrancar el player de varias formas.
await page.evaluate((hint) => {
  const w = window as any;
  const attempts: string[] = [];
  try {
    if (typeof w.jwplayer === 'function') {
      attempts.push('jwplayer()');
      w.jwplayer().play?.();
      if (hint) {
        attempts.push(`jwplayer('${hint}')`);
        w.jwplayer(hint).play?.();
      }
      // listar todos los players registrados
      w.jwplayer().getPlaylist?.();
    } else {
      attempts.push('jwplayer NO EXISTE');
    }
  } catch (e) {
    attempts.push('error: ' + (e as Error).message);
  }
  document.querySelectorAll('video').forEach((v) => {
    v.muted = true;
    (v as any).play?.().catch(() => {});
  });
  console.log('PLAY_ATTEMPTS=' + attempts.join(' | '));
}, selectorHint);
await page.waitForTimeout(5000);

const info = await page.evaluate(() => {
  const iframes = [...document.querySelectorAll('iframe')].map((f) => (f as HTMLIFrameElement).src || '(vacia)');
  const videos = [...document.querySelectorAll('video')].map((v) => ({
    src: v.currentSrc || (v as HTMLVideoElement).src || null,
    sources: [...v.querySelectorAll('source')].map((s) => (s as HTMLSourceElement).src),
  }));
  const w = window as any;
  let playerInfo = 'sin jwplayer';
  try {
    if (typeof w.jwplayer === 'function') {
      const inst = w.jwplayer();
      playerInfo = JSON.stringify(
        {
          media: inst?.getMediaItem?.()?.sources?.map((s: any) => s.file) ?? null,
          state: inst?.getState?.() ?? null,
        },
        null,
        0,
      );
    }
  } catch (e) {
    playerInfo = 'error ' + (e as Error).message;
  }
  return { iframes, videos, playerInfo, bodyLen: document.body.innerHTML.length };
});

const media = requests.filter((u) => /\.(m3u8|m8u8|mp4|webm|m4v|mov|ts)(\?|$)/i.test(u));
console.log(`\nURL final   : ${page.url()}`);
console.log(`iframes     : ${JSON.stringify(info.iframes, null, 1)}`);
console.log(`videos      : ${JSON.stringify(info.videos, null, 1)}`);
console.log(`player API  : ${info.playerInfo}`);
console.log(`peticiones multimedia (${media.length}):`);
for (const m of [...new Set(media)].slice(0, 12)) console.log(`   ${m.slice(0, 120)}`);

const interesting = [...new Set(requests)].filter(
  (u) => /player|embed|watch|stream|video|media|hls|watch\//i.test(u) && !/\.(css|png|jpg|svg|woff|gif|webp)/i.test(u),
);
console.log(`\nurls de player/stream (${interesting.length}):`);
for (const m of interesting.slice(0, 15)) console.log(`   ${m.slice(0, 130)}`);

await browser.close();