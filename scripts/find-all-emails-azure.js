/**
 * Scan ALL Azure SQL tables for columns containing emails
 * Find every table/column combination that has real email data
 */
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
  console.log('Connected to:', process.env.AZURE_SQL_DATABASE);

  // Find every column named like 'email' across all tables
  const emailCols = await pool.request().query(`
    SELECT TABLE_NAME, COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE COLUMN_NAME LIKE '%email%'
       OR COLUMN_NAME LIKE '%mail%'
    ORDER BY TABLE_NAME, COLUMN_NAME
  `);
  console.log('\nAll tables/columns with "email" or "mail" in name:');
  emailCols.recordset.forEach(r => console.log('  ' + r.TABLE_NAME.padEnd(40) + r.COLUMN_NAME));

  console.log('\n=== CHECKING EACH FOR NON-TEST EMAILS ===\n');

  // Check each one dynamically
  for (const col of emailCols.recordset) {
    try {
      const r = await pool.request().query(`
        SELECT COUNT(*) AS total,
          SUM(CASE WHEN [${col.COLUMN_NAME}] IS NOT NULL AND LEN([${col.COLUMN_NAME}]) > 5
            AND [${col.COLUMN_NAME}] NOT LIKE '%test%'
            AND [${col.COLUMN_NAME}] NOT LIKE '%pilcher%'
            AND [${col.COLUMN_NAME}] NOT LIKE '%example%'
            AND [${col.COLUMN_NAME}] NOT LIKE '%steve%'
            AND [${col.COLUMN_NAME}] NOT LIKE '%@gmail%'
            THEN 1 ELSE 0 END) AS real_emails
        FROM [${col.TABLE_NAME}]
      `);
      const total = r.recordset[0].total;
      const real = r.recordset[0].real_emails;
      if (real > 0) {
        console.log('✅ ' + col.TABLE_NAME.padEnd(40) + col.COLUMN_NAME.padEnd(25) + ' total=' + total + ' real=' + real);
      } else if (total > 0) {
        console.log('   ' + col.TABLE_NAME.padEnd(40) + col.COLUMN_NAME.padEnd(25) + ' total=' + total + ' (all test/empty)');
      }
    } catch (e) {
      console.log('   ERROR ' + col.TABLE_NAME + '.' + col.COLUMN_NAME + ': ' + e.message.substring(0, 60));
    }
  }

  // Also check for 'phone' columns that might indicate real client records
  console.log('\n=== TABLES WITH REAL EMAIL COUNT > 5 (deeper look) ===\n');

  // Now sample each promising table
  const promising = [];
  for (const col of emailCols.recordset) {
    try {
      const r = await pool.request().query(`
        SELECT COUNT(*) AS real_emails
        FROM [${col.TABLE_NAME}]
        WHERE [${col.COLUMN_NAME}] IS NOT NULL AND LEN([${col.COLUMN_NAME}]) > 5
          AND [${col.COLUMN_NAME}] NOT LIKE '%test%'
          AND [${col.COLUMN_NAME}] NOT LIKE '%pilcher%'
          AND [${col.COLUMN_NAME}] NOT LIKE '%example%'
          AND [${col.COLUMN_NAME}] NOT LIKE '%steve%'
          AND [${col.COLUMN_NAME}] NOT LIKE '%@gmail%'
      `);
      if (r.recordset[0].real_emails >= 5) {
        promising.push({ table: col.TABLE_NAME, col: col.COLUMN_NAME, count: r.recordset[0].real_emails });
      }
    } catch {}
  }

  for (const p of promising) {
    console.log(`\n--- ${p.table}.${p.col} (${p.count} real emails) ---`);
    try {
      const cols = await pool.request().query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = '${p.table}' ORDER BY ORDINAL_POSITION
      `);
      const colList = cols.recordset.map(c => c.COLUMN_NAME);
      console.log('Columns:', colList.join(', '));

      // Sample 10 rows
      const sample = await pool.request().query(`
        SELECT TOP 10 * FROM [${p.table}]
        WHERE [${p.col}] IS NOT NULL AND LEN([${p.col}]) > 5
          AND [${p.col}] NOT LIKE '%test%'
          AND [${p.col}] NOT LIKE '%pilcher%'
          AND [${p.col}] NOT LIKE '%example%'
          AND [${p.col}] NOT LIKE '%steve%'
          AND [${p.col}] NOT LIKE '%@gmail%'
        ORDER BY (SELECT NULL)
      `);
      sample.recordset.forEach(r => {
        console.log('  ' + JSON.stringify(r).substring(0, 200));
      });
    } catch (e) {
      console.log('  Sample error:', e.message.substring(0, 80));
    }
  }

  await pool.close();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
