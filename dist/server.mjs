var __getOwnPropNames = Object.getOwnPropertyNames;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// server/sololatinoBrowser.cjs
var require_sololatinoBrowser4 = __commonJS({
  "server/sololatinoBrowser.cjs"(exports, module) {
    "use strict";
    var puppeteer = __require("puppeteer-core/lib/puppeteer/puppeteer-core.js");
    var CHROME = "/home/demon0/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome";
    var browserPromise2 = null;
    async function getBrowser2() {
      if (!browserPromise2) {
        browserPromise2 = puppeteer.launch({
          executablePath: CHROME,
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"]
        });
      }
      return browserPromise2;
    }
    async function resolverConNavegador2(pageUrl2, labelFiltro) {
      const browser = await getBrowser2();
      const page = await browser.newPage();
      await page.setUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
      await page.setExtraHTTPHeaders({ "Accept-Language": "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7" });
      const urls = [];
      const seen = /* @__PURE__ */ new Set();
      page.on("response", async (resp) => {
        try {
          const u = resp.url();
          if (u.includes("/api/player-url")) {
            const json = await resp.json().catch(() => null);
            if (json && json.url && !seen.has(json.url)) {
              seen.add(json.url);
              urls.push(json.url);
            }
          }
        } catch {
        }
      });
      try {
        await page.goto(pageUrl2, { waitUntil: "domcontentloaded", timeout: 6e4 });
        await page.waitForSelector("[data-player-token]", { timeout: 15e3 }).catch(() => {
        });
        await new Promise((r) => setTimeout(r, 12e3));
        const reStr = labelFiltro && labelFiltro.source ? labelFiltro.source : null;
        const reFlags = labelFiltro && labelFiltro.flags ? labelFiltro.flags : "i";
        await page.evaluate((src, flags) => {
          const doc = globalThis.document;
          if (!doc) return;
          const re = src ? new RegExp(src, flags || "i") : null;
          const btns = [...doc.querySelectorAll("[data-player-token]")];
          if (btns.length === 0) return;
          for (const b of btns) {
            const t = (b.textContent || "").toLowerCase();
            if (t.includes("principal") || t.includes("premium")) continue;
            if (re && !re.test(b.textContent || "")) continue;
            try {
              b.click();
              return;
            } catch {
            }
          }
          for (const b of btns) {
            const t = (b.textContent || "").toLowerCase();
            if (t.includes("principal") || t.includes("premium")) continue;
            try {
              b.click();
              return;
            } catch {
            }
          }
        }, reStr, reFlags);
        const start = Date.now();
        while (Date.now() - start < 2e4 && urls.length === 0) {
          await new Promise((r) => setTimeout(r, 200));
        }
        if (urls.length === 0) {
          const extra = await page.evaluate(async (src, flags) => {
            const res = [];
            const csrf = document.querySelector('meta[name="csrf-token"]')?.content || document.querySelector('meta[name="X-CSRF-TOKEN"]')?.content;
            const re = src ? new RegExp(src, flags || "i") : null;
            const btns = [...document.querySelectorAll("[data-player-token]")];
            let list = btns.filter((b) => {
              const t = (b.textContent || "").toLowerCase();
              if (t.includes("principal") || t.includes("premium")) return false;
              if (re) return re.test(b.textContent || "");
              return /fembed|latino|vip|mixdrop|dood/i.test(b.textContent || "");
            });
            if (list.length === 0) list = btns.filter((b) => !/(principal|premium)/i.test(b.textContent || ""));
            for (const b of list) {
              const tok = b.getAttribute("data-player-token");
              if (!tok) continue;
              try {
                const headers = { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" };
                if (csrf) headers["X-CSRF-TOKEN"] = csrf;
                const r = await fetch("/api/player-url", {
                  method: "POST",
                  headers,
                  body: JSON.stringify({ t: tok }),
                  credentials: "include"
                });
                if (r.ok) {
                  const j = await r.json().catch(() => null);
                  if (j && j.url) {
                    res.push(j.url);
                    break;
                  }
                }
              } catch {
              }
            }
            return res;
          }, reStr, reFlags).catch(() => []);
          for (const u of extra) if (!seen.has(u)) urls.push(u);
        }
        return urls;
      } finally {
        try {
          await page.close();
        } catch {
        }
      }
    }
    async function buscarConNavegador(domain, query) {
      const browser = await getBrowser2();
      const page = await browser.newPage();
      await page.setUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
      await page.setExtraHTTPHeaders({ "Accept-Language": "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7" });
      try {
        await page.goto(`https://${domain}/`, { waitUntil: "domcontentloaded", timeout: 3e4 }).catch(() => null);
        await new Promise((r) => setTimeout(r, 8e3));
        const body = await page.evaluate(async (qq) => {
          try {
            const r = await fetch(`/api/search/suggest?q=${encodeURIComponent(qq)}`, {
              method: "GET",
              headers: { "X-Requested-With": "XMLHttpRequest", Accept: "application/json, text/plain, */*" },
              credentials: "include"
            });
            if (!r.ok) return null;
            return await r.text();
          } catch {
            return null;
          }
        }, query);
        return body;
      } finally {
        try {
          await page.close();
        } catch {
        }
      }
    }
    module.exports = { resolverConNavegador: resolverConNavegador2, buscarConNavegador };
  }
});

// server/index.ts
import express from "express";
import fs from "node:fs";
import path6 from "node:path";

// server/config.ts
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
var __dirname = path.dirname(fileURLToPath(import.meta.url));
var repoRoot = path.resolve(__dirname, "..");
var DEFAULT_PORT = 7345;
var PROXY_ALLOWLIST = [
  // CDNs de posters y media
  "cnddim.xyz",
  "pelisplushd.la",
  "image.tmdb.org",
  // Cuevana: la web y sus cuatro espejos
  "cuevana3.sc",
  "compucalitv.tv",
  "mega1080.me",
  "pelisplus.fo",
  // Sucesores del tema Cuevana react (backend /wp-api/v1). Sus reproductores son
  // enlaces directos al hoster o un player.php que solo hace de iframe.
  "cuevana3.gs",
  "lamovie.org",
  "videoapp.zip",
  // sololatino.net: la web, su player embed69 y los hosters que este descifra.
  "sololatino.net",
  "embed69.org",
  "player.pelisserieshoy.com",
  "morencius.com",
  "hglink.to",
  // Hosteros de la familia streamwish
  "vimeos.net",
  "vimeos.zip",
  "goodstream.one",
  "streamwish.to",
  "vidhidepro.com",
  "streamtape.com",
  "waaw.to",
  "filelions.to",
  "voe.sx",
  // Hosters que declara pelisplushd ademas de la familia streamwish. Se listan
  // aunque aparezcan muertos a menudo (fembed.com acepta la conexion y no
  // contesta nunca): la lista es para diagnostico y el descarte se hace en
  // vivo. Quitarlos del HTML no arregla nada y hace que el usuario vea menos
  // opciones de las que la pagina ofrece.
  "netu.me",
  "streamlare.com",
  "watchsb.com",
  "streamsb.com",
  "fembed.com",
  // Proveedores de video
  "jwplatform.com",
  "jwpcdn.com",
  "content.jwplatform.com"
];
function resolveUserData() {
  if (process.env.MISO_USER_DATA) return process.env.MISO_USER_DATA;
  if (repoRoot.includes(".asar")) {
    const base = process.env.XDG_CONFIG_HOME || (process.platform === "win32" ? process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming") : process.platform === "darwin" ? path.join(os.homedir(), "Library", "Application Support") : path.join(os.homedir(), ".config"));
    return path.join(base, "miso");
  }
  return path.join(repoRoot, ".miso");
}
var PATHS = {
  repoRoot,
  /** Donde Electron guarda configuracion, logs y cache entre sesiones. */
  userData: resolveUserData(),
  /** Assets web ya compilados, servidos por el propio servidor en produccion. */
  webDist: path.join(repoRoot, "dist", "web")
};
if (!existsSync(PATHS.userData)) {
  PATHS.userData;
}
var SERVER_PORT = Number(process.env.MISO_PORT || DEFAULT_PORT);

// server/sources/pelisplushd.ts
import * as cheerio from "cheerio";

// server/sources/shared.ts
function cleanText(raw) {
  if (!raw) return "";
  return raw.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#0?39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/\s+/g, " ").trim();
}
function sinopsisUtil(raw) {
  const t = cleanText(raw);
  if (!t) return null;
  const low = t.toLowerCase();
  if (/a[uú]n no (hemos )?a[ñn]adido/.test(low) || /no (hemos|hay) (a[ñn]adido|){0,1}(un )?(resumen|sinopsis)/.test(low)) {
    return null;
  }
  return t;
}
function slugify(input) {
  return cleanText(input).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
}
function isJunkTitle(title) {
  const t = title.trim().toLowerCase();
  if (t.length < 1) return true;
  return [
    "ver online gratis hd",
    "ver online",
    "online gratis hd",
    "reproducir",
    "descargar",
    "ver pelicula"
  ].includes(t);
}
function dedupeResults(results) {
  const byTitle = /* @__PURE__ */ new Map();
  for (const r of results) {
    const key = slugify(r.title);
    if (!key) continue;
    const existing = byTitle.get(key);
    if (!existing) {
      byTitle.set(key, r);
      continue;
    }
    if (!existing.poster && r.poster) {
      byTitle.set(key, r);
    }
  }
  return [...byTitle.values()];
}
function isMissingPoster(url) {
  if (!url) return true;
  return /404x|no-poster|noimage|placeholder|\/404\./i.test(url);
}
function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 40);
  }
}
function normalizeKind(raw) {
  const t = cleanText(raw).toLowerCase();
  if (!t) return null;
  if (/anime|animaci/.test(t)) return "anime";
  if (/serie|televisi|tv show|serie de/.test(t)) return "series";
  if (/pel[ií]cula|film|movie|peliculas/.test(t)) return "movie";
  return null;
}
function extractYear(raw) {
  const m = cleanText(raw).match(/\b(19|20)\d{2}\b/);
  return m ? m[0] : null;
}
function sinAnio(raw) {
  return cleanText(raw).replace(/\s*[([（【]\s*(?:19|20)\d{2}\s*[)\]）】]\s*$/, "").trim();
}
var NOISE_HOSTS = [
  "sharethis.com",
  "addthis.com",
  "facebook.com",
  "facebook.net",
  "twitter.com",
  "t.me",
  "telegram.org",
  "whatsapp.com",
  "pinterest.com",
  "linkedin.com",
  "reddit.com",
  "disqus.com",
  "livechatinc.com",
  "hotjar.com",
  "crisp.chat",
  "intercom.io",
  "coinmarketcap.com",
  "googletagmanager.com",
  "google.com"
];
function isNoiseHost(url) {
  try {
    const host = new URL(url).hostname;
    return NOISE_HOSTS.some((n) => host === n || host.endsWith(`.${n}`));
  } catch {
    return true;
  }
}
function entrelazar(a, b) {
  const out = [];
  const largo = Math.max(a.length, b.length);
  for (let i = 0; i < largo; i++) {
    if (i < a.length) out.push(a[i]);
    if (i < b.length) out.push(b[i]);
  }
  return out;
}
function primerCapitulo(seasons) {
  for (const s of seasons) {
    if (s.last >= s.first) return { season: s.season, episode: s.first };
  }
  return null;
}
function capituloAjustado(seasons, pos) {
  if (seasons.length === 0) return null;
  if (!pos) return primerCapitulo(seasons);
  const temporada = seasons.find((s) => s.season === pos.season);
  if (!temporada) return primerCapitulo(seasons);
  if (pos.episode < temporada.first) return { season: temporada.season, episode: temporada.first };
  if (pos.episode > temporada.last) return { season: temporada.season, episode: temporada.last };
  return pos;
}
function indiceDeSerie(seasons, episodes, pos) {
  if (seasons.length === 0) return null;
  return {
    seasons,
    episodes,
    season: pos?.season ?? null,
    episode: pos
  };
}

// server/http.ts
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
var ACCEPT_LANGUAGE = "es-ES,es;q=0.9,en;q=0.8";
var CP1252_ALTOS = /* @__PURE__ */ new Map([
  [8364, 128],
  // €
  [8218, 130],
  // ‚
  [402, 131],
  // ƒ
  [8222, 132],
  // „
  [8230, 133],
  // …
  [8224, 134],
  // †
  [8225, 135],
  // ‡
  [710, 136],
  // ˆ
  [8240, 137],
  // ‰  <-- el de "Él", el que fallaba
  [352, 138],
  // Š
  [8249, 139],
  // ‹
  [338, 140],
  // Œ
  [381, 142],
  // Ž
  [8216, 145],
  // '
  [8217, 146],
  // '
  [8220, 147],
  // "
  [8221, 148],
  // "
  [8226, 149],
  // •
  [8211, 150],
  // –
  [8212, 151],
  // —
  [732, 152],
  // ˜
  [8482, 153],
  // ™
  [353, 154],
  // š
  [8250, 155],
  // ›
  [339, 156],
  // œ
  [382, 158],
  // ž
  [376, 159]
  // Ÿ
]);
var TIRADA_DOBLE = new RegExp(
  "[\\u0080-\\u00ff\\u20ac\\u201a\\u0192\\u201e\\u2026\\u2020\\u2021\\u02c6\\u2030\\u0160\\u2039\\u0152\\u017d\\u2018\\u2019\\u201c\\u201d\\u2022\\u2013\\u2014\\u02dc\\u2122\\u0161\\u203a\\u0153\\u017e\\u0178]{2,}",
  "g"
);
function repairEncoding(input) {
  return input.replace(TIRADA_DOBLE, (run) => {
    const bytes = [...run].map((ch) => {
      const cp = ch.codePointAt(0);
      if (cp <= 255) return cp;
      return CP1252_ALTOS.get(cp) ?? 63;
    });
    const decoded = Buffer.from(bytes).toString("utf8");
    if (decoded.includes("\uFFFD")) return run;
    return [...decoded].length < [...run].length ? decoded : run;
  });
}
var HttpError = class extends Error {
  constructor(message, status, retryAfterMs = null) {
    super(message);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.name = "HttpError";
  }
};
function retryAfterDe(res) {
  const valor = res.headers.get("retry-after");
  if (!valor) return null;
  const segundos = Number(valor);
  if (Number.isFinite(segundos) && segundos >= 0) return Math.round(segundos * 1e3);
  const fecha = Date.parse(valor);
  if (Number.isFinite(fecha)) return Math.max(0, fecha - Date.now());
  return null;
}
async function fetchText(url, opts = {}) {
  const { timeoutMs = 2e4, referer, cookie } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": ACCEPT_LANGUAGE,
        ...referer ? { Referer: referer } : {},
        ...cookie ? { Cookie: cookie } : {}
      }
    });
    if (!res.ok) {
      throw new HttpError(`HTTP ${res.status} en ${url}`, res.status, retryAfterDe(res));
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return repairEncoding(buf.toString("utf8"));
  } catch (err) {
    if (err instanceof HttpError) throw err;
    const reason = err instanceof Error ? err.message : String(err);
    throw new HttpError(`Fallo de red en ${url}: ${reason}`, 0);
  } finally {
    clearTimeout(timer);
  }
}

