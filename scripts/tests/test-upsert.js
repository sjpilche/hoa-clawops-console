#!/usr/bin/env node
/**
 * Test upsertCommunity directly with real-looking scraped data
 * to find why nothing is being inserted.
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const DB_PATH = path.resolve('./hoa_leads.sqlite');

function dbGet(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) { const r = stmt.getAsObject(); stmt.free(); return r; }
  stmt.free();
  return null;
}

function dbRun(db, sql, params = []) {
  db.run(sql, params);
}

function isLikelyManagementCompany(result) {
  const nameLower = (result.name || '').toLowerCase();
  const categoryLower = (result.category || '').toLowerCase();
  const MGMT_SIGNALS = ['management', 'property management', 'association management',
    'community management', 'hoa management', 'cam services', 'realty', 'real estate management'];
  if (categoryLower.includes('property management')) return true;
  if (categoryLower.includes('real estate agent')) return true;
  return MGMT_SIGNALS.some(sig => nameLower.includes(sig));
}

function isIrrelevantResult(result) {
  const categoryLower = (result.category || '').toLowerCase();
  const IRRELEVANT_CATEGORIES = ['restaurant', 'cafe', 'bar', 'store', 'shop', 'salon',
    'gym', 'church', 'school', 'hospital', 'doctor', 'dentist',
    'gas station', 'car wash', 'auto repair', 'bank', 'pharmacy'];
  return IRRELEVANT_CATEGORIES.some(cat => categoryLower.includes(cat));
}

// Test data — what the scraper actually returns
const testResults = [
  { name: 'Davis Gardens Homeowners Associates', address: 'Association / Organization', rating: 4.7, reviewCount: 0, category: 'Association / Organization', phone: null, mapsUrl: null, placeId: null },
  { name: 'Key Colony Home Owners Association', address: 'Condominium complex', rating: 4.6, reviewCount: 0, category: 'Condominium complex', phone: null, mapsUrl: null, placeId: null },
  { name: 'Bay Point Property Owners Association', address: 'Real estate agency', rating: 4.4, reviewCount: 0, category: 'Real estate agency', phone: null, mapsUrl: null, placeId: null },
  { name: 'Islands of Cocoplum', address: 'Homeowners\' association', rating: 4.8, reviewCount: 0, category: 'Homeowners\' association', phone: null, mapsUrl: null, placeId: null },
  { name: 'Cadisa Inc. Miami Property Management Condo HOA', address: 'Property management company', rating: 3.8, reviewCount: 0, category: 'Property management company', phone: null, mapsUrl: null, placeId: null },
  { name: 'Monterey Homeowners Association', address: 'Association / Organization', rating: 3.8, reviewCount: 0, category: 'Association / Organization', phone: null, mapsUrl: null, placeId: null },
];

(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(DB_PATH));

  console.log('Testing each result:\n');
  for (const r of testResults) {
    const irrelevant = isIrrelevantResult(r);
    const isMgmt = isLikelyManagementCompany(r);
    console.log(`"${r.name}"`);
    console.log(`  category: ${r.category}`);
    console.log(`  isIrrelevant: ${irrelevant}`);
    console.log(`  isMgmt: ${isMgmt}`);

    if (!irrelevant && !isMgmt) {
      // Try insert directly
      const nowIso = new Date().toISOString();
      try {
        dbRun(db, `
          INSERT INTO hoa_communities (
            name, address, city, state, zip, zip_code, phone,
            website_url, google_maps_url, google_place_id,
            google_rating, review_count, category,
            is_management_company,
            source, search_query, geo_target_id,
            discovered_at, last_seen_at, created_at,
            needs_review_scan, needs_website_scrape,
            needs_contact_enrichment, needs_minutes_scan,
            website_scrape_status, contact_enrichment_status, review_scan_status
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            0,
            'google_maps', ?, ?,
            ?, ?, ?,
            1, 1,
            1, 1,
            'pending', 'pending', 'pending'
          )
        `, [
          r.name, null, null, null, null, null, null,
          null, null, null,
          r.rating || null, r.reviewCount || null, r.category || null,
          'test-query', 'south-florida',
          nowIso, nowIso, nowIso,
        ]);
        console.log(`  → INSERTED OK`);
      } catch (e) {
        console.log(`  → INSERT FAILED: ${e.message}`);
      }
    } else {
      console.log(`  → SKIPPED (irrelevant=${irrelevant}, mgmt=${isMgmt})`);
    }
    console.log('');
  }

  // Count what we inserted
  const total = dbGet(db, "SELECT COUNT(*) as cnt FROM hoa_communities WHERE source='google_maps'");
  console.log(`Total google_maps communities in DB: ${total?.cnt || 0}`);

  // Save
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  console.log('Saved to disk.');
  db.close();
})();
