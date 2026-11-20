#!/usr/bin/env bash
set -euo pipefail
umask 027

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  echo "Uso: bash deploy/backup.sh <carpeta-de-datos> <carpeta-de-respaldo> [días-que-se-guardan]"
  exit 1
fi

DATA_DIR="${1%/}"
BACKUP_DIR="${2%/}"
KEEP_DAYS="${3:-30}"

case "$KEEP_DAYS" in
  ''|*[!0-9]*) echo "Los días que se guardan tienen que ser un número."; exit 1 ;;
esac
if [ ! -f "$DATA_DIR/events.jsonl" ]; then
  echo "No hay $DATA_DIR/events.jsonl: revisá la carpeta de datos."
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%F)"
FINAL="$BACKUP_DIR/respaldo-$STAMP.tar.gz"
SNAPSHOT="$BACKUP_DIR/.events-$STAMP.jsonl"
PARTIAL="$BACKUP_DIR/.respaldo-$STAMP.tar.gz.partial"
trap 'rm -f "$SNAPSHOT" "$PARTIAL"' EXIT

cp "$DATA_DIR/events.jsonl" "$SNAPSHOT"
if [ -s "$SNAPSHOT" ] && [ -n "$(tail -c 1 "$SNAPSHOT")" ]; then
  sed -i '$ d' "$SNAPSHOT"
fi

ARCHIVE=(-czf "$PARTIAL" --transform "s|^\\.events-$STAMP\\.jsonl\$|events.jsonl|" -C "$BACKUP_DIR" ".events-$STAMP.jsonl")
if [ -d "$DATA_DIR/reports" ]; then
  ARCHIVE+=(-C "$DATA_DIR" reports)
fi
tar "${ARCHIVE[@]}"
tar -tzf "$PARTIAL" >/dev/null
mv "$PARTIAL" "$FINAL"

find "$BACKUP_DIR" -maxdepth 1 -type f -name 'respaldo-*.tar.gz' -mtime +"$KEEP_DAYS" -delete

echo "Respaldo listo: $FINAL ($(wc -l < "$SNAPSHOT") líneas del registro)."
