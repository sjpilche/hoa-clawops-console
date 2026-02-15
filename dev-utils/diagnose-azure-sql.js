/**
 * Diagnose Azure SQL Connection Issues
 */
require('dotenv').config({ path: '.env.local' });
const sql = require('mssql');

async function testConfig(configName, config) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${configName}`);
  console.log(`Server: ${config.server}`);
  console.log(`Database: ${config.database}`);
  console.log(`User: ${config.user}`);
  console.log(`Authentication: ${config.authentication || 'default (SQL)'}`);
  console.log('='.repeat(60));

  try {
    const pool = await sql.connect(config);
    console.log('✅ CONNECTION SUCCESSFUL!');

    const result = await pool.request().query('SELECT DB_NAME() as DbName, SUSER_SNAME() as LoginName, USER_NAME() as UserName');
    console.log('Connected to:', result.recordset[0]);

    await pool.close();
    return true;
  } catch (error) {
    console.log('❌ Connection failed:', error.message);
    console.log('Error code:', error.code);
    return false;
  }
}

async function diagnose() {
  console.log('🔍 Azure SQL Connection Diagnostics');
  console.log('Testing different configurations...\n');

  const baseConfig = {
    server: process.env.AZURE_SQL_SERVER,
    database: process.env.AZURE_SQL_DATABASE,
    user: process.env.AZURE_SQL_USER,
    password: process.env.AZURE_SQL_PASSWORD,
    options: {
      encrypt: true,
      enableArithAbort: true,
      connectTimeout: 30000,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };

  // Test 1: Default config with trustServerCertificate: false
  await testConfig('Test 1: Default (trustServerCertificate: false)', {
    ...baseConfig,
    options: {
      ...baseConfig.options,
      trustServerCertificate: false,
    },
  });

  // Test 2: With trustServerCertificate: true
  await testConfig('Test 2: trustServerCertificate: true', {
    ...baseConfig,
    options: {
      ...baseConfig.options,
      trustServerCertificate: true,
    },
  });

  // Test 3: Without database specified (connect to master)
  await testConfig('Test 3: Connect to master database', {
    ...baseConfig,
    database: 'master',
    options: {
      ...baseConfig.options,
      trustServerCertificate: true,
    },
  });

  // Test 4: Try connecting without specifying database at all
  const { database, ...configWithoutDb } = baseConfig;
  await testConfig('Test 4: No database specified', {
    ...configWithoutDb,
    options: {
      ...baseConfig.options,
      trustServerCertificate: true,
    },
  });

  console.log('\n' + '='.repeat(60));
  console.log('Diagnostics Complete');
  console.log('='.repeat(60));
  console.log('\nTroubleshooting Tips:');
  console.log('1. Verify username and password in Azure Portal');
  console.log('2. Check if SQL Authentication is enabled on the server');
  console.log('3. Verify firewall rules allow your IP address');
  console.log('4. Confirm the user has access to EMPCAMPMaster2 database');
  console.log('5. Try logging in via Azure Data Studio or SSMS to verify credentials');
}

diagnose().catch(console.error);
