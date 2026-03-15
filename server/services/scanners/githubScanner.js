/**
 * @file githubScanner.js
 * @description GitHub REST API scanner — searches for pain signals in issues and repos.
 *
 * Scans for: "help wanted" issues, frustration/wish posts, trending automation/SaaS repos.
 * Rate limit: 1 request per 2 seconds (10/min unauthenticated, 30/min with GITHUB_TOKEN).
 * Cost: $0
 *
 * @exports { scan(cursor) → { signals[], nextCursor, errors } }
 */

'use strict';

// ── Search queries ──────────────────────────────────────────────────────────

const SEARCH_QUERIES = [
  { q: 'is:issue label:"help wanted" state:open sort:updated', label: 'help-wanted' },
  { q: 'is:issue "frustrated with" OR "wish there was" OR "looking for alternative" state:open sort:updated', label: 'pain-signals' },
  { q: 'is:issue "anyone know" OR "recommendation" OR "tired of" state:open sort:updated', label: 'seeking-solutions' },
  { q: 'topic:automation stars:>50 pushed:>2025-01-01 sort:stars', label: 'trending-automation', type: 'repositories' },
  { q: 'topic:saas stars:>50 pushed:>2025-01-01 sort:stars', label: 'trending-saas', type: 'repositories' },
  { q: '"seeking maintainers" OR "looking for maintainers" OR "help needed"', label: 'seeking-maintainers', type: 'repositories' },
];

const MAX_SIGNALS_PER_SCAN = 50;
const RATE_LIMIT_MS = 2000;
const REQUEST_TIMEOUT_MS = 15000;

// ── HTTP fetch helper ───────────────────────────────────────────────────────

async function githubFetch(url) {
  const headers = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'ClawOps-OpportunityEngine/1.0 (Signal Scanner)',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, { headers, signal: controller.signal });

    if (res.status === 403) {
      const remaining = res.headers.get('x-ratelimit-remaining');
      const resetAt = res.headers.get('x-ratelimit-reset');
      if (remaining === '0') {
        const resetDate = resetAt ? new Date(parseInt(resetAt) * 1000).toISOString() : 'unknown';
        throw new Error(`GitHub rate limit exceeded — resets at ${resetDate}`);
      }
      throw new Error(`GitHub 403 Forbidden: ${(await res.text()).slice(0, 200)}`);
    }

    if (!res.ok) {
      throw new Error(`GitHub API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }

    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Signal extraction ───────────────────────────────────────────────────────

function issueToSignal(item) {
  const reactions = item.reactions || {};
  const reactionTotal = (reactions.total_count || 0)
    + (reactions['+1'] || 0) * 2
    + (reactions['heart'] || 0) * 2;

  return {
    source: 'github_issue',
    url: item.html_url,
    title: (item.title || '').slice(0, 500),
    body_text: (item.body || '').slice(0, 5000),
    author: item.user?.login || null,
    posted_at: item.created_at || null,
    platform_score: reactionTotal + (item.comments || 0),
  };
}

function repoToSignal(item) {
  return {
    source: 'github_repo',
    url: item.html_url,
    title: (item.full_name || item.name || '').slice(0, 500),
    body_text: (item.description || '').slice(0, 5000),
    author: item.owner?.login || null,
    posted_at: item.created_at || null,
    platform_score: (item.stargazers_count || 0) + (item.forks_count || 0),
  };
}

// ── Main scan function ──────────────────────────────────────────────────────

/**
 * Scan GitHub for pain signals via the Search API.
 * @param {string|null} cursor - JSON: { queryIndex, page } for pagination
 * @returns {{ signals: object[], nextCursor: string|null, errors: number }}
 */
async function scan(cursor) {
  let startQuery = 0;
  let page = 1;

  if (cursor) {
    try {
      const c = JSON.parse(cursor);
      startQuery = c.queryIndex || 0;
      page = c.page || 1;
    } catch {}
  }

  const signals = [];
  let errors = 0;
  let lastQuery = startQuery;
  let lastPage = page;
  let hasMorePages = false;

  // Run up to 3 queries per scan cycle to respect rate limits
  const maxQueries = Math.min(startQuery + 3, SEARCH_QUERIES.length);

  for (let i = startQuery; i < maxQueries; i++) {
    if (signals.length >= MAX_SIGNALS_PER_SCAN) break;

    const query = SEARCH_QUERIES[i];
    const currentPage = (i === startQuery) ? page : 1;
    const isRepoSearch = query.type === 'repositories';
    const searchType = isRepoSearch ? 'repositories' : 'issues';
    const perPage = Math.min(30, MAX_SIGNALS_PER_SCAN - signals.length);

    const url = `https://api.github.com/search/${searchType}?q=${encodeURIComponent(query.q)}&per_page=${perPage}&page=${currentPage}`;

    try {
      console.log(`[GitHubScanner] Fetching "${query.label}" (page ${currentPage})...`);
      const data = await githubFetch(url);

      if (!data?.items || !Array.isArray(data.items)) {
        console.warn(`[GitHubScanner] No items from "${query.label}"`);
        errors++;
        await sleep(RATE_LIMIT_MS);
        continue;
      }

      console.log(`[GitHubScanner] "${query.label}" returned ${data.items.length} items (total: ${data.total_count})`);

      for (const item of data.items) {
        if (signals.length >= MAX_SIGNALS_PER_SCAN) break;

        const signal = isRepoSearch ? repoToSignal(item) : issueToSignal(item);
        signals.push(signal);
      }

      lastQuery = i;
      lastPage = currentPage;
      hasMorePages = data.items.length === perPage && (data.total_count || 0) > currentPage * perPage;
    } catch (err) {
      console.error(`[GitHubScanner] Error on "${query.label}":`, err.message);
      errors++;

      // If rate limited, stop scanning — no point burning more requests
      if (err.message.includes('rate limit')) {
        console.warn(`[GitHubScanner] Rate limited — stopping scan early`);
        break;
      }
    }

    // Rate limit: 2s between requests
    await sleep(RATE_LIMIT_MS);
  }

  // Build next cursor
  let nextCursor = null;

  if (signals.length >= MAX_SIGNALS_PER_SCAN && hasMorePages) {
    // Hit signal cap mid-query — resume same query on next page
    nextCursor = JSON.stringify({ queryIndex: lastQuery, page: lastPage + 1 });
  } else if (lastQuery + 1 < SEARCH_QUERIES.length) {
    // More queries to run
    nextCursor = JSON.stringify({ queryIndex: lastQuery + 1, page: 1 });
  }
  // If all queries exhausted, nextCursor stays null (full cycle complete)

  console.log(`[GitHubScanner] Found ${signals.length} signals, ${errors} errors`);
  return { signals, nextCursor, errors };
}

module.exports = { scan, SEARCH_QUERIES, MAX_SIGNALS_PER_SCAN };
