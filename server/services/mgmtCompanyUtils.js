/**
 * @file mgmtCompanyUtils.js
 * @description Shared utilities for Management Company Research Agents (36-40)
 *
 * Pure JS helpers — no LLM calls, $0 cost.
 * Used by: mgmtCaiScraper, mgmtPortfolioScraper, mgmtContactPuller,
 *          mgmtPortfolioMapper, mgmtReviewScanner
 */

const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════
// SIGNAL KEYWORDS (loaded once)
// ═══════════════════════════════════════════════════════════════════════════

let SIGNAL_KEYWORDS = null;

function getSignalKeywords() {
  if (SIGNAL_KEYWORDS) return SIGNAL_KEYWORDS;
  try {
    const raw = fs.readFileSync(
      path.resolve(__dirname, '../../config/review-signal-keywords.json'),
      'utf-8'
    );
    SIGNAL_KEYWORDS = JSON.parse(raw);
  } catch (e) {
    console.warn('[mgmtUtils] Could not load review-signal-keywords.json, using empty defaults');
    SIGNAL_KEYWORDS = {
      tier1: { points_per_hit: 5, keywords: [] },
      tier2: { points_per_hit: 4, keywords: [] },
      tier3: { points_per_hit: 3, keywords: [] },
      tier4: { points_per_hit: 1, keywords: [] },
      switching_signals: { keywords: [] },
    };
  }
  return SIGNAL_KEYWORDS;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTACT TYPE CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Classify a job title into a contact category.
 * @param {string} title - Job title
 * @returns {string} contact type
 */
function classifyContactType(title) {
  if (!title) return 'general';
  const t = title.toLowerCase();
  if (t.includes('ceo') || t.includes('president') || t.includes('coo') || t.includes('cfo')) return 'c_suite';
  if (t.includes('vendor') || t.includes('procurement') || t.includes('supplier')) return 'vendor_relations';
  if (t.includes('business development') || t.includes('partnership')) return 'biz_dev';
  if (t.includes('operations') || t.includes('client services')) return 'operations';
  if (t.includes('regional') || t.includes('branch') || t.includes('district')) return 'branch_manager';
  if (t.includes('community manager') || t.includes('property manager') || t.includes('portfolio manager')) return 'community_manager';
  return 'general';
}

// ═══════════════════════════════════════════════════════════════════════════
// PRIORITY TIER CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Determine priority tier from CAI designations.
 * @param {Object} company - { cai_designations: [], designated_employees: [] }
 * @returns {string} AAMC_TOP | DESIGNATED | MEMBER | UNKNOWN
 */
function determinePriorityTier(company) {
  const designations = company.cai_designations || [];
  if (designations.includes('AAMC')) return 'AAMC_TOP';
  if (designations.length > 0) return 'DESIGNATED';

  const employees = company.designated_employees || [];
  if (employees.some(e => (e.designations || []).length > 0)) return 'DESIGNATED';

  return 'MEMBER';
}

// ═══════════════════════════════════════════════════════════════════════════
// REVIEW SIGNAL SCORING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Score a review text against signal keywords.
 * @param {string} reviewText - Full review text
 * @returns {{ tier1: string[], tier2: string[], tier3: string[], tier4: string[], switching: string[], signal_score: number }}
 */
function scoreReviewSignals(reviewText) {
  const kw = getSignalKeywords();
  const text = (reviewText || '').toLowerCase();

  const tier1Hits = matchKeywords(text, kw.tier1?.keywords || []);
  const tier2Hits = matchKeywords(text, kw.tier2?.keywords || []);
  const tier3Hits = matchKeywords(text, kw.tier3?.keywords || []);
  const tier4Hits = matchKeywords(text, kw.tier4?.keywords || []);
  const switchingHits = matchKeywords(text, kw.switching_signals?.keywords || []);

  const score =
    tier1Hits.length * (kw.tier1?.points_per_hit || 5) +
    tier2Hits.length * (kw.tier2?.points_per_hit || 4) +
    tier3Hits.length * (kw.tier3?.points_per_hit || 3) +
    tier4Hits.length * (kw.tier4?.points_per_hit || 1);

  return {
    tier1: tier1Hits,
    tier2: tier2Hits,
    tier3: tier3Hits,
    tier4: tier4Hits,
    switching: switchingHits,
    signal_score: score,
  };
}

/**
 * Match keywords in text. Returns array of matched keywords.
 */
function matchKeywords(text, keywords) {
  const hits = [];
  for (const kw of keywords) {
    // Word boundary match for multi-word keywords; indexOf for single words
    if (kw.includes(' ')) {
      if (text.includes(kw.toLowerCase())) {
        hits.push(kw);
      }
    } else {
      // Use word boundary regex for single words to avoid false positives
      const regex = new RegExp(`\\b${escapeRegex(kw.toLowerCase())}\\b`);
      if (regex.test(text)) {
        hits.push(kw);
      }
    }
  }
  return hits;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMUNITY NAME EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Try to extract community/HOA names from review text.
 * Looks for patterns like "at X HOA", "X Condos", "X Estates", etc.
 * @param {string} text
 * @returns {string[]}
 */
function extractCommunityMentions(text) {
  if (!text) return [];

  const patterns = [
    /(?:at|in|of)\s+([A-Z][A-Za-z\s]+(?:HOA|Homeowners|Association|Condo(?:s|minium)?|Estates?|Villas?|Village|Landing|Pointe?|Terrace|Manor|Park|Place|Club|Lakes?|Creek|Springs?|Harbor|Bay|Shores?|Heights?|Ridge|Woods?|Oaks?))/gi,
    /([A-Z][A-Za-z\s]+(?:HOA|Homeowners Association))\b/g,
  ];

  const mentions = new Set();
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1].trim();
      if (name.length > 3 && name.length < 80) {
        mentions.add(name);
      }
    }
  }

  return [...mentions];
}

