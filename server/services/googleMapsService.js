/**
 * @file googleMapsService.js
 * @description Shared Google Maps discovery engine. Any pipeline can use this to
 * find businesses by category and location, score them, and insert into cfo_leads.
 *
 * Cost: $0/run — Playwright only, no paid APIs.
 *
 * Usage:
 *   const gms = require('./googleMapsService');
 *   const result = await gms.discover({
 *     queries: ['dentist {location}', 'dental office {location}'],
 *     location: 'Austin, TX',
 *     source: 'google_maps',
 *     sourceAgent: 'jake',
 *     limit: 100,
 *     filter: (r) => true,       // optional: filter raw results
 *     score: (r) => ({ score: 50, reason: 'default' }),  // optional: custom scoring
 *   });
 */

'use strict';

const pool = require('./playwrightPool');
const { run, get } = require('../db/connection');

// Apollo enrichment — safe import (additive, non-breaking)
let apollo;
try { apollo = require('./apolloEnricher'); } catch {}

// ── Google Maps scraper (shared from jakeConstructionDiscovery, generalized) ──

async function scrapeGoogleMaps(query, limit = 60) {
  const mapsDomain = 'www.google.com';
  if (pool.circuitBreaker(mapsDomain)) {
    return { results: [], error: 'Circuit open for google.com — too many recent failures' };
  }

  let page = null;
  let attempt = 0;
  const maxAttempts = 2;

  while (attempt < maxAttempts) {
    attempt++;
    try {
      page = await pool.getPage();

      const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
      await pool.fetch(page, searchUrl, { timeoutMs: 30000, humanDelay: true, waitUntil: 'domcontentloaded' });

      // Check for CAPTCHA
      const title = await page.title();
      if (title.toLowerCase().includes('captcha') || title.toLowerCase().includes('unusual traffic')) {
        await pool.safeClose(page);
        page = null;
        return { results: [], captcha: true };
      }

      const allResults = [];
      for (let pageNum = 0; pageNum < 3 && allResults.length < limit; pageNum++) {
        const pageResults = await extractListings(page);

        // Stop if >50% overlap (re-seeing the same page)
        if (pageNum > 0 && pageResults.length > 0) {
          const existingNames = new Set(allResults.map(r => r.name));
          const dupes = pageResults.filter(r => existingNames.has(r.name)).length;
          if (dupes / pageResults.length > 0.5) break;
        }

        allResults.push(...pageResults);
        if (allResults.length >= limit) break;

        const advanced = await advancePage(page);
        if (!advanced) break;
        await page.waitForTimeout(2500);
      }

      await pool.safeClose(page);
      page = null;
      return { results: allResults.slice(0, limit), captcha: false };

    } catch (err) {
      if (page) { await pool.safeClose(page); page = null; }
      if (attempt < maxAttempts) {
        const backoff = attempt * 3000;
        console.warn(`[GoogleMaps] Scrape attempt ${attempt} failed (${err.message.split('\n')[0]}) — retrying in ${backoff}ms`);
        await new Promise(r => setTimeout(r, backoff));
      } else {
        return { results: [], error: err.message };
      }
    }
  }

  return { results: [], error: 'Max attempts reached' };
}

