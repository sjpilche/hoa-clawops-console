/**
 * @file twitterScanner.js
 * @description Twitter/X pain signal scanner via bird CLI (Agent-Reach).
 *
 * Uses bird CLI (cookie-based, no API key needed) for searching tweets.
 * Returns structured JSON — no Playwright needed.
 *
 * Rate limit: 1 search query per 5 minutes to avoid detection.
 * Cost: $0
 *
 * Setup: agent-reach configure twitter-cookies "auth_token=xxx; ct0=yyy"
 *   or: set AUTH_TOKEN and CT0 environment variables
 *
 * @exports { scan(cursor) -> { signals[], nextCursor, errors } }
 */

'use strict';

const { execFile } = require('child_process');

// ── Search Queries ──────────────────────────────────────────────────────────

const SEARCH_QUERIES = [
  '"I wish there was" OR "someone should build"',
  '"frustrated with" OR "why doesn\'t"',
  '"looking for alternative to"',
  '"automate" "manual process"',
];

const MAX_SIGNALS_PER_CYCLE = 30;
const RATE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes between searches
const INTER_QUERY_DELAY_MS = 8000;    // 8s between queries within a cycle
const BIRD_TIMEOUT_MS = 30_000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── bird CLI search ─────────────────────────────────────────────────────────

/**
 * Search Twitter via bird CLI. Returns parsed tweet objects.
 * @param {string} query - search query
 * @param {number} count - max results
 * @returns {Promise<object[]>} raw tweet objects from bird
 */
function birdSearch(query, count = 10) {
  return new Promise((resolve, reject) => {
    execFile('bird', ['search', query, '-n', String(count), '--json'], {
      timeout: BIRD_TIMEOUT_MS,
    }, (err, stdout, stderr) => {
      if (err) {
        // Check if bird isn't configured (missing cookies)
        if (stderr && (stderr.includes('Missing required credentials') || stderr.includes('Missing auth_token'))) {
          console.warn('[TwitterScanner] bird CLI not configured — set AUTH_TOKEN and CT0 env vars');
          return resolve([]);
        }
        console.error(`[TwitterScanner] bird error: ${err.message}`);
        return resolve([]); // Graceful degradation
      }
      try {
        // bird --json outputs one JSON object per line (NDJSON) or a JSON array
        const trimmed = (stdout || '').trim();
        if (!trimmed) return resolve([]);

        // Try parsing as JSON array first
        if (trimmed.startsWith('[')) {
          return resolve(JSON.parse(trimmed));
        }
        // NDJSON: one object per line
        const tweets = trimmed.split('\n')
          .filter(line => line.trim())
          .map(line => {
            try { return JSON.parse(line); } catch { return null; }
          })
          .filter(Boolean);
        resolve(tweets);
      } catch (parseErr) {
        // If JSON parsing fails, try extracting text-based output
        console.warn(`[TwitterScanner] bird output parse error: ${parseErr.message}`);
        resolve(parseBirdTextOutput(stdout || ''));
      }
    });
  });
}

/**
 * Fallback parser for bird's text output (non-JSON mode).
 * bird text output format:
 *   @username · 2h
 *   Tweet content here...
 *   ❤️ 42  🔁 12  💬 5
 */
function parseBirdTextOutput(text) {
  const tweets = [];
  const blocks = text.split(/\n(?=@\w+\s+·)/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    const headerMatch = lines[0].match(/^@(\w+)\s+·\s+(.+)/);
    if (!headerMatch) continue;

    const username = headerMatch[1];
    const timeStr = headerMatch[2].trim();

    // Content is everything between header and stats line
    const contentLines = [];
    let likes = 0, retweets = 0;
    for (let i = 1; i < lines.length; i++) {
      const statsMatch = lines[i].match(/❤️\s*(\d+)\s*🔁\s*(\d+)/);
      if (statsMatch) {
        likes = parseInt(statsMatch[1], 10) || 0;
        retweets = parseInt(statsMatch[2], 10) || 0;
      } else {
        contentLines.push(lines[i]);
      }
    }

    tweets.push({
      username,
      text: contentLines.join('\n').trim(),
      created_at: timeStr,
      favorite_count: likes,
      retweet_count: retweets,
    });
  }

  return tweets;
}

