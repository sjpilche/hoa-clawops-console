/**
 * @file owenPMDiscovery.js
 * @description Owen Property Management Company Discovery via Google Maps
 *
 * Scrapes Google Maps for property management companies across Owen's target markets.
 * Captures company name, address, phone, portfolio signals. The contact enricher
 * (owenContactEnricher.js) then finds CFO/controller names + emails for each.
 *
 * Cost: $0/run — Playwright only, no paid APIs.
 * Handler: owen_pm_discovery
 *
 * Reuses playwrightPool patterns from jakeConstructionDiscovery.js but with
 * PM-specific search queries, filtering, and scoring.
 *
 * Message params:
 *   region: 'Tampa, FL'  (default: next Owen market in rotation)
 *   limit:  100          (max inserts per run)
 */

'use strict';

const pool = require('./playwrightPool');
const { run, get, all } = require('../db/connection');

// ── PM-specific search queries ────────────────────────────────────────────────

const SEARCH_QUERIES = [
  'property management company {location}',
  'HOA management company {location}',
  'community association management {location}',
  'condominium management {location}',
  'residential property manager {location}',
  'apartment management company {location}',
  'CAM company {location}',
];

// ── PM company filtering ──────────────────────────────────────────────────────

const PM_SIGNALS = [
  'property management', 'property manager', 'hoa management',
  'community association', 'condo management', 'condominium',
  'apartment management', 'residential management', 'rental management',
  'association management', 'cam company', 'realty management',
  'portfolio management', 'tenant', 'landlord', 'leasing',
];

const SKIP_CATEGORIES = [
  'restaurant', 'cafe', 'bar', 'retail', 'store', 'shop', 'salon',
  'gym', 'church', 'school', 'hospital', 'doctor', 'dentist',
  'gas station', 'car wash', 'auto repair', 'bank', 'pharmacy',
  'construction', 'contractor', 'builder', 'plumber', 'electrician',
  'insurance agent', 'mortgage', 'title company',
];

function isPMCompany(result) {
  const nameLower = (result.name || '').toLowerCase();
  const catLower = (result.category || '').toLowerCase();

  if (SKIP_CATEGORIES.some(c => catLower.includes(c) || nameLower.includes(c))) return false;

  return PM_SIGNALS.some(sig =>
    nameLower.includes(sig) || catLower.includes(sig)
  );
}

function scoreCompany(result) {
  const nameLower = (result.name || '').toLowerCase();
  const catLower = (result.category || '').toLowerCase();
  let score = 40;
  const reasons = ['Google Maps listing'];

  if (result.phone) { score += 5; reasons.push('Has phone'); }
  if (result.rating && result.rating >= 4.0) { score += 5; reasons.push(`${result.rating}★`); }
  if (result.reviewCount && result.reviewCount >= 10) { score += 5; reasons.push(`${result.reviewCount} reviews`); }

  // PM-specific quality signals
  if (/property management/i.test(catLower)) { score += 10; reasons.push('PM category'); }
  if (/hoa|association/i.test(catLower)) { score += 10; reasons.push('HOA/Association'); }
  if (/community/i.test(nameLower)) { score += 5; reasons.push('Community in name'); }

  return { score: Math.min(score, 100), reasons: reasons.join(', ') };
}

// ── Owen target markets ───────────────────────────────────────────────────────

const OWEN_MARKETS = [
  // Florida — PM hotspot
  'Tampa, FL', 'Miami, FL', 'Orlando, FL', 'Jacksonville, FL', 'Fort Lauderdale, FL',
  'Naples, FL', 'Sarasota, FL', 'West Palm Beach, FL',
  // Texas
  'Houston, TX', 'Dallas, TX', 'Austin, TX', 'San Antonio, TX',
  // Arizona / Nevada
  'Phoenix, AZ', 'Scottsdale, AZ', 'Las Vegas, NV',
  // California
  'Los Angeles, CA', 'San Diego, CA', 'San Francisco, CA', 'Sacramento, CA',
  // Other high-density PM markets
  'Denver, CO', 'Atlanta, GA', 'Charlotte, NC', 'Nashville, TN',
  'Seattle, WA', 'Portland, OR',
];

