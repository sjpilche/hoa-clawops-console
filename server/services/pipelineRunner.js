/**
 * @file pipelineRunner.js
 * @description Agent Pipeline Orchestration — completion-triggered chaining.
 *
 * When an agent run completes (from scheduleRunner, blitz, or manual), this service
 * checks if the completed run is part of a pipeline. If so, it triggers the next step.
 *
 * Called from:
 *   - scheduleRunner.js — after schedule execution completes
 *   - blitz.js — after each blitz agent completes
 *   - runs.js — after manual run confirmation completes
 */

'use strict';

const { all, get, run } = require('../db/connection');
const crypto = require('crypto');

// ════════════════════════════════════════════════════════════════════════════
// START A PIPELINE
// ════════════════════════════════════════════════════════════════════════════

/**
 * Start a pipeline by name or ID.
 * Creates a pipeline_run + all pipeline_run_steps, then executes step 0.
 *
 * @param {string|number} pipelineIdOrName - Pipeline ID or name
 * @param {object} opts
 * @param {string} opts.triggerType - 'manual' | 'scheduled' | 'blitz'
 * @param {object} opts.initialContext - JSON context to pass to step 0
 * @returns {{ pipelineRunId: number, firstRunId: string }} or null if pipeline not found
 */
function startPipeline(pipelineIdOrName, opts = {}) {
  const { triggerType = 'manual', initialContext = {} } = opts;

  // Find pipeline
  const pipeline = typeof pipelineIdOrName === 'number'
    ? get('SELECT * FROM agent_pipelines WHERE id = ? AND is_active = 1', [pipelineIdOrName])
    : get('SELECT * FROM agent_pipelines WHERE name = ? AND is_active = 1', [pipelineIdOrName]);

  if (!pipeline) {
    console.error(`[Pipeline] Pipeline not found or inactive: ${pipelineIdOrName}`);
    return null;
  }

  const steps = JSON.parse(pipeline.steps);
  if (!steps.length) {
    console.error(`[Pipeline] Pipeline "${pipeline.name}" has no steps`);
    return null;
  }

  console.log(`[Pipeline] Starting "${pipeline.name}" (${steps.length} steps, trigger: ${triggerType})`);

  // Create pipeline run
  run(
    `INSERT INTO pipeline_runs (pipeline_id, status, current_step, total_steps, trigger_type, context, started_at)
     VALUES (?, 'running', 0, ?, ?, ?, datetime('now'))`,
    [pipeline.id, steps.length, triggerType, JSON.stringify(initialContext)]
  );
  const pipelineRun = get('SELECT id FROM pipeline_runs ORDER BY id DESC LIMIT 1');
  const pipelineRunId = pipelineRun.id;

  // Create all step records
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    run(
      `INSERT INTO pipeline_run_steps (pipeline_run_id, step_index, agent_name, status, delay_minutes)
       VALUES (?, ?, ?, 'pending', ?)`,
      [pipelineRunId, i, step.agent_name, step.delay_minutes || 0]
    );
  }

  // Execute step 0
  const firstRunId = executeStep(pipelineRunId, 0, initialContext);

  return { pipelineRunId, firstRunId };
}

// ════════════════════════════════════════════════════════════════════════════
// EXECUTE A PIPELINE STEP
// ════════════════════════════════════════════════════════════════════════════

/**
 * Execute a specific pipeline step — creates a run and fires the agent.
 *
 * @param {number} pipelineRunId
 * @param {number} stepIndex
 * @param {object} context - Accumulated context from prior steps
 * @returns {string} runId of the created run
 */
