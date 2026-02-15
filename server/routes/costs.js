/**
 * @file costs.js
 * @description API routes for cost tracking and analytics
 *
 * Aggregates cost data from the runs table for dashboard visualization
 */

const express = require('express');
const router = express.Router();
const { all } = require('../db/connection');

/**
 * GET /api/costs/summary
 * Get overall cost summary statistics
 */
router.get('/summary', async (req, res) => {
  try {
    const summary = {
      total_cost: 0,
      total_tokens: 0,
      total_runs: 0,
      avg_cost_per_run: 0,
      cost_last_24h: 0,
      cost_last_7d: 0,
      cost_last_30d: 0,
      most_expensive_agent: null,
      costliest_run: null,
    };

    // Total cost and tokens
    const totals = all(`
      SELECT
        COALESCE(SUM(cost_usd), 0) as total_cost,
        COALESCE(SUM(tokens_used), 0) as total_tokens,
        COUNT(*) as total_runs
      FROM runs
      WHERE status = 'success' OR status = 'completed'
    `);

    if (totals.length > 0) {
      summary.total_cost = totals[0].total_cost;
      summary.total_tokens = totals[0].total_tokens;
      summary.total_runs = totals[0].total_runs;
      summary.avg_cost_per_run = summary.total_runs > 0
        ? summary.total_cost / summary.total_runs
        : 0;
    }

    // Cost last 24 hours
    const last24h = all(`
      SELECT COALESCE(SUM(cost_usd), 0) as cost
      FROM runs
      WHERE (status = 'success' OR status = 'completed')
        AND started_at >= datetime('now', '-24 hours')
    `);
    summary.cost_last_24h = last24h[0]?.cost || 0;

    // Cost last 7 days
    const last7d = all(`
      SELECT COALESCE(SUM(cost_usd), 0) as cost
      FROM runs
      WHERE (status = 'success' OR status = 'completed')
        AND started_at >= datetime('now', '-7 days')
    `);
    summary.cost_last_7d = last7d[0]?.cost || 0;

    // Cost last 30 days
    const last30d = all(`
      SELECT COALESCE(SUM(cost_usd), 0) as cost
      FROM runs
      WHERE (status = 'success' OR status = 'completed')
        AND started_at >= datetime('now', '-30 days')
    `);
    summary.cost_last_30d = last30d[0]?.cost || 0;

    // Most expensive agent
    const expensiveAgent = all(`
      SELECT
        agent_id,
        SUM(cost_usd) as total_cost,
        COUNT(*) as run_count,
        AVG(cost_usd) as avg_cost
      FROM runs
      WHERE (status = 'success' OR status = 'completed')
        AND cost_usd > 0
      GROUP BY agent_id
      ORDER BY total_cost DESC
      LIMIT 1
    `);

    if (expensiveAgent.length > 0) {
      const agentInfo = all('SELECT name FROM agents WHERE id = ?', [expensiveAgent[0].agent_id]);
      summary.most_expensive_agent = {
        agent_id: expensiveAgent[0].agent_id,
        agent_name: agentInfo[0]?.name || 'Unknown',
        total_cost: expensiveAgent[0].total_cost,
        run_count: expensiveAgent[0].run_count,
        avg_cost: expensiveAgent[0].avg_cost,
      };
    }

    // Costliest single run
    const costliestRun = all(`
      SELECT id, agent_id, cost_usd, tokens_used, started_at
      FROM runs
      WHERE cost_usd > 0
      ORDER BY cost_usd DESC
      LIMIT 1
    `);

    if (costliestRun.length > 0) {
      const agentInfo = all('SELECT name FROM agents WHERE id = ?', [costliestRun[0].agent_id]);
      summary.costliest_run = {
        ...costliestRun[0],
        agent_name: agentInfo[0]?.name || 'Unknown',
      };
    }

    res.json({
      success: true,
      summary,
    });
  } catch (error) {
    console.error('[Costs API] Error fetching summary:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/costs/by-agent
 * Get cost breakdown by agent
 */
router.get('/by-agent', async (req, res) => {
  try {
    const breakdown = all(`
      SELECT
        r.agent_id,
        a.name as agent_name,
        COUNT(*) as run_count,
        SUM(r.cost_usd) as total_cost,
        AVG(r.cost_usd) as avg_cost,
        SUM(r.tokens_used) as total_tokens,
        MAX(r.cost_usd) as max_cost,
        MIN(r.cost_usd) as min_cost
      FROM runs r
      LEFT JOIN agents a ON r.agent_id = a.id
      WHERE r.status = 'success' OR r.status = 'completed'
      GROUP BY r.agent_id, a.name
      ORDER BY total_cost DESC
    `);

    res.json({
      success: true,
      count: breakdown.length,
      breakdown,
    });
  } catch (error) {
    console.error('[Costs API] Error fetching agent breakdown:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/costs/timeline
 * Get cost over time for charting
 * Query params: period=day|week|month (default: day)
 */
router.get('/timeline', async (req, res) => {
  try {
    const { period = 'day', days = 30 } = req.query;

    let groupBy;
    let dateFormat;

    switch (period) {
      case 'hour':
        groupBy = "strftime('%Y-%m-%d %H:00', started_at)";
        dateFormat = '%Y-%m-%d %H:00';
        break;
      case 'week':
        groupBy = "strftime('%Y-W%W', started_at)";
        dateFormat = 'Week %W, %Y';
        break;
      case 'month':
        groupBy = "strftime('%Y-%m', started_at)";
        dateFormat = '%Y-%m';
        break;
      case 'day':
      default:
        groupBy = "strftime('%Y-%m-%d', started_at)";
        dateFormat = '%Y-%m-%d';
    }

    const timeline = all(`
      SELECT
        ${groupBy} as period,
        COUNT(*) as run_count,
        SUM(cost_usd) as cost,
        SUM(tokens_used) as tokens
      FROM runs
      WHERE (status = 'success' OR status = 'completed')
        AND started_at >= datetime('now', '-${parseInt(days)} days')
        AND started_at IS NOT NULL
      GROUP BY ${groupBy}
      ORDER BY period ASC
    `);

    res.json({
      success: true,
      period,
      days: parseInt(days),
      count: timeline.length,
      timeline,
    });
  } catch (error) {
    console.error('[Costs API] Error fetching timeline:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/costs/runs
 * Get recent runs with cost data
 */
router.get('/runs', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const safeLimit = Math.min(parseInt(limit, 10) || 50, 500);

    const runs = all(`
      SELECT
        r.id,
        r.agent_id,
        a.name as agent_name,
        r.started_at,
        r.completed_at,
        r.duration_ms,
        r.cost_usd,
        r.tokens_used,
        r.status
      FROM runs r
      LEFT JOIN agents a ON r.agent_id = a.id
      WHERE r.cost_usd > 0
      ORDER BY r.started_at DESC
      LIMIT ?
    `, [safeLimit]);

    res.json({
      success: true,
      count: runs.length,
      runs,
    });
  } catch (error) {
    console.error('[Costs API] Error fetching runs:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/costs/projections
 * Project monthly costs based on recent usage
 */
router.get('/projections', async (req, res) => {
  try {
    // Get last 7 days average
    const last7days = all(`
      SELECT
        COALESCE(SUM(cost_usd), 0) as total_cost,
        COUNT(*) as run_count
      FROM runs
      WHERE (status = 'success' OR status = 'completed')
        AND started_at >= datetime('now', '-7 days')
    `);

    const avgDailyCost = last7days[0]?.total_cost / 7 || 0;
    const avgDailyRuns = last7days[0]?.run_count / 7 || 0;

    const projections = {
      daily_avg: avgDailyCost,
      weekly_projected: avgDailyCost * 7,
      monthly_projected: avgDailyCost * 30,
      annual_projected: avgDailyCost * 365,
      runs_per_day: avgDailyRuns,
      runs_per_month: avgDailyRuns * 30,
      based_on_days: 7,
    };

    res.json({
      success: true,
      projections,
    });
  } catch (error) {
    console.error('[Costs API] Error calculating projections:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
