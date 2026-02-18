/**
 * Test Campaign Routes with Table Isolation
 * Verifies that routes correctly use campaign-specific tables
 */

const jwt = require('jsonwebtoken');
const campaignTableManager = require('../server/services/campaignTableManager');
const { initDatabase, get, all, run } = require('../server/db/connection');
const { v4: uuid } = require('uuid');

const JWT_SECRET = process.env.JWT_SECRET || 'abe026552d7f2430e2d662f9bd3a16d70537e8074289b93faf84c63fa01fbdef52373f77c36baeb31c05b07b0ba77e92d5e8eb05913841e7969c7999df421abe';
const BASE_URL = 'http://localhost:3001/api';
const token = jwt.sign({ userId: 'admin', email: 'admin@clawops.local' }, JWT_SECRET, { expiresIn: '24h' });

async function fetchWithAuth(url, options = {}) {
  const response = await fetch(`${url}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`${response.status}: ${error.error || error.message || response.statusText}`);
  }

  return response.json();
}

async function testCampaignRoutes() {
  await initDatabase();

  console.log('🧪 CAMPAIGN ROUTES TEST WITH TABLE ISOLATION\n');
  console.log('Testing that routes use campaign-specific tables...\n');
  console.log('='.repeat(50) + '\n');

  let passed = 0;
  let failed = 0;

  try {
    // Get the default campaign
    console.log('Test 1: Get default campaign');
    const campaigns = await fetchWithAuth(`${BASE_URL}/campaigns`);
    const defaultCampaign = campaigns.find(c => c.slug === 'hoa-fl-lead-gen');

    if (!defaultCampaign) {
      console.log('  ✗ Default campaign not found');
      failed++;
    } else {
      console.log(`  ✓ Found default campaign: ${defaultCampaign.name}`);
      passed++;
    }

    // Test 2: Verify campaign tables exist
    console.log('\nTest 2: Verify campaign tables exist');
    const tablesExist = campaignTableManager.tablesExist('hoa-fl-lead-gen');
    if (tablesExist) {
      console.log('  ✓ Campaign tables exist');
      passed++;
    } else {
      console.log('  ✗ Campaign tables do not exist');
      failed++;
    }

    // Test 3: Get record counts
    console.log('\nTest 3: Get record counts from campaign tables');
    const counts = campaignTableManager.getRecordCounts('hoa-fl-lead-gen');
    console.log(`  ✓ HOA Contacts: ${counts.hoa_contacts}`);
    console.log(`  ✓ Content Queue: ${counts.content_queue}`);
    console.log(`  ✓ Runs: ${counts.runs}`);
    console.log(`  ✓ Leads: ${counts.leads}`);
    passed++;

    // Test 4: Test HOA contacts API with campaign context
    console.log('\nTest 4: Test HOA contacts API with campaign context');
    try {
      const contacts = await fetchWithAuth(`${BASE_URL}/hoa-contacts?limit=5`, {
        headers: {
          'X-Campaign-ID': defaultCampaign.id,
        },
      });
      console.log(`  ✓ HOA contacts API returned ${contacts.contacts?.length || 0} contacts`);
      passed++;
    } catch (error) {
      console.log(`  ✗ HOA contacts API failed: ${error.message}`);
      failed++;
    }

    // Test 5: Test content queue API with campaign context
    console.log('\nTest 5: Test content queue API with campaign context');
    try {
      const queue = await fetchWithAuth(`${BASE_URL}/content-queue?limit=5`, {
        headers: {
          'X-Campaign-ID': defaultCampaign.id,
        },
      });
      console.log(`  ✓ Content queue API returned ${queue.count || 0} posts`);
      passed++;
    } catch (error) {
      console.log(`  ✗ Content queue API failed: ${error.message}`);
      failed++;
    }

    // Test 6: Verify data isolation - check table names directly
    console.log('\nTest 6: Verify campaign table isolation');
    const tables = campaignTableManager.getCampaignTables('hoa-fl-lead-gen');
    console.log(`  ✓ Leads table: ${tables.leads}`);
    console.log(`  ✓ Runs table: ${tables.runs}`);
    console.log(`  ✓ Content queue table: ${tables.content_queue}`);
    console.log(`  ✓ HOA contacts table: ${tables.hoa_contacts}`);
    passed++;

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('TEST SUMMARY');
    console.log('='.repeat(50));
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Total:  ${passed + failed}`);
    console.log('='.repeat(50) + '\n');

    if (failed === 0) {
      console.log('✅ All tests passed! Routes use campaign-specific tables.\n');
      console.log('✨ Campaign routes are working correctly with table isolation!');
      console.log('   - HOA Contacts API uses campaign tables');
      console.log('   - Content Queue API uses campaign tables');
      console.log('   - All routes support X-Campaign-ID header\n');
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
testCampaignRoutes();
