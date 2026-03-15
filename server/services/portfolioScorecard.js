/**
 * @file portfolioScorecard.js
 * @description Portfolio-level evaluation for all agents.
 *
 * Computes 5-dimension scores (Usefulness, Reliability, Correction Burden,
 * Risk, Cost Efficiency) for every active agent and returns a ranked portfolio view.
 *
 * Used by:
 *   - GET /api/health/scorecard          — live scorecard
 *   - weekly_portfolio_review handler    — Friday weekly report
 */

'use strict';

const { all, get } = require('../db/connection');

// ═══════════════════════════════════════════════════════════════
// RISK TIERS (from REVIEWER_OVERLAY.md)
// ═══════════════════════════════════════════════════════════════

const RISK_TIERS = {
  // Tier 1: safe internal — risk score 10
  'urgency-scorer': 1, 'pipeline-state-tracker': 1, 'tenacity-cadence-engine': 1,
  'jake-reply-classifier': 1, 'morning-digest': 1, 'ralph-qa': 1,
  'database-backup': 1, 'rse-channel-monitor': 1, 'rse-feedback-loop': 1,
  'pipeline-digest': 1, 'lead-dossier-generator': 1,

  // Tier 2: review recommended — risk score 35
  'jake-lead-scout': 2, 'cfo-lead-scout': 2, 'jake-construction-discovery': 2,
  'jake-contact-enricher': 2, 'hoa-contact-enricher': 2, 'hoa-discovery': 2,
  'hoa-contact-finder': 2, 'pipeline-director': 2, 'brain-distillation': 2,
  'opportunity-scanner': 2, 'opportunity-scorer': 2, 'rse-signal-scorer': 2,
  'rse-transcript-extractor': 2, 'rse-expert-librarian': 2, 'idle-trainer': 2,
  'mgmt-portfolio-scraper': 2, 'mgmt-portfolio-mapper': 2, 'mgmt-contact-puller': 2,
  'mgmt-review-scanner': 2, 'mgmt-cai-scraper': 2, 'traction-monitor': 2,

  // Tier 3: review required — risk score 65
  'jake-outreach-agent': 3, 'cfo-outreach-agent': 3, 'jake-follow-up-agent': 3,
  'jake-meeting-booker': 3, 'hoa-outreach-drafter': 3,
  'jake-content-engine': 3, 'cfo-content-engine': 3, 'hoa-content-writer': 3,
  'software-factory': 3, 'daily-debrief': 3,

  // Tier 4: human mandatory — risk score 90
  'hoa-facebook-poster': 4, 'hoa-cms-publisher': 4, 'hoa-website-publisher': 4,
  'jake-crm-sync': 4,
};

const RISK_SCORES = { 1: 10, 2: 35, 3: 65, 4: 90 };

// ═══════════════════════════════════════════════════════════════
// SCORING FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function scoreUsefulness(agent, metrics) {
  let score = 50; // base

  if (agent.total_runs === 0) return 0;

  // Runs in last 7 days shows active use
  if (metrics.runs_7d >= 7) score += 30;
  else if (metrics.runs_7d >= 3) score += 20;
  else if (metrics.runs_7d >= 1) score += 10;

  // Has it run recently?
  if (agent.last_run_at) {
    const daysSince = Math.floor((Date.now() - new Date(agent.last_run_at).getTime()) / 86400000);
    if (daysSince <= 1) score += 20;
    else if (daysSince <= 7) score += 10;
    else if (daysSince > 14) score -= 20;
  }

  return Math.max(0, Math.min(100, score));
}

function scoreReliability(agent, metrics) {
  if (agent.total_runs === 0) return 100; // no data = assume reliable

  let score = Math.round((agent.success_rate || 0) * 100);

  // Recent failures weigh more
  if (metrics.failures_7d > 5) score -= 30;
  else if (metrics.failures_7d > 2) score -= 15;
  else if (metrics.failures_7d > 0) score -= 5;

  return Math.max(0, Math.min(100, score));
}

