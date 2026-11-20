#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "Uso: sudo bash deploy/install.sh <carpeta> <usuario-del-servicio> <puerto>"
  exit 1
fi

TARGET="$1"
SERVICE_USER="$2"
PORT="$3"
SERVICE_NAME="$(basename "$TARGET")"
NODE_BIN="$(command -v node)"

id "$SERVICE_USER" >/dev/null 2>&1 || useradd --system --home "$TARGET" --shell /usr/sbin/nologin "$SERVICE_USER"
mkdir -p "$TARGET/data"

if [ ! -f "$TARGET/.env" ]; then
  sed -e "s|^PORT=.*|PORT=$PORT|" -e "s|^HOST=.*|HOST=127.0.0.1|" -e "s|^DATA_DIR=.*|DATA_DIR=$TARGET/data|" -e "s|^SESSION_SECRET=.*|SESSION_SECRET=$(head -c 32 /dev/urandom | base64 | tr -d '=+/')|" "$TARGET/app/.env.example" > "$TARGET/.env"
  chmod 600 "$TARGET/.env"
fi

chown -R "$SERVICE_USER":"$SERVICE_USER" "$TARGET"

cat > "/etc/systemd/system/$SERVICE_NAME.service" <<UNIT
[Unit]
Description=$SERVICE_NAME
After=network-online.target

[Service]
User=$SERVICE_USER
WorkingDirectory=$TARGET/app
EnvironmentFile=$TARGET/.env
ExecStart=$NODE_BIN server/main.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME"
echo "Servicio $SERVICE_NAME instalado en el puerto $PORT."
echo "Falta completar TELEGRAM_BOT_TOKEN, STAFF_PIN y SETUP_KEY en $TARGET/.env y reiniciar: systemctl restart $SERVICE_NAME"
