/**
 * @file scrape-dbpr-contractors.js
 * @description Scrape FL licensed contractors from DBPR public database
 *
 * Florida DBPR (Dept of Business & Professional Regulation) publishes
 * all licensed contractors publicly at myfloridalicense.com. No login
 * required. Scrapes Certified/Registered General Contractors by county,
 * then seeds them into cfo_leads.
 *
 * Cost: $0 — Playwright only, no LLM.
 *
 * Usage:
 *   node scripts/scrape-dbpr-contractors.js
 *   node scripts/scrape-dbpr-contractors.js --county Sarasota --limit 50
 *   node scripts/scrape-dbpr-contractors.js --all-sw-fl
 */

'use strict';

const { chromium } = require('playwright');
const { run, get, initDatabase } = require('../server/db/connection');

// ─── COUNTY CODES FROM DBPR (verified Feb 2026) ───────────────────────────────
const COUNTY_CODES = {
  'Hillsborough': '39',
  'Pinellas': '62',    // Pasco=61, Pinellas=62
  'Pasco': '61',
  'Sarasota': '68',    // St. Lucie=66, Sarasota=68
  'Manatee': '51',
  'Charlotte': '18',
  'Lee': '46',
  'Collier': '21',
  'Orange': '58',
  'Osceola': '59',
  'Polk': '63',        // Pinellas=62, Polk=63
  'Seminole': '69',    // Sarasota=68, Seminole=69
  'Brevard': '15',
  'Dade': '23',        // Miami-Dade
  'Broward': '16',
  'Palm Beach': '60',
  'Alachua': '11',
  'Duval': '26',
  'Hernando': '37',
  'St. Lucie': '66',
  'Martin': '53',
  'Indian River': '41',
};

// License types: 0605=Cert GC, 0618=Registered GC, 0602=Cert Building, 0603=Cert Roofing
const LICENSE_TYPES = {
  '0605': { label: 'Certified General Contractor', abbr: 'CGC', base_score: 65 },
  '0618': { label: 'Registered General Contractor', abbr: 'RGC', base_score: 55 },
  '0602': { label: 'Certified Building Contractor', abbr: 'CBC', base_score: 58 },
  '0615': { label: 'Registered Building Contractor', abbr: 'RBC', base_score: 48 },
};

// SW FL priority counties (Phase 0 focus)
const SW_FL_COUNTIES = [
  'Sarasota', 'Manatee', 'Charlotte', 'Lee', 'Collier',
  'Hillsborough', 'Pinellas',
];

// ─── ARGS ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };

const ALL_SW_FL   = args.includes('--all-sw-fl');
const targetCounty = getArg('--county') || 'Sarasota';
const licTypeCode  = getArg('--lic-type') || '0605';
const MAX_LEADS    = parseInt(getArg('--limit')) || 200;
const ACTIVE_ONLY  = !args.includes('--include-inactive');

// ─── SCORING ─────────────────────────────────────────────────────────────────
function scoreLead(name, licTypeCode, county, status, isCompany) {
  const config = LICENSE_TYPES[licTypeCode] || {};
  let score = config.base_score || 50;
  const reasons = [config.label || 'FL Licensed Contractor'];

  const n = name.toLowerCase();

  // DBA = registered business entity (better ICP than individual QE)
  if (isCompany) {
    score += 8; reasons.push('Registered business entity');
  } else {
    // "Primary" = individual qualifying examiner — likely small/sole proprietor
    score -= 8;
  }

  // Company structure signals (more corporate = bigger = better ICP)
  if (/inc\b|incorporated/i.test(n)) { score += 4; reasons.push('Incorporated'); }
  if (/llc\b|l\.l\.c/i.test(n)) { score += 3; }
  if (/corp\b|corporation/i.test(n)) { score += 4; reasons.push('Corporation'); }
  if (/group\b/i.test(n)) { score += 4; reasons.push('Group entity'); }
  if (/associates?|partners?|enterprises?|holdings?/i.test(n)) { score += 3; }

  // Construction/GC signals
  if (/general contractor|gen\. cont/i.test(n)) { score += 5; reasons.push('GC in name'); }
  if (/construction|builder|building/i.test(n)) { score += 4; reasons.push('Construction in name'); }
  if (/contracting|contractors/i.test(n)) { score += 3; }

  // Multi-word names = more likely a real business
  const wordCount = name.trim().split(/\s+/).length;
  if (wordCount >= 4) { score += 3; }
  else if (wordCount <= 2 && !/inc|llc|corp/i.test(n)) {
    score -= 5; // Likely sole proprietor
  }

  // SW FL priority (Steve's home market)
  const swfl = ['Sarasota', 'Manatee', 'Charlotte', 'Lee', 'Collier'];
  if (swfl.includes(county)) { score += 5; reasons.push('SW FL priority'); }

  // Active license = reliable lead
  if (/current,\s*active/i.test(status || '')) {
    score += 3; reasons.push('Active license');
  }

  return { score: Math.min(Math.max(score, 0), 100), reason: reasons.join('; ') };
}

