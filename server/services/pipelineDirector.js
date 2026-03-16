/**
 * @file pipelineDirector.js
 * @description The Claw Director — reads next_action queues from both pipelines
 * and dispatches work to the right service, respecting daily budget caps.
 *
 * Runs at 6:30 AM M-F via scheduleRunner, and on-demand via SPECIAL_HANDLER.
 * Zero LLM cost in itself — dispatches to $0 services only (dossier, enricher).
 * Outreach dispatch queues a pending run rather than calling directly (keeps
 * the confirmation gate in place).
 *
 * Action dispatch map:
 *   'enrich'          → jakeContactEnricher.enrichMultipleLeads()   ($0)
 *   'generate_dossier'→ leadDossierGenerator.generateDossier()      ($0)
 *   'send_outreach'   → approvalEngine.decideSendApproval() → queue run OR auto-send (LLM)
 *   'follow_up'       → tenacityCadenceEngine (adaptive multi-touch) or jake-follow-up-agent (LLM)
 *   'cadence_touch'   → tenacityCadenceEngine (same path as follow_up)
 *   'book_call'       → creates pending run for jake-meeting-booker  (LLM)
 *   HOA 'send_outreach' → approves hoa engagement (status='approved')
 *   HOA 'generate_dossier' → leadDossierGenerator.generateEngagementDossier()
 *
 * Safety rules:
 *   - Max 20 actions per director cycle (prevent runaway)
 *   - Daily budget cap checked before any LLM dispatch
 *   - Only acts on leads where next_action_due <= now
 *   - Discord plan summary posted after every cycle
 */

'use strict';

const { run, get, all } = require('../db/connection');
const discord = require('./discordNotifier');
const { computeAllStates } = require('./pipelineStateTracker');
const approvalEngine = require('./approvalEngine');

const MAX_ACTIONS_PER_CYCLE = 20;
const MAX_LLM_DISPATCHES    = 5;    // LLM runs per cycle (cost guard)

// ── Budget check (mirrors scheduleRunner logic) ───────────────────────────────

function checkDailyBudget() {
  try {
    const maxPerRun = parseFloat(get("SELECT value FROM settings WHERE key='max_cost_per_run'")?.value || '5.00');
    const maxRuns   = parseInt(get("SELECT value FROM settings WHERE key='max_runs_per_hour'")?.value || '20', 10);
    const dailyCap  = maxPerRun * maxRuns;
    const today     = new Date().toISOString().slice(0, 10);
    const spent     = get(
      "SELECT COALESCE(SUM(cost_usd), 0) AS total FROM runs WHERE DATE(created_at)=? AND status='completed'",
      [today]
    )?.total || 0;
    if (spent >= dailyCap) {
      console.warn(`[Director] 💸 Daily budget cap reached ($${parseFloat(spent).toFixed(4)} / $${dailyCap.toFixed(2)}) — skipping LLM dispatches`);
      return false;
    }
    return true;
  } catch { return true; }
}

// ── Get system user ID (for run records) ─────────────────────────────────────

function getSystemUserId() {
  try {
    return get("SELECT id FROM users LIMIT 1")?.id || 'system';
  } catch { return 'system'; }
}

// ── Advance next_action_due after dispatching ─────────────────────────────────

function advanceDue(leadId, product, hours = 24) {
  const table = product === 'hoa' ? 'lg_engagement_queue' : 'cfo_leads';
  const due = new Date(Date.now() + hours * 3600000).toISOString();
  run(`UPDATE ${table} SET next_action_due = ? WHERE id = ?`, [due, leadId]);
}

// ── Queue a pending run (for LLM agent dispatch) ──────────────────────────────

function queuePendingRun(agentName, message, userId) {
  try {
    const { v4: uuidv4 } = require('uuid');
    const agent = get('SELECT * FROM agents WHERE name = ?', [agentName]);
    if (!agent) {
      console.warn(`[Director] Agent not found: ${agentName}`);
      return null;
    }
    const runId = uuidv4();
    run(
      `INSERT INTO runs (id, agent_id, user_id, status, trigger, result_data, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', 'director', ?, datetime('now'), datetime('now'))`,
      [runId, agent.id, userId, JSON.stringify({ sessionId: runId, message, output: null, outputText: '' })]
    );
    return runId;
  } catch (err) {
    console.error(`[Director] queuePendingRun failed for ${agentName}:`, err.message);
    return null;
  }
}

// ── Action dispatcher ─────────────────────────────────────────────────────────

