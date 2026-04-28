/**
 * @file schedulePerformance.js
 * @description Smart schedule performance tracking and auto-pause.
 *
 * Evaluates each schedule's recent outcomes and auto-pauses underperformers.
 * Prevents wasting LLM tokens on dead markets/agents.
 *
 * Health tiers:
 *   GREEN  — avg score >= 0.5 (producing useful outcomes)
 *   YELLOW — avg score 0.2-0.5 (marginal, keep watching)
 *   RED    — avg score < 0.2 (wasting money)
 *
 * Auto-pause triggers:
 *   1. 5+ consecutive runs with avg score < 0.2
 *   2. Cost per useful lead > $5 (configurable)
 */

'use strict';

const { get, all, run } = require('../db/connection');

/**
 * Evaluate a single schedule's recent performance.
 */
function evaluateScheduleHealth(scheduleId) {
  const schedule = get('SELECT * FROM schedules WHERE id = ?', [scheduleId]);
  if (!schedule) return null;

  // Get last 10 runs for this schedule's agent
  const runs = all(
    `SELECT r.id, r.status, r.cost_usd, r.duration_ms, r.created_at,
            e.outcome_score, e.outcome_type
     FROM runs r
     LEFT JOIN brain_fallback_episodes e ON e.run_id = r.id
     WHERE r.agent_id = ? AND r.status IN ('completed', 'success', 'failed')
     ORDER BY r.created_at DESC
     LIMIT 10`,
    [schedule.agent_id]
  );

  if (runs.length === 0) {
    return {
      scheduleId,
      name: schedule.name,
      health: 'green', // No data = benefit of the doubt
      avgScore: null,
      avgCost: 0,
      totalRuns: 0,
      consecutiveLowRuns: 0,
      reason: 'No runs yet',
    };
  }

  const scores = runs.map(r => r.outcome_score).filter(s => s !== null && s !== undefined);
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const avgCost = runs.reduce((a, r) => a + (r.cost_usd || 0), 0) / runs.length;
  const totalCost = runs.reduce((a, r) => a + (r.cost_usd || 0), 0);
  const failedRuns = runs.filter(r => r.status === 'failed').length;

  // Count consecutive low runs (from most recent)
  let consecutiveLowRuns = 0;
  for (const r of runs) {
    if ((r.outcome_score !== null && r.outcome_score < 0.2) || r.status === 'failed') {
      consecutiveLowRuns++;
    } else {
      break;
    }
  }

  // Determine health tier
  let health = 'green';
  let reason = '';

  if (avgScore < 0.2 || failedRuns >= 5) {
    health = 'red';
    reason = avgScore < 0.2
      ? `Avg outcome score ${avgScore.toFixed(2)} (below 0.2 threshold)`
      : `${failedRuns} of last ${runs.length} runs failed`;
  } else if (avgScore < 0.5) {
    health = 'yellow';
    reason = `Avg outcome score ${avgScore.toFixed(2)} (marginal)`;
  } else {
    reason = `Avg outcome score ${avgScore.toFixed(2)} — performing well`;
  }

  // Update the schedule row
  try {
    run(
      "UPDATE schedules SET performance_health = ?, last_perf_check_at = datetime('now') WHERE id = ?",
      [health, scheduleId]
    );
  } catch {}

  return {
    scheduleId,
    name: schedule.name,
    health,
    avgScore: Math.round(avgScore * 100) / 100,
    avgCost: Math.round(avgCost * 10000) / 10000,
    totalCost: Math.round(totalCost * 10000) / 10000,
    totalRuns: runs.length,
    failedRuns,
    consecutiveLowRuns,
    reason,
  };
}

/**
 * Evaluate all enabled schedules.
 */
function evaluateAllSchedules() {
  const schedules = all("SELECT id FROM schedules WHERE enabled = 1 OR auto_paused = 1");
  return schedules.map(s => evaluateScheduleHealth(s.id)).filter(Boolean);
}