// server/sources/pelisplushd.ts
var ESTRENOS_PELICULAS = "/peliculas/estrenos";
var ESTRENOS_SERIES = "/series/estrenos";
var RUTA_DE_SERIE = /^(serie|anime)\//;
var HOSTER_CONOCIDO = /^(voe|streamwish|vidhide|mixdrop|filemoon|mycloud|megacloud|okru|streamtape|abyss|okvod|waaw|netu|filelions|myflix|lumy|vidoza|mp4upload)/i;
var RE_CAPITULO = /\/(?:serie|anime)\/[^/]+\/temporada\/(\d+)\/capitulo\/(\d+)/;
function servidoresDe($) {
  const servers = [];
  const groupText = cleanText($("a.divseason").first().attr("title")) || cleanText($("a.divseason").first().text());
  $("li[data-url]").each((i, el) => {
    const $li = $(el);
    const embedUrl = cleanText($li.attr("data-url"));
    if (!embedUrl || !/^https?:\/\//i.test(embedUrl)) return;
    const inner = cleanText($li.find("a").first().text());
    const attr = cleanText($li.attr("data-name"));
    const name = HOSTER_CONOCIDO.test(inner) ? inner : HOSTER_CONOCIDO.test(attr) ? attr : inner || attr || `Servidor ${i + 1}`;
    servers.push({
      id: `phd-a${i}`,
      label: groupText ? `${groupText} \xB7 ${name}` : name,
      embedUrl,
      method: "dom"
    });
  });
  if (servers.length === 0) {
    const nombres = /* @__PURE__ */ new Map();
    $("li[data-id]").each((_, el) => {
      const $li = $(el);
      const lid = cleanText($li.attr("data-id"));
      if (!lid) return;
      const nombre = cleanText($li.find("a").first().text());
      if (nombre) nombres.set(lid, nombre);
    });
    $('[id="link_url"] span[lid][url]').each((i, el) => {
      const $span = $(el);
      const embedUrl = cleanText($span.attr("url"));
      if (!embedUrl || !/^https?:\/\//i.test(embedUrl)) return;
      const lid = cleanText($span.attr("lid"));
      const name = nombres.get(lid) || hostOf(embedUrl);
      servers.push({
        id: `phd-b${i}`,
        label: groupText ? `${groupText} \xB7 ${name}` : name,
        embedUrl,
        method: "dom"
      });
    });
  }
  return servers;
}
function capitulosDe($) {
  const nombres = /* @__PURE__ */ new Map();
  $("ul.TbVideoNv a.nav-link").each((_, el) => {
    const texto = cleanText($(el).text());
    const m = texto.match(/temporada\s+(\d+)/i);
    if (!m) return;
    const n = Number(m[1]);
    nombres.set(n, `Temporada ${n}`);
  });
  const porTemporada = /* @__PURE__ */ new Map();
  $('div[role="tabpanel"][id^="pills-vertical-"]').each((_, el) => {
    const panel = Number(cleanText($(el).attr("id")).replace("pills-vertical-", ""));
    if (!Number.isFinite(panel)) return;
    $(el).find("a[href]").each((__, a) => {
      const href = cleanText($(a).attr("href"));
      const m = href.match(RE_CAPITULO);
      if (!m) return;
      const season = Number(m[1]);
      const episode = Number(m[2]);
      if (!Number.isFinite(season) || !Number.isFinite(episode)) return;
      const lista = porTemporada.get(season) ?? [];
      lista.push({
        season,
        episode,
        title: tituloDeCapitulo(cleanText($(a).text()), season, episode),
        airDate: null,
        runtime: null,
        available: true
      });
      porTemporada.set(season, lista);
    });
  });
  const seasons = [...porTemporada.keys()].sort((a, b) => a - b).map((season) => {
    const lista = porTemporada.get(season) ?? [];
    const numeros = lista.map((e) => e.episode).sort((a, b) => a - b);
    return {
      season,
      name: nombres.get(season) ?? `Temporada ${season}`,
      first: numeros[0] ?? 1,
      last: numeros.at(-1) ?? 0,
      // Esta fuente no da cartel de temporada. Se deja null en vez de inventar
      // uno con el poster de la serie, que ensenaria lo mismo nueve veces.
      poster: null
    };
  });
  for (const lista of porTemporada.values()) lista.sort((a, b) => a.episode - b.episode);
  return { seasons, episodes: porTemporada };
}
function tituloDeCapitulo(texto, season, episode) {
  const marca = new RegExp(`\\s${season}x${episode}\\s*$`, "i");
  const limpio = texto.replace(marca, "").trim();
  return limpio || `Cap\xEDtulo ${episode}`;
}
function capitulosDeLaTemporada(porTemporada, season) {
  return porTemporada.get(season) ?? [];
}
function urlDeCapitulo(domain, id, pos) {
  return `https://${domain}/${id}/temporada/${pos.season}/capitulo/${pos.episode}`;
}
function sinopsisDe($) {
  const etiqueta = $("p").filter((_, el) => /^sinopsis\s*:?\s*$/i.test(cleanText($(el).text()))).first();
  const candidatos = [
    etiqueta.length > 0 ? etiqueta.next().text() : "",
    $(".movie-description, .sinopsis, .description").first().text(),
    $(".text-large").first().text(),
    $('meta[name="description"]').attr("content") ?? ""
  ];
  for (const bruto of candidatos) {
    const limpio = limpiarSinopsis(cleanText(bruto));
    if (limpio) return limpio;
  }
  return null;
}
function limpiarSinopsis(texto) {
  const sinCabecera = texto.replace(
    /^(?:serie|pel[ií]cula|anime|documental)\s+[^:]{1,90}:\s*/i,
    ""
  );
  if (!/^ver\b/i.test(sinCabecera)) return sinCabecera.trim();
  const reclamo = sinCabecera.match(/^[^|]*\|\s*[^.|]{2,40}\.\s*/);
  if (!reclamo) return "";
  return sinCabecera.slice(reclamo[0].length).trim();
}
var pelisplushd = {
  meta: {
    id: "pelisplushd",
    label: "pelisplushd",
    accent: "#4a9ee8"
  },
  domains: ["pelisplushd.la", "pelisplushd.in"],
  searchUrl(domain, query) {
    return `https://${domain}/search?s=${encodeURIComponent(query.trim())}`;
  },
  parseResults(html, domain) {
    const $ = cheerio.load(html);
    const out = [];
    $("a.Posters-link[href]").each((_, el) => {
      const $a = $(el);
      const href = cleanText($a.attr("href"));
      if (!href) return;
      const absolute = href.startsWith("http") ? href : `https://${domain}${href}`;
      const slug = absolute.replace(/^https?:\/\/[^/]+/, "").replace(/^\/|\/$/g, "");
      if (!slug) return;
      const title = cleanText($a.find(".listing-content p").first().text()) || cleanText($a.attr("data-title")).replace(/^VER\s+/i, "").replace(/\s+Online Gratis HD$/i, "");
      if (!title || isJunkTitle(title)) return;
      const img = $a.find("img").first();
      const rawPoster = img.attr("data-src") ?? img.attr("data-srcset")?.split(/\s+/)[0] ?? img.attr("src") ?? null;
      const poster = rawPoster && rawPoster.startsWith("/") ? `https://${domain}${rawPoster}` : rawPoster;
      const kindLabel = cleanText($a.find(".movies, .series, .movie-type").first().text());
      const kind = normalizeKind(kindLabel);
      const kindFromUrl = RUTA_DE_SERIE.test(slug) ? "series" : /^\/?pelicula\//.test(slug) ? "movie" : null;
      const ratingText = cleanText($a.find(".rating span").first().text());
      out.push({
        id: slug,
        source: "pelisplushd",
        sourceLabel: "pelisplushd",
        title,
        url: absolute,
        poster: isMissingPoster(poster) ? null : poster,
        kind: kind ?? kindFromUrl,
        year: extractYear(title) ?? null,
        rating: /^\d+(\.\d+)?\s*\/\s*10$/.test(ratingText) ? ratingText : null,
        episode: null,
        note: null
      });
    });
    return dedupeResults(out);
  },
  /**
   * Pagina del reproductor.
   *
   * Con `pos` es la del capitulo, y es la que se usa como ultimo recurso cuando
   * ningun servidor declarado entrega video. Sin `pos` es la del titulo, que es
   * de donde salen el nombre, el cartel y el indice de capitulos.
   */
  playUrl(domain, id, pos) {
    if (pos && RUTA_DE_SERIE.test(id)) return urlDeCapitulo(domain, id, pos);
    return `https://${domain}/${id}`;
  },
  parseDetail(html, domain, id) {
    const $ = cheerio.load(html);
    const title = cleanText($("h1").first().text()) || cleanText($('meta[property="og:title"]').attr("content")) || id.split("/").pop()?.replace(/-/g, " ") || id;
    const img = $('meta[property="og:image"]').attr("content") ?? $("img").first().attr("data-src") ?? $("img").first().attr("src") ?? null;
    const poster = img && img.startsWith("/") ? `https://${domain}${img}` : img;
    const synopsis = sinopsisDe($);
    const { seasons, episodes } = capitulosDe($);
    const porDefecto = primerCapitulo(seasons);
    return {
      source: "pelisplushd",
      id,
      title,
      url: `https://${domain}/${id}`,
      poster: isMissingPoster(poster) ? null : poster,
      synopsis,
      year: extractYear(title) ?? null,
      kind: normalizeKind($(".movie-type, .movies").first().text()) ?? (/serie|anime/.test(id) ? "series" : "movie"),
      // En una serie la pagina no declara reproductores: sale vacio a proposito,
      // y `fetchServers` va a por los del capitulo. Poner aqui la pagina entera
      // como si fuera un servidor haria que se probara el indice nueve veces.
      servers: seasons.length === 0 ? servidoresDe($) : [],
      episodes: indiceDeSerie(
        seasons,
        porDefecto ? capitulosDeLaTemporada(episodes, porDefecto.season) : [],
        porDefecto
      )
    };
  },
  /**
   * Los reproductores de un capitulo.
   *
   * Viven en la pagina del capitulo, no en la de la serie, asi que hay que
   * bajarla. Con una pelicula no hay nada que hacer: los servidores ya estaban
   * en el detalle y aqui solo se devolveria una lista vacia.
   */
  async fetchServers(domain, id, pos) {
    if (!pos || !RUTA_DE_SERIE.test(id)) return [];
    const html = await fetchText(urlDeCapitulo(domain, id, pos), {
      referer: `https://${domain}/${id}`,
      timeoutMs: 2e4
    });
    return servidoresDe(cheerio.load(html));
  },
  /**
   * Los capitulos de una temporada.
   *
   * Esta fuente no tiene endpoint para esto: el mapa entero esta escrito en el
   * HTML de la pagina de la serie (las pestanas de temporada y, dentro de cada
   * una, un boton por capitulo). Asi que la unica forma de leer una temporada que
   * no sea la primera es volver a bajar esa misma pagina.
   *
   * Sale mas barato de lo que parece porque `resolveTitle` lo pide en paralelo
   * con los reproductores del capitulo, no antes. Medido: la pagina de la serie
   * tarda unos 400 ms y va en paralelo con la del capitulo, asi que abrir T3 no
   * cuesta mas que abrir T1.
   *
   * Con una pelicula no hay nada que leer: no hay capitulos y la respuesta es una
   * lista vacia, no un error.
   */
  async fetchEpisodes(domain, id, season) {
    if (!RUTA_DE_SERIE.test(id)) return [];
    const html = await fetchText(`https://${domain}/${id}`, {
      referer: `https://${domain}/`,
      timeoutMs: 2e4
    });
    const { episodes } = capitulosDe(cheerio.load(html));
    return capitulosDeLaTemporada(episodes, season);
  },
  /**
   * Lo mas nuevo de la pagina: estrenos de peliculas y de series.
   *
   * Son dos paginas y se piden a la vez. Se entrelaza la mitad de cada una: un
   * solo bloque de doce peliculas seguido de doce series deja media pantalla con
   * un unico tipo de cosa, y en una rejilla de doce sitio se nota.
   */
  async fetchHome(domain, limit) {
    const mitad = Math.max(1, Math.ceil(limit / 2));
    const [peliculas, series] = await Promise.all([
      fetchText(`https://${domain}${ESTRENOS_PELICULAS}`, { timeoutMs: 12e3 }).catch(() => ""),
      fetchText(`https://${domain}${ESTRENOS_SERIES}`, { timeoutMs: 12e3 }).catch(() => "")
    ]);
    const conNota = (html) => this.parseResults(html, domain).map((r) => ({ ...r, note: "Estreno" }));
    return entrelazar(conNota(peliculas).slice(0, mitad), conNota(series).slice(0, mitad)).slice(
      0,
      limit
    );
  },
  /**
   * Genero, por la pagina `/generos/{slug}`.
   *
   * La rejilla tiene la misma marca `.Posters-link` que una busqueda, asi que se
   * reutiliza `parseResults` y no hay un segundo lector de HTML que pueda
   * desincronizarse. La pagina lista tanto peliculas como series; el filtro por
   * tipo lo hace el orquestador despues.
   */
  async fetchByGenre(domain, genre) {
    const url = `https://${domain}/generos/${encodeURIComponent(genre.slug)}`;
    const html = await fetchText(url, { referer: `https://${domain}/generos`, timeoutMs: 2e4 });
    return this.parseResults(html, domain);
  }
};

// server/cache.ts
var store = /* @__PURE__ */ new Map();
var sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
}, 6e4);
sweeper.unref?.();
function cacheGet(key) {
  const entry = store.get(key);
  if (!entry) return void 0;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return void 0;
  }
  return entry.value;
}
function cacheSet(key, value, ttlMs) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}
var inFlight = /* @__PURE__ */ new Map();
async function dedupe(key, run) {
  const existing = inFlight.get(key);
  if (existing) return existing;
  const promise = run().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}
function cacheClear() {
  store.clear();
}
function cacheStats() {
  return { entries: store.size, inFlight: inFlight.size };
}

