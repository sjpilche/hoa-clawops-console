'use strict';

/**
 * Command Center API — single-pane view of all 3 revenue lanes,
 * pipeline health, agent activity, and operational alerts.
 *
 * GET /api/command-center       — full snapshot
 * GET /api/command-center/health — lightweight lane status for monitors
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { get, all } = require('../db/connection');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Safe query — returns fallback if the table doesn't exist yet. */
function safeGet(sql, params = [], fallback = null) {
  try { return get(sql, params) || fallback; } catch { return fallback; }
}

function safeAll(sql, params = [], fallback = []) {
  try { return all(sql, params) || fallback; } catch { return fallback; }
}

/** Today as YYYY-MM-DD (UTC). */
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Trading lane — calls trader service HTTP API (port 3002)
// ---------------------------------------------------------------------------

const TRADER_URL = process.env.TRADER_URL || 'http://localhost:3002';

async function getTradingLane() {
  const result = {
    status: 'inactive',
    dailyPnl: 0,
    totalPnl: 0,
    sharpe: 0,
    fundReady: false,
  };

  try {
    const [healthRes, perfRes] = await Promise.all([
      fetch(`${TRADER_URL}/health`, { signal: AbortSignal.timeout(3000) }).catch(() => null),
      fetch(`${TRADER_URL}/api/performance/summary`, { signal: AbortSignal.timeout(5000) }).catch(() => null),
    ]);

    if (!healthRes || !healthRes.ok) return result;
    result.status = 'paper';

    if (perfRes && perfRes.ok) {
      const perf = await perfRes.json();
      result.totalPnl = perf.totalPnl || 0;
      result.sharpe = perf.sharpeRatio || 0;
      result.fundReady = result.sharpe >= 1.5 && result.totalPnl > 0;
    }
  } catch {
    // Trader service unreachable — leave as inactive
  }

  return result;
}

// ---------------------------------------------------------------------------
// SaaS lane — Opportunity Discovery Engine tables
// ---------------------------------------------------------------------------

function getSaasLane() {
  const result = {
    status: 'inactive',
    signals: 0,
    clusters: 0,
    prototypes: { scaffolded: 0, deployed: 0, monitoring: 0, killed: 0 },
    revenue: 0,
  };

  try {
    const signals = safeGet("SELECT COUNT(*) as c FROM opp_signals", [], { c: 0 });
    result.signals = signals.c || 0;

    const clusters = safeGet("SELECT COUNT(*) as c FROM opp_clusters", [], { c: 0 });
    result.clusters = clusters.c || 0;

    // Prototype breakdown by status
    const protoRows = safeAll(
      "SELECT status, COUNT(*) as c FROM opp_prototypes GROUP BY status"
    );
    for (const row of protoRows) {
      const s = (row.status || '').toLowerCase();
      if (s === 'scaffolded') result.prototypes.scaffolded = row.c;
      else if (s === 'deployed') result.prototypes.deployed = row.c;
      else if (s === 'monitoring') result.prototypes.monitoring = row.c;
      else if (s === 'killed') result.prototypes.killed = row.c;
    }

    // Revenue from traction table
    const rev = safeGet(
      "SELECT COALESCE(SUM(revenue_cents), 0) as r FROM opp_traction",
      [],
      { r: 0 }
    );
    result.revenue = (rev.r || 0) / 100;

    // Determine status
    if (result.prototypes.deployed > 0 || result.prototypes.monitoring > 0) {
      result.status = 'active';
    } else if (result.signals > 0 || result.clusters > 0 || result.prototypes.scaffolded > 0) {
      result.status = 'pipeline';
    }
  } catch {
    // Tables don't exist yet
  }

  return result;
}

// ---------------------------------------------------------------------------
// Services lane — audit_requests table
// ---------------------------------------------------------------------------

function getServicesLane() {
  const result = {
    status: 'inactive',
    totalAudits: 0,
    completedAudits: 0,
    pendingAudits: 0,
    avgChaosScore: 0,
    revenue: 0,
  };

  try {
    const total = safeGet("SELECT COUNT(*) as c FROM audit_requests", [], { c: 0 });
    result.totalAudits = total.c || 0;

    if (result.totalAudits > 0) {
      result.status = 'active';

      const completed = safeGet(
        "SELECT COUNT(*) as c FROM audit_requests WHERE status = 'completed'",
        [],
        { c: 0 }
      );
      result.completedAudits = completed.c || 0;

      const pending = safeGet(
        "SELECT COUNT(*) as c FROM audit_requests WHERE status IN ('pending', 'in_progress')",
        [],
        { c: 0 }
      );
      result.pendingAudits = pending.c || 0;

      const chaos = safeGet(
        "SELECT AVG(chaos_score) as avg FROM audit_requests WHERE chaos_score IS NOT NULL",
        [],
        { avg: 0 }
      );
      result.avgChaosScore = Math.round((chaos.avg || 0) * 100) / 100;

      const rev = safeGet(
        "SELECT COALESCE(SUM(deal_value_cents), 0) as r FROM audit_requests WHERE status = 'completed'",
        [],
        { r: 0 }
      );
      result.revenue = (rev.r || 0) / 100;
    }
  } catch {
    // Table doesn't exist yet
  }

  return result;
}

