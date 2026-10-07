#Fuentes las paginas de peliculas
#Parametros iniciales:
#URL de inicio de la pagina
#URL de la pagina de busqueda
#URL de una de las entradas resultado de la pagina de busqueda
#URL de play con las opciones de servidores de inicio para el multimedia
#URL misaleneos



# 1. cuevana3.sc  (RETIRADA: el backend `tmdb.*` que usa esta seccion ya da 404.
#    La sustitucion esta en "2bis".)
#
# No se parsea: se consulta. La web es una SPA cuyo HTML son 1,8 kB de shell,
# pero su bundle construye las peticiones a `https://tmdb.` + dominio, y ahi hay
# una API REST limpia. Medido: busqueda en 350 ms, 55 resultados.
#
# La API:
#   https://tmdb.cuevana3.sc/v1/search?q={termino}
#   https://tmdb.cuevana3.sc/v1/items/{kind}/{idTmdb}
#   https://tmdb.cuevana3.sc/v1/playback/{kind}/{idTmdb}[?season=1&episode=1]
#
# `{kind}` es `movie`, `tvshow` o `anime`. Ojo: es el TIPO, no el slug. Si se
# manda el slug, la API contesta 400 "invalid content type", no un 404, que es un
# error bastante menos util para depurar.
#
# `/v1/playback` devuelve los embeds ya resueltos, con host, idioma y calidad.
# Eso es lo que ninguna de las otras fuentes daba: hay que arrancar un Chromium
# por servidor para adivinarlo.
#
# Los cuatro dominios de la lista son el MISMO backend (mismo catalogo, mismos
# embeds, mismos hosteros: medido 55 resultados identicos). Son cuatro portadas,
# no cuatro fuentes, asi que estan como dominios alternativos.
#
#   https://cuevana3.sc/       (preferida: la insignia dice cuevana)
#   https://compucalitv.tv/
#   https://mega1080.me/
#   https://pelisplus.fo/
#
# Hosteros que devuelve: vimeos.net y goodstream.one, dos por titulo.
#
#   vimeos.net   -> manifest en p3/p5/p6.vimeos.zip, s9.vimeos.net, ...
#   goodstream.one -> enc8.goodstream.one (vive) / hls2.goodstream.one (443
#                     cerrado, 91.211.90.4). El reproductor elige, asi que a
#                     veces sale el muerto; por eso hay que listarlos siempre y
#                     descartar en vivo, no borrarlos del catalogo.
#
# Posters: image.tmdb.org/t/p/w342{poster_path}. No envian ACAO: pasan por el
# proxy de imagenes.
#
# SERIES: TEMPORADAS Y CAPITULOS  (medido sobre Rick y Morty, tmdb 60625)
#
#   indice     /v1/items/tvshow/60625
#              trae `episode_seasons[]` con {season, name, overview, air_date,
#              poster_path, count, available_count, playable_count,
#              first_episode, last_episode}. Con eso se pinta el selector de
#              temporada SIN una segunda peticion.
#   capitulos  /v1/items/tvshow/60625/seasons          -> 9 temporadas, 4,2 kB, 330 ms
#              /v1/items/tvshow/60625/seasons/{N}      -> {season:{...,episodes:[
#                                                       {season,episode,title,
#                                                       air_date,runtime,
#                                                       still_path,playable}]}}
#   play       /v1/playback/tvshow/60625?season=&episode=
#
# DOS TRAMPAS, y las dos hacen fallar cosas de verdad:
#
#   1. `number_of_seasons` dice 10 y `episode_seasons` trae 9. La temporada 10
#      no esta emitida: pedir un capitulo ahi devuelve {error}, no un capitulo.
#      Por eso el indice sale de `episode_seasons` y no del numero del catalogo.
#   2. La temporada 9 declara `count: 10, available_count: 9,
#      playable_count: 9, last_episode: 9`. Contar por `count` ofrece un
#      capitulo 10 que la fuente rechaza con un error. Manda `last_episode`.
#
# Comprobado en vivo que el rango no miente: T1(1-11) T2..T8(1-10) T9(1-9).
# Y que un capitulo inexistente cae en el ultimo en vez de romper: T9E99 -> T9E9.
#
# LO MAS NUEVO: /v1/episodes
#   24 elementos {show, episode}, ordenados por air_date descendente. Cada uno
#   lleva su capitulo, asi que la tarjeta abre en el capitulo nuevo y no en la
#   serie entera.
#
#   Las otras dos opciones que expone la API NO sirven, y esta medido:
#     /v1/now   no esta ordenado por fecha. La primera pagina mezcla
#               "Terminator" (1984) con "Zootopia 2" (2025).
#     /v1/top   es una clasificacion, no un listado de novedades.
#   /v1/items?kind=X  si esta en orden de antiguedad, pero solo de esa clase.