let _marketIndex = 0;

function getNextOwenMarket() {
  const market = OWEN_MARKETS[_marketIndex % OWEN_MARKETS.length];
  _marketIndex++;
  return market;
}

// ── Discovery engine ──────────────────────────────────────────────────────────

async function runPMDiscovery({ region, limit = 100 } = {}) {
  const targetRegion = region || getNextOwenMarket();
  const startTime = Date.now();

  const stats = { total: 0, inserted: 0, skipped: 0, errors: 0 };
  const leads = [];

  for (const queryTemplate of SEARCH_QUERIES) {
    const query = queryTemplate.replace('{location}', targetRegion);
    let page;

    try {
      page = await pool.getPage();
      const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
      await page.goto(mapsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);

      // Scroll results panel to load more
      const resultsPanel = page.locator('[role="feed"]').first();
      for (let i = 0; i < 5; i++) {
        try {
          await resultsPanel.evaluate(el => el.scrollTop = el.scrollHeight);
          await page.waitForTimeout(1500);
        } catch { break; }
      }

      // Extract business cards
      const results = await page.evaluate(() => {
        const cards = document.querySelectorAll('[data-value]');
        return Array.from(cards).slice(0, 30).map(card => {
          const name = card.querySelector('.fontHeadlineSmall')?.textContent?.trim() || '';
          const category = card.querySelector('.fontBodyMedium [class*="ZkP5Je"]')?.textContent?.trim() || '';
          const address = card.querySelector('.fontBodyMedium [class*="W4Efsd"]:nth-child(2)')?.textContent?.trim() || '';
          const phone = (address.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/) || [])[0] || '';
          const ratingEl = card.querySelector('[class*="MW4etd"]');
          const rating = ratingEl ? parseFloat(ratingEl.textContent) : null;
          const reviewEl = card.querySelector('[class*="UY7F9"]');
          const reviewCount = reviewEl ? parseInt(reviewEl.textContent.replace(/[^\d]/g, '')) : 0;
          return { name, category, address, phone, rating, reviewCount };
        }).filter(r => r.name);
      });

      for (const result of results) {
        stats.total++;
        if (!isPMCompany(result)) { stats.skipped++; continue; }

        // Dedup
        const existing = get('SELECT id FROM cfo_leads WHERE company_name = ? COLLATE NOCASE', [result.name]);
        if (existing) { stats.skipped++; continue; }

        if (stats.inserted >= limit) break;

        const { score, reasons } = scoreCompany(result);
        const city = result.address?.split(',')[0]?.trim() || targetRegion.split(',')[0];
        const state = targetRegion.split(',')[1]?.trim() || null;

        run(`INSERT INTO cfo_leads (company_name, city, state, phone, source, source_agent,
              pilot_fit_score, pilot_fit_reason, status, enrichment_status, attribution_source, revenue_stage, workspace_id)
             VALUES (?, ?, ?, ?, 'maps_discovery', 'owen', ?, ?, 'new', 'pending', 'maps_discovery', 'discovered', 3)`,
          [result.name, city, state, result.phone || null, score, reasons]);

        const inserted = get('SELECT id FROM cfo_leads WHERE company_name = ? COLLATE NOCASE', [result.name]);
        leads.push({ id: inserted?.id, company_name: result.name, city, state, phone: result.phone, score });
        stats.inserted++;
      }
    } catch (err) {
      stats.errors++;
      console.warn(`[OwenPMDiscovery] Query error (${query}):`, err.message);
    } finally {
      if (page) await pool.safeClose(page);
    }

    if (stats.inserted >= limit) break;
  }

  return {
    region: targetRegion,
    stats,
    leads,
    summary: `Owen PM Discovery: ${targetRegion} — ${stats.inserted} new PM companies found (${stats.total} scraped, ${stats.skipped} skipped)`,
  };
}

module.exports = { runPMDiscovery, OWEN_MARKETS };
