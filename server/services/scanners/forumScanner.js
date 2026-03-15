/**
 * @file forumScanner.js
 * @description Industry forum scanner — construction, HOA, and small business forums.
 *
 * Sources:
 *   1. BiggerPockets HOA/Condo forum (RSS)
 *   2. ContractorTalk forums (Playwright)
 *   3. r/ConstructionManagement (Reddit JSON API)
 *   4. r/HOA (Reddit JSON API)
 *   5. r/smallbusiness (Reddit JSON API)
 *
 * Rate limits: 1 req/3s Reddit, 1 req/5s external forums.
 * Cost: $0
 *
 * @exports { scan(cursor) → { signals[], nextCursor, errors } }
 */

'use strict';

const https = require('https');
const http = require('http');

// ── Forum definitions ───────────────────────────────────────────────────────

const FORUMS = [
  { id: 'biggerpockets',            type: 'rss',        url: 'https://www.biggerpockets.com/forums/48.rss' },
  { id: 'contractortalk',           type: 'playwright',  url: 'https://www.contractortalk.com/forums/' },
  { id: 'r_ConstructionManagement', type: 'reddit',      subreddit: 'ConstructionManagement' },
  { id: 'r_HOA',                    type: 'reddit',      subreddit: 'HOA' },
  { id: 'r_smallbusiness',          type: 'reddit',      subreddit: 'smallbusiness' },
];

const PAIN_KEYWORDS = /\b(frustrated|wish|need help|looking for|alternative|hate|manual process|spreadsheet|quickbooks|accounting nightmare|tired of|sick of|broken|tedious|painful|expensive|overpriced|desperately|anyone know|recommendation)\b/i;

const USER_AGENT = 'ClawOps-OpportunityEngine/1.0 (ForumScanner)';

const MAX_SIGNALS_PER_CYCLE = 40;

// ── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchRaw(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT },
    };

    const req = mod.request(options, (res) => {
      // Follow 301/302 redirects (one hop)
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        return fetchRaw(res.headers.location, timeoutMs).then(resolve, reject);
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(new Error('Request timed out')); });
    req.end();
  });
}

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
        catch { reject(new Error(`JSON parse failed: ${data.slice(0, 200)}`)); }
      });
    });

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(new Error('Request timed out')); });
    req.end();
  });
}

/**
 * Strip HTML tags from a string.
 */
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// ── RSS Scanner (BiggerPockets) ─────────────────────────────────────────────

async function scanRSS(forum, cursorState) {
  const signals = [];

  try {
    console.log(`[ForumScanner] Fetching RSS: ${forum.url}`);
    const xml = await fetchRaw(forum.url);

    // Regex-based XML extraction — no xml2js dependency
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    const lastSeenDate = cursorState?.lastSeenDate || null;
    let newestDate = lastSeenDate;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
      const itemXml = match[1];

      const titleMatch = itemXml.match(/<title>([\s\S]*?)<\/title>/i);
      const linkMatch = itemXml.match(/<link>([\s\S]*?)<\/link>/i);
      const descMatch = itemXml.match(/<description>([\s\S]*?)<\/description>/i);
      const pubDateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
      const authorMatch = itemXml.match(/<dc:creator>([\s\S]*?)<\/dc:creator>/i)
        || itemXml.match(/<author>([\s\S]*?)<\/author>/i);

      const title = stripHtml(titleMatch?.[1] || '');
      const link = stripHtml(linkMatch?.[1] || '');
      const description = stripHtml(descMatch?.[1] || '');
      const pubDate = pubDateMatch?.[1]?.trim() || null;
      const author = stripHtml(authorMatch?.[1] || '') || null;

      // Skip items we already saw (based on pubDate)
      if (lastSeenDate && pubDate) {
        try {
          if (new Date(pubDate).getTime() <= new Date(lastSeenDate).getTime()) continue;
        } catch { /* date parse failed, include it */ }
      }

      // Track newest date for cursor
      if (pubDate) {
        try {
          if (!newestDate || new Date(pubDate).getTime() > new Date(newestDate).getTime()) {
            newestDate = pubDate;
          }
        } catch { /* ignore */ }
      }

      const fullText = title + ' ' + description;
      if (!PAIN_KEYWORDS.test(fullText)) continue;

      signals.push({
        source: 'forum',
        url: link,
        title: title.slice(0, 500),
        body_text: description.slice(0, 5000),
        author,
        posted_at: pubDate ? new Date(pubDate).toISOString() : null,
        platform_score: 0, // RSS has no score info
      });
    }

    return { signals, cursorUpdate: { lastSeenDate: newestDate } };
  } catch (err) {
    console.error(`[ForumScanner] RSS error (${forum.id}):`, err.message);
    return { signals: [], cursorUpdate: cursorState || {}, error: true };
  }
}

// ── Playwright Scanner (ContractorTalk) ─────────────────────────────────────

