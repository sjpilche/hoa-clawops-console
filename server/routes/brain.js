/**
 * @file brain.js
 * @description Collective Brain API — visibility into the cross-agent learning system.
 *
 * GET  /api/brain/stats           — Dashboard stats across all 4 layers
 * GET  /api/brain/observations    — Recent shared observations (Layer 1)
 * GET  /api/brain/feedback        — Recent feedback signals (Layer 2)
 * GET  /api/brain/episodes        — Best episodes by market (Layer 3)
 * GET  /api/brain/knowledge       — Knowledge base contents (Layer 4)
 * POST /api/brain/distill         — Trigger manual distillation run
 * POST /api/brain/feedback        — Manually record a feedback signal
 */

'use strict';

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const brain = require('../services/collectiveBrain');

const router = Router();
router.use(authenticate);

/**
 * GET /api/brain/stats
 * Overview dashboard — counts across all 4 layers.
 */
router.get('/stats', async (req, res, next) => {
  try {
    const stats = await brain.getStats();
    res.json({ stats });
  } catch (err) { next(err); }
});

/**
 * GET /api/brain/observations?session_id=&type=&limit=50
 */
router.get('/observations', async (req, res, next) => {
  try {
    const { session_id, type, limit = 50 } = req.query;
    const types = type ? [type] : [];
    const obs = await brain.getObservations(session_id || '', types, parseInt(limit));
    res.json({ observations: obs, total: obs.length });
  } catch (err) { next(err); }
});

/**
 * GET /api/brain/feedback?agent=&signal=&limit=20
 */
router.get('/feedback', async (req, res, next) => {
  try {
    const { agent, limit = 20 } = req.query;
    const sql = require('mssql');
    const pool = await brain.getPool ? brain.getPool() : null;

    // Direct query since getStats is aggregate-only
    if (!pool) return res.json({ feedback: [] });

    const req2 = pool.request().input('limit', sql.Int, parseInt(limit));
    let query = 'SELECT TOP (@limit) * FROM agent_feedback';
    if (agent) {
      req2.input('agent', sql.NVarChar, agent);
      query += ' WHERE agent_name = @agent';
    }
    query += ' ORDER BY created_at DESC';
    const result = await req2.query(query);
    res.json({ feedback: result.recordset, total: result.recordset.length });
  } catch (err) { next(err); }
});

/**
 * GET /api/brain/episodes?market=&min_score=0.5&limit=20
 */
router.get('/episodes', async (req, res, next) => {
  try {
    const { market, erp, min_score = 0, limit = 20 } = req.query;
    const episodes = await brain.getSimilarEpisodes({
      market:      market  || undefined,
      erpContext:  erp     || undefined,
      minScore:    parseFloat(min_score),
      limit:       parseInt(limit),
    });
    res.json({ episodes, total: episodes.length });
  } catch (err) { next(err); }
});

/**
 * GET /api/brain/knowledge?type=outreach_email&market=&limit=20
 */
router.get('/knowledge', async (req, res, next) => {
  try {
    const { type = 'outreach_email', market, erp, limit = 20 } = req.query;
    const examples = await brain.getKnowledgeExamples(type, {
      market:     market || undefined,
      erpContext: erp    || undefined,
      limit:      parseInt(limit),
    });
    res.json({ examples, total: examples.length });
  } catch (err) { next(err); }
});

/**
 * POST /api/brain/distill
 * Manually trigger the distillation job (runs nightly automatically).
 */
