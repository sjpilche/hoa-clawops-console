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

  const agent = get('SELECT * FROM agents WHERE id = ?', [schedule.agent_id]);
  if (!agent) {
    console.error(`[ScheduleRunner] Agent not found: ${schedule.agent_id}`);
    return;
  }

  const agentConfig = JSON.parse(agent.config || '{}');
  const runId = crypto.randomUUID();
  const message = schedule.message || '';
  const startTime = Date.now();

  // Insert a run record — use system user for scheduled runs
  const systemUser = get("SELECT id FROM users LIMIT 1");
  const userId = systemUser?.id || 'system';
  run(`
    INSERT INTO runs (id, agent_id, user_id, status, trigger, result_data, created_at, updated_at)
    VALUES (?, ?, ?, 'running', 'scheduled', ?, datetime('now'), datetime('now'))
  `, [runId, agent.id, userId, JSON.stringify({ message, sessionId: runId, json: true })]);

  // Mark last_run_at AFTER successful INSERT — prevents phantom fires where
  // the schedule looks "ran" but no run record exists in the DB
  run("UPDATE schedules SET last_run_at = datetime('now') WHERE id = ?", [schedule.id]);

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
      // ── LLM agent — route to Ollama (free) or OpenClaw (OpenAI) based on agent config + global setting ──
      const ollamaEnabled = get("SELECT value FROM settings WHERE key='ollama_enabled'")?.value === 'true';
      const useOllama = ollamaEnabled && (agentConfig.use_ollama === true);
      const bridge = useOllama ? require('./ollamaBridge') : require('./openclawBridge');
      if (useOllama) console.log(`[ScheduleRunner] 🦙 Using Ollama for "${agent.name}" (free local inference)`);
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

      // Marketing learner: inject writer briefing for content agents
      let writerBriefing = '';
      try {
        const isContentAgent = /content-engine|content-writer|social-scheduler|social-media/i.test(agent.name);
        if (isContentAgent) {
          const learner = require('./marketingLearner');
          writerBriefing = learner.generateWriterBriefing(agent.name);
          if (writerBriefing) console.log(`[ScheduleRunner] Injected writer briefing for ${agent.name} (${writerBriefing.length} chars)`);
        }
      } catch {} // Non-fatal if marketing_learnings table doesn't exist yet

      // Prepend brain context + writer briefing to the agent's message
      // Truncate brain context to avoid Windows 8191 char command-line limit
      // Windows has 8191 char command-line limit for OpenClaw CLI.
      // Reserve ~4000 for agent message + CLI overhead, cap brain at 2000.
      const maxBrainLen = 2000;
      const truncatedBrain = brainContext && brainContext.length > maxBrainLen
        ? brainContext.slice(0, maxBrainLen) + '\n[... brain context truncated ...]\n'
        : brainContext;
      let enrichedMessage = (writerBriefing || '') + (truncatedBrain || '') + message;
      // Hard cap total message at 6000 chars to guarantee CLI doesn't overflow
      if (enrichedMessage.length > 6000) {
        console.warn(`[ScheduleRunner] Message too long (${enrichedMessage.length} chars), truncating to 6000`);
        enrichedMessage = enrichedMessage.slice(0, 6000) + '\n[... message truncated ...]';
      }

      // Pass agent.name as agentId (matches OpenClaw registration slug), NOT the UUID
      const ollamaModel = get("SELECT value FROM settings WHERE key='ollama_model'")?.value || 'llama3.2:3b';
      const bridgeResult = await bridge.runAgent(agent.name, {
        openclawId: agentConfig.openclaw_id || agent.name,
        message: enrichedMessage,
        sessionId: agentSessionId,
        ollamaModel,
      });
      const parsed = bridge.constructor.parseOutput(bridgeResult.output);
      const durationMs = Date.now() - startTime;
      const costUsd = useOllama ? 0 : (parsed.costUsd || 0);
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

// ── Brain Council summary — runs at 02:30 AM (30 min after distillation) ──────
let _lastCouncilDate = null;

async function maybeRunBrainCouncil() {
  const now = new Date();
  if (now.getHours() !== 2 || now.getMinutes() !== 30) return;
  const today = now.toISOString().slice(0, 10);
  if (_lastCouncilDate === today) return; // already ran today
  _lastCouncilDate = today;

  try {
    const brain = require('./collectiveBrain');
    console.log('[ScheduleRunner] 🧠 Running Brain Council summary...');
    const result = await brain.brainCouncilSummary();
    if (result.posted) {
      console.log(`[ScheduleRunner] 🧠 Brain Council: posted ${result.count} new patterns to Discord`);
    } else {
      console.log('[ScheduleRunner] 🧠 Brain Council: no new patterns to post');
    }
  } catch (err) {
    console.error('[ScheduleRunner] 🧠 Brain Council failed (non-fatal):', err.message);
  }
}

// ── Schedule drift detection ──────────────────────────────────────────────────
// Checks if any schedule that should have fired in the last tick window was missed.
const DRIFT_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

function checkScheduleDrift(schedules) {
  const now = Date.now();
  for (const schedule of schedules) {
    if (!schedule.last_run_at || !schedule.enabled) continue;
    // Only check schedules that are currently due (should be running now)
    if (!isDue(schedule.cron_expression)) continue;

    const lastRun = new Date(schedule.last_run_at).getTime();
    const drift = now - lastRun;

    // If last run was more than 65 minutes ago AND the schedule is due now,
    // it means we missed the last fire window
    if (drift > 65 * 60 * 1000) {
      const driftMinutes = Math.round(drift / 60000);
      console.warn(`[ScheduleDrift] "${schedule.name}" — last ran ${driftMinutes}m ago, due now. Possible missed fire.`);

      // Log to audit_log for tracking
      try {
        run(
          `INSERT INTO audit_log (id, action, resource, details, outcome) VALUES (lower(hex(randomblob(16))), 'schedule_drift', ?, ?, 'failure')`,
          [`schedule:${schedule.id}`, JSON.stringify({ name: schedule.name, drift_minutes: driftMinutes, cron: schedule.cron_expression, last_run: schedule.last_run_at })]
        );
      } catch {}

      // Discord alert for significant drift
      if (driftMinutes > 120) {
        try {
          const discord = require('./discordNotifier');
          discord.sendEmbed({
            title: `Schedule Drift: "${schedule.name}"`,
            description: `Last ran ${driftMinutes} minutes ago but is due now. Possible server downtime or cron failure.`,
            color: 0xff9500,
            timestamp: new Date().toISOString(),
          });
        } catch {}
      }
    }
  }
}

// ── Main tick ─────────────────────────────────────────────────────────────────
async function tick() {
  if (_checkRunning) return;
  _checkRunning = true;
  try {
    const schedules = all('SELECT * FROM schedules WHERE enabled = 1 ORDER BY created_at ASC');

    // Check for schedule drift before executing
    checkScheduleDrift(schedules);

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

    // Brain Council Discord summary at 02:30 AM (after distillation)
    maybeRunBrainCouncil().catch(() => {});
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