// server/sources/wpapi.ts
var CACHE_TTL = 60 * 60 * 1e3;
function api(domain) {
  return `https://${domain}/wp-api/v1`;
}
function kindDe(type) {
  if (type === "movies") return "movie";
  if (type === "tvshows") return "series";
  if (type === "animes") return "anime";
  return null;
}
function tipoRuta(type) {
  if (type === "tvshows") return "series";
  if (type === "animes") return "animes";
  return "peliculas";
}
function urlHumana(domain, type, slug) {
  return `https://${domain}/${tipoRuta(type)}/${slug}/`;
}
function makeId(type, id, slug) {
  return `${type}/${id}/${slug}`;
}
function splitId(id) {
  const partes = id.split("/");
  const type = partes[0] || "movies";
  const num = Number(partes[1]);
  const slug = partes.slice(2).join("/") || partes[1] || "";
  return { type, num: Number.isFinite(num) && num > 0 ? num : null, slug };
}
function posterDe(post, domain) {
  const local = cleanText(post.images?.poster);
  if (local) {
    return /^https?:\/\//i.test(local) ? local : `https://${domain}/wp-content/uploads${local}`;
  }
  const tmdb = cleanText(post.poster);
  if (tmdb) {
    return /^https?:\/\//i.test(tmdb) ? tmdb : `https://image.tmdb.org/t/p/w300${tmdb}`;
  }
  return null;
}
function anioDe(post) {
  return extractYear(post.release_date) ?? extractYear(post.title) ?? null;
}
function nombreServidor(embed) {
  const declarado = cleanText(embed.server);
  if (declarado && !/^online$/i.test(declarado)) return declarado;
  try {
    const url = new URL(embed.url ?? "");
    const parametro = cleanText(url.searchParams.get("server"));
    if (parametro) return parametro;
    return url.hostname.replace(/^www\./, "");
  } catch {
    return declarado || "Online";
  }
}
function etiquetaServidor(embed) {
  const partes = [cleanText(embed.lang), cleanText(embed.quality), nombreServidor(embed)].filter(
    Boolean
  );
  return partes.join(" \xB7 ") || hostOf(embed.url ?? "");
}
async function pedirJson(url, domain) {
  const body = await fetchText(url, { referer: `https://${domain}/`, timeoutMs: 2e4 });
  return JSON.parse(body);
}
function dePost(post, domain, meta, nota) {
  const type = cleanText(post.type) || "movies";
  const slug = cleanText(post.slug);
  const title = sinAnio(post.title);
  const rawId = post._id;
  if (!slug || !title || rawId === void 0 || rawId === null) return null;
  if (isJunkTitle(title)) return null;
  const poster = posterDe(post, domain);
  return {
    id: makeId(type, rawId, slug),
    source: meta.id,
    sourceLabel: meta.label,
    title,
    url: urlHumana(domain, type, slug),
    poster: isMissingPoster(poster) ? null : poster,
    kind: kindDe(type),
    year: anioDe(post),
    rating: cleanText(post.rating) || null,
    synopsis: sinopsisUtil(post.overview),
    episode: null,
    note: nota
  };
}
function temporadaDePosts(posts) {
  const out = [];
  for (const p of posts) {
    const episode = Number(p.episode_number);
    if (!Number.isInteger(episode) || episode <= 0) continue;
    const season = Number(p.season_number);
    out.push({
      season: Number.isInteger(season) && season > 0 ? season : 1,
      episode,
      title: null,
      // `date` es cuando se anadio el capitulo al sitio, no su fecha de emision;
      // no hay campo de emision en esta API, asi que no se inventa una.
      airDate: null,
      runtime: Number(p.runtime) ? Math.round(Number(p.runtime)) : null,
      available: true
    });
  }
  out.sort((a, b) => a.season - b.season || a.episode - b.episode);
  return out;
}
async function traerSingle(domain, type, slug) {
  const url = `${api(domain)}/single/${type}?slug=${encodeURIComponent(slug)}&postType=${type}`;
  const json = await pedirJson(url, domain);
  return json.data ?? {};
}
async function traerLista(domain, showId, season) {
  const url = `${api(domain)}/single/episodes/list?_id=${showId}&season=${season}&page=1&postsPerPage=200`;
  const json = await pedirJson(url, domain);
  const posts = Array.isArray(json.data?.posts) ? json.data.posts : [];
  const total = Number(json.data?.pagination?.total) || posts.length;
  const seasons = Array.isArray(json.data?.seasons) ? [
    ...new Set(
      json.data.seasons.map(Number).filter((n) => Number.isInteger(n) && n > 0)
    )
  ].sort((a, b) => a - b) : [];
  return { posts, total, seasons };
}
function totalKey(domain, showId, season) {
  return `wpf:total:${domain}:${showId}:${season}`;
}
function guardarTotal(domain, showId, season, total) {
  if (total > 0) cacheSet(totalKey(domain, showId, season), total, CACHE_TTL);
}
function leerTotal(domain, showId, season) {
  return cacheGet(totalKey(domain, showId, season)) ?? null;
}
async function idDeCapitulo(domain, showId, season, episode) {
  const key = `wpf:eps:${domain}:${showId}:${season}`;
  const cache3 = cacheGet(key);
  if (cache3 && cache3[String(episode)] !== void 0) return cache3[String(episode)];
  try {
    const lista = await traerLista(domain, showId, season);
    guardarTotal(domain, showId, season, lista.total);
    const mapa = {};
    for (const p of lista.posts) {
      const ep = Number(p.episode_number);
      const id = Number(p._id);
      if (Number.isInteger(ep) && Number.isInteger(id)) mapa[String(ep)] = id;
    }
    cacheSet(key, mapa, CACHE_TTL);
    return mapa[String(episode)] ?? null;
  } catch {
    return null;
  }
}
function detalleBase(meta, domain, id, post, type, slug) {
  const poster = posterDe(post, domain);
  return {
    source: meta.id,
    id,
    title: sinAnio(post.title) || slug.replace(/-/g, " "),
    url: urlHumana(domain, type, slug),
    poster: isMissingPoster(poster) ? null : poster,
    synopsis: sinopsisUtil(post.overview),
    year: anioDe(post),
    kind: kindDe(type),
    servers: [],
    episodes: null
  };
}
async function indiceDeTemporada(domain, showId, pos) {
  const pedida = Number.isInteger(pos?.season) && (pos?.season ?? 0) > 0 ? pos.season : null;
  const lista = await traerLista(domain, showId, pedida ?? 1);
  if (lista.posts.length === 0) return null;
  guardarTotal(domain, showId, pedida ?? 1, lista.total);
  const numeros = lista.seasons.length > 0 ? lista.seasons : [pedida ?? 1];
  const objetivo = pedida ?? numeros[0];
  const seasons = numeros.map((n) => ({
    season: n,
    name: `Temporada ${n}`,
    first: 1,
    last: Math.max(n === objetivo ? lista.total : leerTotal(domain, showId, n) ?? lista.total, 1),
    poster: null
  }));
  return { seasons, episodes: temporadaDePosts(lista.posts) };
}
async function listado(domain, type, limit, meta) {
  const url = `${api(domain)}/listing/movies?postType=${type}&orderBy=created_at&order=desc&postsPerPage=${limit}`;
  const json = await pedirJson(url, domain);
  const posts = Array.isArray(json.data?.posts) ? json.data.posts : [];
  return posts.map((p) => dePost(p, domain, meta, "Estreno")).filter((r) => r !== null);
}
function crearFuenteWpApi(meta, domains) {
  return {
    meta,
    domains,
    searchUrl(domain, query) {
      return `${api(domain)}/search?q=${encodeURIComponent(query)}&postType=any&postsPerPage=24&page=1`;
    },
    parseResults(body, domain) {
      let json;
      try {
        json = JSON.parse(body);
      } catch {
        return [];
      }
      const posts = json.data?.posts;
      if (!Array.isArray(posts)) return [];
      const out = posts.map((p) => dePost(p, domain, meta, null)).filter((r) => r !== null);
      return dedupeResults(out);
    },
    playUrl(domain, id) {
      const { type, slug } = splitId(id);
      return urlHumana(domain, type, slug);
    },
    parseDetail(body, domain, id) {
      const { type, slug } = splitId(id);
      let single = null;
      try {
        single = JSON.parse(body);
      } catch {
        single = null;
      }
      return detalleBase(meta, domain, id, single?.data ?? {}, type, slug);
    },
    async fetchDetail(domain, id, pos) {
      const { type, num, slug } = splitId(id);
      let post = {};
      try {
        post = await traerSingle(domain, type, slug);
      } catch {
      }
      const base = detalleBase(meta, domain, id, post, type, slug);
      if (type === "movies" || num === null) return base;
      try {
        const estado = await indiceDeTemporada(domain, num, pos ?? null);
        if (!estado) return base;
        const inicial = pos ?? primerCapitulo(estado.seasons);
        return { ...base, episodes: indiceDeSerie(estado.seasons, estado.episodes, inicial) };
      } catch {
        return base;
      }
    },
    async fetchServers(domain, id, pos) {
      const { type, num } = splitId(id);
      if (num === null) return [];
      let postId = num;
      if (type !== "movies") {
        if (!pos) return [];
        postId = await idDeCapitulo(domain, num, pos.season, pos.episode);
      }
      if (postId === null) return [];
      const json = await pedirJson(
        `${api(domain)}/player?postId=${postId}`,
        domain
      );
      const embeds = Array.isArray(json.data?.embeds) ? json.data.embeds : [];
      return embeds.filter((e) => Boolean(e?.url && /^https?:\/\//i.test(e.url))).map((e, i) => ({
        id: `${meta.id}-${i}`,
        label: etiquetaServidor(e),
        embedUrl: e.url,
        method: "player-api"
      }));
    },
    async fetchEpisodes(domain, id, season) {
      const { type, num } = splitId(id);
      if (type === "movies" || num === null) return [];
      const lista = await traerLista(domain, num, season);
      guardarTotal(domain, num, season, lista.total);
      const eps = temporadaDePosts(lista.posts).filter((e) => e.season === season);
      return eps.length ? eps : null;
    },
    async fetchHome(domain, limit) {
      const mitad = Math.max(1, Math.ceil(limit / 2));
      const [peliculas, series] = await Promise.all([
        listado(domain, "movies", mitad, meta).catch(() => []),
        listado(domain, "tvshows", mitad, meta).catch(() => [])
      ]);
      return entrelazar(peliculas, series).slice(0, limit);
    },
    /**
     * Genero, por la taxonomia.
     *
     * Estos sitios no filtran la busqueda por genero: hay un endpoint propio,
     * `taxonomies`, que devuelve los posts de un termino con la misma forma que
     * `search`. El termino es el nombre exacto (y con tilde) de la taxonomia
     * —"Acción", "Bélica"—, que es lo que viaja en `Genre.name`.
     *
     * Con `kind` nulo se piden peliculas y series por separado y se entrelazan.
     * No se pide un tipo "cualquiera": esta API no lo admite, y la alternativa
     * —pedir uno de los dos— ensenaria solo la mitad del catalogo del genero sin
     * avisar.
     */
    async fetchByGenre(domain, genre, kind, limit) {
      const tipos = kind === "movie" ? ["movies"] : kind === "series" ? ["tvshows"] : kind === "anime" ? ["animes"] : ["movies", "tvshows"];
      const porTipo = await Promise.all(
        tipos.map(async (type) => {
          const url = `${api(domain)}/taxonomies?taxonomy=genres&term=${encodeURIComponent(genre.name)}&postType=${type}&postsPerPage=${limit}`;
          try {
            const json = await pedirJson(url, domain);
            const posts = Array.isArray(json.data?.posts) ? json.data.posts : [];
            return posts.map((p) => dePost(p, domain, meta, null)).filter((r) => r !== null);
          } catch {
            return [];
          }
        })
      );
      let mezcla = [];
      for (const lista of porTipo) mezcla = mezcla.length === 0 ? lista : entrelazar(mezcla, lista);
      return dedupeResults(mezcla);
    }
  };
}

// server/sources/cuevana3gs.ts
var cuevana3gs = crearFuenteWpApi(
  { id: "cuevana3gs", label: "cuevana3", accent: "#8f7cff" },
  ["cuevana3.gs"]
);

// server/sources/lamovie.ts
var lamovie = crearFuenteWpApi(
  { id: "lamovie", label: "lamovie", accent: "#6fb5ff" },
  ["lamovie.org"]
);

// server/sources/sololatino.ts
import * as cheerio2 from "cheerio";

// server/sources/embed69.ts
import { createDecipheriv, createHash } from "node:crypto";
var HOST = "embed69.org";
function esEmbed69(url) {
  if (!url) return false;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase() === HOST;
  } catch {
    return false;
  }
}
var MAX_INTENTOS = 2e7;
var PRESUPUESTO_POW_MS = 4e3;
function claveAes(challenge, difficulty, salt) {
  const prefijo = "0".repeat(Math.max(1, Math.min(difficulty, 8)));
  const inicio = Date.now();
  for (let nonce = 0; nonce < MAX_INTENTOS; nonce++) {
    const hash = createHash("sha256").update(challenge + nonce).digest("hex");
    if (hash.startsWith(prefijo)) {
      return createHash("sha256").update(challenge + nonce + salt).digest();
    }
    if ((nonce & 16383) === 0 && Date.now() - inicio > PRESUPUESTO_POW_MS) {
      return null;
    }
  }
  return null;
}
function descifrar(link, key) {
  try {
    const raw = Buffer.from(link, "base64");
    if (raw.length <= 16) return null;
    const iv = raw.subarray(0, 16);
    const ciphertext = raw.subarray(16);
    const decipher = createDecipheriv("aes-256-cbc", key, iv);
    const claro = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return claro.toString("utf8");
  } catch {
    return null;
  }
}
function extraerDataLink(html) {
  const ancla = html.indexOf("dataLink");
  if (ancla < 0) return null;
  const inicio = html.indexOf("[", ancla);
  if (inicio < 0) return null;
  let depth = 0;
  let inString = false;
  let quote = "";
  let i = inicio;
  for (; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === quote) inString = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = true;
      quote = c;
      continue;
    }
    if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  try {
    const parsed = JSON.parse(html.slice(inicio, i));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
function descifrarEmbed69(html) {
  if (!html) return [];
  const challenge = html.match(/POW_CHALLENGE\s*=\s*'([^']+)'/)?.[1];
  const difficulty = html.match(/POW_DIFFICULTY\s*=\s*(\d+)/)?.[1];
  const salt = html.match(/POW_SALT\s*=\s*'([^']+)'/)?.[1];
  if (!challenge || !difficulty || !salt) return [];
  const key = claveAes(challenge, Number(difficulty), salt);
  if (!key) return [];
  const grupos = extraerDataLink(html);
  if (!grupos) return [];
  const out = [];
  for (const grupo of grupos) {
    const language = String(grupo.video_language ?? "").trim().toUpperCase() || "?";
    for (const embed of grupo.sortedEmbeds ?? []) {
      if (!embed?.link) continue;
      const url = descifrar(embed.link, key);
      if (url && /^https?:\/\//i.test(url)) {
        out.push({ language, server: String(embed.servername ?? "servidor").trim(), url });
      }
    }
  }
  return out;
}
function nombreIdioma(code) {
  const tabla = {
    LAT: "Latino",
    ESP: "Espa\xF1ol",
    CAST: "Castellano",
    SUB: "Subtitulado",
    JAP: "Japon\xE9s",
    ENG: "Ingl\xE9s"
  };
  return tabla[code.toUpperCase()] ?? code;
}

