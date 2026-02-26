/**
 * Deep look at mgmt_company_contacts — what emails do we actually have?
 */
require('dotenv').config({ path: '.env.local' });
const sql = require('mssql');

const config = {
  server: process.env.AZURE_SQL_SERVER,
  database: process.env.AZURE_SQL_DATABASE,
  user: process.env.AZURE_SQL_USER,
  password: process.env.AZURE_SQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: false, connectTimeout: 20000 },
};

async function main() {
  const pool = await sql.connect(config);
  console.log('Connected to:', process.env.AZURE_SQL_DATABASE);

  // What does email_quality look like?
  const qualityBreakdown = await pool.request().query(`
    SELECT email_quality, COUNT(*) AS n,
      SUM(CASE WHEN email IS NOT NULL AND LEN(email) > 5 THEN 1 ELSE 0 END) AS has_real_email
    FROM mgmt_company_contacts
    GROUP BY email_quality ORDER BY n DESC
  `);
  console.log('\nemail_quality breakdown:');
  qualityBreakdown.recordset.forEach(r => {
    console.log('  quality=' + String(r.email_quality).padEnd(20) + ' count=' + r.n + ' with_real_email=' + r.has_real_email);
  });

  // All 73 contacts — show name, email, quality, linkedin
  const allContacts = await pool.request().query(`
    SELECT mc.name AS company, mcc.full_name, mcc.title, mcc.contact_type,
           mcc.email, mcc.email_quality, mcc.linkedin_url, mc.state
    FROM mgmt_company_contacts mcc
    JOIN mgmt_companies mc ON mcc.mgmt_company_id = mc.id
    ORDER BY CASE WHEN mcc.email IS NOT NULL AND LEN(mcc.email) > 5 THEN 0 ELSE 1 END, mc.name
  `);
  console.log('\nAll 73 mgmt contacts (email first):');
  allContacts.recordset.forEach(r => {
    const emailInfo = r.email || '[no email]';
    const li = r.linkedin_url ? ' [LI]' : '';
    console.log('  ' + (r.company||'?').substring(0,28).padEnd(28) + ' | ' + (r.full_name||'?').padEnd(25) + ' | ' + (r.email_quality||'?').padEnd(12) + ' | ' + emailInfo + li);
  });

  // How many have linkedin that we could use to find email?
  const liCount = await pool.request().query(`
    SELECT COUNT(*) AS with_linkedin,
      SUM(CASE WHEN email IS NULL OR LEN(email) < 5 THEN 1 ELSE 0 END) AS linkedin_no_email
    FROM mgmt_company_contacts
    WHERE linkedin_url IS NOT NULL AND LEN(linkedin_url) > 5
  `);
  console.log('\nWith LinkedIn URL:', liCount.recordset[0].with_linkedin,
    '| LinkedIn but no email:', liCount.recordset[0].linkedin_no_email);

  // Check intake_parsed_flat more carefully
  const intake = await pool.request().query(`SELECT TOP 3 * FROM intake_parsed_flat`);
  if (intake.recordset.length > 0) {
    const cols = Object.keys(intake.recordset[0]);
    console.log('\nintake_parsed_flat columns:', cols.join(', '));
    intake.recordset.forEach(r => console.log('  ' + JSON.stringify(r).substring(0, 300)));
  }

  // Check opportunity_pipeline
  const opp = await pool.request().query(`SELECT TOP 5 * FROM opportunity_pipeline ORDER BY created_at DESC`);
  if (opp.recordset.length > 0) {
    const cols = Object.keys(opp.recordset[0]);
    console.log('\nopportunity_pipeline columns:', cols.join(', '));
    opp.recordset.forEach(r => console.log('  ' + JSON.stringify(r).substring(0, 300)));
  }

  // rs_hoas — reserve study HOAs, might have board contacts
  const rsHoas = await pool.request().query(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN contact_email IS NOT NULL AND LEN(contact_email) > 5 THEN 1 ELSE 0 END) AS with_email
    FROM rs_hoas
  `);
  console.log('\nrs_hoas:', JSON.stringify(rsHoas.recordset[0]));

  // vw_marketing_app_contacts — this view had 79 rows, 3 real
  const vw = await pool.request().query(`
    SELECT TOP 20 * FROM vw_marketing_app_contacts
    WHERE contact_email IS NOT NULL AND LEN(contact_email) > 5
      AND contact_email NOT LIKE '%pilcher%' AND contact_email NOT LIKE '%steve%'
      AND contact_email NOT LIKE '%test%' AND contact_email NOT LIKE '%gmail%'
  `);
  if (vw.recordset.length > 0) {
    console.log('\nvw_marketing_app_contacts real entries (' + vw.recordset.length + '):');
    vw.recordset.forEach(r => console.log('  ' + JSON.stringify(r).substring(0, 250)));
  }

  await pool.close();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
