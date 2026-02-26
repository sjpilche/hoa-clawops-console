/**
 * Send segmented outreach to livempaint_leads in empcapmaster2
 *
 * Segments (in priority order):
 *   1. Board (HOA boards) — direct borrower pitch
 *   2. General Contractor — Jake CFO pitch
 *   3. Property Manager — referral partner pitch
 *
 * Run: node scripts/send-livempaint-outreach.js --segment=board --dry-run
 *      node scripts/send-livempaint-outreach.js --segment=gc --dry-run
 *      node scripts/send-livempaint-outreach.js --segment=pm --dry-run
 *      node scripts/send-livempaint-outreach.js --segment=board  (live send)
 */
require('dotenv').config({ path: '.env.local' });
const sql = require('mssql');
const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);
const FROM = { email: process.env.SENDGRID_FROM_EMAIL, name: process.env.SENDGRID_FROM_NAME };

const destConfig = {
  server: process.env.AZURE_SQL_SERVER,
  database: process.env.AZURE_SQL_DATABASE,
  user: process.env.AZURE_SQL_USER,
  password: process.env.AZURE_SQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: false, connectTimeout: 20000 },
};

const DRY_RUN = process.argv.includes('--dry-run');
const SEGMENT_ARG = process.argv.find(a => a.startsWith('--segment='));
const SEGMENT = SEGMENT_ARG ? SEGMENT_ARG.split('=')[1].toLowerCase() : null;
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1]) : 9999;

// ── EMAIL TEMPLATES ──────────────────────────────────────────────────────────

function buildBoardEmail(r) {
  const firstName = r.first_name || r.full_name?.split(' ')[0] || 'there';
  const subject = `Faster Funding for Your HOA's Capital Repairs`;
  const body_html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;">
<p>Hi ${firstName},</p>

<p>As a volunteer HOA board member, you already know the frustration: your reserve study flags
major repairs (roof, exterior, paving, etc.), but the money isn't there — so you're stuck
choosing between months-long bank delays or a big special assessment that upsets your neighbors
and hurts property values.</p>

<p>We are a tech-enabled financing platform built specifically for HOAs like yours nationwide.
We provide straightforward loans from <strong>$25K to $2M</strong> for capital repairs,
reconstruction, and reserve shortfalls — typically moving much faster than traditional banks.</p>

<p>Our underwriting is tailored to how HOAs actually work (reserves, delinquency rates,
assessment structure, reserve studies, etc.). We are HOA specialists — not a consumer lender —
and we include construction oversight so your project stays on budget and on schedule.</p>

<p>We've made it incredibly simple for boards to explore options with zero pressure:<br/>
👉 Your board can fill out our quick intake form in just a few minutes here:<br/>
<a href="https://www.hoaprojectfunding.com" style="color:#1e40af;">www.hoaprojectfunding.com</a></p>

<p>If it's helpful, I'd be glad to jump on a quick 10–15 minute call and walk you (and any
other board members) through exactly how this could work for your community. No sales pitch —
just honest answers so you can decide if it's a good fit.</p>

<p>Looking forward to helping your HOA move forward,</p>

<p><strong>Steve Pilcher</strong><br/>
HOA Project Funding<br/>
Highlands Ranch, Colorado<br/>
630-989-3887<br/>
<a href="mailto:info@hoaprojectfunding.com">info@hoaprojectfunding.com</a><br/>
<a href="https://www.hoaprojectfunding.com">www.hoaprojectfunding.com</a></p>

<p style="font-size:11px;color:#999;margin-top:30px;">
To unsubscribe, reply with "unsubscribe" in the subject line.
</p>
</div>`;

  const body_text = `Hi ${firstName},\n\nAs a volunteer HOA board member, you already know the frustration: your reserve study flags major repairs (roof, exterior, paving, etc.), but the money isn't there — so you're stuck choosing between months-long bank delays or a big special assessment that upsets your neighbors and hurts property values.\n\nWe are a tech-enabled financing platform built specifically for HOAs like yours nationwide. We provide straightforward loans from $25K to $2M for capital repairs, reconstruction, and reserve shortfalls — typically moving much faster than traditional banks.\n\nOur underwriting is tailored to how HOAs actually work (reserves, delinquency rates, assessment structure, reserve studies, etc.). We are HOA specialists — not a consumer lender — and we include construction oversight so your project stays on budget and on schedule.\n\nWe've made it incredibly simple for boards to explore options with zero pressure:\n👉 Your board can fill out our quick intake form in just a few minutes here:\nwww.hoaprojectfunding.com\n\nIf it's helpful, I'd be glad to jump on a quick 10–15 minute call and walk you through exactly how this could work for your community. No sales pitch — just honest answers so you can decide if it's a good fit.\n\nLooking forward to helping your HOA move forward,\n\nSteve Pilcher\nHOA Project Funding\nHighlands Ranch, Colorado\n630-989-3887\ninfo@hoaprojectfunding.com\nwww.hoaprojectfunding.com`;

  return { subject, body_html, body_text };
}

function buildGCEmail(r) {
  const firstName = r.first_name || r.full_name?.split(' ')[0] || 'there';
  const subject = `Faster HOA Funding = Quicker Starts & Payments for Your Projects`;
  const body_html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;">
<p>Hi ${firstName},</p>

<p>As a general contractor, you know how often solid HOA projects stall or die because boards
can't secure funding quickly. Months of bank delays kill momentum, push back your schedule,
and cost everyone money.</p>

<p>We are a tech-enabled financing platform built specifically for HOAs nationwide. We specialize
in fast funding from <strong>$25K to $2M</strong> for capital repairs, roofs, exteriors, paving,
and reserve projects — usually much faster than traditional banks.</p>

<p>Because we focus only on HOAs, the underwriting is streamlined and designed around how
associations actually operate. Many GCs we work with tell us this tool helps them:</p>
<ul>
  <li>Win more bids</li>
  <li>Start jobs weeks or months sooner</li>
  <li>Get paid faster and more reliably</li>
</ul>

<p>We've made it very easy for boards to check options:<br/>
👉 Quick intake form here:<br/>
<a href="https://www.hoaprojectfunding.com" style="color:#1e40af;">www.hoaprojectfunding.com</a></p>

<p>I'd be happy to spend 10–15 minutes walking you through how this works (numbers, timelines,
and real examples) so you can confidently offer it to your HOA clients when funding becomes
an issue.</p>

<p>Looking forward to helping you close more work,</p>

<p><strong>Jake</strong><br/>
CFO, HOA Project Funding<br/>
630-989-3887<br/>
<a href="mailto:info@hoaprojectfunding.com">info@hoaprojectfunding.com</a><br/>
<a href="https://www.hoaprojectfunding.com">www.hoaprojectfunding.com</a></p>

<p style="font-size:11px;color:#999;margin-top:30px;">
To unsubscribe, reply with "unsubscribe" in the subject line.
</p>
</div>`;

  const body_text = `Hi ${firstName},\n\nAs a general contractor, you know how often solid HOA projects stall or die because boards can't secure funding quickly. Months of bank delays kill momentum, push back your schedule, and cost everyone money.\n\nWe are a tech-enabled financing platform built specifically for HOAs nationwide. We specialize in fast funding from $25K to $2M for capital repairs, roofs, exteriors, paving, and reserve projects — usually much faster than traditional banks.\n\nMany GCs we work with tell us this tool helps them win more bids, start jobs weeks or months sooner, and get paid faster and more reliably.\n\nWe've made it very easy for boards to check options:\n👉 Quick intake form here:\nwww.hoaprojectfunding.com\n\nI'd be happy to spend 10–15 minutes walking you through how this works so you can confidently offer it to your HOA clients when funding becomes an issue.\n\nLooking forward to helping you close more work,\n\nJake\nCFO, HOA Project Funding\n630-989-3887\ninfo@hoaprojectfunding.com\nwww.hoaprojectfunding.com`;

  return { subject, body_html, body_text };
}

