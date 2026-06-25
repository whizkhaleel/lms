#!/usr/bin/env bash
set -euo pipefail

# Database backup script for LMS.
# Dumps all databases in the PostgreSQL container to a timestamped file.
#
# Usage:
#   ./scripts/backup-db.sh                    # backup to default directory
#   ./scripts/backup-db.sh /path/to/backups   # backup to custom directory
#
# Cron (daily at 2am):
#   0 2 * * * /path/to/lms/scripts/backup-db.sh /backups

BACKUP_DIR="${1:-./backups}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/lms_db_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[Backup] Starting database backup..."

docker compose exec -T postgres pg_dump \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  lms | gzip > "$BACKUP_FILE"

echo "[Backup] Complete — $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# Keep only last 30 days of backups
find "$BACKUP_DIR" -name 'lms_db_*.sql.gz' -mtime +30 -delete
