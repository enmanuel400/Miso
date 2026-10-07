import { resolveTitle, closeBrowser } from '../server/extract/index.js';
import { getSource } from '../server/sources/index.js';

/**
 * Prueba de extremo a extremo contra las fuentes reales.
 * No es un test unitario: sale a internet y comprueba que el motor de
 * extraccion consigue un stream reproducible de verdad.
 */

const targets = [
  {
    source: 'cuevana',
    id: 'movie/1339713',
    label: 'cuevana (API: los embeds ya vienen resueltos, sin navegador)',
  },
  {
    source: 'cuevana',
    id: 'tvshow/1399',
    label: 'cuevana serie (API con temporada y capitulo)',
  },
  {
    source: 'pelisplushd',
    id: 'pelicula/el-corazon-de-la-bestia-1263337',
    label: 'pelisplushd (iframe asignado por JS)',
  },
];

let ok = 0;
let failed = 0;

for (const t of targets) {
  const source = getSource(t.source);
  if (!source) {
    console.log(`\n### ${t.source}: FUENTE DESCONOCIDA`);
    failed++;
    continue;
  }

  console.log(`\n${'='.repeat(68)}`);
  console.log(`### ${t.label}`);
  const started = Date.now();

  try {
    const result = await resolveTitle(t.source, t.id, { budgetMs: 30_000 });
    if (!result) {
      console.log('  -> sin resultado');
      failed++;
      continue;
    }

    console.log(`  titulo : ${result.detail.title}`);
    console.log(`  servidores declarados: ${result.detail.servers.length}`);
    for (const s of result.detail.servers.slice(0, 3)) {
      console.log(`     - [${s.method}] ${s.embedUrl.slice(0, 95)}`);
    }

    const stream = result.stream;
    if (!stream) {
      console.log('  -> SIN STREAM');
      failed++;
    } else {
      console.log(`  STREAM tipo=${stream.type} metodo=${stream.method}`);
      console.log(`  url    : ${stream.url.slice(0, 110)}`);
      if (stream.type === 'hls') ok++;
      else if (stream.type === 'file') ok++;
      else {
        console.log('  !! solo se obtuvo un embed, no un stream reproducible');
        failed++;
      }
    }
  } catch (err) {
    console.log(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }

  console.log(`  (${((Date.now() - started) / 1000).toFixed(1)}s)`);
}

await closeBrowser();

console.log(`\n${'='.repeat(68)}`);
console.log(`streams reproducibles: ${ok}   fallos: ${failed}`);
process.exit(failed === 0 ? 0 : 1);