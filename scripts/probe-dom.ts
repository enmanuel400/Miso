import { chromium } from 'playwright';

/** Vuelca el DOM real tras ejecutar el JS, para ver que monta la pagina. */
const target = process.argv[2];

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'] });
const context = await browser.newContext({
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 800 },
});
let pages = 0;
context.on('page', (p) => {
  pages++;
  if (pages > 1) void p.close().catch(() => {});
});
const page = await context.newPage();
const all: string[] = [];
page.on('request', (r) => all.push(r.url()));
await page.goto(target, { waitUntil: 'commit', timeout: 30_000 }).catch((e) => console.log('goto:', e.message));
await page.waitForTimeout(7000);

const dump = await page.evaluate(() => {
  const main = document.querySelector('main, #main, .container, body');
  const html = main ? main.innerHTML : '';
  // Elementos con atributos que suelen llevar la URL del player.
  const interesting: string[] = [];
  document.querySelectorAll('*').forEach((el) => {
    for (const attr of el.attributes) {
      if (/url|src|link|embed|player|stream|file/i.test(attr.name) && attr.value.length > 8 && !attr.value.startsWith('data:image')) {
        interesting.push(`${el.tagName.toLowerCase()}[${attr.name}]="${attr.value.slice(0, 120)}"`);
      }
    }
  });
  return {
    bodyLen: html.length,
    htmlSample: html.slice(0, 3000),
    interesting: [...new Set(interesting)].slice(0, 40),
    bodyClass: document.body.className,
  };
});

console.log(`body class : ${dump.bodyClass}`);
console.log(`body length: ${dump.bodyLen}`);
console.log(`\n--- atributos con pinta de URL ---`);
for (const i of dump.interesting) console.log(`  ${i}`);
console.log(`\n--- primeras 2500 chars del main ---`);
console.log(dump.htmlSample);
console.log(`\n--- todas las peticiones (${new Set(all).size}) ---`);
for (const u of [...new Set(all)].slice(0, 45)) console.log(`  ${u.slice(0, 120)}`);

await browser.close();