/**
 * @file verify-azure-data.js
 * @description Verify data quality in Azure SQL Database
 */

require('dotenv').config();
require('ts-node/register');
const { getAzureStats } = require('../src/storage/azureSync');
const sql = require('mssql');

async function verifyData() {
  console.log('🔍 Verifying Azure SQL Data Quality...\n');

  try {
    // Get overall stats
    const stats = await getAzureStats();
    console.log('📊 Overall Stats:');
    console.log(`   Total contacts: ${stats.total}`);
    console.log(`   With email: ${stats.withEmail} (${((stats.withEmail / stats.total) * 100).toFixed(1)}%)`);
    console.log(`   High-value (≥80): ${stats.highValue} (${((stats.highValue / stats.total) * 100).toFixed(1)}%)`);
    console.log('\n   By State:');
    Object.entries(stats.byState)
      .sort((a, b) => b[1] - a[1])
      .forEach(([state, count]) => {
        console.log(`      ${state}: ${count}`);
      });

    // Connect to Azure SQL
    const config = {
      server: process.env.AZURE_SQL_SERVER,
      database: process.env.AZURE_SQL_DATABASE,
      user: process.env.AZURE_SQL_USER,
      password: process.env.AZURE_SQL_PASSWORD,
      options: {
        encrypt: true,
        trustServerCertificate: false,
      },
    };

    console.log('\n🔌 Connecting to Azure SQL...');
    const pool = await sql.connect(config);

    // Sample high-value contacts
    console.log('\n✨ Sample High-Value Contacts (Top 5):');
    const highValue = await pool.request().query(`
      SELECT TOP 5 hoa_name, contact_person, email, city, state, confidence_score, source_type
      FROM hoa_contacts
      WHERE confidence_score >= 80 AND email IS NOT NULL
      ORDER BY confidence_score DESC, scraped_at DESC
    `);

    highValue.recordset.forEach((row, i) => {
      console.log(`\n   ${i + 1}. ${row.hoa_name}`);
      console.log(`      Contact: ${row.contact_person || 'N/A'}`);
      console.log(`      Email: ${row.email}`);
      console.log(`      Location: ${row.city}, ${row.state}`);
      console.log(`      Score: ${row.confidence_score}/100`);
      console.log(`      Source: ${row.source_type}`);
    });

    // Check source attribution
    console.log('\n\n📋 Source Attribution Check:');
    const sources = await pool.request().query(`
      SELECT source_type, COUNT(*) as count
      FROM hoa_contacts
      GROUP BY source_type
      ORDER BY count DESC
    `);

    sources.recordset.forEach((row) => {
      console.log(`   ${row.source_type}: ${row.count} contacts`);
    });

    // Check data completeness
    console.log('\n\n✅ Data Completeness:');
    const completeness = await pool.request().query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN hoa_name IS NOT NULL THEN 1 ELSE 0 END) as with_name,
        SUM(CASE WHEN email IS NOT NULL THEN 1 ELSE 0 END) as with_email,
        SUM(CASE WHEN contact_person IS NOT NULL THEN 1 ELSE 0 END) as with_contact,
        SUM(CASE WHEN city IS NOT NULL THEN 1 ELSE 0 END) as with_city,
        SUM(CASE WHEN state IS NOT NULL THEN 1 ELSE 0 END) as with_state,
        SUM(CASE WHEN source_url IS NOT NULL THEN 1 ELSE 0 END) as with_url
      FROM hoa_contacts
      WHERE source_type = 'hoa_lead_agent'
    `);

    const comp = completeness.recordset[0];
    console.log(`   Company Name: ${comp.with_name}/${comp.total} (${((comp.with_name / comp.total) * 100).toFixed(1)}%)`);
    console.log(`   Email: ${comp.with_email}/${comp.total} (${((comp.with_email / comp.total) * 100).toFixed(1)}%)`);
    console.log(`   Contact Person: ${comp.with_contact}/${comp.total} (${((comp.with_contact / comp.total) * 100).toFixed(1)}%)`);
    console.log(`   City: ${comp.with_city}/${comp.total} (${((comp.with_city / comp.total) * 100).toFixed(1)}%)`);
    console.log(`   State: ${comp.with_state}/${comp.total} (${((comp.with_state / comp.total) * 100).toFixed(1)}%)`);
    console.log(`   Website URL: ${comp.with_url}/${comp.total} (${((comp.with_url / comp.total) * 100).toFixed(1)}%)`);

    // Check for duplicates
    console.log('\n\n🔎 Duplicate Check:');
    const duplicates = await pool.request().query(`
      SELECT fingerprint, COUNT(*) as count
      FROM hoa_contacts
      WHERE source_type = 'hoa_lead_agent'
      GROUP BY fingerprint
      HAVING COUNT(*) > 1
    `);

    if (duplicates.recordset.length === 0) {
      console.log('   ✅ No duplicates found (deduplication working!)');
    } else {
      console.log(`   ⚠️  Found ${duplicates.recordset.length} duplicate fingerprints`);
      duplicates.recordset.slice(0, 3).forEach((row) => {
        console.log(`      ${row.fingerprint}: ${row.count} copies`);
      });
    }

    // Recent activity
    console.log('\n\n⏰ Recent Activity:');
    const recent = await pool.request().query(`
      SELECT TOP 5 hoa_name, email, city, state, scraped_at
      FROM hoa_contacts
      WHERE source_type = 'hoa_lead_agent'
      ORDER BY scraped_at DESC
    `);

    recent.recordset.forEach((row) => {
      const date = new Date(row.scraped_at);
      console.log(`   ${row.hoa_name} (${row.city}, ${row.state}) - ${date.toLocaleString()}`);
    });

    await pool.close();
    console.log('\n\n✅ Data Quality Verification Complete!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

verifyData();
