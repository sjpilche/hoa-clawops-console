/**
 * @file dreamTeam.js
 * @description API routes for Dream Team scorecard data
 *
 * Endpoints:
 *   GET /api/dream-team/scorecards         — Scorecards list (filterable by days, agent)
 *   GET /api/dream-team/scorecards/latest  — Most recent scorecard per agent with trend data
 */

'use strict';

const { Router } = require('express');
const { all } = require('../db/connection');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

// ═══════════════════════════════════════════════════════════════════════════
// SCORECARDS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/dream-team/scorecards
 * Query dt_scorecards table with optional filters.
 * Query params: days (default 7), agent_name (optional)
 */
router.get('/scorecards', (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const agent_name = req.query.agent_name || null;

    let query = `
      SELECT *
      FROM dt_scorecards
      WHERE score_date >= date('now', '-' || ? || ' days')
    `;
    const params = [days];

    if (agent_name) {
      query += ' AND agent_name = ?';
      params.push(agent_name);
    }

    query += ' ORDER BY score_date DESC, agent_name ASC';

    const scorecards = all(query, params);
    res.json({ success: true, scorecards });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/dream-team/scorecards/latest
 * Returns the most recent scorecard per agent with trend arrow data.
 */
router.get('/scorecards/latest', (req, res, next) => {
  try {
    const scorecards = all(`
      SELECT s.*
      FROM dt_scorecards s
      INNER JOIN (
        SELECT agent_name, MAX(score_date) AS max_date
        FROM dt_scorecards
        GROUP BY agent_name
      ) latest ON s.agent_name = latest.agent_name AND s.score_date = latest.max_date
      ORDER BY s.agent_name ASC
    `);

    res.json({ success: true, scorecards });
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TODD — PIPELINE COMMANDER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/dream-team/todd/monitor
 * Run Todd's pipeline monitoring cycle (every 2 hours normally).
 */
router.post('/todd/monitor', (req, res, next) => {
  try {
    const { toddPipelineMonitor } = require('../services/toddPipelineCheck');
    const result = toddPipelineMonitor();
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

/**
 * POST /api/dream-team/todd/briefing
 * Run Todd's morning briefing (7 AM normally). Posts to Discord.
 */
router.post('/todd/briefing', (req, res, next) => {
  try {
    const { toddMorningBriefing } = require('../services/toddPipelineCheck');
    const result = toddMorningBriefing();
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

/**
 * GET /api/dream-team/kpis
 * The 5 core KPIs from the Operating Constitution.
 */
router.get('/kpis', (req, res, next) => {
  try {
    const { getCorKPIs } = require('../services/toddPipelineCheck');
    res.json(getCorKPIs());
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════════════
// TODD — PIPELINE ACTIONS (manual triggers)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/dream-team/todd/execute-pending
 * Force-execute pending cadence runs. The missing pipeline link.
 */
router.post('/todd/execute-pending', async (req, res, next) => {
  try {
    const { all: dbAll, get: dbGet, run: dbRun } = require('../db/connection');
    const pendingRuns = dbAll(`
      SELECT r.id, r.agent_id, r.result_data, a.name as agent_name, a.config
      FROM runs r JOIN agents a ON a.id = r.agent_id
      WHERE r.status = 'pending' AND (r.trigger = 'cadence' OR r.trigger = 'auto-reply')
      ORDER BY r.created_at ASC LIMIT 5
    `);

    if (pendingRuns.length === 0) {
      return res.json({ success: true, message: 'No pending cadence runs', processed: 0 });
    }

    const results = [];
    for (const pr of pendingRuns) {
      const agentConfig = JSON.parse(pr.config || '{}');
      const resultData = JSON.parse(pr.result_data || '{}');
      // The cadence engine stores the full message payload in result_data.message
      const message = resultData.message || resultData.outputText || 'Generate outreach email for this lead.';

      dbRun("UPDATE runs SET status = 'running', updated_at = datetime('now') WHERE id = ?", [pr.id]);

      try {
        const bridge = require('../services/openclawBridge');
        const brain = require('../services/collectiveBrain');
        let brainContext = '';
        try { brainContext = await brain.buildAgentContext(pr.agent_name, pr.id, {}) || ''; } catch {}
        // Ensure message is never empty — OpenClaw requires --message to have content
        const enrichedMessage = (brainContext + '\n' + message).trim().slice(0, 6000) || 'Generate outreach email.';

        const result = await bridge.runAgent(pr.agent_name, {
          openclawId: agentConfig.openclaw_id || pr.agent_name,
          message: enrichedMessage,
          sessionId: pr.id,
        });

        const outputText = result?.outputText || result?.output || '';
        dbRun("UPDATE runs SET status='completed', completed_at=datetime('now'), result_data=?, updated_at=datetime('now') WHERE id=?",
          [JSON.stringify({ ...resultData, outputText }), pr.id]);

        const { postProcessLLMOutput } = require('../services/postProcessor');
        const agent = dbGet('SELECT * FROM agents WHERE id = ?', [pr.agent_id]);
        if (agent && outputText) postProcessLLMOutput(agent, outputText, message, { runId: pr.id });

        results.push({ id: pr.id, agent: pr.agent_name, status: 'completed', outputLength: outputText.length });
      } catch (err) {
        dbRun("UPDATE runs SET status='failed', error_msg=?, updated_at=datetime('now') WHERE id=?", [err.message, pr.id]);
        results.push({ id: pr.id, agent: pr.agent_name, status: 'failed', error: err.message });
      }
    }

    res.json({ success: true, processed: results.length, results });
  } catch (err) { next(err); }
});

/**
 * POST /api/dream-team/todd/warmup
 * Force-run the lead warmup cycle. Todd's job: nothing sits idle.
 */
router.post('/todd/warmup', async (req, res, next) => {
  try {
    const { runWarmupCycle } = require('../services/leadAutoWarmup');
    const result = await runWarmupCycle();
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

/**
 * POST /api/dream-team/todd/cadence
 * Force-run the cadence cycle. Todd's job: leads flow.
 */
router.post('/todd/cadence', async (req, res, next) => {
  try {
    const { runCadenceCycle } = require('../services/tenacityCadenceEngine');
    const result = await runCadenceCycle('both');
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════════════
// SCOUT — APOLLO LEAD MINER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/dream-team/scout/mine
 * Run Apollo Lead Miner. Body: { list: 'core_cfos'|'tinkerer_cfos'|'data_pain', pages: 1-3 }
 */
router.post('/scout/mine', async (req, res, next) => {
  try {
    const { mineAndScore } = require('../services/apolloLeadMiner');
    const list = req.body.list || 'core_cfos';
    const pages = Math.min(parseInt(req.body.pages) || 1, 3);
    const result = await mineAndScore(list, { pages });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

/**
 * GET /api/dream-team/scout/credits
 * Check Apollo credit usage.
 */
router.get('/scout/credits', (req, res) => {
  const { getCreditStatus } = require('../services/apolloLeadMiner');
  res.json(getCreditStatus());
});

// ═══════════════════════════════════════════════════════════════════════════
// MANUAL PATTERN CREATION — Steve teaches the system directly
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/dream-team/patterns
 * Manually create a learned pattern.
 * Body: { agent_name, pattern_text, category, confidence }
 */
router.post('/patterns', (req, res, next) => {
  try {
    const { run, get } = require('../db/connection');
    const { agent_name, pattern_text, category, confidence } = req.body;

    if (!agent_name || !pattern_text) {
      return res.status(400).json({ error: 'agent_name and pattern_text required' });
    }

    const crypto = require('crypto');
    const id = crypto.randomUUID();
    run(
      `INSERT INTO dt_learned_patterns (id, agent_name, pattern_text, category, status, confidence, proposed_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, 'steve', datetime('now'), datetime('now'))`,
      [id, agent_name, pattern_text, category || 'workflow', confidence || 0.8]
    );

    // Audit trail
    try {
      run(
        `INSERT INTO dt_pattern_audit (pattern_id, action, actor, reason, created_at)
         VALUES (?, 'activate', 'steve', 'Manual pattern creation via Dream Team UI', datetime('now'))`,
        [id]
      );
    } catch {}

    const pattern = get('SELECT * FROM dt_learned_patterns WHERE id = ?', [id]);
    res.json({ success: true, pattern });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/dream-team/patterns/:id
 * Update pattern status (suspend, archive, activate).
 * Body: { status, reason }
 */
router.put('/patterns/:id', (req, res, next) => {
  try {
    const { run, get } = require('../db/connection');
    const { status, reason } = req.body;
    const { id } = req.params;

    if (!['active', 'suspended', 'archived'].includes(status)) {
      return res.status(400).json({ error: 'Status must be active, suspended, or archived' });
    }

    run('UPDATE dt_learned_patterns SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', [status, id]);

    try {
      run(
        `INSERT INTO dt_pattern_audit (pattern_id, action, actor, reason, created_at)
         VALUES (?, ?, 'steve', ?, datetime('now'))`,
        [id, status === 'active' ? 'activate' : status, reason || `Manual ${status} via UI`]
      );
    } catch {}

    const pattern = get('SELECT * FROM dt_learned_patterns WHERE id = ?', [id]);
    res.json({ success: true, pattern });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
