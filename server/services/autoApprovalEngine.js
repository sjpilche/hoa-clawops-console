/**
 * @file autoApprovalEngine.js
 * @description Autonomous outreach approval — connects Ralph QA + approvalEngine + SendGrid send.
 *
 * When an outreach draft is created and passes Ralph QA, this engine decides whether
 * to auto-approve and send it, or hold it for human review.
 *
 * Decision matrix:
 *   1. qa_status === 'failed'          → HOLD
 *   2. auto_approval_paused            → HOLD (circuit breaker active)
 *   3. sequence_position > 1 (follow-up) → AUTO_APPROVE
 *   4. qa_score >= threshold AND approvalEngine confidence >= 80 → AUTO_APPROVE
 *   5. Else                            → HOLD
 *
 * Safety rails:
 *   - Opt-in: auto_approval_enabled defaults to 'false'
 *   - Daily send cap (default 50)
 *   - Bounce rate circuit breaker (>5% in 7d → pause all)
 *   - Full audit trail in audit_log
 *   - Discord alerts on first 5 auto-sends per day and on circuit breaker trips
 *
 * $0/decision — pure SQLite reads + existing approvalEngine scoring.
 */

'use strict';

const { get, all, run } = require('../db/connection');

// ── Settings helpers ────────────────────────────────────────────────────────────

function getSetting(key, defaultValue) {
  try {
    const row = get('SELECT value FROM settings WHERE key = ?', [key]);
    return row?.value ?? defaultValue;
  } catch { return defaultValue; }
}

function setSetting(key, value) {
  try {
    run(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, String(value)]
    );
  } catch (err) {
    console.warn(`[AutoApproval] Failed to set ${key}:`, err.message);
  }
}

function isEnabled() {
  return getSetting('auto_approval_enabled', 'false') === 'true';
}

function isPaused() {
  return getSetting('auto_approval_paused', 'false') === 'true';
}

function getQaThreshold() {
  return parseInt(getSetting('auto_approval_qa_threshold', '80'), 10);
}

function getDailyCap() {
  return parseInt(getSetting('auto_approval_daily_cap', '50'), 10);
}

function getBounceThreshold() {
  return parseFloat(getSetting('auto_approval_bounce_threshold', '0.05'));
}

// ── Circuit breakers ────────────────────────────────────────────────────────────

function checkCircuitBreakers() {
  const dailyCap = getDailyCap();

  // Count sends today
  let sentToday = 0;
  try {
    const row = get(
      "SELECT COUNT(*) as c FROM cfo_outreach_sequences WHERE status = 'sent' AND DATE(sent_at) = DATE('now')"
    );
    sentToday = row?.c || 0;
  } catch {}

  // Bounce rate over last 7 days
  let bounceRate7d = 0;
  let sent7d = 0;
  let bounced7d = 0;
  try {
    const sentRow = get(
      "SELECT COUNT(*) as c FROM cfo_outreach_sequences WHERE status IN ('sent', 'delivered', 'bounced') AND sent_at > datetime('now', '-7 days')"
    );
    sent7d = sentRow?.c || 0;
    const bounceRow = get(
      "SELECT COUNT(*) as c FROM cfo_outreach_sequences WHERE status = 'bounced' AND sent_at > datetime('now', '-7 days')"
    );
    bounced7d = bounceRow?.c || 0;
    bounceRate7d = sent7d > 0 ? bounced7d / sent7d : 0;
  } catch {}

  const bounceThreshold = getBounceThreshold();
  const capReached = sentToday >= dailyCap;
  const bounceTripped = sent7d >= 10 && bounceRate7d > bounceThreshold; // Only trip if meaningful sample

  let sendingAllowed = true;
  let reason = '';

  if (isPaused()) {
    sendingAllowed = false;
    reason = 'Auto-approval manually paused';
  } else if (capReached) {
    sendingAllowed = false;
    reason = `Daily cap reached (${sentToday}/${dailyCap})`;
  } else if (bounceTripped) {
    sendingAllowed = false;
    reason = `Bounce rate too high (${(bounceRate7d * 100).toFixed(1)}% > ${(bounceThreshold * 100).toFixed(0)}% threshold, ${bounced7d}/${sent7d} in 7d)`;
    // Auto-pause to prevent further damage
    pauseAutoApproval(reason);
  }

  return { sendingAllowed, reason, sentToday, dailyCap, bounceRate7d, bounced7d, sent7d };
}

