/**
 * @file urgencyScorer.js
 * @description ClawOps 2.0 Upgrade A — Urgency / Intent Scorer
 *
 * Scores every lead (0–100) across four dimensions:
 *   Fit         30%  — pilot_fit_score already computed by lead-scout
 *   Pain/Intent 40%  — hiring posts, permit activity, lien signals, board minutes
 *   Timeliness  20%  — how recently was the lead discovered / enriched?
 *   Enrichment  10%  — quality of contact data we have
 *
 * Dual-product: scores cfo_leads (Jake pipeline) AND lg_engagement_queue (HOA pipeline).
 * Writes urgency_score, urgency_signals (JSON), urgency_updated_at to each table.
 * On finish, posts a summary Discord embed and writes a brain Layer-3 episode.
 *
 * EXPORTS:
 *   scoreLead(leadId, product)           — score one cfo_lead
 *   scoreEngagement(engagementId)        — score one lg_engagement_queue row
 *   scoreAllLeads(limit, product)        — batch-score cfo_leads
 *   scoreAllEngagements(limit)           — batch-score lg_engagement_queue rows
 */

'use strict';

const { get, all, run } = require('../db/connection');

// Brain reader for learned insights (non-fatal if not available)
let brainReader;
try { brainReader = require('./brainReader'); } catch { brainReader = null; }

// ── Scoring weights (must sum to 1.0) ─────────────────────────────────────
const W_FIT         = 0.30;   // pilot_fit_score / 100  (already 0-100)
const W_PAIN_INTENT = 0.40;   // signals from notes, pain keywords, job postings etc.
const W_TIMELINESS  = 0.20;   // recency of discovery + enrichment
const W_ENRICHMENT  = 0.10;   // contact completeness

// ── Pain / intent keyword lists ────────────────────────────────────────────
const HIGH_INTENT_SIGNALS = [
  'hiring', 'controller', 'cfo', 'accounting manager', 'financial analyst',
  'quickbooks chaos', 'excel spreadsheet', 'manual process', 'data mess',
  'permit pulled', 'permit issued', 'bid awarded', 'contract awarded',
  'ar backlog', 'collections problem', 'cash flow issue', 'overrun',
  'switching erp', 'looking for erp', 'erp migration', 'netsuita', 'sage',
  'construction accounting', 'job costing', 'wip schedule',
  'lien filed', 'mechanics lien', 'retainage dispute',
];

// HOA-specific pain signals for lg_engagement_queue
const HOA_INTENT_SIGNALS = [
  'special assessment', 'reserve fund', 'underfunded', 'delinquent dues',
  'roof replacement', 'hvac replacement', 'pool repair', 'major repair',
  'struggling financially', 'budget shortfall', 'need funding', 'loan',
  'hoa management', 'self managed', 'property management',
  'unhappy residents', 'board dispute', 'management company complaint',
];

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Count how many signals from a list appear in a text blob (case-insensitive).
 */
function countSignals(text, signalList) {
  if (!text) return { count: 0, matched: [] };
  const lower = text.toLowerCase();
  const matched = signalList.filter(s => lower.includes(s));
  return { count: matched.length, matched };
}

/**
 * Recency score (0–100): full score if < 3 days, decays over 30 days.
 */
function recencyScore(dateStr) {
  if (!dateStr) return 30; // no date → assume moderate age
  const ageDays = (Date.now() - new Date(dateStr).getTime()) / 86400000;
  if (ageDays <= 3)  return 100;
  if (ageDays <= 7)  return 85;
  if (ageDays <= 14) return 65;
  if (ageDays <= 30) return 40;
  if (ageDays <= 60) return 20;
  return 5;
}

/**
 * Enrichment quality score (0–100).
 */
function enrichmentScore(lead) {
  let score = 0;
  if (lead.contact_email)   score += 50;
  if (lead.contact_name)    score += 20;
  if (lead.contact_title)   score += 10;
  if (lead.phone)           score += 10;
  if (lead.contact_linkedin) score += 10;
  return Math.min(score, 100);
}

// ═══════════════════════════════════════════════════════════════════════════
// CFO_LEADS SCORING  (Jake + CFO marketing pipeline)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Score a single cfo_lead row.
 * @param {number} leadId
 * @param {'jake'|'cfo'|'both'} [product='jake']
 * @returns {{ score: number, signals: object[], breakdown: object }}
 */
