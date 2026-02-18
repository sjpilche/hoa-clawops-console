/**
 * @file mgmtPortfolioScraper.js
 * @description Agent 36: Management Company Portfolio Scraper
 *
 * Crawls management company websites to extract their HOA client portfolio.
 * Navigates /communities, /portfolio, /associations pages with Playwright.
 *
 * Cost: $0 — Playwright web scraping, no LLM calls.
 * Schedule: On-demand (after Agent 40 finds companies)
 * Feeds: Agent 38 (Portfolio Mapper), Agent 39 (Review Scanner)
 */

const { chromium } = require('playwright');
const { v4: uuidv4 } = require('uuid');
const { run, get, all } = require('../db/connection');
const { sleep } = require('./mgmtCompanyUtils');
const azure = require('./mgmtAzureSync');

const CONFIG = {
  headless: true,
  timeout: 30000,
  pageLoadWait: 3000,
  betweenPages: 2000,
  maxPagination: 20,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
};

// Common portfolio page paths to try
const PORTFOLIO_PATHS = [
  '/communities', '/our-communities', '/portfolio', '/associations',
  '/properties', '/residents', '/community-portals', '/find-your-community',
  '/community-login', '/board-members', '/managed-communities',
];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run the portfolio scrape for a management company.
 * @param {Object} params
 * @param {string} params.company_name
 * @param {string} params.company_url
 * @param {string} [params.mgmt_company_id]
 * @param {string} [params.target_state] - "FL", "CA", "CO", or "ALL"
 * @returns {Object} results summary
 */
