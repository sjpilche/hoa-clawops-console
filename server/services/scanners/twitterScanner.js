/**
 * @file twitterScanner.js
 * @description Twitter/X pain signal scanner via Nitter (Playwright fallback).
 *
 * Searches Twitter for frustration, feature requests, and "build this" signals
 * using public Nitter instances (no API key needed). Falls back to scraping
 * Twitter search directly if all Nitter instances are down.
 *
 * Rate limit: 1 search query per 5 minutes to avoid detection.
 * Cost: $0 (Playwright pool, no API)
 *
 * @exports { scan(cursor) -> { signals[], nextCursor, errors } }
 */

'use strict';

const pool = require('../playwrightPool');

// ── Search Queries ──────────────────────────────────────────────────────────

const SEARCH_QUERIES = [
  '"I wish there was" OR "someone should build"',
  '"frustrated with" OR "why doesn\'t"',
  '"looking for alternative to"',
  '"automate" "manual process"',
];

// ── Nitter Instances (try in order, fall through on failure) ────────────────

const NITTER_INSTANCES = [
  'https://nitter.net',
  'https://nitter.privacydev.net',
  'https://nitter.poast.org',
];

const MAX_SIGNALS_PER_CYCLE = 30;
const RATE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes between searches
const INTER_QUERY_DELAY_MS = 8000;    // 8s between queries within a cycle

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Nitter Scraping ─────────────────────────────────────────────────────────

/**
 * Try fetching search results from a Nitter instance.
 * @param {import('playwright').Page} page
 * @param {string} nitterBase - e.g. 'https://nitter.net'
 * @param {string} query - search query string
 * @returns {object[]} parsed tweet signals
 */
async function scrapeNitter(page, nitterBase, query) {
  const encoded = encodeURIComponent(query);
  const url = `${nitterBase}/search?q=${encoded}&f=tweets`;

  console.log(`[TwitterScanner] Trying Nitter: ${url}`);

  const html = await pool.fetch(page, url, {
    timeoutMs: 30000,
    humanDelay: true,
    waitUntil: 'domcontentloaded',
  });

  // Parse tweet items from Nitter HTML
  const tweets = await page.$$eval('.timeline-item, .tweet-body', (items) => {
    return items.slice(0, 30).map(item => {
      // Nitter structures vary slightly across instances
      const linkEl = item.querySelector('.tweet-link, a[href*="/status/"]');
      const contentEl = item.querySelector('.tweet-content, .media-body');
      const usernameEl = item.querySelector('.username, .tweet-header a');
      const dateEl = item.querySelector('.tweet-date a, time');
      const statsEl = item.querySelector('.tweet-stats, .icon-container');

      // Try to extract engagement numbers
      let likes = 0;
      let retweets = 0;
      const statSpans = item.querySelectorAll('.tweet-stat .icon-container, .tweet-stat');
      for (const s of statSpans) {
        const text = s.textContent || '';
        const num = parseInt(text.replace(/[^0-9]/g, ''), 10) || 0;
        if (s.querySelector('.icon-heart, .icon-like') || text.includes('like')) likes = num;
        if (s.querySelector('.icon-retweet') || text.includes('retweet')) retweets = num;
      }

      const href = linkEl ? linkEl.getAttribute('href') : null;
      const content = contentEl ? contentEl.textContent.trim() : (item.textContent || '').trim();
      const username = usernameEl ? usernameEl.textContent.trim().replace(/^@/, '') : null;
      const dateStr = dateEl ? (dateEl.getAttribute('datetime') || dateEl.getAttribute('title') || dateEl.textContent.trim()) : null;

      return {
        href: href || null,
        content: content.slice(0, 5000),
        username,
        dateStr,
        likes,
        retweets,
      };
    }).filter(t => t.content.length > 10);
  });

  return tweets;
}

// ── Twitter Direct Scraping (fallback) ──────────────────────────────────────

/**
 * Fall back to scraping Twitter search directly via Playwright.
 * Less reliable (login walls, rate limits), but works when Nitter is down.
 * @param {import('playwright').Page} page
 * @param {string} query
 * @returns {object[]} parsed tweet signals
 */
