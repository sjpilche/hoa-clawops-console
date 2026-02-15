/**
 * Test Schedule API endpoints
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3001/api';

async function testScheduleAPI() {
  console.log('🧪 Testing Schedule Management API');
  console.log('='.repeat(60) + '\n');

  try {
    // Test 1: List all schedules
    console.log('Test 1: GET /api/schedules - List all schedules');
    try {
      const response = await axios.get(`${BASE_URL}/schedules`);
      console.log('✅ Status:', response.status);
      console.log('   Response:', JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.log('❌ Error:', error.response?.data || error.message);
    }
    console.log('');

    // Test 2: Check if agents endpoint works
    console.log('Test 2: GET /api/agents - Verify agents exist');
    try {
      const response = await axios.get(`${BASE_URL}/agents`);
      console.log('✅ Status:', response.status);
      console.log('   Found', response.data.agents?.length || 0, 'agents');

      if (response.data.agents && response.data.agents.length > 0) {
        const firstAgent = response.data.agents[0];
        console.log('   First agent:', {
          id: firstAgent.id,
          name: firstAgent.name,
          has_openclaw_id: !!JSON.parse(firstAgent.config || '{}').openclaw_id
        });
      }
    } catch (error) {
      console.log('❌ Error:', error.response?.data || error.message);
    }
    console.log('');

    // Test 3: Test contacts API
    console.log('Test 3: GET /api/contacts/test - Test contact database connection');
    try {
      const response = await axios.get(`${BASE_URL}/contacts/test`);
      console.log('✅ Status:', response.status);
      console.log('   Response:', JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.log('❌ Error:', error.response?.data || error.message);
    }
    console.log('');

    // Test 4: Get contact stats
    console.log('Test 4: GET /api/contacts/stats - Get database statistics');
    try {
      const response = await axios.get(`${BASE_URL}/contacts/stats`);
      console.log('✅ Status:', response.status);
      console.log('   Stats:', JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.log('❌ Error:', error.response?.data || error.message);
    }
    console.log('');

    console.log('='.repeat(60));
    console.log('✅ API structure tests complete!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

testScheduleAPI().catch(console.error);
