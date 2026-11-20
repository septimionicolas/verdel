#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "Uso: sudo bash deploy/install.sh <carpeta> <usuario-del-servicio> <puerto>"
  exit 1
fi

TARGET="${1%/}"
SERVICE_USER="$2"
PORT="$3"
SERVICE_NAME="$(basename "$TARGET")"
NODE_BIN="$(command -v node || true)"
ENV_FILE="$TARGET/.env"
BACKUP_DIR="/var/backups/$SERVICE_NAME"
BACKUP_DAYS=30

case "$TARGET" in
  /home|/home/*|/root|/root/*) echo "La carpeta no puede estar en /home ni en /root: el servicio no ve esas carpetas. Usá, por ejemplo, /opt/$SERVICE_NAME."; exit 1 ;;
  /?*) ;;
  *) echo "La carpeta tiene que ser una ruta completa, como /opt/verdel."; exit 1 ;;
esac

case "$PORT" in
  ''|*[!0-9]*) echo "El puerto tiene que ser un número."; exit 1 ;;
esac
if [ "$PORT" -lt 1024 ] || [ "$PORT" -gt 65535 ]; then
  echo "Usá un puerto entre 1024 y 65535: el servicio corre sin permiso para abrir los más bajos, y el 80 y el 443 son del proxy."
  exit 1
fi

if [ -z "$NODE_BIN" ]; then
  echo "No encontré node. Instalá Node 22 o más nuevo para todo el sistema y volvé a correr el instalador."
  exit 1
fi
case "$NODE_BIN" in
  /home/*|/root/*) echo "Node está en $NODE_BIN y el servicio no ve /home ni /root. Instalalo para todo el sistema (por ejemplo, desde NodeSource) y volvé a correr el instalador."; exit 1 ;;
esac

if [ ! -f "$TARGET/app/.env.example" ]; then
  echo "No encontré $TARGET/app/.env.example: cloná el repo en $TARGET/app antes de instalar."
  exit 1
fi

random_key() {
  head -c 32 /dev/urandom | base64 | tr -d '=+/\n'
}

id "$SERVICE_USER" >/dev/null 2>&1 || useradd --system --home "$TARGET" --shell /usr/sbin/nologin "$SERVICE_USER"
mkdir -p "$TARGET/data"

if [ ! -f "$ENV_FILE" ]; then
  (
    umask 077
    sed -e "s|^PORT=.*|PORT=$PORT|" \
      -e "s|^HOST=.*|HOST=127.0.0.1|" \
      -e "s|^DATA_DIR=.*|DATA_DIR=$TARGET/data|" \
      -e "s|^TRUST_PROXY=.*|TRUST_PROXY=true|" \
      -e "s|^SETUP_KEY=.*|SETUP_KEY=$(random_key)|" \
      -e "s|^SESSION_SECRET=.*|SESSION_SECRET=$(random_key)|" \
      "$TARGET/app/.env.example" > "$ENV_FILE"
  )
fi

if grep -q '^HOST=' "$ENV_FILE"; then
  sed -i 's|^HOST=.*|HOST=127.0.0.1|' "$ENV_FILE"
else
  echo 'HOST=127.0.0.1' >> "$ENV_FILE"
fi
chmod 600 "$ENV_FILE"

DATA_DIR="$(sed -n 's|^DATA_DIR=||p' "$ENV_FILE" | tail -n 1)"
case "$DATA_DIR" in
  /home|/home/*|/root|/root/*) echo "DATA_DIR no puede estar en /home ni en /root: el servicio no ve esas carpetas."; exit 1 ;;
  /?*) ;;
  *) echo "DATA_DIR en $ENV_FILE tiene que ser una ruta completa (por ejemplo, $TARGET/data)."; exit 1 ;;
esac
mkdir -p "$DATA_DIR" "$BACKUP_DIR"

chown -R "$SERVICE_USER":"$SERVICE_USER" "$TARGET" "$DATA_DIR" "$BACKUP_DIR"
chmod 700 "$DATA_DIR"
chmod 750 "$BACKUP_DIR"

HARDENING="NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectKernelLogs=true
ProtectControlGroups=true
ProtectClock=true
ProtectHostname=true
RestrictNamespaces=true
RestrictRealtime=true
RestrictSUIDSGID=true
LockPersonality=true
SystemCallArchitectures=native
CapabilityBoundingSet=
AmbientCapabilities="

cat > "/etc/systemd/system/$SERVICE_NAME.service" <<UNIT
[Unit]
Description=$SERVICE_NAME
After=network-online.target
Wants=network-online.target

[Service]
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$TARGET/app
EnvironmentFile=$ENV_FILE
ExecStart=$NODE_BIN server/main.js
Restart=always
RestartSec=3
UMask=0077
$HARDENING
ReadWritePaths=$DATA_DIR
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX

[Install]
WantedBy=multi-user.target
UNIT

cat > "/etc/systemd/system/$SERVICE_NAME-backup.service" <<UNIT
[Unit]
Description=Respaldo de $SERVICE_NAME

[Service]
Type=oneshot
User=$SERVICE_USER
Group=$SERVICE_USER
ExecStart=/bin/bash $TARGET/app/deploy/backup.sh $DATA_DIR $BACKUP_DIR $BACKUP_DAYS
UMask=0027
$HARDENING
ReadWritePaths=$BACKUP_DIR
PrivateNetwork=true
RestrictAddressFamilies=AF_UNIX
UNIT

cat > "/etc/systemd/system/$SERVICE_NAME-backup.timer" <<UNIT
[Unit]
Description=Respaldo diario de $SERVICE_NAME

[Timer]
OnCalendar=*-*-* 12:00:00 UTC
RandomizedDelaySec=15min
Persistent=true

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME"
systemctl enable --now "$SERVICE_NAME-backup.timer"
echo "Servicio $SERVICE_NAME instalado en 127.0.0.1:$PORT, con respaldo diario en $BACKUP_DIR (se guardan $BACKUP_DAYS días)."
echo "Falta completar TELEGRAM_BOT_TOKEN y STAFF_PIN en $ENV_FILE y reiniciar: systemctl restart $SERVICE_NAME"
echo "SETUP_KEY y SESSION_SECRET salieron al azar; la SETUP_KEY para /vincular la leés con: sudo grep ^SETUP_KEY= $ENV_FILE"
