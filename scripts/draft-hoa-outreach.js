/**
 * draft-hoa-outreach.js
 *
 * Generates outreach email drafts for livempaint HOA leads using the
 * three HOA Project Funding templates.
 *
 * Template routing:
 *   - Company name contains "management" / "property" / "manager"  → Template 3 (Property Manager)
 *   - Company name contains construction / contractor / builder / GC → Template 2 (General Contractor)
 *   - Everything else (default)                                     → Template 1 (HOA Board Member)
 *
 * Usage:
 *   node scripts/draft-hoa-outreach.js [limit]   # default 25
 *   node scripts/draft-hoa-outreach.js 100
 *   node scripts/draft-hoa-outreach.js all        # all eligible leads
 */

'use strict';

require('dotenv').config({ path: '.env.local' });
const path = require('path');
process.chdir(path.join(__dirname, '..'));
const { initDatabase, all, run } = require('../server/db/connection');

const LIMIT = process.argv[2] === 'all' ? 999999 : parseInt(process.argv[2]) || 25;

// ── Sender details ────────────────────────────────────────────────────────────
const STEVE = {
  name:     'Steve Pilcher',
  phone:    '630-989-3887',
  email:    'info@hoaprojectfunding.com',
  title:    'HOA Project Funding',
  location: 'Highlands Ranch, Colorado',
  url:      'www.hoaprojectfunding.com',
};

const JAKE = {
  name:  'Jake',
  phone: '630-989-3887',
  email: 'info@hoaprojectfunding.com',
  title: 'CFO, HOA Project Funding',
  url:   'www.hoaprojectfunding.com',
};

// ── Templates ─────────────────────────────────────────────────────────────────

function templateBoard(firstName, s) {
  return {
    subject: `Faster Funding for Your HOA's Capital Repairs`,
    body: `Hi ${firstName},

As a volunteer HOA board member, you already know the frustration: your reserve study flags major repairs (roof, exterior, paving, etc.), but the money isn't there — so you're stuck choosing between months-long bank delays or a big special assessment that upsets your neighbors and hurts property values.

We are a tech-enabled financing platform built specifically for HOAs like yours nationwide. We provide straightforward loans from $25K to $2M for capital repairs, reconstruction, and reserve shortfalls — typically moving much faster than traditional banks.

Our underwriting is tailored to how HOAs actually work (reserves, delinquency rates, assessment structure, reserve studies, etc.). We are HOA specialists — not a consumer lender — and we include construction oversight so your project stays on budget and on schedule.

We've made it incredibly simple for boards to explore options with zero pressure:
👉 Your board can fill out our quick intake form in just a few minutes here:
${s.url}

If it's helpful, I'd be glad to jump on a quick 10–15 minute call and walk you (and any other board members) through exactly how this could work for your community. No sales pitch — just honest answers so you can decide if it's a good fit.

Looking forward to helping your HOA move forward,

${s.name}
${s.title}
${s.location}
${s.phone}
${s.email}
${s.url}`,
  };
}

function templateGC(firstName, s) {
  return {
    subject: `Faster HOA Funding = Quicker Starts & Payments for Your Projects`,
    body: `Hi ${firstName},

As a general contractor, you know how often solid HOA projects stall or die because boards can't secure funding quickly. Months of bank delays kill momentum, push back your schedule, and cost everyone money.

We are a tech-enabled financing platform built specifically for HOAs nationwide. We specialize in fast funding from $25K to $2M for capital repairs, roofs, exteriors, paving, and reserve projects — usually much faster than traditional banks.

Because we focus only on HOAs, the underwriting is streamlined and designed around how associations actually operate. Many GCs we work with tell us this tool helps them:
• Win more bids
• Start jobs weeks or months sooner
• Get paid faster and more reliably

We've made it very easy for boards to check options:
👉 Quick intake form here:
${s.url}

I'd be happy to spend 10–15 minutes walking you through how this works (numbers, timelines, and real examples) so you can confidently offer it to your HOA clients when funding becomes an issue.

Looking forward to helping you close more work,

${s.name}
${s.title}
${s.phone}
${s.email}
${s.url}`,
  };
}

function templatePM(firstName, s) {
  return {
    subject: `Faster Funding Option for Your HOA Boards`,
    body: `Hi ${firstName},

As a property manager, you know how challenging it is when your HOA boards need funding for capital repairs or reserve shortfalls. Traditional bank loans often take 3–6 months, leading to frustrated owners and difficult special assessments.

We are a tech-enabled financing platform built specifically for HOAs nationwide. We offer streamlined loans from $25K to $2M for capital repairs, reconstruction, and reserve projects.

Our process is tailored to how HOAs actually work (reserves, delinquency rates, assessment structures, reserve studies, etc.) and we include construction oversight to keep projects on track.

This gives you another helpful tool to offer your boards — one that can speed up projects and reduce headaches for everyone involved.

We've made the process ridiculously simple:
👉 Boards can complete our quick intake form here:
${s.url}

Happy to jump on a quick 10–15 minute call to show you exactly how it works so you can decide if it's worth adding to your toolkit.

Best regards,

${s.name}
${s.title}
${s.location}
${s.phone}
${s.email}
${s.url}`,
  };
}