async function extractListings(page) {
  try {
    await page.waitForSelector('[role="feed"]', { timeout: 8000 }).catch(() => {});

    return await page.evaluate(() => {
      const results = [];
      const feed = document.querySelector('[role="feed"]');
      if (!feed) return results;

      const allCards = feed.querySelectorAll('a[href*="maps/place"]');
      for (const card of allCards) {
        try {
          const container = card.closest('div[jsaction]') || card.parentElement;

          const nameEl = container?.querySelector('.qBF1Pd') ||
                         container?.querySelector('[class*="fontHeadlineSmall"]') ||
                         container?.querySelector('div[class*="NrDZNb"]');
          const name = nameEl?.textContent?.trim() || card.textContent?.trim()?.split('\n')[0];
          if (!name || name.length < 3) continue;

          const addressEl = container?.querySelector('.W4Efsd .W4Efsd span') ||
                            container?.querySelector('[class*="UsdlK"]');
          const address = addressEl?.textContent?.trim();

          const ratingEl = container?.querySelector('.MW4etd') ||
                           container?.querySelector('[class*="ZkP5Je"]');
          const rating = ratingEl ? parseFloat(ratingEl.textContent.trim()) : null;

          const reviewEl = container?.querySelector('.UY7F9') ||
                           container?.querySelector('[class*="UY7F9"]');
          const reviewText = reviewEl?.textContent?.replace(/[()]/g, '').trim();
          const reviewCount = reviewText ? parseInt(reviewText.replace(/,/g, '')) : null;

          const categoryEl = container?.querySelector('.W4Efsd .W4Efsd') ||
                              container?.querySelector('[class*="fontBodyMedium"] span');
          const category = categoryEl?.textContent?.trim()?.split('·')[0]?.trim();

          const phoneEl = container?.querySelector('[data-dtype="d3ph"]');
          const phone = phoneEl?.textContent?.trim();

          // Website link (if visible in card)
          const websiteEl = container?.querySelector('a[href*="http"]:not([href*="google"])');
          const website = websiteEl?.href || null;

          results.push({ name, address, rating, reviewCount, category, phone, website });
        } catch (e) { /* skip malformed cards */ }
      }
      return results;
    });
  } catch (e) {
    return [];
  }
}

async function advancePage(page) {
  try {
    const nextBtn = await page.$('button[aria-label="Next page"]') ||
                    await page.$('[jsaction*="pane.paginationSection.nextPage"]') ||
                    await page.$('button[aria-label*="Next"]');
    if (!nextBtn) return false;
    const disabled = await nextBtn.getAttribute('disabled');
    if (disabled) return false;
    await nextBtn.click();
    return true;
  } catch { return false; }
}

// ── Address parser ──────────────────────────────────────────────────────────

function parseCityState(addressStr, fallbackCity, fallbackState) {
  if (!addressStr) return { city: fallbackCity, state: fallbackState };

  const cleaned = addressStr.replace(/,?\s*USA\s*$/, '').trim();
  const parts = cleaned.split(',').map(p => p.trim());
  const last = parts[parts.length - 1] || '';
  const m = last.match(/^([A-Z]{2})\s*(\d{5})?$/);
  if (m) {
    return {
      state: m[1],
      city: parts.length >= 2 ? parts[parts.length - 2] : fallbackCity,
    };
  }
  return { city: fallbackCity, state: fallbackState };
}

// ── Default scoring (generic business) ──────────────────────────────────────

function defaultScore(result) {
  let score = 40;
  const reasons = ['Google Maps listing'];

  if (result.phone) { score += 5; reasons.push('Has phone'); }
  if (result.rating && result.rating >= 4.0) { score += 5; reasons.push(`${result.rating}*`); }
  if (result.reviewCount && result.reviewCount >= 10) { score += 5; reasons.push(`${result.reviewCount} reviews`); }
  if (result.website) { score += 5; reasons.push('Has website'); }

  // Entity type signals
  const nameLower = (result.name || '').toLowerCase();
  if (/inc\b|incorporated/i.test(nameLower)) { score += 4; reasons.push('Inc'); }
  if (/llc\b|l\.l\.c/i.test(nameLower)) { score += 3; reasons.push('LLC'); }
  if (/corp\b/i.test(nameLower)) { score += 4; reasons.push('Corp'); }
  if (/group\b|associates?|partners?|enterprises?/i.test(nameLower)) {
    score += 3; reasons.push('Business entity');
  }

  return { score: Math.min(Math.max(score, 0), 100), reason: reasons.join('; ') };
}

// ── Main discovery entry point ──────────────────────────────────────────────

