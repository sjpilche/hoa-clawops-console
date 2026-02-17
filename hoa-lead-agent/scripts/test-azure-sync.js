/**
 * @file test-azure-sync.js
 * @description Test Azure SQL sync with existing leads
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Import the Azure sync module (compiled from TypeScript)
async function testSync() {
  console.log('🧪 Testing Azure SQL Sync...\n');

  // Read existing leads
  const leadsPath = path.join(__dirname, '../leads.json');
  if (!fs.existsSync(leadsPath)) {
    console.error('❌ No leads.json found. Run the agent first to collect leads.');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(leadsPath, 'utf8'));
  const leads = data.leads || [];

  console.log(`📊 Found ${leads.length} leads in local database\n`);

  // Use ts-node to load TypeScript module
  require('ts-node/register');
  const { syncLeadsToAzure, getAzureStats } = require('../src/storage/azureSync');

  try {
    // Sync leads
    const stats = await syncLeadsToAzure(leads);

    console.log('\n✅ Sync Complete!');
    console.log(`   New: ${stats.synced}`);
    console.log(`   Updated: ${stats.updated}`);
    console.log(`   Failed: ${stats.failed}`);

    // Get Azure stats
    const azureStats = await getAzureStats();
    console.log('\n📊 Azure Database Stats:');
    console.log(`   Total: ${azureStats.total} contacts`);
    console.log(`   With Email: ${azureStats.withEmail}`);
    console.log(`   High-Value: ${azureStats.highValue} (score >= 80)`);
    console.log('\n   By State:');
    Object.entries(azureStats.byState)
      .sort((a, b) => b[1] - a[1])
      .forEach(([state, count]) => {
        console.log(`      ${state}: ${count}`);
      });

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

testSync();
