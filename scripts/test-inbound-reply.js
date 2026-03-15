/**
 * Simulates a SendGrid Inbound Parse webhook POST — tests the full reply ingestion pipeline.
 *
 * Usage:
 *   node scripts/test-inbound-reply.js                    # Uses first lead with email
 *   node scripts/test-inbound-reply.js interested          # INTERESTED reply
 *   node scripts/test-inbound-reply.js not_now             # NOT_NOW reply
 *   node scripts/test-inbound-reply.js unsubscribe         # UNSUBSCRIBE reply
 *   node scripts/test-inbound-reply.js neutral             # NEUTRAL reply
 *   node scripts/test-inbound-reply.js custom "your text"  # Custom reply text
 */

const http = require('http');
const path = require('path');

// Reply templates
const REPLY_TEMPLATES = {
  interested: 'Yes, I would love to learn more about what you offer. Let\'s schedule a call next week. Sounds good!',
  not_now: 'Thanks for reaching out. We\'re not looking at this right now — maybe reach out in a few months when our fiscal year resets.',
  wrong_person: 'I think you have the wrong person. You should contact our Controller, Lisa Martinez, for anything finance-related.',
  unsubscribe: 'Please remove me from your mailing list. Stop emailing me. I want to opt out.',
  bounced: 'Delivery failed: no such user at this domain. The email address does not exist.',
  neutral: 'Thanks for the email. I\'ll take a look when I get a chance.',
};

async function main() {
  const mode = process.argv[2] || 'interested';
  const customText = process.argv[3] || null;
  const replyText = customText || REPLY_TEMPLATES[mode] || REPLY_TEMPLATES.interested;

  // Find a lead with a contact email
  require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
  const { initDatabase, get, all } = require('../server/db/connection');
  await initDatabase();

  const lead = get("SELECT id, company_name, contact_name, contact_email, status FROM cfo_leads WHERE contact_email IS NOT NULL AND contact_email != '' AND status IN ('contacted', 'new') ORDER BY RANDOM() LIMIT 1");

  if (!lead) {
    console.error('No leads with contact_email found in DB');
    process.exit(1);
  }

  console.log(`\n=== Simulating Inbound Reply ===`);
  console.log(`Lead:    #${lead.id} — ${lead.company_name} (${lead.contact_name})`);
  console.log(`Email:   ${lead.contact_email}`);
  console.log(`Status:  ${lead.status}`);
  console.log(`Mode:    ${mode}`);
  console.log(`Reply:   "${replyText.slice(0, 100)}..."\n`);

  // Build multipart form data (mimicking SendGrid Inbound Parse)
  const boundary = '----FormBoundary' + Date.now();
  const formFields = {
    from: `${lead.contact_name || 'Test User'} <${lead.contact_email}>`,
    to: 'info@hoaprojectfunding.com',
    subject: 'Re: Quick question about your AP process',
    text: replyText + '\n\nOn Mon, Mar 14 2026 at 10:00 AM, HOA Project Funding <info@hoaprojectfunding.com> wrote:\n> Hi, I noticed your company...',
    html: '',
    envelope: JSON.stringify({ from: lead.contact_email, to: ['info@hoaprojectfunding.com'] }),
  };

  let body = '';
  for (const [key, value] of Object.entries(formFields)) {
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
    body += `${value}\r\n`;
  }
  body += `--${boundary}--\r\n`;

  // POST to the inbound webhook
  const result = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3001,
      path: '/api/webhooks/sendgrid/inbound',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString();
        resolve({ status: res.statusCode, body: responseBody });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  console.log(`Response: ${result.status}`);
  try {
    const json = JSON.parse(result.body);
    console.log(JSON.stringify(json, null, 2));

    if (json.status === 'classified') {
      console.log(`\n✅ Reply classified as: ${json.classification}`);
      console.log(`   Lead #${json.lead_id} (${json.company}) → status: ${json.new_lead_status || 'unchanged'}`);
      console.log(`   Next action: ${json.next_action}`);

      if (json.classification === 'INTERESTED') {
        console.log(`   🎯 Meeting booker auto-queued!`);
      }
    } else if (json.status === 'unmatched') {
      console.log(`\n⚠️  No matching lead for ${json.email}`);
    } else {
      console.log(`\n❌ Unexpected status: ${json.status}`);
    }
  } catch {
    console.log('Raw response:', result.body);
  }

  // Check DB state after
  const updatedLead = get("SELECT id, status, updated_at FROM cfo_leads WHERE id = ?", [lead.id]);
  console.log(`\nDB check — Lead #${lead.id} status: ${updatedLead?.status} (was: ${lead.status})`);

  const pendingMeetingRun = get("SELECT id, status FROM runs WHERE agent_id = (SELECT id FROM agents WHERE name='jake-meeting-booker') AND status='pending' ORDER BY created_at DESC LIMIT 1");
  if (pendingMeetingRun) {
    console.log(`Meeting booker run queued: ${pendingMeetingRun.id} (${pendingMeetingRun.status})`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
