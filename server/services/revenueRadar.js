/**
 * @file revenueRadar.js
 * @description Cross-lane revenue intelligence scanner.
 *
 * Scans all 3 revenue lanes daily and surfaces the highest-ROI actions:
 *   Lane 1 (Trading): Paper trading performance, fund-readiness
 *   Lane 2 (Micro-SaaS): Prototype traction, revenue signals, kill/scale decisions
 *   Lane 3 (Service Arbitrage): Audit pipeline, lead conversion, upsell opportunities
 *   Lane 4 (Lead Pipeline): Jake/Owen/HOA pipeline health, conversion rates, stale leads
 *
 * Outputs "Money Moves" — 3-5 specific, prioritized actions Steve can take today.
 *
 * Handler: revenue_radar (in runs.js)
 * Cost: $0.01-0.02/run (one LLM call for prioritization)
 */

'use strict';

const { get, all } = require('../db/connection');

// ── Lane 1: Trading Performance ─────────────────────────────────────────────

async function scanTradingLane() {
  const result = { lane: 'Trading', status: 'inactive', signals: [], actions: [] };

  try {
    const traderUrl = process.env.TRADER_URL || 'http://localhost:3002';
    const [healthRes, perfRes] = await Promise.all([
      fetch(`${traderUrl}/health`, { signal: AbortSignal.timeout(3000) }).catch(() => null),
      fetch(`${traderUrl}/api/performance/summary`, { signal: AbortSignal.timeout(5000) }).catch(() => null),
    ]);

    if (!healthRes || !healthRes.ok) {
      result.status = 'no_data';
      result.actions.push({ priority: 'low', action: 'Start paper trading to generate performance data' });
      return result;
    }

    result.status = 'active';
    result.signals.push('Paper trading service online');

    if (perfRes && perfRes.ok) {
      const perf = await perfRes.json();
      if (perf.sharpeRatio) result.signals.push(`Sharpe: ${perf.sharpeRatio.toFixed(2)}`);
      if (perf.totalPnl) result.signals.push(`Total P&L: $${perf.totalPnl.toFixed(2)}`);
    }

    result.actions.push({
      priority: 'medium',
      action: 'Check paper trading scorecard — need Sharpe > 0.5 for 14 days before funding $50',
    });
  } catch {
    result.status = 'no_data';
  }

  return result;
}

// ── Lane 2: Micro-SaaS Pipeline ─────────────────────────────────────────────

function scanSaaSLane() {
  const result = { lane: 'Micro-SaaS', status: 'inactive', signals: [], actions: [], metrics: {} };

  try {
    // Opportunity signals
    const signalCount = get('SELECT COUNT(*) as n FROM opp_signals')?.n || 0;
    const clusterCount = get('SELECT COUNT(*) as n FROM opp_clusters WHERE status = ?', ['scored'])?.n || 0;
    const protoCount = get('SELECT COUNT(*) as n FROM opp_prototypes WHERE status IN (?, ?)', ['deployed', 'monitoring'])?.n || 0;
    const killedCount = get('SELECT COUNT(*) as n FROM opp_prototypes WHERE status = ?', ['killed'])?.n || 0;
    const scaffoldedCount = get('SELECT COUNT(*) as n FROM opp_prototypes WHERE status = ?', ['scaffolded'])?.n || 0;

    result.metrics = { signals: signalCount, scoredClusters: clusterCount, deployed: protoCount, scaffolded: scaffoldedCount, killed: killedCount };
    result.status = protoCount > 0 ? 'active' : signalCount > 0 ? 'pipeline' : 'inactive';

    if (scaffoldedCount > 0) {
      result.signals.push(`${scaffoldedCount} prototype(s) scaffolded but NOT deployed`);
      result.actions.push({
        priority: 'high',
        action: `Deploy ${scaffoldedCount} scaffolded prototype(s) — they're built but sitting idle. Run prototype_deployer.`,
      });
    }

    if (clusterCount > 0 && scaffoldedCount === 0 && protoCount === 0) {
      result.signals.push(`${clusterCount} scored cluster(s) waiting for build`);
      result.actions.push({
        priority: 'medium',
        action: `Run Software Factory to build prototypes for ${clusterCount} scored opportunity cluster(s)`,
      });
    }

    // Check for revenue in traction
    const revenue = get('SELECT SUM(revenue_cents) as n FROM opp_traction WHERE revenue_cents > 0')?.n || 0;
    if (revenue > 0) {
      result.signals.push(`$${(revenue / 100).toFixed(2)} total prototype revenue detected!`);
      result.actions.push({
        priority: 'critical',
        action: `REVENUE DETECTED: $${(revenue / 100).toFixed(2)} from prototypes — review which products are earning and double down`,
      });
    }

    // Check for traction without revenue (promising but not monetized)
    const highTraction = all("SELECT p.name, t.traction_score FROM opp_prototypes p JOIN opp_traction t ON t.prototype_id = p.id WHERE t.traction_score >= 40 AND t.revenue_cents = 0 ORDER BY t.traction_score DESC LIMIT 3");
    for (const ht of highTraction) {
      result.signals.push(`"${ht.name}" has traction score ${ht.traction_score} but $0 revenue`);
      result.actions.push({
        priority: 'high',
        action: `"${ht.name}" is getting attention (score ${ht.traction_score}) but not monetized — add Stripe checkout or pricing page`,
      });
    }

    if (signalCount === 0) {
      result.actions.push({
        priority: 'medium',
        action: 'Run opportunity scanners (Reddit, HN, ProductHunt) to find new pain signals',
      });
    }
  } catch (err) {
    result.status = 'error';
    result.signals.push(`Error scanning: ${err.message}`);
  }

  return result;
}

