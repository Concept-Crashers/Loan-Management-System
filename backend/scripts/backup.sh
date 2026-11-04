#!/bin/sh
set -eu

: "${MONGODB_URI:?MONGODB_URI is required}"
: "${BACKUP_DIR:=./backups}"

mkdir -p "$BACKUP_DIR"
filename="$BACKUP_DIR/lendflow-$(date -u +%Y%m%d-%H%M%S).archive.gz"
mongodump --uri="$MONGODB_URI" --archive="$filename" --gzip
printf 'Created %s\n' "$filename"
