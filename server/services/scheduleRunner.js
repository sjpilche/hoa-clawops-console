/**
 * Schedule Runner — fires DB-stored agent schedules based on cron expressions.
 *
 * Checks every minute whether any enabled schedule is due to run.
 * Calls the same internal execution path as POST /api/runs/:id/confirm.
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

// ── Execute one schedule via the internal run pipeline ────────────────────────
async function executeSchedule(schedule) {
  console.log(`[ScheduleRunner] 🚀 Firing: "${schedule.name}" (agent: ${schedule.agent_id})`);

  // Mark as last_run_at immediately to prevent double-fire within the same minute
  run("UPDATE schedules SET last_run_at = datetime('now') WHERE id = ?", [schedule.id]);

  try {
    const agent = get('SELECT * FROM agents WHERE id = ?', [schedule.agent_id]);
    if (!agent) {
      console.error(`[ScheduleRunner] Agent not found: ${schedule.agent_id}`);
      return;
    }

    const agentConfig = JSON.parse(agent.config || '{}');
    const runId = crypto.randomUUID();
    const message = schedule.message || '';

    // Insert a run record using the actual schema (result_data stores message/session context)
    run(`
      INSERT INTO runs (id, agent_id, status, trigger, result_data, created_at, updated_at)
      VALUES (?, ?, 'running', 'scheduled', ?, datetime('now'), datetime('now'))
    `, [runId, agent.id, JSON.stringify({ message, sessionId: runId, json: true })]);

    // Lazy-require the execution logic to avoid circular deps
    if (agentConfig.special_handler === 'hoa_discovery') {
      const { processGeoTarget, processMultipleGeoTargets } = require('./googleMapsDiscovery');

      let params = {};
      try { params = JSON.parse(message); } catch { /* use defaults */ }

      const limit = params.limit || 1;
      const geoTargetId = params.geo_target_id || null;

      const startTime = Date.now();
      let result;
      if (geoTargetId) {
        result = await processGeoTarget(geoTargetId);
      } else {
        result = await processMultipleGeoTargets(limit);
      }

      const duration = Math.round((Date.now() - startTime) / 1000);
      const output = JSON.stringify({
        type: 'result',
        result: `Discovery complete: ${result.new_communities || result.total_new || 0} new communities found across ${result.targets_processed || 1} geo-target(s). Duration: ${duration}s. Cost: $0`,
        total_cost_usd: 0,
      });

      run(`
        UPDATE runs SET status = 'completed', result_data = ?, completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?
      `, [output, runId]);

      console.log(`[ScheduleRunner] ✅ "${schedule.name}" — ${result.new_communities || result.total_new || 0} new HOAs, $0 cost`);

    } else if (agentConfig.special_handler === 'mgmt_review_scanner') {
      // Agent 39: Review Scanner batch — daily 4am scan of management companies
      const { runReviewScannerBatch } = require('./mgmtReviewScanner');
      let params = {};
      try { params = JSON.parse(message); } catch { /* use defaults */ }
      const startTime = Date.now();
      const result = await runReviewScannerBatch(params);
      const duration = Math.round((Date.now() - startTime) / 1000);
      const output = JSON.stringify({
        type: 'result',
        result: `Review scan batch: ${result.batch_size} companies, ${result.total_signals} signals, ${result.total_hot_leads} hot leads. Duration: ${duration}s. Cost: $0`,
        total_cost_usd: 0,
      });
      run("UPDATE runs SET status = 'completed', result_data = ?, completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", [output, runId]);
      console.log(`[ScheduleRunner] ✅ "${schedule.name}" — ${result.total_signals} signals, ${result.total_hot_leads} hot leads, $0`);

    } else if (agentConfig.special_handler === 'mgmt_cai_scraper') {
      // Agent 40: CAI Directory Scraper — weekly Sunday refresh
      const { runCaiScraper } = require('./mgmtCaiScraper');
      let params = {};
      try { params = JSON.parse(message); } catch { /* use defaults */ }
      const startTime = Date.now();
      const result = await runCaiScraper(params);
      const duration = Math.round((Date.now() - startTime) / 1000);
      const output = JSON.stringify({
        type: 'result',
        result: `CAI directory: ${result.companies_found} found, ${result.new_companies} new, ${result.aamc_companies} AAMC. Duration: ${duration}s. Cost: $0`,
        total_cost_usd: 0,
      });
      run("UPDATE runs SET status = 'completed', result_data = ?, completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", [output, runId]);
      console.log(`[ScheduleRunner] ✅ "${schedule.name}" — ${result.new_companies} new companies, $0`);

    } else if (agentConfig.special_handler === 'github_publisher') {
      const { publishPost } = require('./githubPublisher');
      const pubResult = await publishPost(message);
      const output = JSON.stringify({ type: 'result', result: pubResult.message || 'Published', total_cost_usd: 0 });
      run("UPDATE runs SET status = 'completed', result_data = ?, completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", [output, runId]);
      console.log(`[ScheduleRunner] ✅ "${schedule.name}" — github_publisher done`);

    } else {
      // LLM agent — use the bridge
      const bridge = require('./openclawBridge');
      const bridgeResult = await bridge.runAgent(agent.id, { message, sessionId: runId });
      const cost = bridgeResult.cost || 0;
      const output = bridgeResult.output || JSON.stringify({ type: 'result', result: bridgeResult.result || 'Done', total_cost_usd: cost });
      run("UPDATE runs SET status = 'completed', result_data = ?, cost_usd = ?, completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", [output, cost, runId]);
      console.log(`[ScheduleRunner] ✅ "${schedule.name}" — cost: $${cost.toFixed(4)}`);
    }

  } catch (err) {
    console.error(`[ScheduleRunner] ❌ "${schedule.name}" failed:`, err.message);
    // We don't reset last_run_at — prevents infinite retry on broken schedules
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
