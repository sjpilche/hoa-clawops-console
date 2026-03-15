/**
 * DataRehab Email Blast — send to all contactable leads in cfo_leads.
 *
 * Usage:
 *   node scripts/send-datarehab-blast.js --dry-run          # preview list, no sends
 *   node scripts/send-datarehab-blast.js --limit=5          # live send to first 5 only (spot check)
 *   node scripts/send-datarehab-blast.js                    # full live send
 *   node scripts/send-datarehab-blast.js --from-name="August West" --from-email="AugustWest154@gmail.com"
 *
 * Filter: all leads with a valid email, excluding unsubscribed/bounced/bad_contact/dead.
 * Tracks every send in cfo_outreach_sequences (source_agent='data-rehab').
 */

require('dotenv').config({ path: '.env.local' });

// ─────────────────────────────────────────────────────────────────────────────
// ██████╗  █████╗ ████████╗ █████╗     ██████╗ ███████╗██╗  ██╗ █████╗ ██████╗
// ██╔══██╗██╔══██╗╚══██╔══╝██╔══██╗    ██╔══██╗██╔════╝██║  ██║██╔══██╗██╔══██╗
// ██║  ██║███████║   ██║   ███████║    ██████╔╝█████╗  ███████║███████║██████╔╝
// ██║  ██║██╔══██║   ██║   ██╔══██║    ██╔══██╗██╔══╝  ██╔══██║██╔══██║██╔══██╗
// ██████╔╝██║  ██║   ██║   ██║  ██║    ██║  ██║███████╗██║  ██║██║  ██║██████╔╝
// ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝    ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝
//
// PASTE YOUR EMAIL TEMPLATE BELOW — edit SUBJECT and BODY_HTML then save.
// ─────────────────────────────────────────────────────────────────────────────

const SUBJECT = "The real blocker usually isn't the tool";

