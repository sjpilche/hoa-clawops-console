/**
 * @file hnScanner.js
 * @description Hacker News Algolia API scanner — no auth needed.
 *
 * Searches HN for pain signals: "Ask HN", "Show HN", frustration posts.
 * Rate limit: 1 req/s (generous, but we're conservative).
 * Cost: $0
 *
 * @exports { scan(cursor) → { signals[], nextCursor, errors } }
 */

'use strict';

const https = require('https');

const SEARCH_QUERIES = [
  'frustrated with',
  'looking for alternative',
  'wish there was',
  'someone should build',
  'why is there no',
  'hate using',
  'manual process',
  'spreadsheet hell',
  'construction software',
  'accounting nightmare',
];

const USER_AGENT = 'ClawOps-OpportunityEngine/1.0';

function fetchJSON(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`HN JSON parse failed: ${data.slice(0, 200)}`)); }
      });
    });

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(new Error('HN request timed out')); });
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Scan Hacker News via Algolia API.
 * @param {string|null} cursor - JSON: { queryIndex, page }
 * @returns {{ signals: object[], nextCursor: string|null, errors: number }}
 */
async function scan(cursor) {
  let queryIndex = 0;
  let page = 0;

  if (cursor) {
    try {
      const c = JSON.parse(cursor);
      queryIndex = c.queryIndex || 0;
      page = c.page || 0;
    } catch {}
  }

  const signals = [];
  let errors = 0;

  // Process up to 3 queries per run
  const maxQueries = Math.min(queryIndex + 3, SEARCH_QUERIES.length);

  for (let i = queryIndex; i < maxQueries; i++) {
    const query = encodeURIComponent(SEARCH_QUERIES[i]);
    const p = (i === queryIndex) ? page : 0;

    try {
      // Search by date, last 7 days, stories only
      const numericFilters = `created_at_i>${Math.floor(Date.now() / 1000) - 7 * 86400}`;
      const url = `https://hn.algolia.com/api/v1/search_by_date?query=${query}&tags=story&numericFilters=${encodeURIComponent(numericFilters)}&page=${p}&hitsPerPage=20`;

      console.log(`[HNScanner] Searching: "${SEARCH_QUERIES[i]}" page ${p}...`);
      const data = await fetchJSON(url);

      if (!data?.hits) {
        console.warn(`[HNScanner] No hits for "${SEARCH_QUERIES[i]}"`);
        errors++;
        await sleep(1000);
        continue;
      }

      for (const hit of data.hits) {
        // Skip if no meaningful content
        if (!hit.title && !hit.story_text) continue;

        const points = hit.points || 0;
        const comments = hit.num_comments || 0;

        // Minimum engagement filter: at least 2 points or 1 comment
        if (points < 2 && comments < 1) continue;

        signals.push({
          url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
          title: (hit.title || '').slice(0, 500),
          body_text: (hit.story_text || hit.comment_text || '').slice(0, 5000),
          author: hit.author || null,
          posted_at: hit.created_at || null,
          platform_score: points + comments,
        });
      }
    } catch (err) {
      console.error(`[HNScanner] Error on "${SEARCH_QUERIES[i]}":`, err.message);
      errors++;
    }

    await sleep(1000);
  }

  // Build next cursor
  let nextCursor = null;
  if (maxQueries < SEARCH_QUERIES.length) {
    nextCursor = JSON.stringify({ queryIndex: maxQueries, page: 0 });
  }

  console.log(`[HNScanner] Found ${signals.length} pain signals, ${errors} errors`);
  return { signals, nextCursor, errors };
}

module.exports = { scan, SEARCH_QUERIES };
