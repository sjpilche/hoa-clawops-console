/**
 * List all databases and find EMPCAMPMaster2 data
 */
require('dotenv').config({ path: '.env.local' });
const sql = require('mssql');

async function exploreDatabases() {
  const config = {
    server: process.env.AZURE_SQL_SERVER,
    user: process.env.AZURE_SQL_USER,
    password: process.env.AZURE_SQL_PASSWORD,
    options: {
      encrypt: true,
      trustServerCertificate: true,
      enableArithAbort: true,
      connectTimeout: 30000,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };

  console.log('🔍 Exploring Azure SQL Server');
  console.log('Server:', config.server);
  console.log('User:', config.user);
  console.log('='.repeat(60) + '\n');

  try {
    const pool = await sql.connect(config);
    console.log('✅ Connected successfully\n');

    // List all databases
    console.log('📊 Available Databases:');
    const databases = await pool.request().query(`
      SELECT
        name as DatabaseName,
        database_id as DatabaseID,
        create_date as Created
      FROM sys.databases
      WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb')
      ORDER BY name
    `);

    if (databases.recordset.length === 0) {
      console.log('  (No user databases found - only system databases visible)');
    } else {
      databases.recordset.forEach(db => {
        console.log(`  - ${db.DatabaseName} (ID: ${db.DatabaseID}, Created: ${db.Created.toISOString().split('T')[0]})`);
      });
    }

    // Check if we can switch to EMPCAMPMaster2
    console.log('\n🔍 Attempting to access EMPCAMPMaster2...');
    try {
      await pool.request().query('USE EMPCAMPMaster2');
      console.log('✅ Successfully switched to EMPCAMPMaster2');

      // List tables
      const tables = await pool.request().query(`
        SELECT
          TABLE_SCHEMA,
          TABLE_NAME,
          (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS c
           WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA
           AND c.TABLE_NAME = t.TABLE_NAME) as ColumnCount
        FROM INFORMATION_SCHEMA.TABLES t
        WHERE TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_SCHEMA, TABLE_NAME
      `);

      console.log(`\n📋 Tables in EMPCAMPMaster2 (${tables.recordset.length} tables):`);
      let currentSchema = '';
      tables.recordset.forEach(row => {
        if (row.TABLE_SCHEMA !== currentSchema) {
          currentSchema = row.TABLE_SCHEMA;
          console.log(`\n  Schema: ${currentSchema}`);
        }
        console.log(`    - ${row.TABLE_NAME} (${row.ColumnCount} columns)`);
      });

      // Search for lead/email tables
      console.log('\n🔍 Searching for Lead/Email/Contact tables:');
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

          // Get row count
          try {
            const count = await pool.request().query(`
              SELECT COUNT(*) as RowCount
              FROM [${table.TABLE_SCHEMA}].[${table.TABLE_NAME}]
            `);
            console.log(`    Rows: ${count.recordset[0].RowCount.toLocaleString()}`);

            // Get columns
            const columns = await pool.request().query(`
              SELECT TOP 10 COLUMN_NAME, DATA_TYPE
              FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = '${table.TABLE_SCHEMA}'
              AND TABLE_NAME = '${table.TABLE_NAME}'
              ORDER BY ORDINAL_POSITION
            `);
            console.log(`    Columns: ${columns.recordset.map(c => c.COLUMN_NAME).join(', ')}`);
          } catch (err) {
            console.log(`    (Could not access table details)`);
          }
          console.log('');
        }
      } else {
        console.log('  (No matching tables found)');
      }

    } catch (error) {
      console.log('❌ Cannot access EMPCAMPMaster2:', error.message);
      console.log('\nNote: You may need to grant the user access to this database.');
    }

    await pool.close();

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

exploreDatabases().catch(console.error);
