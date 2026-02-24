/**
 * @file cfoLeadScout.js
 * @description Agent: CFO Lead Scout
 *
 * Finds FL-licensed construction companies via DBPR (Florida Dept of Business
 * & Professional Regulation) public license database — myfloridalicense.com.
 *
 * No login required. No LLM. No API key. $0/run.
 * Handler: cfo_lead_scout
 *
 * Message params:
 *   county:    'Sarasota' | 'Charlotte' | 'Lee' | 'Collier' | ... (default: next priority)
 *   lic_type:  '0605' (Cert GC) | '0618' (Reg GC) | '0602' (Cert Building) — default 0605
 *   limit:     max leads to insert per run (default 50)
 */

'use strict';

const { chromium } = require('playwright');
const { run, get, all } = require('../db/connection');

// ─── COUNTY CODES (verified Feb 2026) ────────────────────────────────────────
const COUNTY_CODES = {
  'Sarasota': '68',
  'Manatee': '51',
  'Charlotte': '18',
  'Lee': '46',
  'Collier': '21',
  'Hillsborough': '39',
  'Pinellas': '62',
  'Pasco': '61',
  'Orange': '58',
  'Osceola': '59',
  'Polk': '63',
  'Seminole': '69',
  'Brevard': '15',
  'Dade': '23',
  'Broward': '16',
  'Palm Beach': '60',
  'Duval': '26',
  'Hernando': '37',
  'St. Lucie': '66',
};

// Priority order for auto-cycling
const COUNTY_PRIORITY = [
  'Sarasota', 'Charlotte', 'Lee', 'Collier', 'Manatee',
  'Hillsborough', 'Pinellas', 'Brevard', 'Palm Beach',
  'Broward', 'Dade', 'Orange', 'Polk', 'Duval',
];

// ─── LICENSE TYPE CONFIG ──────────────────────────────────────────────────────
const LICENSE_TYPES = {
  '0605': { label: 'Certified General Contractor', base_score: 65 },
  '0618': { label: 'Registered General Contractor', base_score: 55 },
  '0602': { label: 'Certified Building Contractor', base_score: 58 },
  '0615': { label: 'Registered Building Contractor', base_score: 48 },
};

// ─── SCORING ─────────────────────────────────────────────────────────────────
function scoreLead(name, licTypeCode, county, status, isCompany) {
  const config = LICENSE_TYPES[licTypeCode] || {};
  let score = config.base_score || 50;
  const reasons = [config.label || 'FL Licensed Contractor'];
  const n = name.toLowerCase();

  if (isCompany) {
    score += 8; reasons.push('Registered business entity');
  } else {
    score -= 8; // individual QE, likely sole proprietor
  }

  if (/inc\b|incorporated/i.test(n)) { score += 4; reasons.push('Incorporated'); }
  if (/llc\b|l\.l\.c/i.test(n)) { score += 3; }
  if (/corp\b|corporation/i.test(n)) { score += 4; reasons.push('Corporation'); }
  if (/group\b/i.test(n)) { score += 4; reasons.push('Group entity'); }
  if (/associates?|partners?|enterprises?|holdings?/i.test(n)) { score += 3; }
  if (/general contractor|gen\. cont/i.test(n)) { score += 5; reasons.push('GC in name'); }
  if (/construction|builder|building/i.test(n)) { score += 4; reasons.push('Construction in name'); }
  if (/contracting|contractors/i.test(n)) { score += 3; }
  if (name.trim().split(/\s+/).length >= 4) { score += 3; }
  else if (name.trim().split(/\s+/).length <= 2 && !/inc|llc|corp/i.test(n)) { score -= 5; }

  const swfl = ['Sarasota', 'Manatee', 'Charlotte', 'Lee', 'Collier'];
  if (swfl.includes(county)) { score += 5; reasons.push('SW FL priority'); }
  if (/current,\s*active/i.test(status || '')) { score += 3; reasons.push('Active license'); }

  return { score: Math.min(Math.max(score, 0), 100), reason: reasons.join('; ') };
}