/**
 * Read a single tweet's details via bird CLI.
 * @param {string} urlOrId - tweet URL or ID
 * @returns {Promise<object|null>}
 */
function birdRead(urlOrId) {
  return new Promise((resolve) => {
    execFile('bird', ['read', urlOrId, '--json'], {
      timeout: BIRD_TIMEOUT_MS,
    }, (err, stdout) => {
      if (err) return resolve(null);
      try {
        return resolve(JSON.parse((stdout || '').trim()));
      } catch {
        return resolve(null);
      }
    });
  });
}

// ── Normalize Results ───────────────────────────────────────────────────────

/**
 * Convert bird CLI tweet objects into normalized signal objects.
 * bird JSON format varies, so we handle multiple shapes.
 * @param {object[]} rawTweets
 * @returns {object[]} signal objects
 */
function normalizeTweets(rawTweets) {
  const signals = [];
  const seenUrls = new Set();

  for (const t of rawTweets) {
    // bird can return different field names depending on version
    const content = t.text || t.full_text || t.content || '';
    if (content.length < 10) continue;

    const username = t.username || t.screen_name || t.user?.screen_name || t.author || null;
    const tweetId = t.id || t.id_str || t.tweet_id || null;

    // Build canonical URL
    let tweetUrl = t.url || null;
    if (!tweetUrl && username && tweetId) {
      tweetUrl = `https://twitter.com/${username}/status/${tweetId}`;
    }
    if (!tweetUrl) tweetUrl = 'https://twitter.com/search';

    // Dedup
    if (seenUrls.has(tweetUrl)) continue;
    seenUrls.add(tweetUrl);

    // Parse timestamp
    let postedAt = null;
    const dateStr = t.created_at || t.posted_at || t.date || t.timestamp || null;
    if (dateStr) {
      try {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) postedAt = d.toISOString();
      } catch {}
    }

    // Engagement
    const likes = t.favorite_count || t.likes || t.like_count || 0;
    const retweets = t.retweet_count || t.retweets || 0;

    const title = content.length > 120 ? content.slice(0, 117) + '...' : content;

    signals.push({
      source: 'twitter',
      url: tweetUrl,
      title,
      body_text: content.slice(0, 5000),
      author: username,
      posted_at: postedAt,
      platform_score: likes + retweets * 2,
    });

    if (signals.length >= MAX_SIGNALS_PER_CYCLE) break;
  }

  return signals;
}

// ── Main Scan Function ──────────────────────────────────────────────────────

/**
 * Scan Twitter/X for pain signals via bird CLI.
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
    return { signals: [], nextCursor: cursor, errors: 0 };
  }

  const signals = [];
  let errors = 0;

  // Scan up to 2 queries per cycle
  const maxQueries = Math.min(queryIndex + 2, SEARCH_QUERIES.length);

  for (let i = queryIndex; i < maxQueries; i++) {
    const query = SEARCH_QUERIES[i];

    try {
      console.log(`[TwitterScanner] bird search: "${query.slice(0, 50)}..."`);
      const rawTweets = await birdSearch(query, 15);
      const normalized = normalizeTweets(rawTweets);
      signals.push(...normalized);
      console.log(`[TwitterScanner] Query "${query.slice(0, 50)}..." → ${normalized.length} signals`);
    } catch (err) {
      console.error(`[TwitterScanner] Error on query "${query.slice(0, 40)}...":`, err.message);
      errors++;
    }

    // Delay between queries
    if (i < maxQueries - 1) {
      await sleep(INTER_QUERY_DELAY_MS);
    }
  }

  // Trim to max signals
  const trimmed = signals.slice(0, MAX_SIGNALS_PER_CYCLE);

  // Build next cursor
  const nextIndex = Math.min(queryIndex + 2, SEARCH_QUERIES.length);
  const nextCursor = nextIndex < SEARCH_QUERIES.length
    ? JSON.stringify({ queryIndex: nextIndex, lastScanTs: now })
    : JSON.stringify({ queryIndex: 0, lastScanTs: now });

  console.log(`[TwitterScanner] Found ${trimmed.length} pain signals, ${errors} errors`);
  return { signals: trimmed, nextCursor, errors };
}

module.exports = { scan, SEARCH_QUERIES, birdSearch, birdRead };
