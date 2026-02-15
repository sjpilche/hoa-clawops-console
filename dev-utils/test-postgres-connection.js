/**
 * Test PostgreSQL connection and list available databases/tables
 */
const { Pool } = require('pg');

const configs = [
  {
    name: 'Audit System (stevep)',
    host: '100.119.132.105',
    port: 5432,
    database: 'privillmdb_bc',
    user: 'stevep',
    password: 'nsg00'
  },
  {
    name: 'Audit System (privium)',
    host: '100.119.132.105',
    port: 5432,
    database: 'privillmdb_bc',
    user: 'privium',
    password: 'dapp00'
  },
  {
    name: 'Postgres (listing all DBs)',
    host: '100.119.132.105',
    port: 5432,
    database: 'postgres',
    user: 'stevep',
    password: 'nsg00'
  }
];

async function testConnection(config) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${config.name}`);
  console.log(`Host: ${config.host}:${config.port}`);
  console.log(`Database: ${config.database}`);
  console.log(`User: ${config.user}`);
  console.log(`${'='.repeat(60)}\n`);

  const pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    connectionTimeoutMillis: 5000,
  });

  try {
    // Test basic connection
    const client = await pool.connect();
    console.log('✅ Connection successful!\n');

    // List all databases (if connected to postgres)
    if (config.database === 'postgres') {
      console.log('📊 Available Databases:');
      const dbResult = await client.query(`
        SELECT datname FROM pg_database
        WHERE datistemplate = false
        ORDER BY datname;
      `);
      dbResult.rows.forEach(row => {
        console.log(`  - ${row.datname}`);
      });
    }

    // List schemas
    console.log('\n📂 Available Schemas:');
    const schemaResult = await client.query(`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
      ORDER BY schema_name;
    `);
    schemaResult.rows.forEach(row => {
      console.log(`  - ${row.schema_name}`);
    });

    // List tables in each schema
    console.log('\n📋 Tables by Schema:');
    const tableResult = await client.query(`
      SELECT
        table_schema,
        table_name,
        (SELECT COUNT(*) FROM information_schema.columns c
         WHERE c.table_schema = t.table_schema
         AND c.table_name = t.table_name) as column_count
      FROM information_schema.tables t
      WHERE table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
      ORDER BY table_schema, table_name;
    `);

    let currentSchema = '';
    tableResult.rows.forEach(row => {
      if (row.table_schema !== currentSchema) {
        currentSchema = row.table_schema;
        console.log(`\n  Schema: ${currentSchema}`);
      }
      console.log(`    - ${row.table_name} (${row.column_count} columns)`);
    });

    // Search for anything related to "emp", "camp", "lead", "customer"
    console.log('\n🔍 Searching for EMP/CAMP/Lead related tables:');
    const searchResult = await client.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE (
        LOWER(table_name) LIKE '%emp%' OR
        LOWER(table_name) LIKE '%camp%' OR
        LOWER(table_name) LIKE '%lead%' OR
        LOWER(table_name) LIKE '%customer%' OR
        LOWER(table_name) LIKE '%email%' OR
        LOWER(table_name) LIKE '%contact%'
      )
      AND table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
      ORDER BY table_schema, table_name;
    `);

    if (searchResult.rows.length > 0) {
      searchResult.rows.forEach(row => {
        console.log(`  ✓ ${row.table_schema}.${row.table_name}`);
      });
    } else {
      console.log('  (No matching tables found)');
    }

    client.release();
    await pool.end();

  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    if (error.code) {
      console.error(`   Error Code: ${error.code}`);
    }
    await pool.end();
  }
}

async function main() {
  console.log('🔌 PostgreSQL Database Connection Test');
  console.log('Checking for EMPCAMPMaster2 and other databases...\n');

  for (const config of configs) {
    await testConnection(config);
    await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between tests
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ All connection tests complete');
  console.log('='.repeat(60));
}

main().catch(console.error);