// ---------------------------------------------------------------------------
// Pipeline — cfo_leads by source_agent
// ---------------------------------------------------------------------------

function getPipeline() {
  const jake = { totalLeads: 0, withEmail: 0, contacted: 0, interested: 0, meetings: 0, staleOver7d: 0 };
  const hoa = { totalLeads: 0, withEmail: 0, contacted: 0, interested: 0 };

  try {
    // Jake pipeline
    const jTotal = safeGet(
      "SELECT COUNT(*) as c FROM cfo_leads WHERE source_agent = 'jake'",
      [],
      { c: 0 }
    );
    jake.totalLeads = jTotal.c || 0;

    const jEmail = safeGet(
      "SELECT COUNT(*) as c FROM cfo_leads WHERE source_agent = 'jake' AND email IS NOT NULL AND email != ''",
      [],
      { c: 0 }
    );
    jake.withEmail = jEmail.c || 0;

    const jContacted = safeGet(
      "SELECT COUNT(*) as c FROM cfo_leads WHERE source_agent = 'jake' AND status = 'contacted'",
      [],
      { c: 0 }
    );
    jake.contacted = jContacted.c || 0;

    const jInterested = safeGet(
      "SELECT COUNT(*) as c FROM cfo_leads WHERE source_agent = 'jake' AND status = 'interested'",
      [],
      { c: 0 }
    );
    jake.interested = jInterested.c || 0;

    const jMeetings = safeGet(
      "SELECT COUNT(*) as c FROM cfo_leads WHERE source_agent = 'jake' AND status = 'meeting_booked'",
      [],
      { c: 0 }
    );
    jake.meetings = jMeetings.c || 0;

    // Stale: contacted > 7 days ago with no further status change
    const jStale = safeGet(
      `SELECT COUNT(*) as c FROM cfo_leads
       WHERE source_agent = 'jake'
         AND status = 'contacted'
         AND updated_at < datetime('now', '-7 days')`,
      [],
      { c: 0 }
    );
    jake.staleOver7d = jStale.c || 0;

    // HOA pipeline (source_agent = 'hoa' or 'cfo')
    const hTotal = safeGet(
      "SELECT COUNT(*) as c FROM cfo_leads WHERE source_agent IN ('hoa', 'cfo')",
      [],
      { c: 0 }
    );
    hoa.totalLeads = hTotal.c || 0;

    const hEmail = safeGet(
      "SELECT COUNT(*) as c FROM cfo_leads WHERE source_agent IN ('hoa', 'cfo') AND email IS NOT NULL AND email != ''",
      [],
      { c: 0 }
    );
    hoa.withEmail = hEmail.c || 0;

    const hContacted = safeGet(
      "SELECT COUNT(*) as c FROM cfo_leads WHERE source_agent IN ('hoa', 'cfo') AND status = 'contacted'",
      [],
      { c: 0 }
    );
    hoa.contacted = hContacted.c || 0;

    const hInterested = safeGet(
      "SELECT COUNT(*) as c FROM cfo_leads WHERE source_agent IN ('hoa', 'cfo') AND status = 'interested'",
      [],
      { c: 0 }
    );
    hoa.interested = hInterested.c || 0;
  } catch {
    // cfo_leads table doesn't exist
  }

  return { jake, hoa };
}

// ---------------------------------------------------------------------------
// Agent activity — runs + agents tables
// ---------------------------------------------------------------------------

function getAgentActivity() {
  const result = {
    total: 0,
    activeToday: 0,
    failedToday: 0,
    totalRunsToday: 0,
    totalCostToday: 0,
  };

  try {
    const agentCount = safeGet("SELECT COUNT(*) as c FROM agents", [], { c: 0 });
    result.total = agentCount.c || 0;

    const today = todayStr();

    const runsToday = safeGet(
      "SELECT COUNT(*) as c FROM runs WHERE DATE(created_at) = ?",
      [today],
      { c: 0 }
    );
    result.totalRunsToday = runsToday.c || 0;

    const activeToday = safeGet(
      "SELECT COUNT(DISTINCT agent_id) as c FROM runs WHERE DATE(created_at) = ?",
      [today],
      { c: 0 }
    );
    result.activeToday = activeToday.c || 0;

    const failedToday = safeGet(
      "SELECT COUNT(*) as c FROM runs WHERE DATE(created_at) = ? AND status = 'failed'",
      [today],
      { c: 0 }
    );
    result.failedToday = failedToday.c || 0;

    const costToday = safeGet(
      "SELECT COALESCE(SUM(cost_usd), 0) as c FROM runs WHERE DATE(created_at) = ?",
      [today],
      { c: 0 }
    );
    result.totalCostToday = Math.round((costToday.c || 0) * 10000) / 10000;
  } catch {
    // runs/agents table issue
  }

  return result;
}

