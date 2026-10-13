import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { SERVER_PORT, PATHS, PROXY_ALLOWLIST } from './config.js';
import { SOURCES, sourceMeta, getSource } from './sources/index.js';
import { searchAll } from './search.js';
import { homeAll } from './home.js';
import { GENRES, findGenre } from './genres.js';
import { genreAll } from './genre.js';
import { resolveTitle, resolveStream, closeBrowser, isBrowserRunning } from './extract/index.js';
import { imageProxy } from './proxy/image.js';
import { hlsProxy } from './proxy/hls.js';
import { cacheClear, cacheStats } from './cache.js';
import { readLibrary, recordHistory, forgetHistory, toggleFavorite, sanitize } from './store.js';
import { HttpError } from './http.js';
import type { EpisodeRef } from './sources/types.js';

export function createServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));

  // ------------------------------------------------------------------
  // Salud y ciclo de vida
  // ------------------------------------------------------------------

  /**
   * La ventana de Electron sondea este endpoint. Es lo que le permite
   * distinguir "arrancando" de "caido" y ofrecer reiniciar.
   */
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      pid: process.pid,
      uptimeSec: Math.floor(process.uptime()),
      browser: isBrowserRunning(),
      memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    });
  });

  app.get('/api/sources', (_req, res) => {
    res.json({ sources: sourceMeta(), allowlist: PROXY_ALLOWLIST });
  });

  app.get('/api/stats', (_req, res) => {
    res.json({ ...cacheStats(), browser: isBrowserRunning() });
  });

  app.post('/api/cache/clear', (_req, res) => {
    cacheClear();
    res.json({ ok: true });
  });

  /**
   * Apagado ordenado (cierre de la app o boton de la barra inferior).
   */
  app.post('/api/shutdown', async (_req, res) => {
    res.json({ ok: true, stopping: true });
    // Respondemos antes de morir, o el cliente veria un error de red.
    setTimeout(() => void shutdown('api'), 120);
  });

  // ------------------------------------------------------------------
  // Busqueda
  // ------------------------------------------------------------------

  app.get('/api/search', async (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    if (!query.trim()) {
      res.json({ query: '', results: [], bySource: {}, totalMs: 0 });
      return;
    }
    try {
      res.json(await searchAll(query));
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /**
   * Lo mas nuevo de cada fuente, para la pantalla de inicio.
   *
   * La respuesta tiene la misma forma que una busqueda, con el campo `query` a
   * vacio. No es por compatibilidad, es por una razon concreta: asi el cliente
   * reutiliza la agrupacion, el recuento y el aviso de fuentes caidas, en vez de
   * tener dos caminos para pintar lo mismo.
   *
   * No devuelve 500 si una fuente falla. `homeAll` ya convierte cada fallo en un
   * estado por fuente, igual que hace la busqueda: la pantalla de inicio tiene
   * que aparecer aunque una de las dos fuentes este caida, que es justo cuando mas
   * hace falta.
   */
  app.get('/api/home', async (_req, res) => {
    try {
      res.json(await homeAll());
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ------------------------------------------------------------------
  // Generos
  // ------------------------------------------------------------------

  /** El catalogo cerrado que ofrece la interfaz. No depende de ninguna fuente. */
  app.get('/api/genres', (_req, res) => {
    res.json({ genres: GENRES });
  });

  /**
   * Un genero, federado.
   *
   * `g` es el nombre o el slug de una entrada del catalogo y `kind` filtra por
   * tipo. Un genero que no esta en el catalogo es un 400 y no una busqueda a
   * ciegas: el conjunto de generos lo decide la aplicacion, no quien pregunta.
   */
  app.get('/api/genre', async (req, res) => {
    const genero = findGenre(typeof req.query.g === 'string' ? req.query.g : '');
    if (!genero) {
      res.status(400).json({ error: 'genero desconocido' });
      return;
    }
    const kindRaw = typeof req.query.kind === 'string' ? req.query.kind : '';
    const kind =
      kindRaw === 'movie' || kindRaw === 'series' || kindRaw === 'anime' ? kindRaw : null;

    try {
      res.json(await genreAll(genero, kind));
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ------------------------------------------------------------------
  // Biblioteca: historial y favoritos
  // ------------------------------------------------------------------

  app.get('/api/library', (_req, res) => {
    res.json(readLibrary());
  });

  /** Anota un titulo visto. Es idempotente por `key`: repetir lo sube al frente. */
  app.post('/api/library/history', (req, res) => {
    const entry = sanitize(req.body);
    if (!entry) {
      res.status(400).json({ error: 'guardado invalido' });
      return;
    }
    res.json({ history: recordHistory(entry) });
  });

  /**
   * Olvida un titulo (`?key=`) o vacia el historial entero (sin `key`).
   */
  app.delete('/api/library/history', (req, res) => {
    const key = typeof req.query.key === 'string' ? req.query.key : null;
    res.json({ history: forgetHistory(key) });
  });

  /** Marca o desmarca un favorito. Devuelve el estado resultante. */
  app.post('/api/library/favorites', (req, res) => {
    const entry = sanitize(req.body);
    if (!entry) {
      res.status(400).json({ error: 'guardado invalido' });
      return;
    }
    const { favorited, favorites } = toggleFavorite(entry);
    res.json({ favorited, favorites });
  });

  // ------------------------------------------------------------------
  // Detalle y reproduccion
  // ------------------------------------------------------------------

  /**
   * Capitulo pedido en la URL.
   *
   * Se leen los dos o ninguno: un `?season=3` sin `?episode=` no significa "el
   * primero de la temporada 3" sino una peticion incompleta, y contestarle con un
   * capitulo cualquiera seria inventarse la parte que falta. Si solo llega uno de
   * los dos, no hay capitulo.
   *
   * El rango lo valida el extractor contra lo que la fuente declara de verdad.
   * Aqui solo se comprueba que sean enteros: un `?season=abc` tiene que ser un
   * error de peticion y no un 404 de la fuente, que seria un diagnostico
   * desconcertante.
   */
  function capituloDe(req: { query: Record<string, unknown> }): EpisodeRef | null {
    const season = req.query.season;
    const episode = req.query.episode;

    if (season === undefined && episode === undefined) return null;

    const s = Number(season);
    const e = Number(episode);
    if (!Number.isInteger(s) || !Number.isInteger(e) || s < 0 || e < 0) {
      throw new HttpError('season y episode tienen que ser numeros enteros', 400);
    }
    return { season: s, episode: e };
  }

  app.get('/api/title/:source/:id(*)', async (req, res) => {
    // Los tipos de Express 5 no conocen el comodin `:id(*)`, asi que el
    // parametro llega como `unknown`. Los identificadores de estas fuentes
    // contienen barras ("pelicula/el-corazon-de-la-bestia-1263337"), asi que
    // hay que unir los segmentos en lugar de leer solo el primero.
    const params = req.params as unknown as { source: string; id: string | string[] };
    const source = params.source;
    const id = Array.isArray(params.id) ? params.id.join('/') : String(params.id ?? '');

    if (!getSource(source)) {
      res.status(404).json({ error: `fuente desconocida: ${source}` });
      return;
    }
    if (!id) {
      res.status(400).json({ error: 'falta el identificador del titulo' });
      return;
    }

    const trace: string[] = [];
    try {
      const result = await resolveTitle(source, id, {
        pos: capituloDe(req as unknown as { query: Record<string, unknown> }),
        onTrace: (m) => trace.push(m),
      });

      if (!result) {
        res.status(404).json({ error: 'no se pudo resolver el titulo', trace });
        return;
      }

      res.json({ ...result, trace });
    } catch (err) {
      // Un capitulo mal formado es un error de quien pregunta, no de la fuente:
      // se contesta 400 y no 500, para que la interfaz pueda decir "esto no es un
      // capitulo" en vez de "el titulo no se pudo resolver".
      const status = err instanceof HttpError ? err.status : 500;
      const motivo = err instanceof Error ? err.message : String(err);
      if (status >= 400 && status < 500) trace.push(motivo);
      res.status(status).json({
        error: err instanceof Error ? err.message : String(err),
        trace,
      });
    }
  });

  /**
   * Resuelve un embed concreto hasta un stream. Se usa para el selector de
   * servidores: el usuario elige otro servidor y pedimos solo ese.
   */
  app.post('/api/resolve', async (req, res) => {
    const { embedUrl, referer, serverLabel } = req.body as {
      embedUrl?: string;
      referer?: string;
      serverLabel?: string | null;
    };

    if (!embedUrl || !/^https?:\/\//i.test(embedUrl)) {
      res.status(400).json({ error: 'falta embedUrl valido' });
      return;
    }

    const trace: string[] = [];
    try {
      const stream = await resolveStream(embedUrl, {
        referer,
        serverLabel: serverLabel ?? null,
        onTrace: (m) => trace.push(m),
      });
      res.json({ stream, trace });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
        trace,
      });
    }
  });

  // ------------------------------------------------------------------
  // Proxies
  // ------------------------------------------------------------------

  app.get('/api/img', imageProxy);
  app.get('/api/hls', hlsProxy);

  // ------------------------------------------------------------------
  // Front compilado (produccion). En desarrollo lo sirve Vite.
  // ------------------------------------------------------------------

  if (fs.existsSync(PATHS.webDist)) {
    app.use(express.static(PATHS.webDist, { index: false, maxAge: '1h' }));
    // Fallback de SPA: cualquier ruta no-API devuelve el index.
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(path.join(PATHS.webDist, 'index.html'));
    });
  }

  return app;
}

let shuttingDown = false;

export async function shutdown(reason = 'signal'): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[miso] apagando (${reason})`);

  // Cerramos el navegador headless antes de salir: es un proceso hijo y si
  // cuelga mantiene vivo al servidor.
  await closeBrowser();

  process.exit(0);
}

// ---------------------------------------------------------- arranque --

const isDirectRun = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));

if (isDirectRun) {
  const app = createServer();

  // Escuchamos en todas las interfaces para que el movil de la misma red
  // pueda conectarse. El bind por defecto en Manylinux/WSL y otros es 127.0.0.1.
  const host = process.env.MISO_HOST || '0.0.0.0';
  const server = app.listen(SERVER_PORT, host, () => {
    // Se anuncia el puerto REAL, no el que se pidio. Cuando el puerto pedido es 0
    // —que es lo que hace la aplicacion si el suyo esta ocupado, para que dos
    // Miso puedan convivir— el sistema elige otro y lo unico que dice de el es
    // `address()`. Anunciar el 0 hacia que Electron creyera que el servidor no
    // habia arrancado, esperara a un puerto que no existe y acabaria diciendo que
    // no responde cuando si estaba sirviendo.
    const escucha = server.address();
    const elegido = typeof escucha === 'object' && escucha ? escucha.port : SERVER_PORT;

    console.log(`[miso] servidor escuchando en http://${host}:${elegido}`);
    console.log(`[miso] fuentes: ${SOURCES.map((s) => s.meta.id).join(', ')}`);
    console.log(`[miso] web compilada: ${fs.existsSync(PATHS.webDist) ? 'si' : 'no (modo dev)'}`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `[miso] el puerto ${SERVER_PORT} ya esta ocupado. ` +
          `Otro Miso sigue abierto, o usa MISO_PORT para cambiar el puerto.`,
      );
      process.exit(2);
    }
    console.error('[miso] error del servidor:', err);
    process.exit(1);
  });

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}