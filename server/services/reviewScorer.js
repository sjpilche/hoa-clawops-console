/**
 * @file reviewScorer.js
 * @description Keyword-based scoring engine for Google Reviews
 *
 * Scores HOA Google reviews based on capital need signals.
 * Cost: $0 (deterministic keyword matching, no LLM)
 */

// ═══════════════════════════════════════════════════════════════════════════
// KEYWORD DICTIONARIES
// ═══════════════════════════════════════════════════════════════════════════

const TIER1_KEYWORDS = [
  'special assessment',
  'reserve fund shortage',
  'reserve fund deficiency',
  'deferred maintenance',
  'capital improvement',
  'roof replacement',
  'repaving',
  'parking lot replacement',
  'elevator repair',
  'elevator replacement',
  'pipe replacement',
  'plumbing replacement',
  'repiping',
  'loan',
  'borrowing',
  'borrowed money',
  'assessment coming',
  'assessment vote',
  'project funding',
  'how are we funding',
  'need to borrow',
  'financing options'
];

const TIER2_KEYWORDS = [
  'falling apart',
  'needs repair',
  'needs work',
  'falling behind',
  'crumbling',
  'cracked',
  'broken',
  'safety hazard',
  'dangerous',
  'board not listening',
  'board ignores',
  'fees keep going up',
  'dues increasing',
  'underfunded',
  'poorly funded',
  'neglected',
  'neglecting',
  'management company failing',
  'terrible condition',
  'bad shape',
  'lawsuit',
  'litigation',
  'suing the hoa'
];

const TIER3_KEYWORDS = [
  'renovation',
  'renovating',
  'remodel',
  'remodeling',
  'construction',
  'upgrade',
  'upgrading',
  'budget meeting',
  'annual meeting',
  'board meeting',
  'new management',
  'changed management',
  'reserve study',
  'old building',
  'aging building',
  'outdated',
  'pool closed',
  'pool problems',
  'gym closed',
  'clubhouse closed',
  'amenities closed'
];

const NEGATIVE_KEYWORDS = [
  { keyword: 'just completed', points: -10 },
  { keyword: 'recently finished', points: -10 },
  { keyword: 'already fixed', points: -10 },
  { keyword: 'been repaired', points: -10 },
  { keyword: 'new management is great', points: -5 },
  { keyword: 'well maintained', points: -8 },
  { keyword: 'beautiful property', points: -8 },
  { keyword: 'reserves are healthy', points: -15 },
  { keyword: 'fully funded', points: -15 },
  { keyword: 'best hoa', points: -3 },
  { keyword: 'great hoa', points: -3 },
  { keyword: 'love living here', points: -3 }
];

// Star rating multipliers (low stars = higher urgency)
const STAR_MULTIPLIERS = {
  1: 1.5,
  2: 1.3,
  3: 1.1,
  4: 0.9,
  5: 0.5
};

// Recency multipliers (recent = higher relevance)
const RECENCY_MULTIPLIERS = [
  { days: 30, multiplier: 2.0 },
  { days: 90, multiplier: 1.5 },
  { days: 180, multiplier: 1.0 },
  { days: 365, multiplier: 0.6 },
  { days: 99999, multiplier: 0.3 }  // > 1 year
];

// ═══════════════════════════════════════════════════════════════════════════
// KEYWORD MATCHING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Find keyword matches in review text (case-insensitive)
 */
function findKeywordMatches(text, keywords) {
  if (!text) return [];

  const lowerText = text.toLowerCase();
  const matches = [];

  for (const keyword of keywords) {
    const keywordLower = (typeof keyword === 'string' ? keyword : keyword.keyword).toLowerCase();
    if (lowerText.includes(keywordLower)) {
      matches.push(keyword);
    }
  }

  return matches;
}

// ═══════════════════════════════════════════════════════════════════════════
// DATE PARSING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parse Google's relative date strings to days ago
 * "3 weeks ago" → 21 days
 * "March 2025" → calculated from today
 */
function parseDateToDaysAgo(dateString) {
  if (!dateString) return 999; // Unknown = treat as old

  const today = new Date();
  const lower = dateString.toLowerCase();

  // "just now", "X minutes ago", "X hours ago"
  if (lower.includes('just now') || lower.includes('minute') || lower.includes('hour')) {
    return 0;
  }

  // "X days ago"
  const daysMatch = lower.match(/(\d+)\s+days?\s+ago/);
  if (daysMatch) {
    return parseInt(daysMatch[1]);
  }

  // "X weeks ago"
  const weeksMatch = lower.match(/(\d+)\s+weeks?\s+ago/);
  if (weeksMatch) {
    return parseInt(weeksMatch[1]) * 7;
  }

  // "X months ago"
  const monthsMatch = lower.match(/(\d+)\s+months?\s+ago/);
  if (monthsMatch) {
    return parseInt(monthsMatch[1]) * 30;
  }

  // "X years ago"
  const yearsMatch = lower.match(/(\d+)\s+years?\s+ago/);
  if (yearsMatch) {
    return parseInt(yearsMatch[1]) * 365;
  }

  // "Month YYYY" format (e.g., "March 2025")
  const monthYear = dateString.match(/([A-Za-z]+)\s+(\d{4})/);
  if (monthYear) {
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                        'july', 'august', 'september', 'october', 'november', 'december'];
    const monthIndex = monthNames.indexOf(monthYear[1].toLowerCase());
    if (monthIndex !== -1) {
      const year = parseInt(monthYear[2]);
      const reviewDate = new Date(year, monthIndex, 1);
      const diffMs = today - reviewDate;
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      return Math.max(0, diffDays);
    }
  }

  // Default: treat as old
  return 365;
}