// ─── DBPR SCRAPER ─────────────────────────────────────────────────────────────
async function scrapeDBPRCounty(page, county, countyCode, licType, licTypeCode) {
  console.log(`\n[DBPR] ${county} | ${licType.label}`);

  // Step 1: Go to search form, select "Search by License Type"
  await page.goto('https://www.myfloridalicense.com/wl11.asp', {
    waitUntil: 'domcontentloaded', timeout: 30000,
  });
  await page.waitForTimeout(1000);

  await page.locator('input[value="LicTyp"]').click();
  await page.waitForTimeout(300);
  await page.locator('button[name="SelectSearchType"]').click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);

  // Step 2: Fill search criteria
  await page.selectOption('select[name="Board"]', '06');     // Construction Industry
  await page.waitForTimeout(800);                            // wait for LicenseType dropdown to populate
  await page.selectOption('select[name="LicenseType"]', licTypeCode);
  await page.waitForTimeout(300);
  await page.selectOption('select[name="County"]', countyCode);
  await page.waitForTimeout(200);
  await page.selectOption('select[name="State"]', 'FL');
  await page.waitForTimeout(200);
  await page.selectOption('select[name="RecsPerPage"]', '50');
  await page.waitForTimeout(200);

  // Step 3: Submit
  await page.locator('button[name="Search1"]').click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  const results = [];
  let pageNum = 1;
  let totalShown = 0;

  while (true) {
    const bodyText = await page.textContent('body');

    if (bodyText.includes('no records found') || bodyText.includes('No records found')) {
      console.log(`[DBPR] No records for ${county}`);
      break;
    }

    // Count total records — format: "Search Results - 2120 Records"
    const countMatch = bodyText.match(/Search Results[^\d]*(\d[\d,]+)\s*Records/i);
    if (pageNum === 1 && countMatch) {
      console.log(`[DBPR] Total: ${countMatch[1].replace(',', '')} records in ${county}`);
    }

    // Parse the page's contractor rows.
    // DBPR result table: data rows have exactly 5 cells:
    //   [0]=LicenseType  [1]=CompanyName  [2]=NameType(DBA/Primary)  [3]=LicNum  [4]=Status/Expires
    // Address rows have 2-3 cells — skip those.
    const rows = await page.evaluate((activeOnly) => {
      const results = [];
      const seen = new Set();

      document.querySelectorAll('tr').forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length !== 5) return; // data rows have exactly 5 cells

        const cell0 = cells[0].textContent.trim(); // e.g. "Certified General Contractor"
        const cell1 = cells[1].textContent.trim(); // Company/person name
        const cell2 = cells[2].textContent.trim(); // "DBA" or "Primary"
        const cell3 = cells[3].textContent.trim(); // e.g. "CGC1523630Cert General"
        const cell4 = cells[4].textContent.trim(); // e.g. "Current, Active08/31/2026"

        // Skip header row
        if (cell0 === 'License Type') return;
        // Skip address rows (address cells start with "Main Address" etc.)
        if (cell0.includes('Address') || cell1.includes('Address')) return;
        // Must be a contractor license type
        if (!cell0.includes('Contractor') && !cell0.includes('Construction')) return;
        if (!cell1 || cell1.length < 3) return;

        // Extract license number (e.g. CGC1523630 from "CGC1523630Cert General")
        const licMatch = cell3.match(/([A-Z]{2,5}[A-Z]?\d{4,})/);
        const licNum = licMatch ? licMatch[1] : '';

        const status = cell4;
        const isActive = /current,\s*active/i.test(status);
        const isRevoked = /revoked|null and void|delinquent/i.test(status);

        if (activeOnly && !isActive) return;
        if (isRevoked) return; // always skip

        const key = cell1.toLowerCase().trim();
        if (seen.has(key)) return;
        seen.add(key);

        results.push({
          company_name: cell1,
          license_num: licNum,
          status: status.substring(0, 60),
          is_active: isActive,
          is_company: cell2 === 'DBA', // DBA = business entity
        });
      });

      return results;
    }, ACTIVE_ONLY);

    results.push(...rows.map(r => ({ ...r, county })));
    totalShown += rows.length;
    console.log(`[DBPR] Page ${pageNum}: +${rows.length} companies (total: ${results.length})`);

    // Check if there's a "Next" page — DBPR uses › (›) as the next link
    const hasNext = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      return links.some(a => {
        const t = a.textContent.trim();
        return t === '›' || t === '>' || t.toLowerCase() === 'next';
      });
    });

    if (!hasNext || results.length >= 500) break;

    // Click next page (the › link)
    try {
      const nextLink = page.locator('a').filter({ hasText: /^›$|^>$/ }).first();
      if (await nextLink.count() === 0) break;
      await nextLink.click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);
      pageNum++;
    } catch (_) {
      break;
    }
  }

  return results;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  const counties = ALL_SW_FL
    ? SW_FL_COUNTIES
    : [targetCounty];

  const licConfig = LICENSE_TYPES[licTypeCode];
  if (!licConfig) {
    console.error(`Unknown license type: ${licTypeCode}. Options: ${Object.keys(LICENSE_TYPES).join(', ')}`);
    process.exit(1);
  }

  console.log('\n=== FL DBPR Contractor Scraper ===');
  console.log(`Counties: ${counties.join(', ')}`);
  console.log(`License type: ${licConfig.label} (${licTypeCode})`);
  console.log(`Active only: ${ACTIVE_ONLY}`);
  console.log(`Max leads: ${MAX_LEADS}`);

  await initDatabase();

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

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalFiltered = 0;
  const allCompanies = [];

  for (const county of counties) {
    if (totalInserted >= MAX_LEADS) break;

    const countyCode = COUNTY_CODES[county];
    if (!countyCode) {
      console.warn(`[DBPR] Unknown county: ${county} — skipping`);
      continue;
    }

    try {
      const companies = await scrapeDBPRCounty(page, county, countyCode, licConfig, licTypeCode);
      allCompanies.push(...companies);

      // Seed to DB immediately so we can see progress
      for (const co of companies) {
        if (totalInserted >= MAX_LEADS) break;

        const name = (co.company_name || '').trim();
        if (!name || name.length < 3) { totalFiltered++; continue; }

        const existing = get('SELECT id FROM cfo_leads WHERE LOWER(company_name) = LOWER(?)', [name]);
        if (existing) { totalSkipped++; continue; }

        const { score, reason } = scoreLead(name, licTypeCode, county, co.status, co.is_company);

        // Only seed leads that score >= 50 (basic quality filter)
        if (score < 45) { totalFiltered++; continue; }

        run(
          `INSERT INTO cfo_leads
           (company_name, erp_type, state, website, pilot_fit_score, pilot_fit_reason, status, source, notes)
           VALUES (?, 'Unknown', 'FL', null, ?, ?, 'new', 'dbpr_scrape', ?)`,
          [name, score, reason, co.license_num ? `${co.license_num} | ${co.county} county` : `${co.county} county`]
        );

        console.log(`  + [${score}] ${name.substring(0, 50)}`);
        totalInserted++;
      }

      // Polite delay between counties
      if (counties.indexOf(county) < counties.length - 1) {
        await page.waitForTimeout(3000 + Math.random() * 2000);
      }
    } catch (err) {
      console.error(`[DBPR] Error for ${county}: ${err.message}`);
    }
  }

  await browser.close();

  console.log('\n=== Final Results ===');
  console.log(`Raw scraped:  ${allCompanies.length}`);
  console.log(`Filtered:     ${totalFiltered} (score<45 or no name)`);
  console.log(`Skipped:      ${totalSkipped} (duplicates)`);
  console.log(`Inserted:     ${totalInserted}`);
  console.log('\n✅ Done! Navigate to /cfo-marketing to see leads.');

  process.exit(0);
}

main().catch(e => {
  console.error('\n❌ Fatal error:', e.message);
  console.error(e.stack);
  process.exit(1);
});
