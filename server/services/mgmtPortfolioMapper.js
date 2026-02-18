/**
 * @file mgmtPortfolioMapper.js
 * @description Agent 38: Management Company Portfolio Mapper
 *
 * Uses Google Search via Playwright to discover HOAs managed by a company
 * that AREN'T listed on their website. Finds the other 25-50%.
 *
 * Cost: $0 — Playwright Google search, no LLM calls.
 * Schedule: On-demand (after Agent 36 website scrape)
 */

const { chromium } = require('playwright');
const { v4: uuidv4 } = require('uuid');
const { run, get, all } = require('../db/connection');
const { sleep } = require('./mgmtCompanyUtils');
const azure = require('./mgmtAzureSync');

const CONFIG = {
  headless: true,
  timeout: 30000,
  betweenSearches: 4000,  // 4s between Google searches
  maxSearches: 15,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
};

// Discovery query templates (company name gets substituted)
const SEARCH_TEMPLATES = [
  '"{{NAME}}" "managed by"',
  '"{{NAME}}" "management company" HOA',
  '"{{NAME}}" "homeowners association"',
  '"managed by {{NAME}}"',
  'site:{{DOMAIN}} communities OR portfolio',
  'site:{{DOMAIN}} HOA OR association',
  '"{{NAME}}" filetype:pdf "annual meeting"',
  '"{{NAME}}" filetype:pdf "reserve study"',
  '"{{NAME}}" site:bbb.org',
  '"{{NAME}}" "our management company"',
];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run portfolio mapping for a management company.
 * @param {Object} params
 * @param {string} params.company_name
 * @param {string} params.company_url - Used to derive domain
 * @param {string} [params.mgmt_company_id]
 */
async function runPortfolioMapper(params = {}) {
  const { company_name, company_url, mgmt_company_id } = params;

  if (!company_name) {
    throw new Error('company_name is required');
  }

  let domain = '';
  try {
    domain = new URL(company_url || '').hostname.replace('www.', '');
  } catch (e) {
    domain = '';
  }

  const runId = uuidv4();
  const startTime = Date.now();

  console.log(`[Agent 38] Starting portfolio mapping: ${company_name} (${domain})`);

  // Azure SQL — ensure tables + create run record (non-fatal)
  await azure.ensureTables();
  const azureRunId = await azure.azureCreateRun('mgmt_portfolio_mapper', company_name);

  // Get existing communities for this company (from Agent 36)
  const existingCommunities = all(
    `SELECT LOWER(name) as name_lower, LOWER(city) as city_lower FROM hoa_communities WHERE management_company = ?`,
    [company_name]
  );
  const existingKeys = new Set(existingCommunities.map(c => c.name_lower));
  const websiteCount = existingCommunities.length;
  console.log(`[Agent 38] Existing communities from website: ${websiteCount}`);

  const discoveries = [];
  let searchesRun = 0;
  let captchaHit = false;

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

    const page = await context.newPage();

    // Run each search template
    for (const template of SEARCH_TEMPLATES) {
      if (searchesRun >= CONFIG.maxSearches || captchaHit) break;

      // Skip domain searches if no domain
      if (template.includes('{{DOMAIN}}') && !domain) continue;

      const query = template
        .replace(/\{\{NAME\}\}/g, company_name)
        .replace(/\{\{DOMAIN\}\}/g, domain);

      console.log(`[Agent 38] Search ${searchesRun + 1}: ${query}`);

      try {
        const results = await runGoogleSearch(page, query);
        searchesRun++;

        // Extract community names from results
        for (const result of results) {
          const communityNames = extractCommunityNames(result.title + ' ' + result.snippet);
          for (const name of communityNames) {
            if (!existingKeys.has(name.toLowerCase())) {
              discoveries.push({
                name,
                discovery_source: 'google_search',
                search_query: query,
                source_url: result.url || '',
                confidence: result.title.toLowerCase().includes(company_name.toLowerCase()) ? 'high' : 'medium',
              });
              existingKeys.add(name.toLowerCase());
            }
          }
        }

        // Rate limit
        if (searchesRun < CONFIG.maxSearches) {
          await sleep(CONFIG.betweenSearches);
        }
      } catch (err) {
        if (err.message.includes('CAPTCHA')) {
          console.log(`[Agent 38] CAPTCHA detected — stopping searches`);
          captchaHit = true;
        } else {
          console.log(`[Agent 38] Search error: ${err.message}`);
        }
      }
    }

    await browser.close();
  } catch (err) {
    console.error(`[Agent 38] Error: ${err.message}`);
    if (browser) await browser.close();
  }

  // Save discoveries to database
  let newCount = 0;
  for (const disc of discoveries) {
    if (disc.confidence === 'low') continue; // Skip low confidence

    const existing = get(
      `SELECT id FROM hoa_communities WHERE LOWER(name) = LOWER(?)`,
      [disc.name]
    );

    if (!existing) {
      run(`
        INSERT INTO hoa_communities (name, management_company, management_company_id, source, discovered_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [
        disc.name,
        company_name,
        mgmt_company_id || null,
        `portfolio_map:${company_name}:${disc.discovery_source}`,
      ]);
      newCount++;
    }
  }

  // Update management company record
  if (mgmt_company_id) {
    run(`
      UPDATE management_companies SET
        portfolio_mapped = 1,
        communities_mapped = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [discoveries.length, mgmt_company_id]);

    // Azure sync — update pipeline flags
    azure.azureUpdateCompanyPipeline(mgmt_company_id, { portfolio_mapped: true }).catch(() => {});
  }

  const duration = Math.round((Date.now() - startTime) / 1000);
  const discoveryRate = websiteCount > 0
    ? Math.round((newCount / websiteCount) * 100) + '%'
    : 'N/A';

  const summary = {
    run_id: runId,
    company_name,
    searches_run: searchesRun,
    total_mapped: discoveries.length,
    new_discoveries: newCount,
    website_communities: websiteCount,
    discovery_rate: discoveryRate,
    captcha_hit: captchaHit,
    duration_seconds: duration,
    cost_usd: 0,
  };

  console.log(`[Agent 38] COMPLETE — ${discoveries.length} mapped, ${newCount} new (${discoveryRate}), ${searchesRun} searches, ${duration}s`);

  // Azure SQL — complete run + close pool
  await azure.azureCompleteRun(azureRunId, { results_found: discoveries.length, new_records: newCount, queries_run: searchesRun });
  await azure.closePool();

  return summary;
}