// ── Lane 3: Service Arbitrage ───────────────────────────────────────────────

function scanServiceLane() {
  const result = { lane: 'Service Arbitrage', status: 'inactive', signals: [], actions: [], metrics: {} };

  try {
    const totalAudits = get('SELECT COUNT(*) as n FROM audit_requests')?.n || 0;
    const completedAudits = get("SELECT COUNT(*) as n FROM audit_requests WHERE status IN ('completed', 'delivered')")?.n || 0;
    const deliveredAudits = get("SELECT COUNT(*) as n FROM audit_requests WHERE status = 'delivered'")?.n || 0;
    const pendingAudits = get("SELECT COUNT(*) as n FROM audit_requests WHERE status = 'pending'")?.n || 0;
    const revenueCents = get("SELECT SUM(amount_cents) as n FROM audit_requests WHERE payment_status = 'paid'")?.n || 0;
    const avgScore = get("SELECT AVG(chaos_score) as n FROM audit_requests WHERE status IN ('completed', 'delivered')")?.n || 0;

    result.metrics = { total: totalAudits, completed: completedAudits, delivered: deliveredAudits, pending: pendingAudits, revenue: revenueCents };
    result.status = totalAudits > 0 ? 'active' : 'ready';

    if (pendingAudits > 0) {
      result.signals.push(`${pendingAudits} audit(s) pending processing`);
      result.actions.push({
        priority: 'high',
        action: `Process ${pendingAudits} pending audit(s) — customers waiting for reports`,
      });
    }

    if (completedAudits > 0 && deliveredAudits === 0) {
      result.signals.push(`${completedAudits} audit(s) completed but NOT delivered`);
      result.actions.push({
        priority: 'high',
        action: `Deliver ${completedAudits} completed audit report(s) — revenue waiting to be unlocked`,
      });
    }

    // High chaos scores = hot upsell leads
    const hotLeads = all("SELECT company_name, chaos_score FROM audit_requests WHERE chaos_score >= 60 AND status IN ('completed', 'delivered') ORDER BY chaos_score DESC LIMIT 5");
    if (hotLeads.length > 0) {
      result.signals.push(`${hotLeads.length} companies with chaos score 60+ (upsell candidates for Data Rehab)`);
      for (const lead of hotLeads.slice(0, 2)) {
        result.actions.push({
          priority: 'high',
          action: `Upsell "${lead.company_name}" (chaos score ${lead.chaos_score}) — they need Data Rehab services`,
        });
      }
    }

    if (totalAudits === 0) {
      result.actions.push({
        priority: 'medium',
        action: 'Send first Data Audit landing page to 5 construction companies — intake live at /audit',
      });
    }

    if (revenueCents === 0 && completedAudits > 0) {
      result.actions.push({
        priority: 'medium',
        action: 'Consider charging $49 for premium Data Audit report — free version is proving value',
      });
    }
  } catch (err) {
    result.status = 'error';
    result.signals.push(`Error scanning: ${err.message}`);
  }

  return result;
}

