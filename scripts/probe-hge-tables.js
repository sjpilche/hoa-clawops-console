// Probe HGE server fully with spilcher credentials
const sql = require('mssql');

async function tryDb(server, database, user, password) {
  const config = {
    server, database, user, password,
    options: { encrypt: true, trustServerCertificate: false, connectTimeout: 15000 }
  };
  try {
    const pool = await sql.connect(config);
    const tables = await pool.request().query(`
      SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `);
    const dbs = await pool.request().query('SELECT name FROM sys.databases ORDER BY name').catch(() => ({ recordset: [] }));
    console.log(`\n✅ ${server} / ${database}: ${tables.recordset.length} tables`);
    console.log(`   Databases on server: ${dbs.recordset.map(r => r.name).join(', ')}`);
    if (tables.recordset.length > 0) {
      tables.recordset.forEach(t => console.log(`   - ${t.TABLE_SCHEMA}.${t.TABLE_NAME}`));
    }
    await pool.close();
    return tables.recordset;
  } catch (e) {
    console.log(`❌ ${server} / ${database}: ${e.message}`);
    return null;
  }
}

async function go() {
  // Try all known servers with spilcher creds
  await tryDb('hge.database.windows.net', 'hge', 'spilcher', '!NSGColorado00');
  await tryDb('hge.database.windows.net', 'master', 'spilcher', '!NSGColorado00');

  // Maybe the real server name is different — try common patterns
  await tryDb('hge.database.windows.net', 'NSGEmpire', 'spilcher', '!NSGColorado00');
  await tryDb('hge.database.windows.net', 'empire', 'spilcher', '!NSGColorado00');
  await tryDb('hge.database.windows.net', 'nsg', 'spilcher', '!NSGColorado00');
}
go().catch(e => console.error('FATAL:', e.message));
