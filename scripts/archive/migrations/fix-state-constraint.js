#!/usr/bin/env node
/**
 * Fix NOT NULL constraint on hoa_communities.state
 *
 * SQLite doesn't support ALTER COLUMN, so we:
 * 1. Rename old table to _old
 * 2. Create new table without NOT NULL on state
 * 3. Copy all data
 * 4. Drop old table
 *
 * Safe to run multiple times — checks if state is already nullable.
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.resolve('./hoa_leads.sqlite');

(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(DB_PATH));

  // Check current state column constraint
  const stmt = db.prepare('PRAGMA table_info(hoa_communities)');
  let stateNotNull = false;
  while (stmt.step()) {
    const r = stmt.getAsObject();
    if (r.name === 'state' && r.notnull === 1) stateNotNull = true;
  }
  stmt.free();

  if (!stateNotNull) {
    console.log('✅ state column is already nullable — no fix needed');
    db.close();
    return;
  }

  console.log('Fixing NOT NULL constraint on state column...');

  // Get current row count
  const countStmt = db.prepare('SELECT COUNT(*) as cnt FROM hoa_communities');
  countStmt.step();
  const rowCount = countStmt.getAsObject().cnt;
  countStmt.free();
  console.log(`  Rows to preserve: ${rowCount}`);

  db.run('BEGIN TRANSACTION');
  try {
    // 1. Rename
    db.run('ALTER TABLE hoa_communities RENAME TO hoa_communities_old');

    // 2. Create new table — identical schema but state TEXT (nullable)
    db.run(`
      CREATE TABLE hoa_communities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        state TEXT,
        city TEXT,
        zip TEXT,
        county TEXT,
        unit_count INTEGER,
        website_url TEXT,
        document_portal_url TEXT,
        management_company TEXT,
        management_company_url TEXT,
        source TEXT,
        source_url TEXT,
        portal_type TEXT,
        status TEXT,
        priority INTEGER,
        last_scanned DATETIME,
        created_at DATETIME,
        google_signal_score REAL,
        google_signal_tier TEXT,
        google_signal_keywords TEXT,
        total_google_reviews INTEGER,
        signal_review_count INTEGER,
        google_last_reviewed_at TEXT,
        google_maps_url TEXT,
        google_place_id TEXT,
        avg_star_rating REAL,
        zip_code TEXT,
        phone TEXT,
        google_rating REAL,
        review_count INTEGER,
        category TEXT,
        search_query TEXT,
        geo_target_id TEXT,
        discovered_at DATETIME,
        last_seen_at DATETIME,
        needs_review_scan INTEGER DEFAULT 0,
        needs_website_scrape INTEGER DEFAULT 0,
        needs_contact_enrichment INTEGER DEFAULT 0,
        needs_minutes_scan INTEGER DEFAULT 0,
        website_scrape_status TEXT DEFAULT 'pending',
        contact_enrichment_status TEXT DEFAULT 'pending',
        review_scan_status TEXT DEFAULT 'pending',
        is_management_company INTEGER DEFAULT 0,
        management_company_id TEXT,
        address TEXT
      )
    `);

    // 3. Copy all data
    db.run(`INSERT INTO hoa_communities SELECT * FROM hoa_communities_old`);

    // 4. Drop old
    db.run('DROP TABLE hoa_communities_old');

    db.run('COMMIT');

    // Verify
    const verifyStmt = db.prepare('SELECT COUNT(*) as cnt FROM hoa_communities');
    verifyStmt.step();
    const newCount = verifyStmt.getAsObject().cnt;
    verifyStmt.free();

    console.log(`  Rows after migration: ${newCount}`);
    if (newCount !== rowCount) {
      throw new Error(`Row count mismatch! Before: ${rowCount}, After: ${newCount}`);
    }

    // Save
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
    console.log('✅ Migration complete — state column is now nullable');

  } catch (e) {
    db.run('ROLLBACK');
    console.error('Migration failed:', e.message);
    process.exit(1);
  }

  db.close();
})();