# 2. pelisplushd.la (ACTIVA)
https://pelisplushd.la/

https://pelisplushd.la/search?s=bestia

#esta pagina tiene id de pelicula y serie en sus resultados
https://pelisplushd.la/pelicula/el-corazon-de-la-bestia-1263337
https://pelisplushd.la/serie/la-bestia-en-mi

https://pelisplushd.la/peliculas
https://pelisplushd.la/series
https://pelisplushd.la/generos/dorama
https://pelisplushd.la/animes

# SERIES: TEMPORADAS Y CAPITULOS  (medido sobre /serie/rick-y-morty)
#
# La pagina de la SERIE trae el mapa entero de temporadas y capitulos. Es el
# dato que hace que abrir una serie no haga falta una segunda peticion:
#
#   pestanas   <ul class="TbVideoNv nav nav-tabs">
#              <a href=" #pills-vertical-3" class="nav-link">TEMPORADA 3</a>
#   capitulos  <div role="tabpanel" class="tab-pane fade in " id="pills-vertical-3">
#              <a href="/serie/rick-y-morty/temporada/3/capitulo/1"
#                 class="btn btn btn-primary btn-block">Rick y Morty 3x1</a>
#
# Medido: 9 temporadas, 91 capitulos distintos, T1 = 11 y T2..T9 = 10.
# El texto del boton es "SERIE 3x1": es el nombre de la serie con la
# coordenada pegada, no el nombre del capitulo, y se quita el sufijo.
#
# OJO, esto es lo que mas confunde: LA PAGINA DE LA SERIE NO TIENE REPRODUCTOR.
# Los reproductores estan en la pagina del CAPITULO:
#
#   https://pelisplushd.la/serie/rick-y-morty/temporada/3/capitulo/1
#   #link_url span[lid][url]   -> 5 <span lid= url=> (streamwish.to,
#                                  filelions.to, voe.sx, streamtape.com, waaw.to)
#   o bien <li data-url="..."> cuando no hay #link_url (layout A).
#
# De ahi salen dos layouts de servidor excluyentes, y estan los dos:
#   A  li[data-url]                    9 servidores  ("carrera-de-bestias")
#   B  li[data-id] + #link_url span     5 servidores  ("shrek-tercero")
#
# Con el layout B sin leer, esos titulos devolvian cero servidores y se quedaba
# solo la pagina propia, que tampoco reproduce.
#
# Un detalle del h1 de la pagina de capitulo: "Temporada 3, Capitulo 3 - Episode
# 1", que mezcla las dos numeraciones. No se puede usar para saber que capitulo es.
#
# PELICULAS: /pelicula/dune-2 trae 1 elemento TbVideoNv pero CERO tabpanels, y
# 1 li[data-url]. El discriminante no es el HTML sino el identificador:
# /^(serie|anime)/ en el id. Los animes usan /anime/{slug} (p. ej. /anime/attack-
# on-titan, 5 paneles y 89 capitulos).
#
# LO MAS NUEVO: dos paginas, y se entrelazan por la mitad
#   /peliculas/estrenos   24 <a class="Posters-link">
#   /series/estrenos      24 <a class="Posters-link">
# Un solo bloque de doce peliculas seguido de doce series deja media pantalla con
# un unico tipo de cosa, y en una rejilla de doce sitio se nota.


