require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });
const sql = require('mssql');
const config = {
  server: process.env.AZURE_SQL_SERVER,
  database: process.env.AZURE_SQL_DATABASE,
  user: process.env.AZURE_SQL_USER,
  password: process.env.AZURE_SQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: false },
};

(async () => {
  const pool = await sql.connect(config);

  // Check prospector_runs columns
  const cols = await pool.request().query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'prospector_runs' ORDER BY ORDINAL_POSITION
  `);
  console.log('prospector_runs columns:', cols.recordset.map(r => r.COLUMN_NAME).join(', '));

  // Count runs
  const runs = await pool.request().query('SELECT COUNT(*) as count FROM dbo.prospector_runs');
  console.log('Total runs:', runs.recordset[0].count);

  // Recent runs
  const recent = await pool.request().query('SELECT TOP 5 id, handler_name, status, geo_target FROM dbo.prospector_runs ORDER BY started_at DESC');
  for (const r of recent.recordset) {
    console.log(`  ${r.handler_name} — ${r.status} — ${r.geo_target}`);
  }

  // Check mgmt_companies table exists
  try {
    const schema = await pool.request().query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'mgmt_companies' ORDER BY ORDINAL_POSITION
    `);
    console.log('\nmgmt_companies columns:', schema.recordset.map(r => r.COLUMN_NAME).join(', '));
  } catch(e) {
    console.log('\nmgmt_companies table issue:', e.message);
  }

  // Try to manually upsert a test company to see if the table works
  try {
    await pool.request()
      .input('id', sql.NVarChar, 'test-123')
      .input('name', sql.NVarChar, 'Test Company')
      .query(`
        MERGE dbo.mgmt_companies AS target
        USING (SELECT @id as id) AS source ON target.id = source.id
        WHEN MATCHED THEN UPDATE SET name = @name
        WHEN NOT MATCHED THEN INSERT (id, name) VALUES (@id, @name);
      `);
    console.log('Manual upsert: OK');

    const check = await pool.request().query("SELECT COUNT(*) as c FROM dbo.mgmt_companies WHERE id = 'test-123'");
    console.log('Test row exists:', check.recordset[0].c);

    // Clean up
    await pool.request().query("DELETE FROM dbo.mgmt_companies WHERE id = 'test-123'");
  } catch(e) {
    console.log('Manual upsert failed:', e.message);
  }

  await pool.close();
})().catch(e => console.error(e.message));
