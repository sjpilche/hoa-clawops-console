/**
 * HOA Networker Agent
 *
 * Purpose: Monitor online communities (Facebook, Reddit, LinkedIn, BiggerPockets)
 *          for high-value engagement opportunities and draft helpful responses
 *
 * Key Features:
 * - Multi-platform scanning (Facebook Groups, Reddit, LinkedIn, BiggerPockets, HOATalk)
 * - Keyword-based relevance scoring (0-100)
 * - Draft response generation using templates
 * - Human-in-the-loop approval (NEVER auto-posts)
 * - Hot lead detection with Telegram alerts
 * - UTM tracking for all shared links
 *
 * Cost: $0 (uses free API tiers + web scraping)
 */

const { v4: uuidv4 } = require('uuid');
const { run, all, get } = require('../db/connection');

// Response templates for different scenarios
const RESPONSE_TEMPLATES = {
  special_assessment_distress: {
    name: 'Special Assessment Distress',
    triggers: ['special assessment', 'emergency', 'can\'t afford', 'owners upset'],
    template: `This is a common situation many boards face. Before proceeding with a special assessment, you might want to explore association-level financing options.

Many HOAs don't realize they can borrow at the association level instead of hitting owners with a lump sum. The HOA takes out the loan, and owners pay it back through a small monthly increase rather than a $5K-20K special assessment.

The key advantage: spreads the cost over time (typically 5-15 years) and keeps owners from having to scramble for cash or take personal loans at higher rates.

Happy to share more details if this would be helpful for your board.`
  },

  hoa_loan_education: {
    name: 'HOA Loan Education Question',
    triggers: ['HOA loan', 'association loan', 'how does', 'what is'],
    template: `Great question! HOA loans (also called association loans or community association loans) work similarly to a commercial loan, but they're specifically designed for community associations.

Here's how it typically works:
1. The HOA applies for the loan (not individual owners)
2. Lender reviews the association's financial health, reserve study, and project scope
3. If approved, the HOA borrows the full amount needed
4. Owners pay it back through a monthly assessment increase (usually $20-100/month depending on loan size)

The advantage over a special assessment is owners pay over time instead of getting hit with a large lump sum. Most boards find it's easier to get owner buy-in for a small monthly increase than a $10K special assessment.

The process typically takes 45-60 days from application to closing.`
  },

  florida_sirs_costs: {
    name: 'Florida SIRS/Milestone Costs',
    triggers: ['SIRS', 'milestone inspection', 'Florida', 'structural integrity'],
    template: `Florida's SIRS requirements have caught a lot of boards off guard. You're not alone in this situation.

Many condos are discovering they need $500K-2M+ in repairs after their milestone inspection, and most reserves aren't funded for that level of capital expenditure.

A few options boards are using:
1. **Association-level loan** - Spread the cost over 10-15 years through small monthly increases
2. **Special assessment** - Get the cash now, but requires owners to find $10K-30K each
3. **Hybrid approach** - Small special assessment + loan for the remainder

The compliance deadline is firm, so whatever financing route you choose, starting the process 3-6 months before your deadline is ideal.

I work in HOA project financing and have helped several Florida condos navigate this exact situation. Happy to share more detail if helpful.`
  },

  loan_vs_assessment_decision: {
    name: 'Loan vs Assessment Decision Framework',
    triggers: ['loan vs', 'special assessment vs', 'which option', 'best way to fund'],
    template: `This is one of the most important decisions your board will make. Here's how most boards evaluate the trade-offs:

**Special Assessment Pros:**
- No interest paid
- Project fully funded immediately
- No ongoing loan management

**Special Assessment Cons:**
- Many owners can't afford $10K-30K lump sum
- Can trigger owner resistance/lawsuits
- May impact property values
- Forces some owners to take personal loans at higher rates

**Association Loan Pros:**
- Spreads cost over time (easier for owners to budget)
- Typically higher approval rate from owners
- Preserves association reserves for other needs
- Professional loan servicing handles collections

**Association Loan Cons:**
- Interest costs (typically 5-8% APR)
- Requires lender approval
- Monthly assessment increase (though usually modest)

Most boards find that owner buy-in is easier with a loan because a $50/month increase is more manageable than a $15K bill. But every community is different based on demographics and financial health.`
  },

  reserve_study_funding_gap: {
    name: 'Reserve Study Funding Gap',
    triggers: ['reserve study', 'underfunded', 'funding gap', '% funded', 'percent funded'],
    template: `A 30-40% funded reserve is unfortunately common for many HOAs, but it does mean you'll need a plan to address the funding gap before major projects hit.

The reserve study should have projected your future capital expenses. If you're facing a large project in the next 1-3 years and don't have the reserves, you have a few options:

1. **Increase monthly reserve contributions** - Helps long-term but won't fund an immediate project
2. **Special assessment** - Get cash now, but owners pay lump sum
3. **Association loan** - Borrow for the immediate project, pay back over time
4. **Hybrid** - Small special assessment + loan for remainder

Many boards are using option 3 (loan) because it avoids shocking owners with a large bill while still getting the project funded on schedule.

The key is addressing this proactively rather than waiting until you're in emergency mode. Projects planned 6-12 months out give you more financing options and better rates.`
  }
};

