/**
 * Sustituto de `playwright` para el paquete de Termux.
 *
 * El servidor importa `chromium` de `playwright` en `server/extract/browser.ts`.
 * En el paquete movil no hay Playwright instalado (ni un Chromium de Android que
 * se le pueda dar), asi que ese import se resuelve aqui en tiempo de compilacion
 * mediante un alias de esbuild. Sin este archivo, el bundle intentaria cargar un
 * paquete que no existe y el servidor no arrancaria.
 *
 * El lanzador (`miso.sh`) apaga el navegador con `MISO_NO_BROWSER=1`, asi que
 * `launch` no deberia llamarse nunca. Si se llama —porque alguien arranco el
 * servidor a mano sin esa variable— falla con un mensaje claro en lugar de con un
 * "module not found".
 */
export const chromium = {
  async launch(): Promise<never> {
    throw new Error(
      'Este paquete no incluye navegador. Arranca con MISO_NO_BROWSER=1 (lo hace miso.sh) ' +
        'o usa la version de escritorio para los servidores que lo necesitan.',
    );
  },
};
