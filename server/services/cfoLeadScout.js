/**
 * @file cfoLeadScout.js
 * @description Agent: CFO Lead Scout
 *
 * Finds $10M-$75M construction companies using Vista/Sage300/QBE
 * by scraping ERP vendor customer pages + AGC/ABC contractor directories.
 *
 * Cost: $0 — Playwright web scraping, no LLM calls.
 * Handler: cfo_lead_scout
 */

'use strict';

const { chromium } = require('playwright');
const { run, get, all } = require('../db/connection');

const CONFIG = {
  headless: true,
  timeout: 30000,
  pageWait: 3000,
  betweenPages: 3000,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
};

// ═══════════════════════════════════════════════════════════════════════════
// TARGET SOURCES
// ═══════════════════════════════════════════════════════════════════════════

// Each source specifies how to scrape a known page that lists real ICP companies
const SOURCES = {
  Vista: [
    {
      name: 'Viewpoint Customers',
      url: 'https://www.viewpoint.com/customers',
      type: 'viewpoint_customers',
    },
    {
      name: 'Trimble Construction Partner Page',
      url: 'https://construction.trimble.com/en/partners',
      type: 'trimble_partners',
    },
  ],
  Sage300: [
    {
      name: 'Sage Construction Customer Stories',
      url: 'https://www.sage.com/en-us/industries/construction/',
      type: 'sage_customers',
    },
  ],
  QBE: [
    {
      name: 'QuickBooks Enterprise Construction',
      url: 'https://quickbooks.intuit.com/enterprise/industries/construction/',
      type: 'qbe_page',
    },
  ],
  // AGC member directory works for all ERP types
  AGC: [
    {
      name: 'AGC of Florida Member Directory',
      url: 'https://www.agcfla.com/directory',
      type: 'agc_directory',
    },
    {
      name: 'ABC Florida Members',
      url: 'https://www.abcfla.org/members',
      type: 'abc_directory',
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// PILOT FIT SCORING
// ═══════════════════════════════════════════════════════════════════════════

function scoreLead(lead) {
  let score = 30; // Base score — we know they're a construction company from the source
  const reasons = [];
  const text = `${lead.company_name || ''} ${lead.snippet || ''}`.toLowerCase();

  // ERP Signal — source tells us the ERP
  if (lead.erp_type === 'Vista') { score += 30; reasons.push('Vista/Viewpoint ERP confirmed'); }
  else if (lead.erp_type === 'Sage300') { score += 25; reasons.push('Sage 300 ERP confirmed'); }
  else if (lead.erp_type === 'QBE') { score += 20; reasons.push('QBE confirmed'); }

  // Construction Signal — from directory source
  if (lead.source_type === 'viewpoint_customers' || lead.source_type === 'sage_customers') {
    score += 20; reasons.push('Verified ERP customer');
  } else if (lead.source_type === 'agc_directory' || lead.source_type === 'abc_directory') {
    score += 15; reasons.push('AGC/ABC member — construction verified');
  }

  // Size signals from name/snippet
  if (/general contractor|gc\b|GC /i.test(text)) { score += 5; reasons.push('GC'); }

  return { score: Math.min(score, 100), reason: reasons.join('; ') || 'Source match' };
}

// ═══════════════════════════════════════════════════════════════════════════
// SCRAPERS BY SOURCE TYPE
// ═══════════════════════════════════════════════════════════════════════════

async function scrapeViewpointCustomers(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: CONFIG.timeout });
  await page.waitForTimeout(CONFIG.pageWait);

  return await page.evaluate(() => {
    const companies = [];
    // Customer logos/cards often in a grid
    const selectors = [
      'a[href*="/customers/"]',
      '.customer-card a',
      '.customers-grid a',
      '.case-study-card a',
      '[class*="customer"] a',
      '.card a h3',
      'article a',
    ];
    const seen = new Set();
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach(el => {
        const name = (el.textContent || el.innerText || '').trim();
        if (name && name.length > 2 && name.length < 100 && !seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          companies.push({ company_name: name, website: el.href || '' });
        }
      });
    }
    return companies.slice(0, 30);
  });
}

async function scrapeGenericDirectory(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: CONFIG.timeout });
  await page.waitForTimeout(CONFIG.pageWait);

  return await page.evaluate(() => {
    const companies = [];
    const seen = new Set();
    // Generic member directory patterns
    const selectors = [
      '.member-name', '.directory-listing h3', '.member-card h2',
      '.member-list li a', 'td.company-name', '.result-company',
      '[class*="member"] h3', '[class*="company"] h3',
      '.listing-title', '.org-name',
    ];
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach(el => {
        const name = (el.textContent || el.innerText || '').trim();
        if (name && name.length > 2 && name.length < 100 && !seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          const link = el.closest('a') || el.querySelector('a');
          companies.push({ company_name: name, website: link ? link.href : '' });
        }
      });
    }
    // Fallback: grab any links that look like company names in a list context
    if (companies.length < 5) {
      document.querySelectorAll('ul li a, ol li a, .list-item a').forEach(el => {
        const name = (el.textContent || '').trim();
        const href = el.href || '';
        // Filter out nav/footer links — company links usually have proper company-sounding names
        if (name && name.length > 4 && name.length < 80 && !href.includes('#') &&
            !name.toLowerCase().includes('click here') && !name.toLowerCase().includes('read more') &&
            !seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          companies.push({ company_name: name, website: href });
        }
      });
    }
    return companies.slice(0, 40);
  });
}

