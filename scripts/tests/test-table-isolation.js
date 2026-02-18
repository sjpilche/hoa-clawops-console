/**
 * Table Isolation Test Script
 * Tests that campaign-specific tables provide complete data isolation
 */

const { initDatabase, get, all, run } = require('../server/db/connection');
const campaignTableManager = require('../server/services/campaignTableManager');
const { v4: uuid } = require('uuid');

async function testTableIsolation() {
  await initDatabase();

  console.log('🧪 TABLE ISOLATION TEST\n');
  console.log('Testing campaign-specific table isolation...\n');
  console.log('='.repeat(50) + '\n');

  let passed = 0;
  let failed = 0;

  try {
    // Test 1: Slug validation
    console.log('Test 1: Slug validation');
    try {
      campaignTableManager.validateSlug('valid-slug-123');
      console.log('  ✓ Valid slug accepted');
      passed++;
    } catch (error) {
      console.log('  ✗ Valid slug rejected:', error.message);
      failed++;
    }

    try {
      campaignTableManager.validateSlug('invalid@slug!');
      console.log('  ✗ Invalid slug accepted (should have been rejected)');
      failed++;
    } catch (error) {
      console.log('  ✓ Invalid slug correctly rejected');
      passed++;
    }

    // Test 2: Table name generation
    console.log('\nTest 2: Table name generation');
    const tableName = campaignTableManager.getTableName('test-campaign', 'leads');
    if (tableName === 'test_campaign_leads') {
      console.log('  ✓ Table name correctly generated:', tableName);
      passed++;
    } else {
      console.log('  ✗ Incorrect table name:', tableName);
      failed++;
    }

    // Test 3: Create campaign tables
    console.log('\nTest 3: Create campaign tables');
    const campaign1Slug = 'test-campaign-1';
    const campaign2Slug = 'test-campaign-2';

    await campaignTableManager.createCampaignTables(campaign1Slug);
    await campaignTableManager.createCampaignTables(campaign2Slug);

    if (campaignTableManager.tablesExist(campaign1Slug) && campaignTableManager.tablesExist(campaign2Slug)) {
      console.log('  ✓ Tables created for both test campaigns');
      passed++;
    } else {
      console.log('  ✗ Failed to create tables');
      failed++;
    }

    // Test 4: Insert data into campaign 1
    console.log('\nTest 4: Insert data into campaign 1');
    const table1Leads = campaignTableManager.getTableName(campaign1Slug, 'leads');
    const leadId1 = uuid();

    run(`INSERT INTO ${table1Leads} (id, company_name, email, status) VALUES (?, ?, ?, ?)`,
      [leadId1, 'Test Company 1', 'test1@example.com', 'new']);

    const c1LeadsAfterInsert = all(`SELECT * FROM ${table1Leads}`);
    if (c1LeadsAfterInsert.length === 1 && c1LeadsAfterInsert[0].company_name === 'Test Company 1') {
      console.log('  ✓ Lead inserted into campaign 1');
      passed++;
    } else {
      console.log('  ✗ Lead not found in campaign 1');
      failed++;
    }

    // Test 5: Verify campaign 2 doesn't see campaign 1's data
    console.log('\nTest 5: Verify data isolation between campaigns');
    const table2Leads = campaignTableManager.getTableName(campaign2Slug, 'leads');
    const c2Leads = all(`SELECT * FROM ${table2Leads}`);

    if (c2Leads.length === 0) {
      console.log('  ✓ Campaign 2 has no leads (isolated from campaign 1)');
      passed++;
    } else {
      console.log(`  ✗ Campaign 2 should have 0 leads, found: ${c2Leads.length}`);
      failed++;
    }

    // Test 6: Insert into campaign 2
    console.log('\nTest 6: Insert data into campaign 2');
    const leadId2 = uuid();

    run(`INSERT INTO ${table2Leads} (id, company_name, email, status) VALUES (?, ?, ?, ?)`,
      [leadId2, 'Test Company 2', 'test2@example.com', 'new']);

    const c2LeadsAfterInsert = all(`SELECT * FROM ${table2Leads}`);
    if (c2LeadsAfterInsert.length === 1 && c2LeadsAfterInsert[0].company_name === 'Test Company 2') {
      console.log('  ✓ Lead inserted into campaign 2');
      passed++;
    } else {
      console.log('  ✗ Lead not found in campaign 2');
      failed++;
    }

    // Test 7: Verify both campaigns have exactly 1 lead each
    console.log('\nTest 7: Verify independent data storage');
    const c1FinalLeads = all(`SELECT * FROM ${table1Leads}`);
    const c2FinalLeads = all(`SELECT * FROM ${table2Leads}`);

    if (c1FinalLeads.length === 1 && c2FinalLeads.length === 1) {
      console.log('  ✓ Each campaign has 1 lead (independent)');
      console.log(`     Campaign 1: "${c1FinalLeads[0].company_name}"`);
      console.log(`     Campaign 2: "${c2FinalLeads[0].company_name}"`);
      passed++;
    } else {
      console.log(`  ✗ Expected 1 lead each, found: Campaign 1 = ${c1FinalLeads.length}, Campaign 2 = ${c2FinalLeads.length}`);
      failed++;
    }

    // Test 8: Test all table types
    console.log('\nTest 8: Verify all table types created');
    const expectedTables = ['leads', 'runs', 'content_queue', 'hoa_contacts'];
    let allTablesExist = true;

    for (const entity of expectedTables) {
      const tableName = campaignTableManager.getTableName(campaign1Slug, entity);
      const tables = all(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [tableName]);

      if (tables.length === 0) {
        console.log(`  ✗ Table missing: ${tableName}`);
        allTablesExist = false;
      }
    }

    if (allTablesExist) {
      console.log(`  ✓ All table types exist for campaign 1`);
      console.log(`     - ${campaign1Slug}_leads`);
      console.log(`     - ${campaign1Slug}_runs`);
      console.log(`     - ${campaign1Slug}_content_queue`);
      console.log(`     - ${campaign1Slug}_hoa_contacts`);
      passed++;
    } else {
      console.log('  ✗ Some tables are missing');
      failed++;
    }

    // Test 9: Record counts
    console.log('\nTest 9: Get record counts');
    const counts1 = campaignTableManager.getRecordCounts(campaign1Slug);
    const counts2 = campaignTableManager.getRecordCounts(campaign2Slug);

    if (counts1.leads === 1 && counts2.leads === 1) {
      console.log('  ✓ Record counts match expectations');
      console.log(`     Campaign 1: ${counts1.leads} leads`);
      console.log(`     Campaign 2: ${counts2.leads} leads`);
      passed++;
    } else {
      console.log('  ✗ Record counts incorrect');
      failed++;
    }

    // Cleanup
    console.log('\n🧹 Cleanup');
    await campaignTableManager.dropCampaignTables(campaign1Slug);
    await campaignTableManager.dropCampaignTables(campaign2Slug);
    console.log('  ✓ Test tables dropped\n');

    // Summary
    console.log('='.repeat(50));
    console.log('TEST SUMMARY');
    console.log('='.repeat(50));
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Total:  ${passed + failed}`);
    console.log('='.repeat(50) + '\n');

    if (failed === 0) {
      console.log('✅ All tests passed! Table isolation working correctly.\n');
      console.log('✨ Campaign-specific tables provide complete data isolation.');
      console.log('   Each campaign has its own independent data storage.\n');
    } else {
      console.log(`❌ ${failed} test(s) failed. Review output above.\n`);
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
testTableIsolation();
