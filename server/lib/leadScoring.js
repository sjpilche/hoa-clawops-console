/**
 * Lead Scoring System for HOA Project Funding
 *
 * Scores leads based on:
 * - Keywords in message/description (hot/warm)
 * - Project amount ($250K+ = hot)
 * - Timeline urgency (immediate = high priority)
 * - Reserve fund status
 * - Special assessment concerns
 * - HOA size
 */

const HOT_KEYWORDS = [
  'urgent', 'immediately', 'asap', 'right away', 'emergency',
  'financing', 'loan', 'borrow', 'fund', 'lending',
  'quote', 'cost', 'rate', 'terms', 'approval',
  'special assessment', 'assessment',
  'need help', 'struggling', 'desperate'
];

const WARM_KEYWORDS = [
  'considering', 'exploring', 'looking into', 'thinking about',
  'reserve fund', 'capital improvement',
  'roof', 'pool', 'parking', 'elevator', 'hvac',
  'property manager', 'board member', 'treasurer'
];

const PROJECT_AMOUNT_THRESHOLDS = {
  hot: 250000,  // Projects $250K+ are hot (serious commitment)
  warm: 100000  // Projects $100K-$250K are warm
};

const URGENCY_SCORES = {
  immediate: 10,
  within_3_months: 7,
  within_6_months: 4,
  within_year: 2,
  planning: 1
};

/**
 * Score a lead based on content, amount, and urgency signals
 * @param {Object} leadData - Raw lead capture data
 * @returns {Object} - { score, priority, keywords, urgency_signals, points }
 */
function scoreLead(leadData) {
  let points = 0;
  const keywords = [];
  const urgencySignals = [];

  // 1. Keyword analysis in message and project description
  const textToAnalyze = [
    leadData.message || '',
    leadData.project_description || '',
    leadData.project_type || ''
  ].join(' ').toLowerCase();

  HOT_KEYWORDS.forEach(keyword => {
    if (textToAnalyze.includes(keyword)) {
      keywords.push(keyword);
      points += 3;
    }
  });

  WARM_KEYWORDS.forEach(keyword => {
    if (textToAnalyze.includes(keyword)) {
      keywords.push(keyword);
      points += 1;
    }
  });

  // 2. Project amount analysis
  if (leadData.estimated_amount) {
    if (leadData.estimated_amount >= PROJECT_AMOUNT_THRESHOLDS.hot) {
      points += 8;
      urgencySignals.push(`High-value project: $${leadData.estimated_amount.toLocaleString()}`);
    } else if (leadData.estimated_amount >= PROJECT_AMOUNT_THRESHOLDS.warm) {
      points += 4;
      urgencySignals.push(`Mid-value project: $${leadData.estimated_amount.toLocaleString()}`);
    }
  }

  // 3. Urgency level
  if (leadData.project_urgency) {
    const urgencyPoints = URGENCY_SCORES[leadData.project_urgency] || 0;
    points += urgencyPoints;

    if (urgencyPoints >= 7) {
      urgencySignals.push(`Timeline: ${leadData.project_urgency.replace('_', ' ')}`);
    }
  }

  // 4. Reserve fund depletion signal
  if (leadData.current_reserve_fund !== undefined && leadData.estimated_amount) {
    if (leadData.current_reserve_fund < leadData.estimated_amount * 0.3) {
      points += 5;
      urgencySignals.push('Reserve fund below 30% of project cost');
    }
  }

  // 5. Special assessment concerns
  if (leadData.special_assessment_concerns === true) {
    points += 3;
    urgencySignals.push('Concerned about special assessments');
  }

  // 6. HOA size (larger = more stable, higher loan potential)
  if (leadData.hoa_units && leadData.hoa_units >= 100) {
    points += 2;
  }

  // Determine final score
  let score, priority;

  if (points >= 15) {
    score = 'hot';
    priority = 'high';
  } else if (points >= 8) {
    score = 'warm';
    priority = 'medium';
  } else {
    score = 'general';
    priority = 'low';
  }

  return {
    score,
    priority,
    keywords: [...new Set(keywords)], // Remove duplicates
    urgency_signals: urgencySignals,
    points
  };
}

module.exports = {
  scoreLead,
  HOT_KEYWORDS,
  WARM_KEYWORDS,
  PROJECT_AMOUNT_THRESHOLDS
};
