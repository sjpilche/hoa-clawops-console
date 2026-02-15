/**
 * Test running an actual OpenClaw agent
 */
require('dotenv').config({ path: '.env.local' });

const openclawBridge = require('./server/services/openclawBridge');

async function testAgentRun() {
  console.log('🤖 Testing OpenClaw Agent Run...\n');

  try {
    // Test a simple agent run
    console.log('Running agent with message: "What is 2+2? Be brief."');

    const result = await openclawBridge.runAgent('test-agent-123', {
      message: 'What is 2+2? Answer in one sentence.',
      sessionId: 'test-session-' + Date.now(),
      json: false,
    });

    console.log('\n✅ Agent run completed!');
    console.log('Session ID:', result.sessionId);
    console.log('Status:', result.status);
    console.log('Started:', result.startedAt);
    console.log('Completed:', result.completedAt);
    console.log('\n--- Agent Output ---');
    console.log(result.output);
    console.log('---  End Output ---\n');

  } catch (error) {
    console.error('❌ Agent run failed:', error.message);
  } finally {
    setTimeout(() => {
      openclawBridge.disconnect();
      process.exit(0);
    }, 1000);
  }
}

testAgentRun();
