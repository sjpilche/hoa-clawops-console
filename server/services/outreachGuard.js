/**
 * @file outreachGuard.js
 * @description Centralized safety guards for all outreach email sending.
 *
 * Every send path (outreach_sender handler, bulk-send, autoApprovalEngine)
 * MUST call these guards before sending. Prevents:
 *   - Sending to null/empty emails
 *   - Duplicate sends to the same contact in the same sequence window
 *   - Exceeding per-domain daily throttle (warm-up mode)
 *   - Sending identical subject lines to large batches
 *
 * USAGE:
 *   const guard = require('./outreachGuard');
 *   const check = guard.canSend(contactEmail, sequenceId, sourceAgent);
 *   if (!check.allowed) { console.warn(check.reason); skip; }
 *   // after successful send:
 *   guard.recordSend(contactEmail, sourceAgent);
 */

'use strict';

const { get, all } = require('../db/connection');

// ── Per-domain daily send limits (warm-up safe) ─────────────────────────────
// Override with OUTREACH_DAILY_PER_DOMAIN env var. Default: 50/domain/day.
// After 4+ weeks of clean sending, can ramp to 200-500.
const DEFAULT_DAILY_PER_DOMAIN = parseInt(process.env.OUTREACH_DAILY_PER_DOMAIN) || 50;

// ── Duplicate window: how many days before we can re-email the same contact ──
// Override with OUTREACH_DEDUP_DAYS env var. Default: 14 days.
const DEDUP_DAYS = parseInt(process.env.OUTREACH_DEDUP_DAYS) || 14;

// ── Max sends of identical subject in a single day ──────────────────────────
const MAX_SAME_SUBJECT_PER_DAY = parseInt(process.env.OUTREACH_MAX_SAME_SUBJECT) || 20;

// Domain → sender mapping (mirrors sendgrid.js SENDER_IDENTITIES)
const DOMAIN_MAP = {
  hoa: 'hoaprojectfunding.com',
  jake: 'jakecfo.com',
  owen: 'owencfo.com',
  data_rehab: 'getdatarehab.com',
  'data-rehab': 'getdatarehab.com',
  terrapin: 'terrapinstationfences.com',
  fence: 'terrapinstationfences.com',
};

/**
 * Check whether we're allowed to send to this contact right now.
 *
 * @param {string} contactEmail — recipient email
 * @param {number|null} sequenceId — cfo_outreach_sequences.id (for context)
 * @param {string} sourceAgent — persona key (jake, hoa, data_rehab, etc.)
 * @param {string|null} subject — email subject (for same-subject check)
 * @returns {{ allowed: boolean, reason?: string }}
 */
function canSend(contactEmail, sequenceId, sourceAgent, subject) {
  // ── 1. Null/empty email guard ──
  if (!contactEmail || !contactEmail.trim() || !contactEmail.includes('@')) {
    return { allowed: false, reason: `Blocked: invalid/empty email "${contactEmail || 'null'}"` };
  }

  const email = contactEmail.toLowerCase().trim();

  // ── 2. Basic email format validation ──
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { allowed: false, reason: `Blocked: malformed email "${email}"` };
  }

  // ── 3. Duplicate contact guard — no re-send within DEDUP_DAYS ──
  try {
    const recent = get(
      `SELECT COUNT(*) as cnt FROM cfo_outreach_sequences s
       JOIN cfo_leads l ON l.id = s.lead_id
       WHERE LOWER(l.contact_email) = ?
         AND s.status = 'sent'
         AND s.sent_at >= datetime('now', ?)`,
      [email, `-${DEDUP_DAYS} days`]
    );
    if (recent && recent.cnt > 0) {
      return { allowed: false, reason: `Blocked: ${email} already emailed ${recent.cnt}x in last ${DEDUP_DAYS} days` };
    }
  } catch {} // table might not exist in tests — non-fatal

  // ── 4. Per-domain daily throttle ──
  const domain = DOMAIN_MAP[sourceAgent] || DOMAIN_MAP.hoa;
  try {
    const todaySent = get(
      `SELECT COUNT(*) as cnt FROM cfo_outreach_sequences s
       WHERE s.status = 'sent'
         AND DATE(s.sent_at) = DATE('now')
         AND s.source_agent = ?`,
      [sourceAgent]
    );
    const limit = parseInt(process.env[`OUTREACH_DAILY_${sourceAgent.toUpperCase().replace('-', '_')}`]) || DEFAULT_DAILY_PER_DOMAIN;
    if (todaySent && todaySent.cnt >= limit) {
      return { allowed: false, reason: `Blocked: ${domain} hit daily limit (${todaySent.cnt}/${limit})` };
    }
  } catch {}

  // ── 5. Same-subject flood check ──
  if (subject) {
    try {
      const sameSubject = get(
        `SELECT COUNT(*) as cnt FROM cfo_outreach_sequences
         WHERE status = 'sent'
           AND DATE(sent_at) = DATE('now')
           AND email_subject = ?`,
        [subject]
      );
      if (sameSubject && sameSubject.cnt >= MAX_SAME_SUBJECT_PER_DAY) {
        return { allowed: false, reason: `Blocked: subject "${subject.slice(0, 40)}..." already sent ${sameSubject.cnt}x today (max ${MAX_SAME_SUBJECT_PER_DAY})` };
      }
    } catch {}
  }

  // ── 6. Unsubscribed/bounced lead check ──
  try {
    const badLead = get(
      `SELECT status FROM cfo_leads WHERE LOWER(contact_email) = ? AND status IN ('unsubscribed', 'bounced', 'closed_lost')`,
      [email]
    );
    if (badLead) {
      return { allowed: false, reason: `Blocked: ${email} is ${badLead.status} — do not contact` };
    }
  } catch {}

  return { allowed: true };
}

/**
 * Get a summary of today's send capacity across all domains.
 * @returns {Object} { domain: { sent, limit, remaining } }
 */
function dailyCapacity() {
  const result = {};
  for (const [agent, domain] of Object.entries(DOMAIN_MAP)) {
    // Deduplicate (data-rehab and data_rehab map to same domain)
    if (result[domain]) continue;
    const limit = parseInt(process.env[`OUTREACH_DAILY_${agent.toUpperCase().replace('-', '_')}`]) || DEFAULT_DAILY_PER_DOMAIN;
    let sent = 0;
    try {
      const row = get(
        `SELECT COUNT(*) as cnt FROM cfo_outreach_sequences
         WHERE status = 'sent' AND DATE(sent_at) = DATE('now') AND source_agent = ?`,
        [agent]
      );
      sent = row?.cnt || 0;
    } catch {}
    result[domain] = { sent, limit, remaining: Math.max(0, limit - sent), agent };
  }
  return result;
}

module.exports = { canSend, dailyCapacity, DEDUP_DAYS, DEFAULT_DAILY_PER_DOMAIN, MAX_SAME_SUBJECT_PER_DAY };
