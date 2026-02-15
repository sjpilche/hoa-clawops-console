/**
 * Test Azure SQL Server connection to EMPCAMPMaster2
 * This script connects to Azure SQL and explores the database structure
 */
require('dotenv').config({ path: '.env.local' });
const sql = require('mssql');

// Azure SQL Connection Configuration
const config = {
  server: process.env.AZURE_SQL_SERVER,
  database: process.env.AZURE_SQL_DATABASE,
  user: process.env.AZURE_SQL_USER,
  password: process.env.AZURE_SQL_PASSWORD,
  options: {
    encrypt: true, // Required for Azure SQL
    trustServerCertificate: false,
    enableArithAbort: true,
    connectTimeout: 30000,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

async function testConnection() {
  console.log('🔌 Testing Azure SQL Connection to EMPCAMPMaster2');
  console.log('='.repeat(60));
  console.log(`Server: ${config.server}`);
  console.log(`Database: ${config.database}`);
  console.log(`User: ${config.user}`);
  console.log('='.repeat(60) + '\n');

  let pool;

  try {
    // Connect to Azure SQL
    console.log('Connecting to Azure SQL Server...');
    pool = await sql.connect(config);
    console.log('✅ Connection successful!\n');

    // Get database info
    console.log('📊 Database Information:');
    const dbInfo = await pool.request().query(`
      SELECT
        DB_NAME() as DatabaseName,
        @@VERSION as SQLServerVersion
    `);
    console.log(`  Database: ${dbInfo.recordset[0].DatabaseName}`);
    console.log(`  Version: ${dbInfo.recordset[0].SQLServerVersion.split('\n')[0]}\n`);

    // List all schemas
    console.log('📂 Available Schemas:');
    const schemas = await pool.request().query(`
      SELECT DISTINCT schema_name
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY schema_name
    `);
    schemas.recordset.forEach(row => {
      console.log(`  - ${row.schema_name}`);
    });

    // List all tables
    console.log('\n📋 All Tables:');
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

    let currentSchema = '';
    tables.recordset.forEach(row => {
      if (row.TABLE_SCHEMA !== currentSchema) {
        currentSchema = row.TABLE_SCHEMA;
        console.log(`\n  Schema: ${currentSchema}`);
      }
      console.log(`    - ${row.TABLE_NAME} (${row.ColumnCount} columns)`);
    });

    // Search for lead/customer/email related tables
    console.log('\n🔍 Searching for Lead/Customer/Email/Contact tables:');
    const searchTables = await pool.request().query(`
      SELECT TABLE_SCHEMA, TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
      AND (
        LOWER(TABLE_NAME) LIKE '%lead%' OR
        LOWER(TABLE_NAME) LIKE '%customer%' OR
        LOWER(TABLE_NAME) LIKE '%email%' OR
        LOWER(TABLE_NAME) LIKE '%contact%' OR
        LOWER(TABLE_NAME) LIKE '%prospect%' OR
        LOWER(TABLE_NAME) LIKE '%campaign%'
      )
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `);

    if (searchTables.recordset.length > 0) {
      console.log(`  Found ${searchTables.recordset.length} relevant tables:\n`);
      for (const table of searchTables.recordset) {
        console.log(`  ✓ ${table.TABLE_SCHEMA}.${table.TABLE_NAME}`);

        // Get column details for each relevant table
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

        console.log(`    Columns:`);
        columns.recordset.forEach(col => {
          const nullable = col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL';
          const length = col.CHARACTER_MAXIMUM_LENGTH ? `(${col.CHARACTER_MAXIMUM_LENGTH})` : '';
          console.log(`      - ${col.COLUMN_NAME}: ${col.DATA_TYPE}${length} ${nullable}`);
        });
        console.log('');

        // Get row count
        const count = await pool.request().query(`
          SELECT COUNT(*) as RowCount
          FROM [${table.TABLE_SCHEMA}].[${table.TABLE_NAME}]
        `);
        console.log(`    Row count: ${count.recordset[0].RowCount.toLocaleString()}\n`);
      }
    } else {
      console.log('  (No matching tables found)');
    }

    // Sample data from key tables (if they exist)
    console.log('\n📄 Sample Data Preview:');
    const sampleTables = searchTables.recordset.slice(0, 3); // First 3 tables
    for (const table of sampleTables) {
      console.log(`\n  Sample from ${table.TABLE_SCHEMA}.${table.TABLE_NAME}:`);
      try {
        const sample = await pool.request().query(`
          SELECT TOP 5 *
          FROM [${table.TABLE_SCHEMA}].[${table.TABLE_NAME}]
        `);
        console.log(`    (Showing ${sample.recordset.length} rows)`);
        if (sample.recordset.length > 0) {
          console.log('    ' + JSON.stringify(sample.recordset[0], null, 2).split('\n').join('\n    '));
        }
      } catch (err) {
        console.log(`    ⚠️ Could not fetch sample: ${err.message}`);
      }
    }

  } catch (error) {
    console.error('\n❌ Connection failed:', error.message);
    console.error('Error details:', error);
  } finally {
    if (pool) {
      await pool.close();
      console.log('\n✅ Connection closed');
    }
  }
}

// Run the test
testConnection().catch(console.error);
