/**
 * @file rssFeedMonitor.js
 * @description RSS/Atom feed monitor for construction, HOA, and DC Intel signals.
 *
 * Polls curated feeds daily, scores items by keyword relevance, and feeds
 * high-relevance items into the brain observe() pattern and Discord alerts.
 *
 * Uses: feedparser (Python, via Agent-Reach) or built-in XML parsing.
 * Cost: $0
 */

'use strict';

const { execFile } = require('child_process');

// ── Feed Registry ───────────────────────────────────────────────────────────

const FEEDS = {
  // DC Intel
  'dc-datacenterknowledge': {
    url: 'https://www.datacenterknowledge.com/rss.xml',
    category: 'dc_intel',
    label: 'Data Center Knowledge',
  },
  'dc-datacenterdynamics': {
    url: 'https://www.datacenterdynamics.com/en/rss/',
    category: 'dc_intel',
    label: 'DatacenterDynamics',
  },
  'dc-utilitydive': {
    url: 'https://www.utilitydive.com/feeds/news/',
    category: 'dc_intel',
    label: 'Utility Dive',
  },

  // Construction / Jake
  'cx-constructiondive': {
    url: 'https://www.constructiondive.com/feeds/news/',
    category: 'construction',
    label: 'Construction Dive',
  },
  'cx-enr': {
    url: 'https://www.enr.com/rss/all',
    category: 'construction',
    label: 'ENR (Engineering News-Record)',
  },

  // HOA / Real Estate
  'hoa-cai': {
    url: 'https://www.caionline.org/feed/',
    category: 'hoa',
    label: 'CAI (Community Associations Institute)',
  },
};

// ── Keyword Scoring ─────────────────────────────────────────────────────────

// Specific terms that strongly indicate relevance — at least 1 required to pass.
// Prevents broad false positives ("defense contractor" scoring as construction CFO content).
const ANCHOR_KEYWORDS = {
  dc_intel: [
    'data center', 'hyperscale', 'megawatt', ' MW ', 'transformer', 'substation',
    'power capacity', 'land acquisition', 'site selection', 'rezoning',
    'Loudoun', 'Ashburn', 'Prince William', 'Cook County', 'Will County', 'DuPage',
    'Equinix', 'Digital Realty', 'Vantage', 'QTS', 'CyrusOne', 'CoreWeave',
  ],
  construction: [
    'construction software', 'construction CFO', 'construction accounting',
    'construction financial', 'contractor accounting', 'contractor software',
    'subcontractor management', 'project cost management', 'construction ERP',
    'bonding capacity', 'surety bond',
  ],
  hoa: [
    'reserve fund', 'special assessment', 'capital improvement',
    'reserve study', 'HOA loan', 'homeowners association', 'condo association',
    'SB-326', 'SIRS', 'balcony inspection', 'structural inspection',
  ],
};

// Broad supporting terms — contribute to score but cannot pass alone.
const SUPPORTING_KEYWORDS = {
  dc_intel: ['Amazon', 'Microsoft', 'Google', 'Meta', 'Oracle', 'Northern Virginia'],
  construction: ['CFO', 'controller', 'accounting', 'contractor', 'bonding', 'surety'],
  hoa: ['property manager', 'management company', 'roof replacement', 'waterproofing'],
};

/**
 * Score a feed item's relevance to its category.
 * Requires at least 1 anchor keyword — no anchor = score 0 regardless of supporting matches.
 * @param {string} text — title + description
 * @param {string} category
 * @returns {{ score: number, matches: string[] }}
 */
function scoreItem(text, category) {
  const anchors = ANCHOR_KEYWORDS[category] || [];
  const supporting = SUPPORTING_KEYWORDS[category] || [];
  const lower = text.toLowerCase();

  const anchorMatches = anchors.filter(kw => lower.includes(kw.toLowerCase()));
  const supportingMatches = supporting.filter(kw => lower.includes(kw.toLowerCase()));

  // Must have at least 1 anchor — no anchor = not relevant
  if (anchorMatches.length === 0) return { score: 0, matches: [] };

  // Anchors worth 0.5 each, supporting worth 0.2 each, capped at 1.0
  const score = Math.min(anchorMatches.length * 0.5 + supportingMatches.length * 0.2, 1.0);
  return { score, matches: [...anchorMatches, ...supportingMatches] };
}

// ── Feed Fetching ───────────────────────────────────────────────────────────

/**
 * Fetch and parse an RSS/Atom feed using Python feedparser via shell.
 * @param {string} feedUrl
 * @param {number} maxItems — max entries to return
 * @returns {Promise<object[]>} array of { title, link, summary, published }
 */
