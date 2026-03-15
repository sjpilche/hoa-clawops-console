/**
 * @file stackoverflowScanner.js
 * @description Stack Overflow API v2.3 scanner — no auth key needed.
 *
 * Finds high-vote questions with no accepted answer (= tooling gaps / unmet needs).
 * Rate limit: 300 requests/day unauthenticated.
 * Cost: $0
 *
 * @exports { scan(cursor) -> { signals[], nextCursor, errors } }
 */

'use strict';

const https = require('https');
const zlib = require('zlib');

const TAGS = [
  'automation', 'api', 'saas', 'web-scraping', 'accounting',
  'erp', 'construction', 'invoice', 'crm', 'workflow',
];

const MIN_SCORE = 5;
const MAX_SIGNALS_PER_SCAN = 30;
const QUOTA_FLOOR = 50;

const USER_AGENT = 'ClawOps-OpportunityEngine/1.0 (Signal Scanner)';

// -- HTML tag stripper (simple regex, good enough for SO body excerpts) --------

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<pre><code[\s\S]*?<\/code><\/pre>/gi, '[code block]')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// -- HTTPS GET with gzip handling ---------------------------------------------

function fetchJSON(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Encoding': 'gzip',
      },
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      const stream = res.headers['content-encoding'] === 'gzip'
        ? res.pipe(zlib.createGunzip())
        : res;

      stream.on('data', (chunk) => { chunks.push(chunk); });
      stream.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error(`[StackOverflowScanner] JSON parse failed: ${raw.slice(0, 200)}`)); }
      });
      stream.on('error', reject);
    });

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(new Error('[StackOverflowScanner] Request timed out')); });
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// -- Main scan function -------------------------------------------------------

/**
 * Scan Stack Overflow for high-vote unanswered questions (tooling gaps).
 * @param {string|null} cursor - JSON: { tagIndex, page } for rotation/pagination
 * @returns {{ signals: object[], nextCursor: string|null, errors: number }}
 */
async function scan(cursor) {
  let tagIndex = 0;
  let page = 1;

  if (cursor) {
    try {
      const c = JSON.parse(cursor);
      tagIndex = c.tagIndex || 0;
      page = c.page || 1;
    } catch {}
  }

  // Wrap around if past the end of tags
  if (tagIndex >= TAGS.length) {
    tagIndex = 0;
    page = 1;
  }

  const tag = TAGS[tagIndex];
  const signals = [];
  let errors = 0;
  let quotaRemaining = 300;
  let hasMore = false;
  let currentPage = page;

  console.log(`[StackOverflowScanner] Scanning tag "${tag}" page ${currentPage}...`);

  // Fetch pages until we hit the signal cap or run out of results
  while (signals.length < MAX_SIGNALS_PER_SCAN) {
    const url = `https://api.stackexchange.com/2.3/questions?order=desc&sort=votes&tagged=${encodeURIComponent(tag)}&site=stackoverflow&filter=withbody&pagesize=25&page=${currentPage}`;

    try {
      const data = await fetchJSON(url);

      // Track API quota
      quotaRemaining = data.quota_remaining ?? quotaRemaining;
      hasMore = data.has_more ?? false;

      if (quotaRemaining < QUOTA_FLOOR) {
        console.warn(`[StackOverflowScanner] Quota low (${quotaRemaining} remaining), stopping scan`);
        break;
      }

      if (!data.items || data.items.length === 0) {
        console.log(`[StackOverflowScanner] No items for tag "${tag}" page ${currentPage}`);
        break;
      }

      for (const q of data.items) {
        if (signals.length >= MAX_SIGNALS_PER_SCAN) break;

        // Filter: score >= 5 and no accepted answer
        if ((q.score || 0) < MIN_SCORE) continue;
        if (q.accepted_answer_id) continue;

        signals.push({
          source: 'stackoverflow',
          url: q.link || `https://stackoverflow.com/questions/${q.question_id}`,
          title: (q.title || '').slice(0, 500),
          body_text: stripHtml(q.body || '').slice(0, 5000),
          author: q.owner?.display_name || null,
          posted_at: q.creation_date
            ? new Date(q.creation_date * 1000).toISOString()
            : null,
          platform_score: Math.min(q.score || 0, 100),
        });
      }

      // If the page had results but no more pages, stop
      if (!hasMore) break;

      currentPage++;

      // Polite delay between pages (SO recommends ~1s for unauthenticated)
      await sleep(1500);
    } catch (err) {
      console.error(`[StackOverflowScanner] Error on tag "${tag}" page ${currentPage}:`, err.message);
      errors++;
      break;
    }
  }

  // Build next cursor: advance to next page if there are more results,
  // otherwise rotate to the next tag
  let nextCursor = null;
  if (hasMore && signals.length >= MAX_SIGNALS_PER_SCAN) {
    // More results on this tag — continue from next page
    nextCursor = JSON.stringify({ tagIndex, page: currentPage });
  } else {
    // Move to next tag, reset page
    const nextTag = tagIndex + 1;
    if (nextTag < TAGS.length) {
      nextCursor = JSON.stringify({ tagIndex: nextTag, page: 1 });
    }
    // If we've exhausted all tags, nextCursor stays null (full cycle complete)
  }

  console.log(`[StackOverflowScanner] Found ${signals.length} signals for tag "${tag}", ${errors} errors (quota: ${quotaRemaining})`);
  return { signals, nextCursor, errors };
}

module.exports = { scan, TAGS, MIN_SCORE };
