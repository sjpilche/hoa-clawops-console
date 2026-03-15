// Check all databases on the EMP server for job/customer/AR tables
const sql = require('mssql');

async function checkDb(server, user, password, database) {
  const config = {
    server,
    database,
    user,
    password,
    options: { encrypt: true, trustServerCertificate: false, connectTimeout: 15000 }
  };
  console.log(`\n${'='.repeat(60)}`);
  console.log(`SERVER: ${server} / DB: ${database}`);
  console.log('='.repeat(60));
  try {
    const pool = await sql.connect(config);

    // List all databases on this server
    const dbs = await pool.request().query('SELECT name, state_desc FROM sys.databases ORDER BY name');
    console.log('DATABASES:', dbs.recordset.map(r => r.name).join(', '));

    // List all base tables
    const tables = await pool.request().query(`
      SELECT TABLE_SCHEMA, TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `);
    console.log(`\nBASE TABLES (${tables.recordset.length}):`);
    tables.recordset.forEach(t => console.log(`  ${t.TABLE_SCHEMA}.${t.TABLE_NAME}`));

    // Search for relevant tables
    const search = await pool.request().query(`
      SELECT TABLE_SCHEMA, TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME LIKE '%job%' OR TABLE_NAME LIKE '%customer%'
         OR TABLE_NAME LIKE '%invoice%' OR TABLE_NAME LIKE '%AR%'
         OR TABLE_NAME LIKE '%contact%' OR TABLE_NAME LIKE '%collection%'
         OR TABLE_NAME LIKE '%lead%'
      ORDER BY TABLE_NAME
    `);
    if (search.recordset.length > 0) {
      console.log('\nRELEVANT TABLES:', search.recordset.map(r => `${r.TABLE_SCHEMA}.${r.TABLE_NAME}`).join(', '));
    }

    await pool.close();
  } catch (e) {
    console.log('FAILED:', e.message);
  }
}

async function go() {
  // EMP server with CloudSA creds — check both empcapmaster2 and master
  await checkDb('empirecapital.database.windows.net', 'CloudSA1f77fc9b', 'T0ughGUY123$', 'empcapmaster2');

  // Try lcabarcas against the EMP server too
  await checkDb('empirecapital.database.windows.net', 'lcabarcas', '!NSGColorado00', 'empcapmaster2');
}
go().catch(e => console.error('FATAL:', e.message));
