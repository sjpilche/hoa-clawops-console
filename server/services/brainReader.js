/**
 * @file brainReader.js
 * @description Lightweight brain context reader for special handlers.
 *
 * Special handlers ($0 deterministic agents) bypass the LLM bridge and therefore
 * don't get brain context injected. This module provides focused brain reads
 * for handlers that make decisions about leads, outreach, and prioritization.
 *
 * All queries are wrapped in try/catch — if tables don't exist yet, returns empty results.
 *
 * Usage:
 *   const brain = require('./brainReader');
 *   const insights = brain.getLeadInsights(leadId);
 *   const bestAngles = brain.getWinningAngles('jake', 'Vista');
 *   const timing = brain.getBestSendTiming('jake');
 */

const { get, all } = require('../db/connection');

// Safe query wrapper — returns fallback if table doesn't exist
function safeAll(sql, params = [], fallback = []) {
  try { return all(sql, params) || fallback; } catch { return fallback; }
}
function safeGet(sql, params = [], fallback = null) {
  try { return get(sql, params) || fallback; } catch { return fallback; }
}

// ─── Lead-Level Insights ─────────────────────────────────────────────────────

/**
 * Get brain insights for a specific lead.
 * Used by: urgency-scorer, lead-dossier-generator, pipeline-director
 */
function getLeadInsights(leadId) {
  const leadIdStr = String(leadId);

  // Episodes involving this lead
  const episodes = safeAll(`
    SELECT agent_name, outcome, outcome_type, outcome_score, days_to_outcome,
           market, erp_context, contact_title, action_taken
    FROM brain_fallback_episodes
    WHERE lead_id = ?
    ORDER BY created_at DESC LIMIT 5
  `, [leadIdStr]);

  // Feedback on outreach to this lead
  // Column is 'output_id' in brain_fallback_feedback, and 'signal' not 'signal_type'
  const feedback = safeAll(`
    SELECT agent_name, signal, notes
    FROM brain_fallback_feedback
    WHERE output_id = ?
    ORDER BY created_at DESC LIMIT 3
  `, [leadIdStr]);

  return {
    hasHistory: episodes.length > 0 || feedback.length > 0,
    episodes,
    feedback,
    bestOutcome: episodes.length > 0 ? episodes.reduce((best, ep) =>
      (ep.outcome_score || 0) > (best.outcome_score || 0) ? ep : best, episodes[0]) : null,
    wasRejected: feedback.some(f => f.signal === 'rejected'),
    wasConverted: feedback.some(f => f.signal === 'converted'),
  };
}

// ─── Market & ERP Insights ───────────────────────────────────────────────────

/**
 * Get winning outreach angles for a market/ERP combo.
 * Used by: outreach-sender (to prioritize approved drafts), pipeline-director
 */
function getWinningAngles(product = 'jake', erpContext = null) {
  let query = `
    SELECT erp_context, contact_title, action_taken, outcome, outcome_score,
           market, days_to_outcome
    FROM brain_fallback_episodes
    WHERE outcome_score >= 0.7
      AND agent_name LIKE ?
  `;
  const params = [`${product}%`];

  if (erpContext) {
    query += ` AND erp_context = ?`;
    params.push(erpContext);
  }

  query += ` ORDER BY outcome_score DESC LIMIT 10`;

  const winners = safeAll(query, params);

  // Extract common patterns
  const erpWins = {};
  const titleWins = {};
  const marketWins = {};

  for (const w of winners) {
    if (w.erp_context) erpWins[w.erp_context] = (erpWins[w.erp_context] || 0) + 1;
    if (w.contact_title) titleWins[w.contact_title] = (titleWins[w.contact_title] || 0) + 1;
    if (w.market) marketWins[w.market] = (marketWins[w.market] || 0) + 1;
  }

  return {
    totalWins: winners.length,
    winners,
    topERP: Object.entries(erpWins).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
    topTitle: Object.entries(titleWins).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
    topMarket: Object.entries(marketWins).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
    avgDaysToWin: winners.length > 0
      ? Math.round(winners.reduce((sum, w) => sum + (w.days_to_outcome || 0), 0) / winners.length)
      : null,
  };
}

/**
 * Get best send timing based on successful episodes.
 * Used by: tenacity-cadence-engine, outreach-sender
 */
function getBestSendTiming(product = 'jake') {
  // Look at KB entries for timing insights (brain_fallback_kb may not exist yet)
  const kbTiming = safeAll(`
    SELECT content, tags
    FROM brain_fallback_kb
    WHERE tags LIKE '%timing%' OR tags LIKE '%wait_days%'
    ORDER BY created_at DESC LIMIT 5
  `);

  // Average days to positive outcome
  const avgDays = safeGet(`
    SELECT AVG(days_to_outcome) as avg_days, COUNT(*) as n
    FROM brain_fallback_episodes
    WHERE outcome_score >= 0.7
      AND agent_name LIKE ?
      AND days_to_outcome IS NOT NULL
  `, [`${product}%`]);

  return {
    kbInsights: kbTiming.map(k => k.content).slice(0, 3),
    avgDaysToPositiveReply: avgDays?.avg_days ? Math.round(avgDays.avg_days) : null,
    sampleSize: avgDays?.n || 0,
  };
}

// ─── Knowledge Base Queries ──────────────────────────────────────────────────

/**
 * Get distilled knowledge for a specific content type or domain.
 * Used by: dream-team-nightly, pipeline-director
 */
function getKnowledge(tags = [], limit = 5) {
  if (tags.length === 0) {
    return safeAll(`SELECT content, tags, source_agent FROM brain_fallback_kb ORDER BY created_at DESC LIMIT ?`, [limit]);
  }

  const tagClauses = tags.map(() => `tags LIKE ?`).join(' OR ');
  const tagParams = tags.map(t => `%${t}%`);

  return safeAll(`
    SELECT content, tags, source_agent
    FROM brain_fallback_kb
    WHERE ${tagClauses}
    ORDER BY created_at DESC LIMIT ?
  `, [...tagParams, limit]);
}

/**
 * Get rejection patterns — what NOT to do.
 * Used by: ralph-qa, outreach drafters
 */
function getRejectionPatterns(product = 'jake', limit = 5) {
  return safeAll(`
    SELECT erp_context, contact_title, action_taken, outcome, market
    FROM brain_fallback_episodes
    WHERE outcome_score <= 0.2
      AND agent_name LIKE ?
    ORDER BY created_at DESC LIMIT ?
  `, [`${product}%`, limit]);
}

// ─── Summary for Handlers ────────────────────────────────────────────────────

/**
 * Get a compact brain briefing for a handler.
 * Returns structured data (not a text block) so handlers can use it programmatically.
 */
function getBriefing(agentName, opts = {}) {
  const product = agentName.startsWith('owen') ? 'owen'
    : agentName.startsWith('hoa') ? 'hoa'
    : agentName.startsWith('data-rehab') ? 'data_rehab'
    : 'jake';

  const briefing = {
    product,
    winningAngles: getWinningAngles(product, opts.erpContext),
    rejections: getRejectionPatterns(product, 3),
    timing: getBestSendTiming(product),
    knowledge: getKnowledge(opts.tags || [], 3),
  };

  if (opts.leadId) {
    briefing.leadInsights = getLeadInsights(opts.leadId);
  }

  return briefing;
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  getLeadInsights,
  getWinningAngles,
  getBestSendTiming,
  getKnowledge,
  getRejectionPatterns,
  getBriefing,
};
