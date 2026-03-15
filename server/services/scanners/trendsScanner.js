/**
 * @file trendsScanner.js
 * @description Google Trends RSS scanner — cross-references trending topics with
 *              software/automation keywords for opportunity signals.
 *
 * Pulls from Google Trends RSS (US), filters by software/tool overlap.
 * Rate: 1 scan per 6 hours (trends update slowly).
 * Cost: $0
 *
 * @exports { scan(cursor) -> { signals[], nextCursor, errors } }
 */

'use strict';

const TRENDS_RSS_URL = 'https://trends.google.com/trending/rss?geo=US';
const DAILY_TRENDS_RSS_URL = 'https://trends.google.com/trending/rss?geo=US&hours=24';

const MIN_SCAN_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const MAX_SIGNALS = 20;

const SOFTWARE_KEYWORDS = /\b(software|app|tool|automation|AI|artificial intelligence|construction|accounting|HOA|management|CRM|ERP|invoice|payroll|startup|SaaS|data|analytics|cloud|platform|API|workflow|productivity|tech|digital|cyber|fintech|proptech)\b/i;

// ── Fetch RSS text via native fetch ─────────────────────────────────────────

async function fetchRSS(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'ClawOps-OpportunityEngine/1.0 (Trends Scanner)' },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${url}`);
    }

    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ── Parse RSS items with regex (no xml2js) ──────────────────────────────────

function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim().replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : null;
}

function extractAllTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  const results = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    results.push(m[1].trim().replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim());
  }
  return results;
}

function parseItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];

    const title = extractTag(block, 'title');
    const link = extractTag(block, 'link');
    const description = extractTag(block, 'description');
    const pubDate = extractTag(block, 'pubDate');
    const approxTraffic = extractTag(block, 'ht:approx_traffic');

    // Extract nested news items from ht:news_item blocks
    const newsHeadlines = extractAllTag(block, 'ht:news_item_title');
    const newsUrls = extractAllTag(block, 'ht:news_item_url');

    // Extract related queries if present
    const relatedQueries = extractAllTag(block, 'ht:query');

    items.push({
      title: title || null,
      link: link || null,
      description: description || null,
      pubDate: pubDate || null,
      approxTraffic: approxTraffic || null,
      newsHeadlines,
      newsUrls,
      relatedQueries,
    });
  }

  return items;
}

// ── Traffic string to 0-100 score ───────────────────────────────────────────

function normalizeTraffic(trafficStr) {
  if (!trafficStr) return 10; // default low score for items without traffic data

  // Parse "200,000+" or "2,000,000+" style strings
  const cleaned = trafficStr.replace(/[,+\s]/g, '');
  const num = parseInt(cleaned, 10);
  if (isNaN(num) || num <= 0) return 10;

  // Log scale normalization: 1K=10, 10K=30, 100K=50, 500K=70, 1M+=85, 5M+=100
  if (num >= 5000000) return 100;
  if (num >= 1000000) return 85;
  if (num >= 500000) return 70;
  if (num >= 100000) return 50;
  if (num >= 10000) return 30;
  if (num >= 1000) return 10;
  return 5;
}

// ── Build body_text from available data ─────────────────────────────────────

function buildBodyText(item) {
  const parts = [];

  if (item.title) {
    parts.push(item.title);
  }

  if (item.description) {
    // Strip HTML tags from description
    const cleanDesc = item.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleanDesc && cleanDesc !== item.title) {
      parts.push(cleanDesc);
    }
  }

  if (item.relatedQueries.length > 0) {
    parts.push('Related: ' + item.relatedQueries.join(', '));
  }

  if (item.newsHeadlines.length > 0) {
    parts.push('News: ' + item.newsHeadlines.slice(0, 3).join(' | '));
  }

  return parts.join(' --- ').slice(0, 5000);
}

// ── Main scan function ──────────────────────────────────────────────────────

/**
 * Scan Google Trends RSS for software/automation-related trending topics.
 * @param {string|null} cursor - ISO timestamp of last scan (skip if < 6h ago)
 * @returns {{ signals: object[], nextCursor: string|null, errors: number }}
 */
async function scan(cursor) {
  // Respect 6-hour cooldown
  if (cursor) {
    try {
      const lastScan = new Date(cursor).getTime();
      if (!isNaN(lastScan) && (Date.now() - lastScan) < MIN_SCAN_INTERVAL_MS) {
        const hoursLeft = ((MIN_SCAN_INTERVAL_MS - (Date.now() - lastScan)) / 3600000).toFixed(1);
        console.log(`[TrendsScanner] Skipping — last scan was ${hoursLeft}h ago (min interval: 6h)`);
        return { signals: [], nextCursor: cursor, errors: 0 };
      }
    } catch {}
  }

  const signals = [];
  let errors = 0;
  const seenTitles = new Set();

  // Fetch from both RSS feeds
  const feeds = [
    { url: TRENDS_RSS_URL, label: 'realtime' },
    { url: DAILY_TRENDS_RSS_URL, label: 'daily' },
  ];

  for (const feed of feeds) {
    try {
      console.log(`[TrendsScanner] Fetching ${feed.label} trends from ${feed.url}...`);
      const xml = await fetchRSS(feed.url);

      if (!xml || xml.length < 100) {
        console.warn(`[TrendsScanner] Empty or too-short response from ${feed.label} feed`);
        errors++;
        continue;
      }

      const items = parseItems(xml);
      console.log(`[TrendsScanner] Parsed ${items.length} items from ${feed.label} feed`);

      for (const item of items) {
        if (!item.title) continue;

        // Dedup across feeds
        const titleKey = item.title.toLowerCase().trim();
        if (seenTitles.has(titleKey)) continue;
        seenTitles.add(titleKey);

        // Build full text for keyword matching
        const fullText = [
          item.title,
          item.description || '',
          ...item.relatedQueries,
          ...item.newsHeadlines,
        ].join(' ');

        // Filter: must overlap with software/automation keywords
        if (!SOFTWARE_KEYWORDS.test(fullText)) continue;

        // Parse pubDate
        let postedAt = null;
        if (item.pubDate) {
          const d = new Date(item.pubDate);
          if (!isNaN(d.getTime())) postedAt = d.toISOString();
        }

        signals.push({
          source: 'trends',
          url: item.link || `https://trends.google.com/trends/explore?q=${encodeURIComponent(item.title)}&geo=US`,
          title: item.title.slice(0, 500),
          body_text: buildBodyText(item),
          author: 'google_trends',
          posted_at: postedAt,
          platform_score: normalizeTraffic(item.approxTraffic),
        });

        if (signals.length >= MAX_SIGNALS) break;
      }
    } catch (err) {
      console.error(`[TrendsScanner] Error fetching ${feed.label} feed:`, err.message);
      errors++;
    }

    if (signals.length >= MAX_SIGNALS) break;
  }

  // Sort by platform_score descending — highest traffic first
  signals.sort((a, b) => b.platform_score - a.platform_score);

  // Trim to max
  const trimmed = signals.slice(0, MAX_SIGNALS);

  const nextCursor = new Date().toISOString();

  console.log(`[TrendsScanner] Found ${trimmed.length} software/automation-related trends, ${errors} errors`);
  return { signals: trimmed, nextCursor, errors };
}

module.exports = { scan, SOFTWARE_KEYWORDS, TRENDS_RSS_URL, DAILY_TRENDS_RSS_URL };