function fetchFeed(feedUrl, maxItems = 20) {
  const script = `
import feedparser, json, sys
f = feedparser.parse('${feedUrl.replace(/'/g, "\\'")}')
items = []
for e in f.entries[:${maxItems}]:
    items.append({
        'title': getattr(e, 'title', ''),
        'link': getattr(e, 'link', ''),
        'summary': getattr(e, 'summary', getattr(e, 'description', '')),
        'published': getattr(e, 'published', getattr(e, 'updated', '')),
    })
print(json.dumps(items))
`;

  return new Promise((resolve) => {
    execFile('python', ['-c', script], { timeout: 30_000 }, (err, stdout) => {
      if (err) {
        console.error(`[RSSMonitor] Feed fetch error (${feedUrl}): ${err.message}`);
        return resolve([]);
      }
      try {
        return resolve(JSON.parse((stdout || '').trim()));
      } catch {
        console.warn(`[RSSMonitor] Feed parse error (${feedUrl})`);
        return resolve([]);
      }
    });
  });
}

// ── State Management ────────────────────────────────────────────────────────

// In-memory last-seen tracker (resets on server restart — acceptable for daily polling)
const lastSeen = new Map();

/**
 * Filter feed items to only new ones (not seen before).
 * @param {string} feedKey
 * @param {object[]} items
 * @returns {object[]} new items only
 */
function filterNew(feedKey, items) {
  const prev = lastSeen.get(feedKey) || new Set();
  const newItems = items.filter(item => {
    const key = item.link || item.title;
    return !prev.has(key);
  });

  // Update seen set
  const updated = new Set();
  for (const item of items) {
    updated.add(item.link || item.title);
  }
  lastSeen.set(feedKey, updated);

  return newItems;
}

// ── Main Scan Function ──────────────────────────────────────────────────────

/**
 * Poll all registered feeds and return scored, new items.
 * @param {object} options
 * @param {string[]} [options.categories] — filter to specific categories (default: all)
 * @param {number} [options.minScore] — minimum relevance score (default: 0.3)
 * @returns {Promise<object[]>} scored feed items
 */
async function scanFeeds(options = {}) {
  const { categories = null, minScore = 0.3 } = options;

  const results = [];

  for (const [feedKey, feed] of Object.entries(FEEDS)) {
    // Category filter
    if (categories && !categories.includes(feed.category)) continue;

    console.log(`[RSSMonitor] Polling: ${feed.label} (${feed.category})`);

    const items = await fetchFeed(feed.url);
    if (items.length === 0) {
      console.log(`[RSSMonitor] No items from ${feed.label}`);
      continue;
    }

    const newItems = filterNew(feedKey, items);
    console.log(`[RSSMonitor] ${feed.label}: ${items.length} total, ${newItems.length} new`);

    for (const item of newItems) {
      const text = `${item.title || ''} ${item.summary || ''}`;
      const { score, matches } = scoreItem(text, feed.category);

      if (score < minScore) continue;

      results.push({
        feedKey,
        category: feed.category,
        label: feed.label,
        title: item.title,
        link: item.link,
        summary: (item.summary || '').replace(/<[^>]+>/g, '').slice(0, 500),
        published: item.published,
        relevanceScore: score,
        keywordMatches: matches,
      });
    }

    // Rate limit between feeds
    await new Promise(r => setTimeout(r, 1000));
  }

  // Sort by relevance score descending
  results.sort((a, b) => b.relevanceScore - a.relevanceScore);

  console.log(`[RSSMonitor] Scan complete: ${results.length} relevant items across ${Object.keys(FEEDS).length} feeds`);
  return results;
}

/**
 * Format RSS results as a Discord-ready digest message.
 * @param {object[]} items — scored feed items from scanFeeds()
 * @returns {string} formatted message
 */
function formatDigest(items) {
  if (items.length === 0) return '📡 RSS Monitor: No new relevant items today.';

  const byCategory = {};
  for (const item of items) {
    if (!byCategory[item.category]) byCategory[item.category] = [];
    byCategory[item.category].push(item);
  }

  const categoryLabels = {
    dc_intel: '⚡ DC Intel',
    construction: '🏗️ Construction',
    hoa: '🏘️ HOA',
  };

  const sections = [];
  for (const [cat, catItems] of Object.entries(byCategory)) {
    const header = categoryLabels[cat] || cat;
    const lines = catItems.slice(0, 5).map(item =>
      `• **${item.title}** (${item.label})\n  ${item.link}\n  Keywords: ${item.keywordMatches.join(', ')}`
    );
    sections.push(`### ${header}\n${lines.join('\n')}`);
  }

  return `📡 **RSS Feed Digest** — ${items.length} relevant items\n\n${sections.join('\n\n')}`;
}

module.exports = {
  scanFeeds,
  formatDigest,
  fetchFeed,
  scoreItem,
  FEEDS,
};
