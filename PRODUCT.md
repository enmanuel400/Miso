# Miso — contexto de producto

Documento de contexto durable. Es la referencia de producto para el diseño y la
implementación. Si algo aquí contradice una decisión posterior, este archivo se
actualiza; no se acumula documentación paralela.

## Qué es

Miso es una **aplicación de escritorio local** que busca en dos sitios de
streaming a la vez, unifica los resultados en tarjetas y reproduce el vídeo
**sin salir de la aplicación**.

No es un sitio web ni una pestaña de navegador. Se abre desde un acceso directo,
levanta su propio servidor Node local y lo apaga cuando él mismo se cierra.

## Para quién

Una persona en su escritorio que quiere encontrar una película concreta sin
visitar dos sitios por separado, y verla sin pestañas abiertas ni banners.

## Qué resuelve

Dos sitios de streaming con:

- Búsquedas separadas, sin resultados unificados.
- Pósters en CDN que **no envían cabeceras CORS**, así que un navegador no los
  puede mostrar sin un proxy.
- La URL real del vídeo calculada en JavaScript ofuscado en tiempo de
  ejecución: no está en el HTML y no se puede leer sin ejecutar un navegador.
- CDNs de vídeo que responden sin `Access-Control-Allow-Origin`, lo que impide
  reproducir aunque la URL sea correcta.
- URLs de stream **efímeras**: caducan, y algunas mueren con una reclamación DMCA.
- Servidores que a veces responden con un manifiesto HLS válido cuyos segmentos
  son todos imagenes de anuncio.

Miso existe para ocultar todo eso detrás de una búsqueda y un botón de
reproducción.

## Alcance de v1

**Solo búsqueda unificada.** Fuera de alcance en esta versión:

- Catálogo y navegación por géneros.
- Autocompletado.
- Historial persistente y cuentas de usuario.

No es un rechazo permanente de esas funciones, solo no están construidas.

## Restricciones

- Debe ser una app de escritorio local, no una web. Acceso directo, sin
  pestaña de navegador.
- El arranque muestra un splash con "Iniciar servidor"; el servidor no debe
  abrir una terminal visible.
- Inactividad en dos niveles: suspender el navegador a los ~3 min, detener el
  servidor completo a los ~12 min.
- Cerrar la app debe detener el servidor.
- El Chromium de Playwright va **empaquetado en el instalador**, nunca
  descargado en tiempo de ejecución.
- El nombre de la fuente debe verse **en cada tarjeta**. Es el resultado de la
  búsqueda federada, no un detalle: el usuario tiene que saber de dónde sale.
- Prohibido desactivar la seguridad del navegador para resolver problemas de
  origen. Se resuelve con proxy.
- Las fuentes rotan de dominio con frecuencia. Ningún dominio se fija en el
  código como si fuera estable.

## Decisiones de diseño

Confirmadas con el usuario antes de diseñar la interfaz:

- **Tema: solo oscuro.** Constante. Sin conmutador, sin seguir al sistema.
  Favorece los posters y no cansa en sesiones largas de visionado.
- **Detalle técnico solo cuando algo falla.** La interfaz limpia muestra el
  nombre del servidor elegido. La traza de extracción (método, CDN, motivo de
  un descarte) aparece únicamente cuando hay un fallo, porque ahí es cuando
  explica algo.
- **Dirección visual por explorar:** tres variantes en paralelo —cartel
  inmersivo, instrumento técnico denso, y lista editorial— elegidas en un
  visor antes de fijar el mundo visual.

## Modo de la interfaz

**Operar.** El visitante completa una tarea: encontrar un título y verlo. La
escaneabilidad y la consistencia mandan sobre la expresión. La personalidad vive
en detalles precisos, no en decoración.

## Arquitectura (resumen, para contexto de diseño)

- **Electron** como shell de escritorio. El servidor es Node.js; Tauri exigiría
  además un toolchain de Rust y un sidecar en Node, así que no compensa aquí.
- **Servidor local** en un puerto alto (7345 por defecto) con Express.
  Necesario porque los CDN de posters y vídeo no envían CORS.
- **Playwright** para la extracción: obligatorio para pelisplushd, cuya URL de
  vídeo se calcula en JavaScript ofuscado. Cuevana se consulta por API y devuelve
  los embeds ya resueltos, así que para ella el navegador es el respaldo, no la
  vía normal.
- **React + Vite** para la interfaz, servida por el propio servidor en
  producción.
- **Proxy de imagen** y **proxy HLS** locales, con validación de que el destino
  sea público (evita convertir el proxy en acceso a la red interna). No hay lista
  blanca de dominios a propósito: los CDN de vídeo cambian de subdominio en cada
  título y una lista fija dejaría fuera segmentos a mitad de película.
- Extracción en cascada: literal en HTML → embeds en base64 → navegador
  headless. Se para en cuanto algo resulta reproducible, y **valida** que el
  HLS contenga video real y no solo anuncios.