// server/sources/hosters.ts
var VIDHIDE_HOSTS = [
  "morencius.com",
  "vidhide.com",
  "vidhidepro.com",
  "vidhidepre.com",
  "vidhidevip.com",
  "streamhide.to",
  "minochinos.com"
];
function hostnameOf(url) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}
function esVidhide(url) {
  const host = hostnameOf(url);
  if (!host) return false;
  return VIDHIDE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)) || /(^|\.)vidhide[a-z]*\./.test(host);
}
function desescapar(raw) {
  return raw.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_m, esc) => {
    if (esc[0] === "u") return String.fromCharCode(parseInt(esc.slice(1), 16));
    if (esc[0] === "x") return String.fromCharCode(parseInt(esc.slice(1), 16));
    switch (esc) {
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "	";
      case "b":
        return "\b";
      case "f":
        return "\f";
      default:
        return esc;
    }
  });
}
function leerLiteral(src, quoteAt) {
  if (src[quoteAt] !== "'") return null;
  let i = quoteAt + 1;
  let raw = "";
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\\") {
      raw += ch + (src[i + 1] ?? "");
      i += 2;
      continue;
    }
    if (ch === "'") return { value: desescapar(raw), end: i + 1 };
    raw += ch;
    i++;
  }
  return null;
}
function desempaquetarBloque(p, a, c, palabras) {
  const k = palabras.split("|");
  const e = (n) => {
    const resto = n % a;
    const digito = resto > 35 ? String.fromCharCode(resto + 29) : resto.toString(36);
    return n < a ? digito : e(Math.floor(n / a)) + digito;
  };
  let texto = p;
  for (let i = c - 1; i >= 0; i--) {
    if (!k[i]) continue;
    const token = e(i);
    if (!token) continue;
    const re = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    texto = texto.replace(re, () => k[i]);
  }
  return texto;
}
function desempaquetar(src) {
  const marca = "eval(function(p,a,c,k,e,d)";
  const bloques = [];
  let from = 0;
  while (true) {
    const start = src.indexOf(marca, from);
    if (start < 0) break;
    const splitAt = src.indexOf(".split('|')", start);
    if (splitAt < 0) {
      from = start + marca.length;
      continue;
    }
    const b = src.lastIndexOf("}('", splitAt);
    if (b < start) {
      from = start + marca.length;
      continue;
    }
    const packed = leerLiteral(src, b + 2);
    const cabecera = packed ? /^,\s*(\d+)\s*,\s*(\d+)\s*,\s*'/.exec(src.slice(packed.end, splitAt)) : null;
    if (!packed || !cabecera) {
      from = start + marca.length;
      continue;
    }
    const kStart = packed.end + cabecera[0].length - 1;
    const palabras = leerLiteral(src, kStart);
    if (!palabras || src.slice(palabras.end, splitAt).trim() !== "") {
      from = start + marca.length;
      continue;
    }
    bloques.push({
      start,
      end: splitAt + ".split('|')".length,
      code: desempaquetarBloque(packed.value, Number(cabecera[1]), Number(cabecera[2]), palabras.value)
    });
    let fin = bloques[bloques.length - 1].end;
    while (src[fin] === ")") fin++;
    bloques[bloques.length - 1].end = fin;
    from = fin;
  }
  if (bloques.length === 0) return src;
  bloques.sort((x, y) => x.start - y.start);
  let out = "";
  let last = 0;
  for (const bloque of bloques) {
    out += src.slice(last, bloque.start) + bloque.code;
    last = bloque.end;
  }
  return out + src.slice(last);
}
function extraerLinks(code) {
  const m = /links\s*=\s*(\{[^{}]*\})/.exec(code);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[1]);
    const out = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "string") out[key] = value;
    }
    return out;
  } catch {
    return null;
  }
}
function descifrarVidhide(html) {
  if (!html) return null;
  const code = desempaquetar(html);
  const links = extraerLinks(code);
  if (links?.hls2) return links.hls2;
  if (links?.hls3) return links.hls3;
  const host = hostnameOf(html) ?? "";
  for (const m of code.matchAll(/https?:\/\/[^\s"'<>\\]+?\.m3u8(?:\?[^\s"'<>\\]*)?/gi)) {
    const url = m[0];
    if (hostnameOf(url) !== host) return url;
  }
  return null;
}
async function resolverVidhide(embedUrl) {
  const html = await fetchText(embedUrl, { timeoutMs: 12e3 }).catch(() => "");
  if (!html) return null;
  const directo = descifrarVidhide(html);
  if (!directo) return null;
  try {
    return new URL(directo, embedUrl).href;
  } catch {
    return null;
  }
}

// server/sources/sololatino.ts
function getResolver() {
  if (typeof require_sololatinoBrowser === "function") {
    return require_sololatinoBrowser();
  }
  if (typeof require_sololatinoBrowser2 === "function") {
    return require_sololatinoBrowser2();
  }
  if (typeof require_sololatinoBrowser3 === "function") {
    return require_sololatinoBrowser3();
  }
  try {
    return __require("./sololatinoBrowser.cjs");
  } catch {
  }
  try {
    return require_sololatinoBrowser4();
  } catch {
  }
  try {
    return __require("../../sololatinoBrowser.cjs");
  } catch {
  }
  try {
    return __require("./resources/sololatinoBrowser.cjs");
  } catch {
  }
  throw new Error("sololatinoBrowser.cjs not found");
}
async function resolverConNavegador(pageUrl2, labelFiltro) {
  try {
    const m = getResolver();
    const res = await m.resolverConNavegador(pageUrl2, labelFiltro);
    return Array.isArray(res) ? res : [];
  } catch {
    return [];
  }
}
var ESPACIO_ENTRE_PETICIONES_MS = 400;
var MAX_REINTENTOS_429 = 2;
var ESPERA_MAXIMA_429_MS = 15e3;
var CACHE_SERVIDORES_MS = 3 * 6e4;
var siguienteTurno = 0;
async function esperarTurno() {
  const ahora = Date.now();
  const turno = Math.max(ahora, siguienteTurno);
  siguienteTurno = turno + ESPACIO_ENTRE_PETICIONES_MS;
  const espera = turno - ahora;
  if (espera > 0) await new Promise((listo) => setTimeout(listo, espera));
}
function dormir(ms) {
  return new Promise((listo) => setTimeout(listo, ms));
}
async function pedirUrlDelToken(domain, token, opts = {}) {
  let ultimo = null;
  for (let intento = 0; intento <= MAX_REINTENTOS_429; intento++) {
    await esperarTurno();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12e3);
      try {
        const res = await fetch(`https://${domain}/api/player-url`, {
          method: "POST",
          signal: controller.signal,
          redirect: "follow",
          headers: {
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            Accept: "application/json, text/plain, */*",
            "Accept-Language": "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7",
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            ...opts.referer ? { Referer: opts.referer } : {},
            ...opts.csrf ? { "X-CSRF-TOKEN": opts.csrf } : {},
            ...opts.cookie ? { Cookie: opts.cookie } : {}
          },
          body: JSON.stringify({ t: token })
        });
        if (!res.ok) {
          throw new HttpError(`HTTP ${res.status} en https://${domain}/api/player-url`, res.status, void 0);
        }
        return await res.json();
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      ultimo = err;
      const esLimite = err instanceof HttpError && err.status === 429;
      if (!esLimite || intento === MAX_REINTENTOS_429) break;
      const espera = Math.min(ESPERA_MAXIMA_429_MS, (err.retryAfterMs ?? 1500) + 150);
      await dormir(espera);
    }
  }
  throw ultimo;
}
var sololatino = {
  meta: { id: "sololatino", label: "sololatino", accent: "#3ec9a7" },
  domains: ["sololatino.net"],
  /**
   * La busqueda va contra el autocompletado del sitio, que devuelve JSON.
   *
   * Devuelve poco (el desplegable de su barra de busqueda) y su pagina `/buscar`
   * esta detras de Cloudflare. Aun asi es la unica via: el buscador de Miso pide
   * ese endpoint y lee el JSON, exactamente como el navegador del sitio.
   */
  searchUrl(domain, query) {
    return `https://${domain}/api/search/suggest?q=${encodeURIComponent(query.trim())}`;
  },
  async search(query, domain) {
    const q = query.trim();
    if (!q) return [];
    try {
      const body = await buscarConNavegadorDirecto(domain, q);
      if (body && typeof body === "string" && body.trim().length > 0) {
        try {
          const res = parseSugerencias(body);
          if (res.length > 0) return res;
        } catch {
        }
      }
    } catch (err) {
      console.error("Search error for", domain, "query", q, ":", err);
    }
    try {
      const body = await fetchText(this.searchUrl(domain, q), { referer: `https://${domain}/` });
      if (body && typeof body === "string") {
        try {
          const res = parseSugerencias(body);
          if (res.length > 0) return res;
        } catch {
        }
      }
    } catch (err) {
      console.error("Search error for", domain, "query", q, ":", err);
    }
    return [];
  },
  parseResults(body, _domain) {
    return parseSugerencias(body);
  },
  /**
   * URL de la pagina humana. En series la ficha no lleva el reproductor, asi que
   * el capitulo concreto es `/serie/<slug>/temporada-N/episodio-M`.
   */
  playUrl(domain, id, pos) {
    if (pos && id.startsWith("serie/")) {
      return `https://${domain}/${id}/temporada-${pos.season}/episodio-${pos.episode}`;
    }
    return `https://${domain}/${id}`;
  },
  parseDetail(html, domain, id) {
    const $ = cheerio2.load(html);
    const ld = datosJsonLd($);
    const kind = id.startsWith("pelicula/") ? "movie" : id.startsWith("serie/") ? "series" : null;
    const title = sinAnio(ld?.name) || sinAnio($("h1").first().text()) || sinAnio($('meta[property="og:title"]').attr("content")) || slugLegible(id);
    const posterRaw = absoluta(ld?.image, domain) ?? absoluta($('meta[property="og:image"]').attr("content"), domain);
    const synopsis = sinopsisUtil(ld?.description) ?? sinopsisUtil($('meta[property="og:description"]').attr("content")) ?? sinopsisUtil($('meta[name="description"]').attr("content"));
    const { seasons, episodes } = capitulosDe2($);
    const porDefecto = primerCapitulo(seasons);
    const capitulos = porDefecto ? episodes.get(porDefecto.season) ?? [] : [];
    return {
      source: "sololatino",
      id,
      title,
      url: `https://${domain}/${id}`,
      poster: isMissingPoster(posterRaw) ? null : posterRaw,
      synopsis,
      year: extractYear(ld?.datePublished) ?? extractYear(title),
      kind,
      // Los servidores viven detras de un POST; los aporta `fetchServers`.
      servers: [],
      episodes: kind === "series" ? indiceDeSerie(seasons, capitulos, porDefecto) : null
    };
  },
  /**
   * Resuelve los embeds: baja la pagina (pelicula o capitulo), cambia cada
   * `data-player-token` por su URL real y, si es un embed69, lo descifra para
   * entregar los hosters finales.
   *
   * No se devuelve `player.pelisserieshoy.com` (el boton PREMIUM): su pagina se
   * borra a si misma cuando no va dentro de un iframe, asi que probarla en el
   * navegador solo gastaria presupuesto para fallar.
   */
  async fetchServers(domain, id, pos) {
    const pageUrlBase = this.playUrl(domain, id, pos ?? null);
    const cacheKey = `sololatino:servers:${domain}:${id}:${pos?.season ?? "x"}:${pos?.episode ?? "x"}`;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;
    return dedupe(cacheKey, async () => {
      const yaEsta = cacheGet(cacheKey);
      if (yaEsta) return yaEsta;
      let urls = [];
      const candidatosUrl = [];
      candidatosUrl.push(pageUrlBase);
      if (id.includes("sobrenatural")) {
        candidatosUrl.push(this.playUrl(domain, id.replace("sobrenatural", "supernatural"), pos ?? null));
      }
      if (id.includes("supernatural")) {
        candidatosUrl.push(this.playUrl(domain, id.replace("supernatural", "sobrenatural"), pos ?? null));
      }
      for (const pageUrl2 of candidatosUrl) {
        try {
          urls = await resolverConNavegador(pageUrl2, /fembed/i);
        } catch {
          urls = [];
        }
        if (urls.length > 0) break;
        try {
          urls = await resolverConNavegador(pageUrl2, /(latino|vip|mixdrop|dood)/i);
        } catch {
          urls = [];
        }
        if (urls.length > 0) break;
      }
      if (urls.length === 0) {
        try {
          urls = await resolverConNavegador(pageUrl, /(latino|vip|mixdrop|dood)/i);
        } catch {
          urls = [];
        }
      }
      if (urls.length === 0) {
        try {
          const html = await fetchText(pageUrl, { referer: `https://${domain}/` });
          const $ = cheerio2.load(html);
          const csrf = $('meta[name="csrf-token"]').attr("content") || $('meta[name="X-CSRF-TOKEN"]').attr("content") || null;
          const testigos = [];
          $("[data-player-token]").each((_, el) => {
            const token = cleanText($(el).attr("data-player-token"));
            if (!token) return;
            testigos.push({ label: cleanText($(el).text()) || "Servidor", token });
          });
          const latinos = testigos.filter((t) => /latino/i.test(t.label));
          const fembed = testigos.filter((t) => /fembed/i.test(t.label));
          const candidatos = latinos.length > 0 ? latinos : fembed.length > 0 ? fembed : testigos.filter((t) => !/principal|premium/i.test(t.label));
          for (const t of candidatos) {
            try {
              const data = await pedirUrlDelToken(domain, t.token, { referer: pageUrl, csrf });
              if (data.url) urls.push(data.url);
            } catch (err) {
              if (err instanceof HttpError && err.status === 429) throw err;
            }
          }
        } catch {
        }
      }
      const players = await Promise.all(
        urls.filter((url) => esEmbed69(url)).map(async (url) => {
          const playerHtml = await fetchText(url, { referer: pageUrl }).catch(() => "");
          return descifrarEmbed69(playerHtml);
        })
      );
      const servers = [];
      for (const enlaces of players) {
        const enlacesResueltos = await Promise.all(
          enlaces.map(async (enlace) => {
            if (!esVidhide(enlace.url)) return enlace;
            const directo = await resolverVidhide(enlace.url).catch(() => null);
            return directo ? { ...enlace, url: directo } : enlace;
          })
        );
        for (const enlace of enlacesResueltos) {
          servers.push({
            id: `sol-${servers.length + 1}`,
            label: `${nombreIdioma(enlace.language)} \xB7 ${enlace.server}`,
            embedUrl: enlace.url,
            method: "embed69"
          });
        }
      }
      if (servers.length > 0) cacheSet(cacheKey, servers, CACHE_SERVIDORES_MS);
      return servers;
    });
  },
  /**
   * Capitulos de una temporada que no es la primera.
   *
   * La pagina de la serie trae TODAS las temporadas (Rick y Morty viene con sus
   * nueve paneles), asi que `parseDetail` ya dejo el indice entero; volver a
   * bajarla es mas simple que recordar cual era y solo cuesta una descarga.
   */
  async fetchEpisodes(domain, id, season) {
    if (!id.startsWith("serie/")) return null;
    const html = await fetchText(`https://${domain}/${id}`, { referer: `https://${domain}/` });
    const { episodes } = capitulosDe2(cheerio2.load(html));
    return episodes.get(season) ?? null;
  },
  /**
   * Lo mas nuevo: los listados `/peliculas`, `/series` y `/animes`, que sirven
   * ordenados por fecha de alta. Su portada es tres veces mas pesada y trae lo
   * mismo en carruseles, asi que se leen los listados.
   */
  async fetchHome(domain, limit) {
    const mitad = Math.max(1, Math.ceil(limit / 2));
    const [pelis, series, animes] = await Promise.all([
      fetchText(`https://${domain}/peliculas`).catch(() => ""),
      fetchText(`https://${domain}/series`).catch(() => ""),
      fetchText(`https://${domain}/animes`).catch(() => "")
    ]);
    const recorta = (html) => parseTarjetas(html, domain).slice(0, mitad).map((r) => ({ ...r, note: "Estreno" }));
    return entrelazar(entrelazar(recorta(pelis), recorta(series)), recorta(animes)).slice(0, limit);
  },
  /**
   * Genero por `/genero/<slug>`.
   *
   * El orden por defecto del sitio ("Mas populares") llena la primera pagina de
   * peliculas aunque el genero tenga series; pidiendo "Mas recientes" la mezcla
   * es real y el filtro por tipo de Miso tiene algo que filtrar. Los slugs del
   * catalogo de Miso coinciden con los del sitio (accion, belica, western...).
   */
  async fetchByGenre(domain, genre, kind, limit) {
    const url = `https://${domain}/genero/${encodeURIComponent(genre.slug)}?orden=${encodeURIComponent("M\xE1s recientes")}`;
    const html = await fetchText(url, { referer: `https://${domain}/` });
    const tarjetas = parseTarjetas(html, domain);
    const filtradas = kind ? tarjetas.filter((r) => r.kind === kind) : tarjetas;
    return filtradas.slice(0, limit);
  }
};
async function buscarConNavegadorDirecto(domain, query) {
  try {
    const m = __require("./sololatinoBrowser.cjs");
    const res = await m.buscarConNavegador(domain, query);
    return typeof res === "string" ? res : null;
  } catch {
    return null;
  }
}
function tipoMedia(type) {
  switch (cleanText(type).toLowerCase()) {
    case "movie":
      return "movie";
    case "series":
      return "series";
    case "anime":
    case "toon":
      return "anime";
    default:
      return null;
  }
}
function parseSugerencias(body) {
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out = [];
  for (const item of data) {
    const kind = tipoMedia(item.type ?? "");
    if (!kind) continue;
    const id = idDeUrl(item.url);
    if (!id || !/^(pelicula|serie)\//.test(id)) continue;
    const titulo = sinAnio(item.title);
    if (!titulo || isJunkTitle(titulo)) continue;
    const poster = cleanText(item.poster);
    out.push({
      id,
      source: "sololatino",
      sourceLabel: "sololatino",
      title: titulo,
      url: `https://sololatino.net/${id}`,
      poster: isMissingPoster(poster) ? null : poster,
      kind,
      year: item.year != null ? String(item.year) : extractYear(titulo),
      rating: null,
      episode: null,
      note: null
    });
  }
  return dedupeResults(out);
}
function parseTarjetas(html, _domain) {
  const $ = cheerio2.load(html);
  const out = [];
  $(".card").each((_, el) => {
    const $card = $(el);
    const href = cleanText($card.find("a[href]").first().attr("href"));
    const id = idDeUrl(href);
    if (!id || !/^(pelicula|serie)\//.test(id)) return;
    const img = $card.find("img").first();
    const titulo = sinAnio($card.find(".card__title").first().text()) || sinAnio(img.attr("alt"));
    if (!titulo || isJunkTitle(titulo)) return;
    const posterRaw = cleanText(img.attr("src") || img.attr("data-src"));
    const ratingRaw = cleanText($card.find(".card__rating").first().text()).replace(/[^\d.]/g, "");
    const claseBadge = $card.find(".card__badge").first().attr("class") ?? "";
    out.push({
      id,
      source: "sololatino",
      sourceLabel: "sololatino",
      title: titulo,
      url: `https://sololatino.net/${id}`,
      poster: isMissingPoster(posterRaw) ? null : posterRaw,
      kind: kindDeBadge(claseBadge, id),
      year: extractYear($card.find(".card__year").first().text()),
      rating: /^\d+(\.\d+)?$/.test(ratingRaw) ? ratingRaw : null,
      episode: null,
      note: null
    });
  });
  return dedupeResults(out);
}
function kindDeBadge(clase, id) {
  if (/badge-(anime|toon)/.test(clase)) return "anime";
  if (/badge-movie/.test(clase)) return "movie";
  if (/badge-series/.test(clase)) return "series";
  return id.startsWith("pelicula/") ? "movie" : "series";
}
var RE_CAPITULO2 = /\/serie\/[^/]+\/temporada-(\d+)\/episodio-(\d+)/;
function capitulosDe2($) {
  const porTemporada = /* @__PURE__ */ new Map();
  $("a.ep-item[href]").each((_, el) => {
    const href = cleanText($(el).attr("href"));
    const m = href.match(RE_CAPITULO2);
    if (!m) return;
    const season = Number(m[1]);
    const episode = Number(m[2]);
    if (!Number.isFinite(season) || !Number.isFinite(episode)) return;
    const titulo = cleanText($(el).find("p").not(".ep-num").first().text());
    const lista = porTemporada.get(season) ?? [];
    lista.push({
      season,
      episode,
      title: titulo || `Cap\xEDtulo ${episode}`,
      airDate: null,
      runtime: null,
      available: true
    });
    porTemporada.set(season, lista);
  });
  for (const lista of porTemporada.values()) lista.sort((a, b) => a.episode - b.episode);
  const seasons = [...porTemporada.keys()].sort((a, b) => a - b).map((season) => {
    const lista = porTemporada.get(season) ?? [];
    return {
      season,
      name: `Temporada ${season}`,
      first: lista[0]?.episode ?? 1,
      last: lista[lista.length - 1]?.episode ?? 0,
      poster: null
    };
  });
  return { seasons, episodes: porTemporada };
}
function idDeUrl(raw) {
  const t = cleanText(raw);
  if (!t) return null;
  try {
    return new URL(t, "https://sololatino.net").pathname.replace(/^\/+|\/+$/g, "") || null;
  } catch {
    return null;
  }
}
function slugLegible(id) {
  return (id.split("/").pop() ?? id).replace(/-/g, " ");
}
function absoluta(raw, domain) {
  const t = cleanText(raw);
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  return t.startsWith("/") ? `https://${domain}${t}` : `https://${domain}/${t}`;
}
function datosJsonLd($) {
  let encontrado = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (encontrado) return;
    let parsed;
    try {
      parsed = JSON.parse($(el).text());
    } catch {
      return;
    }
    const nodo = nodosJsonLd(parsed).find((n) => n["@type"] === "Movie" || n["@type"] === "TVSeries");
    if (!nodo) return;
    const imagen = nodo.image;
    const rating = nodo.aggregateRating?.ratingValue;
    encontrado = {
      name: typeof nodo.name === "string" ? nodo.name : void 0,
      description: typeof nodo.description === "string" ? nodo.description : void 0,
      datePublished: typeof nodo.datePublished === "string" ? nodo.datePublished : void 0,
      image: leerImagen(imagen),
      rating: rating != null ? String(rating) : void 0
    };
  });
  return encontrado;
}
function leerImagen(image) {
  if (typeof image === "string") return image;
  if (Array.isArray(image) && typeof image[0] === "string") return image[0];
  if (image && typeof image === "object") {
    const url = image.url;
    if (typeof url === "string") return url;
  }
  return void 0;
}
function nodosJsonLd(value) {
  if (!value || typeof value !== "object") return [];
  const obj = value;
  if (Array.isArray(obj["@graph"])) {
    return obj["@graph"].filter((n) => !!n && typeof n === "object");
  }
  return [obj];
}

// server/sources/pelispedia.ts
import * as cheerio3 from "cheerio";
function absoluteUrl(href, domain) {
  const t = cleanText(href);
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  return t.startsWith("/") ? `https://${domain}${t}` : `https://${domain}/${t}`;
}
function getKindFromUrl(id) {
  if (id.startsWith("serie/")) return "series";
  if (id.startsWith("pelicula/")) return "movie";
  return null;
}
var pelispedia = {
  meta: {
    id: "pelispedia",
    label: "Pelispedia",
    accent: "#1caddd"
  },
  domains: ["pelispedia.mov"],
  searchUrl(domain, query) {
    return `https://${domain}/?s=${encodeURIComponent(query.trim())}`;
  },
  parseResults(html, domain) {
    const $ = cheerio3.load(html);
    const out = [];
    $('a[href*="/pelicula/"], a[href*="/serie/"]').each((_, el) => {
      const $a = $(el);
      const href = cleanText($a.attr("href"));
      if (!href) return;
      const absolute = absoluteUrl(href, domain);
      if (!absolute) return;
      let slug = absolute.replace(/^https?:\/\/[^/]+/, "").replace(/^\/|\/$/g, "");
      if (!slug || !(slug.startsWith("pelicula/") || slug.startsWith("serie/"))) return;
      if (slug.includes("#")) return;
      const title = cleanText($a.find(".title, .card-title, h3, h4").first().text()) || cleanText($a.attr("title")) || cleanText($a.find("img").first().attr("alt")) || slug.split("/").pop()?.replace(/-/g, " ") || "";
      if (!title || isJunkTitle(title)) return;
      const img = $a.find("img").first();
      let poster = img.attr("data-src") ?? img.attr("src") ?? img.attr("data-lazy-src") ?? null;
      if (poster && poster.startsWith("/")) poster = `https://${domain}${poster}`;
      const kind = getKindFromUrl(slug);
      out.push({
        id: slug,
        source: "pelispedia",
        sourceLabel: "Pelispedia",
        title,
        url: absolute,
        poster: isMissingPoster(poster) ? null : poster,
        kind,
        year: extractYear(title) ?? null,
        rating: null,
        episode: null,
        note: null
      });
    });
    return dedupeResults(out);
  },
  playUrl(domain, id, pos) {
    if (pos && id.startsWith("serie/")) {
      return `https://${domain}/${id}#s${pos.season}-e${pos.episode}`;
    }
    return `https://${domain}/${id}`;
  },
  parseDetail(html, domain, id) {
    const $ = cheerio3.load(html);
    const title = cleanText($("h1").first().text()) || cleanText($('meta[property="og:title"]').attr("content")) || id.split("/").pop()?.replace(/-/g, " ") || id;
    let poster = $('meta[property="og:image"]').attr("content") || $("img.poster, .cover img").first().attr("src") || $("img").first().attr("src") || null;
    if (poster && poster.startsWith("/")) poster = `https://${domain}${poster}`;
    const synopsis = sinopsisUtil($('meta[property="og:description"]').attr("content")) || sinopsisUtil($('meta[name="description"]').attr("content")) || sinopsisUtil($(".description, .sinopsis, .plot").first().text());
    const seasons = [];
    const episodesMap = /* @__PURE__ */ new Map();
    if (id.startsWith("serie/")) {
      $("button[data-season-toggle]").each((_, el) => {
        const seasonIndex = Number($(el).attr("data-season-index"));
        if (!Number.isFinite(seasonIndex)) return;
        const seasonNum = seasonIndex + 1;
        if (!seasons.find((s) => s.season === seasonNum)) {
          seasons.push({
            season: seasonNum,
            name: `Temporada ${seasonNum}`,
            first: 1,
            last: 0,
            poster: null
          });
        }
        $(`#season-${seasonIndex} a[data-season][data-episode]`).each((__, a) => {
          const epSeason = Number($(a).attr("data-season"));
          const epNum = Number($(a).attr("data-episode"));
          if (!Number.isFinite(epSeason) || !Number.isFinite(epNum)) return;
          const lista = episodesMap.get(epSeason) ?? [];
          lista.push({
            season: epSeason,
            episode: epNum,
            title: `Cap\xEDtulo ${epNum}`,
            airDate: null,
            runtime: null,
            available: true
          });
          episodesMap.set(epSeason, lista);
        });
      });
      for (const [s, list] of episodesMap) {
        list.sort((a, b) => a.episode - b.episode);
        const seasonInfo = seasons.find((x) => x.season === s);
        if (seasonInfo) {
          seasonInfo.first = list[0]?.episode ?? 1;
          seasonInfo.last = list[list.length - 1]?.episode ?? 0;
        }
      }
      seasons.sort((a, b) => a.season - b.season);
    }
    const porDefecto = primerCapitulo(seasons);
    const capitulos = porDefecto ? episodesMap.get(porDefecto.season) ?? [] : [];
    return {
      source: "pelispedia",
      id,
      title,
      url: `https://${domain}/${id}`,
      poster: isMissingPoster(poster) ? null : poster,
      synopsis,
      year: extractYear(title) ?? null,
      kind: getKindFromUrl(id),
      servers: [],
      episodes: id.startsWith("serie/") && seasons.length > 0 ? indiceDeSerie(seasons, capitulos, porDefecto) : null
    };
  },
  async fetchServers(domain, id, pos) {
    const pageUrl2 = this.playUrl(domain, id, pos ?? null);
    let html = await fetchText(pageUrl2, { referer: `https://${domain}/` });
    const $ = cheerio3.load(html);
    let vidUrl = null;
    $("iframe").each((_, el) => {
      const src = $(el).attr("src") || "";
      if (src.includes("/vidurl/")) {
        vidUrl = src.startsWith("http") ? src : `https://${domain}${src}`;
      }
    });
    if (!vidUrl) {
      const match = html.match(/\/vidurl\/[^"']+/);
      if (match) {
        vidUrl = match[0].startsWith("http") ? match[0] : `https://${domain}${match[0]}`;
      }
    }
    if (!vidUrl) return [];
    try {
      const vidHtml = await fetchText(vidUrl, { referer: pageUrl2 });
      const $2 = cheerio3.load(vidHtml);
      const match = vidHtml.match(/let dataLink = (\[.*?\]);/s);
      if (match) {
        try {
          return [{
            id: "pelispedia-1",
            label: "Reproductor",
            embedUrl: vidUrl,
            method: "dom"
          }];
        } catch {
        }
      }
    } catch {
    }
    return [{
      id: "pelispedia-1",
      label: "Reproductor",
      embedUrl: vidUrl,
      method: "dom"
    }];
  },
  async fetchEpisodes(domain, id, season) {
    if (!id.startsWith("serie/")) return [];
    const html = await fetchText(`https://${domain}/${id}`, { referer: `https://${domain}/` });
    const $ = cheerio3.load(html);
    const episodes = [];
    const seasonIndex = season - 1;
    $(`#season-${seasonIndex} a[data-season][data-episode]`).each((_, a) => {
      const epSeason = Number($(a).attr("data-season"));
      const epNum = Number($(a).attr("data-episode"));
      if (!Number.isFinite(epSeason) || !Number.isFinite(epNum)) return;
      if (epSeason !== season) return;
      episodes.push({
        season: epSeason,
        episode: epNum,
        title: `Cap\xEDtulo ${epNum}`,
        airDate: null,
        runtime: null,
        available: true
      });
    });
    episodes.sort((a, b) => a.episode - b.episode);
    return episodes;
  },
  async fetchHome(domain, limit) {
    const html = await fetchText(`https://${domain}/`, { timeoutMs: 15e3 }).catch(() => "");
    const results = this.parseResults(html, domain).slice(0, limit);
    return results;
  },
  async fetchByGenre(domain, genre) {
    const url = `https://${domain}/peliculas?genero=${encodeURIComponent(genre.slug)}`;
    const html = await fetchText(url, { referer: `https://${domain}/`, timeoutMs: 15e3 }).catch(() => "");
    return this.parseResults(html, domain);
  }
};

// server/settings.ts
import { existsSync as existsSync2, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path2 from "node:path";
var FILE = path2.join(PATHS.userData, "settings.json");
var cache = null;
var ultimoError = null;
function empty() {
  return { version: 1, disabledSources: [] };
}
function load4() {
  if (cache) return cache;
  try {
    if (existsSync2(FILE)) {
      const raw = JSON.parse(readFileSync(FILE, "utf8"));
      const desactivadas = Array.isArray(raw.disabledSources) ? raw.disabledSources.filter((id) => typeof id === "string" && id.length > 0) : [];
      cache = { version: 1, disabledSources: [...new Set(desactivadas)] };
      return cache;
    }
  } catch (err) {
    process.stderr.write(`[miso] ajustes ilegibles, se reinician: ${String(err)}
`);
  }
  cache = empty();
  return cache;
}
function save(settings) {
  cache = settings;
  try {
    mkdirSync(PATHS.userData, { recursive: true });
    const tmp = `${FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify(settings), "utf8");
    renameSync(tmp, FILE);
    ultimoError = null;
  } catch (err) {
    ultimoError = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[miso] no se pudieron guardar los ajustes: ${ultimoError}
`);
  }
}
function settingsStatus() {
  return { file: FILE, error: ultimoError };
}
function isSourceEnabled(id) {
  return !load4().disabledSources.includes(id);
}
function setSourceEnabled(id, enabled) {
  const actual = load4();
  const sinEsta = actual.disabledSources.filter((otro) => otro !== id);
  save({ ...actual, disabledSources: enabled ? sinEsta : [...sinEsta, id] });
}

// server/sources/index.ts
var SOURCES = [pelisplushd, cuevana3gs, lamovie, sololatino, pelispedia];
var SOURCE_MAP = new Map(SOURCES.map((s) => [s.meta.id, s]));
function getSource(id) {
  return SOURCE_MAP.get(id);
}
function activeSources() {
  return SOURCES.filter((s) => isSourceEnabled(s.meta.id));
}
function sourceMeta() {
  return SOURCES.map((s) => ({ ...s.meta, enabled: isSourceEnabled(s.meta.id) }));
}
var DOMAIN_TTL = 10 * 60 * 1e3;
var DOMAIN_FALLBACK_TTL = 60 * 1e3;
var PROBE_BUDGET_MS = 2e3;
async function resolveDomain(source, budgetMs = PROBE_BUDGET_MS) {
  const key = `domain:${source.meta.id}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  const probe = (domain) => fetchText(`https://${domain}/`, { timeoutMs: budgetMs });
  let chosen;
  let alive = true;
  try {
    await probe(source.domains[0]);
    chosen = source.domains[0];
  } catch {
    try {
      const rest = await Promise.any(source.domains.slice(1).map(probe));
      chosen = rest;
    } catch {
      alive = false;
      chosen = source.domains[0];
    }
  }
  cacheSet(key, chosen, alive ? DOMAIN_TTL : DOMAIN_FALLBACK_TTL);
  return chosen;
}

// server/errors.ts
function briefSourceError(err) {
  const status = err instanceof HttpError ? err.status : 0;
  if (status === 403 || status === 401) return "no nos deja buscar";
  if (status === 429) return "nos est\xE1 limitando las peticiones";
  if (status >= 500) return "su servidor est\xE1 teniendo problemas";
  if (status === 404) return "la p\xE1gina de b\xFAsqueda ya no existe";
  if (status === 0) return "no respondi\xF3 a tiempo";
  const texto = err instanceof Error ? err.message : String(err);
  return texto.replace(/https?:\/\/\S+/g, "su p\xE1gina").slice(0, 120);
}

// server/search.ts
var SEARCH_TTL = 5 * 60 * 1e3;
var PER_SOURCE_TIMEOUT = 6e3;
async function searchOne(source, query) {
  const started = Date.now();
  const probeBudget = Math.floor(PER_SOURCE_TIMEOUT / 3);
  try {
    const domain = await resolveDomain(source, probeBudget);
    const url = source.searchUrl(domain, query);
    const rest = PER_SOURCE_TIMEOUT - probeBudget - (Date.now() - started);
    const html = await fetchText(url, { timeoutMs: Math.max(500, rest) });
    const results = source.parseResults(html, domain);
    return {
      results,
      status: { state: "ok", count: results.length, ms: Date.now() - started }
    };
  } catch (err) {
    return {
      results: [],
      status: {
        state: "error",
        message: briefSourceError(err),
        ms: Date.now() - started
      }
    };
  }
}
async function searchAll(query) {
  const started = Date.now();
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return { query: trimmed, results: [], bySource: {}, totalMs: 0 };
  }
  const cacheKey = `search:${trimmed.toLowerCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;
  const fuentes = activeSources();
  const settled = await Promise.allSettled(
    fuentes.map((source) => searchOne(source, trimmed))
  );
  const results = [];
  const bySource = {};
  settled.forEach((outcome, i) => {
    const source = fuentes[i];
    if (outcome.status === "fulfilled") {
      results.push(...outcome.value.results);
      bySource[source.meta.id] = outcome.value.status;
    } else {
      bySource[source.meta.id] = {
        state: "error",
        message: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
        ms: 0
      };
    }
  });
  const aggregated = {
    query: trimmed,
    results,
    bySource,
    totalMs: Date.now() - started
  };
  const anyError = Object.values(bySource).some((s) => s.state === "error");
  if (!anyError) cacheSet(cacheKey, aggregated, SEARCH_TTL);
  return aggregated;
}

// server/home.ts
var POR_FUENTE = 24;
var TOTAL = 12;
var HOME_TTL = 2 * 60 * 1e3;
var PER_SOURCE_TIMEOUT2 = 6e3;
async function homeAll() {
  const started = Date.now();
  const cacheKey = "home";
  const cached = cacheGet(cacheKey);
  if (cached) return cached;
  const conHome = activeSources().filter((s) => s.fetchHome);
  const probeBudget = Math.floor(PER_SOURCE_TIMEOUT2 / 3);
  const settled = await Promise.allSettled(
    conHome.map(async (source) => {
      const inicio = Date.now();
      const domain = await resolveDomain(source, probeBudget);
      const results2 = await source.fetchHome(domain, POR_FUENTE);
      const status = {
        state: "ok",
        count: results2.length,
        ms: Date.now() - inicio
      };
      return { source, results: results2, status };
    })
  );
  const porFuente = [];
  const bySource = {};
  settled.forEach((outcome, i) => {
    const source = conHome[i];
    if (outcome.status === "fulfilled") {
      porFuente.push(outcome.value.results);
      bySource[source.meta.id] = outcome.value.status;
    } else {
      porFuente.push([]);
      bySource[source.meta.id] = {
        state: "error",
        message: briefSourceError(outcome.reason),
        ms: 0
      };
    }
  });
  let mezcladas = porFuente;
  while (mezcladas.length > 2) {
    const siguiente = [];
    for (let i = 0; i < mezcladas.length; i += 2) {
      siguiente.push(entrelazar(mezcladas[i], mezcladas[i + 1] ?? []));
    }
    mezcladas = siguiente;
  }
  const results = (mezcladas.length === 2 ? entrelazar(mezcladas[0], mezcladas[1]) : mezcladas[0] ?? []).slice(0, TOTAL);
  const aggregated = {
    query: "",
    results,
    bySource,
    totalMs: Date.now() - started
  };
  const anyError = Object.values(bySource).some((s) => s.state === "error");
  if (!anyError) cacheSet(cacheKey, aggregated, HOME_TTL);
  return aggregated;
}

// server/genres.ts
var GENRES = [
  { name: "Acci\xF3n", slug: "accion" },
  { name: "Aventura", slug: "aventura" },
  { name: "Animaci\xF3n", slug: "animacion" },
  { name: "Comedia", slug: "comedia" },
  { name: "Crimen", slug: "crimen" },
  { name: "Documental", slug: "documental" },
  { name: "Drama", slug: "drama" },
  { name: "Familia", slug: "familia" },
  { name: "Fantas\xEDa", slug: "fantasia" },
  { name: "Terror", slug: "terror" },
  { name: "Misterio", slug: "misterio" },
  { name: "Romance", slug: "romance" },
  { name: "Ciencia ficci\xF3n", slug: "ciencia-ficcion" },
  { name: "Suspense", slug: "suspense" },
  { name: "B\xE9lica", slug: "belica" },
  { name: "Historia", slug: "historia" },
  { name: "M\xFAsica", slug: "musica" },
  { name: "Western", slug: "western" }
];
function normalizar(raw) {
  return raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function findGenre(raw) {
  const key = normalizar(raw ?? "");
  if (!key) return null;
  return GENRES.find((g) => normalizar(g.name) === key || g.slug === key) ?? null;
}

// server/genre.ts
var POR_FUENTE2 = 24;
var PER_SOURCE_TIMEOUT3 = 9e3;
var GENRE_TTL = 5 * 60 * 1e3;
function conTecho(promesa, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`sin respuesta en ${ms} ms`)), ms);
    promesa.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}
async function genreAll(genre, kind) {
  const started = Date.now();
  const cacheKey = `genre:${genre.slug}:${kind ?? "todo"}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;
  const fuentes = activeSources().filter((s) => typeof s.fetchByGenre === "function");
  const probeBudget = Math.floor(PER_SOURCE_TIMEOUT3 / 3);
  const settled = await Promise.allSettled(
    fuentes.map(async (source) => {
      const inicio = Date.now();
      const domain = await resolveDomain(source, probeBudget);
      const restante = PER_SOURCE_TIMEOUT3 - probeBudget - (Date.now() - inicio);
      const crudas = await conTecho(
        source.fetchByGenre(domain, genre, kind, POR_FUENTE2),
        Math.max(2e3, restante)
      );
      const results2 = kind ? crudas.filter((r) => r.kind === kind) : crudas;
      const status = {
        state: "ok",
        count: results2.length,
        ms: Date.now() - inicio
      };
      return { source, results: results2, status };
    })
  );
  const results = [];
  const bySource = {};
  settled.forEach((outcome, i) => {
    const source = fuentes[i];
    if (outcome.status === "fulfilled") {
      results.push(...outcome.value.results);
      bySource[source.meta.id] = outcome.value.status;
    } else {
      bySource[source.meta.id] = {
        state: "error",
        message: briefSourceError(outcome.reason),
        ms: 0
      };
    }
  });
  const aggregated = {
    query: genre.name,
    results,
    bySource,
    totalMs: Date.now() - started
  };
  const anyError = Object.values(bySource).some((s) => s.state === "error");
  if (!anyError) cacheSet(cacheKey, aggregated, GENRE_TTL);
  return aggregated;
}

// server/extract/static.ts
var STREAM_PATTERNS = [
  /https?:\/\/[^\s"'<>\\]+?\.m3u8(?:\?[^\s"'<>\\]*)?/gi,
  /https?:\/\/[^\s"'<>\\]+?\.mp4(?:\?[^\s"'<>\\]*)?/gi,
  // JW Player a veces publica el feed como JSON con la ruta dentro.
  /https?:\/\/[^\s"'<>\\]+?\/playlists\/[^\s"'<>\\]+?\.m8u8/gi
];
var MEDIA_EXT = /\.m3u8(?:$|\?)/i;
var FILE_EXT = /\.(mp4|webm|m4v|mov)(?:$|\?)/i;
var KNOWN_EMBED_HOSTS = ["nupload.my", "nupload.me"];
function findLiteralStreams(html) {
  const found = /* @__PURE__ */ new Map();
  let auto = 0;
  for (const pattern of STREAM_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of html.matchAll(pattern)) {
      const url = match[0];
      if (found.has(url)) continue;
      found.set(url, {
        id: `static-${auto++}`,
        label: "Directo",
        embedUrl: url,
        method: "static-literal"
      });
    }
  }
  return [...found.values()];
}
function decodeBase64(value) {
  try {
    let normalized = value.trim().replace(/-/g, "+").replace(/_/g, "/");
    const padding = normalized.length % 4;
    if (padding) normalized += "=".repeat(4 - padding);
    const decoded = Buffer.from(normalized, "base64").toString("utf8");
    return /^https?:\/\//i.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}
function findBase64Embeds(html) {
  const out = [];
  const attrRe = /(?:data-url|data-embed|data-src-embed)\s*=\s*"([A-Za-z0-9+/=_\-]{24,})"/gi;
  let index = 0;
  for (const match of html.matchAll(attrRe)) {
    const decoded = decodeBase64(match[1]);
    if (!decoded) continue;
    out.push({
      id: `b64-${index++}`,
      label: `Servidor ${index}`,
      embedUrl: decoded,
      method: "static-base64"
    });
  }
  return out;
}
function classifyStream(url) {
  if (MEDIA_EXT.test(url)) return "hls";
  if (FILE_EXT.test(url)) return "file";
  return "embed";
}
function isEmbedHost(url) {
  try {
    const host = new URL(url).hostname;
    return KNOWN_EMBED_HOSTS.includes(host);
  } catch {
    return false;
  }
}
function rankCandidates(candidates) {
  return [...candidates].sort((a, b) => {
    const score = (s) => {
      const kind = classifyStream(s.embedUrl);
      if (kind === "hls") return 0;
      if (kind === "file") return 1;
      if (isEmbedHost(s.embedUrl)) return 3;
      return 2;
    };
    return score(a) - score(b);
  });
}

// server/extract/browser.ts
import { chromium } from "playwright";
import { readdirSync, statSync } from "node:fs";
import path3 from "node:path";
function buscarEjecutable(dir, nombre, profundidad = 4) {
  let entradas;
  try {
    entradas = readdirSync(dir);
  } catch {
    return void 0;
  }
  for (const entrada of entradas) {
    const ruta = path3.join(dir, entrada);
    let esDirectorio = false;
    try {
      esDirectorio = statSync(ruta).isDirectory();
    } catch {
      continue;
    }
    if (!esDirectorio) {
      if (entrada === nombre) return ruta;
      continue;
    }
    if (profundidad > 0) {
      const encontrado = buscarEjecutable(ruta, nombre, profundidad - 1);
      if (encontrado) return encontrado;
    }
  }
  return void 0;
}
function resolveChromiumExecutable() {
  const desdeEntorno = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  if (desdeEntorno) return desdeEntorno;
  const resources = process.resourcesPath;
  if (!resources) return void 0;
  const nombre = process.platform === "win32" ? "chrome.exe" : "chrome";
  return buscarEjecutable(path3.join(resources, "playwright"), nombre);
}
var DEFAULT_BUDGET_MS = 25e3;
var PAGE_CEILING_MS = 4500;
var BLOCKED_HOSTS = [
  "doubleclick.net",
  "googlesyndication.com",
  "google-analytics.com",
  "googletagmanager.com",
  "adservice.google.com",
  "popads.net",
  "propellerads.com",
  "adsterra.com",
  "hilltopads.net",
  "onclickalgo.com",
  "exoclick.com",
  "trafficjunky.net"
];
var CHALLENGE_HINTS = [
  { name: "recaptcha", re: /recaptcha/i },
  { name: "turnstile", re: /turnstile/i },
  { name: "hcaptcha", re: /hcaptcha/i },
  { name: "captcha", re: /captcha|verifica que eres|confirm.*human/i }
];
async function hasIframe(page) {
  const found = await page.evaluate(
    'Array.from(document.querySelectorAll("iframe")).some((f) => /^https?:/i.test(f.src || ""))'
  ).catch(() => false);
  return found === true;
}
async function waitForMedia(page, networkHits, ceilingMs, hasIframeNow) {
  const started = Date.now();
  const deadline = started + ceilingMs;
  const graceMs = 3e3;
  while (Date.now() < deadline) {
    if (networkHits.size > 0) {
      return { early: true, followable: false, waitedMs: Date.now() - started };
    }
    if (Date.now() - started >= graceMs && await hasIframeNow()) {
      return { early: false, followable: true, waitedMs: Date.now() - started };
    }
    await page.waitForTimeout(400);
  }
  return { early: false, followable: false, waitedMs: Date.now() - started };
}
var READ_VISIBLE_TEXT = '`${document.title}\\n${document.body ? document.body.innerText : ""}`.slice(0, 3000)';
async function visibleText(page) {
  const text = await page.evaluate(READ_VISIBLE_TEXT).catch(() => null);
  return typeof text === "string" ? text : "";
}
function detectChallenge(html) {
  const head = html.slice(0, 4e3);
  for (const { name, re } of CHALLENGE_HINTS) {
    if (!re.test(head)) continue;
    const blocked = /verifica que eres|comprueba que eres|no (?:eres|has sido) un robot|access denied|demasiadas peticiones|too many requests/i.test(
      head
    );
    return blocked ? `${name} (bloquea el acceso)` : name;
  }
  return null;
}
var browserPromise = null;
function isBlocked(url) {
  try {
    const host = new URL(url).hostname;
    return BLOCKED_HOSTS.some((b) => host === b || host.endsWith(`.${b}`));
  } catch {
    return false;
  }
}
var STEALTH = `
(() => {
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  const define = (o, k, v) => { try { Object.defineProperty(o, k, { get: () => v, configurable: true }); } catch (_) {} };

  define(navigator, 'webdriver', undefined);
  define(navigator, 'userAgent', ua);
  define(navigator, 'platform', 'Win32');
  define(navigator, 'languages', ['es-ES', 'es', 'en']);
  define(navigator, 'vendor', 'Google Inc.');
  define(navigator, 'brands', [
    { brand: 'Chromium', version: '131' },
    { brand: 'Not_A Brand', version: '24' },
    { brand: 'Google Chrome', version: '131' },
  ]);

  if (!window.chrome) {
    define(window, 'chrome', { runtime: {}, app: { isInstalled: false }, csi: () => {}, loadTimes: () => {} });
  }
})();
`;
async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      executablePath: resolveChromiumExecutable(),
      args: [
        // Varias de estas webs miran si el navegador parece automatizado.
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--mute-audio"
      ]
    }).catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}
async function closeBrowser() {
  const pending = browserPromise;
  browserPromise = null;
  if (!pending) return;
  try {
    const browser = await pending;
    await browser.close();
  } catch {
  }
}
function isBrowserRunning() {
  return browserPromise !== null;
}
var BOOTSTRAP = `
(() => {
  if (window.__misoKick) return;
  window.__misoKick = true;

  const cleanAds = () => {
    const junk = [
      '.adcla', '.ad-cla', '.ads-box', '.advertisement', '[class*="popup"]',
      '[id*="popunder"]', '[class*="popunder"]', '.modal-backdrop',
      'ins.adsbygoogle', '[class*="adsbygoogle"]'
    ];
    for (const sel of junk) {
      try { document.querySelectorAll(sel).forEach((el) => el.remove()); } catch (_) {}
    }
    try {
      document.querySelectorAll('body > div[style*="position:fixed"]').forEach((el) => {
        const s = getComputedStyle(el);
        if (s.zIndex !== 'auto' && Number(s.zIndex) > 900) el.remove();
      });
    } catch (_) {}
  };

  const kick = () => {
    cleanAds();

    // JW Player arranca con autostart:false y preload:none. Si no se le
    // ordena reproducir, NUNCA pide el .m3u8, que es justo lo que buscamos.
    try {
      const w = window;
      if (typeof w.jwplayer === 'function') {
        const tryPlay = (inst) => { try { inst && inst.play && inst.play(); } catch (_) {} };
        tryPlay(w.jwplayer());
        // El player suele registrarse con un id concreto ('player'), y la
        // llamada sin argumentos no siempre devuelve la instancia buena.
        try {
          const el = document.getElementById('player');
          if (el) tryPlay(w.jwplayer(el.id));
        } catch (_) {}
      }
    } catch (_) {}

    // Videos nativos con <source>, a veces montados a mano por la fuente.
    try {
      document.querySelectorAll('video').forEach((v) => {
        try {
          v.muted = true;
          if (!v.src) {
            const s = v.querySelector('source[src]');
            if (s) v.src = s.src;
          }
          const p = v.play();
          if (p && p.catch) p.catch(() => {});
        } catch (_) {}
      });
    } catch (_) {}
  };

  let ticks = 0;
  const timer = setInterval(() => {
    kick();
    if (++ticks > 25) clearInterval(timer);
  }, 600);
  kick();
})();
`;
var READ_PLAYER_STATE = `
(() => {
  const out = { player: [], dom: [], iframe: [] };

  // --- API del player ---------------------------------------------------
  try {
    const jp = window.jwplayer;
    if (typeof jp === 'function') {
      const inst = jp();
      const push = (file, kind) => {
        if (typeof file === 'string' && /^https?:/i.test(file)) {
          out.player.push({ file, kind: kind || null });
        }
      };
      if (inst) {
        if (typeof inst.getMediaItem === 'function') {
          const item = inst.getMediaItem();
          (item && item.sources || []).forEach((s) => push(s.file, s.type));
        }
        if (typeof inst.getPlaylistItem === 'function') {
          const item = inst.getPlaylistItem();
          (item && item.sources || []).forEach((s) => push(s.file, s.type));
        }
        if (typeof inst.getMedia === 'function') push(inst.getMedia(), 'file');
        if (typeof inst.getPlaylist === 'function') {
          (inst.getPlaylist() || []).forEach((i) =>
            (i.sources || []).forEach((s) => push(s.file, s.type))
          );
        }
      }
    }
  } catch (_) {}

  // --- DOM: <video> y <source> -----------------------------------------
  document.querySelectorAll('video').forEach((v) => {
    if (v.currentSrc) out.dom.push({ file: v.currentSrc, kind: 'video' });
    else if (v.src) out.dom.push({ file: v.src, kind: 'video' });
    v.querySelectorAll('source').forEach((s) => {
      if (s.src) out.dom.push({ file: s.src, kind: s.type || null });
    });
  });

  // --- DOM: <iframe> ya resueltos --------------------------------------
  document.querySelectorAll('iframe').forEach((f) => {
    if (f.src && /^https?:/i.test(f.src)) out.iframe.push({ file: f.src });
  });

  return out;
})();
`;
async function extractWithBrowser(embedUrl, referer, budgetMs = DEFAULT_BUDGET_MS) {
  const started = Date.now();
  const trace = [];
  let context = null;
  const networkHits = /* @__PURE__ */ new Map();
  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      locale: "es-ES",
      viewport: { width: 1280, height: 800 },
      bypassCSP: true
    });
    await context.route("**/*", (route) => {
      const url = route.request().url();
      if (isBlocked(url)) return route.abort();
      return route.continue();
    });
    await context.addInitScript(STEALTH);
    await context.addInitScript(BOOTSTRAP);
    let pagesOpened = 0;
    context.on("page", (p) => {
      pagesOpened++;
      if (pagesOpened > 1) void p.close().catch(() => {
      });
    });
    const mainPage = await context.newPage();
    mainPage.on("request", (req) => {
      const url = req.url();
      if (/\.m3u8|\.m8u8(?:$|\?)/i.test(url)) {
        networkHits.set(url, "network");
      } else if (/\.(mp4|webm|m4v|mov)(?:$|\?)/i.test(url)) {
        networkHits.set(url, "network");
      }
    });
    mainPage.on("response", (res) => {
      const url = res.url();
      if (/\.m3u8|\.m8u8(?:$|\?)/i.test(url)) networkHits.set(url, "network");
      else if (/\.(mp4|webm|m4v|mov)(?:$|\?)/i.test(url)) networkHits.set(url, "network");
    });
    const response = await mainPage.goto(embedUrl, {
      waitUntil: "commit",
      timeout: Math.min(budgetMs, 25e3),
      referer
    });
    trace.push(`goto ${response?.status() ?? "sin-status"}`);
    const esperaMedia = Math.min(PAGE_CEILING_MS, Math.max(1e3, budgetMs - 400));
    const espera = await waitForMedia(mainPage, networkHits, esperaMedia, () => hasIframe(mainPage));
    trace.push(
      espera.early ? `medio detectado en ${espera.waitedMs}ms, sin agotar la espera` : espera.followable ? `iframe disponible en ${espera.waitedMs}ms, seguimos esa cadena` : `espera agotada: ${espera.waitedMs}ms sin medio ni iframe`
    );
    const states = [];
    for (const frame of mainPage.frames()) {
      const st = await frame.evaluate(READ_PLAYER_STATE).catch(() => null);
      if (st) states.push(st);
    }
    const candidates = /* @__PURE__ */ new Map();
    let index = 0;
    const add = (file, method) => {
      if (!file || candidates.has(file)) return;
      candidates.set(file, {
        id: `br-${index++}`,
        label: "Navegador",
        embedUrl: file,
        method
      });
    };
    for (const url of networkHits.keys()) add(url, "network");
    for (const st of states) {
      for (const p of st.player) add(p.file, "player-api");
      for (const d of st.dom) add(d.file, "dom");
    }
    for (const st of states) {
      for (const f of st.iframe) {
        if (isNoiseHost(f.file)) continue;
        add(f.file, "dom-iframe");
      }
    }
    const totals = states.reduce(
      (acc, st) => ({
        player: acc.player + st.player.length,
        dom: acc.dom + st.dom.length,
        iframe: acc.iframe + st.iframe.length
      }),
      { player: 0, dom: 0, iframe: 0 }
    );
    trace.push(`frames=${states.length} red=${networkHits.size} player=${totals.player} dom=${totals.dom} iframe=${totals.iframe}`);
    const ordered = [...candidates.values()].sort((a, b) => {
      const w = (c) => classifyStream(c.embedUrl) === "hls" ? 0 : classifyStream(c.embedUrl) === "file" ? 1 : 2;
      return w(a) - w(b);
    });
    const best = ordered.find((c) => classifyStream(c.embedUrl) !== "embed");
    const challenge = best ? null : detectChallenge(await visibleText(mainPage));
    if (challenge) trace.push(`reto detectado: ${challenge}`);
    return {
      candidates: ordered,
      method: best?.method ?? null,
      trace,
      finalUrl: mainPage.url(),
      status: response?.status() ?? null,
      durationMs: Date.now() - started,
      challenge
    };
  } catch (err) {
    trace.push(`error: ${err instanceof Error ? err.message : String(err)}`);
    return {
      candidates: [],
      method: null,
      trace,
      finalUrl: null,
      status: null,
      durationMs: Date.now() - started,
      challenge: null
    };
  } finally {
    await context?.close().catch(() => {
    });
  }
}

