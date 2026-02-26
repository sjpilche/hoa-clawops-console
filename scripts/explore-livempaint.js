/**
 * Explore livempaint2004 Azure SQL database
 * Find vendors, customers, contacts with emails for outreach
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

async function main() {
  const pool = await sql.connect(config);
  console.log('Connected to: livempaint2004');

  // List all tables
  const tables = await pool.request().query(`
    SELECT TABLE_NAME, TABLE_TYPE
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE'
    ORDER BY TABLE_NAME
  `);
  console.log('\nAll tables (' + tables.recordset.length + '):');
  tables.recordset.forEach(r => console.log('  ' + r.TABLE_NAME));

  // Find all email columns across all tables
  const emailCols = await pool.request().query(`
    SELECT TABLE_NAME, COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE COLUMN_NAME LIKE '%email%'
       OR COLUMN_NAME LIKE '%mail%'
    ORDER BY TABLE_NAME, COLUMN_NAME
  `);
  console.log('\nTables/columns with email data:');
  emailCols.recordset.forEach(r => console.log('  ' + r.TABLE_NAME.padEnd(40) + r.COLUMN_NAME));

  // Check row counts for all tables
  console.log('\nRow counts for all tables:');
  for (const t of tables.recordset) {
    try {
      const r = await pool.request().query(`SELECT COUNT(*) AS n FROM [${t.TABLE_NAME}]`);
      const n = r.recordset[0].n;
      if (n > 0) console.log('  ' + t.TABLE_NAME.padEnd(45) + n + ' rows');
    } catch (e) {
      console.log('  ' + t.TABLE_NAME.padEnd(45) + 'ERROR: ' + e.message.substring(0, 50));
    }
  }

  await pool.close();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
