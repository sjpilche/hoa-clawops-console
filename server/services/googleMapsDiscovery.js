/**
 * Google Maps HOA Discovery Service
 *
 * Agent 1 — HOA Google Maps Discovery (Geo-Targeted)
 * Cost: $0/month — Playwright web scraping only, no paid APIs
 *
 * Pipeline:
 *   geo_targets → search queries → Google Maps scrape → dedup → hoa_communities
 *   Each new community gets pipeline flags set to trigger Agents 2–5
 */

const { chromium } = require('playwright');
const crypto = require('crypto');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const mssql = require('mssql');
require('dotenv').config({ path: path.resolve('.env.local') });

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE
// ═══════════════════════════════════════════════════════════════════════════

const DB_PATH = path.resolve('./hoa_leads.sqlite');

function getDb() {
  const SQL = require('sql.js');
  // Synchronous init needed for simple query helpers
  // Note: we use async init at service entry points
  throw new Error('Use getDbAsync()');
}

async function getDbAsync() {
  const SQL = await initSqlJs();
  return new SQL.Database(fs.readFileSync(DB_PATH));
}

function saveDb(db) {
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function dbGet(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function dbAll(db, sql, params = []) {
  const results = [];
  const stmt = db.prepare(sql);
  stmt.bind(params);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function dbRun(db, sql, params = []) {
  db.run(sql, params);
}

// ═══════════════════════════════════════════════════════════════════════════
// AZURE SQL SYNC
// ═══════════════════════════════════════════════════════════════════════════

const azureConfig = {
  server: process.env.AZURE_SQL_SERVER,
  database: process.env.AZURE_SQL_DATABASE,
  user: process.env.AZURE_SQL_USER,
  password: process.env.AZURE_SQL_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
    connectTimeout: 30000,
  },
  pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
};

let azurePool = null;

async function getAzurePool() {
  if (!azurePool) {
    azurePool = await mssql.connect(azureConfig);
    console.log('[Discovery] Azure SQL connected');
  }
  return azurePool;
}

async function closeAzurePool() {
  if (azurePool) {
    await azurePool.close();
    azurePool = null;
  }
}

/**
 * Create a prospector_runs record in Azure SQL.
 * Returns the new run GUID, or null if Azure is unavailable.
 */
async function azureCreateRun(geoTargetName) {
  try {
    const pool = await getAzurePool();
    const runId = crypto.randomUUID();
    await pool.request()
      .input('id', mssql.UniqueIdentifier, runId)
      .input('run_type', mssql.NVarChar(100), 'google_maps_discovery')
      .input('status', mssql.NVarChar(50), 'running')
      .input('source_filter', mssql.NVarChar(255), geoTargetName)
      .input('config', mssql.NVarChar(mssql.MAX), JSON.stringify({ geo_target: geoTargetName }))
      .query(`
        INSERT INTO dbo.prospector_runs
          (id, run_type, status, source_filter, config, created_date, started_at)
        VALUES
          (@id, @run_type, @status, @source_filter, @config, GETDATE(), GETDATE())
      `);
    console.log(`[Discovery] Azure run created: ${runId}`);
    return runId;
  } catch (err) {
    console.warn(`[Discovery] Azure createRun failed (non-fatal): ${err.message}`);
    return null;
  }
}

/**
 * Write a discovered HOA community to Azure SQL prospector_leads.
 * Non-fatal — SQLite is the source of truth.
 */
async function azureWriteLead(community, azureRunId) {
  try {
    const pool = await getAzurePool();
    const leadId = crypto.randomUUID();
    await pool.request()
      .input('id', mssql.UniqueIdentifier, leadId)
      .input('run_id', mssql.UniqueIdentifier, azureRunId || null)
      .input('source_name', mssql.NVarChar(255), 'google_maps_discovery')
      .input('association_name', mssql.NVarChar(500), community.name || null)
      .input('city', mssql.NVarChar(100), community.city || null)
      .input('state', mssql.NVarChar(50), community.state || null)
      .input('zip', mssql.NVarChar(20), community.zip || null)
      .input('signal_type', mssql.NVarChar(100), 'google_maps_listing')
      .input('signal_strength', mssql.NVarChar(50), community.rating ? String(community.rating) : null)
      .input('signal_data', mssql.NVarChar(mssql.MAX), JSON.stringify({
        phone: community.phone || null,
        website_url: community.websiteUrl || null,
        google_maps_url: community.mapsUrl || null,
        google_rating: community.rating || null,
        review_count: community.reviewCount || null,
        category: community.category || null,
        search_query: community.searchQuery || null,
        geo_target_id: community.geoTargetId || null,
      }))
      .input('status', mssql.NVarChar(50), 'new')
      .input('score', mssql.Int, community.rating ? Math.round(community.rating * 20) : null)
      .query(`
        INSERT INTO dbo.prospector_leads
          (id, run_id, source_name, association_name, city, state, zip,
           signal_type, signal_strength, signal_data, status, score,
           created_date)
        VALUES
          (@id, @run_id, @source_name, @association_name, @city, @state, @zip,
           @signal_type, @signal_strength, @signal_data, @status, @score,
           GETDATE())
      `);
    return leadId;
  } catch (err) {
    console.warn(`[Discovery] Azure writeLead failed (non-fatal): ${err.message}`);
    return null;
  }
}

/**
 * Complete a prospector_runs record with final stats.
 */
async function azureCompleteRun(azureRunId, stats) {
  if (!azureRunId) return;
  try {
    const pool = await getAzurePool();
    await pool.request()
      .input('id', mssql.UniqueIdentifier, azureRunId)
      .input('status', mssql.NVarChar(50), stats.captcha_hits > 0 && stats.new_communities === 0 ? 'partial' : 'completed')
      .input('leads_found', mssql.Int, stats.results_found || 0)
      .input('leads_qualified', mssql.Int, stats.new_communities || 0)
      .input('pages_scraped', mssql.Int, stats.queries_run || 0)
      .input('results', mssql.NVarChar(mssql.MAX), JSON.stringify(stats))
      .query(`
        UPDATE dbo.prospector_runs SET
          status = @status,
          leads_found = @leads_found,
          leads_qualified = @leads_qualified,
          pages_scraped = @pages_scraped,
          results = @results,
          completed_at = GETDATE(),
          updated_date = GETDATE()
        WHERE id = @id
      `);
    console.log(`[Discovery] Azure run completed: ${azureRunId}`);
  } catch (err) {
    console.warn(`[Discovery] Azure completeRun failed (non-fatal): ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SEARCH QUERY TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

const PRIMARY_QUERIES = [
  'homeowners association {location}',
  'HOA {location}',
  'community association {location}',
  'condominium association {location}',
  'property owners association {location}',
];

const SECONDARY_QUERIES = [
  'HOA management {location}',
  'condo association {location}',
  'master planned community {location}',
  'townhome association {location}',
];

// ═══════════════════════════════════════════════════════════════════════════
// MANAGEMENT COMPANY DETECTION
// ═══════════════════════════════════════════════════════════════════════════

const MGMT_SIGNALS = [
  'management', 'property management', 'association management',
  'community management', 'hoa management', 'cam services',
  'realty', 'real estate management',
];

const IRRELEVANT_CATEGORIES = [
  'restaurant', 'cafe', 'bar', 'store', 'shop', 'salon',
  'gym', 'church', 'school', 'hospital', 'doctor', 'dentist',
  'gas station', 'car wash', 'auto repair', 'bank', 'pharmacy',
];

function isLikelyManagementCompany(result) {
  const nameLower = (result.name || '').toLowerCase();
  const categoryLower = (result.category || '').toLowerCase();
  if (categoryLower.includes('property management')) return true;
  if (categoryLower.includes('real estate agent')) return true;
  return MGMT_SIGNALS.some(sig => nameLower.includes(sig));
}

function isIrrelevantResult(result) {
  const categoryLower = (result.category || '').toLowerCase();
  return IRRELEVANT_CATEGORIES.some(cat => categoryLower.includes(cat));
}

// ═══════════════════════════════════════════════════════════════════════════
// GEO-TARGET MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

async function getNextGeoTarget() {
  const db = await getDbAsync();
  const target = dbGet(db, `
    SELECT * FROM geo_targets
    WHERE is_active = 1
    ORDER BY
      CASE WHEN last_sweep_at IS NULL THEN 0 ELSE 1 END,
      last_sweep_at ASC,
      priority ASC
    LIMIT 1
  `);
  db.close();
  return target;
}

async function getGeoTargetById(id) {
  const db = await getDbAsync();
  const target = dbGet(db, 'SELECT * FROM geo_targets WHERE id = ?', [id]);
  db.close();
  return target;
}

function generateSearchQueries(geoTarget) {
  const cities = JSON.parse(geoTarget.cities || '[]');
  const queries = [];

  for (const { city, state } of cities) {
    const location = `${city}, ${state}`;
    for (const template of PRIMARY_QUERIES) {
      queries.push({
        query: template.replace('{location}', location),
        type: 'primary',
        city,
        state,
      });
    }
  }

  for (const { city, state } of cities) {
    const location = `${city}, ${state}`;
    for (const template of SECONDARY_QUERIES) {
      queries.push({
        query: template.replace('{location}', location),
        type: 'secondary',
        city,
        state,
      });
    }
  }

  return queries;
}

async function markGeoTargetSwept(db, geoTargetId) {
  dbRun(db,
    'UPDATE geo_targets SET last_sweep_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [geoTargetId]
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAYWRIGHT SCRAPER
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
  headless: true,
  timeout: 30000,
  pageWait: 3000,     // Wait after navigation
  actionWait: 2000,   // Wait between actions
  maxPages: 5,        // Max pagination pages per query
  maxResults: 100,    // Max results per query
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
};

/**
 * Scrape Google Maps for a search query
 * Returns array of extracted listing objects
 */
async function scrapeGoogleMaps(query, options = {}) {
  const limit = options.limit || CONFIG.maxResults;
  let browser = null;

  try {
    browser = await chromium.launch({ headless: CONFIG.headless });
    const context = await browser.newContext({
      userAgent: CONFIG.userAgent,
      viewport: { width: 1920, height: 1080 },
    });
    const page = await context.newPage();

    // Navigate directly to search URL (avoids typing in search box)
    const encodedQuery = encodeURIComponent(query);
    const searchUrl = `https://www.google.com/maps/search/${encodedQuery}`;

    console.log(`  [Scraper] Navigating: "${query}"`);
    await page.goto(searchUrl, { timeout: CONFIG.timeout });
    await page.waitForTimeout(CONFIG.pageWait);

    // Check for CAPTCHA
    const title = await page.title();
    if (title.toLowerCase().includes('captcha') || title.toLowerCase().includes('unusual traffic')) {
      console.log('  [Scraper] ⚠️  CAPTCHA detected — aborting this query');
      await browser.close();
      return { results: [], captcha: true };
    }

    const allResults = [];
    let pageNum = 0;
    let prevCount = 0;

    // Paginate up to maxPages
    while (pageNum < CONFIG.maxPages && allResults.length < limit) {
      pageNum++;

      // Extract all listing cards from sidebar
      const pageResults = await extractListings(page);
      console.log(`  [Scraper] Page ${pageNum}: found ${pageResults.length} listings`);

      // Check for significant duplicates (>50% overlap = stop)
      if (pageNum > 1 && pageResults.length > 0) {
        const existingNames = new Set(allResults.map(r => r.name));
        const dupes = pageResults.filter(r => existingNames.has(r.name)).length;
        if (dupes / pageResults.length > 0.5) {
          console.log(`  [Scraper] >50% duplicates on page ${pageNum}, stopping pagination`);
          break;
        }
      }

      allResults.push(...pageResults);

      if (allResults.length >= limit) break;

      // Try to click "Next" button
      const advanced = await advanceToNextPage(page);
      if (!advanced) {
        console.log(`  [Scraper] No more pages after page ${pageNum}`);
        break;
      }

      await page.waitForTimeout(CONFIG.pageWait);

      // Detect if results didn't change
      if (allResults.length === prevCount) {
        console.log(`  [Scraper] No new results, stopping`);
        break;
      }
      prevCount = allResults.length;
    }

    await browser.close();
    return { results: allResults.slice(0, limit), captcha: false };

  } catch (error) {
    console.error(`  [Scraper] Error scraping "${query}": ${error.message}`);
    if (browser) await browser.close();
    return { results: [], error: error.message, captcha: false };
  }
}

/**
 * Extract all HOA listing cards from the current Google Maps search results page
 */
async function extractListings(page) {
  try {
    // Wait for results panel to load
    await page.waitForSelector('[role="feed"]', { timeout: 10000 }).catch(() => {});

    const listings = await page.evaluate(() => {
      const results = [];

      // Google Maps search results are in a feed
      const feed = document.querySelector('[role="feed"]');
      if (!feed) return results;

      // Each result card
      const cards = feed.querySelectorAll('[jsaction*="mouseover"]');
      if (!cards || cards.length === 0) {
        // Fallback: try alternate selector
        const altCards = feed.querySelectorAll('div[class*="Nv2PK"]');
        // Process altCards if needed
      }

      const allCards = feed.querySelectorAll('a[href*="maps/place"]');

      for (const card of allCards) {
        try {
          const container = card.closest('div[jsaction]') || card.parentElement;

          // Name — usually the first bold text
          const nameEl = container?.querySelector('.qBF1Pd') ||
                         container?.querySelector('[class*="fontHeadlineSmall"]') ||
                         container?.querySelector('div[class*="NrDZNb"]');
          const name = nameEl?.textContent?.trim() || card.textContent?.trim()?.split('\n')[0];
          if (!name || name.length < 3) continue;

          // Address
          const addressEl = container?.querySelector('.W4Efsd .W4Efsd span') ||
                            container?.querySelector('[class*="UsdlK"]');
          const address = addressEl?.textContent?.trim();

          // Rating
          const ratingEl = container?.querySelector('.MW4etd') ||
                           container?.querySelector('[class*="ZkP5Je"]');
          const ratingText = ratingEl?.textContent?.trim();
          const rating = ratingText ? parseFloat(ratingText) : null;

          // Review count
          const reviewEl = container?.querySelector('.UY7F9') ||
                           container?.querySelector('[class*="UY7F9"]');
          const reviewText = reviewEl?.textContent?.replace(/[()]/g, '').trim();
          const reviewCount = reviewText ? parseInt(reviewText.replace(/,/g, '')) : null;

          // Category
          const categoryEl = container?.querySelector('.W4Efsd .W4Efsd') ||
                              container?.querySelector('[class*="fontBodyMedium"] span');
          const category = categoryEl?.textContent?.trim()?.split('·')[0]?.trim();

          // Phone
          const phoneEl = container?.querySelector('[data-dtype="d3ph"]');
          const phone = phoneEl?.textContent?.trim();

          // Maps URL
          const mapsUrl = card.href || null;

          // Place ID from URL
          let placeId = null;
          if (mapsUrl) {
            const match = mapsUrl.match(/place\/([^/]+)/);
            placeId = match ? decodeURIComponent(match[1]) : null;
          }

          if (name) {
            results.push({ name, address, rating, reviewCount, category, phone, mapsUrl, placeId });
          }
        } catch (e) {
          // Skip malformed cards
        }
      }

      return results;
    });

    return listings;

  } catch (e) {
    console.error(`  [Scraper] extractListings error: ${e.message}`);
    return [];
  }
}

/**
 * Click the "Next" pagination button
 * Returns true if clicked, false if no next button
 */
async function advanceToNextPage(page) {
  try {
    // Look for "Next" button or right-arrow in the results panel
    const nextBtn = await page.$('button[aria-label="Next page"]') ||
                    await page.$('[jsaction*="pane.paginationSection.nextPage"]') ||
                    await page.$('button[aria-label*="next"]');

    if (!nextBtn) return false;

    const isDisabled = await nextBtn.getAttribute('disabled');
    if (isDisabled) return false;

    await nextBtn.click();
    await page.waitForTimeout(CONFIG.actionWait);
    return true;

  } catch (e) {
    return false;
  }
}

/**
 * Parse city/state/zip from a Google Maps address string
 * e.g. "123 Main St, Miami, FL 33101, USA"
 */
function parseAddress(addressStr) {
  if (!addressStr) return {};
  // Remove "USA" at end
  const cleaned = addressStr.replace(/,?\s*USA\s*$/, '').trim();
  const parts = cleaned.split(',').map(p => p.trim());

  let city = null, state = null, zip = null, street = null;

  // Work backwards from the end
  const last = parts[parts.length - 1] || '';
  // Last part often "FL 33101" or "FL"
  const stateZipMatch = last.match(/^([A-Z]{2})\s*(\d{5})?$/);
  if (stateZipMatch) {
    state = stateZipMatch[1];
    zip = stateZipMatch[2] || null;
    if (parts.length >= 2) city = parts[parts.length - 2];
    if (parts.length >= 3) street = parts.slice(0, parts.length - 2).join(', ');
  } else {
    // Fallback: use raw string
    city = parts[parts.length - 1];
  }

  return { street, city, state, zip };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMUNITY UPSERT & DEDUP
// ═══════════════════════════════════════════════════════════════════════════

function findExistingCommunity(db, name, zipCode, address, phone, city, state) {
  // 1. Exact name + city match (most reliable — Google Maps list view never returns zip)
  if (name && city) {
    const r = dbGet(db, 'SELECT id FROM hoa_communities WHERE LOWER(name) = LOWER(?) AND LOWER(city) = LOWER(?)', [name, city]);
    if (r) return r.id;
  }

  // 2. Name + state (broader fallback — catches same HOA in same state with slightly different city spelling)
  if (name && state) {
    const r = dbGet(db, 'SELECT id FROM hoa_communities WHERE LOWER(name) = LOWER(?) AND state = ?', [name, state]);
    if (r) return r.id;
  }

  // 3. Name + zip (when zip is available)
  if (name && zipCode) {
    const r = dbGet(db, 'SELECT id FROM hoa_communities WHERE LOWER(name) = LOWER(?) AND (zip_code = ? OR zip = ?)', [name, zipCode, zipCode]);
    if (r) return r.id;
  }

  // 4. Address + zip
  if (address && zipCode) {
    const r = dbGet(db, 'SELECT id FROM hoa_communities WHERE address = ? AND (zip_code = ? OR zip = ?)', [address, zipCode, zipCode]);
    if (r) return r.id;
  }

  // 5. Phone match (normalized digits only)
  if (phone) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length >= 10) {
      const r = dbGet(db, `SELECT id FROM hoa_communities WHERE REPLACE(REPLACE(REPLACE(REPLACE(phone,'(',''),')',''),'-',''),' ','') = ?`, [digits]);
      if (r) return r.id;
    }
  }

  return null;
}

function upsertCommunity(db, result, geoTargetId, searchQuery, fallbackCity, fallbackState) {
  if (isIrrelevantResult(result)) {
    return { action: 'skipped', reason: 'irrelevant_category' };
  }

  const isMgmt = isLikelyManagementCompany(result);
  if (isMgmt) {
    return upsertManagementCompany(db, result);
  }

  const parsed = parseAddress(result.address);
  // Google Maps list view returns category text (e.g. "Association / Organization") not a real address.
  // A real address has commas and a 2-letter state code. If parseAddress didn't find a state, discard parsed city too.
  const hasRealAddress = parsed.state !== null;
  const city = result.city || (hasRealAddress ? parsed.city : null) || fallbackCity || null;
  const state = result.state || (hasRealAddress ? parsed.state : null) || fallbackState || null;
  const zip = result.zip || (hasRealAddress ? parsed.zip : null);
  const address = hasRealAddress ? (parsed.street || null) : null;

  const existingId = findExistingCommunity(db, result.name, zip, address, result.phone, city, state);

  if (existingId) {
    // Update with any new data
    dbRun(db, `
      UPDATE hoa_communities SET
        last_seen_at = CURRENT_TIMESTAMP,
        google_rating = COALESCE(?, google_rating),
        review_count = COALESCE(?, review_count),
        website_url = COALESCE(?, website_url),
        phone = COALESCE(?, phone),
        google_maps_url = COALESCE(?, google_maps_url),
        category = COALESCE(?, category),
        google_place_id = COALESCE(?, google_place_id)
      WHERE id = ?
    `, [
      result.rating || null,
      result.reviewCount || null,
      result.websiteUrl || null,
      result.phone || null,
      result.mapsUrl || null,
      result.category || null,
      result.placeId || null,
      existingId,
    ]);
    return { action: 'updated', id: existingId };
  }

  // Insert new community
  const nowIso = new Date().toISOString();
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
    result.name,
    address || null,
    city || null,
    state || null,
    zip || null,
    zip || null,
    result.phone || null,
    result.websiteUrl || null,
    result.mapsUrl || null,
    result.placeId || null,
    result.rating || null,
    result.reviewCount || null,
    result.category || null,
    searchQuery || null,
    geoTargetId || null,
    nowIso,
    nowIso,
    nowIso,
  ]);

  return { action: 'inserted' };
}