async function scrapeTwitterDirect(page, query) {
  const encoded = encodeURIComponent(query);
  const url = `https://twitter.com/search?q=${encoded}&src=typed_query&f=live`;

  console.log(`[TwitterScanner] Falling back to Twitter direct: ${url}`);

  try {
    const html = await pool.fetch(page, url, {
      timeoutMs: 30000,
      humanDelay: true,
      waitUntil: 'networkidle',
    });

    // Wait for tweet articles to render (React SPA)
    await page.waitForSelector('article[data-testid="tweet"], article[role="article"]', { timeout: 10000 }).catch(() => {});

    const tweets = await page.$$eval('article[data-testid="tweet"], article[role="article"]', (articles) => {
      return articles.slice(0, 30).map(article => {
        const tweetText = article.querySelector('[data-testid="tweetText"], [lang]');
        const content = tweetText ? tweetText.textContent.trim() : '';

        // Find permalink (status link)
        const timeEl = article.querySelector('time');
        const linkEl = timeEl ? timeEl.closest('a') : null;
        const href = linkEl ? linkEl.getAttribute('href') : null;
        const dateStr = timeEl ? timeEl.getAttribute('datetime') : null;

        // Username
        const userLinks = article.querySelectorAll('a[role="link"]');
        let username = null;
        for (const a of userLinks) {
          const h = a.getAttribute('href') || '';
          if (h.match(/^\/[a-zA-Z0-9_]+$/) && !h.includes('/')) {
            username = h.replace('/', '');
            break;
          }
        }

        // Engagement metrics
        let likes = 0;
        let retweets = 0;
        const metricGroups = article.querySelectorAll('[data-testid$="-count"], [role="group"]');
        for (const g of metricGroups) {
          const label = g.getAttribute('aria-label') || g.textContent || '';
          const num = parseInt(label.replace(/[^0-9]/g, ''), 10) || 0;
          if (/like/i.test(label)) likes = num;
          if (/retweet|repost/i.test(label)) retweets = num;
        }

        return { href, content: content.slice(0, 5000), username, dateStr, likes, retweets };
      }).filter(t => t.content.length > 10);
    });

    return tweets;
  } catch (err) {
    console.warn(`[TwitterScanner] Twitter direct scrape failed: ${err.message}`);
    return [];
  }
}

// ── Normalize Results ───────────────────────────────────────────────────────

/**
 * Convert raw scraped tweet data into normalized signal objects.
 * @param {object[]} rawTweets
 * @param {string} nitterBase - Nitter base URL used (or 'twitter.com' for direct)
 * @returns {object[]} signal objects
 */
function normalizeTweets(rawTweets, nitterBase) {
  const signals = [];
  const seenUrls = new Set();

  for (const t of rawTweets) {
    // Build canonical Twitter URL from href
    let tweetUrl = null;
    if (t.href) {
      if (t.href.startsWith('http')) {
        tweetUrl = t.href;
      } else {
        // Relative path like /user/status/12345
        tweetUrl = `https://twitter.com${t.href}`;
      }
    }

    // Dedup by URL
    if (tweetUrl && seenUrls.has(tweetUrl)) continue;
    if (tweetUrl) seenUrls.add(tweetUrl);

    // Parse posted_at
    let postedAt = null;
    if (t.dateStr) {
      try {
        const d = new Date(t.dateStr);
        if (!isNaN(d.getTime())) postedAt = d.toISOString();
      } catch {}
    }

    // Title: first 120 chars of content
    const title = t.content.length > 120 ? t.content.slice(0, 117) + '...' : t.content;

    signals.push({
      source: 'twitter',
      url: tweetUrl || `https://twitter.com/search`,
      title,
      body_text: t.content,
      author: t.username || null,
      posted_at: postedAt,
      platform_score: (t.likes || 0) + (t.retweets || 0) * 2,
    });

    if (signals.length >= MAX_SIGNALS_PER_CYCLE) break;
  }

  return signals;
}

// ── Main Scan Function ──────────────────────────────────────────────────────

/**
 * Scan Twitter/X for pain signals via Nitter (Playwright fallback).
 * @param {string|null} cursor - JSON: { queryIndex, lastScanTs }
 * @returns {{ signals: object[], nextCursor: string|null, errors: number }}
 */
