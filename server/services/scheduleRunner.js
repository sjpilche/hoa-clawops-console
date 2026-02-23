/**
 * Schedule Runner — fires DB-stored agent schedules based on cron expressions.
 *
 * Checks every minute whether any enabled schedule is due to run.
 * Uses the shared SPECIAL_HANDLERS registry from runs.js for all special-handler agents,
 * falls back to OpenClaw bridge for LLM agents.
 */

const { get, all, run } = require('../db/connection');
const crypto = require('crypto');

let _timer = null;
let _checkRunning = false;

// ── Minimal cron-due check ────────────────────────────────────────────────────
function isDue(cronExpr) {
  try {
    const now = new Date();
    const parts = cronExpr.trim().split(/\s+/);
    if (parts.length !== 5) return false;
    const [min, hour, dom, mon, dow] = parts;

    const match = (field, value) => {
      if (field === '*') return true;
      if (field.includes(',')) return field.split(',').map(Number).includes(value);
      if (field.includes('-')) {
        const [lo, hi] = field.split('-').map(Number);
        return value >= lo && value <= hi;
      }
      if (field.includes('/')) {
        const [base, step] = field.split('/');
        const start = base === '*' ? 0 : Number(base);
        return (value - start) % Number(step) === 0;
      }
      return Number(field) === value;
    };

    return (
      match(min, now.getMinutes()) &&
      match(hour, now.getHours()) &&
      match(dom, now.getDate()) &&
      match(mon, now.getMonth() + 1) &&
      match(dow, now.getDay())
    );
  } catch {
    return false;
  }
}

function alreadyRanThisMinute(lastRunAt) {
  if (!lastRunAt) return false;
  const last = new Date(lastRunAt);
  const now = new Date();
  return (
    last.getFullYear() === now.getFullYear() &&
    last.getMonth() === now.getMonth() &&
    last.getDate() === now.getDate() &&
    last.getHours() === now.getHours() &&
    last.getMinutes() === now.getMinutes()
  );
}

// ── Lazy-load the SPECIAL_HANDLERS from runs.js (avoids circular dep at init) ──
let _handlers = null;
function getHandlers() {
  if (!_handlers) {
    _handlers = require('../routes/runs').SPECIAL_HANDLERS || {};
  }
  return _handlers;
}

