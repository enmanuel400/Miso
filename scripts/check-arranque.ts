/**
 * Comprobacion del arranque de la aplicacion de escritorio.
 *
 * Cubre la cadena que une la ventana con el proceso del servidor, y que no se
 * puede probar desde el navegador ni desde el servidor: hay un proceso principal
 * de Electron, un proceso Node hijo y una ventana que va de una pagina a otra.
 *
 * No es un capricho. Los fallos mas caros que ha tenido Miso estaban aqui y no
 * los veia nadie:
 *
 *  - la interfaz la sirve el propio servidor, asi que con el servidor apagado la
 *    URL de la ventana no carga. No habia ninguna pagina de arranque y la ventana
 *    se quedaba en el error de Chromium, sin ningun boton. El boton de "Iniciar
 *    servidor" existia en el codigo y era inalcanzable.
 *  - el servidor se creaba con `fork`, que dentro de Electron exige un canal
 *    `ipc` en `stdio`. No lo llevaba, asi que el proceso no se creaba y el
 *    arranque fallaba siempre, aunque el boton funcionase.
 *  - se declaraba el servidor "en marcha" en cuanto existia el proceso, y la
 *    ventana cargaba la aplicacion contra un puerto donde aun no contestaba
 *    nadie.
 *  - con el puerto ocupado, el servidor anunciaba el 0 en vez del que le habian
 *    dado. La segunda instancia se quedaba esperando un puerto que no existe y
 *    acababa diciendo que no arranca.
 *
 * Se conduce por el puerto de depuracion de Chromium, que es la unica forma de
 * mirar dentro de una ventana de Electron sin dejar un banco de pruebas en el
 * codigo de la aplicacion.
 *
 * El ciclo se repite con el puerto ocupado a proposito: "dos Miso pueden
 * convivir" estaba escrito en el codigo, nadie lo probaba, y no funcionaba.
 *
 * Si la maquina no tiene pantalla, no se puede abrir una ventana y la
 * comprobacion se salta sin suspender el dia. En un servidor sin nombre no hay
 * nada que demostrar.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

/**
 * Raiz del proyecto: el directorio desde el que se ejecuta el script.
 *
 * No se saca de `import.meta.url` a proposito. Este fichero se empaqueta en
 * `dist/tools/`, con lo que su propia ruta esta dos niveles por debajo de la
 * raiz y subir desde ella lleva a `dist`, no al proyecto.
 */
const RAIZ = process.cwd();
if (!existsSync(join(RAIZ, 'package.json'))) {
  console.log('  (omitida: hay que ejecutarla desde la raiz del proyecto)');
  process.exit(0);
}

const PUERTO_APP = 7345;

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let fallos = 0;

function comprobar(ok: boolean, msg: string, detalle = ''): void {
  console.log(`  ${ok ? 'ok  ' : 'MAL '} ${msg}${detalle ? `  ${detalle}` : ''}`);
  if (!ok) fallos++;
}

/**
 * El binario de Electron de este proyecto, en vez de `npx electron`.
 *
 * `npx` anade una capa que hay que resolver antes de que Electron llegue a
 * arrancar: en esta maquina llega a tardar mas de un segundo, y si el
 * arbol de `node_modules` esta a medio instalar `npx` incluso intenta bajarse una
 * version de Electron de la red, que es justo lo que no se quiere en una
 * comprobacion de arranque. Con la ruta directa no hay nada que resolver.
 *
 * Se recorre `electron/dist/electron` y no el `.bin`: el `.bin` es un symlink a
 * un script de shell, que en Windows no existe.
 */
function binarioElectron(): string {
  return join(RAIZ, 'node_modules', 'electron', 'dist', 'electron');
}

/**
 * Deja la maquina limpia: ni Miso abierto ni servidores sueltos.
 *
 * El servidor de Miso lo lanza el binario de Electron con `ELECTRON_RUN_AS_NODE`,
 * asi que su linea de ordenes NO es `node dist/server.mjs` sino
 * `.../electron/dist/electron .../dist/server.mjs`. Un pkill escrito para la
 * primera no toca la segunda, y la comprobacion se dejaba servidores por detras
 * que contestaban en el puerto de la siguiente.
 *
 * El patron va entre corchetes porque escrito tal cual aparece dentro de la
 * propia linea de ordenes del shell que ejecuta pkill, que se mata a si mismo.
 */
