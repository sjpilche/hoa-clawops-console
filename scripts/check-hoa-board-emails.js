/**
 * Check Azure SQL for HOA board member contacts + borrower leads with emails
 * Answers: "do we have HOA board members we can email right now?"
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

  // ── 1. hoa_contact (board members linked to loan applications) ──
  const hcStats = await pool.request().query(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN email IS NOT NULL AND LEN(email) > 5 THEN 1 ELSE 0 END) AS with_email
    FROM hoa_contact
    WHERE name NOT LIKE '%pilcher%' AND name NOT LIKE '%steve%'
      AND name IS NOT NULL AND name != ''
  `);
  console.log('\nhoa_contact (board members, non-test):', JSON.stringify(hcStats.recordset[0]));

  const hcSample = await pool.request().query(`
    SELECT hc.name, hc.title, hc.role, hc.email, hc.phone,
           ha.association_legal_name, ha.units, ha.status AS app_status
    FROM hoa_contact hc
    JOIN hoa_application ha ON hc.application_id = ha.id
    WHERE hc.email IS NOT NULL AND LEN(hc.email) > 5
      AND hc.name NOT LIKE '%pilcher%' AND hc.name NOT LIKE '%steve%'
    ORDER BY ha.association_legal_name
  `);
  console.log('\nHOA board contacts with email (' + hcSample.recordset.length + '):');
  hcSample.recordset.forEach(r => {
    const assoc = (r.association_legal_name || '?').substring(0, 35).padEnd(35);
    const name  = (r.name || '?').padEnd(22);
    const role  = (r.role || r.title || '?').padEnd(15);
    console.log('  ' + assoc + ' | ' + name + ' | ' + role + ' | ' + r.email);
  });

  // ── 2. leads (web form submissions — actual borrower inquiries) ──
  const leadsStats = await pool.request().query(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN email IS NOT NULL AND LEN(email) > 5 THEN 1 ELSE 0 END) AS with_email,
      SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS new_count,
      SUM(CASE WHEN status = 'contacted' THEN 1 ELSE 0 END) AS contacted_count
    FROM leads
  `);
  console.log('\nleads (web form submissions):', JSON.stringify(leadsStats.recordset[0]));

  const leadsSample = await pool.request().query(`
    SELECT TOP 25 contact_name, email, phone, hoa_name, city, state, units, status, created_at
    FROM leads
    WHERE email IS NOT NULL AND LEN(email) > 5
    ORDER BY created_at DESC
  `);
  console.log('\nRecent leads with email (' + leadsSample.recordset.length + '):');
  leadsSample.recordset.forEach(r => {
    const hoa  = (r.hoa_name || '?').substring(0, 30).padEnd(30);
    const name = (r.contact_name || '?').padEnd(22);
    const st   = (r.state || '?').padEnd(4);
    console.log('  ' + hoa + ' | ' + name + ' | ' + st + ' | ' + (r.status || '?') + ' | ' + r.email);
  });

  // Count how many haven't been contacted yet
  const leadsNotContacted = await pool.request().query(`
    SELECT COUNT(*) AS n FROM leads
    WHERE email IS NOT NULL AND LEN(email) > 5
      AND (status IS NULL OR status NOT IN ('contacted', 'closed', 'dead'))
  `);
  console.log('\nLeads with email NOT yet contacted:', leadsNotContacted.recordset[0].n);

  // ── 3. rs_leads (reserve study leads) ──
  const rsStats = await pool.request().query(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN contact_email IS NOT NULL AND LEN(contact_email) > 5 THEN 1 ELSE 0 END) AS with_email
    FROM rs_leads
  `);
  console.log('\nrs_leads (reserve study leads):', JSON.stringify(rsStats.recordset[0]));

  // ── 4. prospector_leads ──
  const pStats = await pool.request().query(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN contact_email IS NOT NULL AND LEN(contact_email) > 5 THEN 1 ELSE 0 END) AS with_email
    FROM prospector_leads
  `);
  console.log('prospector_leads (HOA board scrapes):', JSON.stringify(pStats.recordset[0]));

  // ── 5. Summary ──
  console.log('\n=== SUMMARY ===');
  console.log('  hoa_contact board members with email:', hcSample.recordset.length);
  console.log('  leads (form submissions) with email:', leadsStats.recordset[0].with_email);
  console.log('  rs_leads with email:', rsStats.recordset[0].with_email);
  console.log('  Total sendable to HOA boards:', (hcSample.recordset.length + leadsStats.recordset[0].with_email));

  await pool.close();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
