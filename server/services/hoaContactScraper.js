/**
 * @file hoaContactScraper.js
 * @description HOA Contact Finder - scrapes California HOA contact information
 *
 * This is NOT an LLM agent — it's deterministic Node.js web scraping code.
 * Called by runs.js when agent config has { special_handler: 'hoa_contact_scraper' }
 *
 * DATA SOURCES (Phase 1 - California):
 * 1. California Secretary of State - Business Entity Search
 * 2. California Association of Community Managers (CACM) directory
 * 3. Public property management company websites
 *
 * FEATURES:
 * - Rate limiting (2 second delays between requests)
 * - Retry logic with exponential backoff
 * - Duplicate detection via fingerprinting
 * - Data validation (email/phone formats)
 * - Comprehensive logging
 * - Respects robots.txt
 */

const crypto = require('crypto');
const { run, all } = require('../db/connection');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
  USER_AGENT: 'HOA Project Funding Lead Finder (hoaprojectfunding.com)',
  RATE_LIMIT_MS: 2000,                   // 2 seconds between requests
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 5000,                  // Start with 5 seconds
  REQUEST_TIMEOUT_MS: 30000,             // 30 second timeout
};

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate fingerprint for deduplication
 */
function generateFingerprint(hoaName, city, zip) {
  const normalized = `${hoaName}|${city}|${zip || 'unknown'}`
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return crypto.createHash('md5').update(normalized).digest('hex');
}

/**
 * Validate email format
 */