// ── Lane 4: Lead Pipeline (Jake/Owen/HOA) ───────────────────────────────────

function scanLeadPipeline() {
  const result = { lane: 'Lead Pipeline', status: 'inactive', signals: [], actions: [], metrics: {} };

  try {
    const total30d = get("SELECT COUNT(*) as n FROM cfo_leads WHERE created_at >= DATE('now', '-30 days')")?.n || 0;
    const contacted = get("SELECT COUNT(*) as n FROM cfo_leads WHERE revenue_stage IN ('contacted','replied','meeting','pilot','closed','revenue') AND created_at >= DATE('now', '-30 days')")?.n || 0;
    const replied = get("SELECT COUNT(*) as n FROM cfo_leads WHERE revenue_stage IN ('replied','meeting','pilot','closed','revenue') AND created_at >= DATE('now', '-30 days')")?.n || 0;
    const meetings = get("SELECT COUNT(*) as n FROM cfo_leads WHERE revenue_stage IN ('meeting','pilot','closed','revenue') AND created_at >= DATE('now', '-30 days')")?.n || 0;
    const revCents = get("SELECT SUM(COALESCE(close_value_cents, 0)) as n FROM cfo_leads WHERE revenue_stage IN ('closed','revenue') AND created_at >= DATE('now', '-30 days')")?.n || 0;

    // Stale leads (contacted 7+ days ago, no reply)
    const stale = get("SELECT COUNT(*) as n FROM cfo_leads WHERE revenue_stage = 'contacted' AND updated_at <= DATE('now', '-7 days')")?.n || 0;

    // Leads with email but never contacted
    const uncontacted = get("SELECT COUNT(*) as n FROM cfo_leads WHERE email IS NOT NULL AND email != '' AND revenue_stage = 'new'")?.n || 0;

    result.metrics = { total30d, contacted, replied, meetings, revenue: revCents, stale, uncontacted };
    result.status = total30d > 0 ? 'active' : 'inactive';

    const replyRate = contacted > 0 ? ((replied / contacted) * 100).toFixed(1) : '0';

    if (uncontacted > 10) {
      result.signals.push(`${uncontacted} leads with email but never contacted`);
      result.actions.push({
        priority: 'high',
        action: `Contact ${Math.min(uncontacted, 20)} uncontacted leads with emails — they're sitting in the pipeline untouched`,
      });
    }

    if (stale > 5) {
      result.signals.push(`${stale} leads stale (contacted 7+ days ago, no reply)`);
      result.actions.push({
        priority: 'medium',
        action: `Follow up on ${stale} stale leads — send touch #2 via cadence engine`,
      });
    }

    if (contacted > 0 && replied === 0) {
      result.signals.push(`0% reply rate on ${contacted} contacted leads`);
      result.actions.push({
        priority: 'high',
        action: 'Zero replies — review outreach copy. May need different subject lines or value prop.',
      });
    }

    if (meetings > 0 && revCents === 0) {
      result.signals.push(`${meetings} meeting(s) but $0 closed revenue`);
      result.actions.push({
        priority: 'high',
        action: `${meetings} meeting(s) happened but nothing closed — review pitch and follow-up process`,
      });
    }

    if (revCents > 0) {
      result.signals.push(`$${(revCents / 100).toFixed(2)} revenue from lead pipeline!`);
    }

    result.signals.push(`Pipeline: ${total30d} → ${contacted} contacted → ${replied} replied (${replyRate}%) → ${meetings} meetings`);
  } catch (err) {
    result.status = 'error';
    result.signals.push(`Error: ${err.message}`);
  }

  return result;
}

// ── Main: Revenue Radar Scan ────────────────────────────────────────────────