async function runPortfolioScraper(params = {}) {
  const { company_name, company_url, mgmt_company_id, target_state = 'ALL' } = params;

  if (!company_name || !company_url) {
    throw new Error('company_name and company_url are required');
  }

  const runId = uuidv4();
  const startTime = Date.now();

  console.log(`[Agent 36] Starting portfolio scrape: ${company_name}`);
  console.log(`[Agent 36] URL: ${company_url}, state filter: ${target_state}`);

  // Azure SQL — ensure tables + create run record (non-fatal)
  await azure.ensureTables();
  const azureRunId = await azure.azureCreateRun('mgmt_portfolio_scraper', company_name);

  let browser;
  let communities = [];

  try {
    browser = await chromium.launch({
      headless: CONFIG.headless,
      args: ['--disable-blink-features=AutomationControlled'],
    });

    const context = await browser.newContext({
      userAgent: CONFIG.userAgent,
      viewport: { width: 1920, height: 1080 },
    });

    const page = await context.newPage();

    // Step 1: Navigate to company website
    await page.goto(company_url, { timeout: CONFIG.timeout, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(CONFIG.pageLoadWait);

    // Step 2: Find portfolio page
    const portfolioUrl = await findPortfolioPage(page, company_url);

    if (portfolioUrl) {
      console.log(`[Agent 36] Portfolio page found: ${portfolioUrl}`);
      if (portfolioUrl !== page.url()) {
        await page.goto(portfolioUrl, { timeout: CONFIG.timeout, waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(CONFIG.pageLoadWait);
      }

      // Step 3: Extract communities
      communities = await extractCommunities(page, target_state);
      console.log(`[Agent 36] Extracted ${communities.length} communities from portfolio page`);

      // Step 4: Handle pagination
      let paginationCount = 0;
      while (paginationCount < CONFIG.maxPagination) {
        const hasMore = await handlePagination(page);
        if (!hasMore) break;
        paginationCount++;

        await page.waitForTimeout(CONFIG.betweenPages);
        const moreCommunities = await extractCommunities(page, target_state);

        // Deduplicate by name+city
        const existingKeys = new Set(communities.map(c => `${c.name}|${c.city}`.toLowerCase()));
        for (const mc of moreCommunities) {
          const key = `${mc.name}|${mc.city}`.toLowerCase();
          if (!existingKeys.has(key)) {
            communities.push(mc);
            existingKeys.add(key);
          }
        }

        console.log(`[Agent 36] Page ${paginationCount + 1}: ${moreCommunities.length} more (total: ${communities.length})`);
      }
    } else {
      console.log(`[Agent 36] No portfolio page found — trying site: search fallback`);
      communities = await siteSearchFallback(context, company_url, company_name, target_state);
    }

    // Step 5: Also check secondary pages
    const secondaryCommunities = await scrapeSecondaryPages(page, company_url, target_state);
    const existingKeys = new Set(communities.map(c => `${c.name}|${c.city}`.toLowerCase()));
    for (const sc of secondaryCommunities) {
      const key = `${sc.name}|${sc.city}`.toLowerCase();
      if (!existingKeys.has(key)) {
        communities.push(sc);
      }
    }

    await browser.close();
  } catch (err) {
    console.error(`[Agent 36] Error: ${err.message}`);
    if (browser) await browser.close();
  }

  // Step 6: Save to database
  let newCount = 0;
  let portalCount = 0;

  for (const community of communities) {
    const isNew = insertCommunity(community, company_name, mgmt_company_id);
    if (isNew) newCount++;
    if (community.portal_url) portalCount++;
  }

  // Update management company record
  if (mgmt_company_id) {
    run(`
      UPDATE management_companies SET
        portfolio_scraped = 1,
        communities_scraped = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [communities.length, mgmt_company_id]);

    // Azure sync — update pipeline flags
    azure.azureUpdateCompanyPipeline(mgmt_company_id, { portfolio_scraped: true }).catch(() => {});
  }

  const duration = Math.round((Date.now() - startTime) / 1000);

  const summary = {
    run_id: runId,
    company_name,
    communities_found: communities.length,
    new_communities: newCount,
    with_portals: portalCount,
    duration_seconds: duration,
    cost_usd: 0,
  };

  console.log(`[Agent 36] COMPLETE — ${communities.length} found, ${newCount} new, ${portalCount} with portals, ${duration}s`);

  // Azure SQL — complete run + close pool
  await azure.azureCompleteRun(azureRunId, { results_found: communities.length, new_records: newCount });
  await azure.closePool();

  return summary;
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE DISCOVERY
// ═══════════════════════════════════════════════════════════════════════════

async function findPortfolioPage(page, baseUrl) {
  // First check for links on the current page
  const navSelectors = [
    'a[href*="communit"]', 'a[href*="portfolio"]', 'a[href*="association"]',
    'a[href*="properties"]', 'a[href*="resident"]',
    'a:has-text("Communities")', 'a:has-text("Portfolio")',
    'a:has-text("Our Communities")', 'a:has-text("Find Your Community")',
    'a:has-text("Residents")', 'a:has-text("Board Members")',
    'a:has-text("Community Portals")',
  ];

  for (const selector of navSelectors) {
    try {
      const link = await page.locator(selector).first();
      if (await link.isVisible({ timeout: 500 })) {
        const href = await link.getAttribute('href');
        if (href && !href.includes('#') && !href.includes('javascript:')) {
          return href.startsWith('http') ? href : new URL(href, baseUrl).toString();
        }
      }
    } catch (e) {
      // Try next
    }
  }

  // Try common paths directly
  for (const pathSuffix of PORTFOLIO_PATHS) {
    try {
      const url = new URL(pathSuffix, baseUrl).toString();
      const response = await page.goto(url, { timeout: 10000, waitUntil: 'domcontentloaded' });
      if (response && response.status() === 200) {
        // Verify it's not a login page or error page
        const title = await page.title();
        if (!title.toLowerCase().includes('login') && !title.toLowerCase().includes('404')) {
          return url;
        }
      }
    } catch (e) {
      // Path doesn't exist, try next
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMUNITY EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

async function extractCommunities(page, targetState) {
  return await page.evaluate((stateFilter) => {
    const communities = [];

    // Look for structured listings
    const listSelectors = [
      '.community-item', '.community-card', '.property-item',
      '.listing-item', '.association-item', '.portfolio-item',
      'table tbody tr', '.card', '.list-group-item',
      '[class*="community"]', '[class*="property"]',
    ];

    let items = [];
    for (const sel of listSelectors) {
      items = document.querySelectorAll(sel);
      if (items.length >= 3) break; // Found structured content
    }

    if (items.length >= 3) {
      for (const item of items) {
        const text = item.textContent || '';
        const nameEl = item.querySelector('h2, h3, h4, h5, .name, .title, a');
        const name = nameEl ? nameEl.textContent.trim() : '';
        if (!name || name.length < 3 || name.length > 150) continue;

        // Extract city/state
        const stateMatch = text.match(/,\s*([A-Z]{2})\b/);
        const state = stateMatch ? stateMatch[1] : '';

        // Apply state filter
        if (stateFilter !== 'ALL' && state && state !== stateFilter) continue;

        const cityMatch = text.match(/([A-Za-z\s]+),\s*[A-Z]{2}/);
        const city = cityMatch ? cityMatch[1].trim() : '';

        const zipMatch = text.match(/\b(\d{5})\b/);
        const zip = zipMatch ? zipMatch[1] : '';

        const unitMatch = text.match(/(\d+)\s*(?:units?|homes?|residences?)/i);
        const unitCount = unitMatch ? parseInt(unitMatch[1]) : null;

        const portalEl = item.querySelector('a[href*="portal"], a[href*="login"], a[href*="resident"]');
        const portalUrl = portalEl ? portalEl.getAttribute('href') : '';

        communities.push({ name, city, state, zip, unit_count: unitCount, portal_url: portalUrl });
      }
    } else {
      // Fallback: scan all links for community names
      const links = document.querySelectorAll('a');
      for (const link of links) {
        const text = link.textContent.trim();
        if (text.length > 5 && text.length < 100 &&
            (text.match(/HOA|Condo|Estates?|Villas?|Village|Landing|Pointe?|Terrace|Manor|Park|Place|Club|Lakes?|Creek|Springs?|Harbor|Bay|Shores?|Heights?|Ridge/i))) {
          communities.push({ name: text, city: '', state: '', zip: '', unit_count: null, portal_url: link.href || '' });
        }
      }
    }

    return communities;
  }, targetState);
}

async function handlePagination(page) {
  // Click "Load More" / "Show More" button
  const loadMoreSelectors = [
    'button:has-text("Load More")', 'button:has-text("Show More")',
    'a:has-text("Load More")', 'a:has-text("Show More")',
    'button:has-text("View All")', '.load-more', '.show-more',
  ];

  for (const selector of loadMoreSelectors) {
    try {
      const el = await page.locator(selector).first();
      if (await el.isVisible({ timeout: 1000 })) {
        await el.click();
        return true;
      }
    } catch (e) { /* */ }
  }

  // Try "Next Page" link
  const nextSelectors = [
    'a:has-text("Next")', 'a[rel="next"]', '.pagination .next',
    'a:has-text(">")', 'button:has-text("Next")',
  ];

  for (const selector of nextSelectors) {
    try {
      const el = await page.locator(selector).first();
      if (await el.isVisible({ timeout: 1000 })) {
        await el.click();
        return true;
      }
    } catch (e) { /* */ }
  }

  return false;
}

async function siteSearchFallback(context, companyUrl, companyName, targetState) {
  const page = await context.newPage();
  const communities = [];

  try {
    const domain = new URL(companyUrl).hostname;
    const query = encodeURIComponent(`site:${domain} communities OR portfolio OR associations`);
    await page.goto(`https://www.google.com/search?q=${query}`, { timeout: CONFIG.timeout });
    await page.waitForTimeout(3000);

    // Check for CAPTCHA
    const captcha = await page.locator('#captcha-form, [action*="captcha"]').count();
    if (captcha > 0) {
      console.log(`[Agent 36] Google CAPTCHA — skipping fallback`);
      await page.close();
      return [];
    }

    // Extract community names from search results snippets
    const results = await page.evaluate(() => {
      const items = [];
      document.querySelectorAll('#search .g').forEach(el => {
        const snippet = el.querySelector('.VwiC3b')?.textContent || '';
        items.push(snippet);
      });
      return items;
    });

    // Parse community names from snippets
    for (const snippet of results) {
      const matches = snippet.match(/[A-Z][A-Za-z\s]+(?:HOA|Estates?|Villas?|Village|Landing|Condo)/gi);
      if (matches) {
        for (const name of matches) {
          communities.push({ name: name.trim(), city: '', state: '', zip: '', unit_count: null, portal_url: '' });
        }
      }
    }
  } catch (err) {
    console.log(`[Agent 36] Site search fallback failed: ${err.message}`);
  } finally {
    await page.close();
  }

  return communities;
}

async function scrapeSecondaryPages(page, baseUrl, targetState) {
  const communities = [];
  const secondaryPaths = ['/about', '/about-us', '/news', '/blog', '/careers', '/testimonials'];

  for (const pathSuffix of secondaryPaths) {
    try {
      const url = new URL(pathSuffix, baseUrl).toString();
      const response = await page.goto(url, { timeout: 10000, waitUntil: 'domcontentloaded' });
      if (!response || response.status() !== 200) continue;

      await page.waitForTimeout(1000);

      // Look for community mentions in page text
      const mentions = await page.evaluate(() => {
        const text = document.body.textContent || '';
        const matches = text.match(/[A-Z][A-Za-z\s]+(?:HOA|Homeowners Association|Condominiums?|Estates?)/gi);
        return matches ? [...new Set(matches)].map(n => n.trim()) : [];
      });

      for (const name of mentions) {
        if (name.length > 5 && name.length < 100) {
          communities.push({ name, city: '', state: '', zip: '', unit_count: null, portal_url: '' });
        }
      }
    } catch (e) {
      // Page doesn't exist or error
    }
  }

  return communities;
}

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE
// ═══════════════════════════════════════════════════════════════════════════

function insertCommunity(community, companyName, mgmtCompanyId) {
  // Check for existing
  const existing = get(
    `SELECT id FROM hoa_communities WHERE LOWER(name) = LOWER(?) AND (LOWER(city) = LOWER(?) OR ? IS NULL OR ? = '')`,
    [community.name, community.city, community.city, community.city]
  );

  if (existing) {
    // Update management company association if not set
    run(`
      UPDATE hoa_communities SET
        management_company = COALESCE(management_company, ?),
        management_company_id = COALESCE(management_company_id, ?)
      WHERE id = ?
    `, [companyName, mgmtCompanyId || null, existing.id]);
    return false;
  }

  // Insert new community
  run(`
    INSERT INTO hoa_communities (name, city, state, zip, management_company, management_company_id, source, discovered_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `, [
    community.name,
    community.city || null,
    community.state || null,
    community.zip || null,
    companyName,
    mgmtCompanyId || null,
    `mgmt_scrape:${companyName}`,
  ]);
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = { runPortfolioScraper };
