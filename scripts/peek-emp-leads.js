// Peek at potential client tables on empcapmaster2
const sql = require('mssql');
const config = {
  server: 'empirecapital.database.windows.net',
  database: 'empcapmaster2',
  user: 'CloudSA1f77fc9b',
  password: 'T0ughGUY123$',
  options: { encrypt: true, trustServerCertificate: false, connectTimeout: 15000 }
};

async function peek(pool, table) {
  try {
    const count = await pool.request().query(`SELECT COUNT(*) AS n FROM ${table}`);
    const cols = await pool.request().query(`SELECT TOP 1 * FROM ${table}`);
    const colNames = cols.recordset.length > 0 ? Object.keys(cols.recordset[0]) : [];
    console.log(`\n--- ${table} ---`);
    console.log(`Rows: ${count.recordset[0].n}`);
    console.log(`Columns: ${colNames.join(', ')}`);
    if (cols.recordset.length > 0) {
      console.log('Sample:', JSON.stringify(cols.recordset[0]).slice(0, 400));
    }
  } catch (e) {
    console.log(`${table}: ${e.message}`);
  }
}

async function go() {
  const pool = await sql.connect(config);

  // Check the most relevant tables for "potential clients"
  const tables = [
    'dbo.prospector_leads',
    'dbo.leads',
    'dbo.raw_leads',
    'dbo.opportunity_pipeline',
    'dbo.mkt_outreach_queue',
    'dbo.hoa_contacts',
    'dbo.hoa_contact',
    'dbo.mgmt_company_contacts',
  ];

  for (const t of tables) {
    await peek(pool, t);
  }

  await pool.close();
}
go().catch(e => console.error('FATAL:', e.message));
