/**
 * send-hoa-outreach.js
 *
 * Sends all 'approved' outreach drafts via SendGrid.
 * Auto-approves 'draft' sequences if --auto-approve flag is passed.
 *
 * Usage:
 *   node scripts/send-hoa-outreach.js [limit]              # send up to N approved drafts
 *   node scripts/send-hoa-outreach.js 25 --auto-approve    # approve drafts then send
 *   node scripts/send-hoa-outreach.js --dry-run            # preview without sending
 *
 * Safety:
 *   - 1 second delay between sends (avoids SendGrid rate limits)
 *   - Marks each record sent_at + status='sent' immediately after success
 *   - Marks delivery_error on failure — does NOT retry automatically
 *   - Stops entire batch if >3 consecutive failures (likely config issue)
 */

'use strict';

require('dotenv').config({ path: '.env.local' });
const path = require('path');
process.chdir(path.join(__dirname, '..'));
const { initDatabase, all, run } = require('../server/db/connection');

const sgMail = (() => {
  try { return require('@sendgrid/mail'); } catch {
    console.error('❌ @sendgrid/mail not installed. Run: npm install @sendgrid/mail');
    process.exit(1);
  }
})();

const SENDGRID_KEY  = process.env.SENDGRID_API_KEY;
const FROM_EMAIL    = process.env.SENDGRID_FROM_EMAIL || 'info@hoaprojectfunding.com';
const FROM_NAME     = process.env.SENDGRID_FROM_NAME  || 'Steve Pilcher | HOA Project Funding';

if (!SENDGRID_KEY) {
  console.error('❌ SENDGRID_API_KEY not set in .env.local');
  process.exit(1);
}
sgMail.setApiKey(SENDGRID_KEY);

const args        = process.argv.slice(2);
const DRY_RUN     = args.includes('--dry-run');
const AUTO_APPROVE = args.includes('--auto-approve');
const LIMIT       = parseInt(args.find(a => /^\d+$/.test(a))) || 25;
const DELAY_MS    = 1200; // 1.2s between sends — well under SendGrid limits

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  await initDatabase();

// ── Auto-approve drafts if requested ─────────────────────────────────────────
if (AUTO_APPROVE) {
  const updated = run(`
    UPDATE cfo_outreach_sequences
    SET status = 'approved'
    WHERE status = 'draft'
      AND sequence_position = 1
      AND EXISTS (
        SELECT 1 FROM cfo_leads l
        WHERE l.id = cfo_outreach_sequences.lead_id
          AND l.contact_email IS NOT NULL
          AND l.contact_email != ''
      )
  `);
  console.log(`\n✅ Auto-approved drafts → approved`);
}

// ── Load approved sequences ───────────────────────────────────────────────────
const sequences = all(`
  SELECT s.id, s.lead_id, s.email_subject, s.email_body,
         l.contact_name, l.contact_email, l.company_name, l.city, l.state
  FROM cfo_outreach_sequences s
  JOIN cfo_leads l ON l.id = s.lead_id
  WHERE s.status = 'approved'
    AND s.sequence_position = 1
    AND l.contact_email IS NOT NULL
    AND l.contact_email != ''
  ORDER BY s.created_at ASC
  LIMIT ${LIMIT}
`);

console.log(`\n=== HOA OUTREACH SENDER${DRY_RUN ? ' [DRY RUN]' : ''} ===`);
console.log(`From:     ${FROM_NAME} <${FROM_EMAIL}>`);
console.log(`To send:  ${sequences.length} emails (limit: ${LIMIT})`);
if (DRY_RUN) console.log(`\n⚠️  DRY RUN — no emails will actually be sent\n`);
else console.log('');

let sent = 0;
let failed = 0;
let consecutiveFails = 0;

for (const seq of sequences) {
  const toEmail = seq.contact_email.trim();
  const toName  = seq.contact_name || '';

  console.log(`[${sent + failed + 1}/${sequences.length}] ${seq.company_name} → ${toName} <${toEmail}>`);

  if (DRY_RUN) {
    console.log(`  Subject: ${seq.email_subject}`);
    console.log(`  Body preview: ${seq.email_body.slice(0, 80)}...`);
    sent++;
    continue;
  }

  try {
    await sgMail.send({
      to:      { email: toEmail, name: toName },
      from:    { email: FROM_EMAIL, name: FROM_NAME },
      subject: seq.email_subject,
      text:    seq.email_body,
      // Plain text only — no HTML — keeps deliverability high and looks personal
      trackingSettings: {
        clickTracking:  { enable: true },
        openTracking:   { enable: true },
      },
      customArgs: {
        lead_id:     String(seq.lead_id),
        sequence_id: String(seq.id),
      },
    });

    run(`
      UPDATE cfo_outreach_sequences
      SET status='sent', sent_at=datetime('now'), delivery_status='delivered'
      WHERE id=?
    `, [seq.id]);
    run(`
      UPDATE cfo_leads SET status='contacted' WHERE id=?
    `, [seq.lead_id]);

    console.log(`  ✅ Sent`);
    sent++;
    consecutiveFails = 0;
  } catch (err) {
    const errMsg = err.response?.body?.errors?.[0]?.message || err.message;
    console.log(`  ❌ Failed: ${errMsg}`);

    run(`
      UPDATE cfo_outreach_sequences
      SET delivery_status='failed', delivery_error=?
      WHERE id=?
    `, [errMsg, seq.id]);

    failed++;
    consecutiveFails++;

    if (consecutiveFails >= 3) {
      console.error(`\n🛑 3 consecutive failures — stopping batch. Check SENDGRID_API_KEY and FROM_EMAIL.`);
      break;
    }
  }

  if (!DRY_RUN) await sleep(DELAY_MS);
}

console.log(`\n=== SEND RESULTS ===`);
console.log(`Sent:    ${sent}`);
console.log(`Failed:  ${failed}`);
if (!DRY_RUN && sent > 0) {
  console.log(`\nLeads marked 'contacted' in cfo_leads.`);
  console.log(`Check replies → run: node scripts/check-replies.js`);
}
} // end main

main().catch(console.error).finally(() => process.exit(0));