async function dispatchAction(lead, product, action, plan, userId, budgetOk) {
  const leadId = lead.id;
  const label  = lead.company_name || lead.post_title || `${product}#${leadId}`;

  try {
    switch (action) {

      case 'enrich': {
        // Jake only — call enricher directly (no cost)
        const { enrichLead } = require('./jakeContactEnricher');
        const result = await enrichLead(leadId);
        plan.enriched.push(label);
        advanceDue(leadId, product, 48); // re-check in 48h
        console.log(`[Director] Enriched: ${label} → ${result.email || 'no email'}`);
        break;
      }

      case 'generate_dossier': {
        const { generateDossier, generateEngagementDossier } = require('./leadDossierGenerator');
        if (product === 'hoa') {
          await generateEngagementDossier(leadId);
        } else {
          await generateDossier(leadId, product);
        }
        plan.dossiers.push(label);
        advanceDue(leadId, product, 2); // send outreach soon after
        console.log(`[Director] Dossier generated: ${label}`);
        break;
      }

      case 'send_outreach': {
        if (!budgetOk) { plan.skipped_budget.push(label); break; }
        if (plan.llm_dispatched >= MAX_LLM_DISPATCHES) { plan.skipped_limit.push(label); break; }

        if (product === 'hoa') {
          // HOA: confidence check before approving
          const approval = await approvalEngine.decideSendApproval(lead, 'hoa');
          if (approval.skip) {
            plan.skipped_lowconf.push(`${label} (conf=${approval.confidence})`);
            approvalEngine.notifyLowConfidence(leadId, label, approval.confidence, approval.reason);
            break;
          }
          // Approve the HOA engagement (makes it visible in outreach queue)
          run(`UPDATE lg_engagement_queue SET status='approved', approved_at=datetime('now') WHERE id=?`, [leadId]);
          plan.outreaches.push(label);
          advanceDue(leadId, product, 48);
          if (approval.autoSend) {
            approvalEngine.notifyAutoSend(leadId, label, approval.confidence, 'hoa-email');
            plan.auto_sent.push(label);
          }
        } else {
          // Jake: confidence check — skip low-confidence, auto-send high-confidence
          const approval = await approvalEngine.decideSendApproval(lead, 'jake');
          if (approval.skip) {
            plan.skipped_lowconf.push(`${label} (conf=${approval.confidence})`);
            approvalEngine.notifyLowConfidence(leadId, label, approval.confidence, approval.reason);
            break;
          }

          const agentName = lead.source_agent === 'cfo' ? 'cfo-outreach-agent' : 'jake-outreach-agent';
          const msg = JSON.stringify({
            lead_id: leadId, company_name: label,
            auto_queued: true, auto_send: approval.autoSend,
            confidence: approval.confidence,
          });
          const queuedRunId = queuePendingRun(agentName, msg, userId);
          if (queuedRunId) {
            plan.outreaches.push(label);
            plan.llm_dispatched++;
            advanceDue(leadId, product, 72);
            if (approval.autoSend) {
              approvalEngine.notifyAutoSend(leadId, label, approval.confidence, 'email');
              plan.auto_sent.push(label);
            }
          }
        }
        break;
      }

      case 'follow_up':
      case 'cadence_touch': {
        if (!budgetOk) { plan.skipped_budget.push(label); break; }
        if (plan.llm_dispatched >= MAX_LLM_DISPATCHES) { plan.skipped_limit.push(label); break; }

        // Route through Tenacity Cadence Engine when lead has cadence active,
        // falling back to plain follow-up if cadence engine unavailable.
        if (lead.cadence_active) {
          try {
            const cadenceEngine = require('./tenacityCadenceEngine');
            const cadence = await cadenceEngine.computeCadenceForLead(leadId, product);
            const cadenceMsg = await cadenceEngine.buildCadenceMessage(leadId, product, cadence.next_touch_number);
            const cadenceAgentName = cadence.next_touch_number === 1
              ? (lead.source_agent === 'cfo' ? 'cfo-outreach-agent' : 'jake-outreach-agent')
              : (product === 'hoa' ? 'hoa-email-campaigns' : 'jake-follow-up-agent');
            const runId = queuePendingRun(cadenceAgentName, cadenceMsg, userId);
            if (runId) {
              plan.follow_ups.push(`${label} (cadence touch ${cadence.next_touch_number})`);
              plan.llm_dispatched++;
              // Update cadence state
              run(
                `UPDATE ${product === 'hoa' ? 'lg_engagement_queue' : 'cfo_leads'}
                 SET last_touch_number=?, next_touch_due=?, updated_at=datetime('now') WHERE id=?`,
                [cadence.next_touch_number, cadence.next_touch_due, leadId]
              );
            }
            break;
          } catch (cadErr) {
            console.warn(`[Director] Cadence engine failed for lead ${leadId}, falling back to plain follow-up:`, cadErr.message);
          }
        }

        // Fallback: plain follow-up (no cadence)
        const agentName = lead.source_agent === 'cfo' ? 'cfo-outreach-agent' : 'jake-follow-up-agent';
        const msg = JSON.stringify({ lead_id: leadId, type: 'follow_up', auto_queued: true });
        const runId = queuePendingRun(agentName, msg, userId);
        if (runId) {
          plan.follow_ups.push(label);
          plan.llm_dispatched++;
          advanceDue(leadId, product, 5 * 24); // 5 days between follow-ups
        }
        break;
      }

      case 'book_call': {
        if (!budgetOk) { plan.skipped_budget.push(label); break; }
        if (plan.llm_dispatched >= MAX_LLM_DISPATCHES) { plan.skipped_limit.push(label); break; }

        const runId = queuePendingRun('jake-meeting-booker',
          JSON.stringify({ lead_id: leadId, auto_queued: true }), userId);
        if (runId) {
          plan.calls.push(label);
          plan.llm_dispatched++;
          advanceDue(leadId, product, 48);
        }
        break;
      }

      default:
        console.log(`[Director] Unknown action "${action}" for ${label} — skipping`);
    }
  } catch (err) {
    plan.errors.push({ label, action, error: err.message });
    console.error(`[Director] Action "${action}" failed for ${label}:`, err.message);
    // Non-fatal — continue with other leads
  }
}

