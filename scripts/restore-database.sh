#!/usr/bin/env bash
#
# Database Restore Script for ClawOps Console
#
# Restores a database backup. ALWAYS creates a backup of current database first.
#
# USAGE:
#   ./scripts/restore-database.sh <backup-file>
#   ./scripts/restore-database.sh backups/clawops-backup-20260212-140530.db
#
# SAFETY:
#   - Current database is backed up to ./data/clawops-pre-restore-<timestamp>.db
#   - Backup integrity is verified before restore
#   - Restored database is verified after restore
#

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DB_PATH="${DB_PATH:-$PROJECT_ROOT/data/clawops.db}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
  echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
  echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" >&2
}

warn() {
  echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

# Check arguments
if [[ $# -eq 0 ]]; then
  error "No backup file specified!"
  echo ""
  echo "Usage: $0 <backup-file>"
  echo ""
  echo "Available backups:"
  find "$PROJECT_ROOT/backups" -name "clawops-backup-*.db" -type f -printf '%T@ %p\n' 2>/dev/null | \
    sort -rn | \
    head -10 | \
    awk '{print "  - " $2}' || echo "  (no backups found)"
  exit 1
fi

BACKUP_FILE="$1"

# Check if backup file exists
if [[ ! -f "$BACKUP_FILE" ]]; then
  error "Backup file not found: $BACKUP_FILE"
  exit 1
fi

# Verify backup integrity BEFORE restore
log "Verifying backup integrity..."
if ! sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;" > /dev/null 2>&1; then
  error "Backup integrity check FAILED!"
  error "The backup file appears to be corrupt: $BACKUP_FILE"
  error "Restore ABORTED to prevent data loss."
  exit 1
fi
log "✅ Backup integrity verified"

# Get backup info
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
BACKUP_MTIME=$(stat -c %y "$BACKUP_FILE" | cut -d'.' -f1)
BACKUP_TABLES=$(sqlite3 "$BACKUP_FILE" "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" 2>/dev/null || echo "unknown")

log "Backup information:"
log "  File: $BACKUP_FILE"
log "  Size: $BACKUP_SIZE"
log "  Created: $BACKUP_MTIME"
log "  Tables: $BACKUP_TABLES"

# Check if current database exists
if [[ ! -f "$DB_PATH" ]]; then
  warn "Current database not found at: $DB_PATH"
  warn "This will be a fresh restore (no backup of current database)"
else
  # Create safety backup of current database BEFORE restore
  TIMESTAMP=$(date +'%Y%m%d-%H%M%S')
  SAFETY_BACKUP="$PROJECT_ROOT/data/clawops-pre-restore-$TIMESTAMP.db"

  log "Creating safety backup of current database..."
  log "Safety backup: $SAFETY_BACKUP"

  sqlite3 "$DB_PATH" ".backup '$SAFETY_BACKUP'"

  if [[ $? -eq 0 ]]; then
    SAFETY_SIZE=$(du -h "$SAFETY_BACKUP" | cut -f1)
    log "✅ Safety backup created ($SAFETY_SIZE)"
  else
    error "❌ Failed to create safety backup!"
    error "Restore ABORTED to prevent data loss."
    exit 1
  fi
fi

# Confirm restore
warn "⚠️  This will REPLACE the current database with the backup."
warn "⚠️  Current database: $DB_PATH"
if [[ -f "$SAFETY_BACKUP" ]]; then
  warn "⚠️  Safety backup saved at: $SAFETY_BACKUP"
fi

read -p "Are you sure you want to proceed? (yes/no): " CONFIRM

if [[ "$CONFIRM" != "yes" ]]; then
  log "Restore cancelled by user"
  exit 0
fi

# Perform restore
log "Restoring database..."
log "Source: $BACKUP_FILE"
log "Destination: $DB_PATH"

cp -f "$BACKUP_FILE" "$DB_PATH"

if [[ $? -eq 0 ]]; then
  log "✅ Database restored successfully"
else
  error "❌ Restore failed!"
  if [[ -f "$SAFETY_BACKUP" ]]; then
    error "Rolling back to safety backup..."
    cp -f "$SAFETY_BACKUP" "$DB_PATH"
    error "Rollback complete. Your original database has been restored."
  fi
  exit 1
fi

# Verify restored database
log "Verifying restored database..."
if ! sqlite3 "$DB_PATH" "PRAGMA integrity_check;" > /dev/null 2>&1; then
  error "❌ Restored database integrity check FAILED!"
  if [[ -f "$SAFETY_BACKUP" ]]; then
    error "Rolling back to safety backup..."
    cp -f "$SAFETY_BACKUP" "$DB_PATH"
    error "Rollback complete. Your original database has been restored."
  fi
  exit 1
fi

log "✅ Restored database integrity verified"

# Show restore summary
CURRENT_SIZE=$(du -h "$DB_PATH" | cut -f1)
CURRENT_TABLES=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" 2>/dev/null || echo "unknown")

log "Restore complete!"
log "  Current database size: $CURRENT_SIZE"
log "  Tables: $CURRENT_TABLES"

if [[ -f "$SAFETY_BACKUP" ]]; then
  log "  Safety backup: $SAFETY_BACKUP (can be deleted if restore is successful)"
fi

log "✅ Restore process complete!"
exit 0
