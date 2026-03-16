/**
 * @file revenueTracker.js
 * @description Revenue attribution and stage tracking.
 *
 * Closes the measurement gap: discovery → contact → reply → meeting → pilot → revenue.
 *
 * Revenue stages (money-focused, not pipeline-focused):
 *   discovered → contacted → replied → meeting → pilot → closed_won | closed_lost | lost
 *
 * Usage:
 *   const revenue = require('./revenueTracker');
 *   revenue.recordEvent(leadId, 'replied', { agent: 'jake-reply-classifier', sequenceId: 42 });
 *   revenue.updateEngagementScore(leadId, 'open');
 *   revenue.recordDeal(leadId, 250000, 'jake-meeting-booker');  // $2,500.00 in cents
 *   const stats = revenue.getFunnelStats();
 *   const roi = revenue.getAgentROI('jake-outreach-agent');
 */

const { get, all, run } = require('../db/connection');

// ─── Revenue Stage Ladder ────────────────────────────────────────────────────
const REVENUE_STAGES = [
  'discovered',   // Lead found
  'contacted',    // First outreach sent
  'replied',      // Got a response (any sentiment)
  'meeting',      // Meeting booked
  'pilot',        // Pilot/diagnostic started
  'closed_won',   // Deal closed, revenue recorded
  'closed_lost',  // Deal lost
  'lost',         // Bounced, unsubscribed, bad contact
];

// Map existing lead statuses to revenue stages
const STATUS_TO_REVENUE_STAGE = {
  'new':            'discovered',
  'contacted':      'contacted',
  'replied':        'replied',
  'nurture':        'replied',
  'meeting_booked': 'meeting',
  'diagnostic':     'pilot',
  'pilot':          'pilot',
  'committed':      'pilot',
  'closed_won':     'closed_won',
  'client':         'closed_won',
  'closed_lost':    'closed_lost',
  'dead':           'closed_lost',
  'bounced':        'lost',
  'unsubscribed':   'lost',
  'bad_contact':    'lost',
};

// Engagement score weights
const ENGAGEMENT_WEIGHTS = {
  delivered: 5,
  open: 10,
  click: 25,
  reply: 50,
};

// Allowlisted table names — prevents SQL injection via leadTable parameter
const ALLOWED_TABLES = ['cfo_leads', 'lg_engagement_queue'];
function safeTable(t) { return ALLOWED_TABLES.includes(t) ? t : 'cfo_leads'; }

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Record a revenue event and update the lead's revenue stage.
 * This is the primary function — call it whenever a revenue-relevant event happens.
 */
