/**
 * Check intake_parsed_flat for real HOA board member contacts with emails
 * These are actual loan application submissions from hoaprojectfunding.com
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

  // Total rows and email coverage
  const stats = await pool.request().query(`
    SELECT
      COUNT(*) AS total_submissions,
      SUM(CASE WHEN email IS NOT NULL AND LEN(email) > 5 THEN 1 ELSE 0 END) AS with_email,
      SUM(CASE WHEN email IS NOT NULL AND LEN(email) > 5
            AND email NOT LIKE '%pilcher%' AND email NOT LIKE '%steve%'
            AND email NOT LIKE '%test%' AND email NOT LIKE '%example%'
            AND email NOT LIKE '%gmail%'
            THEN 1 ELSE 0 END) AS real_emails,
      SUM(CASE WHEN opt_in_email_marketing = 1 OR opt_in_email_marketing = 'true' THEN 1 ELSE 0 END) AS opted_in
    FROM intake_parsed_flat
  `);
  console.log('\nintake_parsed_flat stats:', JSON.stringify(stats.recordset[0]));

  // All submissions with real emails
  const real = await pool.request().query(`
    SELECT
      association_legal_name, primary_contact_name, primary_contact_title,
      email, phone, management_company,
      units, estimated_project_cost_usd, requested_loan_amount_usd,
      purpose, status, opt_in_email_marketing, submitted_at_utc
    FROM intake_parsed_flat
    WHERE email IS NOT NULL AND LEN(email) > 5
      AND email NOT LIKE '%pilcher%' AND email NOT LIKE '%steve%'
      AND email NOT LIKE '%test%' AND email NOT LIKE '%example%'
    ORDER BY submitted_at_utc DESC
  `);
  console.log('\nReal intake submissions with email (' + real.recordset.length + '):');
  real.recordset.forEach(r => {
    const assoc = (r.association_legal_name || '?').substring(0, 35).padEnd(35);
    const name  = (r.primary_contact_name || '?').padEnd(22);
    const units = String(r.units || '?').padEnd(6);
    const amt   = r.requested_loan_amount_usd ? '$' + Number(r.requested_loan_amount_usd).toLocaleString() : '?';
    console.log('  ' + assoc + ' | ' + name + ' | ' + units + ' units | ' + amt + ' | ' + r.email);
  });

  // Also check hoa_application directly for contacts
  const appContacts = await pool.request().query(`
    SELECT
      ha.association_legal_name, hc.name AS contact_name, hc.title, hc.role,
      hc.email, hc.phone, ha.units, ha.status AS app_status,
      ha.requested_loan_amount_usd, ha.purpose
    FROM hoa_application ha
    LEFT JOIN hoa_contact hc ON hc.application_id = ha.id
    WHERE hc.email IS NOT NULL AND LEN(hc.email) > 5
      AND hc.email NOT LIKE '%pilcher%' AND hc.email NOT LIKE '%steve%'
      AND hc.email NOT LIKE '%test%' AND hc.email NOT LIKE '%gmail%'
    ORDER BY ha.association_legal_name
  `);
  console.log('\nhoa_application + hoa_contact with real email (' + appContacts.recordset.length + '):');
  appContacts.recordset.forEach(r => {
    const assoc = (r.association_legal_name || '?').substring(0, 35).padEnd(35);
    const name  = (r.contact_name || '?').padEnd(22);
    const amt   = r.requested_loan_amount_usd ? '$' + Number(r.requested_loan_amount_usd).toLocaleString() : '?';
    console.log('  ' + assoc + ' | ' + name + ' | ' + (r.role||r.title||'?').padEnd(15) + ' | ' + amt + ' | ' + r.email);
  });

  // Grand summary
  const totalReal = real.recordset.length + appContacts.recordset.length;
  const uniqueEmails = new Set([
    ...real.recordset.map(r => r.email.toLowerCase()),
    ...appContacts.recordset.map(r => r.email.toLowerCase()),
  ]);
  console.log('\n=== GRAND SUMMARY ===');
  console.log('  intake_parsed_flat real emails:', real.recordset.length);
  console.log('  hoa_application board contacts:', appContacts.recordset.length);
  console.log('  Unique emails across both:', uniqueEmails.size);
  console.log('  These are ACTUAL HOA board members who applied for funding');

  await pool.close();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