async function scanPlaywright(forum, cursorState) {
  const signals = [];
  let pool;

  try {
    pool = require('../playwrightPool');
  } catch (err) {
    console.warn(`[ForumScanner] Playwright pool unavailable, skipping ${forum.id}:`, err.message);
    return { signals: [], cursorUpdate: cursorState || {}, error: true };
  }

  let page = null;
  try {
    console.log(`[ForumScanner] Playwright: scanning ${forum.url}`);
    page = await pool.getPage();

    await page.goto(forum.url, { waitUntil: 'domcontentloaded', timeout: 20000 });

    // ContractorTalk: extract thread listings from forum index
    const threads = await page.evaluate(() => {
      const items = [];
      // vBulletin / XenForo thread listing patterns
      const threadEls = document.querySelectorAll(
        '.threadtitle a, .structItem-title a, .thread-title a, [data-thread-id] a.title, .topictitle a'
      );

      for (const el of threadEls) {
        const href = el.href || el.getAttribute('href') || '';
        const title = (el.textContent || '').trim();
        if (!title || !href) continue;

        // Try to find post date and author from sibling/parent elements
        const container = el.closest('.threadbit, .structItem, .thread-row, tr, li');
        const dateEl = container?.querySelector('.lastpostdate, .structItem-metaItem, time, .thread-date, .smallfont');
        const authorEl = container?.querySelector('.author a, .username, .structItem-minor a');

        items.push({
          url: href.startsWith('http') ? href : null,
          title,
          date: dateEl?.getAttribute('datetime') || dateEl?.textContent?.trim() || null,
          author: authorEl?.textContent?.trim() || null,
        });
      }

      return items.slice(0, 30); // Cap per page
    });

    const lastSeenUrl = cursorState?.lastSeenUrl || null;

    for (const thread of threads) {
      if (!thread.url || !thread.title) continue;

      // Skip already-seen threads
      if (lastSeenUrl && thread.url === lastSeenUrl) break;

      // Pain keyword filter on title (we don't have body from index page)
      if (!PAIN_KEYWORDS.test(thread.title)) continue;

      let postedAt = null;
      if (thread.date) {
        try { postedAt = new Date(thread.date).toISOString(); } catch { /* leave null */ }
      }

      signals.push({
        source: 'forum',
        url: thread.url,
        title: thread.title.slice(0, 500),
        body_text: '', // Only title available from index page
        author: thread.author || null,
        posted_at: postedAt,
        platform_score: 0,
      });
    }

    const newestUrl = threads[0]?.url || lastSeenUrl;
    return { signals, cursorUpdate: { lastSeenUrl: newestUrl } };
  } catch (err) {
    console.error(`[ForumScanner] Playwright error (${forum.id}):`, err.message);
    return { signals: [], cursorUpdate: cursorState || {}, error: true };
  } finally {
    if (page) {
      try { await Promise.race([page.close(), new Promise(r => setTimeout(r, 3000))]); } catch {}
    }
  }
}

// ── Reddit JSON API Scanner ────────────────────────────────────────────────

async function scanReddit(forum, cursorState) {
  const signals = [];
  const after = cursorState?.after || null;
  const afterParam = after ? `&after=${after}` : '';

  try {
    const url = `https://www.reddit.com/r/${forum.subreddit}/new.json?limit=25${afterParam}`;
    console.log(`[ForumScanner] Fetching r/${forum.subreddit}...`);
    const data = await fetchJSON(url);

    if (!data?.data?.children) {
      console.warn(`[ForumScanner] No data from r/${forum.subreddit}`);
      return { signals: [], cursorUpdate: cursorState || {}, error: true };
    }

    for (const child of data.data.children) {
      const post = child.data;
      if (!post || post.stickied || post.is_self === false) continue;

      const fullText = (post.title || '') + ' ' + (post.selftext || '');
      if (!PAIN_KEYWORDS.test(fullText)) continue;

      signals.push({
        source: 'forum',
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

    const nextAfter = data.data.after || null;
    return { signals, cursorUpdate: { after: nextAfter } };
  } catch (err) {
    console.error(`[ForumScanner] Reddit error (r/${forum.subreddit}):`, err.message);
    return { signals: [], cursorUpdate: cursorState || {}, error: true };
  }
}

// ── Main scan function ──────────────────────────────────────────────────────

/**
 * Scan industry forums for pain signals.
 * @param {string|null} cursor - JSON: per-forum pagination state
 * @returns {{ signals: object[], nextCursor: string|null, errors: number }}
 */
async function scan(cursor) {
  let cursorState = {};
  if (cursor) {
    try { cursorState = JSON.parse(cursor); } catch {}
  }

  const allSignals = [];
  let errors = 0;

  for (const forum of FORUMS) {
    // Stop if we hit the signal cap
    if (allSignals.length >= MAX_SIGNALS_PER_CYCLE) {
      console.log(`[ForumScanner] Signal cap reached (${MAX_SIGNALS_PER_CYCLE}), stopping early`);
      break;
    }

    const forumCursor = cursorState[forum.id] || {};
    let result;

    switch (forum.type) {
      case 'rss':
        result = await scanRSS(forum, forumCursor);
        await sleep(5000); // 1 req / 5s for external forums
        break;

      case 'playwright':
        result = await scanPlaywright(forum, forumCursor);
        await sleep(5000); // 1 req / 5s for external forums
        break;

      case 'reddit':
        result = await scanReddit(forum, forumCursor);
        await sleep(3000); // 1 req / 3s for Reddit
        break;

      default:
        console.warn(`[ForumScanner] Unknown forum type: ${forum.type}`);
        continue;
    }

    if (result.error) errors++;

    // Append signals up to the cap
    const remaining = MAX_SIGNALS_PER_CYCLE - allSignals.length;
    allSignals.push(...result.signals.slice(0, remaining));

    // Update per-forum cursor state
    cursorState[forum.id] = result.cursorUpdate || forumCursor;
  }

  // Build next cursor — always persist state so we pick up where we left off
  const nextCursor = JSON.stringify(cursorState);

  console.log(`[ForumScanner] Found ${allSignals.length} pain signals across ${FORUMS.length} forums, ${errors} errors`);
  return { signals: allSignals, nextCursor, errors };
}

module.exports = { scan, FORUMS, PAIN_KEYWORDS };