// ── Core decision function ──────────────────────────────────────────────────────

/**
 * Process a newly created outreach draft for auto-approval.
 *
 * @param {number} sequenceId — ID of the cfo_outreach_sequences row
 * @returns {{ decision: 'approved'|'held'|'paused', reason: string }}
 */
async function processNewDraft(sequenceId) {
  // Guard: enabled?
  if (!isEnabled()) {
    logDecision(sequenceId, 'held', 'Auto-approval not enabled');
    return { decision: 'held', reason: 'Auto-approval not enabled' };
  }

  // Read the outreach sequence
  const seq = get('SELECT * FROM cfo_outreach_sequences WHERE id = ?', [sequenceId]);
  if (!seq) return { decision: 'held', reason: 'Sequence not found' };

  // Already processed?
  if (seq.status !== 'draft' || seq.auto_approval_decision) {
    return { decision: 'held', reason: 'Already processed' };
  }

  // QA must pass
  if (seq.qa_status === 'failed') {
    logDecision(sequenceId, 'held', `QA failed (score: ${seq.qa_score})`);
    return { decision: 'held', reason: `QA failed (score: ${seq.qa_score})` };
  }

  if (seq.qa_status !== 'passed') {
    logDecision(sequenceId, 'held', `QA not yet complete (status: ${seq.qa_status})`);
    return { decision: 'held', reason: `QA pending (status: ${seq.qa_status})` };
  }

  // Circuit breakers
  const breakers = checkCircuitBreakers();
  if (!breakers.sendingAllowed) {
    logDecision(sequenceId, 'paused', breakers.reason);
    return { decision: 'paused', reason: breakers.reason };
  }

  // Decision logic
  const qaThreshold = getQaThreshold();
  let shouldApprove = false;
  let reason = '';

  // Path 1: Follow-up emails (sequence_position > 1) — auto-approve
  const seqPosition = seq.sequence_position || 1;
  if (seqPosition > 1) {
    shouldApprove = true;
    reason = `Follow-up email (position ${seqPosition}) — auto-approved`;
  }
  // Path 2: QA score + approvalEngine confidence
  else if (seq.qa_score >= qaThreshold) {
    // Check lead-level confidence via approvalEngine
    const lead = seq.lead_id ? get('SELECT * FROM cfo_leads WHERE id = ?', [seq.lead_id]) : null;
    if (lead) {
      try {
        const { decideSendApproval } = require('./approvalEngine');
        const product = seq.source_agent === 'hoa' ? 'hoa' : 'jake';
        const approval = await decideSendApproval(lead, product);

        if (approval.confidence >= 80) {
          shouldApprove = true;
          reason = `QA: ${seq.qa_score}/100, Confidence: ${approval.confidence}/100 (${approval.reason})`;
        } else {
          reason = `QA passed (${seq.qa_score}) but confidence too low: ${approval.confidence}/100 (${approval.reason})`;
        }
      } catch (err) {
        reason = `ApprovalEngine error: ${err.message}`;
      }
    } else {
      reason = `QA passed (${seq.qa_score}) but no lead found (lead_id: ${seq.lead_id})`;
    }
  } else {
    reason = `QA score ${seq.qa_score} below threshold ${qaThreshold}`;
  }

  if (!shouldApprove) {
    logDecision(sequenceId, 'held', reason);
    return { decision: 'held', reason };
  }

  // ── Execute: approve + send ──────────────────────────────────────────────────

  try {
    // Mark as approved
    run(
      `UPDATE cfo_outreach_sequences SET
        status = 'approved',
        auto_approval_decision = 'approved',
        auto_approval_reason = ?,
        auto_approved_at = datetime('now')
      WHERE id = ?`,
      [reason, sequenceId]
    );

    // Send the email
    const sendResult = await sendOutreachEmail(sequenceId);

    if (sendResult.success) {
      logDecision(sequenceId, 'approved', `${reason} → sent to ${sendResult.email}`);

      // Discord alert
      try {
        const { notifyAutoSend } = require('./approvalEngine');
        const lead = seq.lead_id ? get('SELECT company_name FROM cfo_leads WHERE id = ?', [seq.lead_id]) : null;
        notifyAutoSend(seq.lead_id, lead?.company_name || 'Unknown', seq.qa_score, 'email');
      } catch {}

      // Brain feedback: auto-sent signal
      try {
        const brain = require('./collectiveBrain');
        const agentName = seq.source_agent === 'jake' ? 'jake-outreach-agent' : 'cfo-outreach-agent';
        brain.recordFeedback(agentName, 'outreach', String(sequenceId), 'auto_sent', {
          notes: `Auto-approved: ${reason}`,
        });
      } catch {}

      return { decision: 'approved', reason: `${reason} → sent` };
    } else {
      // Send failed — revert to draft
      run(
        `UPDATE cfo_outreach_sequences SET status = 'draft', auto_approval_decision = 'send_failed', auto_approval_reason = ? WHERE id = ?`,
        [`Send failed: ${sendResult.error}`, sequenceId]
      );
      logDecision(sequenceId, 'held', `Approved but send failed: ${sendResult.error}`);
      return { decision: 'held', reason: `Send failed: ${sendResult.error}` };
    }
  } catch (err) {
    console.error(`[AutoApproval] Error processing #${sequenceId}:`, err.message);
    logDecision(sequenceId, 'held', `Error: ${err.message}`);
    return { decision: 'held', reason: `Error: ${err.message}` };
  }
}

