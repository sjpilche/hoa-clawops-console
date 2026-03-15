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

  // SP definition
  const r1 = await pool.request().query(
    "SELECT OBJECT_DEFINITION(OBJECT_ID('fin.sp_Append_AR_Snapshot')) AS sp_def"
  );
  console.log('\n=== SP DEFINITION ===');
  console.log(r1.recordset[0]?.sp_def || 'NULL - no permission or not found');

  // External tables (Elastic Query / Synapse Link)
  try {
    const r2 = await pool.request().query('SELECT * FROM sys.external_tables');
    console.log('\n=== EXTERNAL TABLES ===', JSON.stringify(r2.recordset));
  } catch (e) { console.log('external_tables error:', e.message); }

  // External data sources
  try {
    const r3 = await pool.request().query('SELECT name, type_desc, location FROM sys.external_data_sources');
    console.log('\n=== EXTERNAL DATA SOURCES ===', JSON.stringify(r3.recordset));
  } catch (e) { console.log('external_data_sources error:', e.message); }

  // Check hge schema objects via sys.all_objects
  try {
    const r4 = await pool.request().query(`
      SELECT s.name AS schema_name, o.name, o.type_desc
      FROM sys.all_objects o
      JOIN sys.schemas s ON o.schema_id = s.schema_id
      WHERE s.name = 'hge'
      ORDER BY o.type_desc, o.name
    `);
    console.log('\n=== HGE SCHEMA OBJECTS ===', JSON.stringify(r4.recordset));
  } catch (e) { console.log('hge schema error:', e.message); }

  // Try direct select from hge.job_collection
  try {
    const r5 = await pool.request().query('SELECT TOP 3 * FROM hge.job_collection');
    console.log('\n=== hge.job_collection SAMPLE ===', JSON.stringify(r5.recordset));
  } catch (e) { console.log('hge.job_collection error:', e.message); }

  // Current user context
  const r6 = await pool.request().query(
    "SELECT DB_NAME() AS current_db, USER_NAME() AS current_user, SUSER_NAME() AS login_name"
  );
  console.log('\n=== CURRENT CONTEXT ===', JSON.stringify(r6.recordset[0]));

  // Check what permissions this user actually has
  try {
    const r7 = await pool.request().query(`
      SELECT DISTINCT o.name, o.type_desc, p.permission_name, p.state_desc
      FROM sys.database_permissions p
      JOIN sys.objects o ON p.major_id = o.object_id
      JOIN sys.database_principals u ON p.grantee_principal_id = u.principal_id
      WHERE u.name = USER_NAME()
    `);
    console.log('\n=== USER PERMISSIONS ===', JSON.stringify(r7.recordset));
  } catch (e) { console.log('permissions error:', e.message); }

  await pool.close();
}
go().catch(e => console.error('FATAL:', e.message));
