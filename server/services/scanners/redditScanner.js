/**
 * @file redditScanner.js
 * @description Reddit JSON API scanner — no auth needed.
 *
 * Scans subreddits for pain signals: frustration, feature requests, "wish" posts.
 * Rate limit: 1 request per 2 seconds (Reddit free API).
 * Cost: $0
 *
 * @exports { scan(cursor) → { signals[], nextCursor, errors } }
 */

'use strict';

const https = require('https');

const SUBREDDITS = [
  'SaaS', 'startups', 'Entrepreneur', 'smallbusiness',
  'selfhosted', 'webdev', 'sysadmin', 'construction',
  'accounting', 'bookkeeping',
];

const PAIN_KEYWORDS = /\b(wish|need|hate|frustrated|looking for|alternative to|tired of|sick of|annoying|broken|manual|tedious|painful|expensive|overpriced|switch from|migrate from|replace|desperately|help me find|anyone know|recommendation)\b/i;

const USER_AGENT = 'ClawOps-OpportunityEngine/1.0 (Signal Scanner)';

// ── HTTP GET with JSON response ─────────────────────────────────────────────

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
        catch { reject(new Error(`Reddit JSON parse failed: ${data.slice(0, 200)}`)); }
      });
    });

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(new Error('Reddit request timed out')); });
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main scan function ──────────────────────────────────────────────────────

/**
 * Scan Reddit subreddits for pain signals.
 * @param {string|null} cursor - JSON: { subredditIndex, after } for pagination
 * @returns {{ signals: object[], nextCursor: string|null, errors: number }}
 */
async function scan(cursor) {
  let startSub = 0;
  let after = null;

  if (cursor) {
    try {
      const c = JSON.parse(cursor);
      startSub = c.subredditIndex || 0;
      after = c.after || null;
    } catch {}
  }

  const signals = [];
  let errors = 0;
  let lastSub = startSub;
  let lastAfter = null;

  // Scan up to 3 subreddits per run to stay under rate limits
  const maxSubs = Math.min(startSub + 3, SUBREDDITS.length);

  for (let i = startSub; i < maxSubs; i++) {
    const sub = SUBREDDITS[i];
    const afterParam = (i === startSub && after) ? `&after=${after}` : '';

    try {
      const url = `https://www.reddit.com/r/${sub}/new.json?limit=25${afterParam}`;
      console.log(`[RedditScanner] Fetching r/${sub}...`);
      const data = await fetchJSON(url);

      if (!data?.data?.children) {
        console.warn(`[RedditScanner] No data from r/${sub}`);
        errors++;
        await sleep(2000);
        continue;
      }

      for (const child of data.data.children) {
        const post = child.data;
        if (!post || post.stickied || post.is_self === false) continue;

        const fullText = (post.title || '') + ' ' + (post.selftext || '');

        // Filter: must match pain keywords
        if (!PAIN_KEYWORDS.test(fullText)) continue;

        signals.push({
          url: `https://www.reddit.com${post.permalink}`,
          title: (post.title || '').slice(0, 500),
          body_text: (post.selftext || '').slice(0, 5000),
          author: post.author || null,
          posted_at: post.created_utc
            ? new Date(post.created_utc * 1000).toISOString()
            : null,
          platform_score: (post.score || 0) + (post.num_comments || 0),
        });
      }

      lastSub = i;
      lastAfter = data.data.after || null;
    } catch (err) {
      console.error(`[RedditScanner] Error on r/${sub}:`, err.message);
      errors++;
    }

    // Rate limit: 2s between requests
    await sleep(2000);
  }

  // Build next cursor
  let nextCursor = null;
  if (lastSub + 1 < SUBREDDITS.length) {
    nextCursor = JSON.stringify({ subredditIndex: lastSub + 1, after: null });
  } else if (lastAfter) {
    // Wrap around with pagination on last sub
    nextCursor = JSON.stringify({ subredditIndex: 0, after: null });
  }
  // If we've scanned all subs, nextCursor stays null (full cycle complete)

  console.log(`[RedditScanner] Found ${signals.length} pain signals, ${errors} errors`);
  return { signals, nextCursor, errors };
}

module.exports = { scan, SUBREDDITS, PAIN_KEYWORDS };
