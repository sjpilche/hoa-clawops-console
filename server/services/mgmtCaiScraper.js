/**
 * @file mgmtCaiScraper.js
 * @description Agent 40: CAI Member Directory Scraper
 *
 * THIS AGENT RUNS FIRST — builds the master list of management companies
 * from Community Associations Institute chapter directories.
 *
 * Cost: $0 — Playwright web scraping, no LLM calls.
 * Schedule: Weekly (Sundays 1am)
 * Feeds: Agents 36, 37, 38, 39
 */

const { chromium } = require('playwright');
const { v4: uuidv4 } = require('uuid');
const { run, get, all } = require('../db/connection');
const { determinePriorityTier, sleep } = require('./mgmtCompanyUtils');
const azure = require('./mgmtAzureSync');

// ═══════════════════════════════════════════════════════════════════════════
// CAI CHAPTER DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

const CAI_CHAPTERS = [
  // Florida (5)
  { id: 'cai-seflorida', name: 'CAI Southeast Florida', url: 'https://www.cai-seflorida.org/', state: 'FL', region: 'Miami-Dade, Broward, Palm Beach' },
  { id: 'caicf', name: 'CAI Central Florida', url: 'https://www.caicf.org/', state: 'FL', region: 'Orlando, Tampa metro' },
  { id: 'cainf', name: 'CAI North Florida', url: 'https://www.cainf.org/', state: 'FL', region: 'Jacksonville, NE Florida' },
  { id: 'caigulfcoast', name: 'CAI Gulf Coast', url: 'https://www.caigulfcoast.org/', state: 'FL', region: 'Fort Myers, Naples, SW Florida' },
  { id: 'cai-suncoast', name: 'CAI Suncoast', url: 'https://www.cai-suncoast.org/', state: 'FL', region: 'Sarasota, Bradenton' },
  // California (6)
  { id: 'cai-clac', name: 'CAI CLAC', url: 'https://www.cai-clac.org/', state: 'CA', region: 'Statewide legislative' },
  { id: 'cai-glac', name: 'CAI Greater Los Angeles', url: 'https://www.cai-glac.org/', state: 'CA', region: 'LA County' },
  { id: 'caisandiego', name: 'CAI San Diego', url: 'https://www.caisandiego.org/', state: 'CA', region: 'San Diego County' },
  { id: 'caicic', name: 'CAI Channel Islands', url: 'https://www.caicic.org/', state: 'CA', region: 'Ventura, Santa Barbara' },
  { id: 'cai-gie', name: 'CAI Greater Inland Empire', url: 'https://www.cai-gie.org/', state: 'CA', region: 'Riverside, San Bernardino' },
  { id: 'caioc', name: 'CAI Orange County', url: 'https://www.caioc.org/', state: 'CA', region: 'Orange County' },
  // Colorado (1)
  { id: 'cai-rmc', name: 'CAI Rocky Mountain', url: 'https://www.cai-rmc.org/', state: 'CO', region: 'Statewide' },
];