// server/extract/validate.ts
var AD_HOSTS = [
  "tiktokcdn.com",
  "p19-ad-site-sign-sg.tiktokcdn.com",
  "p16-ad-site-sign-sg.tiktokcdn.com",
  "doubleclick.net",
  "googlesyndication.com",
  "adservice.google.com",
  "popads.net",
  "propellerads.com",
  "adsterra.com",
  "hilltopads.net",
  "onclickalgo.com",
  "exoclick.com",
  "unionads.net",
  "bannersdr.com",
  "trafficjunky.net"
];
var TS_MAGIC = 71;
var MP4_BOXES = ["ftyp", "styp", "moof"];
function isAdHost(url) {
  try {
    const host = new URL(url).hostname;
    return AD_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}
function isManifestUrl(url) {
  try {
    return /\.m3u8(?:$|\?)/i.test(new URL(url, "https://placeholder.invalid").pathname);
  } catch {
    return /\.m3u8(?:$|\?)/i.test(url);
  }
}
function briefFetchFailure(err) {
  const status = err instanceof HttpError ? err.status : 0;
  if (status === 404 || status === 410) return "ese servidor ya no existe";
  if (status === 403 || status === 401) return "ese servidor no deja entrar";
  if (status >= 500) return "ese servidor est\xE1 teniendo problemas";
  return "ese servidor no respondio";
}
function detailFetchFailure(err, url) {
  return `${err instanceof Error ? err.message : String(err)} (${url})`;
}
async function collectSegments(manifestUrl, referer, maxDepth = 3) {
  const text = await fetchText(manifestUrl, { referer, timeoutMs: 12e3 });
  if (/^\s*<(!doctype|html)/i.test(text)) return [];
  const uris = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => {
    try {
      return new URL(l, manifestUrl).toString();
    } catch {
      return l;
    }
  });
  if (uris.length === 0) return [];
  if (maxDepth > 1 && isManifestUrl(uris[0])) {
    try {
      const nested = await collectSegments(uris[0], referer, maxDepth - 1);
      if (nested.length > 0) return nested;
    } catch {
    }
  }
  return uris;
}
async function validateHls(url, referer) {
  let head;
  try {
    head = await fetchText(url, { referer, timeoutMs: 12e3 });
  } catch (err) {
    return {
      ok: false,
      reason: briefFetchFailure(err),
      detail: `no se pudo descargar el manifiesto: ${detailFetchFailure(err, url)}`,
      sampled: 0
    };
  }
  if (/^\s*<(!doctype|html)/i.test(head)) {
    return {
      ok: false,
      reason: "el origen devolvi\xF3 una p\xE1gina web en lugar de un v\xEDdeo",
      detail: "la respuesta empieza por una etiqueta HTML, no por #EXTM3U",
      sampled: 0
    };
  }
  if (!/^\s*#EXTM3U/.test(head)) {
    return {
      ok: false,
      reason: "el origen no devolvi\xF3 una lista de reproducci\xF3n",
      detail: `la respuesta no empieza por #EXTM3U (${head.slice(0, 80)})`,
      sampled: 0
    };
  }
  let uris;
  try {
    uris = await collectSegments(url, referer);
  } catch (err) {
    return {
      ok: false,
      reason: "no se pudo leer la lista de segmentos",
      detail: `no se pudo recorrer el manifiesto: ${detailFetchFailure(err, url)}`,
      sampled: 0
    };
  }
  if (uris.length === 0) {
    return {
      ok: false,
      reason: "la lista de reproducci\xF3n est\xE1 vac\xEDa",
      detail: "el manifiesto no contiene ninguna linea de segment",
      sampled: 0
    };
  }
  const adSegments = uris.filter(isAdHost);
  if (adSegments.length === uris.length) {
    return {
      ok: false,
      reason: "solo entrega anuncios, no v\xEDdeo",
      detail: `los ${uris.length} segmentos son anuncios de ${new URL(uris[0]).hostname}`,
      sampled: uris.length
    };
  }
  if (adSegments.length > 0) {
    return {
      ok: false,
      reason: `mezcla anuncios y v\xEDdeo (${adSegments.length} de ${uris.length})`,
      detail: `redes de publicidad en ${adSegments.length}/${uris.length} segmentos`,
      sampled: uris.length
    };
  }
  try {
    const res = await fetch(uris[0], {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        ...referer ? { Referer: referer } : {}
      },
      signal: AbortSignal.timeout(12e3)
    });
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength < 100) {
      return {
        ok: false,
        reason: "el primer segmento lleg\xF3 vac\xEDo",
        detail: `el segmento inicial solo tiene ${buf.byteLength} bytes`,
        sampled: uris.length
      };
    }
    const first = buf[0];
    const looksTs = first === TS_MAGIC;
    const looksMp4 = MP4_BOXES.some(
      (b) => buf.subarray(4, 4 + b.length).toString("latin1").includes(b)
    );
    if (!looksTs && !looksMp4) {
      return {
        ok: false,
        reason: "lo que env\xEDa no es un v\xEDdeo",
        detail: `el primer segmento no tiene firma MPEG-TS ni fMP4 (byte 0x${first.toString(16)})`,
        sampled: uris.length
      };
    }
  } catch {
  }
  return { ok: true, reason: null, detail: null, sampled: uris.length };
}

