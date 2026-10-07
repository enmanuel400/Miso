/**
 * Diagnostico desechable: por que el manifiesto de vimeos.net da 403 fuera del
 * navegador. Abre el embed real, mira con que estado el NAVEGADOR pide el .m3u8,
 * y luego intenta bajarlo desde el contexto de la pagina y desde Node.
 *
 * No forma parte de la aplicacion. Se ejecuta a mano:
 *   npx esbuild scripts/probe-vimeos.ts --bundle --platform=node --format=esm \
 *     --target=node22 --packages=external --outfile=/tmp/opencode/probe-vimeos.mjs
 *   node /tmp/opencode/probe-vimeos.mjs
 */
import { chromium } from 'playwright';

const EMBED = process.argv[2] || 'https://vimeos.net/embed-bskcbkf2zfia.html';

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'],
});

const context = await browser.newContext({ locale: 'es-ES' });
const page = await context.newPage();

const vistos: { url: string; status: number; ok: boolean }[] = [];
page.on('response', (res) => {
  if (/\.m3u8/i.test(res.url())) vistos.push({ url: res.url(), status: res.status(), ok: res.ok() });
});
page.on('requestfailed', (req) => {
  if (/\.m3u8/i.test(req.url())) {
    console.log('requestfailed:', req.url(), req.failure()?.errorText);
  }
});

await page.goto(EMBED, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(8000);

console.log('\n=== respuestas .m3u8 vistas por el navegador ===');
for (const v of vistos) console.log(`  [${v.status}] ${v.url.slice(0, 120)}`);

const target = vistos.find((v) => v.url.includes('master.m3u8')) ?? vistos[0];
if (!target) {
  console.log('no se vio ningun .m3u8');
  await browser.close();
  process.exit(0);
}

console.log('\n=== fetch DESDE LA PAGINA ===');
const desdePagina = await page.evaluate(async (url: string) => {
  try {
    const r = await fetch(url);
    const t = await r.text();
    return { status: r.status, len: t.length, head: t.slice(0, 40) };
  } catch (e) {
    return { status: -1, error: String(e) };
  }
}, target.url);
console.log(desdePagina);

console.log('\n=== fetch DESDE NODE ===');
const cookies = await context.cookies();
console.log('cookies:', cookies.map((c) => `${c.name}=${c.value}`).join('; ') || '(ninguna)');

for (const intento of [
  { nombre: 'cookie+referer+origin', headers: {} as Record<string, string> },
  { nombre: 'solo referer', headers: {} as Record<string, string> },
  { nombre: 'sin nada', headers: {} as Record<string, string> },
]) {
  const headers: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    ...intento.headers,
  };
  if (intento.nombre !== 'sin nada') headers.Referer = EMBED;
  if (intento.nombre === 'cookie+referer+origin') {
    headers.Origin = 'https://vimeos.net';
    headers.Cookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  }
  try {
    const r = await fetch(target.url, { headers });
    console.log(`  [${intento.nombre}] status=${r.status}`);
  } catch (e) {
    const err = e as { message?: string; cause?: { code?: string } };
    console.log(`  [${intento.nombre}] error:`, err?.message, err?.cause?.code);
  }
}

console.log('\n=== context.request (APIRequestContext) ===');
try {
  const r = await context.request.get(target.url, { headers: { Referer: EMBED } });
  console.log('  status=', r.status());
} catch (e) {
  console.log('  error:', String(e));
}

console.log('\n=== Node con cabeceras de navegador completas ===');
try {
  const r = await fetch(target.url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Accept: '*/*',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      'Accept-Encoding': 'identity;q=1, *;q=0',
      Referer: EMBED,
      Origin: 'https://vimeos.net',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site',
      Cookie: cookies.map((c) => `${c.name}=${c.value}`).join('; '),
    },
  });
  console.log('  status=', r.status);
} catch (e) {
  console.log('  error:', String(e));
}

await browser.close();