# ---------------------------------------------------------------------------
# RETIRADAS. Se/search bien, pero el reproductor estaba muerto en cadena, y era
# peor tenerlas que no tenerlas: cada titulo gastaba el presupuesto de tiempo en
# dos o tres saltos rotos y el informe de fallos acababa hablando de ellas.
#
# 3. repelisplus.my   watchfun.top -> nuupload.my -> voe.sx (404)
# 4. pelisflix1.today nuupload.my -> voe.sx (404)
#


# ---------------------------------------------------------------------------
# DESCARTADAS tras probarlas (no adoptadas)
#
# www2.gnula.one  (antes gnula.nu; el .nu ahora lleva aqui)
#
#                 La razon de mirarla era buena y lo sigue siendo: cuevana y
#                 pelisplushd dependen de la MISMA familia de hosters (vimeos,
#                 goodstream), asi que una caida de esa familia deja a las dos
#                 sin reproducir a la vez. gnula tiraba de uqload, voe y hqq,
#                 que son de otra. Se probo entero y se retiro.
#
#                 TECNICA (funciona, y no es lo que falla):
#   busqueda    https://www2.gnula.one/?s={termino}   1,4-2,0 s
#   ficha       https://www2.gnula.one/movie/{slug}/
#   title       #content .post .title h2 a -> "Ver TITULO (2025) online"
#               OJO: el <h1> NO es el titulo, lo usa un widget para mostrar la
#               IP al visitante. No hay etiquetas og:.
#   poster      .cover img[alt^="Poster de"]. Las barras laterales traen
#               imagenes de 54x83 con el mismo aspecto: hay que elegir por el
#               alt y no por la posicion.
#   sinopsis    .cover .entry > p, descartando los que llevan <picture> o
#               .iframes y los que vienen vacios.
#   servidores  .contenedor_tab div[id^="tab"] iframe
#               La web usa data-lazy-src por WP Rocket y escribe `stylae` en
#               lugar de `style`. `src="about:blank"` tiene que perder contra
#               `data-lazy-src`.
#   calidad     La cabecera es "[AÑO, AUDIO…, CALIDAD]" y NO tiene forma fija:
#               hay peliculas con un audio y con tres. La calidad es la ultima
#               palabra si es HD/SD/4K..., los audios son todo lo de en medio.
#               Tomar la segunda palabra por calidad producia etiquetas como
#               "Subtitulado · Castellano · hostero".
#   #lang=      SUB / LAT / CAS en el fragmento de la URL. Gana sobre la
#               cabecera: es lo que el servidor publico para ese embed.
#
#                 LO QUE NO FUNCIONA (y no se arregla desde Miso):
#                 El catalogo tiene los reproductores caducados y no se
#                 renueva. En 32 embeds de unas veinte fichas reprodujeron 3.
#                 Lo que contestan los hosters:
#
#                   uqload.com   "File is no longer available as it expired or
#                                has been deleted."
#                   hqq.to       "Not Found"
#                   voe.sx       404
#                   filemoon.sx  404
#
#                 Reparto de los 32: 11 caducados, 8 que no responden, 12 que
#                 no son reproductores (links.cuevana.ac es un agregador y
#                 player.cuevana.ac es el mismo video de YouTube en todas las
#                 fichas), 6 otros (upstream.to con el certificado TLS
#                 invalido, formatearwindows.net sin DNS).
#
#                 Tres pasadas, con embeds recién sacados de la ficha:
#                   12 titulos al azar    2 reproducen
#                   14 de busqueda       0 reproducen
#                   6 de los mas nuevos  1 reproduce
#
#                 Los dos aciertos salieron de lo mismo: la pagina de
#                 links.cuevana.ac lleva a veces un .mp4 escrito en el HTML, y
#                 ahi se encontraba sin navegador. Eso es suerte, no una fuente.
#
#                 Coste de mantenerla: +0,6 s en cada busqueda (de 0,85 a
#                 1,45) y 32 s de presupuesto por titulo fallido.
#
#                 Si la web regenera su catalogo puede volver a mirarse: la
#                 parte de Miso esta medida y solo fallaba la red.
#
# gnula.nu      Ahora mismo es www2.gnula.one, ver arriba.
# gnula.pro     DNS que no abre ni el 80 ni el 443.
# gnula.org     Si funciona: renderiza en servidor, GET /s?s=, fichas en
#               /pelicula/{slug}/, y a.lnk-blk con href ABSOLUTO (por eso un
#               regex de /pelicula/ no encuentra nada). Pero no tiene
#               reproductor propio: la ficha manda a gnulahd.lat, con
#               certificado TLS invalido (ERR_CERT_AUTHORITY_INVALID); el .one
#               da 403 y el .com no resuelve. Busca bien y no reproduce nunca.