function pkill(patron: string): Promise<void> {
  return new Promise((r) => {
    const p = spawn('pkill', ['-f', patron], { stdio: 'ignore' });
    p.on('exit', () => r());
  });
}

/**
 * Reserva un puerto libre y lo devuelve.
 *
 * El puerto de depuracion no puede ser uno fijo. Cuando Miso se acaba de cerrar,
 * el puerto de DevTools tarda un momento en soltar la escucha, y el proceso
 * arranca antes: Chromium dice "bind() failed: la direccion ya se esta usando",
 * no abre ninguna ventana de depuracion y la comprobacion se despista creyendo
 * que Electron no arranca. Paso de verdad: la segunda pasada del script se
 * comio ese error y culpo a la aplicacion.
 *
 * Se pide al sistema y se suelta enseguida. Hay una ventana minima en la que
 * otro proceso podria cogerlo; es aceptable para una comprobacion y preferible a
 * depender de que un puerto concreto este libre cada vez.
 */
async function puertoLibre(): Promise<number> {
  return new Promise((resolver, rechazar) => {
    const s = createServer();
    s.on('error', rechazar);
    s.listen(0, '127.0.0.1', () => {
      const dir = s.address();
      const puerto = typeof dir === 'object' && dir ? dir.port : 0;
      s.close(() => (puerto ? resolver(puerto) : rechazar(new Error('no se pudo reservar puerto'))));
    });
  });
}

/**
 * Deja la maquina limpia y SE ASEGURA de que lo esta.
 *
 * La espera fija de 700 ms servia casi siempre. Cuando no: Electron tarda mas en
 * soltar la escucha del puerto de DevTools y el proceso siguiente encuentra la
 * direccion ocupada, no abre ninguna ventana de depuracion y el script se despista
 * creyendo que la aplicacion no arranca. Es un fallo del entorno disfrazado de
 * fallo de la aplicacion, que es la peor forma de fallo posible en una
 * comprobacion de arranque.
 *
 * Por eso se espera a que no quede ningun proceso nuestro, no a que pase un
 * tiempo. Si en tres segundos no han muerto todos, se dice, en vez de seguir
 * como si nada.
 */
async function limpiar(): Promise<void> {
  await pkill('[e]lectron/dist/electron');
  await pkill('^node dist/server.mjs');

  for (let intento = 0; intento < 12; intento++) {
    await dormir(400);
    const quedan = await contarPropios();
    if (quedan === 0) return;
  }

  const quedan = await contarPropios();
  if (quedan > 0) {
    console.log(`  (aviso: quedan ${quedan} proceso(s) de Miso vivos tras la limpieza)`);
  }
}

/**
 * Cuantos procesos de Electron o del servidor de Miso siguen vivos.
 *
 * Los dos patrones van entre corchetes, y los dos, no solo el primero. Es lo que
 * evita que se cuente a si mismo: el patron aparece escrito dentro de la propia
 * linea de ordenes del proceso que lanza la busqueda, y sin los corchetes ese
 * proceso cuenta como propio y el script espera a que se mate a si mismo sin
 * saberlo. Con una sola alternativa entre corchetes el resultado es el mismo
 * error por el otro camino: la otra alternativa, escrita entera, si coincide con
 * la linea de ordenes que la contiene.
 */
