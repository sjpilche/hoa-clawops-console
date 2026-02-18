#!/usr/bin/env node
/**
 * Run migration 017: Discovery schema
 */
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

(async () => {
  const SQL = await initSqlJs();
  const dbPath = path.resolve('./hoa_leads.sqlite');
  const db = new SQL.Database(fs.readFileSync(dbPath));

  // Run each statement individually for proper error handling
  const statements = [
    // geo_targets
    `CREATE TABLE IF NOT EXISTS geo_targets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cities TEXT NOT NULL DEFAULT '[]',
      states TEXT NOT NULL DEFAULT '[]',
      zip_codes TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 1,
      priority INTEGER NOT NULL DEFAULT 5,
      last_sweep_at DATETIME,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    // hoa_communities new columns (will fail silently if exist)
    `ALTER TABLE hoa_communities ADD COLUMN address TEXT`,
    `ALTER TABLE hoa_communities ADD COLUMN zip_code TEXT`,
    `ALTER TABLE hoa_communities ADD COLUMN phone TEXT`,
    `ALTER TABLE hoa_communities ADD COLUMN google_rating REAL`,
    `ALTER TABLE hoa_communities ADD COLUMN review_count INTEGER DEFAULT 0`,
    `ALTER TABLE hoa_communities ADD COLUMN category TEXT`,
    `ALTER TABLE hoa_communities ADD COLUMN search_query TEXT`,
    `ALTER TABLE hoa_communities ADD COLUMN geo_target_id TEXT`,
    `ALTER TABLE hoa_communities ADD COLUMN discovered_at DATETIME`,
    `ALTER TABLE hoa_communities ADD COLUMN last_seen_at DATETIME`,
    `ALTER TABLE hoa_communities ADD COLUMN needs_review_scan INTEGER DEFAULT 1`,
    `ALTER TABLE hoa_communities ADD COLUMN needs_website_scrape INTEGER DEFAULT 1`,
    `ALTER TABLE hoa_communities ADD COLUMN needs_contact_enrichment INTEGER DEFAULT 1`,
    `ALTER TABLE hoa_communities ADD COLUMN needs_minutes_scan INTEGER DEFAULT 1`,
    `ALTER TABLE hoa_communities ADD COLUMN website_scrape_status TEXT DEFAULT 'pending'`,
    `ALTER TABLE hoa_communities ADD COLUMN contact_enrichment_status TEXT DEFAULT 'pending'`,
    `ALTER TABLE hoa_communities ADD COLUMN review_scan_status TEXT DEFAULT 'pending'`,
    `ALTER TABLE hoa_communities ADD COLUMN is_management_company INTEGER DEFAULT 0`,
    `ALTER TABLE hoa_communities ADD COLUMN management_company_id TEXT`,
    // discovery_searches
    `CREATE TABLE IF NOT EXISTS discovery_searches (
      id TEXT PRIMARY KEY,
      geo_target_id TEXT NOT NULL,
      search_query TEXT NOT NULL,
      search_type TEXT DEFAULT 'primary',
      results_found INTEGER DEFAULT 0,
      new_communities INTEGER DEFAULT 0,
      duplicates_skipped INTEGER DEFAULT 0,
      pages_scraped INTEGER DEFAULT 0,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      duration_seconds INTEGER,
      error_message TEXT,
      FOREIGN KEY (geo_target_id) REFERENCES geo_targets(id)
    )`,
    // discovery_agent_runs
    `CREATE TABLE IF NOT EXISTS discovery_agent_runs (
      id TEXT PRIMARY KEY,
      agent_name TEXT NOT NULL,
      geo_target TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      started_at DATETIME,
      completed_at DATETIME,
      results_count INTEGER DEFAULT 0,
      new_records INTEGER DEFAULT 0,
      updated_records INTEGER DEFAULT 0,
      error_message TEXT,
      cost_estimate REAL DEFAULT 0,
      run_metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    // management_companies
    `CREATE TABLE IF NOT EXISTS management_companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      website_url TEXT,
      phone TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      zip_code TEXT,
      portfolio_size INTEGER,
      google_rating REAL,
      review_count INTEGER,
      is_potential_partner INTEGER DEFAULT 0,
      notes TEXT,
      discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(name, state)
    )`,
    // mgmt_community_map
    `CREATE TABLE IF NOT EXISTS mgmt_community_map (
      id TEXT PRIMARY KEY,
      management_company_id TEXT NOT NULL,
      hoa_community_id INTEGER NOT NULL,
      relationship_source TEXT,
      confirmed INTEGER DEFAULT 0,
      discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (management_company_id) REFERENCES management_companies(id),
      UNIQUE(management_company_id, hoa_community_id)
    )`,
    // indexes
    `CREATE INDEX IF NOT EXISTS idx_communities_geo ON hoa_communities(geo_target_id)`,
    `CREATE INDEX IF NOT EXISTS idx_communities_rating ON hoa_communities(google_rating)`,
    `CREATE INDEX IF NOT EXISTS idx_searches_geo ON discovery_searches(geo_target_id)`,
    `CREATE INDEX IF NOT EXISTS idx_mgmt_portfolio ON management_companies(portfolio_size)`,
    `CREATE INDEX IF NOT EXISTS idx_discovery_runs_status ON discovery_agent_runs(status)`,
    // views
    `CREATE VIEW IF NOT EXISTS v_pipeline_status AS
    SELECT state, COUNT(*) as total_communities,
      SUM(CASE WHEN needs_website_scrape = 1 THEN 1 ELSE 0 END) as awaiting_scrape,
      SUM(CASE WHEN needs_review_scan = 1 THEN 1 ELSE 0 END) as awaiting_review_scan,
      SUM(CASE WHEN needs_contact_enrichment = 1 THEN 1 ELSE 0 END) as awaiting_contact_enrichment,
      SUM(CASE WHEN website_url IS NOT NULL THEN 1 ELSE 0 END) as has_website,
      SUM(CASE WHEN google_rating IS NOT NULL THEN 1 ELSE 0 END) as has_rating,
      ROUND(AVG(google_rating), 2) as avg_rating,
      SUM(review_count) as total_reviews
    FROM hoa_communities WHERE is_management_company = 0
    GROUP BY state ORDER BY total_communities DESC`,
    `CREATE VIEW IF NOT EXISTS v_low_rated_communities AS
    SELECT name, city, state, zip_code, google_rating, review_count,
      website_url, management_company, discovered_at
    FROM hoa_communities
    WHERE google_rating IS NOT NULL AND google_rating <= 3.0 AND review_count >= 5
      AND is_management_company = 0
    ORDER BY google_rating ASC, review_count DESC`,
  ];

  let ok = 0, skipped = 0, errors = [];
  for (const stmt of statements) {
    try {
      db.run(stmt);
      ok++;
    } catch (e) {
      if (e.message.includes('duplicate column') || e.message.includes('already exists')) {
        skipped++;
      } else {
        errors.push({ stmt: stmt.trim().substring(0, 80), err: e.message });
      }
    }
  }

  // Save
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
  db.close();

  console.log('✅ Migration 017 complete');
  console.log('  Statements executed:', ok);
  console.log('  Skipped (already exist):', skipped);
  if (errors.length) {
    console.log('  ⚠️  Errors:');
    errors.forEach(e => console.log('   ', e.err, '->', e.stmt));
  }

  // Verify tables
  const SQL2 = await initSqlJs();
  const db2 = new SQL2.Database(fs.readFileSync(dbPath));
  const tables = db2.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  const views = db2.exec("SELECT name FROM sqlite_master WHERE type='view' ORDER BY name");
  console.log('\nTables:', tables[0]?.values.map(r => r[0]).join(', '));
  console.log('Views:', views[0]?.values.map(r => r[0]).join(', ') || '(none)');

  // Check geo_targets
  const geoCount = db2.exec('SELECT COUNT(*) FROM geo_targets');
  console.log('geo_targets rows:', geoCount[0]?.values[0][0]);

  db2.close();
  console.log('\n✅ Ready to seed geo-targets');
})();
