/**
 * @file indieHackersScanner.js
 * @description Indie Hackers Playwright scanner — idea validation, revenue milestones, underserved niches.
 *
 * Scans IH posts for pain/opportunity signals: idea feedback, revenue milestones,
 * and general posts with keywords suggesting unmet needs or traction.
 * Rate: 1 page per scan cycle (IH is a small site, be gentle).
 * Cost: $0
 *
 * @exports { scan(cursor) -> { signals[], nextCursor, errors } }
 */

'use strict';

const pool = require('../playwrightPool');

const CATEGORIES = [
  { slug: null,            url: 'https://www.indiehackers.com/posts?sorting=newest',                            label: 'latest' },
  { slug: 'idea-feedback', url: 'https://www.indiehackers.com/posts?sorting=newest&category=idea-feedback',      label: 'idea-feedback' },
  { slug: 'revenue',       url: 'https://www.indiehackers.com/posts?sorting=newest&category=revenue',            label: 'revenue' },
];

const SIGNAL_KEYWORDS = /\b(looking for|wish|idea|validate|built|revenue|\$|MRR|launched|problem|frustrated|need|underserved|niche|gap|market|pivot|churn|struggle|painful|manual|tedious|opportunity|growth|traction)\b/i;

const MAX_SIGNALS = 25;

// ── Parse relative time ("2h ago", "3d ago") to ISO timestamp ───────────────

function parseRelativeTime(text) {
  if (!text || typeof text !== 'string') return null;

  const now = Date.now();
  const t = text.trim().toLowerCase();

  // Try absolute ISO first
  if (/^\d{4}-\d{2}/.test(t)) {
    try { return new Date(t).toISOString(); } catch { /* fall through */ }
  }

  const match = t.match(/(\d+)\s*(s|sec|m|min|h|hr|hour|d|day|w|week|mo|month|y|year)s?\s*ago/i);
  if (!match) return null;

  const num = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  const multipliers = {
    s: 1000, sec: 1000,
    m: 60000, min: 60000,
    h: 3600000, hr: 3600000, hour: 3600000,
    d: 86400000, day: 86400000,
    w: 604800000, week: 604800000,
    mo: 2592000000, month: 2592000000,
    y: 31536000000, year: 31536000000,
  };

  const ms = multipliers[unit];
  if (!ms) return null;

  return new Date(now - num * ms).toISOString();
}

// ── Compute platform score from votes + comments ────────────────────────────

function computeScore(upvotes, comments) {
  const v = parseInt(upvotes, 10) || 0;
  const c = parseInt(comments, 10) || 0;
  // Comments are weighted 2x since they indicate deeper engagement
  return v + c * 2;
}

// ── Safe page close ─────────────────────────────────────────────────────────

function safeClose(page) {
  return Promise.race([
    page.close(),
    new Promise(r => setTimeout(r, 3000)),
  ]).catch(() => {});
}

// ── Main scan function ──────────────────────────────────────────────────────

/**
 * Scan Indie Hackers for pain/opportunity signals.
 * @param {string|null} cursor - JSON: { categoryIndex, page } for rotation
 * @returns {{ signals: object[], nextCursor: string|null, errors: number }}
 */
