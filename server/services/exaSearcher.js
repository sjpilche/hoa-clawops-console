'use strict';

const { exec } = require('child_process');

// ---------------------------------------------------------------------------
// Exa Search via mcporter — semantic web search (free, no API key needed)
// Returns results in the same shape as Brave: [{ title, url, description }]
// ---------------------------------------------------------------------------

const TIMEOUT_MS = 30_000;
const RATE_LIMIT_MS = 1_000; // Exa has no hard limit, but be polite

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Run an Exa semantic web search via mcporter CLI.
 * @param {string} query — natural language search query
 * @param {number} count — max results (default 10)
 * @returns {Promise<Array<{title: string, url: string, description: string}>>}
 */
async function exaSearch(query, count = 10) {
  const call = `exa.web_search_exa(query: "${query.replace(/"/g, '\\"')}", numResults: ${count})`;
  const raw = await runMcporter(call);
  return parseExaResults(raw);
}

/**
 * Run an Exa code context search — finds code-relevant content.
 * @param {string} query
 * @param {number} tokens — max tokens of context (default 3000)
 * @returns {Promise<Array<{title: string, url: string, description: string}>>}
 */
async function exaCodeSearch(query, tokens = 3000) {
  const call = `exa.get_code_context_exa(query: "${query.replace(/"/g, '\\"')}", tokensNum: ${tokens})`;
  const raw = await runMcporter(call);
  return parseExaResults(raw);
}

/**
 * Run a site-scoped Exa search (e.g. "site:reddit.com construction CFO pain points").
 * @param {string} query
 * @param {string} site — domain to scope to (e.g. "reddit.com", "x.com")
 * @param {number} count
 * @returns {Promise<Array<{title: string, url: string, description: string}>>}
 */
async function exaSiteSearch(query, site, count = 10) {
  return exaSearch(`site:${site} ${query}`, count);
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function runMcporter(callExpr) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('[Exa] mcporter call timed out')), TIMEOUT_MS);
    // Use exec with shell so mcporter resolves via PATH (npm global bin)
    // Note: Windows shell uses double quotes; the callExpr already uses double quotes
    // for string values, so we wrap the outer command in single-tick for bash or leave unquoted
    const cmd = process.platform === 'win32'
      ? `mcporter call "${callExpr.replace(/"/g, '\\"')}"`
      : `mcporter call '${callExpr}'`;
    exec(cmd, { timeout: TIMEOUT_MS, shell: true }, (err, stdout, stderr) => {
      clearTimeout(timer);
      if (err) {
        console.error(`[Exa] mcporter error: ${err.message}`);
        if (stderr) console.error(`[Exa] stderr: ${stderr}`);
        return resolve(''); // Graceful degradation — return empty
      }
      resolve(stdout);
    });
  });
}

/**
 * Parse mcporter's Exa output into Brave-compatible result objects.
 * Exa output format (per result block):
 *   Title: ...
 *   URL: ...
 *   Published: ...
 *   Author: ...
 *   Highlights: ...
 */
function parseExaResults(raw) {
  if (!raw || !raw.trim()) return [];

  const results = [];
  const blocks = raw.split(/\n---\n/).filter(b => b.trim());

  for (const block of blocks) {
    const titleMatch = block.match(/^Title:\s*(.+)/m);
    const urlMatch = block.match(/^URL:\s*(.+)/m);
    const highlightsMatch = block.match(/^Highlights:\s*([\s\S]*?)$/m);

    if (!urlMatch) continue;

    const url = urlMatch[1].trim();
    const title = titleMatch ? titleMatch[1].trim() : '';
    const description = highlightsMatch
      ? highlightsMatch[1].trim().slice(0, 500)
      : title;

    // Quality gates — skip results that are too thin to be useful
    if (!url.startsWith('http')) continue;           // must be a real URL
    if (title.length < 8) continue;                  // empty/stub titles
    if (description.length < 30) continue;           // single-word highlights are noise

    results.push({ title, url, description });
  }

  return results;
}

/**
 * Batch search — runs multiple queries with rate limiting.
 * Returns flat array of all results, deduped by URL.
 * @param {string[]} queries
 * @param {number} countPerQuery
 * @returns {Promise<Array<{title: string, url: string, description: string}>>}
 */
async function exaBatchSearch(queries, countPerQuery = 5) {
  const allResults = [];
  const seenUrls = new Set();

  for (const query of queries) {
    try {
      const results = await exaSearch(query, countPerQuery);
      for (const r of results) {
        if (!seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          allResults.push(r);
        }
      }
      console.log(`[Exa] "${query.slice(0, 60)}..." → ${results.length} results`);
    } catch (err) {
      console.error(`[Exa] Batch query failed: ${err.message}`);
    }
    await sleep(RATE_LIMIT_MS);
  }

  return allResults;
}

module.exports = {
  exaSearch,
  exaCodeSearch,
  exaSiteSearch,
  exaBatchSearch,
  parseExaResults,
};