function scoreLead(leadId, product = 'jake') {
  const lead = get('SELECT * FROM cfo_leads WHERE id = ?', [leadId]);
  if (!lead) throw new Error(`Lead ${leadId} not found`);

  const signals = [];

  // ── Component 1: Fit (30%) ───────────────────────────────────────────────
  const fitRaw   = lead.pilot_fit_score || 0;
  const fitScore = Math.min(fitRaw, 100);

  // ── Component 2: Pain / Intent (40%) ────────────────────────────────────
  const textBlob = [
    lead.notes,
    lead.pilot_fit_reason,
    lead.erp_type,
    lead.contact_title,
  ].filter(Boolean).join(' ');

  const { count: painCount, matched: painMatched } = countSignals(textBlob, HIGH_INTENT_SIGNALS);
  const painScore = Math.min(painCount * 15, 100);  // cap at 100, each signal worth 15pts
  if (painMatched.length > 0) {
    signals.push({ type: 'pain_signals', items: painMatched, weight: 'high' });
  }

  // Bonus: ERP type that's a perfect fit for Jake (QB/Excel users are best leads)
  const erp = (lead.erp_type || '').toLowerCase();
  let erpBonus = 0;
  if (erp.includes('quickbooks') || erp.includes('qb'))  erpBonus = 20;
  else if (erp.includes('excel') || erp.includes('spreadsheet')) erpBonus = 25;
  else if (erp.includes('sage'))  erpBonus = 15;
  else if (erp.includes('unknown') || erp === '') erpBonus = 5;
  if (erpBonus > 0) signals.push({ type: 'erp_fit', erp: lead.erp_type, bonus: erpBonus });

  const painFinal = Math.min(painScore + erpBonus, 100);

  // ── Component 3: Timeliness (20%) ────────────────────────────────────────
  // Use enriched_at if available, else created_at
  const refDate  = lead.enriched_at || lead.created_at;
  const timeScore = recencyScore(refDate);
  signals.push({ type: 'recency', date: refDate, days_old: refDate
    ? Math.round((Date.now() - new Date(refDate).getTime()) / 86400000)
    : null });

  // ── Component 4: Enrichment quality (10%) ────────────────────────────────
  const enrichScore = enrichmentScore(lead);
  signals.push({ type: 'enrichment', has_email: !!lead.contact_email, has_phone: !!lead.phone, score: enrichScore });

  // ── Component 5: Brain bonus (up to +15 points) ──────────────────────────
  // Leads with positive brain history get a boost; leads with rejection history get penalized.
  let brainBonus = 0;
  if (brainReader) {
    try {
      const insights = brainReader.getLeadInsights(leadId);
      if (insights.wasConverted) brainBonus = 15;
      else if (insights.bestOutcome && insights.bestOutcome.outcome_score >= 0.7) brainBonus = 10;
      else if (insights.hasHistory && !insights.wasRejected) brainBonus = 5;
      else if (insights.wasRejected) brainBonus = -10;

      // Also check if this lead's ERP/market combo has winning patterns
      const angles = brainReader.getWinningAngles(product, lead.erp_type);
      if (angles.totalWins >= 3) brainBonus += 5; // proven market
      if (brainBonus !== 0) {
        signals.push({ type: 'brain_context', bonus: brainBonus, wins: angles.totalWins, wasRejected: insights.wasRejected });
      }
    } catch {} // Non-fatal
  }

  // ── Composite score ───────────────────────────────────────────────────────
  const composite = Math.min(100, Math.max(0, Math.round(
    fitScore    * W_FIT         +
    painFinal   * W_PAIN_INTENT +
    timeScore   * W_TIMELINESS  +
    enrichScore * W_ENRICHMENT  +
    brainBonus
  )));

  const breakdown = { fit: fitScore, pain_intent: painFinal, timeliness: timeScore, enrichment: enrichScore, brain_bonus: brainBonus };

  // Persist to DB
  run(
    `UPDATE cfo_leads SET urgency_score=?, urgency_signals=?, urgency_updated_at=datetime('now'), updated_at=datetime('now') WHERE id=?`,
    [composite, JSON.stringify(signals), leadId]
  );

  return { score: composite, signals, breakdown };
}

/**
 * Score all un-scored (or stale) cfo_leads.
 * @param {number} [limit=300]
 * @param {'jake'|'cfo'|'both'} [product='both']
 * @returns {{ scored: number, avg_score: number, top_leads: object[], errors: number }}
 */
