/**
 * Explore Azure SQL (empcapmaster2) — find ALL contacts with emails for outreach
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

  // 1. prospector_leads — HOA board contacts (not mgmt companies)
  const pl = await pool.request().query(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN contact_email IS NOT NULL AND LEN(contact_email) > 3 THEN 1 ELSE 0 END) AS with_email,
      SUM(CASE WHEN management_company IS NOT NULL AND LEN(management_company) > 0 THEN 1 ELSE 0 END) AS has_mgmt_co
    FROM prospector_leads
  `);
  const p = pl.recordset[0];
  console.log('\nprospector_leads:', p.total, 'total |', p.with_email, 'with email |', p.has_mgmt_co, 'have mgmt company listed');

  // 2. Distinct management companies mentioned in prospector_leads
  const mgmtInProspect = await pool.request().query(`
    SELECT TOP 30 management_company, COUNT(*) AS community_count
    FROM prospector_leads
    WHERE management_company IS NOT NULL AND LEN(management_company) > 0
    GROUP BY management_company
    ORDER BY community_count DESC
  `);
  console.log('\nManagement companies in prospector_leads (top 30):');
  mgmtInProspect.recordset.forEach(r => console.log(' ', (r.management_company||'?').substring(0,45).padEnd(45), r.community_count, 'communities'));

  // 3. mgmt_company_contacts — full breakdown
  const mcc = await pool.request().query(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN email IS NOT NULL AND LEN(email) > 3 THEN 1 ELSE 0 END) AS with_email,
      SUM(CASE WHEN linkedin_url IS NOT NULL AND LEN(linkedin_url) > 3 THEN 1 ELSE 0 END) AS with_linkedin
    FROM mgmt_company_contacts
  `);
  const m = mcc.recordset[0];
  console.log('\nmgmt_company_contacts: total=' + m.total + ', with_email=' + m.with_email + ', with_linkedin=' + m.with_linkedin);

  // 4. contact_type breakdown for mgmt_company_contacts
  const ctypes = await pool.request().query(`
    SELECT contact_type, COUNT(*) AS n,
      SUM(CASE WHEN email IS NOT NULL AND LEN(email) > 3 THEN 1 ELSE 0 END) AS with_email
    FROM mgmt_company_contacts
    GROUP BY contact_type ORDER BY n DESC
  `);
  console.log('By contact_type:');
  ctypes.recordset.forEach(r => console.log(' ', (r.contact_type||'NULL').padEnd(20), 'total:', r.n, '| with_email:', r.with_email));

  // 5. Sample ALL mgmt contacts (with or without email)
  const allContacts = await pool.request().query(`
    SELECT TOP 20
      mc.name AS company, mcc.full_name, mcc.title, mcc.contact_type,
      mcc.email, mcc.linkedin_url, mc.state
    FROM mgmt_company_contacts mcc
    JOIN mgmt_companies mc ON mcc.mgmt_company_id = mc.id
    ORDER BY mcc.email DESC, mc.name
  `);
  console.log('\nTop 20 mgmt contacts (email first):');
  allContacts.recordset.forEach(r => {
    const emailInfo = r.email ? r.email : (r.linkedin_url ? '[LinkedIn]' : '[none]');
    console.log(' ', (r.company||'?').substring(0,28).padEnd(28), '|', (r.full_name||'?').padEnd(22), '|', (r.contact_type||'?').padEnd(16), '|', emailInfo);
  });

  // 6. hoa_contacts schema + sample
  const hcCols = await pool.request().query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'hoa_contacts' ORDER BY ORDINAL_POSITION
  `);
  console.log('\nhoa_contacts columns:', hcCols.recordset.map(c => c.COLUMN_NAME).join(', '));

  const hcSample = await pool.request().query(`
    SELECT TOP 5 * FROM hoa_contacts ORDER BY created_at DESC
  `);
  if (hcSample.recordset.length > 0) {
    console.log('hoa_contacts sample:');
    hcSample.recordset.forEach(r => console.log(' ', JSON.stringify(r).substring(0, 200)));
  }

  await pool.close();
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
