/**
 * @file indeedScanner.js
 * @description Indeed job postings scanner via Playwright — finds manual process jobs
 * that signal automation opportunities (data entry, spreadsheet work, ERP migration).
 *
 * Rate limit: 1 query per scan cycle (Indeed is aggressive with bot detection).
 * Cost: $0
 *
 * @exports { scan(cursor) → { signals[], nextCursor, errors } }
 */

'use strict';

const pool = require('../playwrightPool');

const QUERIES = [
  'data entry spreadsheet',
  'manual reporting',
  'ERP migration',
  'spreadsheet automation',
  'data cleanup coordinator',
  'accounts payable clerk manual',
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Parse "X days ago", "Today", "Just posted", etc. into a score (0-100)
 * and an estimated ISO date string.
 */
function parsePostedAge(text) {
  if (!text) return { score: 20, postedAt: null };

  const lower = text.toLowerCase().trim();

  if (lower.includes('just posted') || lower.includes('today')) {
    return { score: 100, postedAt: new Date().toISOString() };
  }

  const daysMatch = lower.match(/(\d+)\s*day/);
  if (daysMatch) {
    const days = parseInt(daysMatch[1], 10);
    const date = new Date(Date.now() - days * 86400000);
    let score;
    if (days <= 1) score = 100;
    else if (days <= 3) score = 80;
    else if (days <= 7) score = 50;
    else if (days <= 14) score = 20;
    else score = 10;
    return { score, postedAt: date.toISOString() };
  }

  const hoursMatch = lower.match(/(\d+)\s*hour/);
  if (hoursMatch) {
    const date = new Date(Date.now() - parseInt(hoursMatch[1], 10) * 3600000);
    return { score: 100, postedAt: date.toISOString() };
  }

  // "30+ days ago" or anything else
  if (lower.includes('30')) {
    return { score: 5, postedAt: new Date(Date.now() - 30 * 86400000).toISOString() };
  }

  return { score: 20, postedAt: null };
}

/**
 * Safely close a Playwright page with a 3-second hard deadline.
 */
async function safeClosePage(page) {
  if (!page) return;
  try {
    await Promise.race([
      page.close(),
      new Promise(r => setTimeout(r, 3000)),
    ]);
  } catch {
    /* swallow — page may already be closed */
  }
}

// ── Main scan function ──────────────────────────────────────────────────────

/**
 * Scan Indeed job postings for manual-process pain signals.
 * @param {string|null} cursor - JSON: { queryIndex, offset } for rotation
 * @returns {{ signals: object[], nextCursor: string|null, errors: number }}
 */
async function scan(cursor) {
  let queryIndex = 0;
  let offset = 0;

  if (cursor) {
    try {
      const c = JSON.parse(cursor);
      queryIndex = c.queryIndex || 0;
      offset = c.offset || 0;
    } catch {}
  }

  // Wrap around if we've exhausted queries
  if (queryIndex >= QUERIES.length) {
    queryIndex = 0;
    offset = 0;
  }

  const query = QUERIES[queryIndex];
  const encodedQuery = encodeURIComponent(query);
  const url = `https://www.indeed.com/jobs?q=${encodedQuery}&sort=date&limit=25&start=${offset}`;

  const signals = [];
  let errors = 0;
  let page = null;

  console.log(`[IndeedScanner] Scanning query "${query}" (offset=${offset})...`);

  try {
    // Acquire Playwright page from pool
    let inst;
    try {
      inst = await pool.getInstance();
    } catch (poolErr) {
      console.warn(`[IndeedScanner] Playwright pool unavailable (circuit breaker open?): ${poolErr.message}`);
      return { signals: [], nextCursor: cursor, errors: 0 };
    }

    try {
      page = await inst.getPage();
    } catch (pageErr) {
      console.warn(`[IndeedScanner] Could not get page from pool: ${pageErr.message}`);
      return { signals: [], nextCursor: cursor, errors: 0 };
    }

    // Navigate to Indeed search results
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait a moment for dynamic content
    await sleep(2000);

    // Extract job cards from the search results page
    const jobCards = await page.$$eval(
      '.job_seen_beacon, .jobsearch-ResultsList > li, .resultContent, [data-jk]',
      (cards) => {
        const results = [];
        const seen = new Set();

        for (const card of cards) {
          try {
            // Job title
            const titleEl = card.querySelector('h2 a, h2 span, .jobTitle a, .jobTitle span, [data-testid="jobTitle"]');
            const jobTitle = titleEl ? titleEl.textContent.trim() : null;
            if (!jobTitle) continue;

            // Company name
            const companyEl = card.querySelector('[data-testid="company-name"], .companyName, .company, .companyInfo a');
            const company = companyEl ? companyEl.textContent.trim() : 'Unknown Company';

            // Location
            const locationEl = card.querySelector('[data-testid="text-location"], .companyLocation, .company_location');
            const location = locationEl ? locationEl.textContent.trim() : '';

            // Snippet / description summary
            const snippetEl = card.querySelector('.job-snippet, .underShelfFooter, [class*="snippet"], td.snip');
            const snippet = snippetEl ? snippetEl.textContent.trim() : '';

            // Job URL
            const linkEl = card.querySelector('h2 a, .jobTitle a, a[data-jk], a[id^="job_"]');
            const href = linkEl ? linkEl.getAttribute('href') : null;
            const jobUrl = href
              ? (href.startsWith('http') ? href : `https://www.indeed.com${href}`)
              : null;

            // Posted date text
            const dateEl = card.querySelector('.date, [data-testid="myJobsStateDate"], .new, span.css-qvloho');
            const dateText = dateEl ? dateEl.textContent.trim() : null;

            // Deduplicate by title+company
            const key = `${jobTitle}|${company}`.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);

            results.push({
              jobTitle,
              company,
              location,
              snippet,
              jobUrl,
              dateText,
            });
          } catch {
            /* skip malformed card */
          }
        }

        return results.slice(0, 25);
      }
    );

    console.log(`[IndeedScanner] Extracted ${jobCards.length} job cards for "${query}"`);

    for (const card of jobCards) {
      const { score, postedAt } = parsePostedAge(card.dateText);

      const bodyText = [
        card.jobTitle,
        card.snippet,
        card.location,
      ].filter(Boolean).join(' — ');

      signals.push({
        source: 'indeed',
        url: card.jobUrl || url,
        title: `Hiring: ${card.jobTitle} at ${card.company} — ${card.location || 'Remote'}`,
        body_text: bodyText.slice(0, 5000),
        author: card.company,
        posted_at: postedAt,
        platform_score: score,
      });
    }
  } catch (err) {
    console.error(`[IndeedScanner] Error scanning "${query}":`, err.message);
    errors++;
  } finally {
    await safeClosePage(page);
  }

  // Build next cursor: advance offset if we got a full page, else rotate query
  let nextCursor;
  if (signals.length >= 20) {
    // More results likely available at next offset
    nextCursor = JSON.stringify({ queryIndex, offset: offset + 25 });
  } else {
    // Move to next query, reset offset
    const nextIndex = queryIndex + 1;
    if (nextIndex < QUERIES.length) {
      nextCursor = JSON.stringify({ queryIndex: nextIndex, offset: 0 });
    } else {
      // Full cycle complete — wrap to start
      nextCursor = JSON.stringify({ queryIndex: 0, offset: 0 });
    }
  }

  console.log(`[IndeedScanner] Found ${signals.length} signals, ${errors} errors | Next: ${nextCursor}`);
  return { signals, nextCursor, errors };
}

module.exports = { scan, QUERIES };
