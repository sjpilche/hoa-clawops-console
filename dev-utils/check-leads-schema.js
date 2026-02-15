const sql = require('mssql');
require('dotenv').config({ path: '.env.local' });

(async () => {
  const pool = await sql.connect({
    server: process.env.AZURE_SQL_SERVER,
    database: process.env.AZURE_SQL_DATABASE,
    user: process.env.AZURE_SQL_USER,
    password: process.env.AZURE_SQL_PASSWORD,
    options: { encrypt: true, trustServerCertificate: true }
  });

  const result = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'leads' AND TABLE_SCHEMA = 'dbo'
    ORDER BY ORDINAL_POSITION
  `);

  console.log('dbo.leads table schema:');
  result.recordset.forEach(col => {
    console.log(`  ${col.COLUMN_NAME}: ${col.DATA_TYPE} (${col.IS_NULLABLE})`);
  });

  await pool.close();
})();