// ── Execute one schedule ──────────────────────────────────────────────────────
async function executeSchedule(schedule) {
  console.log(`[ScheduleRunner] 🚀 Firing: "${schedule.name}" (agent: ${schedule.agent_id})`);

  // Mark as last_run_at immediately to prevent double-fire within the same minute
  run("UPDATE schedules SET last_run_at = datetime('now') WHERE id = ?", [schedule.id]);

  const agent = get('SELECT * FROM agents WHERE id = ?', [schedule.agent_id]);
  if (!agent) {
    console.error(`[ScheduleRunner] Agent not found: ${schedule.agent_id}`);
    return;
  }

  const agentConfig = JSON.parse(agent.config || '{}');
  const runId = crypto.randomUUID();
  const message = schedule.message || '';
  const startTime = Date.now();

  // Insert a run record
  run(`
    INSERT INTO runs (id, agent_id, status, trigger, result_data, created_at, updated_at)
    VALUES (?, ?, 'running', 'scheduled', ?, datetime('now'), datetime('now'))
  `, [runId, agent.id, JSON.stringify({ message, sessionId: runId, json: true })]);

  try {
    const handlers = getHandlers();
    const handler = agentConfig.special_handler ? handlers[agentConfig.special_handler] : null;

    if (handler) {
      // ── Special handler (deterministic, usually $0) ──
      const result = await handler({ message, runId, agent, agentConfig });
      const durationMs = result.durationMs || (Date.now() - startTime);
      const costUsd = result.costUsd || 0;
      const tokensUsed = result.tokensUsed || 0;
      const outputText = result.outputText || 'Done';
      const resultData = JSON.stringify({ sessionId: runId, message, outputText, ...(result.extra || {}) });

      run(
        `UPDATE runs SET status='completed', completed_at=datetime('now'), duration_ms=?, tokens_used=?, cost_usd=?, result_data=?, updated_at=datetime('now') WHERE id=?`,
        [durationMs, tokensUsed, costUsd, resultData, runId]
      );
      run(
        `UPDATE agents SET status='idle', total_runs=total_runs+1, last_run_at=datetime('now'), updated_at=datetime('now') WHERE id=?`,
        [agent.id]
      );
      console.log(`[ScheduleRunner] ✅ "${schedule.name}" — ${outputText.substring(0, 100)}`);

    } else {
      // ── LLM agent — use the bridge ──
      const bridge = require('./openclawBridge');
      // Pass agent.name as agentId (matches OpenClaw registration slug), NOT the UUID
      const bridgeResult = await bridge.runAgent(agent.name, {
        openclawId: agentConfig.openclaw_id || agent.name,
        message,
        sessionId: runId,
      });
      const parsed = bridge.constructor.parseOutput(bridgeResult.output);
      const durationMs = Date.now() - startTime;
      const costUsd = parsed.costUsd || 0;
      const tokensUsed = parsed.tokensUsed || 0;
      const outputText = parsed.text || bridgeResult.output || 'Done';
      const resultData = JSON.stringify({ sessionId: runId, message, outputText });

      run(
        `UPDATE runs SET status='completed', completed_at=datetime('now'), duration_ms=?, tokens_used=?, cost_usd=?, result_data=?, updated_at=datetime('now') WHERE id=?`,
        [durationMs, tokensUsed, costUsd, resultData, runId]
      );
      run(
        `UPDATE agents SET status='idle', total_runs=total_runs+1, last_run_at=datetime('now'), updated_at=datetime('now') WHERE id=?`,
        [agent.id]
      );
      console.log(`[ScheduleRunner] ✅ "${schedule.name}" — cost: $${costUsd.toFixed(4)}`);
    }

  } catch (err) {
    const durationMs = Date.now() - startTime;
    console.error(`[ScheduleRunner] ❌ "${schedule.name}" failed:`, err.message);
    // Mark the run as failed so it shows in the UI (don't leave in 'running' state forever)
    run(
      `UPDATE runs SET status='failed', error_msg=?, duration_ms=?, completed_at=datetime('now'), updated_at=datetime('now') WHERE id=?`,
      [err.message, durationMs, runId]
    );
    run(
      `UPDATE agents SET status='idle', updated_at=datetime('now') WHERE id=?`,
      [agent.id]
    );
  }
}

// ── Main tick ─────────────────────────────────────────────────────────────────
async function tick() {
  if (_checkRunning) return;
  _checkRunning = true;
  try {
    const schedules = all('SELECT * FROM schedules WHERE enabled = 1 ORDER BY created_at ASC');
    for (const schedule of schedules) {
      if (isDue(schedule.cron_expression) && !alreadyRanThisMinute(schedule.last_run_at)) {
        executeSchedule(schedule).catch(e =>
          console.error(`[ScheduleRunner] Unhandled in "${schedule.name}":`, e.message)
        );
      }
    }
  } catch (err) {
    console.error('[ScheduleRunner] Tick error:', err.message);
  } finally {
    _checkRunning = false;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
function startScheduleRunner() {
  if (_timer) return;
  const secsUntilNextMinute = 60 - new Date().getSeconds();
  console.log(`[ScheduleRunner] Starting in ${secsUntilNextMinute}s (aligned to minute boundary)`);
  setTimeout(() => {
    tick();
    _timer = setInterval(tick, 60 * 1000);
    console.log('[ScheduleRunner] ✅ Running — checks every minute');
  }, secsUntilNextMinute * 1000);
}

function stopScheduleRunner() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

module.exports = { startScheduleRunner, stopScheduleRunner };
