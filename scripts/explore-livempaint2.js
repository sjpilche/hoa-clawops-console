/**
 * Explore livempaint2004 — find schemas, then query email tables
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
  console.log('Connected!');

  // What schemas exist?
  const schemas = await pool.request().query(`
    SELECT DISTINCT TABLE_SCHEMA FROM INFORMATION_SCHEMA.TABLES ORDER BY TABLE_SCHEMA
  `);
  console.log('Schemas:', schemas.recordset.map(r => r.TABLE_SCHEMA).join(', '));

  // All tables with their schema
  const tables = await pool.request().query(`
    SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_SCHEMA, TABLE_NAME
  `);

  // Try row counts with schema prefix
  console.log('\nRow counts (non-zero only):');
  for (const t of tables.recordset) {
    try {
      const r = await pool.request().query(`SELECT COUNT(*) AS n FROM [${t.TABLE_SCHEMA}].[${t.TABLE_NAME}]`);
      const n = r.recordset[0].n;
      if (n > 0) console.log('  ' + (t.TABLE_SCHEMA + '.' + t.TABLE_NAME).padEnd(55) + n);
    } catch (e) {
      // skip silently
    }
  }

  // Now check email columns with schema prefix
  const emailCols = await pool.request().query(`
    SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE COLUMN_NAME LIKE '%email%' OR COLUMN_NAME LIKE '%mail%'
    ORDER BY TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME
  `);

  console.log('\n\nChecking email columns for real data:');
  for (const col of emailCols.recordset) {
    try {
      const r = await pool.request().query(`
        SELECT COUNT(*) AS total,
          SUM(CASE WHEN [${col.COLUMN_NAME}] IS NOT NULL AND LEN(CAST([${col.COLUMN_NAME}] AS NVARCHAR(500))) > 5
            AND CAST([${col.COLUMN_NAME}] AS NVARCHAR(500)) NOT LIKE '%test%'
            AND CAST([${col.COLUMN_NAME}] AS NVARCHAR(500)) NOT LIKE '%example%'
            THEN 1 ELSE 0 END) AS real_emails
        FROM [${col.TABLE_SCHEMA}].[${col.TABLE_NAME}]
      `);
      const total = r.recordset[0].total;
      const real = r.recordset[0].real_emails;
      if (real > 0) {
        console.log('✅ ' + (col.TABLE_SCHEMA+'.'+col.TABLE_NAME).padEnd(45) + col.COLUMN_NAME.padEnd(30) + 'total=' + total + ' real=' + real);
      }
    } catch (e) {
      // skip
    }
  }

  await pool.close();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
