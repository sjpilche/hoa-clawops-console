/**
 * Facebook Integration Test Script
 * Run this to test your Facebook Lead Generation setup
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3001/api';

// Test credentials - update these with your actual login
const TEST_USER = {
  email: 'admin@clawops.local',
  password: 'changeme123'
};

let authToken = null;

async function login() {
  console.log('\n🔐 Step 1: Logging in...');
  try {
    const response = await axios.post(`${BASE_URL}/auth/login`, TEST_USER);
    authToken = response.data.token;
    console.log('✅ Login successful');
    console.log(`   User: ${response.data.user.email}`);
    return true;
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
    return false;
  }
}

async function testConnection() {
  console.log('\n🔌 Step 2: Testing Facebook API connection...');
  try {
    const response = await axios.get(`${BASE_URL}/facebook/test`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    if (response.data.success) {
      console.log('✅ Facebook API connected successfully');
      console.log(`   Page: ${response.data.page.name} (ID: ${response.data.page.id})`);
    } else {
      console.log('❌ Facebook API connection failed');
      console.log(`   Error: ${response.data.error}`);
    }
    return response.data.success;
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    return false;
  }
}

async function listForms() {
  console.log('\n📋 Step 3: Listing lead forms...');
  try {
    const response = await axios.get(`${BASE_URL}/facebook/forms`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    const forms = response.data.forms;
    console.log(`✅ Found ${forms.length} lead form(s)`);

    forms.forEach((form, index) => {
      console.log(`\n   Form ${index + 1}:`);
      console.log(`   - ID: ${form.id}`);
      console.log(`   - Name: ${form.name}`);
      console.log(`   - Status: ${form.status}`);
      console.log(`   - Leads: ${form.leads_count || 0}`);
    });

    return forms;
  } catch (error) {
    console.error('❌ Failed to list forms:', error.response?.data || error.message);
    return [];
  }
}

async function syncLeads() {
  console.log('\n🔄 Step 4: Syncing leads...');
  try {
    const response = await axios.post(`${BASE_URL}/facebook/sync`, {}, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    console.log('✅ Sync completed');
    console.log(`   Forms synced: ${response.data.forms}`);
    console.log(`   New leads: ${response.data.newLeads}`);

    return response.data;
  } catch (error) {
    console.error('❌ Sync failed:', error.response?.data || error.message);
    return null;
  }
}

async function checkStatus() {
  console.log('\n📊 Step 5: Checking integration status...');
  try {
    const response = await axios.get(`${BASE_URL}/facebook/status`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    const status = response.data;
    console.log('✅ Status retrieved');
    console.log(`   Configured: ${status.configured ? 'Yes' : 'No'}`);
    console.log(`   Polling active: ${status.isPolling ? 'Yes' : 'No'}`);
    console.log(`   Poll interval: ${status.pollInterval / 1000} seconds`);
    console.log(`   Page ID: ${status.pageId}`);

    return status;
  } catch (error) {
    console.error('❌ Status check failed:', error.response?.data || error.message);
    return null;
  }
}

async function startPolling() {
  console.log('\n▶️  Step 6: Starting automatic polling...');
  try {
    const response = await axios.post(`${BASE_URL}/facebook/polling/start`, {}, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    console.log('✅ Polling started');
    console.log('   The system will now check for new leads every 5 minutes');

    return true;
  } catch (error) {
    console.error('❌ Failed to start polling:', error.response?.data || error.message);
    return false;
  }
}

async function runTests() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║   Facebook Lead Generation Integration Test           ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  // Step 1: Login
  const loginSuccess = await login();
  if (!loginSuccess) {
    console.log('\n❌ Cannot proceed without login. Please check your credentials.');
    return;
  }

  // Step 2: Test connection
  const connectionSuccess = await testConnection();
  if (!connectionSuccess) {
    console.log('\n⚠️  WARNING: Facebook API connection failed.');
    console.log('   This usually means:');
    console.log('   1. Your access token has expired');
    console.log('   2. Your access token doesn\'t have the right permissions');
    console.log('   3. There\'s a network issue');
    console.log('\n   Please check docs/FACEBOOK-INTEGRATION.md for troubleshooting.');
  }

  // Step 3: List forms
  const forms = await listForms();

  // Step 4: Sync leads
  await syncLeads();

  // Step 5: Check status
  await checkStatus();

  // Step 6: Start polling (optional)
  console.log('\n❓ Do you want to start automatic polling?');
  console.log('   This will check for new leads every 5 minutes.');
  console.log('   You can stop it later with: POST /api/facebook/polling/stop');

  // Uncomment the line below to auto-start polling
  // await startPolling();

  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║   Test Complete!                                       ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  if (connectionSuccess) {
    console.log('\n✅ Your Facebook integration is working correctly!');
    console.log('\nNext steps:');
    console.log('1. To start automatic polling: POST /api/facebook/polling/start');
    console.log('2. View documentation: docs/FACEBOOK-INTEGRATION.md');
    console.log('3. Check all integrations: THIRD_PARTY_INTEGRATIONS.md');
  } else {
    console.log('\n⚠️  Your integration needs attention.');
    console.log('   Please follow the troubleshooting steps in docs/FACEBOOK-INTEGRATION.md');
  }
}

// Run the tests
runTests().catch(error => {
  console.error('\n💥 Unexpected error:', error);
  process.exit(1);
});
