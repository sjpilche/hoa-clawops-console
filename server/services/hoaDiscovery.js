/**
 * @file hoaDiscovery.js
 * @description Agent 1: HOA Discovery Service (Zero-Cost Version)
 *
 * Discovers HOA communities from public directories across CA, FL, CO.
 * Uses Playwright for scraping (free) - NO paid APIs needed.
 *
 * Priority sources:
 * 1. FL DBPR Open Data (CSV download) - 25,000+ condos in one file
 * 2. CO DORA HOA Registry (searchable database)
 * 3. CA Secretary of State (business search)
 * 4. Management company websites (FirstService, Associa, etc.)
 *
 * Cost: $0 (just Playwright scraping)
 */

const crypto = require('crypto');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE CONNECTION
// ═══════════════════════════════════════════════════════════════════════════

const DB_PATH = path.resolve('./hoa_leads.sqlite');

let db = null;

async function getHoaDb() {
  if (db) return db;

  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(DB_PATH);
  db = new SQL.Database(fileBuffer);
  return db;
}

function saveHoaDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function runHoaDb(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  db.run(sql, params);
  saveHoaDb();
  return { changes: db.getRowsModified() };
}

function getHoaDbRow(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
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

function allHoaDbRows(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate fingerprint for deduplication
 */
function generateFingerprint(name, city, state) {
  const normalized = `${name}|${city || 'unknown'}|${state}`
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return crypto.createHash('md5').update(normalized).digest('hex');
}

/**
 * Extract domain from URL
 */
function extractDomain(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return null;
  }
}

/**
 * Clean HOA name
 */
function cleanHOAName(name) {
  if (!name) return null;
  return name
    .replace(/\s+(HOA|Homeowners Association|Condominium Association|Community Association)/gi, '')
    .trim();
}

/**
 * Estimate priority based on unit count and state
 */
function calculatePriority(unitCount, state, hasWebsite) {
  let priority = 5; // Base

  // Florida gets +2 (post-Surfside urgency)
  if (state === 'FL') priority += 2;

  // California gets +1 (SB 326/721 compliance)
  if (state === 'CA') priority += 1;

  // Unit count bonus
  if (unitCount >= 100) priority += 2;
  else if (unitCount >= 50) priority += 1;

  // Has website bonus
  if (hasWebsite) priority += 1;

  return Math.min(priority, 10); // Cap at 10
}

// ═══════════════════════════════════════════════════════════════════════════
// DISCOVERY SOURCES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Source 1: Florida DBPR Open Data (GOLD MINE)
 * Download full CSV of all FL condos - 25,000+ records
 *
 * URL: https://opendata.myfloridalicense.com/
 * Look for: "Condominium Registry" dataset
 *
 * This is a BULK DOWNLOAD - one file with everything!
 */
async function discoverFloridaDBPR() {
  console.log('[Discovery] 🟡 FL DBPR Open Data scraping not yet implemented');
  console.log('[Discovery] TODO: Download CSV from https://opendata.myfloridalicense.com/');
  console.log('[Discovery] Expected: 25,000+ FL condo associations');

  // TODO: Implement CSV download and parsing
  // For now, return empty array

  return [];
}

/**
 * Source 2: Colorado DORA HOA Registry
 * Official state database - 10,000+ HOAs
 *
 * URL: https://dora.colorado.gov/hoa
 */
async function discoverColoradoDORA() {
  console.log('[Discovery] 🟡 CO DORA scraping not yet implemented');
  console.log('[Discovery] TODO: Scrape https://dora.colorado.gov/hoa');
  console.log('[Discovery] Expected: 10,000+ CO HOAs');

  return [];
}

/**
 * Source 3: California Secretary of State
 * Business entity search for HOAs
 *
 * URL: https://bizfileonline.sos.ca.gov/search/business
 */
async function discoverCaliforniaSOS() {
  console.log('[Discovery] 🟡 CA SOS scraping not yet implemented');
  console.log('[Discovery] TODO: Search CA SOS for Common Interest Developments');
  console.log('[Discovery] Expected: 5,000+ CA HOAs');

  return [];
}

/**
 * Source 4: Mock data for testing
 * Generates realistic test data for immediate testing
 */
async function generateMockHOAs(state, count = 10) {
  console.log(`[Discovery] 🎭 Generating ${count} mock HOAs for ${state}...`);

  const mockHOAs = [];
  const cities = {
    CA: ['San Diego', 'San Francisco', 'Los Angeles', 'Irvine', 'San Jose', 'Sacramento'],
    FL: ['Miami', 'Tampa', 'Orlando', 'Jacksonville', 'Fort Lauderdale', 'Sarasota'],
    CO: ['Denver', 'Colorado Springs', 'Aurora', 'Fort Collins', 'Boulder', 'Lakewood']
  };

  const hoaNames = [
    'Pacific Heights', 'Oceanview', 'Sunset Ridge', 'Mountain View', 'Harbor Pointe',
    'Riverside', 'Lakeside', 'Parkwood', 'Fairway Estates', 'Garden Terrace',
    'Waterfront', 'Canyon Creek', 'Meadowbrook', 'Timber Ridge', 'Willow Glen'
  ];

  const managementCompanies = [
    'FirstService Residential', 'Associa', 'Leland Management', 'Sentry Management',
    'Hammersmith Management', 'MSI', 'Action Property Management', 'Powerstone PM'
  ];

  for (let i = 0; i < count; i++) {
    const city = cities[state][Math.floor(Math.random() * cities[state].length)];
    const hoaName = `${hoaNames[i % hoaNames.length]} ${city === 'Denver' || city === 'Boulder' ? 'Community' : 'HOA'}`;
    const unitCount = 20 + Math.floor(Math.random() * 200); // 20-220 units
    const hasDocs = Math.random() > 0.3; // 70% have docs
    const hasWebsite = Math.random() > 0.2; // 80% have websites

    const domain = hoaName.toLowerCase().replace(/\s+/g, '') + '.org';
    const website = hasWebsite ? `https://www.${domain}` : null;
    const docsPortal = hasDocs ? `https://www.${domain}/documents` : null;

    mockHOAs.push({
      name: hoaName,
      state: state,
      city: city,
      zip: null,
      county: null,
      unit_count: unitCount,
      website_url: website,
      document_portal_url: docsPortal,
      management_company: Math.random() > 0.5 ? managementCompanies[Math.floor(Math.random() * managementCompanies.length)] : null,
      management_company_url: null,
      source: 'mock',
      source_url: 'internal://mock-generator',
      portal_type: hasDocs ? (Math.random() > 0.5 ? 'custom' : 'none') : 'no-docs-found',
      status: hasWebsite ? 'active' : 'no-website',
      priority: calculatePriority(unitCount, state, hasWebsite),
      last_scanned: null
    });
  }

  return mockHOAs;
}

// ═══════════════════════════════════════════════════════════════════════════
// SAVE TO DATABASE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Save HOA community to database (with deduplication)
 */
async function saveHOACommunity(hoa) {
  await getHoaDb(); // Ensure DB is loaded

  // Check if already exists (by fingerprint)
  const fingerprint = generateFingerprint(hoa.name, hoa.city, hoa.state);
  const existing = getHoaDbRow(
    'SELECT id FROM hoa_communities WHERE name = ? AND city = ? AND state = ?',
    [hoa.name, hoa.city, hoa.state]
  );

  if (existing) {
    console.log(`[Discovery]   ⏭️  Skipped duplicate: ${hoa.name}, ${hoa.city}, ${hoa.state}`);
    return { inserted: false, hoa_id: existing.id };
  }

  // Insert new community
  runHoaDb(`
    INSERT INTO hoa_communities (
      name, state, city, zip, county, unit_count,
      website_url, document_portal_url,
      management_company, management_company_url,
      source, source_url, portal_type, status, priority, last_scanned
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    hoa.name,
    hoa.state,
    hoa.city,
    hoa.zip,
    hoa.county,
    hoa.unit_count,
    hoa.website_url,
    hoa.document_portal_url,
    hoa.management_company,
    hoa.management_company_url,
    hoa.source,
    hoa.source_url,
    hoa.portal_type,
    hoa.status,
    hoa.priority,
    hoa.last_scanned
  ]);

  const inserted = getHoaDbRow('SELECT last_insert_rowid() as id');

  console.log(`[Discovery]   ✅ Saved: ${hoa.name}, ${hoa.city}, ${hoa.state} (${hoa.unit_count} units, priority ${hoa.priority})`);

  return { inserted: true, hoa_id: inserted.id };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN DISCOVERY FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Main discovery function - called by special handler
 *
 * @param {Object} params
 * @param {string} params.source - which source to scrape (fl-dbpr, co-dora, ca-sos, mock)
 * @param {string} params.state - state to focus on (CA, FL, CO)
 * @param {number} params.limit - max HOAs to discover (default: 100)
 * @returns {Object} - { success, communities_found, communities_added, duplicates_skipped }
 */
async function discoverHOAs(params) {
  const { source = 'mock', state = 'FL', limit = 100 } = params;

  console.log('\n🔍 HOA DISCOVERY - STARTING');
  console.log('='.repeat(60));
  console.log(`Source: ${source}`);
  console.log(`State: ${state}`);
  console.log(`Limit: ${limit}`);
  console.log('');

  try {
    await getHoaDb(); // Initialize database connection

    let discovered = [];

    // Route to appropriate discovery source
    switch (source) {
      case 'fl-dbpr':
        discovered = await discoverFloridaDBPR();
        break;

      case 'co-dora':
        discovered = await discoverColoradoDORA();
        break;

      case 'ca-sos':
        discovered = await discoverCaliforniaSOS();
        break;

      case 'mock':
        discovered = await generateMockHOAs(state, Math.min(limit, 50));
        break;

      default:
        throw new Error(`Unknown source: ${source}`);
    }

    console.log(`[Discovery] Found ${discovered.length} HOAs from source`);
    console.log('');

    // Save to database
    let added = 0;
    let skipped = 0;

    for (const hoa of discovered) {
      const result = await saveHOACommunity(hoa);
      if (result.inserted) {
        added++;
      } else {
        skipped++;
      }
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('✅ DISCOVERY COMPLETE');
    console.log('='.repeat(60));
    console.log(`Total found: ${discovered.length}`);
    console.log(`Added to database: ${added}`);
    console.log(`Duplicates skipped: ${skipped}`);
    console.log('');

    // Return summary
    return {
      success: true,
      communities_found: discovered.length,
      communities_added: added,
      duplicates_skipped: skipped,
      source,
      state
    };

  } catch (error) {
    console.error('');
    console.error('❌ DISCOVERY FAILED');
    console.error('Error:', error.message);
    console.error('');

    return {
      success: false,
      error: error.message,
      communities_found: 0,
      communities_added: 0,
      duplicates_skipped: 0
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  discoverHOAs,
  generateMockHOAs,
  saveHOACommunity,
};