router.post('/distill', async (req, res, next) => {
  try {
    const result = await brain.runDistillation();
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

/**
 * POST /api/brain/feedback
 * Manually record a feedback signal.
 * Body: { agent_name, output_type, output_id, signal, notes, market }
 */
router.post('/feedback', async (req, res, next) => {
  try {
    const { agent_name, output_type, output_id, signal, notes, market } = req.body;
    if (!agent_name || !signal) return res.status(400).json({ error: 'agent_name and signal required' });
    brain.recordFeedback(agent_name, output_type || 'manual', output_id, signal, { notes, market });
    res.json({ success: true });
  } catch (err) { next(err); }
});

/**
 * GET /api/brain/intelligence
 * Comprehensive learning intelligence dashboard — shows how fast the system is learning,
 * what's working, what's not, and where the gaps are.
 */
router.get('/intelligence', async (req, res, next) => {
  try {
    const { all, get } = require('../db/connection');
    const chromaBrain = require('../services/chromaBrain');
    const stats = await brain.getStats();

    // Learning velocity — new entries per day (last 7 days)
    let velocity = { observations: 0, feedback: 0, episodes: 0, knowledge: 0 };
    try {
      const obs7d = get("SELECT COUNT(*) as c FROM brain_fallback_observations WHERE created_at > datetime('now', '-7 days')");
      const fb7d = get("SELECT COUNT(*) as c FROM brain_fallback_feedback WHERE created_at > datetime('now', '-7 days')");
      const ep7d = get("SELECT COUNT(*) as c FROM brain_fallback_episodes WHERE created_at > datetime('now', '-7 days')");
      velocity = {
        observations: Math.round((obs7d?.c || 0) / 7),
        feedback: Math.round((fb7d?.c || 0) / 7),
        episodes: Math.round((ep7d?.c || 0) / 7),
        knowledge: 0, // KB is populated from Azure, not local
      };
    } catch {}

    // Feedback health — approval rate
    let feedbackHealth = { total: 0, approved: 0, rejected: 0, edited: 0, approvalRate: 0 };
    try {
      const fb = all("SELECT signal, COUNT(*) as c FROM brain_fallback_feedback GROUP BY signal");
      for (const row of fb) {
        feedbackHealth.total += row.c;
        if (row.signal === 'approved') feedbackHealth.approved = row.c;
        if (row.signal === 'rejected') feedbackHealth.rejected = row.c;
        if (row.signal === 'edited') feedbackHealth.edited = row.c;
      }
      feedbackHealth.approvalRate = feedbackHealth.total > 0
        ? Math.round((feedbackHealth.approved / feedbackHealth.total) * 100)
        : 0;
    } catch {}

    // Episode quality — outcome distribution
    let episodeQuality = { total: 0, highScore: 0, lowScore: 0, avgScore: 0, byType: {} };
    try {
      const ep = all("SELECT outcome_type, COUNT(*) as c, AVG(outcome_score) as avg FROM brain_fallback_episodes GROUP BY outcome_type");
      for (const row of ep) {
        episodeQuality.total += row.c;
        episodeQuality.byType[row.outcome_type || 'unknown'] = { count: row.c, avgScore: Math.round((row.avg || 0) * 100) };
      }
      const high = get("SELECT COUNT(*) as c FROM brain_fallback_episodes WHERE outcome_score >= 0.7");
      const low = get("SELECT COUNT(*) as c FROM brain_fallback_episodes WHERE outcome_score < 0.3");
      episodeQuality.highScore = high?.c || 0;
      episodeQuality.lowScore = low?.c || 0;
      episodeQuality.avgScore = episodeQuality.total > 0
        ? Math.round((episodeQuality.highScore / episodeQuality.total) * 100)
        : 0;
    } catch {}

    // Agent learning rankings — which agents produce the best outcomes
    let agentRankings = [];
    try {
      agentRankings = all(`
        SELECT agent_name, COUNT(*) as episodes,
               AVG(outcome_score) as avg_score,
               SUM(CASE WHEN outcome_score >= 0.7 THEN 1 ELSE 0 END) as wins,
               SUM(CASE WHEN outcome_score < 0.3 THEN 1 ELSE 0 END) as losses
        FROM brain_fallback_episodes
        GROUP BY agent_name
        HAVING COUNT(*) >= 2
        ORDER BY avg_score DESC
        LIMIT 15
      `).map(r => ({
        agent: r.agent_name,
        episodes: r.episodes,
        avgScore: Math.round((r.avg_score || 0) * 100),
        wins: r.wins,
        losses: r.losses,
        winRate: r.episodes > 0 ? Math.round((r.wins / r.episodes) * 100) : 0,
      }));
    } catch {}

    // ChromaBrain stats
    const chromaStats = chromaBrain.getStats();

    // Learning gaps — what's missing
    const gaps = [];
    if (velocity.episodes < 1) gaps.push('Low episode volume — system needs more outcome data to learn from');
    if (feedbackHealth.total < 10) gaps.push('Low feedback volume — approve/reject more agent outputs to teach the system');
    if (feedbackHealth.approvalRate < 30) gaps.push('Low approval rate — agents may need prompt tuning');
    if (episodeQuality.lowScore > episodeQuality.highScore) gaps.push('More failures than wins — review agent strategies');
    if (!chromaStats.ready) gaps.push('ChromaBrain not initialized — semantic search offline');

    res.json({
      stats,
      velocity,
      feedbackHealth,
      episodeQuality,
      agentRankings,
      chromaBrain: chromaStats,
      gaps,
      timestamp: new Date().toISOString(),
    });
  } catch (err) { next(err); }
});

/**
 * GET /api/brain/autonomy-dashboard
 * Combined view of all autonomous systems: auto-approval, outcome attribution,
 * market intelligence, schedule health.
 */
router.get('/autonomy-dashboard', async (req, res, next) => {
  try {
    const { all, get } = require('../db/connection');

    // Auto-approval stats
    let autoApproval = {};
    try {
      const engine = require('../services/autoApprovalEngine');
      autoApproval = engine.getAutoApprovalStats();
    } catch { autoApproval = { enabled: false, paused: false }; }

    // Auto-approval recent activity
    let autoApprovalActivity = [];
    try {
      const engine = require('../services/autoApprovalEngine');
      autoApprovalActivity = engine.getRecentActivity(10);
    } catch {}

    // Market intelligence
    let marketIntel = [];
    try {
      marketIntel = all(`
        SELECT market,
          COUNT(*) as total,
          ROUND(AVG(outcome_score), 2) as avg_score,
          SUM(CASE WHEN outcome_type IN ('replied', 'booked', 'converted') THEN 1 ELSE 0 END) as wins,
          SUM(CASE WHEN outcome_type IN ('bounced', 'failed') THEN 1 ELSE 0 END) as losses
        FROM brain_fallback_episodes
        WHERE market IS NOT NULL AND market != ''
        GROUP BY market
        HAVING COUNT(*) >= 2
        ORDER BY avg_score DESC
        LIMIT 15
      `).map(m => ({
        market: m.market,
        total: m.total,
        avgScore: Math.round((m.avg_score || 0) * 100),
        wins: m.wins,
        losses: m.losses,
        winRate: m.total > 0 ? Math.round((m.wins / m.total) * 100) : 0,
      }));
    } catch {}

    // Schedule health
    let scheduleHealth = {};
    try {
      const perf = require('../services/schedulePerformance');
      scheduleHealth = perf.getPerformanceSummary();
    } catch { scheduleHealth = { green: 0, yellow: 0, red: 0, paused: 0 }; }

    // Outcome attribution stats — how many episodes have real vs placeholder outcomes
    let outcomeAttribution = { real: 0, placeholder: 0, total: 0 };
    try {
      const real = get("SELECT COUNT(*) as c FROM brain_fallback_episodes WHERE outcome_type IN ('replied', 'bounced', 'opened', 'clicked', 'delivered', 'booked', 'converted', 'spam_report', 'replied_negative', 'lost')");
      const placeholder = get("SELECT COUNT(*) as c FROM brain_fallback_episodes WHERE outcome_type IN ('completed', 'low_output', 'failed')");
      outcomeAttribution = {
        real: real?.c || 0,
        placeholder: placeholder?.c || 0,
        total: (real?.c || 0) + (placeholder?.c || 0),
      };
    } catch {}

    res.json({
      autoApproval,
      autoApprovalActivity,
      marketIntel,
      scheduleHealth,
      outcomeAttribution,
      timestamp: new Date().toISOString(),
    });
  } catch (err) { next(err); }
});

/**
 * GET /api/brain/funnel
 * Daily funnel metrics — the numbers that matter for revenue.
 * Shows: leads → enriched → cadence → sent → opened → replied → meeting → pilot → paid
 */
router.get('/funnel', async (req, res, next) => {
  try {
    const { all, get } = require('../db/connection');
    const days = parseInt(req.query.days) || 30;

    // Lead funnel counts
    const totalLeads = get("SELECT COUNT(*) as c FROM cfo_leads")?.c || 0;
    const enrichedLeads = get("SELECT COUNT(*) as c FROM cfo_leads WHERE enrichment_status = 'enriched'")?.c || 0;
    const cadenceActive = get("SELECT COUNT(*) as c FROM cfo_leads WHERE cadence_active = 1")?.c || 0;
    const contacted = get("SELECT COUNT(*) as c FROM cfo_leads WHERE status IN ('contacted', 'replied', 'meeting_booked', 'pilot', 'closed_won')")?.c || 0;
    const replied = get("SELECT COUNT(*) as c FROM cfo_leads WHERE status IN ('replied', 'meeting_booked', 'pilot', 'closed_won')")?.c || 0;
    const meetings = get("SELECT COUNT(*) as c FROM cfo_leads WHERE status IN ('meeting_booked', 'pilot', 'closed_won')")?.c || 0;
    const pilots = get("SELECT COUNT(*) as c FROM cfo_leads WHERE status IN ('pilot', 'closed_won')")?.c || 0;
    const closedWon = get("SELECT COUNT(*) as c FROM cfo_leads WHERE status = 'closed_won'")?.c || 0;
    const closedLost = get("SELECT COUNT(*) as c FROM cfo_leads WHERE status = 'closed_lost'")?.c || 0;

    // Outreach stats (last N days)
    const emailsSent = get(`SELECT COUNT(*) as c FROM cfo_outreach_sequences WHERE status = 'sent' AND sent_at > datetime('now', '-${days} days')`)?.c || 0;
    const emailsOpened = get(`SELECT COUNT(*) as c FROM cfo_outreach_sequences WHERE delivery_status = 'delivered' AND sent_at > datetime('now', '-${days} days')`)?.c || 0;
    const emailsBounced = get(`SELECT COUNT(*) as c FROM cfo_outreach_sequences WHERE status = 'bounced' AND sent_at > datetime('now', '-${days} days')`)?.c || 0;
    const draftsHeld = get("SELECT COUNT(*) as c FROM cfo_outreach_sequences WHERE status = 'draft'")?.c || 0;
    const draftsApproved = get("SELECT COUNT(*) as c FROM cfo_outreach_sequences WHERE status = 'approved' AND sent_at IS NULL")?.c || 0;

    // Auto-approval stats
    const autoApproved = get(`SELECT COUNT(*) as c FROM cfo_outreach_sequences WHERE auto_approval_decision = 'approved' AND auto_approved_at > datetime('now', '-${days} days')`)?.c || 0;

    // Cadence touches
    const touchesSent = get(`SELECT COUNT(*) as c FROM cadence_touches WHERE status = 'sent' AND sent_at > datetime('now', '-${days} days')`)?.c || 0;
    const touchesPending = get("SELECT COUNT(*) as c FROM cadence_touches WHERE status = 'pending'")?.c || 0;

    // Today's activity
    const sentToday = get("SELECT COUNT(*) as c FROM cfo_outreach_sequences WHERE status = 'sent' AND DATE(sent_at) = DATE('now')")?.c || 0;
    const repliedToday = get("SELECT COUNT(*) as c FROM cfo_leads WHERE status = 'replied' AND DATE(updated_at) = DATE('now')")?.c || 0;

    // Conversion rates
    const replyRate = contacted > 0 ? Math.round((replied / contacted) * 100) : 0;
    const bounceRate = emailsSent > 0 ? Math.round((emailsBounced / emailsSent) * 100) : 0;

    // Top performing markets
    let topMarkets = [];
    try {
      topMarkets = all(`
        SELECT city || ', ' || state as market, COUNT(*) as leads,
          SUM(CASE WHEN status IN ('replied','meeting_booked','pilot','closed_won') THEN 1 ELSE 0 END) as conversions
        FROM cfo_leads
        WHERE city IS NOT NULL AND state IS NOT NULL
        GROUP BY city, state
        HAVING COUNT(*) >= 3
        ORDER BY conversions DESC
        LIMIT 10
      `).map(m => ({
        market: m.market,
        leads: m.leads,
        conversions: m.conversions,
        convRate: m.leads > 0 ? Math.round((m.conversions / m.leads) * 100) : 0,
      }));
    } catch {}

    // Revenue pipeline value
    let pipelineValue = 0;
    try {
      const rv = get("SELECT SUM(close_value_cents) as total FROM cfo_revenue_events WHERE event_type = 'deal_won'");
      pipelineValue = (rv?.total || 0) / 100;
    } catch {}

    res.json({
      funnel: {
        totalLeads,
        enriched: enrichedLeads,
        cadenceActive,
        contacted,
        replied,
        meetings,
        pilots,
        closedWon,
        closedLost,
      },
      outreach: {
        emailsSent,
        emailsOpened,
        emailsBounced,
        draftsHeld,
        draftsApproved,
        autoApproved,
        bounceRate,
      },
      cadence: {
        touchesSent,
        touchesPending,
      },
      today: {
        sent: sentToday,
        replied: repliedToday,
      },
      rates: {
        replyRate,
        bounceRate,
        enrichmentRate: totalLeads > 0 ? Math.round((enrichedLeads / totalLeads) * 100) : 0,
        cadenceRate: enrichedLeads > 0 ? Math.round((cadenceActive / enrichedLeads) * 100) : 0,
      },
      topMarkets,
      pipelineValue,
      period: `${days}d`,
      timestamp: new Date().toISOString(),
    });
  } catch (err) { next(err); }
});

module.exports = router;