// ─── DBPR SCRAPER ─────────────────────────────────────────────────────────────
async function scrapeDBPRCounty(page, county, countyCode, licTypeCode) {
  const licConfig = LICENSE_TYPES[licTypeCode];
  console.log(`[LeadScout] Scraping ${county} county | ${licConfig.label}`);

  await page.goto('https://www.myfloridalicense.com/wl11.asp', {
    waitUntil: 'domcontentloaded', timeout: 30000,
  });
  await page.waitForTimeout(1000);

  await page.locator('input[value="LicTyp"]').click();
  await page.waitForTimeout(300);
  await page.locator('button[name="SelectSearchType"]').click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);

  await page.selectOption('select[name="Board"]', '06');
  await page.waitForTimeout(800);
  await page.selectOption('select[name="LicenseType"]', licTypeCode);
  await page.waitForTimeout(300);
  await page.selectOption('select[name="County"]', countyCode);
  await page.waitForTimeout(200);
  await page.selectOption('select[name="State"]', 'FL');
  await page.waitForTimeout(200);
  await page.selectOption('select[name="RecsPerPage"]', '50');
  await page.waitForTimeout(200);

  await page.locator('button[name="Search1"]').click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  const results = [];

  while (true) {
    const bodyText = await page.textContent('body');
    if (bodyText.includes('no records found') || bodyText.includes('No records found')) {
      break;
    }

    const countMatch = bodyText.match(/Search Results[^\d]*(\d[\d,]+)\s*Records/i);
    if (results.length === 0 && countMatch) {
      console.log(`[LeadScout] ${county}: ${countMatch[1]} total records in DBPR`);
    }

    // Parse 5-cell data rows (License Type | Name | DBA/Primary | LicNum | Status)
    const rows = await page.evaluate(() => {
      const found = [];
      const seen = new Set();
      document.querySelectorAll('tr').forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length !== 5) return;
        const cell0 = cells[0].textContent.trim();
        const cell1 = cells[1].textContent.trim();
        const cell2 = cells[2].textContent.trim();
        const cell3 = cells[3].textContent.trim();
        const cell4 = cells[4].textContent.trim();
        if (cell0 === 'License Type' || cell0.includes('Address')) return;
        if (!cell0.includes('Contractor') && !cell0.includes('Construction')) return;
        if (!cell1 || cell1.length < 3) return;
        const isActive = /current,\s*active/i.test(cell4);
        const isRevoked = /revoked|null and void|delinquent/i.test(cell4);
        if (!isActive || isRevoked) return;
        const licMatch = cell3.match(/([A-Z]{2,5}[A-Z]?\d{4,})/);
        const key = cell1.toLowerCase().trim();
        if (seen.has(key)) return;
        seen.add(key);
        found.push({
          company_name: cell1,
          license_num: licMatch ? licMatch[1] : '',
          status: cell4.substring(0, 60),
          is_company: cell2 === 'DBA',
        });
      });
      return found;
    });

    results.push(...rows.map(r => ({ ...r, county })));

    const hasNext = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a')).some(a => {
        const t = a.textContent.trim();
        return t === '›' || t === '>';
      });
    });
    if (!hasNext) break;

    try {
      await page.locator('a').filter({ hasText: /^›$|^>$/ }).first().click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);
    } catch (_) {
      break;
    }
  }

  return results;
}

// ─── PICK NEXT COUNTY ─────────────────────────────────────────────────────────
function pickNextCounty() {
  // Find the county with the fewest DBPR leads already seeded
  const existingByCounty = all(
    "SELECT notes, COUNT(*) as cnt FROM cfo_leads WHERE source='dbpr_scrape' GROUP BY notes"
  );
  const countsByCounty = {};
  for (const row of existingByCounty) {
    const match = (row.notes || '').match(/\|\s*(\w[\w\s.]*) county/i);
    if (match) {
      const c = match[1].trim();
      countsByCounty[c] = (countsByCounty[c] || 0) + parseInt(row.cnt);
    }
  }
  // Pick first priority county that has < 50 leads already
  for (const county of COUNTY_PRIORITY) {
    if ((countsByCounty[county] || 0) < 50) return county;
  }
  return COUNTY_PRIORITY[0];
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function runLeadScout(params = {}) {
  const county = params.county || pickNextCounty();
  const licTypeCode = params.lic_type || '0605';
  const maxLeads = parseInt(params.limit) || 50;

  const countyCode = COUNTY_CODES[county];
  if (!countyCode) {
    throw new Error(`Unknown county: ${county}. Valid: ${Object.keys(COUNTY_CODES).join(', ')}`);
  }
  if (!LICENSE_TYPES[licTypeCode]) {
    throw new Error(`Unknown license type: ${licTypeCode}. Valid: ${Object.keys(LICENSE_TYPES).join(', ')}`);
  }

  console.log(`[LeadScout] Starting: county=${county}, lic_type=${licTypeCode}, limit=${maxLeads}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
  });
  const page = await context.newPage();

  const stats = { scraped: 0, inserted: 0, skipped: 0 };

  try {
    const companies = await scrapeDBPRCounty(page, county, countyCode, licTypeCode);
    stats.scraped = companies.length;

    for (const co of companies.slice(0, maxLeads)) {
      const name = (co.company_name || '').trim();
      if (!name || name.length < 3) continue;

      const existing = get('SELECT id FROM cfo_leads WHERE LOWER(company_name) = LOWER(?)', [name]);
      if (existing) { stats.skipped++; continue; }

      const { score, reason } = scoreLead(name, licTypeCode, county, co.status, co.is_company);
      if (score < 45) continue;

      run(
        `INSERT INTO cfo_leads
         (company_name, erp_type, state, website, pilot_fit_score, pilot_fit_reason, status, source, notes)
         VALUES (?, 'Unknown', 'FL', null, ?, ?, 'new', 'dbpr_scrape', ?)`,
        [name, score, reason, co.license_num ? `${co.license_num} | ${co.county} county` : `${co.county} county`]
      );
      stats.inserted++;
    }

    await browser.close();
  } catch (err) {
    await browser.close().catch(() => {});
    throw err;
  }

  const summary = `Lead Scout complete: ${stats.scraped} scraped from ${county} county DBPR, ${stats.inserted} new leads added (${stats.skipped} duplicates skipped)`;
  console.log(`[LeadScout] ${summary}`);

  return { summary, stats, county, cost_usd: 0 };
}

module.exports = { runLeadScout };