function scoreAllLeads(limit = 300, product = 'both') {
  // Get leads that haven't been scored in the last 7 days (or never)
  let query = `
    SELECT id, company_name, urgency_score
    FROM cfo_leads
    WHERE (urgency_updated_at IS NULL OR DATE(urgency_updated_at) <= DATE('now', '-7 days'))
      AND status NOT IN ('unsubscribed', 'bounced', 'bad_contact')
  `;
  const params = [];

  if (product !== 'both') {
    query += ' AND source_agent = ?';
    params.push(product);
  }

  query += ' ORDER BY pilot_fit_score DESC, created_at DESC LIMIT ?';
  params.push(limit);

  const leads = all(query, params);

  const results = [];
  let errors = 0;

  for (const lead of leads) {
    try {
      const { score, signals } = scoreLead(lead.id, product);
      results.push({ id: lead.id, company: lead.company_name, score, prev_score: lead.urgency_score });
    } catch (err) {
      console.error(`[UrgencyScorer] Failed to score lead ${lead.id}:`, err.message);
      errors++;
    }
  }

  const avgScore = results.length > 0
    ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length)
    : 0;

  const topLeads = [...results]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return { scored: results.length, avg_score: avgScore, top_leads: topLeads, errors };
}

// ═══════════════════════════════════════════════════════════════════════════
// LG_ENGAGEMENT_QUEUE SCORING  (HOA pipeline)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Score a single lg_engagement_queue row.
 * @param {number} engagementId
 * @returns {{ score: number, signals: object[], breakdown: object }}
 */
function scoreEngagement(engagementId) {
  const eng = get('SELECT * FROM lg_engagement_queue WHERE id = ?', [engagementId]);
  if (!eng) throw new Error(`Engagement ${engagementId} not found`);

  const signals = [];

  // ── Component 1: Fit — use relevance_score (0–100) ───────────────────────
  const fitScore = Math.min(eng.relevance_score || 50, 100);

  // ── Component 2: Pain / Intent (40%) ────────────────────────────────────
  const textBlob = [eng.post_title, eng.post_summary, eng.draft_response].filter(Boolean).join(' ');
  const { count: painCount, matched: painMatched } = countSignals(textBlob, HOA_INTENT_SIGNALS);
  const painScore = Math.min(painCount * 20, 100);
  if (painMatched.length > 0) {
    signals.push({ type: 'hoa_pain_signals', items: painMatched, weight: 'high' });
  }

  // Platform bonus: higher-quality platforms get a slight boost
  const platformBonus = { facebook: 10, linkedin: 15, reddit: 5, nextdoor: 10 }[eng.platform] || 0;
  if (platformBonus > 0) signals.push({ type: 'platform_quality', platform: eng.platform, bonus: platformBonus });
  const painFinal = Math.min(painScore + platformBonus, 100);

  // ── Component 3: Timeliness (20%) ────────────────────────────────────────
  const postAgeHours = eng.post_age_hours || 48;
  let timeScore;
  if (postAgeHours <= 6)   timeScore = 100;
  else if (postAgeHours <= 24)  timeScore = 85;
  else if (postAgeHours <= 72)  timeScore = 65;
  else if (postAgeHours <= 168) timeScore = 40; // 1 week
  else                          timeScore = 15;
  signals.push({ type: 'post_age_hours', hours: postAgeHours });

  // ── Component 4: Enrichment — does the draft include a link? ─────────────
  const enrichScore = eng.includes_link ? 80 : 40;
  signals.push({ type: 'has_link', includes_link: !!eng.includes_link });

  // ── Composite ─────────────────────────────────────────────────────────────
  const composite = Math.round(
    fitScore    * W_FIT         +
    painFinal   * W_PAIN_INTENT +
    timeScore   * W_TIMELINESS  +
    enrichScore * W_ENRICHMENT
  );

  const breakdown = { fit: fitScore, pain_intent: painFinal, timeliness: timeScore, enrichment: enrichScore };

  run(
    `UPDATE lg_engagement_queue SET urgency_score=?, urgency_signals=?, urgency_updated_at=datetime('now'), updated_at=datetime('now') WHERE id=?`,
    [composite, JSON.stringify(signals), engagementId]
  );

  return { score: composite, signals, breakdown };
}

/**
 * Score all pending/approved lg_engagement_queue rows.
 * @param {number} [limit=200]
 * @returns {{ scored: number, avg_score: number, top_items: object[], errors: number }}
 */