/**
 * Run a Google Maps discovery with configurable queries, filtering, and scoring.
 *
 * @param {Object} opts
 * @param {string[]} opts.queries      - Search templates with {location} placeholder
 * @param {string}   opts.location     - e.g. 'Austin, TX'
 * @param {string}   opts.source       - source field for cfo_leads (e.g. 'google_maps')
 * @param {string}   opts.sourceAgent  - source_agent field (e.g. 'jake', 'hoa', 'owen')
 * @param {number}   [opts.limit=100]  - max leads to insert
 * @param {number}   [opts.perQuery=60] - max results per Maps query
 * @param {Function} [opts.filter]     - (result) => boolean, filters raw results
 * @param {Function} [opts.score]      - (result) => { score, reason }, custom scoring
 * @param {boolean}  [opts.enrichTop=true] - Apollo-enrich top 10 new leads
 * @param {number}   [opts.workspaceId=1]  - workspace_id for cfo_leads
 * @returns {Promise<{summary: string, stats: object, region: string, cost_usd: number}>}
 */
async function discover(opts) {
  const {
    queries,
    location,
    source = 'google_maps',
    sourceAgent = 'jake',
    limit: maxLeads = 100,
    perQuery = 60,
    filter = () => true,
    score: scoreFn = defaultScore,
    enrichTop = true,
    workspaceId = 1,
  } = opts;

  if (!queries || !queries.length || !location) {
    throw new Error('googleMapsService.discover() requires queries[] and location');
  }

  // Parse fallback city/state from location string
  const regionParts = location.split(',').map(s => s.trim());
  const fallbackCity = regionParts[0];
  const fallbackState = regionParts[1]
    ? regionParts[1].replace(/\s+/g, '').slice(0, 2).toUpperCase()
    : null;

  console.log(`[GoogleMaps] Starting: location="${location}", source=${source}/${sourceAgent}, limit=${maxLeads}`);

  const expandedQueries = queries.map(t => t.replace('{location}', location));
  const stats = {
    queries_run: 0,
    results_scraped: 0,
    filtered: 0,
    inserted: 0,
    skipped: 0,
    captcha_hits: 0,
  };

  const seenNames = new Set();
  const newlyInserted = [];

  for (const query of expandedQueries) {
    if (stats.inserted >= maxLeads) break;

    console.log(`[GoogleMaps] Query: "${query}"`);
    const { results = [], captcha, error } = await scrapeGoogleMaps(query, perQuery);
    stats.queries_run++;

    if (captcha) {
      stats.captcha_hits++;
      console.warn(`[GoogleMaps] CAPTCHA on "${query}" — waiting 5s`);
      await new Promise(r => setTimeout(r, 5000));
      continue;
    }

    if (error) {
      console.error(`[GoogleMaps] Scrape error: ${error}`);
      continue;
    }

    stats.results_scraped += results.length;
    console.log(`[GoogleMaps]   ${results.length} raw results`);

    for (const r of results) {
      if (stats.inserted >= maxLeads) break;

      const name = (r.name || '').trim();
      if (!name || name.length < 3) continue;

      // Dedup within run
      const nameKey = name.toLowerCase();
      if (seenNames.has(nameKey)) continue;
      seenNames.add(nameKey);

      // Custom filter
      if (!filter(r)) { stats.filtered++; continue; }

      // DB dedup
      const existing = get('SELECT id FROM cfo_leads WHERE LOWER(company_name) = LOWER(?)', [name]);
      if (existing) { stats.skipped++; continue; }

      const { city, state } = parseCityState(r.address, fallbackCity, fallbackState);
      const { score, reason } = scoreFn(r);

      const notes = [
        `Maps: ${r.category || 'business'}`,
        r.rating ? `${r.rating}*` : null,
        r.reviewCount ? `${r.reviewCount} reviews` : null,
        r.website ? 'has website' : 'no website',
        location,
      ].filter(Boolean).join(' | ');

      run(
        `INSERT INTO cfo_leads
           (company_name, phone, city, state, website,
            pilot_fit_score, pilot_fit_reason,
            source, source_agent, status,
            enrichment_status, notes, erp_type, workspace_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', 'pending', ?, 'Unknown', ?)`,
        [
          name,
          r.phone || null,
          city || null,
          state || fallbackState,
          r.website || null,
          score,
          reason,
          source,
          sourceAgent,
          notes,
          workspaceId,
        ]
      );

      stats.inserted++;

      const insertedLead = get('SELECT id, company_name, city, state FROM cfo_leads WHERE LOWER(company_name) = LOWER(?)', [name]);
      if (insertedLead) newlyInserted.push(insertedLead);

      console.log(`[GoogleMaps]   + ${name} (${city || fallbackCity}, ${state || fallbackState}) score:${score}`);
    }

    // Polite delay between queries
    if (stats.inserted < maxLeads && expandedQueries.indexOf(query) < expandedQueries.length - 1) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  // ── Apollo inline enrichment for top 10 ─────────────────────────────────
  if (enrichTop && apollo && newlyInserted.length > 0) {
    const enrichBatch = newlyInserted.slice(0, 10);
    console.log(`[GoogleMaps] Apollo enriching top ${enrichBatch.length} of ${newlyInserted.length} new leads...`);
    let enriched = 0;
    for (const lead of enrichBatch) {
      try {
        const result = await apollo.enrichLead(lead);
        if (result.success && !result.skipped) {
          enriched++;
          console.log(`[GoogleMaps] Apollo enriched: ${lead.company_name} -> ${result.email || 'no email'}`);
        }
      } catch (err) {
        console.warn(`[GoogleMaps] Apollo enrichment failed for ${lead.company_name}: ${err.message}`);
      }
      await new Promise(r => setTimeout(r, 300));
    }
    stats.apollo_enriched = enriched;
  }

  const summary = [
    `Google Maps Discovery complete for ${location} (${source}/${sourceAgent}):`,
    `  ${stats.inserted} new businesses inserted`,
    `  ${stats.queries_run} queries, ${stats.results_scraped} raw, ${stats.filtered} filtered, ${stats.skipped} dupes`,
    stats.captcha_hits > 0 ? `  ${stats.captcha_hits} CAPTCHA hits` : null,
    stats.apollo_enriched > 0 ? `  Apollo enriched: ${stats.apollo_enriched} leads` : null,
    `  Cost: $0.00`,
  ].filter(Boolean).join('\n');

  console.log(`[GoogleMaps] Done.\n${summary}`);

  return { summary, stats, region: location, cost_usd: 0 };
}

// ── Pre-built vertical configs ──────────────────────────────────────────────
// Ready-to-use configs for common verticals. Pass to discover() or use as templates.

const VERTICALS = {
  construction: {
    queries: [
      'general contractor {location}',
      'construction company {location}',
      'commercial construction contractor {location}',
      'general contracting {location}',
      'building contractor {location}',
    ],
    filter: (r) => {
      const nameLower = (r.name || '').toLowerCase();
      const catLower = (r.category || '').toLowerCase();
      const skip = ['restaurant', 'cafe', 'bar', 'retail', 'store', 'shop', 'salon',
        'gym', 'church', 'school', 'hospital', 'doctor', 'dentist',
        'gas station', 'car wash', 'auto repair', 'bank', 'pharmacy',
        'real estate agent', 'insurance', 'hotel', 'motel', 'lodging',
        'accounting', 'attorney', 'law firm', 'property management'];
      if (skip.some(c => catLower.includes(c))) return false;
      const signals = ['contractor', 'construction', 'builder', 'contracting',
        'remodel', 'renovation', 'concrete', 'masonry', 'roofing',
        'mechanical', 'structural', 'development', 'infrastructure',
        'sitework', 'excavat', 'grading', 'framing', 'drywall',
        'carpentry', 'plumbing', 'electrical', 'hvac', 'welding'];
      return signals.some(sig => nameLower.includes(sig) || catLower.includes(sig));
    },
    score: (r) => {
      let score = 40;
      const reasons = ['Google Maps listing'];
      const nameLower = (r.name || '').toLowerCase();
      const catLower = (r.category || '').toLowerCase();
      if (r.phone) { score += 5; reasons.push('Has phone'); }
      if (r.rating && r.rating >= 4.0) { score += 5; reasons.push(`${r.rating}*`); }
      if (r.reviewCount && r.reviewCount >= 10) { score += 5; reasons.push(`${r.reviewCount} reviews`); }
      if (/general contractor/i.test(nameLower) || /general contractor/i.test(catLower)) {
        score += 10; reasons.push('General contractor');
      } else if (/construction/i.test(nameLower)) {
        score += 5; reasons.push('Construction in name');
      }
      if (/inc\b|incorporated/i.test(nameLower)) { score += 4; reasons.push('Inc'); }
      if (/llc\b|l\.l\.c/i.test(nameLower)) { score += 3; reasons.push('LLC'); }
      if (/corp\b/i.test(nameLower)) { score += 4; reasons.push('Corp'); }
      if (/group\b|associates?|partners?|enterprises?/i.test(nameLower)) { score += 3; reasons.push('Business entity'); }
      return { score: Math.min(Math.max(score, 0), 100), reason: reasons.join('; ') };
    },
  },

  hoa_management: {
    queries: [
      'HOA management company {location}',
      'homeowners association management {location}',
      'community association management {location}',
      'property management HOA {location}',
    ],
    filter: (r) => {
      const nameLower = (r.name || '').toLowerCase();
      const catLower = (r.category || '').toLowerCase();
      const signals = ['hoa', 'homeowner', 'community association', 'property management',
        'condo association', 'cai', 'community management', 'association management'];
      return signals.some(sig => nameLower.includes(sig) || catLower.includes(sig));
    },
    score: (r) => {
      let score = 40;
      const reasons = ['Google Maps listing'];
      const nameLower = (r.name || '').toLowerCase();
      if (r.phone) { score += 5; reasons.push('Has phone'); }
      if (r.rating) { score += 3; reasons.push(`${r.rating}*`); }
      if (r.reviewCount && r.reviewCount >= 5) { score += 5; reasons.push(`${r.reviewCount} reviews`); }
      if (r.website) { score += 5; reasons.push('Has website'); }
      if (/hoa|homeowner/i.test(nameLower)) { score += 10; reasons.push('HOA in name'); }
      if (/association management/i.test(nameLower)) { score += 8; reasons.push('Association mgmt'); }
      if (/inc\b|llc\b|corp\b/i.test(nameLower)) { score += 3; reasons.push('Business entity'); }
      return { score: Math.min(Math.max(score, 0), 100), reason: reasons.join('; ') };
    },
  },

  property_management: {
    queries: [
      'property management company {location}',
      'rental property management {location}',
      'commercial property management {location}',
      'apartment management company {location}',
    ],
    filter: (r) => {
      const nameLower = (r.name || '').toLowerCase();
      const catLower = (r.category || '').toLowerCase();
      const skip = ['restaurant', 'cafe', 'bar', 'store', 'salon', 'gym', 'church', 'school', 'hospital'];
      if (skip.some(c => catLower.includes(c))) return false;
      const signals = ['property management', 'real estate management', 'rental management',
        'apartment management', 'realty', 'properties'];
      return signals.some(sig => nameLower.includes(sig) || catLower.includes(sig));
    },
  },
};

module.exports = {
  discover,
  scrapeGoogleMaps,
  extractListings,
  parseCityState,
  defaultScore,
  VERTICALS,
};