function executeStep(pipelineRunId, stepIndex, context = {}) {
  const step = get(
    'SELECT * FROM pipeline_run_steps WHERE pipeline_run_id = ? AND step_index = ?',
    [pipelineRunId, stepIndex]
  );

  if (!step) {
    console.error(`[Pipeline] Step ${stepIndex} not found for pipeline run ${pipelineRunId}`);
    return null;
  }

  // Check delay
  if (step.delay_minutes > 0) {
    const scheduledFor = new Date(Date.now() + step.delay_minutes * 60 * 1000).toISOString();
    run(
      `UPDATE pipeline_run_steps SET status = 'waiting', scheduled_for = ?, input_context = ? WHERE id = ?`,
      [scheduledFor, JSON.stringify(context), step.id]
    );
    console.log(`[Pipeline] Step ${stepIndex} (${step.agent_name}) delayed ${step.delay_minutes}min → ${scheduledFor}`);
    return null; // Will be picked up by tickDelayedSteps()
  }

  // Find the agent
  const agent = get('SELECT * FROM agents WHERE name = ?', [step.agent_name]);
  if (!agent) {
    console.error(`[Pipeline] Agent not found: ${step.agent_name}`);
    run(
      `UPDATE pipeline_run_steps SET status = 'failed', error = 'Agent not found', completed_at = datetime('now') WHERE id = ?`,
      [step.id]
    );
    failPipelineRun(pipelineRunId, `Agent not found: ${step.agent_name}`);
    return null;
  }

  // Build the message — use pipeline step's message_template or fallback
  const pipelineRun = get('SELECT * FROM pipeline_runs WHERE id = ?', [pipelineRunId]);
  const pipeline = get('SELECT * FROM agent_pipelines WHERE id = ?', [pipelineRun.pipeline_id]);
  const pipelineSteps = JSON.parse(pipeline.steps);
  const stepDef = pipelineSteps[stepIndex] || {};
  let message = stepDef.message_template || '';

  // Inject context variables into message template
  if (message && context) {
    message = message.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return context[key] !== undefined ? String(context[key]) : `{{${key}}}`;
    });
  }

  // If no template, pass context as JSON
  if (!message && Object.keys(context).length > 0) {
    message = JSON.stringify({ pipeline_context: context });
  }
  if (!message) {
    message = `Pipeline step ${stepIndex + 1}: execute your standard workflow.`;
  }

  // Create a run record
  const runId = crypto.randomUUID();
  const agentConfig = JSON.parse(agent.config || '{}');

  run(
    `INSERT INTO runs (id, agent_id, user_id, status, trigger, result_data, created_at, updated_at)
     VALUES (?, ?, 'system', 'running', 'pipeline', ?, datetime('now'), datetime('now'))`,
    [runId, agent.id, JSON.stringify({ message, pipelineRunId, stepIndex })]
  );

  // Update step record
  run(
    `UPDATE pipeline_run_steps SET status = 'running', run_id = ?, input_context = ?, started_at = datetime('now') WHERE id = ?`,
    [runId, JSON.stringify(context), step.id]
  );

  // Update pipeline_runs current step
  run('UPDATE pipeline_runs SET current_step = ? WHERE id = ?', [stepIndex, pipelineRunId]);

  // Update agent status
  run("UPDATE agents SET status = 'running', updated_at = datetime('now') WHERE id = ?", [agent.id]);

  console.log(`[Pipeline] Executing step ${stepIndex} → ${step.agent_name} (run: ${runId.slice(0, 8)})`);

  // Fire the agent asynchronously
  fireAgent(agent, agentConfig, message, runId, pipelineRunId, stepIndex).catch(err => {
    console.error(`[Pipeline] Step ${stepIndex} (${step.agent_name}) error:`, err.message);
    onStepFailed(pipelineRunId, stepIndex, runId, agent.id, err.message);
  });

  return runId;
}

/**
 * Actually execute the agent (special handler or LLM bridge).
 */