# 2bis. cuevana3.gs y lamovie.org  (ACTIVAS)
#
# Suceden a cuevana3.sc, cuyo backend `tmdb.*` esta muerto (404). Son el MISMO
# tema de WordPress con un backend Laravel, y no hay HTML que parsear: la web es
# una SPA y todo su contenido sale de `https://{dominio}/wp-api/v1`. Ambas usan el
# adaptador generico `server/sources/wpapi.ts`; solo cambian dominio y etiqueta.
#
#   GET /search?q={termino}&postType=any&postsPerPage=24
#       -> {data:{posts,pagination}}. `postType` es obligatorio: sin el solo
#          devuelven peliculas, asi que las series desaparecen de la busqueda.
#   GET /listing/movies?postType=movies|tvshows|animes&orderBy=created_at&order=desc&postsPerPage=N
#       -> {data:{posts}}. El segmento de la ruta (`movies`) se ignora; manda el
#          parametro `postType`. `created_at` da lo mas nuevo en los dos sitios;
#          `lamovie` responde una pagina de error de Laravel a cualquier otro
#          `orderBy` que no soporte.
#   GET /single/{type}?slug={slug}&postType={type}
#       -> {data:{_id,title,images{poster,backdrop,logo},overview,release_date,rating,type}}
#          Para una serie NO trae temporadas; solo la ficha.
#   GET /single/episodes/list?_id={showId}&season={N}&page=1&postsPerPage=N
#       -> {data:{posts,pagination,seasons}}. `seasons` es solo una lista de
#          numeros, sin rangos por temporada, asi que cada temporada se pide por
#          separado. La temporada pedida se guarda en cache para no repetirla.
#   GET /player?postId={id}
#       -> {data:{embeds:[{url,server,lang,quality,...}],downloads}}.
#          `postId` es el `_id` de la FICHA: para un capitulo hay que resolver su
#          `_id` antes (sale de `/single/episodes/list`). Con el param equivocado
#          contesta `{"error":true,"message":"Invalid ID"}`, no un 400.
#
# Identificador interno: `{type}/{_id}/{slug}`. El `_id` va delante porque la API
# lo pide en cada paso; el slug detras para armar la URL humana sin otra llamada.
#
# URL humana: /peliculas/{slug}/ (movies), /series/{slug}/ (tvshows),
# /animes/{slug}/ (animes). Los posters son thumbnails locales en
# `https://{dominio}/wp-content/uploads/thumbs/*.webp`; se prefieren a la ruta de
# TMDB del campo `poster`.
#
# Reproductores: `cuevana3.gs` devuelve `player.php?t=...&server=vimeos`, que es
# solo un iframe hacia el hoster; `lamovie` devuelve el embed directo
# (vimeos.net, videoapp.zip...). El campo `server` a veces vale "Online" para
# todos, asi que la etiqueta recurre al parametro `server=` de la URL.
#
# Nota de extraccion (no del adaptador): algunos manifiestos de vimeos.net
# contestan 403 a la descarga del .m3u8 aunque el embed cargue. Es el mismo
# problema intermitente que ya tenia la vieja cuevana; cuando pasa, se cae al
# hoster siguiente o a la pagina de la fuente.
#
# cuevanaserie.pro, cuevana3ver.biz, cuevana3.tv, cuevana3.la, 123cuevana.com
#                        Clones de "Cuevana 3" sobre WordPress. Ninguno expone
#                        el reproductor en el HTML: lo cargan por JS. No sirven
#                        como fuente de Miso, que necesita la URL del servidor.
#
# laspelis.plus, donpelis.com, donpelis.net, verpelis.click, citapelis.net,
# citapelis.com, tupelis.club, pelislatam.click, cuevana.pro, cuevana3.io
#                        Sin respuesta.




