const CONFIG = {
  headless: true,
  timeout: 30000,
  pageLoadWait: 3000,
  betweenChapters: 5000,
  maxPagesPerChapter: 10,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run the CAI directory scrape.
 * @param {Object} params
 * @param {string} [params.target_states] - "FL, CA, CO" or specific state
 * @param {string} [params.chapter_id] - specific chapter ID to scrape
 * @returns {Object} results summary
 */
async function runCaiScraper(params = {}) {
  const targetStates = (params.target_states || 'FL, CA, CO')
    .split(',')
    .map(s => s.trim().toUpperCase());

  const runId = uuidv4();
  const startTime = Date.now();

  console.log(`[Agent 40] Starting CAI directory scrape (run: ${runId})`);
  console.log(`[Agent 40] Target states: ${targetStates.join(', ')}`);

  // Azure SQL — ensure tables + create run record (non-fatal)
  await azure.ensureTables();
  const azureRunId = await azure.azureCreateRun('mgmt_cai_scraper', targetStates.join(','));

  // Filter chapters by target states (or specific chapter)
  let chapters = CAI_CHAPTERS.filter(ch => targetStates.includes(ch.state));
  if (params.chapter_id) {
    chapters = chapters.filter(ch => ch.id === params.chapter_id);
  }

  console.log(`[Agent 40] Chapters to scrape: ${chapters.length}`);

  let totalFound = 0;
  let totalNew = 0;
  let totalUpdated = 0;
  let aamcCount = 0;
  const chapterResults = [];

  let browser;
  try {
    browser = await chromium.launch({
      headless: CONFIG.headless,
      args: ['--disable-blink-features=AutomationControlled'],
    });

    const context = await browser.newContext({
      userAgent: CONFIG.userAgent,
      viewport: { width: 1920, height: 1080 },
    });

    for (const chapter of chapters) {
      console.log(`\n[Agent 40] Scraping: ${chapter.name} (${chapter.url})`);

      try {
        const result = await scrapeChapter(context, chapter, runId);
        chapterResults.push({ ...chapter, ...result });
        totalFound += result.companies_found;
        totalNew += result.new_companies;
        totalUpdated += result.updated_companies;
        aamcCount += result.aamc_count;

        console.log(`[Agent 40] ${chapter.name}: ${result.companies_found} found, ${result.new_companies} new`);
      } catch (err) {
        console.error(`[Agent 40] Error scraping ${chapter.name}: ${err.message}`);
        chapterResults.push({ ...chapter, companies_found: 0, new_companies: 0, updated_companies: 0, aamc_count: 0, error: err.message });
      }

      // Rate limit between chapters
      if (chapters.indexOf(chapter) < chapters.length - 1) {
        await sleep(CONFIG.betweenChapters);
      }
    }

    await browser.close();
  } catch (err) {
    console.error(`[Agent 40] Browser error: ${err.message}`);
    if (browser) await browser.close();
  }

  const duration = Math.round((Date.now() - startTime) / 1000);

  // Count companies still needing pipeline processing
  const queuedRow = get(`
    SELECT COUNT(*) as count FROM management_companies
    WHERE portfolio_scraped = 0 AND contacts_pulled = 0
      AND portfolio_mapped = 0 AND reviews_scanned = 0
  `);
  const newToPipeline = queuedRow ? queuedRow.count : 0;

  const summary = {
    run_id: runId,
    chapters_scraped: chapterResults.length,
    companies_found: totalFound,
    new_companies: totalNew,
    updated_companies: totalUpdated,
    aamc_companies: aamcCount,
    new_to_pipeline: newToPipeline,
    duration_seconds: duration,
    cost_usd: 0,
    chapter_details: chapterResults.map(c => ({
      name: c.name,
      state: c.state,
      companies_found: c.companies_found,
      error: c.error || null,
    })),
  };

  console.log(`\n[Agent 40] COMPLETE — ${totalFound} found, ${totalNew} new, ${aamcCount} AAMC, ${duration}s`);

  // Azure SQL — complete run + close pool
  await azure.azureCompleteRun(azureRunId, { total_found: totalFound, new_records: totalNew, results_found: totalFound });
  await azure.closePool();

  return summary;
}

// ═══════════════════════════════════════════════════════════════════════════
// CHAPTER SCRAPING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Scrape a single CAI chapter directory.
 */
async function scrapeChapter(context, chapter, runId) {
  const page = await context.newPage();
  let companiesFound = 0;
  let newCompanies = 0;
  let updatedCompanies = 0;
  let aamcCount = 0;

  try {
    await page.goto(chapter.url, { timeout: CONFIG.timeout, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(CONFIG.pageLoadWait);

    // Try to find directory/member search pages
    const directoryUrl = await findDirectoryPage(page, chapter.url);

    if (directoryUrl) {
      if (directoryUrl !== page.url()) {
        await page.goto(directoryUrl, { timeout: CONFIG.timeout, waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(CONFIG.pageLoadWait);
      }

      // Try to filter for management companies
      await applyManagementFilter(page);
      await page.waitForTimeout(2000);

      // Extract listings
      const companies = await extractCompanyListings(page);

      for (const company of companies) {
        company.chapter_id = chapter.id;
        company.chapter_name = chapter.name;
        company.state = company.state || chapter.state;

        const tier = determinePriorityTier(company);
        company.priority_tier = tier;
        if (tier === 'AAMC_TOP') aamcCount++;

        const result = upsertCompany(company, chapter.id);
        if (result === 'new') newCompanies++;
        else if (result === 'updated') updatedCompanies++;
        companiesFound++;
      }

      // Handle pagination
      let pageNum = 1;
      while (pageNum < CONFIG.maxPagesPerChapter) {
        const hasNext = await goToNextPage(page);
        if (!hasNext) break;
        pageNum++;

        await page.waitForTimeout(2000);
        const moreCompanies = await extractCompanyListings(page);
        if (moreCompanies.length === 0) break;

        for (const company of moreCompanies) {
          company.chapter_id = chapter.id;
          company.chapter_name = chapter.name;
          company.state = company.state || chapter.state;
          company.priority_tier = determinePriorityTier(company);
          if (company.priority_tier === 'AAMC_TOP') aamcCount++;

          const result = upsertCompany(company, chapter.id);
          if (result === 'new') newCompanies++;
          else if (result === 'updated') updatedCompanies++;
          companiesFound++;
        }
      }
    } else {
      console.log(`[Agent 40] No directory page found for ${chapter.name} — trying Google fallback`);
      // Fallback: Google search for "site:chapter.url management company directory"
      const fallbackCompanies = await googleFallback(context, chapter);
      for (const company of fallbackCompanies) {
        company.priority_tier = determinePriorityTier(company);
        if (company.priority_tier === 'AAMC_TOP') aamcCount++;
        const result = upsertCompany(company, chapter.id);
        if (result === 'new') newCompanies++;
        else if (result === 'updated') updatedCompanies++;
        companiesFound++;
      }
    }
  } catch (err) {
    console.error(`[Agent 40] Chapter scrape error (${chapter.name}): ${err.message}`);
  } finally {
    await page.close();
  }

  return { companies_found: companiesFound, new_companies: newCompanies, updated_companies: updatedCompanies, aamc_count: aamcCount };
}

/**
 * Find the directory/member search page on a CAI chapter site.
 */
async function findDirectoryPage(page, baseUrl) {
  // Look for common directory link patterns
  const selectors = [
    'a[href*="directory"]',
    'a[href*="find-a-manager"]',
    'a[href*="member-search"]',
    'a[href*="search-members"]',
    'a[href*="business-partner"]',
    'a:has-text("Find a Manager")',
    'a:has-text("Member Directory")',
    'a:has-text("Find a Company")',
    'a:has-text("Business Partners")',
    'a:has-text("Management Companies")',
  ];

  for (const selector of selectors) {
    try {
      const link = await page.locator(selector).first();
      if (await link.isVisible({ timeout: 1000 })) {
        const href = await link.getAttribute('href');
        if (href) {
          if (href.startsWith('http')) return href;
          return new URL(href, baseUrl).toString();
        }
      }
    } catch (e) {
      // Try next selector
    }
  }

  return null;
}

/**
 * Try to apply a "Management Company" filter on the directory page.
 */
async function applyManagementFilter(page) {
  try {
    // Look for category/type dropdowns or checkboxes
    const filterSelectors = [
      'select[name*="category"] option[value*="management" i]',
      'select[name*="type"] option[value*="management" i]',
      'input[type="checkbox"][value*="management" i]',
      'label:has-text("Management Company")',
      'button:has-text("Management")',
    ];

    for (const selector of filterSelectors) {
      try {
        const el = await page.locator(selector).first();
        if (await el.isVisible({ timeout: 1000 })) {
          await el.click();
          console.log(`[Agent 40] Applied management filter: ${selector}`);
          return true;
        }
      } catch (e) {
        // Try next
      }
    }
  } catch (e) {
    // No filter available
  }
  return false;
}

/**
 * Extract company listings from the current page.
 */
async function extractCompanyListings(page) {
  return await page.evaluate(() => {
    const companies = [];

    // Common patterns for directory listings
    const cardSelectors = [
      '.directory-listing', '.member-listing', '.company-card',
      '.search-result', '.listing-item', '.directory-item',
      '[class*="directory"]', '[class*="listing"]',
      'table tbody tr', '.row .col',
    ];

    let cards = [];
    for (const sel of cardSelectors) {
      cards = document.querySelectorAll(sel);
      if (cards.length > 0) break;
    }

    for (const card of cards) {
      const text = card.textContent || '';
      // Skip individual members (look for company indicators)
      const isCompany = text.match(/management|AAMC|company|inc\.|LLC|corp/i);
      if (!isCompany && cards.length > 5) continue; // Skip if we have many results and this doesn't look like a company

      const nameEl = card.querySelector('h2, h3, h4, .name, .title, .company-name, a[href]');
      const name = nameEl ? nameEl.textContent.trim() : '';
      if (!name || name.length < 3) continue;

      const linkEl = card.querySelector('a[href*="http"]') || card.querySelector('a[href]');
      const website = linkEl ? linkEl.getAttribute('href') : '';

      // Look for phone
      const phoneMatch = text.match(/(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/);
      const phone = phoneMatch ? phoneMatch[1] : '';

      // Look for email
      const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w{2,}/);
      const email = emailMatch ? emailMatch[0] : '';

      // Look for designations
      const designations = [];
      if (text.includes('AAMC')) designations.push('AAMC');
      if (text.includes('PCAM')) designations.push('PCAM');
      if (text.includes('CMCA')) designations.push('CMCA');
      if (text.includes('AMS')) designations.push('AMS');
      if (text.includes('LSM')) designations.push('LSM');

      // Look for address
      const addressMatch = text.match(/(\d+\s[^,]+),\s*([A-Za-z\s]+),\s*([A-Z]{2})\s*(\d{5})?/);

      companies.push({
        name,
        website: website && website.startsWith('http') ? website : '',
        phone,
        email,
        cai_designations: designations,
        designated_employees: [],
        hq_address: addressMatch ? addressMatch[0] : '',
        city: addressMatch ? addressMatch[2]?.trim() : '',
        state: addressMatch ? addressMatch[3] : '',
        zip_code: addressMatch ? addressMatch[4] || '' : '',
      });
    }

    return companies;
  });
}

/**
 * Try to navigate to the next page of results.
 */
async function goToNextPage(page) {
  const nextSelectors = [
    'a:has-text("Next")', 'a:has-text(">")', 'a:has-text("»")',
    'button:has-text("Next")', '.pagination a.next',
    'a[rel="next"]', '.next-page',
  ];

  for (const selector of nextSelectors) {
    try {
      const el = await page.locator(selector).first();
      if (await el.isVisible({ timeout: 1000 })) {
        await el.click();
        return true;
      }
    } catch (e) {
      // Try next
    }
  }
  return false;
}

/**
 * Google fallback when chapter directory is gated or not found.
 */
async function googleFallback(context, chapter) {
  const page = await context.newPage();
  const companies = [];

  try {
    const query = encodeURIComponent(`site:${new URL(chapter.url).hostname} "management company" directory`);
    await page.goto(`https://www.google.com/search?q=${query}`, { timeout: CONFIG.timeout });
    await page.waitForTimeout(3000);

    // Check for CAPTCHA
    const captcha = await page.locator('#captcha-form, [action*="captcha"]').count();
    if (captcha > 0) {
      console.log(`[Agent 40] Google CAPTCHA detected, skipping fallback`);
      await page.close();
      return [];
    }

    // Extract company names from search results
    const results = await page.evaluate(() => {
      const items = [];
      document.querySelectorAll('#search .g').forEach(el => {
        const title = el.querySelector('h3')?.textContent || '';
        const snippet = el.querySelector('.VwiC3b')?.textContent || '';
        items.push({ title, snippet });
      });
      return items;
    });

    // Very basic extraction from search results
    for (const r of results) {
      const nameMatch = r.title.match(/^(.+?)(?:\s*[-|])/);
      if (nameMatch && nameMatch[1].length > 3) {
        companies.push({
          name: nameMatch[1].trim(),
          website: '',
          phone: '',
          email: '',
          cai_designations: [],
          designated_employees: [],
          state: chapter.state,
          chapter_id: chapter.id,
          chapter_name: chapter.name,
        });
      }
    }
  } catch (err) {
    console.log(`[Agent 40] Google fallback failed: ${err.message}`);
  } finally {
    await page.close();
  }

  return companies;
}

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Insert or update a management company.
 * @returns {'new' | 'updated' | 'skipped'}
 */
function upsertCompany(company, chapterId) {
  const existing = get(
    `SELECT id, cai_chapters FROM management_companies WHERE LOWER(name) = LOWER(?) AND state = ?`,
    [company.name, company.state]
  );

  if (existing) {
    // Update with CAI data
    let chapters = [];
    try { chapters = JSON.parse(existing.cai_chapters || '[]'); } catch (e) { /* */ }
    if (!chapters.includes(chapterId)) chapters.push(chapterId);

    run(`
      UPDATE management_companies SET
        cai_designations = ?,
        cai_chapters = ?,
        priority_tier = CASE WHEN ? = 'AAMC_TOP' THEN 'AAMC_TOP' WHEN priority_tier = 'AAMC_TOP' THEN 'AAMC_TOP' ELSE ? END,
        email = COALESCE(?, email),
        phone = COALESCE(?, phone),
        website = COALESCE(?, website),
        website_url = COALESCE(?, website_url),
        source = COALESCE(source, 'cai'),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      JSON.stringify(company.cai_designations || []),
      JSON.stringify(chapters),
      company.priority_tier, company.priority_tier,
      company.email || null,
      company.phone || null,
      company.website || null,
      company.website || null,
      existing.id,
    ]);
    // Azure sync — fire-and-forget
    azure.azureUpsertCompany({ id: existing.id, ...company, source: 'cai' }).catch(() => {});
    return 'updated';
  }

  // Insert new
  const id = uuidv4();
  run(`
    INSERT INTO management_companies (
      id, name, website_url, website, phone, email, hq_address,
      city, state, zip_code,
      cai_designations, cai_chapters, designated_employees,
      priority_tier, source, discovered_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'cai', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `, [
    id, company.name,
    company.website || null, company.website || null,
    company.phone || null, company.email || null,
    company.hq_address || null,
    company.city || null, company.state || null, company.zip_code || null,
    JSON.stringify(company.cai_designations || []),
    JSON.stringify([chapterId]),
    JSON.stringify(company.designated_employees || []),
    company.priority_tier || 'MEMBER',
  ]);
  // Azure sync — fire-and-forget
  azure.azureUpsertCompany({ id, ...company, source: 'cai' }).catch(() => {});
  return 'new';
}

/**
 * Get companies queued for pipeline processing, sorted by priority.
 */
function getQueuedCompanies(limit = 50) {
  return all(`
    SELECT id, name, website_url, website, priority_tier, communities_managed,
           portfolio_scraped, contacts_pulled, portfolio_mapped, reviews_scanned
    FROM management_companies
    WHERE portfolio_scraped = 0 OR contacts_pulled = 0
      OR portfolio_mapped = 0 OR reviews_scanned = 0
    ORDER BY
      CASE priority_tier
        WHEN 'AAMC_TOP' THEN 1
        WHEN 'DESIGNATED' THEN 2
        WHEN 'MEMBER' THEN 3
        ELSE 4
      END,
      communities_managed DESC
    LIMIT ?
  `, [limit]);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = { runCaiScraper, getQueuedCompanies, CAI_CHAPTERS };
