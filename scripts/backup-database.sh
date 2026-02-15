#!/usr/bin/env bash
#
# Database Backup Script for ClawOps Console
#
# This script creates timestamped backups of the SQLite database
# and automatically rotates old backups (keeps last 7 days).
#
# USAGE:
#   ./scripts/backup-database.sh
#
# SCHEDULING (cron):
#   # Daily backup at 2 AM
#   0 2 * * * cd /path/to/clawops && ./scripts/backup-database.sh >> ./logs/backup.log 2>&1
#
# SCHEDULING (Windows Task Scheduler):
#   Use backup-database.bat instead
#

set -euo pipefail  # Exit on error, undefined vars, and pipe failures

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DB_PATH="${DB_PATH:-$PROJECT_ROOT/data/clawops.db}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
  echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
  echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" >&2
}

warn() {
  echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

# Check if database exists
if [[ ! -f "$DB_PATH" ]]; then
  error "Database not found at: $DB_PATH"
  error "Set DB_PATH environment variable or check your configuration"
  exit 1
fi

# Create backup directory if it doesn't exist
if [[ ! -d "$BACKUP_DIR" ]]; then
  mkdir -p "$BACKUP_DIR"
  log "Created backup directory: $BACKUP_DIR"
fi

# Generate timestamp for backup filename
TIMESTAMP=$(date +'%Y%m%d-%H%M%S')
BACKUP_FILE="$BACKUP_DIR/clawops-backup-$TIMESTAMP.db"

log "Starting database backup..."
log "Source: $DB_PATH"
log "Destination: $BACKUP_FILE"

# Perform backup using SQLite's backup API (safer than cp)
# This ensures a consistent snapshot even if database is in use
sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"

if [[ $? -eq 0 ]]; then
  # Get backup file size
  BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  log "✅ Backup completed successfully ($BACKUP_SIZE)"

  # Verify backup integrity
  log "Verifying backup integrity..."
  sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;" > /dev/null 2>&1

  if [[ $? -eq 0 ]]; then
    log "✅ Backup integrity verified"
  else
    error "❌ Backup integrity check failed!"
    error "Backup may be corrupt: $BACKUP_FILE"
    exit 1
  fi
else
  error "❌ Backup failed!"
  exit 1
fi

# Rotate old backups (keep last N days)
log "Rotating old backups (keeping last $RETENTION_DAYS days)..."

# Find and delete backups older than retention period
OLD_BACKUPS=$(find "$BACKUP_DIR" -name "clawops-backup-*.db" -type f -mtime +$RETENTION_DAYS 2>/dev/null || true)

if [[ -n "$OLD_BACKUPS" ]]; then
  echo "$OLD_BACKUPS" | while read -r old_backup; do
    log "Deleting old backup: $(basename "$old_backup")"
    rm -f "$old_backup"
  done

  DELETED_COUNT=$(echo "$OLD_BACKUPS" | wc -l)
  log "Deleted $DELETED_COUNT old backup(s)"
else
  log "No old backups to delete"
fi

# Show current backup status
BACKUP_COUNT=$(find "$BACKUP_DIR" -name "clawops-backup-*.db" -type f | wc -l)
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)

log "Backup status:"
log "  Total backups: $BACKUP_COUNT"
log "  Total size: $TOTAL_SIZE"
log "  Retention: $RETENTION_DAYS days"

# List recent backups
log "Recent backups:"
find "$BACKUP_DIR" -name "clawops-backup-*.db" -type f -printf '%T@ %p\n' | \
  sort -rn | \
  head -5 | \
  awk '{print $2}' | \
  while read -r backup; do
    SIZE=$(du -h "$backup" | cut -f1)
    MTIME=$(stat -c %y "$backup" | cut -d'.' -f1)
    echo "  - $(basename "$backup") ($SIZE, modified: $MTIME)"
  done

log "✅ Backup process complete!"

# Exit successfully
exit 0
