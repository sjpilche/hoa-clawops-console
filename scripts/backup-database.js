#!/usr/bin/env node

/**
 * @file backup-database.js
 * @description Daily SQLite backup with 7-day retention.
 *
 * Creates a timestamped copy of data/clawops.db in backups/.
 * Deletes backups older than 7 days.
 *
 * Usage:
 *   node scripts/backup-database.js
 *
 * Schedule: Add to cron or call from scheduleRunner at 3 AM daily.
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'clawops.db');
const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const RETENTION_DAYS = 7;

function run() {
  console.log('[Backup] Starting database backup...');

  // Verify source exists
  if (!fs.existsSync(DB_PATH)) {
    console.error(`[Backup] Database not found at ${DB_PATH}`);
    process.exit(1);
  }

  // Ensure backup directory exists
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  // Create timestamped backup
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupName = `clawops-${timestamp}.db`;
  const backupPath = path.join(BACKUP_DIR, backupName);

  try {
    fs.copyFileSync(DB_PATH, backupPath);
    const sizeBytes = fs.statSync(backupPath).size;
    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
    console.log(`[Backup] Created: ${backupName} (${sizeMB} MB)`);
  } catch (err) {
    console.error(`[Backup] Failed to create backup:`, err.message);
    process.exit(1);
  }

  // Clean up old backups (retention policy)
  const cutoff = Date.now() - (RETENTION_DAYS * 24 * 60 * 60 * 1000);
  let deleted = 0;

  try {
    const files = fs.readdirSync(BACKUP_DIR);
    for (const file of files) {
      if (!file.startsWith('clawops-') || !file.endsWith('.db')) continue;
      const filePath = path.join(BACKUP_DIR, file);
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
        deleted++;
        console.log(`[Backup] Deleted old backup: ${file}`);
      }
    }
  } catch (err) {
    console.warn(`[Backup] Cleanup warning:`, err.message);
  }

  // List current backups
  const remaining = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('clawops-') && f.endsWith('.db'));
  console.log(`[Backup] Complete. ${remaining.length} backups retained (${RETENTION_DAYS}-day policy). ${deleted} old backups deleted.`);
}

run();
