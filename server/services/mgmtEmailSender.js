/**
 * @file mgmtEmailSender.js
 * @description Builds and sends the HOA management company outreach email queue.
 *
 * FLOW:
 *   buildQueue(limit)  — reads management_companies + contacts + review signals,
 *                        renders template, inserts into mgmt_outreach_queue
 *   sendBatch()        — sends all 'approved' rows via SendGrid, updates status
 *   sendOne(id)        — sends a single approved row
 */

const { get, all, run } = require('../db/connection');
const { send, sendBulk } = require('./sendgrid');
const { buildMgmtEmail } = require('./mgmtEmailTemplate');

// ─── Contact type priority (lower index = higher priority) ───────────────────
const CONTACT_TYPE_PRIORITY = [
  'vendor_relations',
  'biz_dev',
  'c_suite',
  'operations',
  'branch_manager',
  'general',
];

function contactPriority(type) {
  const idx = CONTACT_TYPE_PRIORITY.indexOf(type);
  return idx === -1 ? CONTACT_TYPE_PRIORITY.length : idx;
}

// ─── BUILD QUEUE ─────────────────────────────────────────────────────────────

/**
 * Populate mgmt_outreach_queue from management companies that have email contacts.
 * Skips companies already in the queue (any status).
 *
 * @param {number} [limit=200] — Max companies to process
 * @returns {{ added: number, skipped: number, reasons: Object }}
 */
