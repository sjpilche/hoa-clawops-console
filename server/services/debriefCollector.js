/**
 * @file debriefCollector.js
 * @description Collects all operational data for the Daily Debrief agent.
 *
 * Gathers from: SQLite (runs, leads, content, costs, agents), Trader API (positions/P&L).
 * Returns a single JSON object the debrief agent uses to write its report.
 *
 * Cost: $0 — pure DB reads + one HTTP call to trader.
 * Speed: <200ms typically.
 */

const { all, get } = require('../db/connection');
const http = require('http');

function httpGet(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

/**
 * Collect all operational data for today (or a specific date).
 * @param {string} [date] — ISO date string like '2026-02-20'. Defaults to today.
 * @returns {object} Complete operational snapshot.
 */
async function collectDebrief(date) {
  const targetDate = date || new Date().toISOString().split('T')[0];
  const yesterday = new Date(new Date(targetDate).getTime() - 86400000).toISOString().split('T')[0];

  // ── RUNS ──────────────────────────────────────────────────────
  const todayRuns = all(
    `SELECT r.id, r.agent_id, COALESCE(a.name, r.agent_id) as agent_name,
            r.status, r.cost_usd, r.duration_ms, r.error_msg, r.created_at
     FROM runs r LEFT JOIN agents a ON r.agent_id = a.id OR r.agent_id = a.name
     WHERE date(r.created_at) = ?
     ORDER BY r.created_at DESC`,
    [targetDate]
  );

  const yesterdayRunCount = get(
    `SELECT COUNT(*) as c, COALESCE(SUM(cost_usd), 0) as cost FROM runs WHERE date(created_at) = ?`,
    [yesterday]
  );

  const runSummary = {
    total: todayRuns.length,
    completed: todayRuns.filter(r => r.status === 'completed').length,
    failed: todayRuns.filter(r => r.status === 'failed').length,
    running: todayRuns.filter(r => r.status === 'running').length,
    pending: todayRuns.filter(r => r.status === 'pending').length,
    totalCost: todayRuns.reduce((s, r) => s + (r.cost_usd || 0), 0),
    totalDurationMs: todayRuns.reduce((s, r) => s + (r.duration_ms || 0), 0),
    runs: todayRuns.map(r => ({
      agent: r.agent_name,
      status: r.status,
      cost: r.cost_usd || 0,
      durationSec: r.duration_ms ? (r.duration_ms / 1000).toFixed(1) : null,
      error: r.error_msg || null,
      time: r.created_at,
    })),
    yesterday: { count: yesterdayRunCount.c, cost: yesterdayRunCount.cost },
  };

  // ── AGENT UTILIZATION ─────────────────────────────────────────
  const allAgents = all(`SELECT name, status FROM agents`);
  const agentsUsedToday = new Set(todayRuns.map(r => r.agent_name));
  const idleAgents = allAgents
    .filter(a => !agentsUsedToday.has(a.name))
    .map(a => a.name);

  // ── LEADS ─────────────────────────────────────────────────────
  const hoaTotal = get(`SELECT COUNT(*) as c FROM hoa_communities`);
  const hoaToday = get(`SELECT COUNT(*) as c FROM hoa_communities WHERE date(created_at) = ?`, [targetDate]);
  const hoaByState = all(
    `SELECT COALESCE(state, 'Unknown') as state, COUNT(*) as c FROM hoa_communities
     WHERE state IS NOT NULL AND state != '' GROUP BY state ORDER BY c DESC LIMIT 5`
  );

  const cfoTotal = get(`SELECT COUNT(*) as c FROM cfo_leads`);
  const cfoToday = get(`SELECT COUNT(*) as c FROM cfo_leads WHERE date(created_at) = ?`, [targetDate]);

  // HOA contacts enriched today
  let contactsEnrichedToday = 0;
  try {
    const ce = get(`SELECT COUNT(*) as c FROM hoa_contacts WHERE date(created_at) = ?`, [targetDate]);
    contactsEnrichedToday = ce?.c || 0;
  } catch { /* table might not exist */ }

  const leads = {
    hoa: { total: hoaTotal.c, newToday: hoaToday?.c || 0, byState: hoaByState },
    cfo: { total: cfoTotal.c, newToday: cfoToday?.c || 0 },
    contactsEnrichedToday,
    costPerLead: (hoaToday?.c || 0) + (cfoToday?.c || 0) > 0
      ? (runSummary.totalCost / ((hoaToday?.c || 0) + (cfoToday?.c || 0))).toFixed(4)
      : 'N/A (no new leads)',
  };

  // ── CONTENT ───────────────────────────────────────────────────
  const contentByStatus = all(`SELECT platform, status, COUNT(*) as c FROM content_queue GROUP BY platform, status`);
  const contentToday = all(
    `SELECT platform, status, COUNT(*) as c FROM content_queue WHERE date(created_at) = ? GROUP BY platform, status`,
    [targetDate]
  );
  const contentPending = get(`SELECT COUNT(*) as c FROM content_queue WHERE status = 'pending'`);

  const content = {
    queueDepth: contentPending?.c || 0,
    allTime: contentByStatus,
    today: contentToday,
  };

  // ── TRADING ───────────────────────────────────────────────────
  let trading = { status: 'offline', positions: 0, totalValue: 0, unrealizedPnl: 0, topPositions: [] };
  try {
    const posData = await httpGet('http://localhost:3002/api/positions');
    const positions = Array.isArray(posData) ? posData : (posData.positions || []);
    // Support both camelCase (Alpaca) and snake_case field names
    const getPnl = (p) => parseFloat(p.unrealizedPnl ?? p.unrealized_pl) || 0;
    const getVal = (p) => parseFloat(p.marketValue ?? p.market_value) || 0;
    const getPct = (p) => parseFloat(p.unrealizedPnlPct ?? p.unrealized_plpc) || 0;

    const pnl = positions.reduce((s, p) => s + getPnl(p), 0);
    const val = positions.reduce((s, p) => s + getVal(p), 0);

    trading = {
      status: 'online',
      positions: positions.length,
      totalValue: val,
      unrealizedPnl: pnl,
      topPositions: positions
        .sort((a, b) => Math.abs(getPnl(b)) - Math.abs(getPnl(a)))
        .slice(0, 5)
        .map(p => ({
          symbol: p.symbol,
          qty: parseFloat(p.qty) || 0,
          marketValue: getVal(p),
          unrealizedPnl: getPnl(p),
          pnlPct: getPct(p),
        })),
    };
  } catch {
    trading.status = 'offline';
  }

  // ── COSTS ─────────────────────────────────────────────────────
  const totalAllTime = get(`SELECT COALESCE(SUM(cost_usd), 0) as c FROM runs`);
  const costByAgent = all(
    `SELECT COALESCE(a.name, r.agent_id) as agent, SUM(r.cost_usd) as cost, COUNT(*) as runs
     FROM runs r LEFT JOIN agents a ON r.agent_id = a.id OR r.agent_id = a.name
     WHERE date(r.created_at) = ?
     GROUP BY r.agent_id ORDER BY cost DESC`,
    [targetDate]
  );
  const weekCost = get(`SELECT COALESCE(SUM(cost_usd), 0) as c FROM runs WHERE created_at > date('now', '-7 days')`);
  const avgDailyCost = get(`SELECT COALESCE(AVG(daily_cost), 0) as c FROM (SELECT date(created_at) as d, SUM(cost_usd) as daily_cost FROM runs GROUP BY d)`);

  const costs = {
    today: runSummary.totalCost,
    yesterday: yesterdayRunCount.cost,
    allTime: totalAllTime.c,
    thisWeek: weekCost.c,
    avgDaily: avgDailyCost.c,
    projectedMonthly: avgDailyCost.c * 30,
    byAgent: costByAgent,
  };

  return {
    date: targetDate,
    collectedAt: new Date().toISOString(),
    runs: runSummary,
    agentUtilization: { total: allAgents.length, usedToday: agentsUsedToday.size, idle: idleAgents },
    leads,
    content,
    trading,
    costs,
  };
}

module.exports = { collectDebrief };