/**
 * Check if a schedule should be auto-paused.
 */
function shouldAutoPause(scheduleId) {
  const health = evaluateScheduleHealth(scheduleId);
  if (!health) return { pause: false, reason: 'Schedule not found' };

  // Already paused?
  const schedule = get('SELECT auto_paused FROM schedules WHERE id = ?', [scheduleId]);
  if (schedule?.auto_paused === 1) return { pause: false, reason: 'Already paused' };

  // Rule 1: 5+ consecutive low runs
  if (health.consecutiveLowRuns >= 5) {
    return {
      pause: true,
      reason: `${health.consecutiveLowRuns} consecutive low-score runs (avg: ${health.avgScore})`,
    };
  }

  // Rule 2: Cost efficiency check — skip for $0 (Ollama) runs
  if (health.avgCost > 0 && health.totalRuns >= 5 && health.avgScore < 0.3 && health.totalCost > 2) {
    return {
      pause: true,
      reason: `Spending $${health.totalCost.toFixed(2)} with avg score ${health.avgScore} — poor ROI`,
    };
  }

  return { pause: false, reason: health.reason };
}

/**
 * Auto-pause a schedule.
 */
function autoPauseSchedule(scheduleId, reason) {
  run(
    `UPDATE schedules SET enabled = 0, auto_paused = 1, auto_pause_reason = ?, auto_paused_at = datetime('now') WHERE id = ?`,
    [reason, scheduleId]
  );

  // Audit log
  try {
    run(
      "INSERT INTO audit_log (action, resource, resource_id, details, created_at) VALUES ('schedule_auto_paused', 'schedule', ?, ?, datetime('now'))",
      [String(scheduleId), reason]
    );
  } catch {}

  // Discord alert
  try {
    const schedule = get('SELECT name FROM schedules WHERE id = ?', [scheduleId]);
    const discord = require('./discordNotifier');
    discord.postWebhook({
      embeds: [{
        title: `Schedule Auto-Paused: ${schedule?.name || scheduleId}`,
        description: reason,
        color: 0xff8800,
        timestamp: new Date().toISOString(),
        footer: { text: 'SchedulePerformance · ClawOps' },
      }],
    }).catch(e => console.warn('[SchedulePerf] notify failed:', e.message));
  } catch {}

  console.warn(`[SchedulePerformance] Auto-paused schedule ${scheduleId}: ${reason}`);
}

/**
 * Re-enable an auto-paused schedule.
 */
function reEnableSchedule(scheduleId) {
  run(
    `UPDATE schedules SET enabled = 1, auto_paused = 0, auto_pause_reason = NULL, auto_paused_at = NULL WHERE id = ?`,
    [scheduleId]
  );

  try {
    run(
      "INSERT INTO audit_log (action, resource, resource_id, details, created_at) VALUES ('schedule_re_enabled', 'schedule', ?, 'Manually re-enabled', datetime('now'))",
      [String(scheduleId)]
    );
  } catch {}
}

/**
 * Get summary stats for dashboard.
 */
function getPerformanceSummary() {
  let green = 0, yellow = 0, red = 0, paused = 0;
  try {
    const g = get("SELECT COUNT(*) as c FROM schedules WHERE performance_health = 'green' AND enabled = 1");
    green = g?.c || 0;
    const y = get("SELECT COUNT(*) as c FROM schedules WHERE performance_health = 'yellow' AND enabled = 1");
    yellow = y?.c || 0;
    const r = get("SELECT COUNT(*) as c FROM schedules WHERE performance_health = 'red' AND enabled = 1");
    red = r?.c || 0;
    const p = get("SELECT COUNT(*) as c FROM schedules WHERE auto_paused = 1");
    paused = p?.c || 0;
  } catch {}
  return { green, yellow, red, paused };
}

module.exports = {
  evaluateScheduleHealth,
  evaluateAllSchedules,
  shouldAutoPause,
  autoPauseSchedule,
  reEnableSchedule,
  getPerformanceSummary,
};