async function buildQueue(limit = 200) {
  let added = 0;
  let skipped = 0;
  const reasons = { no_email: 0, already_queued: 0, template_error: 0 };

  // Get all management companies
  const companies = all(
    `SELECT id, name, state, company_health, priority_tier
     FROM management_companies
     ORDER BY
       CASE company_health
         WHEN 'critical'      THEN 1
         WHEN 'deteriorating' THEN 2
         WHEN 'concerning'    THEN 3
         ELSE 4
       END,
       CASE priority_tier
         WHEN 'AAMC_TOP'    THEN 1
         WHEN 'DESIGNATED'  THEN 2
         WHEN 'MEMBER'      THEN 3
         ELSE 4
       END
     LIMIT ?`,
    [limit]
  );

  console.log(`[MgmtEmailSender] Processing ${companies.length} companies...`);

  for (const company of companies) {
    // Skip if already in queue
    const existing = get(
      `SELECT id FROM mgmt_outreach_queue WHERE mgmt_company_id = ?`,
      [company.id]
    );
    if (existing) {
      skipped++;
      reasons.already_queued++;
      continue;
    }

    // Get all contacts with emails for this company
    const contacts = all(
      `SELECT id, full_name, title, contact_type, email
       FROM mgmt_company_contacts
       WHERE mgmt_company_id = ? AND email IS NOT NULL AND email != ''
       ORDER BY created_at ASC`,
      [company.id]
    );

    if (contacts.length === 0) {
      skipped++;
      reasons.no_email++;
      continue;
    }

    // Pick best contact by priority type
    const bestContact = contacts.sort(
      (a, b) => contactPriority(a.contact_type) - contactPriority(b.contact_type)
    )[0];

    // Get the hottest review signal for this company
    const hotSignal = get(
      `SELECT community_mentioned, primary_issue, signal_score
       FROM review_signals
       WHERE mgmt_company_id = ?
       ORDER BY signal_score DESC, created_at DESC
       LIMIT 1`,
      [company.id]
    );

    // Build personalized email
    try {
      const { subject, body_html, body_text } = buildMgmtEmail({
        companyName:   company.name,
        contactName:   bestContact.full_name,
        contactTitle:  bestContact.title,
        hotCommunity:  hotSignal?.community_mentioned || null,
        signalIssue:   hotSignal?.primary_issue || null,
        companyHealth: company.company_health,
        state:         company.state,
      });

      run(
        `INSERT INTO mgmt_outreach_queue
          (mgmt_company_id, company_name, contact_id, contact_name, contact_email,
           contact_title, contact_type, subject, body_html, body_text,
           hot_community, signal_issue, signal_score, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          company.id,
          company.name,
          bestContact.id,
          bestContact.full_name,
          bestContact.email,
          bestContact.title,
          bestContact.contact_type,
          subject,
          body_html,
          body_text,
          hotSignal?.community_mentioned || null,
          hotSignal?.primary_issue || null,
          hotSignal?.signal_score || 0,
        ]
      );

      added++;
      console.log(`[MgmtEmailSender] Queued: ${company.name} → ${bestContact.email}`);
    } catch (err) {
      console.error(`[MgmtEmailSender] Template error for ${company.name}:`, err.message);
      skipped++;
      reasons.template_error++;
    }
  }

  console.log(`[MgmtEmailSender] Queue built: ${added} added, ${skipped} skipped`);
  return { added, skipped, reasons };
}

// ─── SEND BATCH ──────────────────────────────────────────────────────────────

/**
 * Send all 'approved' rows in mgmt_outreach_queue via SendGrid.
 *
 * @returns {{ sent: number, failed: number, results: Array }}
 */
async function sendBatch() {
  const approved = all(
    `SELECT * FROM mgmt_outreach_queue WHERE status = 'approved' ORDER BY id ASC`,
    []
  );

  if (approved.length === 0) {
    console.log('[MgmtEmailSender] No approved emails to send');
    return { sent: 0, failed: 0, results: [] };
  }

  console.log(`[MgmtEmailSender] Sending ${approved.length} approved emails...`);

  const results = [];
  let sent = 0;
  let failed = 0;

  for (const row of approved) {
    const result = await sendOne(row.id);
    results.push({ id: row.id, company: row.company_name, email: row.contact_email, ...result });
    if (result.success) sent++;
    else failed++;
  }

  console.log(`[MgmtEmailSender] Batch complete: ${sent} sent, ${failed} failed`);
  return { sent, failed, results };
}

// ─── SEND ONE ────────────────────────────────────────────────────────────────

/**
 * Send a single queue item by ID.
 * Item must be in 'approved' or 'pending' status.
 *
 * @param {number} queueId
 * @returns {{ success: boolean, messageId?: string, error?: string }}
 */
async function sendOne(queueId) {
  const row = get(`SELECT * FROM mgmt_outreach_queue WHERE id = ?`, [queueId]);

  if (!row) {
    return { success: false, error: 'Queue item not found' };
  }
  if (row.status === 'sent') {
    return { success: false, error: 'Already sent' };
  }

  const result = await send({
    to:      row.contact_email,
    subject: row.subject,
    html:    row.body_html,
    text:    row.body_text,
  });

  if (result.success) {
    run(
      `UPDATE mgmt_outreach_queue
       SET status='sent', sent_at=datetime('now'), sendgrid_msg_id=?, updated_at=datetime('now')
       WHERE id=?`,
      [result.messageId || null, queueId]
    );
  } else {
    run(
      `UPDATE mgmt_outreach_queue
       SET status='failed', error_msg=?, updated_at=datetime('now')
       WHERE id=?`,
      [result.error || 'Unknown error', queueId]
    );
  }

  return result;
}

// ─── STATS ───────────────────────────────────────────────────────────────────

/**
 * Get outreach queue statistics.
 * @returns {{ total_with_email, pending, approved, sent, failed, skipped }}
 */
function getStats() {
  const countByStatus = all(
    `SELECT status, COUNT(*) as count FROM mgmt_outreach_queue GROUP BY status`,
    []
  );

  const byStatus = {};
  for (const row of countByStatus) byStatus[row.status] = row.count;

  // Count companies that HAVE email contacts (potential queue candidates)
  const withEmail = get(
    `SELECT COUNT(DISTINCT mgmt_company_id) as c
     FROM mgmt_company_contacts
     WHERE email IS NOT NULL AND email != ''`,
    []
  );

  return {
    total_with_email: withEmail?.c || 0,
    pending:  byStatus.pending  || 0,
    approved: byStatus.approved || 0,
    sent:     byStatus.sent     || 0,
    failed:   byStatus.failed   || 0,
    skipped:  byStatus.skipped  || 0,
  };
}

module.exports = { buildQueue, sendBatch, sendOne, getStats };