// ---------------------------------------------------------------------------
// Recent activity — last 10 runs with agent names
// ---------------------------------------------------------------------------

function getRecentActivity() {
  return safeAll(
    `SELECT r.id, a.name as agent_name, r.status, r.cost_usd,
            r.created_at, r.duration_ms
     FROM runs r
     LEFT JOIN agents a ON r.agent_id = a.id
     ORDER BY r.created_at DESC
     LIMIT 10`
  );
}

// ---------------------------------------------------------------------------
// Alerts — items that need human attention
// ---------------------------------------------------------------------------

function getAlerts() {
  const alerts = [];

  // 1. Stale contacted leads (> 7 days, no response)
  try {
    const stale = safeGet(
      `SELECT COUNT(*) as c FROM cfo_leads
       WHERE status = 'contacted'
         AND updated_at < datetime('now', '-7 days')`,
      [],
      { c: 0 }
    );
    if ((stale.c || 0) > 0) {
      alerts.push({
        level: 'warning',
        category: 'pipeline',
        message: `${stale.c} leads contacted over 7 days ago with no response`,
      });
    }
  } catch {}

  // 2. Failed runs today
  try {
    const today = todayStr();
    const failed = safeGet(
      "SELECT COUNT(*) as c FROM runs WHERE DATE(created_at) = ? AND status = 'failed'",
      [today],
      { c: 0 }
    );
    if ((failed.c || 0) > 0) {
      alerts.push({
        level: 'error',
        category: 'agents',
        message: `${failed.c} agent run(s) failed today`,
      });
    }
  } catch {}

  // 3. Empty pipeline stages
  try {
    const jakeWithEmail = safeGet(
      "SELECT COUNT(*) as c FROM cfo_leads WHERE source_agent = 'jake' AND email IS NOT NULL AND email != ''",
      [],
      { c: 0 }
    );
    if ((jakeWithEmail.c || 0) === 0) {
      alerts.push({
        level: 'warning',
        category: 'pipeline',
        message: 'Jake pipeline has zero leads with email — enrichment needed',
      });
    }
  } catch {}

  // 4. No runs in 24 hours
  try {
    const lastRun = safeGet(
      "SELECT MAX(created_at) as last FROM runs"
    );
    if (lastRun && lastRun.last) {
      const lastRunDate = new Date(lastRun.last);
      const hoursAgo = (Date.now() - lastRunDate.getTime()) / (1000 * 60 * 60);
      if (hoursAgo > 24) {
        alerts.push({
          level: 'warning',
          category: 'agents',
          message: `No agent runs in ${Math.round(hoursAgo)} hours — check scheduler`,
        });
      }
    }
  } catch {}

  // 5. High fail rate today (> 20%)
  try {
    const today = todayStr();
    const stats = safeGet(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
       FROM runs WHERE DATE(created_at) = ?`,
      [today],
      { total: 0, failed: 0 }
    );
    if ((stats.total || 0) > 5) {
      const rate = (stats.failed || 0) / stats.total;
      if (rate > 0.2) {
        alerts.push({
          level: 'error',
          category: 'agents',
          message: `Agent fail rate today is ${Math.round(rate * 100)}% (${stats.failed}/${stats.total})`,
        });
      }
    }
  } catch {}

  return alerts;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /api/command-center
 * Full operational snapshot across all revenue lanes.
 */
router.get('/', async (req, res) => {
  try {
    const tradingLane = await getTradingLane();

    res.json({
      timestamp: new Date().toISOString(),
      lanes: {
        trading: tradingLane,
        saas: getSaasLane(),
        services: getServicesLane(),
      },
      pipeline: getPipeline(),
      agents: getAgentActivity(),
      recentActivity: getRecentActivity(),
      alerts: getAlerts(),
    });
  } catch (err) {
    console.error('[CommandCenter] Error building snapshot:', err);
    res.status(500).json({ error: 'Failed to build command center snapshot', detail: err.message });
  }
});

/**
 * GET /api/command-center/health
 * Lightweight lane status for uptime monitors and dashboards.
 */
router.get('/health', async (req, res) => {
  try {
    const tradingLane = await getTradingLane();
    const saas = getSaasLane();
    const services = getServicesLane();

    // Agent fail rate
    const today = todayStr();
    const stats = safeGet(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
       FROM runs WHERE DATE(created_at) = ?`,
      [today],
      { total: 0, failed: 0 }
    );
    const failRate = (stats.total || 0) > 0
      ? Math.round(((stats.failed || 0) / stats.total) * 10000) / 10000
      : 0;

    // Last run timestamp
    const lastRun = safeGet("SELECT MAX(created_at) as last FROM runs");

    res.json({
      status: 'ok',
      lanes: {
        trading: tradingLane.status,
        saas: saas.status,
        services: services.status,
      },
      agentFailRate: failRate,
      lastRunAt: (lastRun && lastRun.last) ? lastRun.last : null,
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

module.exports = router;