function buildPMEmail(r) {
  const firstName = r.first_name || r.full_name?.split(' ')[0] || 'there';
  const subject = `Faster Funding Option for Your HOA Boards`;
  const body_html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;">
<p>Hi ${firstName},</p>

<p>As a property manager, you know how challenging it is when your HOA boards need funding
for capital repairs or reserve shortfalls. Traditional bank loans often take 3–6 months,
leading to frustrated owners and difficult special assessments.</p>

<p>We are a tech-enabled financing platform built specifically for HOAs nationwide. We offer
streamlined loans from <strong>$25K to $2M</strong> for capital repairs, reconstruction,
and reserve projects.</p>

<p>Our process is tailored to how HOAs actually work (reserves, delinquency rates, assessment
structures, reserve studies, etc.) and we include construction oversight to keep projects
on track.</p>

<p>This gives you another helpful tool to offer your boards — one that can speed up projects
and reduce headaches for everyone involved.</p>

<p>We've made the process ridiculously simple:<br/>
👉 Boards can complete our quick intake form here:<br/>
<a href="https://www.hoaprojectfunding.com" style="color:#1e40af;">www.hoaprojectfunding.com</a></p>

<p>Happy to jump on a quick 10–15 minute call to show you exactly how it works so you can
decide if it's worth adding to your toolkit.</p>

<p>Best regards,<br/>
<strong>Steve Pilcher</strong><br/>
HOA Project Funding<br/>
Highlands Ranch, Colorado<br/>
630-989-3887<br/>
<a href="mailto:info@hoaprojectfunding.com">info@hoaprojectfunding.com</a><br/>
<a href="https://www.hoaprojectfunding.com">www.hoaprojectfunding.com</a></p>

<p style="font-size:11px;color:#999;margin-top:30px;">
To unsubscribe, reply with "unsubscribe" in the subject line.
</p>
</div>`;

  const body_text = `Hi ${firstName},\n\nAs a property manager, you know how challenging it is when your HOA boards need funding for capital repairs or reserve shortfalls. Traditional bank loans often take 3–6 months, leading to frustrated owners and difficult special assessments.\n\nWe are a tech-enabled financing platform built specifically for HOAs nationwide. We offer streamlined loans from $25K to $2M for capital repairs, reconstruction, and reserve projects.\n\nOur process is tailored to how HOAs actually work (reserves, delinquency rates, assessment structures, reserve studies, etc.) and we include construction oversight to keep projects on track.\n\nThis gives you another helpful tool to offer your boards — one that can speed up projects and reduce headaches for everyone involved.\n\nWe've made the process ridiculously simple:\n👉 Boards can complete our quick intake form here:\nwww.hoaprojectfunding.com\n\nHappy to jump on a quick 10–15 minute call to show you exactly how it works so you can decide if it's worth adding to your toolkit.\n\nBest regards,\nSteve Pilcher\nHOA Project Funding\nHighlands Ranch, Colorado\n630-989-3887\ninfo@hoaprojectfunding.com\nwww.hoaprojectfunding.com`;

  return { subject, body_html, body_text };
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!SEGMENT) {
    console.log('Usage: node send-livempaint-outreach.js --segment=board|gc|pm [--dry-run] [--limit=N]');
    console.log('\nSegments:');
    console.log('  board  — HOA board members (61) — direct borrower pitch');
    console.log('  gc     — General Contractors (125) — Jake CFO pitch');
    console.log('  pm     — Property Managers (3,442) — referral partner pitch');
    process.exit(0);
  }

  if (DRY_RUN) console.log(`DRY RUN — segment=${SEGMENT}\n`);

  const pool = await sql.connect(destConfig);

  // Build query for segment
  const segmentFilter = {
    board: `client_type = 'Board'`,
    gc:    `client_type = 'General Contractor'`,
    pm:    `client_type = 'Property Manager'`,
    owner: `client_type = 'Owner'`,
    all:   `1=1`,
  }[SEGMENT];

  if (!segmentFilter) {
    console.error('Unknown segment:', SEGMENT);
    process.exit(1);
  }

  const { recordset: leads } = await pool.request().query(`
    SELECT TOP ${LIMIT}
      id, contact_id, first_name, last_name, full_name, title,
      email, company_name, client_type, city, state, outreach_status
    FROM livempaint_leads
    WHERE ${segmentFilter}
      AND outreach_status = 'new'
      AND email NOT LIKE '%unknown%'
      AND email NOT LIKE '%seebelow%'
      AND email NOT LIKE '%not.com'
      AND email NOT LIKE '%donotuse%'
      AND email NOT LIKE '%asdfkjl%'
      AND email NOT LIKE '%safklj%'
      AND LEN(email) > 8
      AND email LIKE '%@%.%'
    ORDER BY pilot_fit_score DESC, id ASC
  `);

  console.log(`Segment: ${SEGMENT} | Leads to contact: ${leads.length}`);

  if (leads.length === 0) {
    console.log('No leads to send to in this segment.');
    await pool.close();
    return;
  }

  // Preview first 5
  console.log('\nFirst 5:');
  leads.slice(0, 5).forEach(r => {
    console.log(' ', (r.full_name||'?').padEnd(22), '|', (r.company_name||'?').substring(0,35).padEnd(35), '|', r.email);
  });
  if (DRY_RUN) {
    console.log('\n(DRY RUN — rerun without --dry-run to send)');
    await pool.close();
    return;
  }

  // Send
  let sent = 0, failed = 0;
  for (const r of leads) {
    try {
      const { subject, body_html, body_text } =
        SEGMENT === 'board' ? buildBoardEmail(r) :
        SEGMENT === 'gc'    ? buildGCEmail(r) :
                              buildPMEmail(r);

      await sgMail.send({
        to: r.email,
        from: FROM,
        subject,
        html: body_html,
        text: body_text,
      });

      // Mark as contacted
      await pool.request()
        .input('id', sql.Int, r.id)
        .query(`UPDATE livempaint_leads SET outreach_status='contacted', updated_at=GETDATE() WHERE id=@id`);

      sent++;
      if (sent % 25 === 0) console.log(`  Sent ${sent}/${leads.length}...`);
    } catch (e) {
      failed++;
      console.error('  FAIL:', r.email, '-', e.message?.substring(0, 80));
    }
  }

  console.log('\n=== RESULT ===');
  console.log('Sent:', sent);
  console.log('Failed:', failed);

  await pool.close();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
