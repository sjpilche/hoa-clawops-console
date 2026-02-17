/**
 * @file mockOpenClaw.js
 * @description Mock OpenClaw responses for development/testing
 *
 * TEMPORARY: Use this until Claude Code CLI is properly installed
 */

/**
 * Simulates an OpenClaw agent run
 * @param {string} agentId - Agent ID
 * @param {Object} options - Run options
 * @returns {Promise<Object>} Mock response
 */
async function runAgent(agentId, options) {
  const { message, sessionId } = options;

  console.log(`[MockOpenClaw] Simulating agent run: ${agentId}`);
  console.log(`[MockOpenClaw] Message: ${message}`);
  console.log(`[MockOpenClaw] Session: ${sessionId}`);

  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Return a mock successful response
  return {
    success: true,
    sessionId,
    status: 'completed',
    output: `🤖 **Mock Agent Response**\n\nThis is a simulated response from agent \`${agentId}\`.\n\n**Your message was:** "${message}"\n\n**What I would do:**\n- Process your request\n- Execute the agent's instructions\n- Return real results\n\n**To enable real agents:**\n1. Install Claude Code CLI in WSL2: \`npm install -g @anthropic-ai/claude-code\`\n2. Or configure the OpenClaw gateway\n\n*This is a development mock. Real agent execution is not yet configured.*`,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: 2000,
  };
}

/**
 * Test if OpenClaw is available
 * @returns {Promise<boolean>}
 */
async function testConnection() {
  console.log('[MockOpenClaw] Using mock mode - OpenClaw CLI not installed');
  return false; // Always false since this is a mock
}

/**
 * Check if OpenClaw is connected
 * @returns {boolean}
 */
function isConnected() {
  return false; // Mock is never "really" connected
}

module.exports = {
  runAgent,
  testConnection,
  isConnected,
  mode: 'mock',
};
