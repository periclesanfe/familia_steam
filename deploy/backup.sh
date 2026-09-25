#!/bin/sh
# 08 §8.2: dump diário do banco; mantém 30 dias. A cópia para fora do servidor é feita por quem
# opera (ex.: rclone/rsync da pasta ./backups) — sem ela, o backup não protege contra perda do disco.
set -eu
arquivo="/backups/consorcio-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump -h db -U consorcio -d consorcio -Fc -f "$arquivo"
find /backups -name 'consorcio-*.dump' -mtime +30 -delete
echo "backup ok: $arquivo"
