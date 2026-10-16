/*
 * Empaqueta Miso para Termux (Android).
 *
 * Genera un unico `server.cjs` con TODAS las dependencias dentro, la interfaz
 * web ya compilada y un lanzador. El resultado se copia al telefono y se
 * descomprime en `~/miso`.
 *
 * Decisiones que conviene tener presentes:
 *
 *  - El bundle va en ESM, que es el formato que el servidor espera de serie y el
 *    unico en el que `import.meta.url` —que usa para localizar la carpeta de
 *    datos— funciona. Como al reunir todo en un solo archivo pueden quedar
 *    llamadas sueltas a `require` (por ejemplo, las de los builtins de Node
 *    dentro de las dependencias), el banner de abajo lo restituye con
 *    `createRequire`.
 *  - Playwright no se incluye. El import de `server/extract/browser.ts` se
 *    resuelve contra `scripts/termux/playwright-stub.ts` con un alias, y el
 *    lanzador apaga esa etapa con `MISO_NO_BROWSER=1`. Se pierden los servidores
 *    que dependen del navegador; el resto funciona igual.
 *  - La estructura de carpetas imita al repositorio (`<raiz>/dist/server.mjs` y
 *    `<raiz>/dist/web/`) porque asi el servidor encuentra la interfaz sin tocar
 *    ninguna ruta.
 */

import { build } from 'esbuild';
import { chmod, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = path.join(RAIZ, 'dist', 'termux');
const PAQUETE = path.join(SALIDA, 'miso'); // se copia al telefono como ~/miso
const DIST = path.join(PAQUETE, 'dist'); // mismo sitio relativo que en el repo
const WEB = path.join(RAIZ, 'dist', 'web');

const pkg = JSON.parse(await readFile(path.join(RAIZ, 'package.json'), 'utf8'));
const version = pkg.version ?? '0.0.0';
const tar = path.join(SALIDA, `miso-termux-${version}.tar.gz`);

if (!existsSync(path.join(WEB, 'index.html'))) {
  throw new Error('Falta dist/web. Ejecuta antes: npm run build:web');
}

// ------------------------------------------------------------------ limpieza

await rm(SALIDA, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });

// ------------------------------------------------------------------ servidor

await build({
  entryPoints: [path.join(RAIZ, 'server', 'index.ts')],
  outfile: path.join(DIST, 'server.mjs'),
  bundle: true,
  // `bundle` sin `packages: external` es la diferencia con el build de
  // escritorio: aqui no habra node_modules al lado, asi que todo va dentro.
  platform: 'node',
  format: 'esm',
  target: 'node20',
  alias: {
    playwright: path.join(RAIZ, 'scripts', 'termux', 'playwright-stub.ts'),
  },
  // Al reunir todo en un archivo se pierde el `require` que algunas
  // dependencias dan por hecho. `createRequire` lo devuelve apuntando al propio
  // bundle, que es donde tiene que resolver los builtins de Node.
  banner: {
    js: "import { createRequire as __crearRequire } from 'node:module'; const require = __crearRequire(import.meta.url);",
  },
  logLevel: 'info',
  metafile: true,
});

// ------------------------------------------------------------------- interfaz

await cp(WEB, path.join(DIST, 'web'), { recursive: true });

// -------------------------------------------------------- lanzador y lectura

await cp(path.join(RAIZ, 'scripts', 'termux', 'miso.sh'), path.join(PAQUETE, 'miso.sh'));
// El bit de ejecucion tiene que llegar al telefono dentro del tar: si se pierde,
// `./miso.sh` no arranca y hay que acordarse del `sh miso.sh`.
await chmod(path.join(PAQUETE, 'miso.sh'), 0o755);

await writeFile(path.join(PAQUETE, 'LEEME.txt'), leeme(version, path.basename(tar)));

// ------------------------------------------------------------------- paquete

