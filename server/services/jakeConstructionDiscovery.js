/**
 * @file jakeConstructionDiscovery.js
 * @description Jake Construction Company Discovery via Google Maps
 *
 * Scrapes Google Maps for GCs and construction companies across Jake's 60 national
 * markets. Captures company name, address, phone, category. The contact enricher
 * (jakeContactEnricher.js) then finds CFO/controller names + emails for each.
 *
 * Cost: $0/run — Playwright only, no paid APIs.
 * Handler: jake_construction_discovery
 *
 * Volume: ~50-150 companies per market vs. 2-3 for the LLM scout.
 * Use this for bulk discovery; use jake-lead-scout for named-contact hunting.
 *
 * Message params:
 *   region: 'Denver, CO'  (default: next Jake market in rotation)
 *   limit:  100           (max inserts per run)
 */

'use strict';

const { chromium } = require('playwright');
const { run, get } = require('../db/connection');
const { getNextMarket, markMarketScouted } = require('./jakeLeadRotation');

// ── Search query templates ────────────────────────────────────────────────────

const SEARCH_QUERIES = [
  'general contractor {location}',
  'construction company {location}',
  'commercial construction contractor {location}',
  'general contracting {location}',
  'building contractor {location}',
];

// ── Construction company filtering ───────────────────────────────────────────

const CONSTRUCTION_SIGNALS = [
  'contractor', 'construction', 'builder', 'contracting',
  'remodel', 'renovation', 'concrete', 'masonry', 'roofing',
  'mechanical', 'structural', 'development', 'infrastructure',
  'sitework', 'excavat', 'grading', 'framing', 'drywall',
  'carpentry', 'plumbing', 'electrical', 'hvac', 'welding',
];

// Categories that immediately disqualify a result
const SKIP_CATEGORIES = [
  'restaurant', 'cafe', 'bar', 'retail', 'store', 'shop', 'salon',
  'gym', 'church', 'school', 'hospital', 'doctor', 'dentist',
  'gas station', 'car wash', 'auto repair', 'bank', 'pharmacy',
  'real estate agent', 'insurance', 'hotel', 'motel', 'lodging',
  'accounting', 'attorney', 'law firm', 'property management',
];

function isConstructionCompany(result) {
  const nameLower = (result.name || '').toLowerCase();
  const catLower = (result.category || '').toLowerCase();

  // Skip obviously irrelevant categories
  if (SKIP_CATEGORIES.some(c => catLower.includes(c))) return false;

  // Must have at least one construction signal in name OR category
  return CONSTRUCTION_SIGNALS.some(sig =>
    nameLower.includes(sig) || catLower.includes(sig)
  );
}

function scoreCompany(result) {
  const nameLower = (result.name || '').toLowerCase();
  const catLower = (result.category || '').toLowerCase();
  let score = 40; // Base: found on Google Maps
  const reasons = ['Google Maps listing'];

  if (result.phone) { score += 5; reasons.push('Has phone'); }
  if (result.rating && result.rating >= 4.0) { score += 5; reasons.push(`${result.rating}★`); }
  if (result.reviewCount && result.reviewCount >= 10) { score += 5; reasons.push(`${result.reviewCount} reviews`); }

  // Category/name quality signals
  if (/general contractor/i.test(nameLower) || /general contractor/i.test(catLower)) {
    score += 10; reasons.push('General contractor');
  } else if (/construction/i.test(nameLower)) {
    score += 5; reasons.push('Construction in name');
  }

  // Entity type signals (bigger companies are better leads)
  if (/inc\b|incorporated/i.test(nameLower)) { score += 4; reasons.push('Inc'); }
  if (/llc\b|l\.l\.c/i.test(nameLower)) { score += 3; reasons.push('LLC'); }
  if (/corp\b/i.test(nameLower)) { score += 4; reasons.push('Corp'); }
  if (/group\b|associates?|partners?|enterprises?/i.test(nameLower)) {
    score += 3; reasons.push('Business entity');
  }

  return { score: Math.min(Math.max(score, 0), 100), reason: reasons.join('; ') };
}

// ── Google Maps scraper ───────────────────────────────────────────────────────

async function scrapeGoogleMaps(query, limit = 60) {
  let browser = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
    });
    const page = await context.newPage();

    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    await page.goto(searchUrl, { timeout: 30000 });
    await page.waitForTimeout(3000);

    // Check for CAPTCHA
    const title = await page.title();
    if (title.toLowerCase().includes('captcha') || title.toLowerCase().includes('unusual traffic')) {
      await browser.close();
      return { results: [], captcha: true };
    }

    const allResults = [];
    for (let pageNum = 0; pageNum < 3 && allResults.length < limit; pageNum++) {
      const pageResults = await extractListings(page);

      // Stop if >50% overlap with already-gathered results (we're re-seeing the same page)
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

    await browser.close();
    return { results: allResults.slice(0, limit), captcha: false };

  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    return { results: [], error: err.message };
  }
}

