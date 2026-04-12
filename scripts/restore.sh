#!/usr/bin/env bash
set -euo pipefail

# Autonome Database Restore Script
# Usage: ./scripts/restore.sh <backup_file> [DATABASE_URL]

BACKUP_FILE="${1:-}"
DB_URL="${2:-${DATABASE_URL:-}}"

if [ -z "$BACKUP_FILE" ]; then
  echo "Error: Backup file path is required."
  echo "Usage: ./scripts/restore.sh <backup_file> [DATABASE_URL]"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file not found: $BACKUP_FILE"
  exit 1
fi

if [ -z "$DB_URL" ]; then
  echo "Error: DATABASE_URL is required."
  echo "Usage: ./scripts/restore.sh <backup_file> <DATABASE_URL>"
  echo "   or: DATABASE_URL=... ./scripts/restore.sh <backup_file>"
  exit 1
fi

echo "WARNING: This will overwrite the database at: $DB_URL"
echo "Restoring from: $BACKUP_FILE"
read -p "Are you sure? (y/N) " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "Restore cancelled."
  exit 0
fi

echo "Restoring database..."
psql "$DB_URL" < "$BACKUP_FILE"
echo "Restore complete."