// ═══════════════════════════════════════════════════════════════════════════
// ADDRESS PARSING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract city, state, zip from an address string.
 * @param {string} text
 * @returns {{ city: string|null, state: string|null, zip: string|null }}
 */
function parseAddress(text) {
  if (!text) return { city: null, state: null, zip: null };

  // Pattern: City, ST 12345
  const match = text.match(/([A-Za-z\s]+),\s*([A-Z]{2})\s*(\d{5})?/);
  if (match) {
    return {
      city: match[1].trim(),
      state: match[2],
      zip: match[3] || null,
    };
  }

  return { city: null, state: null, zip: null };
}

// ═══════════════════════════════════════════════════════════════════════════
// URGENCY CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Classify review urgency based on signal analysis.
 * @param {{ tier1: string[], tier2: string[], tier3: string[], signal_score: number }} signals
 * @param {number} starRating
 * @returns {string} critical | high | medium | low
 */
function classifyUrgency(signals, starRating) {
  // Critical: safety issues + financial distress
  if (signals.tier1.length >= 2 && signals.tier2.length >= 1 && starRating <= 2) return 'critical';
  if (signals.tier1.length >= 3) return 'critical';

  // High: major deferred maintenance or financial distress
  if (signals.tier1.length >= 1 && signals.tier2.length >= 1) return 'high';
  if (signals.signal_score >= 15) return 'high';

  // Medium: management failure or moderate signals
  if (signals.tier3.length >= 2) return 'medium';
  if (signals.signal_score >= 8) return 'medium';

  return 'low';
}

/**
 * Determine primary issue from signal hits.
 * @param {{ tier1: string[], tier2: string[], tier3: string[] }} signals
 * @returns {string}
 */
function determinePrimaryIssue(signals) {
  if (signals.tier1.length > 0) {
    const first = signals.tier1[0].toLowerCase();
    if (first.includes('roof') || first.includes('leak')) return 'roof_leak';
    if (first.includes('mold') || first.includes('water')) return 'water_damage';
    if (first.includes('elevator')) return 'elevator';
    if (first.includes('pool')) return 'pool';
    if (first.includes('concrete') || first.includes('sidewalk')) return 'concrete';
    if (first.includes('plumbing') || first.includes('pipe') || first.includes('sewer')) return 'plumbing';
    if (first.includes('fire')) return 'fire_safety';
    if (first.includes('structural') || first.includes('foundation')) return 'structural';
    if (first.includes('balcony') || first.includes('railing')) return 'balcony';
    if (first.includes('hvac') || first.includes('ac') || first.includes('heating')) return 'hvac';
    return 'deferred_maintenance';
  }
  if (signals.tier2.length > 0) return 'financial_distress';
  if (signals.tier3.length > 0) return 'management_failure';
  return 'general_negative';
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sleep helper for rate limiting.
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Determine company health from review data.
 * @param {{ google_rating: number, bbb_rating: string, switching_signals: number }} data
 * @returns {string} healthy | concerning | deteriorating | critical
 */
function classifyCompanyHealth(data) {
  let score = 0;
  if (data.google_rating && data.google_rating < 3.0) score += 2;
  else if (data.google_rating && data.google_rating < 3.5) score += 1;

  if (data.bbb_rating && ['D', 'D+', 'D-', 'F'].includes(data.bbb_rating)) score += 2;
  else if (data.bbb_rating && ['C', 'C+', 'C-'].includes(data.bbb_rating)) score += 1;

  if (data.switching_signals >= 3) score += 2;
  else if (data.switching_signals >= 1) score += 1;

  if (score >= 5) return 'critical';
  if (score >= 3) return 'deteriorating';
  if (score >= 1) return 'concerning';
  return 'healthy';
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  getSignalKeywords,
  classifyContactType,
  determinePriorityTier,
  scoreReviewSignals,
  extractCommunityMentions,
  parseAddress,
  classifyUrgency,
  determinePrimaryIssue,
  classifyCompanyHealth,
  sleep,
};