const BODY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DataRehab</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #f2f2f0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    padding: 48px 20px 64px;
  }
  .card {
    width: 100%;
    max-width: 560px;
    background: #ffffff;
    border: 1px solid #e0deda;
    box-shadow: 0 2px 20px rgba(0,0,0,0.06);
    padding: 52px 56px 48px;
    margin: 0 auto;
  }
  .logo-row { margin-bottom: 38px; }
  .logo {
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: #1a1a1a;
  }
  .logo span { color: #c4391a; }
  .rule { width: 28px; height: 2px; background: #c4391a; margin-bottom: 30px; }
  p {
    font-size: 16px;
    line-height: 1.82;
    color: #2e2e2e;
    font-weight: 300;
    margin-bottom: 20px;
  }
  p strong { font-weight: 500; color: #111; }
  .cta-block { margin: 34px 0 0; }
  .cta-button {
    display: block;
    width: 100%;
    background: #1a1a1a;
    color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif;
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0.02em;
    text-decoration: none;
    text-align: center;
    padding: 16px 24px;
    border-radius: 5px;
  }
  .proof-strip { margin-top: 10px; text-align: center; font-size: 11px; color: #bbb; }
  .sig { margin-top: 38px; padding-top: 26px; border-top: 1px solid #ece9e4; }
  .sig-name { font-size: 15px; font-weight: 500; color: #111; margin-bottom: 2px; }
  .sig-title { font-size: 13px; color: #999; font-weight: 300; margin-bottom: 3px; }
  .sig-url { font-size: 12px; color: #c4391a; text-decoration: none; }
  .footer {
    width: 100%;
    max-width: 560px;
    margin: 16px auto 0;
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 6px;
  }
  .footer span, .footer a { font-size: 11px; color: #ccc; text-decoration: none; }
</style>
</head>
<body>

<div class="card">
  <div class="logo-row">
    <div class="logo">Data<span>Rehab</span></div>
  </div>
  <div class="rule"></div>

  <p>AI is getting all the attention right now. But in a lot of finance teams, the real blocker isn't the tool &mdash; <strong>it's the data underneath.</strong></p>

  <p>I've seen it firsthand: teams want better reporting, automation, and AI, but the source data is messy enough that nothing downstream works the way it should.</p>

  <p>That's why I put together Data Rehab &mdash; a simple first step to see whether your ERP data is actually ready before you spend more time and money chasing the next tool.</p>

  <p>If you're not sure where to start or what any of this means for your team &mdash; that's exactly what we're here for. We'll walk you through it.</p>

  <div class="cta-block">
    <a class="cta-button" href="https://getdatarehab.com/free-score">Get Your Free Data Health Score &rarr;</a>
    <div class="proof-strip">
      No credit card required &middot; Specific findings &middot; No invoice until clean and certified
    </div>
  </div>

  <div class="sig">
    <div class="sig-name">August West</div>
    <div class="sig-title">Co-founder, Data Rehab</div>
    <a class="sig-url" href="https://getdatarehab.com">getdatarehab.com</a>
  </div>
</div>

<div class="footer">
  <span>&copy; 2026 Privium Data Services</span>
  <span><a href="#">Unsubscribe</a> &nbsp;&middot;&nbsp; <a href="#">View in browser</a></span>
</div>

</body>
</html>`;

// ─────────────────────────────────────────────────────────────────────────────
// END TEMPLATE — everything below is execution logic, no need to edit
// ─────────────────────────────────────────────────────────────────────────────

const path = require('path');

// CLI flags
const DRY_RUN        = process.argv.includes('--dry-run');
const LIMIT_ARG      = process.argv.find(a => a.startsWith('--limit='));
const LIMIT          = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1]) : 9999;
const FROM_NAME_ARG  = process.argv.find(a => a.startsWith('--from-name='));
const FROM_EMAIL_ARG = process.argv.find(a => a.startsWith('--from-email='));
const CAMPAIGN_ARG   = process.argv.find(a => a.startsWith('--campaign='));
const FROM_NAME  = FROM_NAME_ARG  ? FROM_NAME_ARG.split('=').slice(1).join('=').replace(/^["']|["']$/g, '')  : 'August West';
const FROM_EMAIL = FROM_EMAIL_ARG ? FROM_EMAIL_ARG.split('=').slice(1).join('=').replace(/^["']|["']$/g, '') : 'hello@getdatarehab.com';
const CAMPAIGN   = CAMPAIGN_ARG   ? CAMPAIGN_ARG.split('=').slice(1).join('=').replace(/^["']|["']$/g, '')   : `data-rehab-blast-${new Date().toISOString().slice(0,10)}`;

async function main() {
  // Guard: template must be filled in
  if (SUBJECT === 'PASTE SUBJECT HERE' || BODY_HTML.trim() === 'PASTE HTML BODY HERE') {
    console.error('\n❌  Template not filled in!');
    console.error('   Open scripts/send-datarehab-blast.js and paste your subject + HTML body into the TEMPLATE section at the top.\n');
    process.exit(1);
  }

  if (!process.env.SENDGRID_API_KEY) {
    console.error('\n❌  SENDGRID_API_KEY not set in .env.local\n');
    process.exit(1);
  }

  if (!FROM_EMAIL) {
    console.error('\n❌  No from email — set SENDGRID_FROM_EMAIL in .env.local or pass --from-email=...\n');
    process.exit(1);
  }

  // Init SQLite DB
  const { initDatabase, all, run } = require('../server/db/connection');
  await initDatabase();

  // Query contactable leads — new + contacted, skip already sent this campaign, junk stripped
  const leads = all(`
    SELECT id, company_name, contact_name, contact_email, erp_type, city, state, status, pilot_fit_score
    FROM cfo_leads
    WHERE contact_email IS NOT NULL
      AND contact_email != ''
      AND contact_email LIKE '%@%.%'
      AND status IN ('new', 'contacted')
      AND contact_email NOT LIKE '%seebelow%'
      AND contact_email NOT LIKE '%donotuse%'
      AND contact_email NOT LIKE '%unknown%'
      AND contact_email NOT LIKE '%not.com'
      AND contact_email NOT LIKE '%asdfkjl%'
      AND contact_email NOT LIKE '%safklj%'
      AND LENGTH(contact_email) > 8
      AND contact_name NOT LIKE '%do not use%'
      AND contact_name NOT LIKE '%donotuse%'
      AND id NOT IN (
        SELECT lead_id FROM cfo_outreach_sequences
        WHERE source_agent = 'data-rehab'
          AND sequence_type = ?
      )
    ORDER BY pilot_fit_score DESC
    LIMIT ?
  `, [CAMPAIGN, LIMIT]);

  // Stats by status
  const statusCounts = leads.reduce((acc, l) => {
    acc[l.status] = (acc[l.status] || 0) + 1;
    return acc;
  }, {});

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  DataRehab Blast — ${DRY_RUN ? 'DRY RUN' : 'LIVE SEND'}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Total recipients : ${leads.length}`);
  console.log(`  From             : ${FROM_NAME} <${FROM_EMAIL}>`);
  console.log(`  Subject          : ${SUBJECT}`);
  console.log(`  Status breakdown : ${Object.entries(statusCounts).map(([k,v]) => `${k}:${v}`).join(' | ')}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  if (leads.length === 0) {
    console.log('No contactable leads found.');
    return;
  }

  // Preview first 10
  console.log('First 10 leads:');
  leads.slice(0, 10).forEach((l, i) => {
    const name    = (l.contact_name  || '—').padEnd(22);
    const company = (l.company_name  || '—').substring(0, 30).padEnd(30);
    const email   = l.contact_email;
    const loc     = [l.city, l.state].filter(Boolean).join(', ') || '—';
    console.log(`  ${String(i + 1).padStart(2)}. ${name} | ${company} | ${email.padEnd(35)} | ${loc}`);
  });
  if (leads.length > 10) console.log(`  ... and ${leads.length - 10} more`);

  if (DRY_RUN) {
    console.log('\n✅  DRY RUN complete — rerun without --dry-run to send\n');
    return;
  }

  // Confirm before full send (skip if --limit is set to a small test batch)
  if (LIMIT >= 100) {
    console.log(`\n⚠️   About to send ${leads.length} emails. Press Ctrl+C within 5 seconds to abort...`);
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  // Load SendGrid (after dotenv is already set)
  const sgMail = require('@sendgrid/mail');
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  const plainText = BODY_HTML
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();

  let sent = 0, failed = 0;
  const failedLeads = [];

  for (const lead of leads) {
    try {
      await sgMail.send({
        to: lead.contact_email,
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject: SUBJECT,
        html: BODY_HTML,
        text: plainText,
      });

      // Track the send
      run(
        `INSERT INTO cfo_outreach_sequences
          (lead_id, sequence_type, email_subject, email_body, source_agent, status, sent_at, sequence_position)
         VALUES (?, ?, ?, ?, 'data-rehab', 'sent', datetime('now'), 1)`,
        [lead.id, CAMPAIGN, SUBJECT, BODY_HTML]
      );

      sent++;
      if (sent % 25 === 0) console.log(`  Sent ${sent}/${leads.length}...`);

      // Throttle slightly to stay under SendGrid rate limits
      await new Promise(resolve => setTimeout(resolve, 200));

    } catch (e) {
      failed++;
      const errMsg = e?.response?.body?.errors?.[0]?.message || e.message || 'Unknown error';
      failedLeads.push({ email: lead.contact_email, company: lead.company_name, error: errMsg });
    }
  }

  // Summary
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  RESULT`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  ✅  Sent    : ${sent}`);
  console.log(`  ❌  Failed  : ${failed}`);
  if (failedLeads.length) {
    console.log('\nFailed sends:');
    failedLeads.forEach(f => console.log(`  ${f.email} (${f.company}): ${f.error}`));
  }
  console.log(`\nCampaign tag: "${CAMPAIGN}" — query: SELECT * FROM cfo_outreach_sequences WHERE sequence_type='${CAMPAIGN}'\n`);
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