function recordEvent(leadId, eventType, opts = {}) {
  const {
    leadTable = 'cfo_leads',
    agent = null,
    sequenceId = null,
    touchNumber = null,
    channel = 'email',
    valueCents = null,
    metadata = null,
  } = opts;

  const table = safeTable(leadTable);

  try {
    const lead = get(`SELECT revenue_stage, created_at, days_to_first_reply FROM ${table} WHERE id = ?`, [leadId]);
    if (!lead) return null;

    const stageBefore = lead.revenue_stage || 'discovered';
    const stageAfter = eventTypeToStage(eventType, stageBefore);

    // Insert immutable event record
    run(`
      INSERT INTO revenue_events (lead_id, lead_table, event_type, revenue_stage_before, revenue_stage_after,
        value_cents, agent_name, sequence_id, touch_number, channel, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [leadId, table, eventType, stageBefore, stageAfter, valueCents, agent, sequenceId,
        touchNumber, channel, metadata ? JSON.stringify(metadata) : null]);

    // Update lead's revenue stage (only advance forward, never backward)
    if (stageIndex(stageAfter) > stageIndex(stageBefore)) {
      const now = new Date().toISOString();
      const params = [stageAfter, now];
      let sql = `UPDATE ${table} SET revenue_stage = ?, revenue_stage_changed_at = ?`;

      // Compute cycle times
      if (stageAfter === 'replied' && !lead.days_to_first_reply) {
        const days = daysBetween(lead.created_at, now);
        sql += `, days_to_first_reply = ?`;
        params.push(days);
      }
      if (stageAfter === 'closed_won') {
        const days = daysBetween(lead.created_at, now);
        sql += `, days_to_close = ?`;
        params.push(days);
      }

      // Attribution: which sequence/touch drove this stage
      if (sequenceId) { sql += `, attributed_sequence_id = ?`; params.push(sequenceId); }
      if (touchNumber) { sql += `, attributed_touch_number = ?`; params.push(touchNumber); }

      sql += ` WHERE id = ?`;
      params.push(leadId);
      run(sql, params);
    }

    return { leadId, stageBefore, stageAfter, eventType };
  } catch (err) {
    console.error(`[RevenueTracker] recordEvent failed for lead ${leadId}:`, err.message);
    return null;
  }
}

/**
 * Record a deal close with revenue value.
 * @param {number} leadId
 * @param {number} valueCents - Deal value in cents (e.g., 250000 = $2,500.00)
 * @param {string} closedBy - Agent or 'manual'
 */
function recordDeal(leadId, valueCents, closedBy = 'manual', leadTable = 'cfo_leads') {
  const now = new Date().toISOString();

  run(`UPDATE ${safeTable(leadTable)} SET deal_value_cents = ?, deal_closed_at = ?, deal_closed_by = ? WHERE id = ?`,
    [valueCents, now, closedBy, leadId]);

  return recordEvent(leadId, 'deal_won', {
    leadTable,
    agent: closedBy,
    valueCents,
    channel: 'manual',
  });
}

/**
 * Record a lost deal.
 */
function recordDealLost(leadId, reason = null, leadTable = 'cfo_leads') {
  return recordEvent(leadId, 'deal_lost', {
    leadTable,
    metadata: reason ? { reason } : null,
    channel: 'manual',
  });
}

/**
 * Update engagement score based on SendGrid webhook events.
 * Called from sendgridWebhook.js when open/click/delivered events arrive.
 */
function updateEngagementScore(leadId, eventType, opts = {}) {
  const { leadTable = 'cfo_leads', sequenceId = null, subject = null, linkUrl = null } = opts;

  const weight = ENGAGEMENT_WEIGHTS[eventType] || 0;
  if (!weight) return;

  const now = new Date().toISOString();

  // Update engagement score (cap at 100)
  run(`UPDATE ${safeTable(leadTable)} SET
    engagement_score = MIN(100, engagement_score + ?),
    last_engaged_at = ?
    WHERE id = ?`, [weight, now, leadId]);

  // Log the engagement event
  run(`INSERT INTO engagement_events (lead_id, lead_table, sequence_id, event_type, email_subject, link_url)
    VALUES (?, ?, ?, ?, ?, ?)`,
    [leadId, leadTable, sequenceId, eventType, subject, linkUrl]);

  // Also record as revenue event for opens and clicks
  if (eventType === 'open' || eventType === 'click') {
    recordEvent(leadId, eventType === 'open' ? 'opened' : 'clicked', {
      leadTable, sequenceId, channel: 'email',
    });
  }
}

/**
 * Record an outreach variant for A/B testing.
 * Called when outreach is sent — tracks subject line, angle, tone for later correlation.
 */
function recordOutreachVariant(sequenceId, leadId, opts = {}) {
  const {
    subjectLine = '',
    angleType = null,
    templateName = null,
    tone = null,
    personalizationLevel = null,
  } = opts;

  run(`INSERT INTO outreach_variants (sequence_id, lead_id, subject_line, angle_type,
    template_name, tone, personalization_level, sent_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [sequenceId, leadId, subjectLine, angleType, templateName, tone, personalizationLevel]);
}

/**
 * Update outreach variant outcomes (called by webhooks and reply classifier).
 */
function updateVariantOutcome(sequenceId, field, value) {
  // Allowlisted column updates — prevents SQL injection even though field is internal
  const columnMap = {
    delivered: 'delivered', opened: 'opened', open_count: 'open_count',
    clicked: 'clicked', replied: 'replied', reply_sentiment: 'reply_sentiment',
    converted: 'converted', first_open_at: 'first_open_at',
    first_click_at: 'first_click_at', replied_at: 'replied_at',
  };
  const safeCol = columnMap[field];
  if (!safeCol) return;

  if (safeCol === 'open_count') {
    run('UPDATE outreach_variants SET open_count = open_count + 1 WHERE sequence_id = ?', [sequenceId]);
  } else {
    run(`UPDATE outreach_variants SET ${safeCol} = ? WHERE sequence_id = ?`, [value, sequenceId]);
  }
}

// ─── Reporting ───────────────────────────────────────────────────────────────

/**
 * Get funnel conversion stats.
 * Returns count at each stage + conversion rates between stages.
 */
function getFunnelStats(leadTable = 'cfo_leads') {
  const stages = ['discovered', 'contacted', 'replied', 'meeting', 'pilot', 'closed_won'];
  const counts = {};

  for (const stage of stages) {
    const row = get(`SELECT COUNT(*) as n FROM ${safeTable(leadTable)} WHERE revenue_stage = ?`, [stage]);
    counts[stage] = row ? row.n : 0;
  }

  // Lost/closed_lost counts
  const lost = get(`SELECT COUNT(*) as n FROM ${safeTable(leadTable)} WHERE revenue_stage IN ('closed_lost', 'lost')`);
  counts.lost = lost ? lost.n : 0;

  // Conversion rates
  const rates = {};
  for (let i = 0; i < stages.length - 1; i++) {
    const from = stages[i];
    const to = stages[i + 1];
    // "Reached at least this stage" = sum of this stage and all later stages
    const reachedFrom = stages.slice(i).reduce((sum, s) => sum + (counts[s] || 0), 0);
    const reachedTo = stages.slice(i + 1).reduce((sum, s) => sum + (counts[s] || 0), 0);
    rates[`${from}_to_${to}`] = reachedFrom > 0 ? Math.round((reachedTo / reachedFrom) * 100) : 0;
  }

  // Total revenue
  const rev = get(`SELECT COALESCE(SUM(deal_value_cents), 0) as total FROM ${safeTable(leadTable)} WHERE deal_value_cents IS NOT NULL`);
  const totalRevenue = rev ? rev.total : 0;

  // Average deal size
  const dealCount = get(`SELECT COUNT(*) as n FROM ${safeTable(leadTable)} WHERE deal_value_cents IS NOT NULL AND deal_value_cents > 0`);
  const avgDeal = dealCount && dealCount.n > 0 ? Math.round(totalRevenue / dealCount.n) : 0;

  // Average cycle time
  const cycle = get(`SELECT AVG(days_to_close) as avg_days FROM ${safeTable(leadTable)} WHERE days_to_close IS NOT NULL`);

  return {
    counts,
    rates,
    totalRevenueCents: totalRevenue,
    totalRevenueDollars: (totalRevenue / 100).toFixed(2),
    dealCount: dealCount ? dealCount.n : 0,
    avgDealCents: avgDeal,
    avgDealDollars: (avgDeal / 100).toFixed(2),
    avgDaysToClose: cycle ? Math.round(cycle.avg_days) : null,
  };
}

/**
 * Get ROI per agent — how much revenue each agent has attributed.
 */
function getAgentROI() {
  const rows = all(`
    SELECT
      agent_name,
      COUNT(*) as events,
      COUNT(CASE WHEN event_type = 'deal_won' THEN 1 END) as deals,
      COALESCE(SUM(CASE WHEN event_type = 'deal_won' THEN value_cents END), 0) as revenue_cents
    FROM revenue_events
    WHERE agent_name IS NOT NULL
    GROUP BY agent_name
    ORDER BY revenue_cents DESC
  `);
  return rows || [];
}

/**
 * Get A/B test results — which subject lines, angles, tones convert best.
 */
function getVariantStats(groupBy = 'angle_type') {
  const validGroups = ['angle_type', 'tone', 'personalization_level', 'template_name'];
  if (!validGroups.includes(groupBy)) groupBy = 'angle_type';

  const rows = all(`
    SELECT
      ${groupBy} as variant,
      COUNT(*) as sent,
      SUM(opened) as opens,
      SUM(clicked) as clicks,
      SUM(replied) as replies,
      SUM(converted) as conversions,
      CASE WHEN COUNT(*) > 0 THEN ROUND(SUM(opened) * 100.0 / COUNT(*), 1) END as open_rate,
      CASE WHEN COUNT(*) > 0 THEN ROUND(SUM(replied) * 100.0 / COUNT(*), 1) END as reply_rate,
      CASE WHEN COUNT(*) > 0 THEN ROUND(SUM(converted) * 100.0 / COUNT(*), 1) END as conversion_rate
    FROM outreach_variants
    WHERE ${groupBy} IS NOT NULL
    GROUP BY ${groupBy}
    ORDER BY conversion_rate DESC
  `);
  return rows || [];
}

/**
 * Get engagement leaderboard — hottest leads by engagement score.
 */
function getEngagementLeaderboard(limit = 20, leadTable = 'cfo_leads') {
  return all(`
    SELECT id, company_name, contact_name, contact_email, engagement_score,
      revenue_stage, urgency_score, last_engaged_at
    FROM ${safeTable(leadTable)}
    WHERE engagement_score > 0
    ORDER BY engagement_score DESC
    LIMIT ?
  `, [limit]) || [];
}

/**
 * Get cycle time analytics — how long each stage takes on average.
 */
function getCycleTimeStats(leadTable = 'cfo_leads') {
  return all(`
    SELECT
      revenue_stage,
      COUNT(*) as leads,
      ROUND(AVG(days_in_stage), 1) as avg_days_in_stage,
      MAX(days_in_stage) as max_days_in_stage
    FROM ${safeTable(leadTable)}
    WHERE revenue_stage NOT IN ('lost', 'closed_lost', 'closed_won')
    GROUP BY revenue_stage
    ORDER BY CASE revenue_stage
      WHEN 'discovered' THEN 1
      WHEN 'contacted' THEN 2
      WHEN 'replied' THEN 3
      WHEN 'meeting' THEN 4
      WHEN 'pilot' THEN 5
    END
  `) || [];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stageIndex(stage) {
  const idx = REVENUE_STAGES.indexOf(stage);
  return idx >= 0 ? idx : 0;
}

function eventTypeToStage(eventType, currentStage) {
  const map = {
    'discovered':     'discovered',
    'contacted':      'contacted',
    'opened':         currentStage,  // opens don't advance stage
    'clicked':        currentStage,  // clicks don't advance stage
    'replied':        'replied',
    'meeting_booked': 'meeting',
    'pilot_started':  'pilot',
    'deal_won':       'closed_won',
    'deal_lost':      'closed_lost',
    'churned':        'closed_lost',
  };
  return map[eventType] || currentStage;
}

function daysBetween(dateA, dateB) {
  try {
    const a = new Date(dateA);
    const b = new Date(dateB);
    return Math.round((b - a) / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

/**
 * Get content performance — which posts drive the most leads and engagement.
 */
function getContentPerformance(limit = 20) {
  const posts = all(`
    SELECT id, title, pillar, channel, source_agent, performance_score,
      leads_generated, email_clicks, social_shares, newsletter_clicks,
      target_keyword, created_at, published_at, scored_at
    FROM cfo_content_pieces
    WHERE status = 'published'
    ORDER BY COALESCE(performance_score, 0) DESC, created_at DESC
    LIMIT ?
  `, [limit]) || [];

  const pillarStats = all(`
    SELECT pillar, COUNT(*) as posts,
      ROUND(AVG(COALESCE(performance_score, 0)), 1) as avg_score,
      SUM(COALESCE(leads_generated, 0)) as total_leads
    FROM cfo_content_pieces
    WHERE status = 'published' AND pillar IS NOT NULL
    GROUP BY pillar
    ORDER BY avg_score DESC
  `) || [];

  const learnings = all(`
    SELECT summary, confidence, learning_type, created_at
    FROM marketing_learnings
    WHERE confidence >= 0.5
    ORDER BY created_at DESC LIMIT 10
  `) || [];

  const calendarStats = all(`
    SELECT status, COUNT(*) as n FROM content_calendar GROUP BY status
  `) || [];

  return { posts, pillarStats, learnings, calendarStats };
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  // Core
  recordEvent,
  recordDeal,
  recordDealLost,
  updateEngagementScore,

  // A/B testing
  recordOutreachVariant,
  updateVariantOutcome,

  // Reporting
  getFunnelStats,
  getAgentROI,
  getVariantStats,
  getEngagementLeaderboard,
  getCycleTimeStats,
  getContentPerformance,

  // Constants
  REVENUE_STAGES,
  STATUS_TO_REVENUE_STAGE,
};