/**
 * Get recency multiplier based on days ago
 */
function getRecencyMultiplier(daysAgo) {
  for (const tier of RECENCY_MULTIPLIERS) {
    if (daysAgo <= tier.days) {
      return tier.multiplier;
    }
  }
  return 0.3; // Fallback for very old
}

// ═══════════════════════════════════════════════════════════════════════════
// REVIEW SCORING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Score a single review
 */
function scoreReview(review) {
  const text = review.review_text || '';

  // Find keyword matches
  const tier1Hits = findKeywordMatches(text, TIER1_KEYWORDS);
  const tier2Hits = findKeywordMatches(text, TIER2_KEYWORDS);
  const tier3Hits = findKeywordMatches(text, TIER3_KEYWORDS);
  const negativeHits = findKeywordMatches(text, NEGATIVE_KEYWORDS);

  // Calculate raw score
  let rawScore = 0;
  rawScore += tier1Hits.length * 15;
  rawScore += tier2Hits.length * 10;
  rawScore += tier3Hits.length * 5;

  // Apply negative keywords
  for (const hit of negativeHits) {
    rawScore += hit.points; // points are negative
  }

  // Ensure non-negative
  rawScore = Math.max(0, rawScore);

  // Apply star rating multiplier
  const starMultiplier = STAR_MULTIPLIERS[review.star_rating] || 1.0;
  rawScore = rawScore * starMultiplier;

  // Apply recency multiplier
  const daysAgo = parseDateToDaysAgo(review.review_date);
  const recencyMultiplier = getRecencyMultiplier(daysAgo);
  const weightedScore = rawScore * recencyMultiplier;

  // Determine if this is a signal review
  const isSignal = tier1Hits.length > 0 || tier2Hits.length > 0 || rawScore >= 10;

  // Determine signal strength
  let signalStrength = 'none';
  if (weightedScore >= 30) signalStrength = 'high';
  else if (weightedScore >= 15) signalStrength = 'moderate';
  else if (weightedScore >= 5) signalStrength = 'low';

  return {
    raw_score: Math.round(rawScore * 10) / 10,
    weighted_score: Math.round(weightedScore * 10) / 10,
    tier1_hits: JSON.stringify(tier1Hits),
    tier2_hits: JSON.stringify(tier2Hits),
    tier3_hits: JSON.stringify(tier3Hits),
    negative_hits: JSON.stringify(negativeHits.map(h => h.keyword)),
    is_signal: isSignal ? 1 : 0,
    signal_strength: signalStrength,
    days_ago: daysAgo
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMUNITY SCORING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate aggregate score for an HOA community
 */
function scoreCommunity(reviews) {
  if (!reviews || reviews.length === 0) {
    return {
      community_signal_score: 0,
      signal_tier: 'COLD',
      signal_reviews: [],
      top_keywords: [],
      total_reviews: 0,
      signal_review_count: 0,
      avg_star_rating: 0,
      scored_reviews: []
    };
  }

  // Score each review
  const scoredReviews = reviews.map(review => ({
    ...review,
    ...scoreReview(review)
  }));

  // Calculate community aggregate score
  let totalScore = 0;
  const signalReviews = [];
  const allKeywords = {};

  for (const review of scoredReviews) {
    totalScore += review.weighted_score;

    if (review.is_signal) {
      signalReviews.push(review);

      // Collect keywords
      const tier1 = JSON.parse(review.tier1_hits);
      const tier2 = JSON.parse(review.tier2_hits);
      const tier3 = JSON.parse(review.tier3_hits);

      [...tier1, ...tier2, ...tier3].forEach(kw => {
        const key = typeof kw === 'string' ? kw : kw.keyword || kw;
        allKeywords[key] = (allKeywords[key] || 0) + 1;
      });
    }
  }

  // Convergence bonus: 3+ reviews mention same keyword
  let convergenceBonus = 0;
  for (const [keyword, count] of Object.entries(allKeywords)) {
    if (count >= 3) {
      convergenceBonus += 10;
      console.log(`  🔥 Convergence bonus: "${keyword}" mentioned in ${count} reviews (+10 pts)`);
    }
  }

  totalScore += convergenceBonus;

  // Cap at 100
  const finalScore = Math.min(100, Math.round(totalScore * 10) / 10);

  // Determine tier
  let tier = 'COLD';
  if (finalScore >= 75) tier = 'HOT';
  else if (finalScore >= 50) tier = 'WARM';
  else if (finalScore >= 25) tier = 'MONITOR';

  // Get top 5 keywords
  const topKeywords = Object.entries(allKeywords)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([keyword]) => keyword);

  // Calculate average star rating
  const avgStars = reviews.reduce((sum, r) => sum + (r.star_rating || 0), 0) / reviews.length;

  return {
    community_signal_score: finalScore,
    signal_tier: tier,
    signal_reviews: signalReviews,
    top_keywords: topKeywords,
    total_reviews: reviews.length,
    signal_review_count: signalReviews.length,
    avg_star_rating: Math.round(avgStars * 10) / 10,
    scored_reviews: scoredReviews
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  scoreReview,
  scoreCommunity,
  parseDateToDaysAgo,
  getRecencyMultiplier,
  TIER1_KEYWORDS,
  TIER2_KEYWORDS,
  TIER3_KEYWORDS,
  NEGATIVE_KEYWORDS
};