/**
 * Calculate relevance score for a post
 * Score 0-100 based on multiple factors
 */
function calculateRelevanceScore(post) {
  let score = 0;

  const title = (post.title || '').toLowerCase();
  const body = (post.body || '').toLowerCase();
  const combined = title + ' ' + body;
  const author = (post.author || '').toLowerCase();

  // Decision-maker keywords (+30 points)
  const decisionMakerKeywords = [
    'board member', 'board president', 'treasurer', 'property manager',
    'CAM', 'community association manager', 'HOA manager', 'we are the board'
  ];
  if (decisionMakerKeywords.some(kw => combined.includes(kw) || author.includes(kw))) {
    score += 30;
  }

  // Urgency keywords (+25 points)
  const urgencyKeywords = [
    'emergency', 'urgent', 'deadline', 'SIRS', 'SB 326', 'milestone inspection',
    'immediate', 'asap', 'compliance date'
  ];
  if (urgencyKeywords.some(kw => combined.includes(kw))) {
    score += 25;
  }

  // Project size indicators (+20 points)
  const projectSizeIndicators = [
    '$500k', '$1m', '$2m', 'million', 'multi-building', 'entire complex',
    'all units', '100+ units', 'large project'
  ];
  if (projectSizeIndicators.some(kw => combined.includes(kw))) {
    score += 20;
  }

  // Geographic fit - FL, CA, TX (+15 points)
  const geoKeywords = ['florida', 'california', 'texas', 'FL', 'CA', 'TX', 'miami',
                       'fort lauderdale', 'los angeles', 'san diego', 'dallas', 'houston'];
  if (geoKeywords.some(kw => combined.includes(kw))) {
    score += 15;
  }

  // Community size (+10 points for larger communities)
  const sizeIndicators = ['100 units', '200 units', '150 units', 'large community', 'high-rise'];
  if (sizeIndicators.some(kw => combined.includes(kw))) {
    score += 10;
  }

  // Core topic match (base score if any high-value keyword found)
  const coreKeywords = [
    'special assessment', 'reserve study', 'reserve fund', 'underfunded',
    'HOA loan', 'association loan', 'financing', 'how to pay',
    'roof replacement', 'can\'t afford', 'funding gap'
  ];
  if (coreKeywords.some(kw => combined.includes(kw))) {
    score += 20;
  } else {
    // If no core keywords, significantly reduce score
    score = Math.floor(score * 0.3);
  }

  return Math.min(score, 100); // Cap at 100
}

/**
 * Detect which signals are present in a post
 */
function detectSignals(post) {
  const combined = ((post.title || '') + ' ' + (post.body || '')).toLowerCase();
  const signals = [];

  const signalMap = {
    'special assessment': 'special_assessment',
    'reserve study': 'reserve_study',
    'emergency repair': 'emergency',
    'SIRS': 'florida_sirs',
    'SB 326': 'california_sb326',
    'milestone inspection': 'milestone',
    'underfunded': 'underfunded_reserves',
    'board member': 'decision_maker',
    'property manager': 'decision_maker',
    'urgent': 'urgency',
    'deadline': 'urgency'
  };

  for (const [keyword, signal] of Object.entries(signalMap)) {
    if (combined.includes(keyword.toLowerCase())) {
      if (!signals.includes(signal)) {
        signals.push(signal);
      }
    }
  }

  return signals;
}