// ═══════════════════════════════════════════════════════════════════════════
// GOOGLE SEARCH
// ═══════════════════════════════════════════════════════════════════════════

async function runGoogleSearch(page, query) {
  const encodedQuery = encodeURIComponent(query);
  await page.goto(`https://www.google.com/search?q=${encodedQuery}&num=20`, {
    timeout: CONFIG.timeout,
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(2000);

  // Check for CAPTCHA
  const captcha = await page.locator('#captcha-form, [action*="captcha"], #recaptcha').count();
  if (captcha > 0) {
    throw new Error('CAPTCHA detected');
  }

  // Extract search results
  return await page.evaluate(() => {
    const results = [];
    document.querySelectorAll('#search .g, #rso .g').forEach(el => {
      const titleEl = el.querySelector('h3');
      const snippetEl = el.querySelector('.VwiC3b, [data-sncf]');
      const linkEl = el.querySelector('a[href]');

      results.push({
        title: titleEl ? titleEl.textContent : '',
        snippet: snippetEl ? snippetEl.textContent : '',
        url: linkEl ? linkEl.getAttribute('href') : '',
      });
    });
    return results;
  });
}

/**
 * Extract community/HOA names from text.
 */
function extractCommunityNames(text) {
  if (!text) return [];

  const patterns = [
    /([A-Z][A-Za-z\s]+(?:HOA|Homeowners Association|Condo(?:s|minium)?|Estates?|Villas?|Village|Landing|Pointe?|Terrace|Manor|Park|Place|Club|Lakes?|Creek|Springs?|Harbor|Bay|Shores?|Heights?|Ridge|Woods?|Oaks?|Meadows?|Glen))/g,
  ];

  const names = new Set();
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1].trim();
      if (name.length > 5 && name.length < 80) {
        names.add(name);
      }
    }
  }

  return [...names];
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = { runPortfolioMapper };