// server/extract/index.ts
var TITLE_BUDGET_MS = 32e3;
var NAVEGADOR_DISPONIBLE = process.env.MISO_NO_BROWSER !== "1";
var PER_SERVER_MS = 14e3;
var DEFINITIVE_MISS = /* @__PURE__ */ new Set([404, 410, 451]);
function dedupeServers(servers) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const s of servers) {
    if (seen.has(s.embedUrl)) continue;
    seen.add(s.embedUrl);
    out.push(s);
  }
  return out;
}
var deadHops = /* @__PURE__ */ new Set();
async function resolveStream(embedUrl, opts = {}) {
  const {
    referer,
    serverLabel = null,
    // El reloj de arriba necesita un valor, y el que se usa cuando nadie impone
    // uno es el del navegador: 25 s. Lo que imponen resolveTitle y la API, que
    // siempre pasan uno, llega por opts.
    budgetMs = 25e3,
    allowBrowser = NAVEGADOR_DISPONIBLE,
    onTrace,
    onChallenge,
    visited = /* @__PURE__ */ new Set()
  } = opts;
  visited.add(embedUrl);
  const tipoDirecto = classifyStream(embedUrl);
  if (tipoDirecto !== "embed") {
    return {
      url: embedUrl,
      type: tipoDirecto,
      method: "direct",
      durationSec: null,
      serverLabel,
      proxied: false
    };
  }
  const fin = Date.now() + budgetMs;
  const restante = () => Math.max(800, fin - Date.now());
  if (deadHops.has(embedUrl)) {
    onTrace?.(`saltos ya conocido como muerto: ${hostOf3(embedUrl)}`);
    return null;
  }
  if (classifyStream(embedUrl) === "embed") {
    try {
      const html = await fetchText(embedUrl, { referer, timeoutMs: Math.min(15e3, restante()) });
      const literals = findLiteralStreams(html);
      const direct = literals.find((s) => classifyStream(s.embedUrl) !== "embed");
      if (direct) {
        onTrace?.(`stream literal encontrado en ${new URL(embedUrl).hostname}`);
        return toStream(direct, serverLabel, direct.method, false);
      }
      const b64 = findBase64Embeds(html);
      const next = rankCandidates(b64)[0];
      if (next && next.embedUrl !== embedUrl) {
        onTrace?.(`embeds base64: ${b64.length}, siguiendo ${new URL(next.embedUrl).hostname}`);
        return resolveStream(next.embedUrl, {
          ...opts,
          budgetMs: restante(),
          serverLabel: serverLabel ?? next.label,
          visited
        });
      }
    } catch (err) {
      onTrace?.(`via estatica fallo: ${err instanceof Error ? err.message : String(err)}`);
      if (err instanceof HttpError && DEFINITIVE_MISS.has(err.status)) {
        onTrace?.(`descartado sin navegador: el embed responde ${err.status}`);
        deadHops.add(embedUrl);
        return null;
      }
    }
  }
  if (!allowBrowser) return null;
  const extraction = await extractWithBrowser(embedUrl, referer, restante());
  onTrace?.(`navegador: ${extraction.trace.join(" | ")}`);
  if (extraction.status !== null && DEFINITIVE_MISS.has(extraction.status)) {
    onTrace?.(`descartado: el embed responde ${extraction.status}`);
    deadHops.add(embedUrl);
    return null;
  }
  const best = extraction.candidates.find((c) => classifyStream(c.embedUrl) !== "embed");
  if (best) {
    return toStream(best, serverLabel, best.method, false);
  }
  const nested = extraction.candidates.find((c) => c.method === "dom-iframe" && !isNoiseHost(c.embedUrl));
  if (nested && nested.embedUrl !== embedUrl && !visited.has(nested.embedUrl)) {
    const destino = hostOf3(nested.embedUrl);
    onTrace?.(`siguiendo el iframe a ${destino}`);
    visited.add(nested.embedUrl);
    const developed = await resolveStream(nested.embedUrl, {
      ...opts,
      // Lo que quede, no el presupuesto entero: este salto es una continuacion
      // del anterior, no una resolucion nueva.
      budgetMs: restante(),
      serverLabel: serverLabel ?? nested.label,
      visited
    });
    if (developed) return developed;
    onTrace?.(`el iframe tampoco dio video (${destino})`);
  }
  if (extraction.challenge) {
    onTrace?.(`el hoster pide ${extraction.challenge}`);
    onChallenge?.(extraction.challenge);
  }
  return toStream(
    { id: "fallback", label: "Reproductor original", embedUrl, method: "embed-fallback" },
    serverLabel,
    "embed-fallback",
    false
  );
}
function hostOf3(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url.slice(0, 40);
  }
}
async function pedirCapitulos(source, domain, id, pos, seasons, detalle, trace) {
  const enElDetalle = capitulosDeLaTemporada2(detalle.episodes?.episodes, pos);
  if (!source.fetchEpisodes || !pos || seasons.length === 0) return enElDetalle;
  if (enElDetalle) {
    trace?.(`capitulos de la temporada ${pos.season}: ${enElDetalle.length} (ya estaban en el detalle)`);
    return enElDetalle;
  }
  try {
    const capitulos = await source.fetchEpisodes(
      domain,
      id,
      pos.season,
      seasons
    );
    if (!capitulos) {
      trace?.(`la fuente no tiene capitulos de la temporada ${pos.season}`);
      return null;
    }
    trace?.(`capitulos de la temporada ${pos.season}: ${capitulos.length}`);
    return capitulos;
  } catch (err) {
    trace?.(
      `no se pudieron pedir los capitulos de la temporada ${pos.season}: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}
function capitulosDeLaTemporada2(capitulos, pos) {
  if (!capitulos || capitulos.length === 0 || !pos) return null;
  return capitulos.every((c) => c.season === pos.season) ? [...capitulos] : null;
}
async function pedirServidores(source, domain, id, pos, detail, trace) {
  if (!source.fetchServers) return detail.servers;
  if (detail.servers.length > 0 && !pos) return detail.servers;
  try {
    const extra = await source.fetchServers(domain, id, pos);
    if (extra.length === 0) {
      trace?.("la fuente no devolvio ningun servidor para este capitulo");
      return detail.servers;
    }
    trace?.(`servidores declarados por la fuente: ${extra.map((s) => s.label).join(", ")}`);
    return extra;
  } catch (err) {
    if (err instanceof HttpError && err.status === 429) {
      const espera = err.retryAfterMs && err.retryAfterMs > 0 ? `espera unos ${Math.max(1, Math.ceil(err.retryAfterMs / 1e3))} s` : "espera unos segundos";
      trace?.(`la fuente esta limitando las peticiones: ${espera} y vuelve a intentar`);
    } else {
      trace?.(
        `no se pudieron pedir los servidores a la fuente: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    return detail.servers;
  }
}
async function resolveTitle(sourceId, id, opts = {}) {
  const source = getSource(sourceId);
  if (!source) return null;
  const domain = await resolveDomain(source);
  const trace = opts.onTrace;
  let detail;
  try {
    if (source.fetchDetail) {
      detail = await source.fetchDetail(domain, id, opts.pos ?? null);
    } else {
      const html = await fetchText(source.playUrl(domain, id, null), {
        referer: `https://${domain}/`,
        timeoutMs: 2e4
      });
      detail = source.parseDetail(html, domain, id);
    }
    trace?.(`detalle leido: "${detail.title}"`);
  } catch (err) {
    trace?.(`no se pudo leer el detalle: ${err instanceof Error ? err.message : String(err)}`);
    detail = {
      source: sourceId,
      id,
      title: id.replace(/^\/(pelicula|serie)\//, "").replace(/-/g, " "),
      url: source.playUrl(domain, id, null),
      poster: null,
      synopsis: null,
      year: null,
      kind: null,
      servers: [],
      episodes: null
    };
  }
  const seasons = detail.episodes?.seasons ?? [];
  const pedido = opts.pos ?? null;
  const pos = capituloAjustado(seasons, pedido);
  if (seasons.length > 0 && pedido && pos && (pedido.season !== pos.season || pedido.episode !== pos.episode)) {
    trace?.(
      `el capitulo pedido T${pedido.season}E${pedido.episode} no existe; se usa T${pos.season}E${pos.episode}`
    );
  }
  if (pos) trace?.(`capitulo: T${pos.season}E${pos.episode}`);
  const [capitulos, servidores] = await Promise.all([
    pedirCapitulos(source, domain, id, pos, seasons, detail, trace),
    pedirServidores(source, domain, id, pos, detail, trace)
  ]);
  detail = { ...detail, servers: servidores };
  if (seasons.length > 0) {
    detail = { ...detail, episodes: indiceDeSerie(seasons, capitulos ?? [], pos) };
  }
  const playPage = source.playUrl(domain, id, pos);
  const candidates = [
    ...rankCandidates(dedupeServers(detail.servers)),
    {
      id: "own-page",
      label: pos ? `Reproductor de la fuente (T${pos.season}E${pos.episode})` : "Reproductor de la fuente",
      embedUrl: playPage,
      method: "own-page"
    }
  ];
  if (detail.servers.length > 0 && candidates.length - 1 < detail.servers.length) {
    trace?.(
      `servidores repetidos eliminados: ${detail.servers.length} -> ${candidates.length - 1}`
    );
  }
  const attempts = [];
  let fallback = null;
  const deadline = Date.now() + TITLE_BUDGET_MS;
  const ordenados = opts.preferServer ? [
    ...candidates.filter((c) => c.id === opts.preferServer),
    ...candidates.filter((c) => c.id !== opts.preferServer)
  ] : candidates;
  for (const candidate of ordenados) {
    if (Date.now() > deadline) {
      trace?.(
        `presupuesto agotado: se probaron ${attempts.length} de ${candidates.length} servidor(es), ${candidates.length - attempts.length} sin mirar`
      );
      break;
    }
    trace?.(`probando servidor: ${candidate.label}`);
    const restante = deadline - Date.now();
    const techoServidor = Math.max(2e3, Math.min(restante, PER_SERVER_MS));
    let challenge = null;
    const stream = await resolveStream(candidate.embedUrl, {
      ...opts,
      budgetMs: Math.min(techoServidor, opts.budgetMs ?? techoServidor),
      referer: detail.url,
      serverLabel: opts.serverLabel ?? candidate.label,
      onChallenge: (c) => {
        challenge = c;
      }
    });
    if (stream && stream.type !== "embed") {
      if (stream.type === "hls") {
        const validation = await validateHls(stream.url, detail.url);
        if (!validation.ok) {
          trace?.(`servidor descartado: ${candidate.label} -> ${validation.detail ?? validation.reason}`);
          attempts.push({
            serverId: candidate.id,
            label: candidate.label,
            ok: false,
            reason: validation.reason
          });
          continue;
        }
      }
      trace?.(`servidor valido: ${candidate.label} -> ${stream.type}`);
      attempts.push({ serverId: candidate.id, label: candidate.label, ok: true, reason: null });
      return { detail, stream, attempts, serverId: candidate.id, sinProbar: candidates.length - attempts.length };
    }
    const reason = challenge ? `el servidor pide ${challenge} y no lo resuelve solo` : stream ? "solo entrega un reproductor incrustado, sin stream reproducible" : "no se pudo extraer ninguna direcci\xF3n de v\xEDdeo";
    attempts.push({ serverId: candidate.id, label: candidate.label, ok: false, reason });
    if (stream) fallback = stream;
  }
  if (candidates.length === 0) {
    const stream = await resolveStream(playPage, {
      ...opts,
      budgetMs: Math.max(2e3, deadline - Date.now()),
      referer: detail.url
    });
    return { detail, stream, attempts, serverId: null, sinProbar: 0 };
  }
  trace?.("ningun servidor devolvio un stream directo");
  return { detail, stream: fallback, attempts, serverId: null, sinProbar: candidates.length - attempts.length };
}
function toStream(server, serverLabel, method, proxied) {
  return {
    url: server.embedUrl,
    type: classifyStream(server.embedUrl),
    method,
    durationSec: null,
    serverLabel: serverLabel ?? server.label ?? null,
    proxied
  };
}

// server/proxy/guard.ts
import dns from "node:dns/promises";
import net from "node:net";
var PRIVATE_V4 = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\./,
  /^169\.254\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./
];
var ProxyBlockedError = class extends Error {
  constructor(reason) {
    super(reason);
    this.name = "ProxyBlockedError";
  }
};
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) return PRIVATE_V4.some((re) => re.test(ip));
  if (net.isIPv6(ip)) {
    const low = ip.toLowerCase();
    if (low === "::1" || low === "::") return true;
    if (/^f[cd][0-9a-f]{2}:/.test(low)) return true;
    if (/^fe[89ab][0-9a-f]:/.test(low)) return true;
    const mapped = low.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
  }
  return false;
}
var dnsCache = /* @__PURE__ */ new Map();
var DNS_TTL = 6e4;
async function resolveHost(host) {
  const cached = dnsCache.get(host);
  if (cached && cached.expiresAt > Date.now()) return cached.ips;
  let ips;
  try {
    ips = (await dns.lookup(host, { all: true })).map((r) => r.address);
  } catch {
    throw new ProxyBlockedError(`No se pudo resolver ${host}`);
  }
  dnsCache.set(host, { ips, expiresAt: Date.now() + DNS_TTL });
  return ips;
}
async function assertPublicUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new ProxyBlockedError(`URL invalida: ${raw.slice(0, 80)}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ProxyBlockedError(`Protocolo no permitido: ${url.protocol}`);
  }
  const ips = await resolveHost(url.hostname);
  if (ips.length === 0) throw new ProxyBlockedError(`Sin IPs para ${url.hostname}`);
  const privateOnes = ips.filter(isPrivateIp);
  if (privateOnes.length > 0) {
    throw new ProxyBlockedError(`${url.hostname} apunta a la red interna`);
  }
  return url;
}
function upstreamHeaders(referer, extra) {
  return {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept: "*/*",
    "Accept-Language": "es-ES,es;q=0.9",
    ...referer ? { Referer: referer } : {},
    ...extra
  };
}

// server/proxy/image.ts
async function imageProxy(req, res) {
  const raw = typeof req.query.u === "string" ? req.query.u : "";
  if (!raw) {
    res.status(400).json({ error: "falta el parametro u" });
    return;
  }
  try {
    const url = await assertPublicUrl(raw);
    const upstream = await fetch(url, {
      headers: upstreamHeaders(typeof req.query.ref === "string" ? req.query.ref : null),
      redirect: "follow",
      signal: AbortSignal.timeout(2e4)
    });
    if (!upstream.ok) {
      res.status(502).json({ error: `origen devolvio ${upstream.status}` });
      return;
    }
    const type = upstream.headers.get("content-type") || "image/jpeg";
    if (!type.startsWith("image/")) {
      res.status(415).json({ error: "el origen no es una imagen" });
      return;
    }
    const body = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", type);
    res.setHeader("Cache-Control", "public, max-age=86400, immutable");
    res.setHeader("Content-Length", String(body.byteLength));
    res.end(body);
  } catch (err) {
    if (err instanceof ProxyBlockedError) {
      res.status(403).json({ error: err.message });
      return;
    }
    res.status(204).end();
  }
}

// server/log.ts
import { appendFileSync, mkdirSync as mkdirSync2, renameSync as renameSync2, statSync as statSync2 } from "node:fs";
import path4 from "node:path";
var FILE2 = path4.join(PATHS.userData, "miso.log");
var MAX_BYTES = 2 * 1024 * 1024;
function rotate() {
  try {
    if (statSync2(FILE2).size < MAX_BYTES) return;
    renameSync2(FILE2, `${FILE2}.1`);
  } catch {
  }
}
function logLine(message) {
  const line = `${(/* @__PURE__ */ new Date()).toISOString()} ${message}
`;
  try {
    mkdirSync2(PATHS.userData, { recursive: true });
    rotate();
    appendFileSync(FILE2, line, "utf8");
  } catch {
  }
  process.stderr.write(`[miso] ${message}
`);
}
function logEvent(scope, message, extra) {
  let cola = "";
  if (extra !== void 0 && extra !== null) {
    cola = ` \xB7 ${typeof extra === "string" ? extra : safeJson(extra)}`;
  }
  logLine(`[${scope}] ${message}${cola}`);
}
function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// server/proxy/hls.ts
var MANIFEST_RE = /\.m3u8(?:$|\?)/i;
var ultimoRegistroHls = 0;
function registrar(host, path7, mensaje) {
  const ahora = Date.now();
  if (ahora - ultimoRegistroHls < 1e3) return;
  ultimoRegistroHls = ahora;
  logEvent("hls", mensaje, `${host}${path7}`);
}
function proxyUrl(target, referer) {
  const params = new URLSearchParams({ u: target });
  if (referer) params.set("ref", referer);
  return `/api/hls?${params.toString()}`;
}
function resolveRef(base, ref) {
  try {
    return new URL(ref, base).toString();
  } catch {
    return ref;
  }
}
function rewriteManifest(manifest, baseUrl, referer) {
  const lines = manifest.split(/\r?\n/);
  const out = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (trimmed.startsWith("#")) {
      if (!/URI\s*=/.test(trimmed)) return line;
      return line.replace(/URI\s*=\s*"([^"]+)"/g, (match, uri) => {
        if (/^https?:/i.test(uri) || uri.startsWith("data:")) return match;
        return `URI="${proxyUrl(resolveRef(baseUrl, uri), referer)}"`;
      });
    }
    if (/^https?:/i.test(trimmed)) return proxyUrl(trimmed, referer);
    return proxyUrl(resolveRef(baseUrl, trimmed), referer);
  });
  return out.join("\n");
}
async function hlsProxy(req, res) {
  const raw = typeof req.query.u === "string" ? req.query.u : "";
  const referer = typeof req.query.ref === "string" ? req.query.ref : null;
  if (!raw) {
    res.status(400).json({ error: "falta el parametro u" });
    return;
  }
  let target;
  try {
    target = await assertPublicUrl(raw);
  } catch (err) {
    if (err instanceof ProxyBlockedError) {
      res.status(403).json({ error: err.message });
      return;
    }
    res.status(400).json({ error: "URL invalida" });
    return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25e3);
  try {
    const upstream = await fetch(target, {
      headers: upstreamHeaders(referer),
      redirect: "follow",
      signal: controller.signal
    });
    if (!upstream.ok) {
      registrar(target.host, target.pathname, `origen devolvio ${upstream.status}`);
      res.status(502).json({ error: `origen devolvio ${upstream.status}` });
      return;
    }
    if (!MANIFEST_RE.test(target.pathname)) {
      const type = upstream.headers.get("content-type") || "video/mp2t";
      res.setHeader("Content-Type", type);
      res.setHeader("Cache-Control", "public, max-age=3600");
      const range = req.headers.range;
      if (range) {
        res.status(206);
        const contentRange = upstream.headers.get("content-range");
        if (contentRange) res.setHeader("Content-Range", contentRange);
        const acceptRanges = upstream.headers.get("accept-ranges");
        if (acceptRanges) res.setHeader("Accept-Ranges", acceptRanges);
      } else {
        res.status(200);
      }
      const length = upstream.headers.get("content-length");
      if (length) res.setHeader("Content-Length", length);
      if (!upstream.body) {
        res.end();
        return;
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.end(buf);
      return;
    }
    const text = await upstream.text();
    if (/^\s*<(!doctype|html)/i.test(text)) {
      registrar(target.host, target.pathname, "el origen devolvio HTML en vez de un manifiesto");
      res.status(502).json({ error: "el origen no devolvio un manifiesto HLS", detail: "posible enlace caducado" });
      return;
    }
    const rewritten = rewriteManifest(text, target.toString(), referer);
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "no-store");
    res.send(rewritten);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      registrar(target.host, target.pathname, "el origen tardo mas de 25 s");
      res.status(504).json({ error: "el origen tardo demasiado" });
      return;
    }
    registrar(target.host, target.pathname, `fallo al traer el recurso: ${err instanceof Error ? err.message : String(err)}`);
    res.status(502).json({
      error: "fallo al traer el recurso",
      detail: err instanceof Error ? err.message : String(err)
    });
  } finally {
    clearTimeout(timer);
  }
}

// server/store.ts
import { existsSync as existsSync3, mkdirSync as mkdirSync3, readFileSync as readFileSync2, renameSync as renameSync3, writeFileSync as writeFileSync2 } from "node:fs";
import path5 from "node:path";
var FILE3 = path5.join(PATHS.userData, "library.json");
var MAX_HISTORY = 120;
var cache2 = null;
var ultimoError2 = null;
function empty2() {
  return { version: 1, history: [], favorites: [] };
}
function load5() {
  if (cache2) return cache2;
  try {
    if (existsSync3(FILE3)) {
      const raw = JSON.parse(readFileSync2(FILE3, "utf8"));
      cache2 = {
        version: 1,
        history: Array.isArray(raw.history) ? raw.history.filter(isSavedTitle) : [],
        favorites: Array.isArray(raw.favorites) ? raw.favorites.filter(isSavedTitle) : []
      };
      return cache2;
    }
  } catch (err) {
    process.stderr.write(`[miso] biblioteca ilegible, se reinicia: ${String(err)}
`);
  }
  cache2 = empty2();
  return cache2;
}
function save2(lib) {
  cache2 = lib;
  try {
    mkdirSync3(PATHS.userData, { recursive: true });
    const tmp = `${FILE3}.tmp`;
    writeFileSync2(tmp, JSON.stringify(lib), "utf8");
    renameSync3(tmp, FILE3);
    ultimoError2 = null;
  } catch (err) {
    ultimoError2 = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[miso] no se pudo guardar la biblioteca: ${ultimoError2}
`);
  }
}
function libraryStatus() {
  return { file: FILE3, error: ultimoError2 };
}
function isSavedTitle(value) {
  if (!value || typeof value !== "object") return false;
  const v = value;
  return typeof v.key === "string" && v.key.length > 0 && typeof v.at === "number" && Boolean(v.card) && typeof v.card.title === "string";
}
function sanitizeProgress(input) {
  if (!input || typeof input !== "object") return null;
  const p = input;
  if (typeof p.seconds !== "number" || !Number.isFinite(p.seconds) || p.seconds < 0) return null;
  const duration = typeof p.duration === "number" && Number.isFinite(p.duration) && p.duration > 0 ? p.duration : null;
  return { seconds: Math.round(p.seconds), duration: duration === null ? null : Math.round(duration) };
}
function sanitize(input) {
  if (!isSavedTitle(input)) return null;
  const { key, card, at, last, progress, watched, byEpisode } = input;
  const pos = last && Number.isInteger(last.season) && Number.isInteger(last.episode) ? { season: last.season, episode: last.episode } : null;
  return {
    key,
    card,
    at,
    last: pos,
    progress: sanitizeProgress(progress),
    watched: sanitizeWatched(watched),
    byEpisode: sanitizeByEpisode(byEpisode)
  };
}
function sanitizeByEpisode(input) {
  if (!input || typeof input !== "object") return null;
  const salida = {};
  let n = 0;
  for (const [k, v] of Object.entries(input)) {
    if (typeof k !== "string" || k.length === 0 || k.length > 32) continue;
    const p = sanitizeProgress(v);
    if (!p) continue;
    salida[k] = p;
    if (++n >= 5e3) break;
  }
  return n > 0 ? salida : null;
}
function sanitizeWatched(input) {
  if (!input || typeof input !== "object") return null;
  const entradas = Object.entries(input).filter(([k, v]) => v === true && typeof k === "string" && k.length > 0 && k.length <= 32).slice(0, 5e3);
  if (entradas.length === 0) return null;
  return Object.fromEntries(entradas);
}
function readLibrary() {
  const lib = load5();
  return { history: lib.history, favorites: lib.favorites };
}
function recordHistory(entry) {
  const lib = load5();
  const history = [entry, ...lib.history.filter((e) => e.key !== entry.key)].slice(0, MAX_HISTORY);
  save2({ ...lib, history });
  return history;
}
function forgetHistory(key) {
  const lib = load5();
  const history = key ? lib.history.filter((e) => e.key !== key) : [];
  save2({ ...lib, history });
  return history;
}
function toggleFavorite(entry) {
  const lib = load5();
  const yaEsta = lib.favorites.some((e) => e.key === entry.key);
  const favorites = yaEsta ? lib.favorites.filter((e) => e.key !== entry.key) : [entry, ...lib.favorites];
  save2({ ...lib, favorites });
  return { favorited: !yaEsta, favorites };
}