async function scan(cursor) {
  let categoryIndex = 0;
  let pageNum = 1;

  if (cursor) {
    try {
      const c = JSON.parse(cursor);
      categoryIndex = c.categoryIndex || 0;
      pageNum = c.page || 1;
    } catch {}
  }

  // Wrap around if past last category
  if (categoryIndex >= CATEGORIES.length) {
    categoryIndex = 0;
    pageNum = 1;
  }

  const category = CATEGORIES[categoryIndex];
  const signals = [];
  let errors = 0;
  let page = null;

  try {
    const inst = await pool.getInstance();
    page = await inst.getPage();
  } catch (err) {
    console.error(`[IndieHackersScanner] Playwright pool unavailable: ${err.message}`);
    return { signals: [], nextCursor: cursor, errors: 1 };
  }

  try {
    const url = category.url + (pageNum > 1 ? `&page=${pageNum}` : '');
    console.log(`[IndieHackersScanner] Scanning ${category.label} (page ${pageNum}): ${url}`);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for post elements to appear
    await page.waitForSelector('article, .post, .feed-item, [class*="post"], [class*="Post"]', { timeout: 15000 }).catch(() => {
      console.warn(`[IndieHackersScanner] No post selector found, trying fallback extraction`);
    });

    // Extract posts — IH uses various class names; try multiple selectors
    const posts = await page.evaluate(() => {
      const results = [];

      // Strategy 1: article elements or common post containers
      const containers = document.querySelectorAll(
        'article, .post, .feed-item, [class*="post-list"] > *, [class*="PostList"] > *, [class*="feed"] > div'
      );

      for (const el of containers) {
        if (results.length >= 30) break;

        // Find title — look for heading or prominent link
        const titleEl = el.querySelector('h2, h3, [class*="title"], [class*="Title"], a[class*="post"]');
        const title = titleEl ? titleEl.textContent.trim() : '';
        if (!title || title.length < 5) continue;

        // Find URL
        const linkEl = el.querySelector('a[href*="/post/"]') || titleEl?.closest('a') || el.querySelector('a');
        const href = linkEl ? linkEl.href : '';

        // Find author
        const authorEl = el.querySelector('[class*="author"], [class*="Author"], [class*="user"], a[href*="/"]');
        let author = '';
        if (authorEl) {
          const authorLink = authorEl.querySelector('a[href*="/"]') || authorEl;
          author = authorLink.textContent.trim().replace(/^@/, '');
        }

        // Find body preview
        const bodyEl = el.querySelector('[class*="body"], [class*="Body"], [class*="excerpt"], [class*="Excerpt"], [class*="description"], p');
        const body = bodyEl ? bodyEl.textContent.trim() : '';

        // Find vote/upvote count
        const voteEl = el.querySelector('[class*="vote"], [class*="Vote"], [class*="upvote"], [class*="score"], [class*="Score"]');
        const votes = voteEl ? voteEl.textContent.trim().replace(/[^\d]/g, '') : '0';

        // Find comment count
        const commentEl = el.querySelector('[class*="comment"], [class*="Comment"], [class*="reply"], [class*="Reply"]');
        const comments = commentEl ? commentEl.textContent.trim().replace(/[^\d]/g, '') : '0';

        // Find posted time
        const timeEl = el.querySelector('time, [class*="time"], [class*="Time"], [class*="date"], [class*="Date"], [class*="ago"]');
        const timeText = timeEl ? (timeEl.getAttribute('datetime') || timeEl.getAttribute('title') || timeEl.textContent.trim()) : '';

        results.push({ title, url: href, author, body, votes, comments, timeText });
      }

      // Strategy 2: if strategy 1 found nothing, try link-based extraction
      if (results.length === 0) {
        const links = document.querySelectorAll('a[href*="/post/"]');
        for (const link of links) {
          if (results.length >= 30) break;
          const title = link.textContent.trim();
          if (!title || title.length < 5) continue;

          // Walk up to find container
          const container = link.closest('div, article, li, section') || link.parentElement;
          const body = container ? container.textContent.trim().replace(title, '').trim() : '';
          results.push({ title, url: link.href, author: '', body: body.slice(0, 500), votes: '0', comments: '0', timeText: '' });
        }
      }

      return results;
    });

    console.log(`[IndieHackersScanner] Extracted ${posts.length} raw posts from ${category.label}`);

    for (const post of posts) {
      if (signals.length >= MAX_SIGNALS) break;

      const fullText = (post.title || '') + ' ' + (post.body || '');

      // Filter: must match signal keywords
      if (!SIGNAL_KEYWORDS.test(fullText)) continue;

      // Build absolute URL
      let postUrl = post.url || '';
      if (postUrl && !postUrl.startsWith('http')) {
        postUrl = 'https://www.indiehackers.com' + (postUrl.startsWith('/') ? '' : '/') + postUrl;
      }

      signals.push({
        source: 'indiehackers',
        url: postUrl,
        title: (post.title || '').slice(0, 500),
        body_text: (post.body || '').slice(0, 5000),
        author: post.author || null,
        posted_at: parseRelativeTime(post.timeText),
        platform_score: computeScore(post.votes, post.comments),
      });
    }
  } catch (err) {
    console.error(`[IndieHackersScanner] Error scanning ${category.label}:`, err.message);
    errors++;
  } finally {
    if (page) await safeClose(page);
  }

  // Build next cursor — rotate through categories, then increment page
  let nextCategoryIndex = categoryIndex;
  let nextPage = pageNum;

  // Move to next category
  nextCategoryIndex++;
  if (nextCategoryIndex >= CATEGORIES.length) {
    // Wrapped around all categories — increment page number
    nextCategoryIndex = 0;
    nextPage = pageNum + 1;

    // Cap at page 3 to avoid scraping too deep, then reset
    if (nextPage > 3) nextPage = 1;
  }

  const nextCursor = JSON.stringify({ categoryIndex: nextCategoryIndex, page: nextPage });

  console.log(`[IndieHackersScanner] Found ${signals.length} signals, ${errors} errors (category: ${category.label}, page: ${pageNum})`);
  return { signals, nextCursor, errors };
}

module.exports = { scan, CATEGORIES, SIGNAL_KEYWORDS };
