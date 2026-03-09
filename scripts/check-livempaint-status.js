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

  // Overall breakdown
  const { recordset: breakdown } = await pool.request().query(`
    SELECT client_type, outreach_status, COUNT(*) AS cnt
    FROM livempaint_leads
    GROUP BY client_type, outreach_status
    ORDER BY client_type, outreach_status
  `);

  console.log('\n=== livempaint_leads breakdown ===');
  breakdown.forEach(r =>
    console.log(' ', (r.client_type || 'NULL').padEnd(25), '|', (r.outreach_status || 'NULL').padEnd(12), '|', r.cnt)
  );

  // Email quality
  const { recordset: emailStats } = await pool.request().query(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN email LIKE '%@%.%' AND LEN(email) > 8 THEN 1 ELSE 0 END) AS valid_email,
      SUM(CASE WHEN outreach_status = 'contacted' THEN 1 ELSE 0 END) AS contacted,
      SUM(CASE WHEN outreach_status = 'new' THEN 1 ELSE 0 END) AS new_unsent
    FROM livempaint_leads
  `);
  const es = emailStats[0];
  console.log('\n=== Email Stats ===');
  console.log('  Total leads:   ', es.total);
  console.log('  Valid emails:  ', es.valid_email);
  console.log('  Contacted:     ', es.contacted);
  console.log('  New (unsent):  ', es.new_unsent);

  // Sample the "new" leads by segment
  const { recordset: sample } = await pool.request().query(`
    SELECT TOP 10 full_name, email, client_type, company_name, city, state
    FROM livempaint_leads
    WHERE outreach_status = 'new'
      AND email LIKE '%@%.%'
      AND LEN(email) > 8
    ORDER BY pilot_fit_score DESC
  `);
  console.log('\n=== Top 10 unsent leads (by score) ===');
  sample.forEach(r =>
    console.log(' ', (r.full_name || '?').padEnd(22), '|', (r.client_type || '?').padEnd(20), '|', (r.company_name || '?').substring(0, 30).padEnd(30), '|', r.email)
  );

  await pool.close();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
