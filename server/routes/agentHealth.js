/**
 * @file agentHealth.js (routes)
 * @description Agent health scorecard API — per-agent metrics for the directory page.
 *
 * ENDPOINTS:
 *   GET /api/health/agents          — All agents with health metrics
 *   GET /api/health/agents/:id      — Single agent health details
 *   GET /api/health/agents/summary  — Fleet-wide health summary
 */

const { Router } = require('express');
const { all, get } = require('../db/connection');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

/**
 * GET /api/health/agents/summary
 * Fleet-wide health stats.
 */
router.get('/summary', (req, res, next) => {
  try {
    const totalAgents = get('SELECT COUNT(*) AS c FROM agents')?.c || 0;
    const activeAgents = get("SELECT COUNT(*) AS c FROM agents WHERE total_runs > 0")?.c || 0;
    const runningNow = get("SELECT COUNT(*) AS c FROM agents WHERE status = 'running'")?.c || 0;

    const todayRuns = get("SELECT COUNT(*) AS c, COALESCE(SUM(cost_usd), 0) AS cost FROM runs WHERE DATE(created_at) = DATE('now')")
      || { c: 0, cost: 0 };
    const weekRuns = get("SELECT COUNT(*) AS c, COALESCE(SUM(cost_usd), 0) AS cost FROM runs WHERE DATE(created_at) >= DATE('now', '-7 days')")
      || { c: 0, cost: 0 };

    const failRate7d = get(`
      SELECT CASE WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND(CAST(SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS REAL) / COUNT(*) * 100, 1)
      END AS rate
      FROM runs WHERE DATE(created_at) >= DATE('now', '-7 days')
    `)?.rate || 0;

    const avgDuration7d = get(`
      SELECT ROUND(AVG(duration_ms), 0) AS avg_ms
      FROM runs WHERE status = 'completed' AND DATE(created_at) >= DATE('now', '-7 days')
    `)?.avg_ms || 0;

    // Agents with worst success rates (at least 5 runs)
    const worstAgents = all(`
      SELECT a.name, a.success_rate, a.total_runs
      FROM agents a WHERE a.total_runs >= 5
      ORDER BY a.success_rate ASC LIMIT 5
    `);

    // Agents that haven't run in 7+ days but have run before
    const staleAgents = all(`
      SELECT a.name, a.last_run_at, a.total_runs
      FROM agents a
      WHERE a.total_runs > 0 AND DATE(a.last_run_at) < DATE('now', '-7 days')
      ORDER BY a.last_run_at ASC LIMIT 10
    `);

    res.json({
      fleet: { totalAgents, activeAgents, runningNow },
      today: { runs: todayRuns.c, cost: todayRuns.cost },
      week: { runs: weekRuns.c, cost: weekRuns.cost, failRate: failRate7d, avgDurationMs: avgDuration7d },
      worstAgents,
      staleAgents,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/health/agents
 * All agents with computed health metrics.
 */
router.get('/', (req, res, next) => {
  try {
    const agents = all(`
      SELECT
        a.id, a.name, a.status, a.success_rate, a.total_runs, a.last_run_at,
        (SELECT COUNT(*) FROM runs r WHERE r.agent_id = a.id AND DATE(r.created_at) >= DATE('now', '-7 days')) AS runs_7d,
        (SELECT COALESCE(SUM(r.cost_usd), 0) FROM runs r WHERE r.agent_id = a.id AND DATE(r.created_at) >= DATE('now', '-7 days')) AS cost_7d,
        (SELECT ROUND(AVG(r.duration_ms), 0) FROM runs r WHERE r.agent_id = a.id AND r.status = 'completed' AND DATE(r.created_at) >= DATE('now', '-7 days')) AS avg_duration_7d,
        (SELECT COUNT(*) FROM runs r WHERE r.agent_id = a.id AND r.status = 'failed' AND DATE(r.created_at) >= DATE('now', '-7 days')) AS failures_7d
      FROM agents a
      ORDER BY a.total_runs DESC
    `);

    // Compute health score per agent
    const scored = agents.map(a => {
      let healthScore = 100;

      // Penalize low success rate
      if (a.total_runs >= 5 && a.success_rate < 0.8) healthScore -= 20;
      if (a.total_runs >= 5 && a.success_rate < 0.5) healthScore -= 20;

      // Penalize recent failures
      if (a.failures_7d > 0) healthScore -= Math.min(30, a.failures_7d * 10);

      // Penalize staleness (hasn't run in 7+ days but has run before)
      if (a.total_runs > 0 && a.last_run_at) {
        const daysSince = Math.floor((Date.now() - new Date(a.last_run_at).getTime()) / 86400000);
        if (daysSince > 14) healthScore -= 15;
        else if (daysSince > 7) healthScore -= 5;
      }

      healthScore = Math.max(0, Math.min(100, healthScore));

      return {
        ...a,
        health_score: healthScore,
        health_status: healthScore >= 80 ? 'healthy' : healthScore >= 50 ? 'degraded' : 'unhealthy',
      };
    });

    res.json({ agents: scored });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/health/agents/:id
 * Detailed health for a single agent.
 */
router.get('/:id', (req, res, next) => {
  try {
    const agent = get('SELECT * FROM agents WHERE id = ?', [req.params.id]);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const recentRuns = all(
      `SELECT id, status, duration_ms, cost_usd, tokens_used, created_at, error_msg
       FROM runs WHERE agent_id = ? ORDER BY created_at DESC LIMIT 20`,
      [agent.id]
    );

    // Output quality trend (from audit_log)
    const qualityTrend = all(
      `SELECT details FROM audit_log
       WHERE action = 'output_validation' AND resource = ?
       ORDER BY timestamp DESC LIMIT 20`,
      [`agent:${agent.name}`]
    ).map(row => {
      try { return JSON.parse(row.details); } catch { return null; }
    }).filter(Boolean);

    // QA score trending for outreach agents (7-day rolling average)
    let qaScoreTrend = null;
    const outreachAgents = ['jake-outreach-agent', 'cfo-outreach-agent', 'jake-follow-up-agent'];
    const sourceMap = { 'jake-outreach-agent': 'jake', 'cfo-outreach-agent': 'cfo', 'jake-follow-up-agent': 'jake' };
    if (outreachAgents.includes(agent.name)) {
      const source = sourceMap[agent.name];
      qaScoreTrend = get(`
        SELECT
          COUNT(*) AS total_drafts,
          AVG(qa_score) AS avg_qa_score,
          SUM(CASE WHEN qa_status = 'passed' THEN 1 ELSE 0 END) AS passed,
          SUM(CASE WHEN qa_status = 'failed' THEN 1 ELSE 0 END) AS failed,
          MIN(qa_score) AS min_score,
          MAX(qa_score) AS max_score
        FROM cfo_outreach_sequences
        WHERE source_agent = ? AND qa_score IS NOT NULL AND DATE(created_at) >= DATE('now', '-7 days')
      `, [source]);
    }

    // Lead scout quality trending
    let leadScoutTrend = null;
    if (agent.name === 'jake-lead-scout') {
      const scoutMetrics = all(`
        SELECT details FROM audit_log
        WHERE action = 'lead_scout_quality'
        ORDER BY timestamp DESC LIMIT 10
      `).map(row => {
        try { return JSON.parse(row.details); } catch { return null; }
      }).filter(Boolean);

      if (scoutMetrics.length > 0) {
        const avgInserted = scoutMetrics.reduce((s, m) => s + (m.leads_inserted || 0), 0) / scoutMetrics.length;
        const avgFailRate = scoutMetrics.reduce((s, m) => s + (m.validation_failure_rate || 0), 0) / scoutMetrics.length;
        const avgScore = scoutMetrics.reduce((s, m) => s + (m.avg_score || 0), 0) / scoutMetrics.length;
        leadScoutTrend = { runs: scoutMetrics.length, avg_leads_per_run: Math.round(avgInserted * 10) / 10, avg_failure_rate: Math.round(avgFailRate), avg_score: Math.round(avgScore), recent: scoutMetrics.slice(0, 5) };
      }
    }

    res.json({ agent, recentRuns, qualityTrend, qaScoreTrend, leadScoutTrend });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/health/agents/scorecard
 * Full portfolio scorecard with 5-dimension scoring.
 */
router.get('/scorecard', (req, res, next) => {
  try {
    const { computeScorecard } = require('../services/portfolioScorecard');
    const result = computeScorecard();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/health/agents/scorecard/report
 * Weekly report in Markdown format.
 */
router.get('/scorecard/report', (req, res, next) => {
  try {
    const { generateWeeklyReport } = require('../services/portfolioScorecard');
    const report = generateWeeklyReport();
    res.type('text/markdown').send(report);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