// ── Shared send function (used by auto-approval AND manual approve) ─────────

/**
 * Send an outreach email by sequence ID.
 * Identical logic to cfoMarketing.js lines 357-384, extracted for reuse.
 *
 * @param {number} sequenceId
 * @returns {{ success: boolean, email?: string, messageId?: string, error?: string }}
 */
async function sendOutreachEmail(sequenceId) {
  const seq = get('SELECT * FROM cfo_outreach_sequences WHERE id = ?', [sequenceId]);
  if (!seq) return { success: false, error: 'Sequence not found' };
  if (!seq.lead_id) return { success: false, error: 'No lead_id on sequence' };

  const lead = get('SELECT id, contact_email, contact_name, company_name FROM cfo_leads WHERE id = ?', [seq.lead_id]);
  if (!lead?.contact_email) return { success: false, error: 'No contact email — enrich the lead first' };

  // ── Outreach guard: null-email, dedup, throttle, subject-flood ──
  const outreachGuard = require('./outreachGuard');
  const check = outreachGuard.canSend(lead.contact_email, sequenceId, seq.source_agent || 'jake', seq.email_subject);
  if (!check.allowed) {
    console.warn(`[AutoApproval] Send blocked for #${sequenceId}: ${check.reason}`);
    run("UPDATE cfo_outreach_sequences SET status = 'cancelled', delivery_error = ? WHERE id = ?", [check.reason, sequenceId]);
    return { success: false, error: check.reason };
  }

  try {
    const sg = require('./sendgrid');
    const subject = seq.email_subject || 'Hello';
    const bodyText = seq.email_body || '';
    const html = sg.wrapInBrandedShell(
      bodyText.split('\n').map(p => p.trim() ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;">${p}</p>` : '').join('')
    );

    const result = await sg.send({
      to: lead.contact_email,
      subject,
      html,
      text: bodyText,
      persona: seq.source_agent || 'jake',
    });

    if (result.success) {
      console.log(`[AutoApproval] Email sent to ${lead.contact_email} (${lead.company_name}) msgId=${result.messageId}`);
      run(
        "UPDATE cfo_outreach_sequences SET status = 'sent', sent_at = datetime('now'), delivery_status = 'delivered', delivery_error = NULL WHERE id = ?",
        [sequenceId]
      );
      run(
        "UPDATE cfo_leads SET status = 'contacted', updated_at = datetime('now') WHERE id = ? AND status = 'new'",
        [lead.id]
      );
      return { success: true, email: lead.contact_email, messageId: result.messageId };
    } else {
      throw new Error(result.error || result.reason || 'SendGrid send failed');
    }
  } catch (err) {
    console.error(`[AutoApproval] Send failed for #${sequenceId}:`, err.message);
    run(
      "UPDATE cfo_outreach_sequences SET delivery_status = 'failed', delivery_error = ? WHERE id = ?",
      [err.message, sequenceId]
    );
    return { success: false, error: err.message };
  }
}

// ── Pause / Resume ──────────────────────────────────────────────────────────────

function pauseAutoApproval(reason) {
  setSetting('auto_approval_paused', 'true');

  // Audit log
  try {
    run(
      "INSERT INTO audit_log (action, resource, details, created_at) VALUES ('auto_approval_paused', 'system', ?, datetime('now'))",
      [reason]
    );
  } catch {}

  // Discord alert
  try {
    const discord = require('./discordNotifier');
    discord.postWebhook({
      embeds: [{
        title: 'Auto-Approval PAUSED',
        description: reason,
        color: 0xff4444,
        timestamp: new Date().toISOString(),
        footer: { text: 'AutoApprovalEngine · ClawOps' },
      }],
    }).catch(e => console.warn('[AutoApproval] notify failed:', e.message));
  } catch {}

  console.warn(`[AutoApproval] PAUSED: ${reason}`);
}

function resumeAutoApproval() {
  setSetting('auto_approval_paused', 'false');

  try {
    run(
      "INSERT INTO audit_log (action, resource, details, created_at) VALUES ('auto_approval_resumed', 'system', 'Manually resumed', datetime('now'))"
    );
  } catch {}

  console.log('[AutoApproval] Resumed');
}

// ── Stats ───────────────────────────────────────────────────────────────────────

function getAutoApprovalStats() {
  const breakers = checkCircuitBreakers();

  let todayApproved = 0;
  let todayHeld = 0;
  let weekApproved = 0;
  let weekHeld = 0;

  try {
    const ta = get("SELECT COUNT(*) as c FROM cfo_outreach_sequences WHERE auto_approval_decision = 'approved' AND DATE(auto_approved_at) = DATE('now')");
    todayApproved = ta?.c || 0;
    const th = get("SELECT COUNT(*) as c FROM audit_log WHERE action = 'auto_approval' AND details LIKE '%held%' AND DATE(created_at) = DATE('now')");
    todayHeld = th?.c || 0;
    const wa = get("SELECT COUNT(*) as c FROM cfo_outreach_sequences WHERE auto_approval_decision = 'approved' AND auto_approved_at > datetime('now', '-7 days')");
    weekApproved = wa?.c || 0;
    const wh = get("SELECT COUNT(*) as c FROM audit_log WHERE action = 'auto_approval' AND details LIKE '%held%' AND created_at > datetime('now', '-7 days')");
    weekHeld = wh?.c || 0;
  } catch {}

  return {
    enabled: isEnabled(),
    paused: isPaused(),
    qaThreshold: getQaThreshold(),
    dailyCap: getDailyCap(),
    bounceThreshold: getBounceThreshold(),
    today: { approved: todayApproved, held: todayHeld, sent: breakers.sentToday },
    week: { approved: weekApproved, held: weekHeld },
    circuitBreaker: {
      sendingAllowed: breakers.sendingAllowed,
      reason: breakers.reason || null,
      bounceRate7d: Math.round(breakers.bounceRate7d * 100),
      bounced7d: breakers.bounced7d,
      sent7d: breakers.sent7d,
    },
  };
}

function getRecentActivity(limit = 20) {
  try {
    return all(
      "SELECT * FROM audit_log WHERE action IN ('auto_approval', 'auto_approval_paused', 'auto_approval_resumed') ORDER BY created_at DESC LIMIT ?",
      [limit]
    );
  } catch { return []; }
}

// ── Audit log helper ────────────────────────────────────────────────────────────

function logDecision(sequenceId, decision, reason) {
  try {
    run(
      "INSERT INTO audit_log (action, resource, resource_id, details, created_at) VALUES ('auto_approval', 'outreach_sequence', ?, ?, datetime('now'))",
      [String(sequenceId), `${decision}: ${reason}`]
    );
  } catch {}

  // Also update the sequence row
  try {
    run(
      'UPDATE cfo_outreach_sequences SET auto_approval_decision = ?, auto_approval_reason = ? WHERE id = ? AND auto_approval_decision IS NULL',
      [decision, reason, sequenceId]
    );
  } catch {}
}

module.exports = {
  processNewDraft,
  sendOutreachEmail,
  checkCircuitBreakers,
  pauseAutoApproval,
  resumeAutoApproval,
  getAutoApprovalStats,
  getRecentActivity,
  isEnabled,
  isPaused,
};
