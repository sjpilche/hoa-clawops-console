/**
 * Local Webhook Test Script
 * Test your webhook endpoint before deploying to production
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3001/api/facebook';
const VERIFY_TOKEN = '275dbc1475d3c003cd378de4adf7be9e5a6ba3a29ca91a6b2cf329c2ad30d794';

async function testVerification() {
  console.log('\n🔍 Test 1: Webhook Verification (GET request)');
  console.log('=' .repeat(60));

  try {
    const response = await axios.get(`${BASE_URL}/webhook`, {
      params: {
        'hub.mode': 'subscribe',
        'hub.verify_token': VERIFY_TOKEN,
        'hub.challenge': 'test_challenge_1234'
      }
    });

    if (response.data === 'test_challenge_1234') {
      console.log('✅ Verification PASSED');
      console.log('   Facebook would accept this webhook endpoint');
      return true;
    } else {
      console.log('❌ Verification FAILED');
      console.log(`   Expected: test_challenge_1234`);
      console.log(`   Got: ${response.data}`);
      return false;
    }
  } catch (error) {
    console.error('❌ Verification request failed:', error.message);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data:`, error.response.data);
    }
    return false;
  }
}

async function testWrongToken() {
  console.log('\n🔒 Test 2: Wrong Verify Token (should fail)');
  console.log('=' .repeat(60));

  try {
    const response = await axios.get(`${BASE_URL}/webhook`, {
      params: {
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong_token',
        'hub.challenge': 'test_challenge'
      },
      validateStatus: () => true // Don't throw on 403
    });

    if (response.status === 403) {
      console.log('✅ Security check PASSED');
      console.log('   Webhook correctly rejects wrong verify token');
      return true;
    } else {
      console.log('❌ Security check FAILED');
      console.log(`   Expected 403 status, got ${response.status}`);
      return false;
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

async function testWebhookEvent() {
  console.log('\n📥 Test 3: Simulated Webhook Event (POST request)');
  console.log('=' .repeat(60));
  console.log('⚠️  Note: This will create a test lead in your database');

  // Simulate a Facebook webhook payload
  const webhookPayload = {
    object: 'page',
    entry: [
      {
        id: '1001233166403710',
        time: Date.now(),
        changes: [
          {
            field: 'leadgen',
            value: {
              leadgen_id: 'test_lead_' + Date.now(),
              form_id: 'test_form_123',
              page_id: '1001233166403710',
              created_time: Math.floor(Date.now() / 1000)
            }
          }
        ]
      }
    ]
  };

  try {
    const response = await axios.post(`${BASE_URL}/webhook`, webhookPayload, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 200 && response.data === 'EVENT_RECEIVED') {
      console.log('✅ Webhook event ACCEPTED');
      console.log('   Server acknowledged the event');
      console.log('\n⚠️  Note: The actual lead data fetch might fail because');
      console.log('   the lead ID is fake. Check server logs for details.');
      return true;
    } else {
      console.log('❌ Unexpected response');
      console.log(`   Status: ${response.status}`);
      console.log(`   Data:`, response.data);
      return false;
    }
  } catch (error) {
    console.error('❌ Webhook event test failed:', error.message);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data:`, error.response.data);
    }
    return false;
  }
}

async function runTests() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║     Facebook Webhook Local Test Suite                  ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  console.log('\nPrerequisites:');
  console.log('  ✓ Server running on http://localhost:3001');
  console.log('  ✓ Webhook endpoints configured');
  console.log(`  ✓ Verify token: ${VERIFY_TOKEN.substring(0, 20)}...`);

  const results = {
    verification: await testVerification(),
    security: await testWrongToken(),
    event: await testWebhookEvent()
  };

  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║     Test Results Summary                                ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  console.log(`  Verification Test:  ${results.verification ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Security Test:      ${results.security ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Event Test:         ${results.event ? '✅ PASS' : '❌ FAIL'}`);

  const allPassed = results.verification && results.security && results.event;

  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('🎉 ALL TESTS PASSED!');
    console.log('\nYour webhook endpoint is ready for Facebook!');
    console.log('\nNext steps:');
    console.log('1. Make your server publicly accessible (ngrok, Render, Railway)');
    console.log('2. Configure webhook in Facebook: FACEBOOK_WEBHOOK_SETUP.md');
    console.log('3. Subscribe to page leadgen events');
  } else {
    console.log('⚠️  SOME TESTS FAILED');
    console.log('\nPlease check:');
    console.log('1. Is your server running? (npm run dev)');
    console.log('2. Is FACEBOOK_WEBHOOK_VERIFY_TOKEN in .env.local?');
    console.log('3. Check server logs for errors');
  }
  console.log('='.repeat(60) + '\n');
}

// Check if server is running before tests
async function checkServer() {
  try {
    await axios.get('http://localhost:3001/api/health', { timeout: 3000 });
    return true;
  } catch (error) {
    console.error('\n❌ Cannot connect to server at http://localhost:3001');
    console.error('   Please start your server first: npm run dev\n');
    return false;
  }
}

// Run
(async () => {
  const serverRunning = await checkServer();
  if (serverRunning) {
    await runTests();
  }
})();
