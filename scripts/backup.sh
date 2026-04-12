#!/usr/bin/env bash
set -euo pipefail

# Autonome Database Backup Script
# Usage: ./scripts/backup.sh [DATABASE_URL]
# If DATABASE_URL is not passed as argument, reads from environment.

DB_URL="${1:-${DATABASE_URL:-}}"

if [ -z "$DB_URL" ]; then
  echo "Error: DATABASE_URL is required."
  echo "Usage: ./scripts/backup.sh <DATABASE_URL>"
  echo "   or: DATABASE_URL=... ./scripts/backup.sh"
  exit 1
fi

BACKUP_DIR="$(dirname "$0")/../backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="autonome_${TIMESTAMP}.sql"
FILEPATH="${BACKUP_DIR}/${FILENAME}"

echo "Backing up database to ${FILEPATH}..."
pg_dump "$DB_URL" > "$FILEPATH"
echo "Backup complete: ${FILEPATH} ($(du -h "$FILEPATH" | cut -f1))"
