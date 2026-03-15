/**
 * @file phScanner.js
 * @description Product Hunt scanner — RSS feed + discussion scraping.
 *
 * Parses PH RSS for new launches in relevant categories.
 * High comment counts = unmet demand in adjacent space.
 * Cost: $0
 *
 * @exports { scan(cursor) → { signals[], nextCursor, errors } }
 */

'use strict';

const https = require('https');

// PH categories that map to Steve's verticals + general SaaS opportunities
const RELEVANT_CATEGORIES = /\b(saas|tool|automation|productivity|developer|finance|accounting|construction|crm|analytics|ai|workflow|project management|invoicing|scheduling|reporting)\b/i;

const USER_AGENT = 'ClawOps-OpportunityEngine/1.0';

function fetchText(url, timeoutMs = 10000) {
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
      res.on('end', () => resolve(data));
    });

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(new Error('PH request timed out')); });
    req.end();
  });
}

/**
 * Minimal XML/RSS tag parser — no dependencies needed.
 * Extracts items from RSS feed with title, link, description, pubDate.
 */
function parseRssItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const extract = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\\/${tag}>`, 's'));
      return m ? m[1].trim() : null;
    };

    items.push({
      title: extract('title'),
      link: extract('link'),
      description: extract('description'),
      pubDate: extract('pubDate'),
    });
  }

  return items;
}

/**
 * Scan Product Hunt RSS feed for new launches.
 * @param {string|null} cursor - Not used for RSS (always fetches latest)
 * @returns {{ signals: object[], nextCursor: string|null, errors: number }}
 */
async function scan(cursor) {
  const signals = [];
  let errors = 0;

  // PH main feed
  const feeds = [
    'https://www.producthunt.com/feed',
    'https://www.producthunt.com/feed?category=developer-tools',
    'https://www.producthunt.com/feed?category=productivity',
  ];

  const seenUrls = new Set();

  for (const feedUrl of feeds) {
    try {
      console.log(`[PHScanner] Fetching ${feedUrl}...`);
      const xml = await fetchText(feedUrl);
      const items = parseRssItems(xml);

      for (const item of items) {
        if (!item.link || seenUrls.has(item.link)) continue;
        seenUrls.add(item.link);

        const fullText = (item.title || '') + ' ' + (item.description || '');

        // Check relevance to our categories
        if (!RELEVANT_CATEGORIES.test(fullText)) continue;

        // PH launches themselves are market signals — competitors tell us what's hot
        signals.push({
          url: item.link,
          title: (item.title || '').slice(0, 500),
          body_text: (item.description || '').replace(/<[^>]+>/g, '').slice(0, 5000),
          author: null,
          posted_at: item.pubDate ? new Date(item.pubDate).toISOString() : null,
          platform_score: 0, // RSS doesn't include vote counts
        });
      }
    } catch (err) {
      console.error(`[PHScanner] Error on ${feedUrl}:`, err.message);
      errors++;
    }
  }

  // Also scan PH discussions page for "wish this existed" type content
  try {
    console.log('[PHScanner] Scanning PH discussions...');
    const html = await fetchText('https://www.producthunt.com/discussions');

    // Extract discussion links and titles from HTML (simple regex extraction)
    const discussionRegex = /href="(\/discussions\/[^"]+)"[^>]*>([^<]+)/g;
    let dMatch;
    while ((dMatch = discussionRegex.exec(html)) !== null) {
      const path = dMatch[1];
      const title = dMatch[2].trim();

      if (/\b(wish|need|looking for|alternative|frustrated|anyone built|recommend)\b/i.test(title)) {
        const url = `https://www.producthunt.com${path}`;
        if (!seenUrls.has(url)) {
          seenUrls.add(url);
          signals.push({
            url,
            title: title.slice(0, 500),
            body_text: title, // Discussion titles are often the full question
            author: null,
            posted_at: null,
            platform_score: 5, // Boost discussions — they're explicit asks
          });
        }
      }
    }
  } catch (err) {
    console.error('[PHScanner] Discussion scan error:', err.message);
    errors++;
  }

  console.log(`[PHScanner] Found ${signals.length} signals, ${errors} errors`);
  return { signals, nextCursor: null, errors };
}

module.exports = { scan, RELEVANT_CATEGORIES };
