/**
 * Quick test script to verify OpenClaw Gateway connection
 */
require('dotenv').config({ path: '.env.local' });

const openclawBridge = require('./server/services/openclawBridge');

async function testConnection() {
  console.log('🔌 Testing OpenClaw Bridge Connection...\n');
  console.log(`Gateway URL: ${process.env.OPENCLAW_GATEWAY_URL}`);
  console.log(`Token: ${process.env.OPENCLAW_GATEWAY_TOKEN ? '✓ Set' : '✗ Not set'}\n`);

  try {
    // Test connection
    console.log('Connecting to gateway...');
    const connected = await openclawBridge.testConnection();

    if (connected) {
      console.log('✅ Successfully connected to OpenClaw Gateway!\n');

      // Check if it's truly connected
      if (openclawBridge.isConnected()) {
        console.log('✅ WebSocket connection is active\n');
      }

      // Try to list agents
      console.log('Fetching available agents...');
      const agents = await openclawBridge.listAgents();
      console.log(`Found ${agents.length} agents:`, agents);
    } else {
      console.log('❌ Failed to connect to gateway\n');
    }
  } catch (error) {
    console.error('❌ Connection test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    // Cleanup
    setTimeout(() => {
      openclawBridge.disconnect();
      process.exit(0);
    }, 1000);
  }
}

testConnection();
