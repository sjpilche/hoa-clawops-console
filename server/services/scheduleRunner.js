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

// ── Lazy-load pipeline runner (avoids circular dep at init) ──
let _pipelineRunner = null;
function getPipelineRunner() {
  if (!_pipelineRunner) {
    _pipelineRunner = require('./pipelineRunner');
  }
  return _pipelineRunner;
}

// ── Daily spend cap check — reads max_cost_per_run * max_runs_per_hour from settings ──
function checkDailyBudget() {
  try {
    const maxPerRun = parseFloat(get("SELECT value FROM settings WHERE key='max_cost_per_run'")?.value || '5.00');
    const maxRuns   = parseInt(get("SELECT value FROM settings WHERE key='max_runs_per_hour'")?.value || '20', 10);
    const dailyCap  = maxPerRun * maxRuns; // e.g. $5 × 20 = $100/day ceiling

    const today = new Date().toISOString().slice(0, 10);
    const spent = get(
      "SELECT COALESCE(SUM(cost_usd), 0) AS total FROM runs WHERE DATE(created_at)=? AND status='completed'",
      [today]
    )?.total || 0;

    if (spent >= dailyCap) {
      console.warn(`[ScheduleRunner] 💸 Daily budget cap reached ($${spent.toFixed(4)} / $${dailyCap.toFixed(2)}) — skipping run`);
      return false;
    }
    return true;
  } catch {
    return true; // if check fails, allow run (don't block the pipeline)
  }
}

// ── Execute one schedule ──────────────────────────────────────────────────────
async function executeSchedule(schedule) {
  if (!checkDailyBudget()) return;

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

      // Notify pipeline runner in case this run is part of a chain
      try { getPipelineRunner().onRunCompleted(runId, outputText); } catch {}

    } else {
      // ── LLM agent — use the bridge ──
      const bridge = require('./openclawBridge');
      const brain  = require('./collectiveBrain');
      // Use daily session ID for continuity — agents remember context across runs on the same day
      const today = new Date().toISOString().slice(0, 10);
      const agentSessionId = `scheduled-${agent.name}-${today}`;

      // ── Collective Brain: inject context from all 4 layers before the agent runs ──
      // Determine content type and market context from agent name + message params
      const contentTypeMap = {
        'jake-outreach-agent': 'outreach_email',  'cfo-outreach-agent': 'outreach_email',
        'jake-content-engine': 'blog_post',        'cfo-content-engine': 'blog_post',
        'jake-social-scheduler': 'social_post',    'cfo-social-scheduler': 'social_post',
      };
      const contentType = contentTypeMap[agent.name] || null;
      let marketCtx = null, erpCtx = null;
      try {
        const mp = JSON.parse(message || '{}');
        marketCtx = mp.region || mp.market || null;
        erpCtx    = mp.erp_system || mp.erp || null;
      } catch {}

      const brainContext = await brain.buildAgentContext(agent.name, agentSessionId, {
        obsTypes:    ['lead_signal', 'market_insight', 'content_gap'],
        market:      marketCtx,
        erpContext:  erpCtx,
        contentType,
      });

      // Prepend brain context to the agent's message
      const enrichedMessage = brainContext ? brainContext + message : message;

      // Pass agent.name as agentId (matches OpenClaw registration slug), NOT the UUID
      const bridgeResult = await bridge.runAgent(agent.name, {
        openclawId: agentConfig.openclaw_id || agent.name,
        message: enrichedMessage,
        sessionId: agentSessionId,
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

      // Post-process LLM output into unified marketing pipeline
      const { postProcessLLMOutput } = require('./postProcessor');
      postProcessLLMOutput(agent, outputText, message);

      // Notify pipeline runner in case this run is part of a chain
      try { getPipelineRunner().onRunCompleted(runId, outputText); } catch {}
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

// ── Nightly brain distillation — runs at 02:00 AM every day ──────────────────
let _lastDistillDate = null;

async function maybeRunDistillation() {
  const now = new Date();
  if (now.getHours() !== 2 || now.getMinutes() !== 0) return;
  const today = now.toISOString().slice(0, 10);
  if (_lastDistillDate === today) return; // already ran today
  _lastDistillDate = today;

  try {
    const brain = require('./collectiveBrain');
    console.log('[ScheduleRunner] 🧠 Running nightly brain distillation...');
    const result = await brain.runDistillation();
    console.log(`[ScheduleRunner] 🧠 Distillation complete — inserted: ${result.inserted}, skipped: ${result.skipped}`);
  } catch (err) {
    console.error('[ScheduleRunner] 🧠 Distillation failed (non-fatal):', err.message);
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

    // Check for delayed pipeline steps that are now due
    try { getPipelineRunner().tickDelayedSteps(); } catch {}

    // Nightly brain distillation at 02:00 AM
    maybeRunDistillation().catch(() => {});
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

  // Log brain stats on startup (non-blocking)
  setTimeout(async () => {
    try {
      const brain = require('./collectiveBrain');
      const stats = await brain.getStats();
      console.log(
        `[ScheduleRunner] 🧠 Brain status — observations: ${stats.observations_total}, ` +
        `feedback: ${stats.feedback_total} (${stats.feedback_approved} approved), ` +
        `episodes: ${stats.episodes_total}, KB: ${stats.kb_total} entries`
      );
    } catch { /* non-fatal */ }
  }, 5000); // 5s after start — let DB settle first
}

function stopScheduleRunner() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

module.exports = { startScheduleRunner, stopScheduleRunner };