// ── Routing ───────────────────────────────────────────────────────────────────

function pickTemplate(lead) {
  const co    = (lead.company_name   || '').toLowerCase();
  const title = (lead.contact_title  || '').toLowerCase();
  const str   = co + ' ' + title;

  if (/construction|contractor|builder|remodel|renovation|roofing|paint\b|plumbing|electric|hvac|landscap/.test(str))
    return { template: templateGC,    sender: JAKE,  type: 'gc' };
  if (/management|property manager|prop mgmt|asset manager/.test(str))
    return { template: templatePM,    sender: STEVE, type: 'pm' };
  return   { template: templateBoard, sender: STEVE, type: 'board' };
}

function cleanFirstName(raw) {
  if (!raw) return 'there';
  const first = raw.replace(/\s+/g, ' ').trim().split(/\s+/)[0];
  if (!first || first.length < 2 || /\d|@/.test(first)) return 'there';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await initDatabase();

  const leads = all(`
    SELECT l.*
    FROM cfo_leads l
    WHERE l.source = 'livempaint'
      AND l.contact_email IS NOT NULL
      AND l.contact_email != ''
      AND l.contact_email NOT LIKE '%seebelow@not.com%'
      AND l.contact_email NOT LIKE '%noemail%'
      AND LOWER(l.contact_name) NOT LIKE '%do not%'
      AND LOWER(l.contact_name) NOT LIKE '%not use%'
      AND LOWER(l.contact_name) NOT LIKE '%invalid%'
      AND LOWER(l.contact_name) NOT LIKE '%accounts payable%'
      AND LOWER(l.contact_name) NOT LIKE '%ap dept%'
      AND LOWER(l.contact_name) NOT LIKE '%invoicing%'
      AND l.status NOT IN ('contacted', 'replied', 'unsubscribed', 'bounced', 'bad_contact')
      AND NOT EXISTS (
        SELECT 1 FROM cfo_outreach_sequences s
        WHERE s.lead_id = l.id AND s.sequence_position = 1
      )
    ORDER BY l.pilot_fit_score DESC, l.id ASC
    LIMIT ${LIMIT}
  `);

  console.log(`\n=== HOA OUTREACH DRAFT GENERATOR ===`);
  console.log(`Eligible leads found: ${leads.length} (limit: ${LIMIT})\n`);

  let drafted = 0;
  let skipped = 0;
  const byType = { board: 0, pm: 0, gc: 0 };

  for (const lead of leads) {
    const addr = (lead.contact_email || '').trim();
    if (!addr.includes('@') || addr.includes('..') || addr.length < 6) { skipped++; continue; }

    const firstName = cleanFirstName(lead.contact_name);
    const { template, sender, type } = pickTemplate(lead);
    const email = template(firstName, sender);

    try {
      run(`
        INSERT INTO cfo_outreach_sequences
          (lead_id, sequence_type, email_subject, email_body, source_agent, status, sequence_position)
        VALUES (?, 'blitz', ?, ?, 'jake', 'draft', 1)
      `, [lead.id, email.subject, email.body]);

      drafted++;
      byType[type]++;

      if (drafted <= 5) {
        console.log(`✅ [${type.toUpperCase()}] ${lead.company_name}`);
        console.log(`   To:      ${lead.contact_name} <${addr}>`);
        console.log(`   Subject: ${email.subject}`);
        console.log(`   Opens:   Hi ${firstName},\n`);
      }
    } catch (err) {
      console.error(`❌ ${lead.company_name}: ${err.message}`);
      skipped++;
    }
  }

  console.log(`\n=== RESULTS ===`);
  console.log(`Drafted:  ${drafted}`);
  console.log(`  Board Member template:    ${byType.board}`);
  console.log(`  Property Manager template: ${byType.pm}`);
  console.log(`  General Contractor template: ${byType.gc}`);
  console.log(`Skipped:  ${skipped} (bad email addresses)`);
  console.log(`\nNext steps:`);
  console.log(`  Review drafts: http://localhost:5174 → Jake Marketing → Outreach tab`);
  console.log(`  Approve all:   node scripts/send-hoa-outreach.js ${drafted} --auto-approve --dry-run`);
  console.log(`  Send batch:    node scripts/send-hoa-outreach.js ${drafted} --auto-approve`);
}

main().catch(console.error).finally(() => process.exit(0));
