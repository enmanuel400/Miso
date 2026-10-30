Web y servidor ok, ahora los binarios de Linux:

El binario se empaquetó pero hay un aviso de fichero que faltó en dist/tools. Probablemente se requirió copiar herramientas que el build omitió. Testo si arranca directement:

El binario arranca con salida, aunque los temas de fuente son aviso normales de Linux. Verifica que sirva correctamente:

Ah, el binario falla porque no encuentra sololatinoBrowser.cjs dentro del paquete empaquetado (app.asar). Debe apuntar相对于 el servidor:

Te pongo el problema: bundler convierta la resolución en un modulo ligero. Cambio de la función a require para que el módulo se genere desde server/ y no des ref a archivo separado.

Primero miro como venía la cadena:

El problema está que la resolución se carga desde un archivo separado y el paquete empaquetado no lo incluye. Mejor lo incrusto directamente en sololatino.ts con esbuild que ya conoce. Reescribo todo el resolutorinline.
