import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';

/**
 * Proceso principal de Miso.
 *
 * Responsabilidad unica: mantener vivo el servidor Node que vive al lado y
 * comunicarle su estado a la ventana. No sabe nada de peliculas, de fuentes ni
 * de extraccion; de eso se ocupa el servidor. Esta separacion es deliberada:
 * cuando la extraccion falle, el proceso principal seguira siendo trivial de
 * razonar.
 */

// ---------------------------------------------------------------- constantes

/** Puerto preferido. Si esta ocupado buscamos otro: dos Miso pueden convivir. */
const PREFERRED_PORT = 7345;

// El proceso principal se empaqueta a CommonJS, asi que `__dirname` es lo
// correcto. Con `import.meta.url` el bundle no llegaria ni a arrancar.
const HERE = __dirname;
const SERVER_BUNDLE = path.join(HERE, '..', 'server.mjs');

/** Origen de la interfaz. La sirve el propio servidor, asi que solo existe si esta en marcha. */
const ORIGEN = 'http://127.0.0.1:';

/**
 * URL de la aplicacion.
 *
 * No se escribe fija porque el puerto puede no ser el preferido: si esta
 * ocupado se busca otro, y dos Miso conviviendo es un caso previsto, no una
 * excepcion. Con la URL clavada, la segunda instancia abria la primera y creeria
 * que su servidor habia arrancado.
 */
function urlApp(puerto: number | null = status.port ?? PREFERRED_PORT): string {
  return `${ORIGEN}${puerto}/`;
}

/**
 * Pantalla de arranque, leida del disco.
 *
 * Existe porque la aplicacion se sirve desde su propio servidor: con el servidor
 * apagado, la URL de la aplicacion no carga y la ventana se queda en la pagina
 * de error de Chromium, sin ningun boton. El boton de "Iniciar servidor" tiene
 * que vivir en una pagina que se pueda leer sin servidor, y esa pagina no puede
 * ser la aplicacion.
 */
const ARRANQUE = path.join(HERE, 'arranque.html');

// -------------------------------------------------------------------- estado

type State = 'apagado' | 'arrancando' | 'en-funcionamiento' | 'deteniendo' | 'error';

interface Status {
  state: State;
  port: number | null;
  pid: number | null;
  message: string | null;
}

let status: Status = {
  state: 'apagado',
  port: null,
  pid: null,
  message: null,
};

let child: ChildProcess | null = null;

/**
 * La app esta cerrando y el servidor se para por el camino normal.
 *
 * Se consulta al decidir que pantalla mostrar: durante el cierre el estado pasa
 * por 'apagado', y sin esta marca la ventana saltaria a la pantalla de arranque
 * justo cuando ya no queda nada que arrancar.
 */
let quitting = false;
let win: BrowserWindow | null = null;

// ------------------------------------------------------------------ utilidad

function publish(patch: Partial<Status> = {}): Status {
  status = { ...status, ...patch };

  const snapshot: Status = { ...status };

  if (win && !win.isDestroyed()) {
    win.webContents.send('server:status', snapshot);

    // La ventana va a donde toque segun el estado, no segun el ultimo clic.
    //
    // Al arrancar se pasa de la pantalla de arranque a la aplicacion. Se decide
    // aqui y no en el boton porque el arranque tambien puede venir de un
    // temporizador, y porque si el puerto ocupado hizo que el servidor acabara
    // en otro, la URL correcta solo se sabe al ver el estado.
    //
    // Al apagarse se vuelve a la pantalla de arranque. Sin esto la ventana se
    // queda en una aplicacion que no puede hacer nada: todas sus peticiones van
    // al puerto que ya no escucha, no hay error visible y el unico boton de
    // "Iniciar servidor" esta en la pantalla a la que ya no se puede llegar.
    const donde = win.webContents.getURL();
    if (status.state === 'en-funcionamiento' && donde.startsWith('file://')) {
      void win.loadURL(urlApp());
    } else if (status.state === 'apagado' && !quitting && donde.startsWith(ORIGEN)) {
      void win.loadFile(ARRANQUE);
    }
  }
  return snapshot;
}

/** Un puerto esta libre si nadie acepta conexiones en el. */
function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
  });
}

/**
 * Mata el proceso y TODOS sus descendientes.
 *
 * No es opcional. Playwright lanza Chromium como hijo del servidor; si matamos
 * solo al padre, los navegadores headless se quedan huerfanos consumiendo
 * cientos de megabytes entre uno y otro y la maquina se arrastra. El hijo se
 * arranca como líder de grupo, asi que un signo menos mata al arbol entero.
 */
function killTree(proc: ChildProcess): void {
  const pid = proc.pid;
  if (!pid) return;

  if (process.platform === 'win32') {
    // En Windows no hay grupos de proceso: hay que pedirlo explicitamente.
    spawnTaskkill(pid);
    return;
  }

  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      proc.kill('SIGTERM');
    } catch {
      /* ya estaba muerto */
    }
  }

  // Si el arbol no cede, no insistimos para siempre: forzamos a los 4 s.
  setTimeout(() => {
    if (proc.exitCode === null && proc.signalCode === null) {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        /* ya estaba muerto */
      }
    }
  }, 4000).unref();
}