const resultado = spawnSync('tar', ['-czf', tar, '-C', SALIDA, 'miso'], { stdio: 'inherit' });
if (resultado.status !== 0) {
  throw new Error(`tar fallo con codigo ${resultado.status ?? resultado.signal}`);
}

console.log(`\n[miso] paquete listo: ${path.relative(RAIZ, tar)}`);
console.log('[miso] en el telefono: pkg install nodejs; tar -xzf ... -C ~; sh ~/miso/miso.sh');

// ------------------------------------------------------------------- helpers

function leeme(v, tarNombre) {
  return `Miso para Android (Termux)
==========================

Esta carpeta se copia al telefono y se arranca dentro de Termux. No es una
aplicacion de Android: es el mismo servidor que usa la version de escritorio,
corriendo en el propio telefono, con la interfaz abierta en el navegador.

Version: ${v}


QUE HACE FALTA
--------------

  - Termux. Se recomienda instalarlo desde F-Droid o GitHub, no desde Google
    Play: la version de la tienda esta anticuada.
  - Node.js dentro de Termux. Se instala en un paso de abajo.


INSTALACION
-----------

  1. Abre Termux y actualiza:

       pkg update && pkg upgrade

  2. Instala Node.js:

       pkg install nodejs

  3. Da acceso a la memoria del telefono (para poder leer el paquete que
     copiaste desde el equipo):

       termux-setup-storage

  4. Copia ${tarNombre} al telefono (por ejemplo a Descargas) y descomprimelo
     en tu carpeta personal:

       tar -xzf ~/storage/downloads/${tarNombre} -C ~

     Esto crea ~/miso. Si el nombre del archivo cambia, ajusta esa ruta.

  5. Da permiso de ejecucion al lanzador:

       chmod +x ~/miso/miso.sh


ARRANQUE
--------

       sh ~/miso/miso.sh

El script levanta el servidor, abre el navegador en la interfaz y deja el
servidor en primer plano: mientras lo uses, deja esa sesion de Termux abierta.
Ctrl+C lo detiene.

Para arrancarlo con un toque desde la pantalla de inicio, instala el complemento
Termux:Widget, crea la carpeta y el atajo:

       mkdir -p ~/.shortcuts
       printf '%s\\n' 'sh ~/miso/miso.sh' > ~/.shortcuts/miso
       chmod +x ~/.shortcuts/miso

Despues, en el widget de Termux:Widget, elige "miso".


INSTALARLO COMO APLICACION (OPCIONAL)
-------------------------------------

La interfaz se puede anadir a la pantalla de inicio: en el navegador, menu ->
"Anadir a pantalla de inicio". Se abre a pantalla completa, con su propio icono.
Funciona porque se accede por 127.0.0.1, que cuenta como conexion segura.


QUE SE PIERDE EN ESTE PAQUETE
-----------------------------

Esta version NO incluye el navegador sin cabeza que usa el escritorio. Eso
significa que los servidores que dependen de el no apareceran. Los que se
resuelven sin navegador funcionan con normalidad. Cuando elijas una pelicula o
un capitulo, la aplicacion probara los servidores que tenga y, si ninguno
responde, lo dira sin mas.


TUS DATOS
---------

  - Favoritos e historial:  ~/.miso/library.json
   - Registro de diagnostico: ~/.miso/miso.log

     Para verlo en vivo:

       tail -f ~/.miso/miso.log

   Se pueden cambiar con la variable MISO_USER_DATA al arrancar.


ENERGIA
-------

Android puede suspender Termux en segundo plano. Para que no se corte mientras
 ves algo, desactiva la optimizacion de bateria para Termux en los ajustes del
 sistema. El lanzador ya pide un "wake lock" mientras esta en marcha.


ACTUALIZAR
----------

Repite la instalacion con el paquete nuevo (paso 4). La carpeta ~/.miso no se
toca, asi que favoritos e historial se conservan.
`;
}
