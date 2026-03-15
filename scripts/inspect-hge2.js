const sql = require('mssql');
const config = {
  server: 'hge.database.windows.net',
  database: 'hge',
  user: 'lcabarcas',
  password: '!NSGColorado00',
  options: { encrypt: true, trustServerCertificate: false, connectTimeout: 15000 }
};
async function go() {
  const pool = await sql.connect(config);

  // Current context (avoid reserved word 'current_user')
  const ctx = await pool.request().query(
    "SELECT DB_NAME() AS db, SCHEMA_NAME() AS sch, SUSER_NAME() AS login"
  );
  console.log('CONTEXT:', JSON.stringify(ctx.recordset[0]));

  // Try to query tables the user might not have SELECT permission to SEE in metadata
  // but could still SELECT from if granted directly
  const attempts = [
    'SELECT TOP 3 * FROM hge.job_collection',
    'SELECT TOP 3 * FROM hge.job_collection_note',
    'SELECT TOP 3 * FROM fin.AR_Snapshot',
    'SELECT TOP 3 * FROM dbo.job_collection',
    'SELECT TOP 3 * FROM dbo.customers',
    'SELECT TOP 3 * FROM dbo.jobs',
    'SELECT TOP 3 * FROM dbo.invoices',
    'SELECT TOP 3 * FROM dbo.contacts',
  ];

  for (const q of attempts) {
    try {
      const r = await pool.request().query(q);
      const cols = r.recordset.length > 0 ? Object.keys(r.recordset[0]) : [];
      console.log(`\n=== ${q} ===`);
      console.log(`Columns: ${cols.join(', ')}`);
      console.log('Row count:', r.recordset.length);
      if (r.recordset.length > 0) console.log('Sample:', JSON.stringify(r.recordset[0]));
    } catch (e) {
      console.log(`FAIL [${q}]: ${e.message}`);
    }
  }

  // Check sys.all_objects without schema filter - maybe there are objects owned differently
  const allObj = await pool.request().query(`
    SELECT TOP 50 s.name AS schema_name, o.name, o.type_desc
    FROM sys.all_objects o
    JOIN sys.schemas s ON o.schema_id = s.schema_id
    WHERE o.type IN ('U','V','P','FN','TF')
    ORDER BY s.name, o.name
  `);
  console.log('\n=== ALL USER OBJECTS ===', JSON.stringify(allObj.recordset, null, 2));

  await pool.close();
}
go().catch(e => console.error('FATAL:', e.message));