function scoreAllEngagements(limit = 200) {
  const items = all(
    `SELECT id, post_title, urgency_score
     FROM lg_engagement_queue
     WHERE status IN ('pending_review', 'approved')
       AND (urgency_updated_at IS NULL OR DATE(urgency_updated_at) <= DATE('now', '-3 days'))
     ORDER BY relevance_score DESC
     LIMIT ?`,
    [limit]
  );

  const results = [];
  let errors = 0;

  for (const item of items) {
    try {
      const { score } = scoreEngagement(item.id);
      results.push({ id: item.id, title: (item.post_title || '').slice(0, 60), score });
    } catch (err) {
      console.error(`[UrgencyScorer] Failed to score engagement ${item.id}:`, err.message);
      errors++;
    }
  }

  const avgScore = results.length > 0
    ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length)
    : 0;

  const topItems = [...results].sort((a, b) => b.score - a.score).slice(0, 10);

  return { scored: results.length, avg_score: avgScore, top_items: topItems, errors };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXPORT — called by the SPECIAL_HANDLER in runs.js
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run a full urgency scoring pass over both pipelines.
 * @param {{ limit?: number, product?: string }} [opts]
 * @returns {{ leads: object, engagements: object, summary: string }}
 */
async function runUrgencyScorer({ limit = 300, product = 'both' } = {}) {
  console.log(`[UrgencyScorer] Starting — limit:${limit} product:${product}`);
  const startMs = Date.now();

  // Score leads
  const leadsResult = scoreAllLeads(limit, product);

  // Score HOA engagements
  const engResult = scoreAllEngagements(200);

  const durationSec = ((Date.now() - startMs) / 1000).toFixed(1);

  // ── Brain Layer 1: write top signals as observations ──────────────────────
  try {
    const brain = require('./collectiveBrain');
    const today = new Date().toISOString().slice(0, 10);
    const sessionId = `urgency-scorer-${today}`;

    // Top 5 jake leads
    for (const lead of leadsResult.top_leads.slice(0, 5)) {
      brain.observe(sessionId, 'urgency-scorer', 'lead_signal', {
        subject: lead.company,
        content: `Urgency score: ${lead.score}/100 (was ${lead.prev_score || 0}). High-priority contact candidate.`,
        confidence: lead.score / 100,
        metadata: { lead_id: lead.id, urgency_score: lead.score },
      });
    }

    // Market-level insight
    brain.observe(sessionId, 'urgency-scorer', 'market_insight', {
      subject: 'Full pipeline urgency pass',
      content: `Scored ${leadsResult.scored} leads (avg ${leadsResult.avg_score}/100) + ${engResult.scored} HOA engagements (avg ${engResult.avg_score}/100). Errors: ${leadsResult.errors + engResult.errors}.`,
      confidence: 1.0,
      metadata: { leads_scored: leadsResult.scored, eng_scored: engResult.scored, product },
    });
  } catch (brainErr) {
    console.warn('[UrgencyScorer] Brain write skipped (non-fatal):', brainErr.message);
  }

  // ── Discord notification ───────────────────────────────────────────────────
  try {
    const discord = require('./discordNotifier');
    const topLeadLines = leadsResult.top_leads.slice(0, 5)
      .map((l, i) => `${i + 1}. **${l.company}** — ${l.score}/100`)
      .join('\n') || 'None scored';
    await discord.postWebhook({
      embeds: [{
        title: '🎯 Urgency Scorer Complete',
        color: 0x2ecc71,
        fields: [
          { name: 'Jake Leads', value: `${leadsResult.scored} scored · avg ${leadsResult.avg_score}/100`, inline: true },
          { name: 'HOA Engagements', value: `${engResult.scored} scored · avg ${engResult.avg_score}/100`, inline: true },
          { name: 'Duration', value: `${durationSec}s`, inline: true },
          { name: 'Top Priority Leads', value: topLeadLines, inline: false },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'ClawOps · Urgency Scorer' },
      }],
    });
  } catch (discordErr) {
    console.warn('[UrgencyScorer] Discord notification skipped (non-fatal):', discordErr.message);
  }

  const summary = [
    `Urgency Scorer: ${leadsResult.scored} leads scored (avg ${leadsResult.avg_score}/100), ${engResult.scored} HOA items scored (avg ${engResult.avg_score}/100) in ${durationSec}s`,
    leadsResult.top_leads.length > 0
      ? `  Top lead: ${leadsResult.top_leads[0].company} — ${leadsResult.top_leads[0].score}/100`
      : '  No leads scored this pass',
  ].join('\n');

  return {
    leads: leadsResult,
    engagements: engResult,
    summary,
    duration_ms: Date.now() - startMs,
  };
}

module.exports = { scoreLead, scoreEngagement, scoreAllLeads, scoreAllEngagements, runUrgencyScorer };