// ── Main director cycle ───────────────────────────────────────────────────────

/**
 * Run one full director cycle:
 *  1. Re-compute all pipeline states
 *  2. Find leads with next_action_due <= now (ready to act)
 *  3. Dispatch up to MAX_ACTIONS_PER_CYCLE actions
 *  4. Post Discord summary
 *
 * @returns {object} plan summary
 */
async function runDirectorCycle() {
  const startTime = Date.now();
  console.log('[Director] Starting pipeline director cycle...');

  // Load brain insights for smarter prioritization
  let brainInsights = null;
  try {
    const brainReader = require('./brainReader');
    brainInsights = {
      jake: brainReader.getWinningAngles('jake'),
      hoa: brainReader.getWinningAngles('hoa'),
      timing: brainReader.getBestSendTiming('jake'),
    };
    if (brainInsights.jake.totalWins > 0) {
      console.log(`[Director] Brain: ${brainInsights.jake.totalWins} winning patterns loaded (top ERP: ${brainInsights.jake.topERP}, top market: ${brainInsights.jake.topMarket})`);
    }
  } catch {} // Non-fatal

  // Step 1: refresh all pipeline states
  let stateResult;
  try {
    stateResult = await computeAllStates('both');
  } catch (err) {
    console.error('[Director] computeAllStates failed:', err.message);
    stateResult = { jake: null, hoa: null, total_stalled: 0 };
  }

  const plan = {
    enriched:        [],
    dossiers:        [],
    outreaches:      [],
    auto_sent:       [],
    follow_ups:      [],
    calls:           [],
    skipped_budget:  [],
    skipped_limit:   [],
    skipped_lowconf: [],
    errors:          [],
    llm_dispatched:  0,
    total_actions:   0,
  };

  const userId  = getSystemUserId();
  const budgetOk = checkDailyBudget();
  const now = new Date().toISOString();

  // Step 2a: Jake leads ready to act
  const jakeReady = all(`
    SELECT * FROM cfo_leads
    WHERE next_action IS NOT NULL
      AND next_action_due <= ?
      AND stalled = 0
      AND status NOT IN ('dead', 'closed', 'unsubscribed', 'bounced')
    ORDER BY urgency_score DESC, pilot_fit_score DESC
    LIMIT ?
  `, [now, MAX_ACTIONS_PER_CYCLE]);

  // Step 2b: HOA engagements ready to act
  const hoaReady = all(`
    SELECT * FROM lg_engagement_queue
    WHERE next_action IS NOT NULL
      AND next_action_due <= ?
      AND stalled = 0
      AND status NOT IN ('rejected', 'expired', 'posted')
    ORDER BY relevance_score DESC
    LIMIT ?
  `, [now, MAX_ACTIONS_PER_CYCLE]);

  // Interleave jake + hoa (up to MAX_ACTIONS_PER_CYCLE total)
  const combined = [];
  const jakeCount = Math.ceil(MAX_ACTIONS_PER_CYCLE * 0.7); // 70% jake
  const hoaCount  = MAX_ACTIONS_PER_CYCLE - jakeCount;      // 30% hoa
  jakeReady.slice(0, jakeCount).forEach(l => combined.push({ lead: l, product: 'jake' }));
  hoaReady.slice(0, hoaCount).forEach(l => combined.push({ lead: l, product: 'hoa' }));

  console.log(`[Director] ${combined.length} leads ready: ${jakeReady.length} jake, ${hoaReady.length} hoa`);

  // Step 3: dispatch
  for (const { lead, product } of combined) {
    if (plan.total_actions >= MAX_ACTIONS_PER_CYCLE) break;
    await dispatchAction(lead, product, lead.next_action, plan, userId, budgetOk);
    plan.total_actions++;
  }

  const durationMs = Date.now() - startTime;

  // Step 4: Discord summary
  const totalWork = plan.enriched.length + plan.dossiers.length + plan.outreaches.length +
                    plan.follow_ups.length + plan.calls.length;

  const summaryLines = [
    `📋 **${plan.enriched.length}** enriched`,
    `📄 **${plan.dossiers.length}** dossiers generated`,
    `📤 **${plan.outreaches.length}** outreaches queued${plan.auto_sent.length ? ` (🤖 ${plan.auto_sent.length} auto-sent)` : ''}`,
    `🔁 **${plan.follow_ups.length}** follow-ups queued`,
    `📅 **${plan.calls.length}** call bookings queued`,
  ];
  if (plan.skipped_lowconf.length) summaryLines.push(`🎯 ${plan.skipped_lowconf.length} skipped (low confidence)`);
  if (plan.skipped_budget.length)  summaryLines.push(`💸 ${plan.skipped_budget.length} skipped (budget cap)`);
  if (plan.skipped_limit.length)   summaryLines.push(`🚦 ${plan.skipped_limit.length} skipped (LLM dispatch limit)`);
  if (plan.errors.length)         summaryLines.push(`❌ ${plan.errors.length} errors`);

  const stageBreakdown = stateResult.jake?.byStage
    ? Object.entries(stateResult.jake.byStage).map(([s, n]) => `${s}:${n}`).join(' · ')
    : '';

  try {
    await discord.postWebhook({
      embeds: [{
        title: `🦀 Claw Director — Daily Cycle`,
        description: summaryLines.join('\n'),
        color: totalWork > 0 ? 0x00cc44 : 0x888888,
        fields: [
          stageBreakdown ? { name: 'Jake Pipeline Stages', value: stageBreakdown, inline: false } : null,
          { name: 'Stalled', value: String(stateResult.total_stalled || 0), inline: true },
          { name: 'Duration', value: `${(durationMs / 1000).toFixed(1)}s`, inline: true },
          { name: 'Budget OK', value: budgetOk ? '✅' : '❌ Cap reached', inline: true },
        ].filter(Boolean),
        timestamp: new Date().toISOString(),
        footer: { text: 'ClawDirector · ClawOps' },
      }],
    });
  } catch { /* non-critical */ }

  const outputText = [
    `Claw Director cycle complete: ${totalWork} actions dispatched in ${(durationMs / 1000).toFixed(1)}s`,
    `  Enriched: ${plan.enriched.length} | Dossiers: ${plan.dossiers.length} | Outreaches: ${plan.outreaches.length}${plan.auto_sent.length ? ` (${plan.auto_sent.length} auto-sent)` : ''}`,
    `  Follow-ups: ${plan.follow_ups.length} | Calls: ${plan.calls.length}`,
    plan.skipped_lowconf.length > 0 ? `  🎯 ${plan.skipped_lowconf.length} skipped (low confidence)` : null,
    stateResult.total_stalled > 0 ? `  ⚠️  ${stateResult.total_stalled} stalled leads need attention` : `  ✅ No stalled leads`,
    plan.errors.length > 0 ? `  ❌ ${plan.errors.length} errors: ${plan.errors.map(e => e.label).join(', ')}` : null,
  ].filter(Boolean).join('\n');

  console.log(`[Director] ${outputText}`);

  return { outputText, durationMs, plan, stateResult };
}

module.exports = { runDirectorCycle };
