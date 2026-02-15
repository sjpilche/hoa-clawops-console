/**
 * Explore the lead database and show what data is available
 */
require('dotenv').config({ path: '.env.local' });
const sql = require('mssql');

const config = {
  server: process.env.AZURE_SQL_SERVER,
  database: process.env.AZURE_SQL_DATABASE,
  user: process.env.AZURE_SQL_USER,
  password: process.env.AZURE_SQL_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
    connectTimeout: 30000,
  },
};

async function explore() {
  console.log('🔍 Exploring empcapmaster2 Lead Database');
  console.log('='.repeat(60) + '\n');

  try {
    const pool = await sql.connect(config);
    console.log('✅ Connected to:', config.database);
    console.log('Server:', config.server, '\n');

    // Get all tables
    console.log('📋 Tables in Database:');
    const tables = await pool.request().query(`
      SELECT
        TABLE_SCHEMA,
        TABLE_NAME,
        (SELECT COUNT(*)
         FROM INFORMATION_SCHEMA.COLUMNS c
         WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA
         AND c.TABLE_NAME = t.TABLE_NAME) as ColumnCount
      FROM INFORMATION_SCHEMA.TABLES t
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `);

    if (tables.recordset.length === 0) {
      console.log('  (No tables found)');
    } else {
      let currentSchema = '';
      tables.recordset.forEach(row => {
        if (row.TABLE_SCHEMA !== currentSchema) {
          currentSchema = row.TABLE_SCHEMA;
          console.log(`\n  Schema: ${currentSchema}`);
        }
        console.log(`    - ${row.TABLE_NAME} (${row.ColumnCount} columns)`);
      });
      console.log(`\n  Total: ${tables.recordset.length} tables`);
    }

    // For each table, show details
    console.log('\n' + '='.repeat(60));
    console.log('📊 Table Details & Sample Data');
    console.log('='.repeat(60));

    for (const table of tables.recordset) {
      const fullTableName = `[${table.TABLE_SCHEMA}].[${table.TABLE_NAME}]`;
      console.log(`\n📄 ${fullTableName}`);

      // Get columns
      const columns = await pool.request().query(`
        SELECT
          COLUMN_NAME,
          DATA_TYPE,
          CHARACTER_MAXIMUM_LENGTH,
          IS_NULLABLE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = '${table.TABLE_SCHEMA}'
        AND TABLE_NAME = '${table.TABLE_NAME}'
        ORDER BY ORDINAL_POSITION
      `);

      console.log('  Columns:');
      columns.recordset.forEach(col => {
        const nullable = col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL';
        const length = col.CHARACTER_MAXIMUM_LENGTH ? `(${col.CHARACTER_MAXIMUM_LENGTH})` : '';
        console.log(`    - ${col.COLUMN_NAME}: ${col.DATA_TYPE}${length} ${nullable}`);
      });

      // Get row count
      try {
        const count = await pool.request().query(`
          SELECT COUNT(*) as RowCount FROM ${fullTableName}
        `);
        const rowCount = count.recordset[0].RowCount;
        console.log(`\n  Total Rows: ${rowCount.toLocaleString()}`);

        // Show sample data if there are rows
        if (rowCount > 0) {
          const sample = await pool.request().query(`
            SELECT TOP 3 * FROM ${fullTableName}
          `);

          console.log(`\n  Sample Data (first ${sample.recordset.length} rows):`);
          sample.recordset.forEach((row, idx) => {
            console.log(`\n  Row ${idx + 1}:`);
            Object.entries(row).forEach(([key, value]) => {
              let displayValue = value;
              if (value === null) {
                displayValue = 'NULL';
              } else if (typeof value === 'string' && value.length > 100) {
                displayValue = value.substring(0, 100) + '...';
              } else if (value instanceof Date) {
                displayValue = value.toISOString();
              }
              console.log(`    ${key}: ${displayValue}`);
            });
          });
        }
      } catch (err) {
        console.log(`  ⚠️ Could not access table data: ${err.message}`);
      }

      console.log('\n' + '-'.repeat(60));
    }

    await pool.close();
    console.log('\n✅ Exploration complete!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

explore().catch(console.error);
