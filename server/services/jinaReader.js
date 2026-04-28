'use strict';

// ---------------------------------------------------------------------------
// Jina Reader — read any URL as clean markdown via https://r.jina.ai/
// Zero config, no API key, no rate limits. Use as Playwright fallback.
// ---------------------------------------------------------------------------

const TIMEOUT_MS = 20_000;

/**
 * Fetch a URL's content as clean markdown text via Jina Reader.
 * @param {string} url — any public URL
 * @returns {Promise<{title: string, content: string, url: string}>}
 */
async function fetchClean(url) {
  const jinaUrl = `https://r.jina.ai/${url}`;
  const resp = await fetch(jinaUrl, {
    headers: { 'Accept': 'text/plain' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!resp.ok) {
    throw new Error(`[JinaReader] Failed to fetch ${url}: ${resp.status}`);
  }
  const text = await resp.text();

  // Parse title from first "Title: ..." line if present
  const titleMatch = text.match(/^Title:\s*(.+)/m);
  const title = titleMatch ? titleMatch[1].trim() : url;

  return { title, content: text, url };
}

/**
 * Fetch with Playwright-style fallback pattern.
 * Tries primaryFn first; if it throws, falls back to Jina Reader.
 * @param {string} url
 * @param {Function} primaryFn — async (url) => content string
 * @returns {Promise<string>} — page content
 */
async function fetchWithFallback(url, primaryFn) {
  try {
    return await primaryFn(url);
  } catch (err) {
    console.warn(`[JinaReader] Primary fetch failed (${err.message}), falling back to Jina for ${url}`);
    const result = await fetchClean(url);
    return result.content;
  }
}

module.exports = { fetchClean, fetchWithFallback };