/**
 * Run full revenue radar scan across all lanes.
 * Returns prioritized "Money Moves" for Steve's morning report.
 */
async function runRevenueScan() {
  const trading = await scanTradingLane();
  const saas = scanSaaSLane();
  const service = scanServiceLane();
  const pipeline = scanLeadPipeline();

  // Collect all actions, sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const allActions = [
    ...trading.actions.map(a => ({ ...a, lane: 'Trading' })),
    ...saas.actions.map(a => ({ ...a, lane: 'Micro-SaaS' })),
    ...service.actions.map(a => ({ ...a, lane: 'Service' })),
    ...pipeline.actions.map(a => ({ ...a, lane: 'Pipeline' })),
  ].sort((a, b) => (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3));

  // Top 5 money moves
  const moneyMoves = allActions.slice(0, 5);

  // Revenue summary across lanes
  const totalRevenue = (service.metrics.revenue || 0) + (pipeline.metrics.revenue || 0);

  return {
    timestamp: new Date().toISOString(),
    lanes: { trading, saas, service, pipeline },
    moneyMoves,
    totalRevenueCents: totalRevenue,
    allActions,
  };
}

/**
 * Format revenue radar for morning report (plain text).
 */
function formatForReport(scan) {
  const lines = ['REVENUE RADAR — Money Moves:', '━'.repeat(40)];

  if (scan.totalRevenueCents > 0) {
    lines.push(`  TOTAL REVENUE: $${(scan.totalRevenueCents / 100).toFixed(2)}`);
    lines.push('');
  }

  // Lane status overview
  lines.push('  Lane Status:');
  for (const lane of Object.values(scan.lanes)) {
    const icon = lane.status === 'active' ? '[LIVE]' : lane.status === 'pipeline' ? '[PIPE]' : lane.status === 'ready' ? '[READY]' : '[---]';
    lines.push(`    ${icon} ${lane.lane}: ${lane.signals.slice(0, 2).join('; ') || 'No signals'}`);
  }

  // Money moves
  if (scan.moneyMoves.length > 0) {
    lines.push('', '  TOP MONEY MOVES (do these today):');
    scan.moneyMoves.forEach((m, i) => {
      const tag = m.priority === 'critical' ? '!!!' : m.priority === 'high' ? '!!' : '!';
      lines.push(`    ${i + 1}. [${tag}] ${m.action}`);
    });
  } else {
    lines.push('', '  No money moves identified — all lanes need activation.');
  }

  return lines.join('\n');
}

/**
 * Format revenue radar for Discord embed.
 */
function formatForDiscord(scan) {
  const fields = [];

  // Lane statuses
  for (const lane of Object.values(scan.lanes)) {
    const icon = lane.status === 'active' ? '🟢' : lane.status === 'pipeline' ? '🟡' : lane.status === 'ready' ? '🔵' : '⚫';
    fields.push({
      name: `${icon} ${lane.lane}`,
      value: lane.signals.slice(0, 2).join('\n') || 'No signals',
      inline: true,
    });
  }

  // Money moves
  if (scan.moneyMoves.length > 0) {
    const movesText = scan.moneyMoves.slice(0, 3).map((m, i) => {
      const tag = m.priority === 'critical' ? '🔴' : m.priority === 'high' ? '🟠' : '🟡';
      return `${tag} ${i + 1}. ${m.action}`;
    }).join('\n');

    fields.push({
      name: 'Money Moves',
      value: movesText,
      inline: false,
    });
  }

  return {
    title: `Revenue Radar — ${new Date().toISOString().slice(0, 10)}`,
    description: scan.totalRevenueCents > 0
      ? `Total Revenue: **$${(scan.totalRevenueCents / 100).toFixed(2)}**`
      : 'No revenue yet — here\'s how to change that:',
    color: scan.totalRevenueCents > 0 ? 0x22c55e : scan.moneyMoves.some(m => m.priority === 'critical') ? 0xef4444 : 0xf59e0b,
    fields,
  };
}

module.exports = {
  runRevenueScan,
  formatForReport,
  formatForDiscord,
  scanTradingLane,
  scanSaaSLane,
  scanServiceLane,
  scanLeadPipeline,
};