function scoreCorrectionBurden(agent) {
  // Lower = better (less correction needed)
  // Agents with auto QA that passes well have low burden

  const name = agent.name;

  // Check QA stats for outreach/content agents
  const qaData = get(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN qa_status = 'passed' THEN 1 ELSE 0 END) AS passed,
      SUM(CASE WHEN qa_status = 'failed' THEN 1 ELSE 0 END) AS failed
    FROM cfo_outreach_sequences WHERE source_agent = ? AND qa_score IS NOT NULL
  `, [name.startsWith('jake-') ? 'jake' : name.startsWith('cfo-') ? 'cfo' : 'hoa']);

  if (qaData && qaData.total > 0) {
    const passRate = qaData.passed / qaData.total;
    // High pass rate = low correction burden
    return Math.round((1 - passRate) * 100);
  }

  // Deterministic handlers (special handlers) have near-zero correction burden
  const tier = RISK_TIERS[name] || 2;
  if (tier <= 2) return 10; // low burden

  return 30; // default moderate burden for LLM agents without QA data yet
}

function scoreRisk(agent) {
  const tier = RISK_TIERS[agent.name] || 2;
  return RISK_SCORES[tier] || 35;
}

function scoreCostEfficiency(agent, metrics) {
  if (metrics.cost_7d === 0) return 100; // $0 is maximally efficient

  // Cost per run
  const costPerRun = metrics.runs_7d > 0 ? metrics.cost_7d / metrics.runs_7d : 0;

  if (costPerRun <= 0.001) return 95;
  if (costPerRun <= 0.01) return 85;
  if (costPerRun <= 0.05) return 70;
  if (costPerRun <= 0.10) return 50;
  if (costPerRun <= 0.50) return 30;
  return 10; // >$0.50/run is expensive
}

// ═══════════════════════════════════════════════════════════════
// COMPOSITE SCORECARD
// ═══════════════════════════════════════════════════════════════

function computeScorecard() {
  const agents = all(`
    SELECT
      a.id, a.name, a.status, a.success_rate, a.total_runs, a.last_run_at, a.description,
      (SELECT COUNT(*) FROM runs r WHERE r.agent_id = a.id AND DATE(r.created_at) >= DATE('now', '-7 days')) AS runs_7d,
      (SELECT COALESCE(SUM(r.cost_usd), 0) FROM runs r WHERE r.agent_id = a.id AND DATE(r.created_at) >= DATE('now', '-7 days')) AS cost_7d,
      (SELECT COUNT(*) FROM runs r WHERE r.agent_id = a.id AND r.status = 'failed' AND DATE(r.created_at) >= DATE('now', '-7 days')) AS failures_7d,
      (SELECT ROUND(AVG(r.duration_ms), 0) FROM runs r WHERE r.agent_id = a.id AND r.status = 'completed' AND DATE(r.created_at) >= DATE('now', '-7 days')) AS avg_duration_7d
    FROM agents a
    WHERE a.total_runs > 0 OR a.status != 'idle'
    ORDER BY a.total_runs DESC
  `);

  const scored = agents.map(a => {
    const metrics = { runs_7d: a.runs_7d || 0, cost_7d: a.cost_7d || 0, failures_7d: a.failures_7d || 0, avg_duration_7d: a.avg_duration_7d || 0 };

    const usefulness = scoreUsefulness(a, metrics);
    const reliability = scoreReliability(a, metrics);
    const correctionBurden = scoreCorrectionBurden(a);
    const risk = scoreRisk(a);
    const costEfficiency = scoreCostEfficiency(a, metrics);

    const composite = Math.round(
      (usefulness * 0.30) +
      (reliability * 0.25) +
      ((100 - correctionBurden) * 0.20) +
      ((100 - risk) * 0.15) +
      (costEfficiency * 0.10)
    );

    let action = 'CONTINUE';
    if (composite < 40) action = 'DEPRECATE';
    else if (composite < 60) action = 'FREEZE';
    else if (composite < 80) action = 'HARDEN';

    return {
      name: a.name,
      description: a.description,
      total_runs: a.total_runs,
      runs_7d: metrics.runs_7d,
      cost_7d: metrics.cost_7d,
      failures_7d: metrics.failures_7d,
      success_rate: a.success_rate,
      dimensions: { usefulness, reliability, correction_burden: correctionBurden, risk, cost_efficiency: costEfficiency },
      composite,
      action,
      risk_tier: RISK_TIERS[a.name] || 0,
    };
  });

  // Sort by composite descending
  scored.sort((a, b) => b.composite - a.composite);

  // Summary counts
  const summary = {
    total: scored.length,
    continue_count: scored.filter(a => a.action === 'CONTINUE').length,
    harden_count: scored.filter(a => a.action === 'HARDEN').length,
    freeze_count: scored.filter(a => a.action === 'FREEZE').length,
    deprecate_count: scored.filter(a => a.action === 'DEPRECATE').length,
    total_cost_7d: scored.reduce((s, a) => s + a.cost_7d, 0),
    total_runs_7d: scored.reduce((s, a) => s + a.runs_7d, 0),
    avg_composite: scored.length > 0 ? Math.round(scored.reduce((s, a) => s + a.composite, 0) / scored.length) : 0,
  };

  return { agents: scored, summary };
}

// ═══════════════════════════════════════════════════════════════
// WEEKLY REPORT (Markdown format for Discord/file)
// ═══════════════════════════════════════════════════════════════

function generateWeeklyReport() {
  const { agents, summary } = computeScorecard();
  const today = new Date().toISOString().slice(0, 10);

  const topPerformers = agents.filter(a => a.composite >= 80).slice(0, 10);
  const watchList = agents.filter(a => a.composite >= 60 && a.composite < 80);
  const actionRequired = agents.filter(a => a.composite < 60);

  // KB entries pending review
  const kbPending = all(
    `SELECT details FROM audit_log WHERE action = 'kb_entry_pending_review' AND outcome = 'success' ORDER BY timestamp DESC LIMIT 5`
  ).map(r => { try { return JSON.parse(r.details); } catch { return null; } }).filter(Boolean);

  // Code review flags this week
  const codeFlags = all(
    `SELECT details FROM audit_log WHERE action = 'code_review_flag' AND DATE(timestamp) >= DATE('now', '-7 days')`
  ).length;

  const lines = [
    `# Portfolio Scorecard — Week of ${today}`,
    '',
    `Fleet: ${summary.total} scored | ${summary.continue_count} GO | ${summary.harden_count} HARDEN | ${summary.freeze_count} FREEZE | ${summary.deprecate_count} DEPRECATE`,
    `Cost: $${summary.total_cost_7d.toFixed(4)} this week | Runs: ${summary.total_runs_7d} | Avg Score: ${summary.avg_composite}/100`,
    '',
    '## Top Performers (Score >= 80)',
    '',
    '| Agent | Score | Tier | Runs | Failures | Cost |',
    '|-------|-------|------|------|----------|------|',
    ...topPerformers.map(a => `| ${a.name} | ${a.composite} | T${a.risk_tier} | ${a.runs_7d} | ${a.failures_7d} | $${a.cost_7d.toFixed(4)} |`),
    '',
    '## Watch List (Score 60-79)',
    '',
    '| Agent | Score | Issue | Runs |',
    '|-------|-------|-------|------|',
    ...watchList.map(a => {
      const issue = a.dimensions.reliability < 70 ? 'Reliability' : a.dimensions.correction_burden > 50 ? 'QA burden' : a.dimensions.usefulness < 50 ? 'Low use' : 'Monitor';
      return `| ${a.name} | ${a.composite} | ${issue} | ${a.runs_7d} |`;
    }),
    '',
  ];

  if (actionRequired.length > 0) {
    lines.push('## ACTION REQUIRED (Score < 60)', '',
      '| Agent | Score | Action | Issue |',
      '|-------|-------|--------|-------|',
      ...actionRequired.map(a => `| ${a.name} | ${a.composite} | ${a.action} | Reliability: ${a.dimensions.reliability}, Usefulness: ${a.dimensions.usefulness} |`),
      ''
    );
  } else {
    lines.push('## Action Required: NONE', '');
  }

  lines.push(
    `## KB Entries Pending Review: ${kbPending.length}`,
    ...kbPending.map((kb, i) => `  ${i + 1}. "${kb.title}" — from ${kb.source_agent} (quality: ${kb.quality_score})`),
    '',
    `## Code Review Flags This Week: ${codeFlags}`,
    '',
    '## Frozen Agents: 19 — $0 cost — next review: Q2 2026',
  );

  return lines.join('\n');
}

module.exports = { computeScorecard, generateWeeklyReport, RISK_TIERS };