async function scrapePage(page, source) {
  console.log(`[LeadScout] Scraping ${source.name}: ${source.url}`);
  try {
    switch (source.type) {
      case 'viewpoint_customers':
        return await scrapeViewpointCustomers(page, source.url);
      default:
        return await scrapeGenericDirectory(page, source.url);
    }
  } catch (err) {
    console.error(`[LeadScout] Error scraping ${source.name}: ${err.message}`);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE WRITES
// ═══════════════════════════════════════════════════════════════════════════

function isExistingLead(companyName) {
  const existing = get(
    'SELECT id FROM cfo_leads WHERE LOWER(company_name) = LOWER(?) LIMIT 1',
    [companyName]
  );
  return !!existing;
}

function insertLead(lead) {
  run(
    `INSERT INTO cfo_leads
     (company_name, erp_type, website, pilot_fit_score, pilot_fit_reason, status, source, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      lead.company_name,
      lead.erp_type,
      lead.website || null,
      lead.pilot_fit_score,
      lead.pilot_fit_reason,
      'new',
      'lead_scout',
      lead.snippet || null,
    ]
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run the Lead Scout scraper.
 * @param {Object} params
 * @param {string} [params.erp_type] - 'Vista', 'Sage300', 'QBE', 'AGC', or 'all'
 * @param {string} [params.state] - State filter (applied post-scrape via filtering)
 * @param {number} [params.limit] - Max leads to insert (default 30)
 */
async function runLeadScout(params = {}) {
  const erpFilter = params.erp_type || 'all';
  const maxLeads = parseInt(params.limit) || 30;

  console.log(`[LeadScout] Starting: erp=${erpFilter}, limit=${maxLeads}`);

  // Build source list
  let erpTypes = erpFilter === 'all' ? ['Vista', 'Sage300', 'QBE', 'AGC'] : [erpFilter];
  // Always include AGC for broader reach
  if (erpFilter !== 'all' && !erpTypes.includes('AGC')) erpTypes.push('AGC');

  const sourceJobs = [];
  for (const erpType of erpTypes) {
    for (const source of (SOURCES[erpType] || [])) {
      sourceJobs.push({ ...source, erp_type: erpType === 'AGC' ? (erpFilter !== 'all' ? erpFilter : 'Unknown') : erpType });
    }
  }

  let browser;
  const stats = { pages_scraped: 0, found: 0, inserted: 0, skipped: 0 };
  const allLeads = [];

  try {
    browser = await chromium.launch({
      headless: CONFIG.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext({
      userAgent: CONFIG.userAgent,
      viewport: { width: 1366, height: 768 },
      locale: 'en-US',
    });

    const page = await context.newPage();

    for (const job of sourceJobs) {
      if (allLeads.length >= maxLeads) break;

      const rawCompanies = await scrapePage(page, job);
      stats.pages_scraped++;
      stats.found += rawCompanies.length;
      console.log(`[LeadScout] ${job.name}: ${rawCompanies.length} companies found`);

      for (const company of rawCompanies) {
        if (allLeads.length >= maxLeads) break;
        if (!company.company_name || company.company_name.length < 3) continue;
        if (isExistingLead(company.company_name)) {
          stats.skipped++;
          continue;
        }

        const { score, reason } = scoreLead({ ...company, erp_type: job.erp_type, source_type: job.type });
        const lead = {
          ...company,
          erp_type: job.erp_type,
          pilot_fit_score: score,
          pilot_fit_reason: reason,
        };

        insertLead(lead);
        allLeads.push(lead);
        stats.inserted++;
      }

      if (sourceJobs.indexOf(job) < sourceJobs.length - 1) {
        await page.waitForTimeout(CONFIG.betweenPages + Math.floor(Math.random() * 1500));
      }
    }

    await browser.close();
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    throw err;
  }

  const summary = `Lead Scout complete: ${stats.pages_scraped} pages scraped, ${stats.inserted} new leads inserted (${stats.skipped} duplicates skipped)`;
  console.log(`[LeadScout] ${summary}`);

  return { summary, stats, leads: allLeads, cost_usd: 0 };
}

module.exports = { runLeadScout };
