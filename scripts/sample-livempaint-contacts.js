/**
 * Sample contacts in livempaint2004 — understand who they are
 * contact → office → client chain
 */
require('dotenv').config({ path: '.env.local' });
const sql = require('mssql');

const config = {
  server: 'liveempirepaint.database.windows.net',
  database: 'LIVEempirepaint2004',
  user: 'lcabarcas',
  password: '!NSGColorado00',
  options: { encrypt: true, trustServerCertificate: false, connectTimeout: 20000 },
};

const S = 'LIVEempirepaint2004';

async function main() {
  const pool = await sql.connect(config);
  console.log('Connected!');

  // contact → office → client: 30 random contacts with email
  const sample = await pool.request().query(`
    SELECT TOP 30
      c.first_name, c.last_name, c.title, c.email, c.department,
      o.label AS office_label, o.city, o.state,
      cl.company_name, cl.type AS client_type, cl.is_management_fee
    FROM [${S}].[contact] c
    LEFT JOIN [${S}].[office] o ON c.office_id = o.id
    LEFT JOIN [${S}].[client] cl ON o.client_id = cl.id
    WHERE c.email IS NOT NULL AND LEN(c.email) > 5
      AND c.email NOT LIKE '%test%' AND c.email NOT LIKE '%example%'
    ORDER BY NEWID()
  `);
  console.log('\nRandom 30 contacts with email (contact→office→client):');
  sample.recordset.forEach(r => {
    const name = ((r.first_name||'') + ' ' + (r.last_name||'')).trim().padEnd(22);
    const co   = (r.company_name||r.office_label||'?').substring(0,38).padEnd(38);
    const loc  = ((r.city||'') + ', ' + (r.state||'')).padEnd(15);
    const mgmt = r.is_management_fee ? '[MGMT]' : '';
    console.log('  ' + name + ' | ' + co + ' | ' + loc + ' | ' + r.email + ' ' + mgmt);
  });

  // client type breakdown
  const clientTypes = await pool.request().query(`
    SELECT type, COUNT(*) AS n,
      COUNT(DISTINCT c.id) AS contacts,
      SUM(CASE WHEN c.email IS NOT NULL AND LEN(c.email) > 5 THEN 1 ELSE 0 END) AS contacts_with_email
    FROM [${S}].[client] cl
    LEFT JOIN [${S}].[office] o ON o.client_id = cl.id
    LEFT JOIN [${S}].[contact] c ON c.office_id = o.id
    GROUP BY type ORDER BY n DESC
  `);
  console.log('\nClient types with contact/email counts:');
  clientTypes.recordset.forEach(r => {
    console.log('  type=' + String(r.type||'NULL').padEnd(20) + ' clients=' + String(r.n).padEnd(6) + ' contacts=' + String(r.contacts).padEnd(6) + ' with_email=' + r.contacts_with_email);
  });

  // HOA/property-flavored clients — search company_name for keywords
  const hoaClients = await pool.request().query(`
    SELECT TOP 30 cl.company_name, cl.type, cl.is_management_fee,
      COUNT(c.id) AS contacts,
      SUM(CASE WHEN c.email IS NOT NULL AND LEN(c.email) > 5 THEN 1 ELSE 0 END) AS with_email
    FROM [${S}].[client] cl
    LEFT JOIN [${S}].[office] o ON o.client_id = cl.id
    LEFT JOIN [${S}].[contact] c ON c.office_id = o.id
    WHERE cl.company_name LIKE '%HOA%'
       OR cl.company_name LIKE '%homeowner%'
       OR cl.company_name LIKE '%association%'
       OR cl.company_name LIKE '%community%'
       OR cl.company_name LIKE '%management%'
       OR cl.company_name LIKE '%property%'
       OR cl.company_name LIKE '%condominium%'
       OR cl.company_name LIKE '%condo%'
    GROUP BY cl.company_name, cl.type, cl.is_management_fee
    ORDER BY with_email DESC, contacts DESC
  `);
  console.log('\nHOA/property/management clients with email contacts (' + hoaClients.recordset.length + '):');
  hoaClients.recordset.forEach(r => {
    console.log('  ' + (r.company_name||'?').substring(0,45).padEnd(45) + ' type=' + (r.type||'?').padEnd(12) + ' contacts=' + r.contacts + ' email=' + r.with_email);
  });

  // Total sendable unique emails in contact table
  const totals = await pool.request().query(`
    SELECT
      COUNT(DISTINCT c.email) AS unique_emails,
      COUNT(*) AS total_contacts,
      SUM(CASE WHEN cl.is_management_fee = 1 THEN 1 ELSE 0 END) AS mgmt_fee_clients
    FROM [${S}].[contact] c
    LEFT JOIN [${S}].[office] o ON c.office_id = o.id
    LEFT JOIN [${S}].[client] cl ON o.client_id = cl.id
    WHERE c.email IS NOT NULL AND LEN(c.email) > 5
      AND c.email NOT LIKE '%test%'
  `);
  console.log('\nTotals:', JSON.stringify(totals.recordset[0]));

  await pool.close();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
