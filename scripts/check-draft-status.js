require('dotenv').config({ path: '.env.local' });
const path = require('path');
process.chdir(path.join(__dirname, '..'));
const { initDatabase, all } = require('../server/db/connection');

(async () => {
  await initDatabase();

  const withSeq = all(`SELECT COUNT(*) c FROM cfo_leads l WHERE source='livempaint'
    AND EXISTS (SELECT 1 FROM cfo_outreach_sequences s WHERE s.lead_id=l.id)`)[0].c;

  const eligible = all(`SELECT COUNT(*) c FROM cfo_leads l
    WHERE source='livempaint'
      AND contact_email IS NOT NULL AND contact_email != ''
      AND contact_email NOT LIKE '%seebelow%'
      AND status NOT IN ('contacted','replied','unsubscribed','bounced','bad_contact')
      AND NOT EXISTS (SELECT 1 FROM cfo_outreach_sequences s WHERE s.lead_id=l.id)`)[0].c;

  const byStatus = all(`SELECT status, COUNT(*) c FROM cfo_outreach_sequences GROUP BY status ORDER BY c DESC`);
  const recent = all(`SELECT s.id, s.lead_id, s.status, s.email_subject, l.company_name
    FROM cfo_outreach_sequences s JOIN cfo_leads l ON l.id=s.lead_id
    ORDER BY s.id DESC LIMIT 10`);

  console.log('Leads with any sequence:', withSeq);
  console.log('Eligible (no seq yet):', eligible);
  console.log('Sequence status breakdown:', JSON.stringify(byStatus));
  console.log('\nMost recent sequences:');
  recent.forEach(r => console.log(' ', r.id, r.status, r.company_name, '|', r.email_subject?.slice(0,40)));
  process.exit(0);
})();
