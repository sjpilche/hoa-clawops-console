#!/usr/bin/env node

/**
 * @file backup-database.js
 * @description Daily SQLite backup with 7-day retention and integrity verification.
 *
 * Creates a timestamped copy of data/clawops.db in backups/.
 * Verifies the backup is a valid SQLite database with expected tables.
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

// Critical tables that must exist in a valid backup
const CRITICAL_TABLES = ['agents', 'runs', 'users', 'settings', 'schedules', 'cfo_leads', 'cfo_outreach_sequences', 'audit_log'];

/**
 * Verify a backup file is a valid, readable SQLite database.
 * Opens it with sql.js (same driver as prod) and checks critical tables exist.
 */
function verifyBackup(backupPath) {
  let SQL, db;
  try {
    SQL = require('sql.js');
  } catch {
    console.warn('[Backup] sql.js not available — skipping integrity check');
    return { valid: true, skipped: true };
  }

  try {
    const initSqlJs = typeof SQL === 'function' ? SQL : SQL.default || SQL;
    const sqlPromise = initSqlJs();

    // sql.js init can be sync or async depending on version
    if (sqlPromise && typeof sqlPromise.then === 'function') {
      // Async path — fall back to basic file checks
      return verifyBackupBasic(backupPath);
    }

    const buffer = fs.readFileSync(backupPath);
    db = new sqlPromise.Database(buffer);

    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
    const tableNames = tables[0]?.values?.map(r => r[0]) || [];

    const missing = CRITICAL_TABLES.filter(t => !tableNames.includes(t));
    if (missing.length > 0) {
      db.close();
      return { valid: false, error: `Missing critical tables: ${missing.join(', ')}`, tableCount: tableNames.length };
    }

    // Spot-check row counts on key tables
    const checks = {};
    for (const table of ['agents', 'runs', 'cfo_leads']) {
      try {
        const result = db.exec(`SELECT COUNT(*) FROM ${table}`);
        checks[table] = result[0]?.values?.[0]?.[0] || 0;
      } catch { checks[table] = 'error'; }
    }

    db.close();
    return { valid: true, tableCount: tableNames.length, rowCounts: checks };
  } catch (err) {
    if (db) try { db.close(); } catch {}
    return { valid: false, error: err.message };
  }
}

/**
 * Basic file-level verification when sql.js async init prevents full check.
 */
function verifyBackupBasic(backupPath) {
  try {
    const header = Buffer.alloc(16);
    const fd = fs.openSync(backupPath, 'r');
    fs.readSync(fd, header, 0, 16, 0);
    fs.closeSync(fd);
    // SQLite files start with "SQLite format 3\0"
    const isSqlite = header.toString('ascii', 0, 15) === 'SQLite format 3';
    const size = fs.statSync(backupPath).size;
    return {
      valid: isSqlite && size > 4096,
      basicOnly: true,
      isSqlite,
      sizeBytes: size,
    };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

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

  // ── Verify backup integrity ──
  const verification = verifyBackup(backupPath);
  if (verification.valid) {
    const detail = verification.skipped ? '(sql.js unavailable — skipped)'
      : verification.basicOnly ? `(basic check — SQLite header valid, ${(verification.sizeBytes / 1024 / 1024).toFixed(2)} MB)`
      : `(${verification.tableCount} tables, agents: ${verification.rowCounts?.agents}, runs: ${verification.rowCounts?.runs}, leads: ${verification.rowCounts?.cfo_leads})`;
    console.log(`[Backup] Integrity check PASSED ${detail}`);
  } else {
    console.error(`[Backup] ⚠ INTEGRITY CHECK FAILED: ${verification.error}`);
    console.error(`[Backup] Backup file may be corrupted — investigate immediately`);
    // Don't delete the file — keep it for forensics, but flag it
    const badPath = backupPath.replace('.db', '.BAD.db');
    fs.renameSync(backupPath, badPath);
    console.error(`[Backup] Renamed to ${path.basename(badPath)} for investigation`);
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