/**
 * Select the best response template based on detected signals
 */
function selectTemplate(signals, post) {
  const combined = ((post.title || '') + ' ' + (post.body || '')).toLowerCase();

  // Priority order for template selection
  if (signals.includes('florida_sirs') || combined.includes('sirs')) {
    return RESPONSE_TEMPLATES.florida_sirs_costs;
  }

  if (combined.includes('special assessment') && (combined.includes('can\'t afford') || combined.includes('upset'))) {
    return RESPONSE_TEMPLATES.special_assessment_distress;
  }

  if (combined.includes('loan vs') || combined.includes('vs special assessment')) {
    return RESPONSE_TEMPLATES.loan_vs_assessment_decision;
  }

  if (signals.includes('underfunded_reserves') || combined.includes('reserve study')) {
    return RESPONSE_TEMPLATES.reserve_study_funding_gap;
  }

  if (combined.includes('how does') || combined.includes('what is') || combined.includes('hoa loan')) {
    return RESPONSE_TEMPLATES.hoa_loan_education;
  }

  // Default to education template
  return RESPONSE_TEMPLATES.hoa_loan_education;
}

/**
 * Generate a draft response for a post
 */
function generateDraftResponse(post, template) {
  // For now, use template as-is
  // In future, could use OpenAI/Claude to personalize based on post content
  return template.template;
}

/**
 * Process a single post and add to engagement queue if relevant
 */
async function processPost(post, platform) {
  try {
    // Calculate relevance score
    const relevanceScore = calculateRelevanceScore(post);

    // Only process if score >= 70
    if (relevanceScore < 70) {
      console.log(`[HOA Networker] Post score too low (${relevanceScore}): ${post.url}`);
      return null;
    }

    // Check if already processed
    const existing = get('SELECT id FROM lg_engagement_queue WHERE post_url = ?', [post.url]);
    if (existing) {
      console.log(`[HOA Networker] Post already in queue: ${post.url}`);
      return null;
    }

    // Detect signals
    const signals = detectSignals(post);

    // Select template
    const template = selectTemplate(signals, post);

    // Generate draft response
    const draftResponse = generateDraftResponse(post, template);

    // Add to engagement queue
    const queueId = uuidv4();
    run(`
      INSERT INTO lg_engagement_queue (
        id, platform, post_url, post_title, post_body, author_name,
        detected_signals, relevance_score, draft_response, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      queueId,
      platform,
      post.url,
      post.title,
      post.body,
      post.author,
      JSON.stringify(signals),
      relevanceScore,
      draftResponse,
      'pending_review'
    ]);

    console.log(`[HOA Networker] ✅ Added to queue (score ${relevanceScore}): ${post.title}`);

    // If score >= 90, it's a hot lead - could send Telegram alert here
    if (relevanceScore >= 90) {
      console.log(`[HOA Networker] 🔥 HOT LEAD detected (score ${relevanceScore})`);
      // TODO: Send Telegram notification
    }

    return queueId;

  } catch (error) {
    console.error('[HOA Networker] Error processing post:', error);
    return null;
  }
}

/**
 * Get statistics on engagement queue
 */
function getQueueStats() {
  const stats = {
    pending: get('SELECT COUNT(*) as count FROM lg_engagement_queue WHERE status = ?', ['pending_review']),
    approved: get('SELECT COUNT(*) as count FROM lg_engagement_queue WHERE status = ?', ['approved']),
    posted: get('SELECT COUNT(*) as count FROM lg_engagement_queue WHERE status = ?', ['posted']),
    rejected: get('SELECT COUNT(*) as count FROM lg_engagement_queue WHERE status = ?', ['rejected']),
    total: get('SELECT COUNT(*) as count FROM lg_engagement_queue')
  };

  return {
    pending: stats.pending?.count || 0,
    approved: stats.approved?.count || 0,
    posted: stats.posted?.count || 0,
    rejected: stats.rejected?.count || 0,
    total: stats.total?.count || 0
  };
}

module.exports = {
  processPost,
  calculateRelevanceScore,
  detectSignals,
  selectTemplate,
  generateDraftResponse,
  getQueueStats,
  RESPONSE_TEMPLATES
};
