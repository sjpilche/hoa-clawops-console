'use strict';
require('dotenv').config({ path: '.env.local' });
const path = require('path');
process.chdir(path.join(__dirname, '..'));
const { initDatabase, all } = require('../server/db/connection');
const sgMail = require('@sendgrid/mail');

async function main() {
  await initDatabase();

  // Grab one draft to preview
  const seq = all(
    "SELECT s.id, s.email_subject, s.email_body, l.contact_name, l.contact_email, l.company_name " +
    "FROM cfo_outreach_sequences s " +
    "JOIN cfo_leads l ON l.id = s.lead_id " +
    "WHERE s.status = 'draft' AND s.sequence_position = 1 " +
    "LIMIT 1"
  )[0];

  if (!seq) { console.log('No drafts found'); return; }

  console.log('Sending test email using draft for:', seq.company_name);
  console.log('Subject:', seq.email_subject);
  console.log('Body preview:', seq.email_body.slice(0, 300));
  console.log('');

  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  await sgMail.send({
    to:      { email: 'spilcher@nsgmail.com', name: 'Steve Pilcher' },
    from:    { email: process.env.SENDGRID_FROM_EMAIL || 'info@hoaprojectfunding.com', name: 'Steve Pilcher | HOA Project Funding' },
    subject: '[TEST] ' + seq.email_subject,
    text:    seq.email_body,
    trackingSettings: {
      clickTracking:  { enable: false },
      openTracking:   { enable: false },
    },
  });

  console.log('✅ Test email sent to spilcher@nsgmail.com');
}

main().catch(e => console.error('❌', e.message)).finally(() => process.exit(0));
