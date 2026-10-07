import { readFileSync } from 'node:fs';
import * as cheerio from 'cheerio';
import { repairEncoding } from '../server/http.js';

const raw = readFileSync('/tmp/opencode/recon/phd_detail.html', 'utf8');
const html = repairEncoding(raw);
const $ = cheerio.load(html);
console.log('li[data-url]   :', $('li[data-url]').length);
console.log('[data-url]     :', $('[data-url]').length);
console.log('li.playurl     :', $('li.playurl').length);
console.log('a.divseason    :', $('a.divseason').length);
const m = html.match(/data-url="https:[^"]{10,60}/g);
console.log('regex data-url :', m ? m.length : 0, m ? m[0] : '');
const m2 = html.match(/data-name="[^"]{1,30}"/g);
console.log('regex data-name:', m2 ? m2.length : 0, m2 ? m2.slice(0, 6).join(' ') : '');