function upsertManagementCompany(db, result) {
  const parsed = parseAddress(result.address);

  const existing = dbGet(db,
    'SELECT id FROM management_companies WHERE name = ? AND state = ?',
    [result.name, result.state || parsed.state]
  );

  if (existing) {
    dbRun(db, `
      UPDATE management_companies SET
        google_rating = COALESCE(?, google_rating),
        review_count = COALESCE(?, review_count),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [result.rating || null, result.reviewCount || null, existing.id]);
    return { action: 'updated', id: existing.id, type: 'management_company' };
  }

  const id = crypto.randomUUID();
  dbRun(db, `
    INSERT INTO management_companies (id, name, website_url, phone, address, city, state, zip_code, google_rating, review_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    result.name,
    result.websiteUrl || null,
    result.phone || null,
    parsed.street || result.address || null,
    result.city || parsed.city || null,
    result.state || parsed.state || null,
    result.zip || parsed.zip || null,
    result.rating || null,
    result.reviewCount || null,
  ]);

  return { action: 'inserted', id, type: 'management_company' };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Process a single geo-target: run all queries, scrape, upsert
 * This is the main function called by the special handler in runs.js
 */
async function processGeoTarget(geoTargetId) {
  console.log(`\n[Discovery] Starting geo-target: ${geoTargetId}`);

  let target;
  if (geoTargetId) {
    target = await getGeoTargetById(geoTargetId);
  } else {
    target = await getNextGeoTarget();
  }

  if (!target) {
    return {
      success: false,
      error: 'No geo-target found',
      geo_target: null,
      queries_run: 0,
      results_found: 0,
      new_communities: 0,
      updated_communities: 0,
      management_companies: 0,
      skipped: 0,
    };
  }

  console.log(`[Discovery] Target: ${target.name}`);
  const queries = generateSearchQueries(target);
  console.log(`[Discovery] Queries to run: ${queries.length}`);

  const db = await getDbAsync();

  // Azure SQL — create run record (non-fatal if Azure is down)
  const azureRunId = await azureCreateRun(target.name);

  const runId = crypto.randomUUID();
  dbRun(db, `
    INSERT INTO discovery_agent_runs (id, agent_name, geo_target, status, started_at)
    VALUES (?, 'hoa-discovery', ?, 'running', CURRENT_TIMESTAMP)
  `, [runId, target.id]);
  saveDb(db);

  const stats = {
    geo_target: target.name,
    geo_target_id: target.id,
    queries_run: 0,
    results_found: 0,
    new_communities: 0,
    updated_communities: 0,
    management_companies: 0,
    skipped: 0,
    captcha_hits: 0,
    errors: [],
  };

  let captchaTriggered = false;

  for (const queryObj of queries) {
    if (captchaTriggered) {
      console.log('[Discovery] CAPTCHA was hit — skipping remaining queries');
      break;
    }

    const queryStart = Date.now();
    console.log(`\n[Discovery] Running: "${queryObj.query}" (${queryObj.type})`);

    try {
      const { results, captcha, error } = await scrapeGoogleMaps(queryObj.query, { limit: 100 });

      if (captcha) {
        stats.captcha_hits++;
        captchaTriggered = true;
        // Log search with error
        logSearch(db, target.id, queryObj.query, queryObj.type, {
          resultsFound: 0, newCommunities: 0, duplicatesSkipped: 0,
          pagesScraped: 0, durationSeconds: 0, errorMessage: 'CAPTCHA detected',
        });
        continue;
      }

      if (error) {
        stats.errors.push({ query: queryObj.query, error });
        logSearch(db, target.id, queryObj.query, queryObj.type, {
          resultsFound: 0, newCommunities: 0, duplicatesSkipped: 0,
          pagesScraped: 0, durationSeconds: 0, errorMessage: error,
        });
        continue;
      }

      stats.queries_run++;
      stats.results_found += results.length;
      console.log(`[Discovery] Found ${results.length} results`);

      let queryNew = 0, queryUpdated = 0, querySkipped = 0;

      for (const result of results) {
        try {
          const outcome = upsertCommunity(db, result, target.id, queryObj.query, queryObj.city, queryObj.state);
          if (outcome.action === 'inserted') {
            if (outcome.type === 'management_company') {
              stats.management_companies++;
            } else {
              stats.new_communities++;
              queryNew++;
              // Azure SQL sync — fire-and-forget, non-blocking
              azureWriteLead(
                { ...result, searchQuery: queryObj.query, geoTargetId: target.id },
                azureRunId
              ).catch(() => {});
            }
          } else if (outcome.action === 'updated') {
            stats.updated_communities++;
            queryUpdated++;
          } else {
            stats.skipped++;
            querySkipped++;
          }
        } catch (e) {
          stats.errors.push({ query: queryObj.query, result: result.name, error: e.message });
        }
      }

      const durationSeconds = Math.round((Date.now() - queryStart) / 1000);
      logSearch(db, target.id, queryObj.query, queryObj.type, {
        resultsFound: results.length,
        newCommunities: queryNew,
        duplicatesSkipped: queryUpdated,
        pagesScraped: 1,
        durationSeconds,
        errorMessage: null,
      });
      saveDb(db);

      // Rate limit: 3 second pause between searches
      await new Promise(r => setTimeout(r, 3000));

    } catch (e) {
      console.error(`[Discovery] Error on query "${queryObj.query}": ${e.message}`);
      stats.errors.push({ query: queryObj.query, error: e.message });
    }
  }

  // Mark geo-target as swept
  await markGeoTargetSwept(db, target.id);

  // Complete the run record
  dbRun(db, `
    UPDATE discovery_agent_runs SET
      status = 'success',
      completed_at = CURRENT_TIMESTAMP,
      results_count = ?,
      new_records = ?,
      updated_records = ?,
      run_metadata = ?
    WHERE id = ?
  `, [
    stats.results_found,
    stats.new_communities,
    stats.updated_communities,
    JSON.stringify(stats),
    runId,
  ]);

  saveDb(db);
  db.close();

  // Azure SQL — complete run record + close pool
  await azureCompleteRun(azureRunId, stats);
  await closeAzurePool();

  console.log(`\n[Discovery] Complete!`);
  console.log(`  Queries run: ${stats.queries_run}`);
  console.log(`  Results found: ${stats.results_found}`);
  console.log(`  New communities: ${stats.new_communities}`);
  console.log(`  Updated: ${stats.updated_communities}`);
  console.log(`  Management companies: ${stats.management_companies}`);
  if (azureRunId) console.log(`  Azure run ID: ${azureRunId}`);
  if (stats.captcha_hits > 0) console.log(`  CAPTCHA hits: ${stats.captcha_hits}`);
  if (stats.errors.length > 0) console.log(`  Errors: ${stats.errors.length}`);

  return {
    success: true,
    azure_run_id: azureRunId,
    ...stats,
  };
}

/**
 * Process multiple geo-targets (batch mode)
 */
async function processMultipleGeoTargets(params = {}) {
  const limit = params.limit || 1;
  const results = [];

  for (let i = 0; i < limit; i++) {
    const result = await processGeoTarget(null); // null = auto-pick next
    results.push(result);
    if (!result.success) break;
  }

  const totalNew = results.reduce((sum, r) => sum + (r.new_communities || 0), 0);
  const totalFound = results.reduce((sum, r) => sum + (r.results_found || 0), 0);

  return {
    success: true,
    targets_processed: results.length,
    total_results_found: totalFound,
    total_new_communities: totalNew,
    results,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// STATS & LOGGING
// ═══════════════════════════════════════════════════════════════════════════

function logSearch(db, geoTargetId, query, type, stats) {
  try {
    dbRun(db, `
      INSERT OR IGNORE INTO discovery_searches (
        id, geo_target_id, search_query, search_type,
        results_found, new_communities, duplicates_skipped,
        pages_scraped, executed_at, duration_seconds, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
    `, [
      crypto.randomUUID(),
      geoTargetId,
      query,
      type,
      stats.resultsFound || 0,
      stats.newCommunities || 0,
      stats.duplicatesSkipped || 0,
      stats.pagesScraped || 0,
      stats.durationSeconds || 0,
      stats.errorMessage || null,
    ]);
  } catch (e) {
    // Non-critical
  }
}

async function getPipelineStats() {
  const db = await getDbAsync();

  const total = dbGet(db, 'SELECT COUNT(*) as count FROM hoa_communities WHERE is_management_company = 0 OR is_management_company IS NULL');
  const awaitingScrape = dbGet(db, 'SELECT COUNT(*) as count FROM hoa_communities WHERE needs_website_scrape = 1');
  const awaitingReview = dbGet(db, 'SELECT COUNT(*) as count FROM hoa_communities WHERE needs_review_scan = 1');
  const awaitingContact = dbGet(db, 'SELECT COUNT(*) as count FROM hoa_communities WHERE needs_contact_enrichment = 1');
  const mgmtCos = dbGet(db, 'SELECT COUNT(*) as count FROM management_companies');
  const byState = dbAll(db, `
    SELECT state, COUNT(*) as count,
      ROUND(AVG(google_rating), 2) as avg_rating,
      SUM(COALESCE(review_count, 0)) as total_reviews
    FROM hoa_communities
    WHERE (is_management_company = 0 OR is_management_company IS NULL) AND state IS NOT NULL
    GROUP BY state ORDER BY count DESC
  `);
  const recentRuns = dbAll(db, `
    SELECT * FROM discovery_agent_runs
    WHERE agent_name = 'hoa-discovery'
    ORDER BY started_at DESC LIMIT 10
  `);
  const lowRated = dbAll(db, `
    SELECT name, city, state, zip_code, google_rating, review_count, website_url, management_company, discovered_at
    FROM hoa_communities
    WHERE google_rating IS NOT NULL AND google_rating <= 3.0
      AND review_count >= 5
      AND (is_management_company = 0 OR is_management_company IS NULL)
    ORDER BY google_rating ASC LIMIT 20
  `);
  const geoTargets = dbAll(db, `
    SELECT id, name, priority, is_active, last_sweep_at,
      (SELECT COUNT(*) FROM hoa_communities WHERE geo_target_id = geo_targets.id) as community_count
    FROM geo_targets ORDER BY priority ASC
  `);

  db.close();

  return {
    totalCommunities: total?.count || 0,
    awaitingScrape: awaitingScrape?.count || 0,
    awaitingReviewScan: awaitingReview?.count || 0,
    awaitingContactEnrichment: awaitingContact?.count || 0,
    managementCompanies: mgmtCos?.count || 0,
    byState,
    recentRuns,
    lowRatedCommunities: lowRated,
    geoTargets,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  getNextGeoTarget,
  getGeoTargetById,
  generateSearchQueries,
  processGeoTarget,
  processMultipleGeoTargets,
  getPipelineStats,
};