function spawnTaskkill(pid: number): void {
  spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }).unref();
}

// ------------------------------------------------------------ ciclo de vida

async function startServer(): Promise<Status> {
  if (child && child.exitCode === null && child.signalCode === null) {
    return status;
  }

  const port = (await portFree(PREFERRED_PORT)) ? PREFERRED_PORT : 0;
  if (port === 0) {
    publish({
      state: 'arrancando',
      message: `El puerto ${PREFERRED_PORT} ya esta ocupado; se usara otro.`,
    });
  }

  publish({ state: 'arrancando', port, message: null, pid: null });

  // `spawn` y no `fork`. Electron corre sobre Node, pero `fork` ahi exige un
  // canal `ipc` en `stdio` (ERR_CHILD_PROCESS_IPC_REQUIRED) y sin el el proceso
  // no llega ni a crearse. Ese canal no hacia falta para nada: el servidor avisa
  // de su puerto por la salida estandar y atiende SIGTERM, y no le manda nada al
  // padre. Pedir un canal que no se usa, para que el arranque dependa de
  // acordarse de escribirlo, no tiene ninguna ventaja.
  child = spawn(process.execPath, [SERVER_BUNDLE], {
    // Sin terminal. Se reusa este mismo binario de Electron como Node, de modo
    // que no hace falta instalar Node en el equipo del usuario, y como Electron
    // es un ejecutable de subsistema grafico no aparece ninguna ventana de
    // consola detras.
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      MISO_PORT: String(port),
      MISO_DESKTOP: '1',
    },
    // `detached` crea un grupo de proceso propio: es lo que permite despues
    // matar a Chromium y a sus hijos con una sola llamada.
    detached: process.platform !== 'win32',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const proc = child;
  let settled = false;

  proc.stdout?.on('data', (buf: Buffer) => {
    for (const line of buf.toString('utf8').split('\n')) {
      const m = /servidor escuchando en .*:(\d+)/.exec(line);
      if (m) publish({ port: Number(m[1]) });
    }
  });

  proc.stderr?.on('data', (buf: Buffer) => {
    process.stderr.write(`[servidor] ${buf.toString('utf8')}`);
  });

  proc.once('exit', (code, signal) => {
    if (child !== proc) return; // una parada nuestra, ya cubierto
    child = null;
    if (settled) return;
    settled = true;

    // Si nos morimos nosotros mismos, el estado ya es 'deteniendo' y no hay
    // nada que avisar. Si nos caemos solos, es un fallo y hay que decirlo.
    if (status.state !== 'deteniendo') {
      publish({
        state: 'error',
        pid: null,
        message: `El servidor se detuvo solo (codigo ${code ?? signal ?? 'desconocido'}).`,
      });
    } else {
      publish({ state: 'apagado', pid: null, port: null });
    }
  });

  await new Promise<void>((resolve) => {
    proc.once('spawn', () => resolve());
    proc.once('error', (err) => {
      settled = true;
      publish({ state: 'error', message: `No se pudo arrancar el servidor: ${err.message}` });
      resolve();
    });
  });

  if (child === proc && proc.pid) {
    settled = true;
    // Crear el proceso y que el servidor responde son dos cosas distintas, y la
    // diferencia se ve. Con solo el `spawn` ya se declaraba "en marcha" y la
    // ventana se lanzaba a cargar la aplicacion contra un puerto donde todavia no
    // contestaba nadie: Chromium responderia con su pagina de error y la
    // pantalla de arranque desapareceria. Se espera a que el servidor acepte una
    // peticion de verdad.
    const listening = await esperarAtender(proc);

    if (child !== proc) return status; // nos pararon mientras esperabamos

    if (listening) {
      publish({ state: 'en-funcionamiento', pid: proc.pid, message: null });
    } else {
      publish({
        state: 'error',
        pid: null,
        message: 'El servidor arranco pero no responde.',
      });
    }
  }

  return status;
}

/**
 * Espera a que el servidor conteste de verdad.
 *
 * No basta con que el proceso exista: durante un instante, o para siempre si
 * algo va mal, hay un proceso vivo que no escucha en ningun puerto. Preguntar es
 * la unica prueba, y pregunta la misma ruta que usa la interfaz.
 */
function esperarAtender(proc: ChildProcess, limiteMs = 25_000): Promise<boolean> {
  return new Promise((resolve) => {
    const hasta = Date.now() + limiteMs;

    const intentar = async () => {
      if (Date.now() > hasta) {
        clearInterval(temporizador);
        resolve(false);
        return;
      }
      // Si el proceso ya no es el nuestro, alguien lo paro: no hay nada que
      // esperar y el que paro avisa del estado.
      if (child !== proc) {
        clearInterval(temporizador);
        resolve(false);
        return;
      }
      // El puerto real lo anuncia el servidor por la salida estandar. Si eligio
      // uno libre por su cuenta todavia no lo sabemos.
      const puerto = status.port;
      if (puerto) {
        try {
          const r = await fetch(`http://127.0.0.1:${puerto}/api/health`, {
            signal: AbortSignal.timeout(1_500),
          });
          if (r.ok) {
            clearInterval(temporizador);
            resolve(true);
            return;
          }
        } catch {
          /* todavia no escucha */
        }
      }
    };

    const temporizador = setInterval(() => void intentar(), 150);
    temporizador.unref?.();
  });
}

async function stopServer(): Promise<Status> {
  const proc = child;
  if (!proc) return publish({ state: 'apagado', pid: null, port: null });

  publish({ state: 'deteniendo' });

  // Avisamos por HTTP para que cierre el navegador antes de morir. Si ya no
  // responde, no pasa nada: el corte de la seccion siguiente lo recoge igual.
  if (status.port) {
    await fetch(`http://127.0.0.1:${status.port}/api/shutdown`, { method: 'POST' })
      .catch(() => undefined);
  }

  killTree(proc);
  return publish({ state: 'apagado', pid: null, port: null });
}

// ---------------------------------------------------------------- ventana

/** Que pantalla toca. Lo decide si el servidor responde, no el ultimo clic. */
function abrirPantalla(): void {
  if (!win || win.isDestroyed()) return;
  if (status.state === 'en-funcionamiento') {
    void win.loadURL(urlApp());
  } else {
    void win.loadFile(ARRANQUE);
  }
}

function createWindow(): void {
  // Icono de ventana. Empaquetado lo pone electron-builder desde `build/icon.*`;
  // en desarrollo se lee del repositorio. Si no esta, se deja el de Electron.
  const winIcon = path.join(app.getAppPath(), 'build', 'icon.png');
  win = new BrowserWindow({
    icon: existsSync(winIcon) ? winIcon : undefined,
    width: 1180,
    height: 820,
    minWidth: 720,
    minHeight: 560,
    // El fondo del color de la aplicacion: sin esto, el primer fotograma es
    // blanco y parpadea en cada arranque.
    backgroundColor: '#08080a',
    show: false,
    autoHideMenuBar: true,
    title: 'Miso',
    webPreferences: {
      preload: path.join(HERE, 'preload.cjs'),
      // La interfaz no es contenido de terceros: no necesita Node ni acceso a
      // ficheros, y dejarlo abierto no compra nada.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win?.show());

  // Los enlaces externos se abren en el navegador del sistema, nunca dentro de
  // la ventana: nadie quiere que la aplicacion navegue a un sitio de streaming.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    const own = win?.webContents.getURL();
    if (url !== own) {
      e.preventDefault();
      void shell.openExternal(url);
    }
  });

  win.on('closed', () => {
    win = null;
  });

  // El servidor puede caerse mientras la ventana esta puesta: el boton de la
  // barra inferior lo detiene a voluntad. En ese caso la aplicacion deja de
  // responder y Chromium pondria su pagina de error en lugar de la pantalla de
  // arranque.
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    // -3 es ERR_ABORTED: una navegacion que se cancela a proposito, no un fallo.
    if (code === -3) return;
    if (url && !url.startsWith(ORIGEN)) return;
    void win?.loadFile(ARRANQUE);
    void desc;
  });

  // En desarrollo cargamos el servidor de Vite; empaquetado, el servidor lo
  // sirve desde su propia carpeta publica.
  const devUrl = process.env.MISO_DEV_URL;
  if (devUrl) void win.loadURL(devUrl);
  else void abrirPantalla();
}

// -------------------------------------------------------------------- ipc

ipcMain.handle('server:start', (): Promise<Status> => startServer());
ipcMain.handle('server:stop', (): Promise<Status> => stopServer());
ipcMain.handle('server:status', (): Status => status);

ipcMain.handle('app:versions', () => ({
  app: app.getVersion(),
  electron: process.versions.electron ?? '',
  chrome: process.versions.chrome ?? '',
  node: process.versions.node,
}));

// ------------------------------------------------------------------ arranque

// Una sola instancia: abrir dos veces la segunda-instance se limita a focuses la
// ventana existente, con dos navegadores headless compitiendo por la CPU.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  void app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

/**
 * Cerrar la app detiene el servidor. Sin esto, el proceso Node y su Chromium
 * seguirian en marcha sin ventana que los controle, y el usuario no tendria
 * forma de apagarlos.
 */
app.on('before-quit', (e) => {
  if (quitting) return;
  e.preventDefault();
  quitting = true;
  void stopServer().finally(() => {
    child = null;
    app.exit(0);
  });
});

app.on('window-all-closed', () => {
  void stopServer().finally(() => app.exit(0));
});

process.on('uncaughtException', (err) => {
  process.stderr.write(`[principal] ${err.stack ?? String(err)}\n`);
});
