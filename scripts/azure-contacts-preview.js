/**
 * Preview all contacts with emails across Azure SQL tables
 * Ready to import into ClawOps outreach queue
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

  // 1. mgmt_company_contacts with email
  const mgmt = await pool.request().query(`
    SELECT mc.name AS company_name, mc.state, mc.website_url,
           mcc.full_name, mcc.title, mcc.contact_type, mcc.email
    FROM mgmt_company_contacts mcc
    JOIN mgmt_companies mc ON mcc.mgmt_company_id = mc.id
    WHERE mcc.email IS NOT NULL AND LEN(mcc.email) > 3
    ORDER BY mc.name
  `);
  console.log('\n=== MGMT COMPANY CONTACTS WITH EMAIL (' + mgmt.recordset.length + ') ===');
  mgmt.recordset.forEach(r => {
    console.log('  ' + (r.company_name||'?').substring(0,35).padEnd(35) + ' | ' + (r.full_name||'?').padEnd(25) + ' | ' + r.email);
  });

  // 2. hoa_contacts with email
  const hoa = await pool.request().query(`
    SELECT hoa_name, contact_person, title, email, phone,
           city, state, unit_count, management_company
    FROM hoa_contacts
    WHERE email IS NOT NULL AND LEN(email) > 3
    ORDER BY state, hoa_name
  `);
  console.log('\n=== HOA CONTACTS WITH EMAIL (' + hoa.recordset.length + ') ===');
  hoa.recordset.forEach(r => {
    console.log('  ' + (r.hoa_name||'?').substring(0,35).padEnd(35) + ' | ' + (r.contact_person||'?').padEnd(22) + ' | ' + (r.state||'?') + ' | ' + r.email);
  });

  // 3. hoa_contact (different table) with email
  const hoaCols = await pool.request().query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'hoa_contact' ORDER BY ORDINAL_POSITION
  `);
  const colNames = hoaCols.recordset.map(c => c.COLUMN_NAME);
  console.log('\nhoa_contact columns:', colNames.join(', '));

  if (colNames.includes('email')) {
    const hoa2 = await pool.request().query(`
      SELECT TOP 50 * FROM hoa_contact
      WHERE email IS NOT NULL AND LEN(email) > 3
      ORDER BY id DESC
    `);
    console.log('\n=== hoa_contact WITH EMAIL (' + hoa2.recordset.length + ') ===');
    hoa2.recordset.forEach(r => console.log(' ', JSON.stringify(r).substring(0, 180)));
  }

  // 4. Total sendable right now
  console.log('\n=== SUMMARY ===');
  console.log('  Mgmt company contacts with email:', mgmt.recordset.length);
  console.log('  HOA contacts with email:', hoa.recordset.length);
  console.log('  Total ready to email:', mgmt.recordset.length + hoa.recordset.length);

  await pool.close();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