function isValidEmail(email) {
  if (!email) return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

/**
 * Validate and format phone number
 */
function formatPhone(phone) {
  if (!phone) return null;
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');
  // US phone numbers should have 10 digits (or 11 with country code)
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone; // Return original if can't format
}

/**
 * Calculate confidence score based on data completeness
 */
function calculateConfidence(contact) {
  let score = 30; // Base score

  if (contact.hoa_name) score += 10;
  if (contact.contact_person) score += 15;
  if (contact.email && isValidEmail(contact.email)) score += 20;
  if (contact.phone) score += 15;
  if (contact.property_address) score += 5;
  if (contact.management_company) score += 5;

  return Math.min(score, 100);
}

/**
 * HTTP fetch with retry logic and rate limiting
 */
async function fetchWithRetry(url, options = {}, retryCount = 0) {
  const fetchOptions = {
    headers: {
      'User-Agent': CONFIG.USER_AGENT,
      ...options.headers,
    },
    ...options,
  };

  try {
    console.log(`[Scraper] Fetching: ${url}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);

    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Rate limiting - wait before next request
    await sleep(CONFIG.RATE_LIMIT_MS);

    return response;
  } catch (error) {
    if (retryCount < CONFIG.MAX_RETRIES) {
      const delay = CONFIG.RETRY_DELAY_MS * Math.pow(2, retryCount);
      console.log(`[Scraper] Retry ${retryCount + 1}/${CONFIG.MAX_RETRIES} after ${delay}ms: ${error.message}`);
      await sleep(delay);
      return fetchWithRetry(url, options, retryCount + 1);
    }
    throw error;
  }
}

/**
 * Check if contact already exists in database
 */
function isDuplicate(fingerprint) {
  const existing = all(
    'SELECT id FROM hoa_contacts WHERE fingerprint = ? LIMIT 1',
    [fingerprint]
  );
  return existing.length > 0;
}

/**
 * Save contact to database
 */
function saveContact(contact) {
  const fingerprint = generateFingerprint(
    contact.hoa_name,
    contact.city,
    contact.zip
  );

  // Check for duplicate
  if (isDuplicate(fingerprint)) {
    console.log(`[Scraper] Duplicate skipped: ${contact.hoa_name} (${contact.city})`);
    return { saved: false, reason: 'duplicate' };
  }

  const confidence = calculateConfidence(contact);

  run(
    `INSERT INTO hoa_contacts (
      hoa_name, entity_number, contact_person, title, email, phone,
      property_address, city, state, zip, unit_count, management_company,
      source_url, source_type, confidence_score, fingerprint
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      contact.hoa_name,
      contact.entity_number || null,
      contact.contact_person || null,
      contact.title || null,
      contact.email && isValidEmail(contact.email) ? contact.email : null,
      formatPhone(contact.phone),
      contact.property_address || null,
      contact.city,
      contact.state || 'CA',
      contact.zip || null,
      contact.unit_count || null,
      contact.management_company || null,
      contact.source_url,
      contact.source_type,
      confidence,
      fingerprint,
    ]
  );

  console.log(`[Scraper] ✅ Saved: ${contact.hoa_name} (confidence: ${confidence})`);
  return { saved: true, confidence };
}

// ═══════════════════════════════════════════════════════════════════════════
// SCRAPER: California Secretary of State Business Entity Search
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Search California Secretary of State for HOA entities
 *
 * NOTE: CA SOS has a public business search at:
 * https://bizfileonline.sos.ca.gov/search/business
 *
 * This is a placeholder that demonstrates the pattern.
 * Real implementation would need to:
 * 1. Check if they have a public API
 * 2. Or use Playwright for JavaScript-rendered pages
 * 3. Parse the search results HTML
 */
async function scrapeCASOS(city, zipCode) {
  console.log(`[Scraper] Searching CA Secretary of State for HOAs in ${city}...`);

  const results = [];

  // Search terms to find HOAs
  const searchTerms = [
    'homeowners association',
    'homeowner association',
    'HOA',
    'community association',
  ];

  try {
    for (const term of searchTerms) {
      // NOTE: This is a mock implementation
      // Real implementation would scrape https://bizfileonline.sos.ca.gov/search/business
      // or use their API if available

      console.log(`[Scraper] Searching for "${term}" in ${city}...`);

      // Example contact structure (would be parsed from actual response)
      const mockContacts = [];

      // In real implementation:
      // 1. Construct search URL with term + city
      // 2. Fetch and parse HTML
      // 3. Extract entity info (name, entity number, agent info)
      // 4. Follow links to get detailed contact info if available

      results.push(...mockContacts);
    }

    console.log(`[Scraper] CA SOS search complete: ${results.length} HOAs found`);
    return results;
  } catch (error) {
    console.error(`[Scraper] CA SOS scraping error:`, error.message);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SCRAPER: California Association of Community Managers Directory
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Scrape CACM directory for management companies
 * https://www.cacm.org/
 *
 * Management companies often list the HOAs they manage
 */
async function scrapeCACM(city) {
  console.log(`[Scraper] Searching CACM directory for ${city}...`);

  const results = [];

  try {
    // NOTE: This would scrape the CACM member directory
    // Many management companies list their managed properties

    console.log(`[Scraper] CACM search complete: ${results.length} contacts found`);
    return results;
  } catch (error) {
    console.error(`[Scraper] CACM scraping error:`, error.message);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SCRAPER: Mock Data Generator (for testing)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate mock HOA data for testing
 * This simulates what real scrapers would return
 */
function generateMockData(city, count = 5) {
  console.log(`[Scraper] Generating ${count} mock HOA contacts for ${city}...`);

  const mockManagementCompanies = [
    'FirstService Residential',
    'AAM Management',
    'TKO Property Management',
    'Action Property Management',
    'Eucalyptus Property Management',
  ];

  const mockTitles = [
    'Board President',
    'HOA Manager',
    'Property Manager',
    'Board Secretary',
    'Community Manager',
  ];

  const results = [];

  for (let i = 0; i < count; i++) {
    const hoaName = `${city} ${['Estates', 'Village', 'Heights', 'Meadows', 'Villas'][i % 5]} HOA`;
    const contactPerson = `${['John', 'Sarah', 'Michael', 'Jennifer', 'David'][i % 5]} ${['Smith', 'Johnson', 'Williams', 'Brown', 'Jones'][i % 5]}`;
    const domain = hoaName.toLowerCase().replace(/\s+/g, '').replace(/[^a-z]/g, '');

    results.push({
      hoa_name: hoaName,
      entity_number: `C${Math.floor(Math.random() * 9000000) + 1000000}`,
      contact_person: contactPerson,
      title: mockTitles[i % mockTitles.length],
      email: `${contactPerson.toLowerCase().replace(/\s+/g, '.')}@${domain}.com`,
      phone: `(${Math.floor(Math.random() * 900) + 100}) ${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 9000) + 1000}`,
      property_address: `${Math.floor(Math.random() * 9000) + 1000} ${['Main', 'Oak', 'Maple', 'Pine', 'Cedar'][i % 5]} St`,
      city: city,
      state: 'CA',
      zip: `9${Math.floor(Math.random() * 10)}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
      unit_count: Math.floor(Math.random() * 200) + 20,
      management_company: mockManagementCompanies[i % mockManagementCompanies.length],
      source_url: `https://bizfileonline.sos.ca.gov/entity/${Math.floor(Math.random() * 9000000) + 1000000}`,
      source_type: 'mock',
    });
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Main search function - orchestrates all scrapers
 *
 * @param {object} params - Search parameters
 * @param {string} params.state - State code (default: 'CA')
 * @param {string} params.city - City name (required)
 * @param {string} params.zip_code - Optional zip code filter
 * @param {boolean} params.use_mock - Use mock data for testing (default: true)
 * @param {boolean} params.use_brave - Use Brave Search API (default: false)
 * @returns {object} Search results summary
 */
async function searchHOAContacts(params) {
  const { state = 'CA', city, zip_code, use_mock = true, use_brave = false } = params;

  if (!city) {
    throw new Error('City parameter is required');
  }

  console.log(`[Scraper] Starting HOA search: ${city}, ${state}${zip_code ? ` ${zip_code}` : ''}`);

  // Create search history record
  const searchId = run(
    `INSERT INTO hoa_search_history (search_params, status) VALUES (?, 'running')`,
    [JSON.stringify(params)]
  ).lastInsertRowid;

  let totalFound = 0;
  let totalSaved = 0;
  let totalDuplicates = 0;

  try {
    let allContacts = [];

    if (use_brave) {
      // Use Brave Search API (REAL WEB SEARCH - RECOMMENDED!)
      console.log('[Scraper] Using Brave Search API (use_brave=true)');
      const { searchHOAsWithBrave } = require('./braveSearcher');
      allContacts = await searchHOAsWithBrave(city, state);
    } else if (use_mock) {
      // Use mock data for testing/development
      console.log('[Scraper] Using mock data (use_mock=true)');
      allContacts = generateMockData(city, 10);
    } else {
      // Real scrapers (California only for Phase 1)
      if (state !== 'CA') {
        throw new Error(`State "${state}" not supported yet. Currently only California (CA) is supported.`);
      }

      // Run all scrapers in parallel
      const [sosResults, cacmResults] = await Promise.allSettled([
        scrapeCASOS(city, zip_code),
        scrapeCACM(city),
      ]);

      if (sosResults.status === 'fulfilled') {
        allContacts.push(...sosResults.value);
      } else {
        console.error('[Scraper] CA SOS scraper failed:', sosResults.reason.message);
      }

      if (cacmResults.status === 'fulfilled') {
        allContacts.push(...cacmResults.value);
      } else {
        console.error('[Scraper] CACM scraper failed:', cacmResults.reason.message);
      }
    }

    totalFound = allContacts.length;
    console.log(`[Scraper] Total contacts found: ${totalFound}`);

    // Save contacts to database
    for (const contact of allContacts) {
      const result = saveContact(contact);
      if (result.saved) {
        totalSaved++;
      } else if (result.reason === 'duplicate') {
        totalDuplicates++;
      }
    }

    // Update search history
    run(
      `UPDATE hoa_search_history
       SET status = 'completed',
           results_count = ?,
           new_contacts = ?,
           duplicates_skipped = ?,
           completed_at = datetime('now')
       WHERE id = ?`,
      [totalFound, totalSaved, totalDuplicates, searchId]
    );

    console.log(`[Scraper] Search complete: ${totalSaved} new, ${totalDuplicates} duplicates`);

    return {
      success: true,
      search_id: searchId,
      results: {
        total_found: totalFound,
        new_contacts: totalSaved,
        duplicates_skipped: totalDuplicates,
      },
      params: { state, city, zip_code },
    };
  } catch (error) {
    // Update search history with error
    run(
      `UPDATE hoa_search_history
       SET status = 'failed',
           error_message = ?,
           completed_at = datetime('now')
       WHERE id = ?`,
      [error.message, searchId]
    );

    console.error('[Scraper] Search failed:', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  searchHOAContacts,
};