/**
 * Extract listing cards from Google Maps results feed.
 * Uses same CSS selectors as googleMapsDiscovery.js (proven working Feb 2026).
 */
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

          // Name
          const nameEl = container?.querySelector('.qBF1Pd') ||
                         container?.querySelector('[class*="fontHeadlineSmall"]') ||
                         container?.querySelector('div[class*="NrDZNb"]');
          const name = nameEl?.textContent?.trim() || card.textContent?.trim()?.split('\n')[0];
          if (!name || name.length < 3) continue;

          // Address
          const addressEl = container?.querySelector('.W4Efsd .W4Efsd span') ||
                            container?.querySelector('[class*="UsdlK"]');
          const address = addressEl?.textContent?.trim();

          // Rating & reviews
          const ratingEl = container?.querySelector('.MW4etd') ||
                           container?.querySelector('[class*="ZkP5Je"]');
          const rating = ratingEl ? parseFloat(ratingEl.textContent.trim()) : null;

          const reviewEl = container?.querySelector('.UY7F9') ||
                           container?.querySelector('[class*="UY7F9"]');
          const reviewText = reviewEl?.textContent?.replace(/[()]/g, '').trim();
          const reviewCount = reviewText ? parseInt(reviewText.replace(/,/g, '')) : null;

          // Category
          const categoryEl = container?.querySelector('.W4Efsd .W4Efsd') ||
                              container?.querySelector('[class*="fontBodyMedium"] span');
          const category = categoryEl?.textContent?.trim()?.split('·')[0]?.trim();

          // Phone (sometimes shown directly in card)
          const phoneEl = container?.querySelector('[data-dtype="d3ph"]');
          const phone = phoneEl?.textContent?.trim();

          results.push({ name, address, rating, reviewCount, category, phone });
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

// ── Address parser ────────────────────────────────────────────────────────────

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
  // No state match — fall back
  return { city: fallbackCity, state: fallbackState };
}

// ── Main entry point ──────────────────────────────────────────────────────────

async function runConstructionDiscovery(params = {}) {
  // Determine market — use explicit override or pull next from rotation
  let market, marketIndex;
  if (params.region) {
    market = { region: params.region };
    marketIndex = null;
  } else {
    const m = getNextMarket();
    market = m;
    marketIndex = m.index;
  }

  const region = market.region;
  // Extract fallback city/state from region string like "Denver, CO"
  const regionParts = region.split(',').map(s => s.trim());
  const fallbackCity = regionParts[0];
  const fallbackState = regionParts[1]
    ? regionParts[1].replace(/\s+/g, '').slice(0, 2).toUpperCase()
    : null;

  const maxLeads = parseInt(params.limit) || 100;

  console.log(`[ConstructionDiscovery] Starting: region="${region}", limit=${maxLeads}`);

  const queries = SEARCH_QUERIES.map(t => t.replace('{location}', region));
  const stats = {
    queries_run: 0,
    results_scraped: 0,
    filtered: 0,
    inserted: 0,
    skipped: 0,
    captcha_hits: 0,
  };

  // Dedup within this run (same query may surface same company)
  const seenNames = new Set();

  for (const query of queries) {
    if (stats.inserted >= maxLeads) break;

    console.log(`[ConstructionDiscovery] Query: "${query}"`);
    const { results = [], captcha, error } = await scrapeGoogleMaps(query, 60);
    stats.queries_run++;

    if (captcha) {
      stats.captcha_hits++;
      console.warn(`[ConstructionDiscovery] CAPTCHA on "${query}" — waiting 5s`);
      await new Promise(r => setTimeout(r, 5000));
      continue;
    }

    if (error) {
      console.error(`[ConstructionDiscovery] Scrape error: ${error}`);
      continue;
    }

    stats.results_scraped += results.length;
    console.log(`[ConstructionDiscovery]   ${results.length} raw results`);

    for (const r of results) {
      if (stats.inserted >= maxLeads) break;

      const name = (r.name || '').trim();
      if (!name || name.length < 3) continue;

      // Dedup within run
      const nameKey = name.toLowerCase();
      if (seenNames.has(nameKey)) continue;
      seenNames.add(nameKey);

      // Construction filter
      if (!isConstructionCompany(r)) { stats.filtered++; continue; }

      // DB dedup
      const existing = get('SELECT id FROM cfo_leads WHERE LOWER(company_name) = LOWER(?)', [name]);
      if (existing) { stats.skipped++; continue; }

      const { city, state } = parseCityState(r.address, fallbackCity, fallbackState);
      const { score, reason } = scoreCompany(r);

      const notes = [
        `Maps: ${r.category || 'construction'}`,
        r.rating ? `${r.rating}★` : null,
        r.reviewCount ? `${r.reviewCount} reviews` : null,
        region,
      ].filter(Boolean).join(' | ');

      run(
        `INSERT INTO cfo_leads
           (company_name, phone, city, state,
            pilot_fit_score, pilot_fit_reason,
            source, source_agent, status,
            enrichment_status, notes, erp_type)
         VALUES (?, ?, ?, ?, ?, ?, 'google_maps_discovery', 'jake', 'new', 'pending', ?, 'Unknown')`,
        [
          name,
          r.phone || null,
          city || null,
          state || fallbackState,
          score,
          reason,
          notes,
        ]
      );

      stats.inserted++;
      console.log(`[ConstructionDiscovery]   + ${name} (${city || fallbackCity}, ${state || fallbackState}) score:${score}`);
    }

    // Polite delay between queries
    if (stats.inserted < maxLeads && queries.indexOf(query) < queries.length - 1) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  // Mark this market as scouted in rotation
  if (marketIndex !== null && marketIndex !== undefined) {
    markMarketScouted(marketIndex);
  }

  const summary = [
    `Construction Discovery complete for ${region}:`,
    `  ${stats.inserted} new companies inserted`,
    `  ${stats.queries_run} queries, ${stats.results_scraped} raw results, ${stats.filtered} filtered (non-GC), ${stats.skipped} dupes`,
    stats.captcha_hits > 0 ? `  ⚠️  ${stats.captcha_hits} CAPTCHA hits` : null,
    `  Cost: $0.00`,
  ].filter(Boolean).join('\n');

  console.log(`[ConstructionDiscovery] Done.\n${summary}`);

  return { summary, stats, region, cost_usd: 0 };
}

module.exports = { runConstructionDiscovery };