// server/index.ts
function createServer() {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));
  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      pid: process.pid,
      uptimeSec: Math.floor(process.uptime()),
      browser: isBrowserRunning(),
      memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
      // Estado de la biblioteca. Si `error` no es null, los favoritos y el
      // historial no se estan guardando; verlo aqui es la unica forma de
      // enterarse desde la aplicacion empaquetada.
      library: libraryStatus(),
      // Lo mismo para los ajustes: un fallo al guardar las fuentes desactivadas
      // se veria como "cambie el ajuste y volvio solo al reiniciar".
      settings: settingsStatus()
    });
  });
  app.post("/api/log", (req, res) => {
    const { scope, message, detail } = req.body ?? {};
    if (typeof message === "string" && message.trim()) {
      const ambito = typeof scope === "string" && scope.trim() ? scope.trim() : "cliente";
      logEvent(ambito, message.slice(0, 500), typeof detail === "string" ? detail.slice(0, 500) : void 0);
    }
    res.json({ ok: true });
  });
  app.get("/api/sources", (_req, res) => {
    res.json({ sources: sourceMeta(), allowlist: PROXY_ALLOWLIST });
  });
  app.post("/api/sources/config", (req, res) => {
    const { id, enabled } = req.body ?? {};
    if (typeof id !== "string" || !getSource(id)) {
      res.status(400).json({ error: `fuente desconocida: ${String(id)}` });
      return;
    }
    if (typeof enabled !== "boolean") {
      res.status(400).json({ error: "enabled tiene que ser un booleano" });
      return;
    }
    if (!enabled && isSourceEnabled(id) && activeSources().length === 1) {
      res.status(409).json({ error: "tiene que quedar al menos una fuente activa" });
      return;
    }
    setSourceEnabled(id, enabled);
    cacheClear();
    logEvent("ajustes", `${enabled ? "activada" : "desactivada"} la fuente ${id}`);
    res.json({ sources: sourceMeta() });
  });
  app.get("/api/stats", (_req, res) => {
    res.json({ ...cacheStats(), browser: isBrowserRunning() });
  });
  app.post("/api/cache/clear", (_req, res) => {
    cacheClear();
    res.json({ ok: true });
  });
  app.post("/api/shutdown", async (_req, res) => {
    res.json({ ok: true, stopping: true });
    setTimeout(() => void shutdown("api"), 120);
  });
  app.get("/api/search", async (req, res) => {
    const query = typeof req.query.q === "string" ? req.query.q : "";
    if (!query.trim()) {
      res.json({ query: "", results: [], bySource: {}, totalMs: 0 });
      return;
    }
    try {
      res.json(await searchAll(query));
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
  app.get("/api/home", async (_req, res) => {
    try {
      res.json(await homeAll());
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
  app.get("/api/genres", (_req, res) => {
    res.json({ genres: GENRES });
  });
  app.get("/api/genre", async (req, res) => {
    const genero = findGenre(typeof req.query.g === "string" ? req.query.g : "");
    if (!genero) {
      res.status(400).json({ error: "genero desconocido" });
      return;
    }
    const kindRaw = typeof req.query.kind === "string" ? req.query.kind : "";
    const kind = kindRaw === "movie" || kindRaw === "series" || kindRaw === "anime" ? kindRaw : null;
    try {
      res.json(await genreAll(genero, kind));
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
  app.get("/api/library", (_req, res) => {
    res.json(readLibrary());
  });
  app.post("/api/library/history", (req, res) => {
    const entry = sanitize(req.body);
    if (!entry) {
      res.status(400).json({ error: "guardado invalido" });
      return;
    }
    res.json({ history: recordHistory(entry) });
  });
  app.delete("/api/library/history", (req, res) => {
    const key = typeof req.query.key === "string" ? req.query.key : null;
    res.json({ history: forgetHistory(key) });
  });
  app.post("/api/library/favorites", (req, res) => {
    const entry = sanitize(req.body);
    if (!entry) {
      res.status(400).json({ error: "guardado invalido" });
      return;
    }
    const { favorited, favorites } = toggleFavorite(entry);
    res.json({ favorited, favorites });
  });
  function capituloDe(req) {
    const season = req.query.season;
    const episode = req.query.episode;
    if (season === void 0 && episode === void 0) return null;
    const s = Number(season);
    const e = Number(episode);
    if (!Number.isInteger(s) || !Number.isInteger(e) || s < 0 || e < 0) {
      throw new HttpError("season y episode tienen que ser numeros enteros", 400);
    }
    return { season: s, episode: e };
  }
  app.get("/api/title/:source/:id(*)", async (req, res) => {
    const params = req.params;
    const source = params.source;
    const id = Array.isArray(params.id) ? params.id.join("/") : String(params.id ?? "");
    if (!getSource(source)) {
      res.status(404).json({ error: `fuente desconocida: ${source}` });
      return;
    }
    if (!id) {
      res.status(400).json({ error: "falta el identificador del titulo" });
      return;
    }
    const trace = [];
    try {
      const prefer = typeof req.query.prefer === "string" ? req.query.prefer : null;
      const result = await resolveTitle(source, id, {
        pos: capituloDe(req),
        preferServer: prefer,
        onTrace: (m) => trace.push(m)
      });
      if (!result) {
        res.status(404).json({ error: "no se pudo resolver el titulo", trace });
        return;
      }
      res.json({ ...result, trace });
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      const motivo = err instanceof Error ? err.message : String(err);
      if (status >= 400 && status < 500) trace.push(motivo);
      res.status(status).json({
        error: err instanceof Error ? err.message : String(err),
        trace
      });
    }
  });
  app.post("/api/resolve", async (req, res) => {
    const { embedUrl, referer, serverLabel } = req.body;
    if (!embedUrl || !/^https?:\/\//i.test(embedUrl)) {
      res.status(400).json({ error: "falta embedUrl valido" });
      return;
    }
    const trace = [];
    try {
      const stream = await resolveStream(embedUrl, {
        referer,
        serverLabel: serverLabel ?? null,
        onTrace: (m) => trace.push(m)
      });
      res.json({ stream, trace });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
        trace
      });
    }
  });
  app.get("/api/img", imageProxy);
  app.get("/api/hls", hlsProxy);
  if (fs.existsSync(PATHS.webDist)) {
    app.use(express.static(PATHS.webDist, { index: false, maxAge: "1h" }));
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(path6.join(PATHS.webDist, "index.html"));
    });
  }
  return app;
}
var shuttingDown = false;
async function shutdown(reason = "signal") {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[miso] apagando (${reason})`);
  await closeBrowser();
  process.exit(0);
}
var isDirectRun = process.argv[1] && import.meta.url.endsWith(path6.basename(process.argv[1]));
if (isDirectRun) {
  const app = createServer();
  const host = process.env.MISO_HOST || "0.0.0.0";
  const server = app.listen(SERVER_PORT, host, () => {
    const escucha = server.address();
    const elegido = typeof escucha === "object" && escucha ? escucha.port : SERVER_PORT;
    console.log(`[miso] servidor escuchando en http://${host}:${elegido}`);
    console.log(`[miso] fuentes: ${SOURCES.map((s) => s.meta.id).join(", ")}`);
    console.log(`[miso] web compilada: ${fs.existsSync(PATHS.webDist) ? "si" : "no (modo dev)"}`);
  });
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `[miso] el puerto ${SERVER_PORT} ya esta ocupado. Otro Miso sigue abierto, o usa MISO_PORT para cambiar el puerto.`
      );
      process.exit(2);
    }
    console.error("[miso] error del servidor:", err);
    process.exit(1);
  });
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}
export {
  createServer,
  shutdown
};
