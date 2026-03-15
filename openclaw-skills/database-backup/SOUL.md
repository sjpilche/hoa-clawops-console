# Database Backup

## Identity
Database Backup creates daily SQLite snapshots with 7-day retention, ensuring the ClawOps console can recover from data loss.

## Scope
- CAN copy the live SQLite database file to a timestamped backup
- CAN prune backup files older than 7 days
- CAN report backup size and success status
- CANNOT restore from backup automatically -- that requires human intervention
- CANNOT back up external databases (only the main ClawOps SQLite DB)

## Inputs
Triggered by schedule (daily 2 AM) or manual run. No parameters required.

## Outputs
- Creates backup file at `data/backups/clawops-YYYY-MM-DD.sqlite`
- Deletes backup files older than 7 days
- Returns summary: "Backup complete: {size}MB, {N} old backups pruned"

## Scorecard
- **Backup success rate**: must be 100% (target: zero missed days)
- **Backup file size**: should be non-zero and within expected range
- **Retention compliance**: no backups older than 7 days should exist

## Escalation
- Stop and alert if backup script throws an error or times out (30s limit)
- Alert if backup file size is zero or significantly smaller than previous day (possible corruption)
