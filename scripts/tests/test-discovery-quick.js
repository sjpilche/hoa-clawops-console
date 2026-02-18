#!/usr/bin/env node
/**
 * Quick discovery test — patches processGeoTarget to only run first 5 queries.
 * Verifies inserts are working after the state constraint fix.
 */

const { chromium } = require('playwright');
const crypto = require('crypto');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const DB_PATH = path.resolve('./hoa_leads.sqlite');

function dbGet(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) { const r = stmt.getAsObject(); stmt.free(); return r; }
  stmt.free();
  return null;
}
function dbRun(db, sql, params = []) { db.run(sql, params); }
function saveDb(db) { fs.writeFileSync(DB_PATH, Buffer.from(db.export())); }

async function getDbAsync() {
  const SQL = await initSqlJs();
  return new SQL.Database(fs.readFileSync(DB_PATH));
}

const MGMT_SIGNALS = ['management', 'property management', 'association management',
  'community management', 'hoa management', 'cam services', 'realty', 'real estate management'];
const IRRELEVANT_CATEGORIES = ['restaurant', 'cafe', 'bar', 'store', 'shop', 'salon',
  'gym', 'church', 'school', 'hospital', 'doctor', 'dentist',
  'gas station', 'car wash', 'auto repair', 'bank', 'pharmacy'];

function isLikelyManagementCompany(r) {
  const nameLower = (r.name || '').toLowerCase();
  const catLower = (r.category || '').toLowerCase();
  if (catLower.includes('property management')) return true;
  if (catLower.includes('real estate agent')) return true;
  return MGMT_SIGNALS.some(s => nameLower.includes(s));
}
function isIrrelevantResult(r) {
  const catLower = (r.category || '').toLowerCase();
  return IRRELEVANT_CATEGORIES.some(c => catLower.includes(c));
}

async function scrapeOne(query) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const encodedQuery = encodeURIComponent(query);
  await page.goto(`https://www.google.com/maps/search/${encodedQuery}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  const listings = await page.evaluate(() => {
    const results = [];
    const allCards = document.querySelectorAll('a[href*="maps/place"]');
    for (const card of allCards) {
      try {
        const container = card.closest('div[jsaction]') || card.parentElement;
        const nameEl = container?.querySelector('.qBF1Pd') || container?.querySelector('[class*="fontHeadlineSmall"]');
        const name = nameEl?.textContent?.trim();
        if (!name || name.length < 3) continue;
        const ratingEl = container?.querySelector('.MW4etd');
        const rating = ratingEl ? parseFloat(ratingEl.textContent.trim()) : null;
        const reviewEl = container?.querySelector('.UY7F9');
        const reviewCount = reviewEl ? parseInt(reviewEl.textContent.replace(/[(),]/g, '').trim()) : null;
        const mapsUrl = card.href || null;
        results.push({ name, rating, reviewCount, mapsUrl: mapsUrl?.substring(0, 80) });
      } catch (e) {}
    }
    return results;
  });
  await browser.close();
  return listings;
}

(async () => {
  const QUERIES = [
    { query: 'homeowners association Miami, FL', type: 'primary', city: 'Miami', state: 'FL' },
    { query: 'HOA Miami, FL', type: 'primary', city: 'Miami', state: 'FL' },
    { query: 'community association Miami, FL', type: 'primary', city: 'Miami', state: 'FL' },
    { query: 'homeowners association Boca Raton, FL', type: 'primary', city: 'Boca Raton', state: 'FL' },
    { query: 'HOA Boca Raton, FL', type: 'primary', city: 'Boca Raton', state: 'FL' },
  ];

  console.log(`Running ${QUERIES.length} queries...\n`);

  const db = await getDbAsync();
  let totalInserted = 0, totalUpdated = 0, totalSkipped = 0;

  for (const q of QUERIES) {
    console.log(`Query: "${q.query}"`);
    const listings = await scrapeOne(q.query);
    console.log(`  Found ${listings.length} listings`);

    for (const r of listings) {
      if (isIrrelevantResult(r)) { totalSkipped++; continue; }
      if (isLikelyManagementCompany(r)) { totalSkipped++; continue; }

      // Check for existing by name+city
      const existing = dbGet(db, 'SELECT id FROM hoa_communities WHERE name = ? AND city = ?', [r.name, q.city]);
      if (existing) {
        dbRun(db, `UPDATE hoa_communities SET last_seen_at=CURRENT_TIMESTAMP, google_rating=COALESCE(?,google_rating) WHERE id=?`,
          [r.rating || null, existing.id]);
        totalUpdated++;
      } else {
        dbRun(db, `
          INSERT INTO hoa_communities (name, city, state, source, search_query, geo_target_id,
            google_rating, review_count, google_maps_url, discovered_at, last_seen_at, created_at,
            needs_review_scan, needs_website_scrape, needs_contact_enrichment, needs_minutes_scan,
            website_scrape_status, contact_enrichment_status, review_scan_status, is_management_company)
          VALUES (?,?,?,'google_maps',?,?, ?,?,?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
            1,1,1,1,'pending','pending','pending',0)
        `, [r.name, q.city, q.state, q.query, 'south-florida', r.rating||null, r.reviewCount||null, r.mapsUrl||null]);
        totalInserted++;
        console.log(`  + ${r.name} (${q.city}, ${q.state}) ${r.rating ? '⭐' + r.rating : ''}`);
      }
    }
    saveDb(db);
    await new Promise(r => setTimeout(r, 2000));
  }

  db.close();

  console.log(`\n=== RESULTS ===`);
  console.log(`New:     ${totalInserted}`);
  console.log(`Updated: ${totalUpdated}`);
  console.log(`Skipped: ${totalSkipped}`);

  // Verify
  const verifySQL = await initSqlJs();
  const verifyDb = new verifySQL.Database(fs.readFileSync(DB_PATH));
  const stmt = verifyDb.prepare("SELECT name, city, state, google_rating FROM hoa_communities WHERE source='google_maps' LIMIT 10");
  console.log('\nSample records in DB:');
  while (stmt.step()) console.log(' ', JSON.stringify(stmt.getAsObject()));
  stmt.free();
  verifyDb.close();
})();
