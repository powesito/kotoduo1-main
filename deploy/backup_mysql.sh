#!/usr/bin/env bash
# Respaldo diario de la base de datos. Guarda 14 días. Úsalo desde cron, por ejemplo:
#   30 2 * * *  /srv/kotoduo/deploy/backup_mysql.sh >> /var/log/kotoduo-backup.log 2>&1
# Credenciales: crea ~/.my.cnf (chmod 600) del usuario que ejecuta, con [client] user= y password=.
# Importante: copia también la carpeta de respaldos a OTRO equipo o nube; un respaldo en el mismo disco no te salva si el disco falla.
set -euo pipefail

DB="${DB_NAME:-kotoduo}"
DESTINO="${BACKUP_DIR:-/var/backups/kotoduo}"
mkdir -p "$DESTINO"
ARCHIVO="$DESTINO/${DB}_$(date +%Y%m%d_%H%M%S).sql.gz"

mysqldump --single-transaction --routines --default-character-set=utf8mb4 "$DB" | gzip > "$ARCHIVO"
find "$DESTINO" -name "${DB}_*.sql.gz" -mtime +14 -delete

# Copia fuera del servidor (opcional pero muy recomendable). Define UNA de estas variables:
#   RCLONE_DESTINO=remoto:kotoduo        (Drive, S3, etc.; requiere `rclone config`)
#   RSYNC_DESTINO=usuario@otro-equipo:/respaldos/kotoduo
if [ -n "${RCLONE_DESTINO:-}" ]; then
  rclone copy "$ARCHIVO" "$RCLONE_DESTINO"
elif [ -n "${RSYNC_DESTINO:-}" ]; then
  rsync -a "$ARCHIVO" "$RSYNC_DESTINO/"
else
  echo "AVISO: sin copia remota (define RCLONE_DESTINO o RSYNC_DESTINO)." >&2
fi
echo "$(date -Is) respaldo OK: $ARCHIVO ($(du -h "$ARCHIVO" | cut -f1))"
# Restaurar:  gunzip < archivo.sql.gz | mysql kotoduo