async function fireAgent(agent, agentConfig, message, runId, pipelineRunId, stepIndex) {
  const startTime = Date.now();

  try {
    // Lazy-load handlers
    const handlers = require('../routes/runs').SPECIAL_HANDLERS || {};
    const handler = agentConfig.special_handler ? handlers[agentConfig.special_handler] : null;

    let outputText, durationMs, costUsd = 0, tokensUsed = 0;

    if (handler) {
      // Special handler (deterministic)
      const result = await handler({ message, runId, agent, agentConfig });
      durationMs = result.durationMs || (Date.now() - startTime);
      costUsd = result.costUsd || 0;
      tokensUsed = result.tokensUsed || 0;
      outputText = result.outputText || 'Done';
    } else {
      // LLM agent via OpenClaw bridge
      const bridge = require('./openclawBridge');
      const today = new Date().toISOString().slice(0, 10);
      const sessionId = `pipeline-${agent.name}-${today}`;

      const bridgeResult = await bridge.runAgent(agent.name, {
        openclawId: agentConfig.openclaw_id || agent.name,
        message,
        sessionId,
      });

      const parsed = bridge.constructor.parseOutput(bridgeResult.output);
      durationMs = Date.now() - startTime;
      costUsd = parsed.costUsd || 0;
      tokensUsed = parsed.tokensUsed || 0;
      outputText = parsed.text || bridgeResult.output || 'Done';
    }

    // Mark run as completed
    const resultData = JSON.stringify({ sessionId: runId, message, outputText, pipelineRunId, stepIndex });
    run(
      `UPDATE runs SET status='completed', completed_at=datetime('now'), duration_ms=?, tokens_used=?, cost_usd=?, result_data=?, updated_at=datetime('now') WHERE id=?`,
      [durationMs, tokensUsed, costUsd, resultData, runId]
    );
    run(
      `UPDATE agents SET status='idle', total_runs=total_runs+1, last_run_at=datetime('now'), updated_at=datetime('now') WHERE id=?`,
      [agent.id]
    );

    // Post-process LLM output
    if (!agentConfig.special_handler) {
      const { postProcessLLMOutput } = require('./postProcessor');
      postProcessLLMOutput(agent, outputText, message);
    }

    // Notify pipeline of step completion
    onStepCompleted(pipelineRunId, stepIndex, outputText);

  } catch (err) {
    const durationMs = Date.now() - startTime;
    run(
      `UPDATE runs SET status='failed', error_msg=?, duration_ms=?, completed_at=datetime('now'), updated_at=datetime('now') WHERE id=?`,
      [err.message, durationMs, runId]
    );
    run("UPDATE agents SET status='idle', updated_at=datetime('now') WHERE id=?", [agent.id]);
    throw err;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// STEP COMPLETION → TRIGGER NEXT
// ════════════════════════════════════════════════════════════════════════════

/**
 * Called when a pipeline step completes successfully.
 * Extracts summary from output, stores it, and triggers the next step.
 */
function onStepCompleted(pipelineRunId, stepIndex, outputText) {
  // Build output summary for next step's context
  const outputSummary = extractOutputSummary(outputText);

  // Update step record
  run(
    `UPDATE pipeline_run_steps SET status = 'completed', output_summary = ?, completed_at = datetime('now') WHERE pipeline_run_id = ? AND step_index = ?`,
    [JSON.stringify(outputSummary), pipelineRunId, stepIndex]
  );

  // Get pipeline run
  const pipelineRun = get('SELECT * FROM pipeline_runs WHERE id = ?', [pipelineRunId]);
  if (!pipelineRun || pipelineRun.status !== 'running') return;

  const nextStepIndex = stepIndex + 1;

  if (nextStepIndex >= pipelineRun.total_steps) {
    // Pipeline complete!
    completePipelineRun(pipelineRunId);
    return;
  }

  // Build accumulated context for next step
  const priorContext = JSON.parse(pipelineRun.context || '{}');
  const completedSteps = all(
    'SELECT step_index, agent_name, output_summary FROM pipeline_run_steps WHERE pipeline_run_id = ? AND status = ? ORDER BY step_index',
    [pipelineRunId, 'completed']
  );

  const context = { ...priorContext };
  for (const cs of completedSteps) {
    try {
      const summary = JSON.parse(cs.output_summary || '{}');
      context[`step_${cs.step_index}_output`] = summary;
      context[`${cs.agent_name.replace(/-/g, '_')}_output`] = summary;
    } catch {}
  }

  // Update pipeline context
  run('UPDATE pipeline_runs SET context = ? WHERE id = ?', [JSON.stringify(context), pipelineRunId]);

  // Execute next step
  console.log(`[Pipeline] Step ${stepIndex} done → triggering step ${nextStepIndex}`);
  executeStep(pipelineRunId, nextStepIndex, context);
}

/**
 * Called when a pipeline step fails.
 */
function onStepFailed(pipelineRunId, stepIndex, runId, agentId, errorMsg) {
  run(
    `UPDATE pipeline_run_steps SET status = 'failed', error = ?, completed_at = datetime('now') WHERE pipeline_run_id = ? AND step_index = ?`,
    [errorMsg, pipelineRunId, stepIndex]
  );
  failPipelineRun(pipelineRunId, `Step ${stepIndex} failed: ${errorMsg}`);
}

function completePipelineRun(pipelineRunId) {
  run(
    `UPDATE pipeline_runs SET status = 'completed', completed_at = datetime('now') WHERE id = ?`,
    [pipelineRunId]
  );
  const pRun = get('SELECT p.name FROM pipeline_runs pr JOIN agent_pipelines p ON pr.pipeline_id = p.id WHERE pr.id = ?', [pipelineRunId]);
  console.log(`[Pipeline] ✅ Pipeline "${pRun?.name}" run ${pipelineRunId} COMPLETED`);
}

function failPipelineRun(pipelineRunId, reason) {
  run(
    `UPDATE pipeline_runs SET status = 'failed', completed_at = datetime('now') WHERE id = ?`,
    [pipelineRunId]
  );
  // Mark remaining pending steps as skipped
  run(
    `UPDATE pipeline_run_steps SET status = 'skipped' WHERE pipeline_run_id = ? AND status IN ('pending', 'waiting')`,
    [pipelineRunId]
  );
  console.error(`[Pipeline] ❌ Pipeline run ${pipelineRunId} FAILED: ${reason}`);
}

// ════════════════════════════════════════════════════════════════════════════
// DELAYED STEP CHECKER — called periodically from scheduleRunner
// ════════════════════════════════════════════════════════════════════════════

/**
 * Check for pipeline steps that are in 'waiting' status and whose delay has elapsed.
 * Should be called every ~60 seconds (piggyback on scheduleRunner tick).
 */
function tickDelayedSteps() {
  try {
    const waitingSteps = all(
      `SELECT prs.*, pr.context FROM pipeline_run_steps prs
       JOIN pipeline_runs pr ON prs.pipeline_run_id = pr.id
       WHERE prs.status = 'waiting' AND prs.scheduled_for <= datetime('now')
       AND pr.status = 'running'`
    );

    for (const step of waitingSteps) {
      const context = JSON.parse(step.context || step.input_context || '{}');
      console.log(`[Pipeline] Delayed step ${step.step_index} (${step.agent_name}) is due — executing`);
      executeStep(step.pipeline_run_id, step.step_index, context);
    }
  } catch (err) {
    console.error('[Pipeline] tickDelayedSteps error:', err.message);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// EXTERNAL RUN COMPLETION HOOK
// ════════════════════════════════════════════════════════════════════════════

/**
 * Called from scheduleRunner/blitz/runs.js when any run completes.
 * Checks if this run is associated with a pipeline step and triggers the chain.
 *
 * @param {string} runId - The completed run's ID
 * @param {string} outputText - The run's output text
 */
function onRunCompleted(runId, outputText) {
  try {
    const step = get('SELECT * FROM pipeline_run_steps WHERE run_id = ? AND status = ?', [runId, 'running']);
    if (!step) return; // Not a pipeline run — nothing to do

    onStepCompleted(step.pipeline_run_id, step.step_index, outputText || '');
  } catch (err) {
    console.error('[Pipeline] onRunCompleted error:', err.message);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Extract a summary from agent output for passing to the next step.
 * Tries to parse JSON; otherwise creates a text summary.
 */
function extractOutputSummary(outputText) {
  if (!outputText) return { text: '' };

  // Try JSON parse
  try {
    const parsed = JSON.parse(outputText);
    // Return key fields if it's structured output
    if (parsed.leads) return { leads_count: parsed.leads.length, leads: parsed.leads.slice(0, 10) };
    if (parsed.contacts) return { contacts_count: parsed.contacts.length, contacts: parsed.contacts.slice(0, 10) };
    if (parsed.content_markdown) return { title: parsed.title, pillar: parsed.pillar, has_content: true };
    if (parsed.email_body) return { subject: parsed.email_subject, has_email: true };
    return parsed;
  } catch {}

  // Try JSON in code block
  const m = outputText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) {
    try { return JSON.parse(m[1]); } catch {}
  }

  // Plain text — return truncated
  return { text: outputText.slice(0, 500), full_length: outputText.length };
}

module.exports = {
  startPipeline,
  onRunCompleted,
  tickDelayedSteps,
};