async function scan(cursor) {
  let queryIndex = 0;
  let lastScanTs = 0;

  if (cursor) {
    try {
      const c = JSON.parse(cursor);
      queryIndex = c.queryIndex || 0;
      lastScanTs = c.lastScanTs || 0;
    } catch {}
  }

  // Rate limit: skip if last scan was less than 5 minutes ago
  const now = Date.now();
  if (lastScanTs && (now - lastScanTs) < RATE_LIMIT_MS) {
    const waitSec = Math.ceil((RATE_LIMIT_MS - (now - lastScanTs)) / 1000);
    console.log(`[TwitterScanner] Rate limited — ${waitSec}s until next allowed scan`);
    return {
      signals: [],
      nextCursor: cursor,
      errors: 0,
    };
  }

  // Check if Playwright pool circuit breaker is open for our targets
  const nitterDomain = 'nitter.net';
  const twitterDomain = 'twitter.com';
  const nitterCircuitOpen = pool.circuitBreaker(nitterDomain);
  const twitterCircuitOpen = pool.circuitBreaker(twitterDomain);

  if (nitterCircuitOpen && twitterCircuitOpen) {
    console.log('[TwitterScanner] Both Nitter and Twitter circuits open — returning empty');
    return {
      signals: [],
      nextCursor: JSON.stringify({ queryIndex, lastScanTs: now }),
      errors: 0,
    };
  }

  const signals = [];
  let errors = 0;

  // Scan up to 2 queries per cycle to stay under rate limits
  const maxQueries = Math.min(queryIndex + 2, SEARCH_QUERIES.length);

  for (let i = queryIndex; i < maxQueries; i++) {
    const query = SEARCH_QUERIES[i];
    let page = null;

    try {
      page = await pool.getPage();
    } catch (err) {
      console.error(`[TwitterScanner] Failed to get Playwright page: ${err.message}`);
      errors++;
      continue;
    }

    try {
      let rawTweets = [];
      let usedSource = 'nitter';

      // Try each Nitter instance in order
      if (!nitterCircuitOpen) {
        for (const nitterBase of NITTER_INSTANCES) {
          try {
            rawTweets = await scrapeNitter(page, nitterBase, query);
            if (rawTweets.length > 0) {
              console.log(`[TwitterScanner] Got ${rawTweets.length} tweets from ${nitterBase}`);
              break;
            }
          } catch (err) {
            console.warn(`[TwitterScanner] Nitter instance ${nitterBase} failed: ${err.message}`);
          }
        }
      }

      // Fallback to Twitter direct if Nitter returned nothing
      if (rawTweets.length === 0 && !twitterCircuitOpen) {
        usedSource = 'twitter_direct';
        // Need a fresh page for different domain
        await Promise.race([page.close(), new Promise(r => setTimeout(r, 3000))]);
        try { const ctx = page.context(); if (ctx) await ctx.close().catch(() => {}); } catch {}

        page = await pool.getPage();
        rawTweets = await scrapeTwitterDirect(page, query);
        if (rawTweets.length > 0) {
          console.log(`[TwitterScanner] Got ${rawTweets.length} tweets from Twitter direct`);
        }
      }

      const normalized = normalizeTweets(rawTweets, usedSource);
      signals.push(...normalized);

      console.log(`[TwitterScanner] Query "${query.slice(0, 50)}..." → ${normalized.length} signals (via ${usedSource})`);

    } catch (err) {
      console.error(`[TwitterScanner] Error on query "${query.slice(0, 40)}...":`, err.message);
      errors++;
    } finally {
      // Safe close with 3s timeout pattern (matches project convention)
      if (page) {
        await Promise.race([page.close(), new Promise(r => setTimeout(r, 3000))]);
        try { const ctx = page.context(); if (ctx) await ctx.close().catch(() => {}); } catch {}
      }
    }

    // Delay between queries
    if (i < maxQueries - 1) {
      await sleep(INTER_QUERY_DELAY_MS);
    }
  }

  // Trim to max signals
  const trimmed = signals.slice(0, MAX_SIGNALS_PER_CYCLE);

  // Build next cursor
  let nextCursor = null;
  const nextIndex = Math.min(queryIndex + 2, SEARCH_QUERIES.length);
  if (nextIndex < SEARCH_QUERIES.length) {
    // More queries remaining in this cycle
    nextCursor = JSON.stringify({ queryIndex: nextIndex, lastScanTs: now });
  } else {
    // Full cycle complete — wrap around, record timestamp for rate limit
    nextCursor = JSON.stringify({ queryIndex: 0, lastScanTs: now });
  }

  console.log(`[TwitterScanner] Found ${trimmed.length} pain signals, ${errors} errors`);
  return { signals: trimmed, nextCursor, errors };
}

module.exports = { scan, SEARCH_QUERIES, NITTER_INSTANCES };
