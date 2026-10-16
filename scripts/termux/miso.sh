#!/data/data/com.termux/files/usr/bin/sh
#
# Arranca Miso dentro de Termux.
#
# El servidor vive en este mismo directorio y sirve la interfaz web. La idea es
# no depender de ningun equipo: se abre el navegador del propio telefono contra
# 127.0.0.1 y todo ocurre aqui dentro.
#
# Uso:
#   sh miso.sh            (o ./miso.sh si tiene permiso de ejecucion)
#
# Variables que se pueden cambiar antes de arrancar:
#   MISO_PORT=7345        puerto de la interfaz
#   MISO_HOST=127.0.0.1   dejalo asi salvo que quieras abrirlo a tu red local
#   MISO_USER_DATA=...    carpeta de favoritos e historial

set -eu

DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$DIR"

MISO_HOST=${MISO_HOST:-127.0.0.1}
MISO_PORT=${MISO_PORT:-7345}
MISO_USER_DATA=${MISO_USER_DATA:-$HOME/.miso}
# Este paquete no trae navegador headless: la extraccion que lo necesita se omite
# y el resto sigue funcionando.
MISO_NO_BROWSER=1
export MISO_HOST MISO_PORT MISO_USER_DATA MISO_NO_BROWSER

mkdir -p "$MISO_USER_DATA"

# Que Android no duerma el proceso mientras se ve algo. Si no esta el comando, se
# sigue igual: aviso, no requisito.
if command -v termux-wake-lock >/dev/null 2>&1; then
  termux-wake-lock
fi

echo "[miso] interfaz en http://$MISO_HOST:$MISO_PORT/"
echo "[miso] datos y registro en $MISO_USER_DATA"
echo "[miso] deja esta sesion abierta mientras usas la aplicacion; Ctrl+C para parar"

# El navegador se abre un par de segundos despues, cuando el servidor ya escucha.
# En segundo plano para no retrasar el arranque si el navegador tarda.
if command -v termux-open-url >/dev/null 2>&1; then
  ( sleep 2; termux-open-url "http://$MISO_HOST:$MISO_PORT/" ) &
fi

exec node "$DIR/dist/server.mjs"