async function contarPropios(): Promise<number> {
  return new Promise((r) => {
    const p = spawn('pgrep', ['-fc', '[e]lectron/dist/electron|[d]ist/server.mjs'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let salida = '';
    p.stdout.on('data', (d: Buffer) => (salida += d.toString()));
    p.on('exit', () => r(Number(salida.trim()) || 0));
    p.on('error', () => r(0));
  });
}

// ---------------------------------------------------------------- ventana

interface Sesion {
  electron: ChildProcess;
  ruido: string[];
  enPagina<T>(expresion: string): Promise<T>;
  esperarHasta(que: (url: string) => boolean, intentos?: number): Promise<string>;
  cerrar(): Promise<void>;
}

async function abrirSesion(): Promise<Sesion | null> {
  const puertoCdp = await puertoLibre();
  const electron = spawn(binarioElectron(), ['.', `--remote-debugging-port=${puertoCdp}`], {
    cwd: RAIZ,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const ruido: string[] = [];
  electron.stdout.on('data', (d: Buffer) => ruido.push(d.toString()));
  electron.stderr.on('data', (d: Buffer) => ruido.push(d.toString()));

  const cerrar = async () => {
    electron.kill('SIGKILL');
    await dormir(400);
    await limpiar();
  };

  // Si el proceso muere antes de abrir la ventana, no tiene sentido seguir
  // esperando veinte segundos a un puerto de depuracion que no va a contestar.
  // Se sale en cuanto se sabe que no va a venir.
  let muerto = false;
  electron.on('exit', () => {
    muerto = true;
  });

  let objetivo: { webSocketDebuggerUrl?: string } | null = null;
  // Noventa intentos de 500 ms son cuarenta y cinco segundos. Se dio margen de
  // sobra porque el arranque en frio de Electron con la maquina ocupada llega a
  // veinte, y un tiempo de espera corto hacia que el script culpara a la
  // aplicacion de algo que solo estaba tardando. Perder tiempo aqui no cuesta
  // nada: el script espera en los dos ciclos de todos modos.
  for (let intento = 0; intento < 90 && !objetivo && !muerto; intento++) {
    await dormir(500);
    try {
      const lista = (await (
        await fetch(`http://127.0.0.1:${puertoCdp}/json`)
      ).json()) as { type: string; webSocketDebuggerUrl?: string }[];
      objetivo = lista.find((t) => t.type === 'page' && t.webSocketDebuggerUrl) ?? null;
    } catch {
      /* el puerto de depuracion aun no escucha */
    }
  }

  if (!objetivo?.webSocketDebuggerUrl) {
    await cerrar();
    console.log(
      `  MAL  Electron no abrio ninguna ventana que comprobar${muerto ? ' (el proceso termino antes)' : ''}`,
    );
    ruido
      .join('')
      .split('\n')
      .filter((l) => l.trim() && !/Fontconfig|libva|Xlib|GLX|MESA/i.test(l))
      .slice(0, 10)
      .forEach((l) => console.log(`       ${l}`));
    return null;
  }

  const socket = new WebSocket(objetivo.webSocketDebuggerUrl);
  await new Promise<void>((r) => socket.addEventListener('open', () => r(), { once: true }));

  let siguiente = 0;
  const pendientes = new Map<number, (m: unknown) => void>();
  socket.addEventListener('message', (ev: MessageEvent) => {
    const m = JSON.parse(String(ev.data)) as { id?: number };
    if (m.id && pendientes.has(m.id)) {
      pendientes.get(m.id)!(m);
      pendientes.delete(m.id);
    }
  });

  function llamar(metodo: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = ++siguiente;
    return new Promise((resolve) => {
      pendientes.set(id, resolve);
      socket.send(JSON.stringify({ id, method: metodo, params }));
    });
  }

  const enPagina = async <T>(expresion: string): Promise<T> => {
    const r = (await llamar('Runtime.evaluate', {
      expression: expresion,
      returnByValue: true,
      awaitPromise: true,
    })) as { result?: { result?: { value?: T } } };
    return r.result?.result?.value as T;
  };

  const esperarHasta = async (que: (url: string) => boolean, intentos = 40): Promise<string> => {
    let url = '';
    for (let i = 0; i < intentos; i++) {
      await dormir(500);
      // La lectura puede fallar justo al navegar: al cambiar de documento se
      // destruye el contexto de ejecucion y `Runtime.evaluate` contesta con un
      // error en vez de con un valor. Se come ese fallo y vuelve a preguntar;
      // cualquier otro error tambien, porque aqui lo que importa es si la pagina
      // llego a donde tenia que llegar, no el motivo por el que no se pudo leer.
      try {
        url = (await enPagina<string>('location.href')) ?? '';
      } catch {
        url = '';
      }
      if (que(url)) return url;
    }
    return url;
  };

  return {
    electron,
    ruido,
    enPagina,
    esperarHasta,
    cerrar: async () => {
      socket.close();
      await cerrar();
    },
  };
}

// ------------------------------------------------------------------ ciclo

interface Plan {
  titulo: string;
  /** Puerto que el servidor debe evitar, o null si no importa. */
  ocupado: number | null;
}

/**
 * Un ciclo completo: splash, arranque, uso y parada.
 *
 * El ocupante del puerto se monta aqui y no antes a proposito: `limpiar()` mata
 * cualquier servidor suelto, asi que uno colocado fuera del ciclo se lleva por
 * delante y la comprobacion creeria que el puerto estaba libre cuando no lo
 * estaba. Era exactamente el fallo que esta segunda pasada tiene que cazar.
 */
async function ciclo(plan: Plan): Promise<void> {
  console.log(`\n  ${plan.titulo}`);

  await limpiar();

  let ocupante: ChildProcess | null = null;
  if (plan.ocupado !== null) {
    ocupante = spawn('node', ['dist/server.mjs'], { cwd: RAIZ, stdio: 'ignore', detached: true });
    let listo = false;
    for (let i = 0; i < 20 && !listo; i++) {
      await dormir(500);
      listo = await fetch(`http://127.0.0.1:${plan.ocupado}/api/health`)
        .then((r) => r.ok)
        .catch(() => false);
    }
    if (!listo) {
      console.log(`  (omitida: no se pudo ocupar el puerto ${plan.ocupado} a proposito)`);
      ocupante.kill('SIGKILL');
      return;
    }
    console.log(`  (el puerto ${plan.ocupado} lo ocupa pid ${ocupante.pid}, a proposito)`);
  }

  const s = await abrirSesion();
  if (!s) {
    fallos++;
    ocupante?.kill('SIGKILL');
    return;
  }

  // Con el servidor apagado la URL de la aplicacion no carga. Antes de esto no
  // habia nada: la ventana se quedaba en el error de Chromium, sin ningun boton.
  //
  // Se ESPERA a que aparezca y luego se comprueba. Leer la URL sin esperar era una
  // carrera: Electron crea la ventana antes de que cargue el documento, y durante
  // ese hueco `location.href` es "about:blank". Cuando la maquina estaba
  // ocupada, el script gano a la carga y dio por hecho que la aplicacion abria en
  // una pagina en blanco. El fallo no era de la aplicacion: era que se leia antes
  // de tiempo. Pasaba de vez en cuando, que es justo cuando mas daño hace.
  const urlInicial = await s.esperarHasta((url) => url !== 'about:blank', 60);
  comprobar(
    urlInicial.endsWith('arranque.html'),
    'la ventana arranca en la pantalla de arranque sin servidor',
    urlInicial.replace(/.*dist\//, 'dist/'),
  );

  const boton = await s.enPagina<{ texto: string; ancho: number; deshabilitado: boolean }>(
    `(() => {
      const b = document.getElementById('arrancar');
      if (!b) return { texto: null, ancho: 0, deshabilitado: true };
      const r = b.getBoundingClientRect();
      return { texto: b.textContent.trim(), ancho: Math.round(r.width), deshabilitado: b.disabled };
    })()`,
  );
  comprobar(boton?.texto === 'Iniciar servidor', 'el boton dice "Iniciar servidor"', boton?.texto ?? '');
  comprobar(
    (boton?.ancho ?? 0) > 60 && !boton?.deshabilitado,
    'el boton se ve y se puede pulsar',
    `${boton?.ancho}px de ancho`,
  );

  // Centrado medido, no Supuesto por el CSS.
  const centro = await s.enPagina<{ dx: number; dy: number }>(
    `(() => {
      const c = document.querySelector('.centro').getBoundingClientRect();
      return { dx: Math.abs(c.left + c.width / 2 - innerWidth / 2), dy: Math.abs(c.top + c.height / 2 - innerHeight / 2) };
    })()`,
  );
  comprobar(
    (centro?.dx ?? 99) <= 1 && (centro?.dy ?? 99) <= 1,
    'el boton esta en el centro de la ventana',
    `desvio ${centro?.dx?.toFixed(1)}px en horizontal, ${centro?.dy?.toFixed(1)}px en vertical`,
  );

  await dormir(700);
  const versiones = await s.enPagina<string>(
    `[...document.querySelectorAll('#versiones dd')].map(d => d.textContent).join('|')`,
  );
  comprobar(
    (versiones ?? '').split('|').filter((v) => v && v !== '—').length >= 3,
    'se muestran las versiones de la instalacion',
    versiones,
  );

  console.log('\n  Poner en marcha');

  await s.enPagina(`document.getElementById('arrancar').click()`);

  // El proceso hijo se crea. Antes fallaba siempre: `fork` dentro de Electron
  // exige un canal `ipc` que no se le pasaba.
  await dormir(600);
  // Se lee tolerante a que la ventana ya haya pasado a la aplicacion: si el
  // servidor arranca en menos de 600 ms ya no hay pantalla de arranque que leer y
  // preguntar por ella daria un error que no es del arranque.
  const arrancando = await s.enPagina<{ donde: string; error: string }>(
    `(() => {
      const e = document.getElementById('error');
      return { donde: location.pathname, error: e ? e.textContent.trim() : '' };
    })()`,
  );
  comprobar(
    arrancando?.error === '' || arrancando?.donde === '/',
    'el arranque no se queja',
    arrancando?.error || `la ventana ya esta en ${arrancando?.donde}`,
  );

  const urlApp = await s.esperarHasta((u) => u.startsWith('http://127.0.0.1:'));
  comprobar(urlApp.startsWith('http://127.0.0.1:'), 'la ventana pasa a la aplicacion', urlApp);

  // Con el puerto ocupado tiene que caer en otro, no quedarse esperando.
  const puertoUsado = urlApp.startsWith('http://') ? Number(new URL(urlApp).port) : 0;
  comprobar(
    plan.ocupado === null ? puertoUsado > 0 : puertoUsado !== plan.ocupado,
    plan.ocupado === null
      ? 'la aplicacion se abre en un puerto concreto'
      : 'la aplicacion se abre en un puerto distinto del ocupado',
    `puerto ${puertoUsado}`,
  );

  const salud = await fetch(`http://127.0.0.1:${puertoUsado}/api/health`)
    .then((r) => r.json() as Promise<{ ok?: boolean; pid?: number }>)
    .catch(() => null);
  comprobar(salud?.ok === true, 'el servidor responde', salud ? `pid ${salud.pid}` : 'sin respuesta');

  await dormir(1_200);
  const pie = await s.enPagina<{ texto: string; botones: string[] }>(
    `(() => {
      const b = document.querySelector('.bottombar');
      if (!b) return { texto: null, botones: [] };
      return {
        texto: b.querySelector('.bottombar-state')?.innerText.replace(/\\s+/g, ' ').trim(),
        botones: [...b.querySelectorAll('button')].map(x => x.textContent.trim()),
      };
    })()`,
  );
  comprobar(/en marcha/i.test(pie?.texto ?? ''), 'la barra inferior avisa de que el servidor esta en marcha', pie?.texto);
  comprobar(
    (pie?.botones ?? []).some((b) => /detener servidor/i.test(b)),
    'la barra inferior tiene el boton de detener el servidor',
    (pie?.botones ?? []).join(', '),
  );

  console.log('\n  Detener el servidor');

  await s.enPagina(
    `[...document.querySelectorAll('.bottombar button')].find(b => /Detener/.test(b.textContent))?.click()`,
  );

  // Sin esto la ventana se queda en una aplicacion que no puede hacer nada: todas
  // sus peticiones van a un puerto cerrado y el unico boton para volver a arrancar
  // esta en una pantalla a la que ya no se llega.
  const urlTrasDetener = await s.esperarHasta((u) => u.endsWith('arranque.html'));
  comprobar(
    urlTrasDetener.endsWith('arranque.html'),
    'al detener el servidor se vuelve a la pantalla de arranque',
    urlTrasDetener.replace(/.*dist\//, 'dist/'),
  );

  const botonFinal = await s.enPagina<string>(`document.getElementById('arrancar')?.textContent.trim()`);
  comprobar(botonFinal === 'Iniciar servidor', 'el boton de arrancar vuelve a estar disponible', botonFinal);

  await s.cerrar();
  ocupante?.kill('SIGKILL');
}

// ------------------------------------------------------------------ tirar

// Sin pantalla no hay ventana que abrir, y esto no se deduce de un registro: se
// deduce de la variable de entorno que Chromium necesita para abrir una. En
// Windows y macOS siempre existe, asi que la comprobacion se hace entera.
if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
  console.log('  (omitida: esta maquina no tiene pantalla donde abrir una ventana)');
  process.exit(0);
}

await ciclo({ titulo: 'Puerto libre', ocupado: null });
await ciclo({ titulo: 'Puerto ocupado', ocupado: PUERTO_APP });
await limpiar();

console.log(fallos === 0 ? '\nOK: la aplicacion arranca, muestra y para bien' : `\n${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
