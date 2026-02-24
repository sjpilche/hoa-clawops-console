/**
 * @file test.js (routes)
 * @description TEST ENDPOINTS - No auth required, for development only
 *
 * These endpoints bypass authentication to test core functionality.
 * DELETE OR DISABLE IN PRODUCTION!
 */

const { Router } = require('express');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const openclawBridge = require('../services/openclawBridge');
const { getChatResponse, analyzeMessageIntent } = require('../services/chatService');
const { run, get } = require('../db/connection');

const router = Router();

/**
 * GET /api/test/ping
 * Simple health check
 */
router.get('/ping', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Test endpoint is working',
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/test/run-agent
 * Test agent run WITHOUT authentication
 *
 * Request body: { message: "Your task here" }
 */
router.post('/run-agent', async (req, res, next) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        error: 'Message is required',
        example: { message: 'What is 2+2?' },
      });
    }

    console.log(`[TEST] Running agent with message: "${message}"`);

    const sessionId = `test-${Date.now()}`;

    // Run the agent via OpenClaw bridge
    const result = await openclawBridge.runAgent('test-agent', {
      message,
      sessionId,
      json: false,
    });

    res.json({
      success: true,
      message: 'Agent completed successfully',
      session: {
        id: result.sessionId,
        status: result.status,
        startedAt: result.startedAt,
        completedAt: result.completedAt,
      },
      output: result.output,
    });
  } catch (error) {
    console.error('[TEST] Agent run failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
    });
  }
});

/**
 * GET /api/test/openclaw-status
 * Check if OpenClaw is available
 */
router.get('/openclaw-status', async (req, res) => {
  try {
    const connected = await openclawBridge.testConnection();
    res.json({
      connected,
      mode: openclawBridge.mode,
      isConnected: openclawBridge.isConnected(),
    });
  } catch (error) {
    res.status(500).json({
      connected: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/test/chat
 * Fast ChatGPT responses (no browser automation)
 *
 * Request body: { message, history }
 */
router.post('/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body;

    if (!message) {
      return res.status(400).json({
        error: 'Message is required',
      });
    }

    // Get AI response
    const response = await getChatResponse(message, history);

    // Analyze if this should use agent mode instead
    const analysis = await analyzeMessageIntent(message);

    res.json({
      response,
      mode: 'chat',
      recommendation: analysis.recommendedMode !== 'chat' && analysis.confidence === 'high'
        ? analysis
        : null,
    });
  } catch (error) {
    console.error('[TEST] Chat failed:', error);
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * POST /api/test/stop-all
 * Emergency kill switch - stop ALL running agents
 */
router.post('/stop-all', async (req, res) => {
  try {
    console.log('[TEST] 🛑 KILL SWITCH ACTIVATED');

    // Kill switch: OpenClaw CLI processes are short-lived, no persistent sessions to stop
    console.log('[TEST] Kill switch: no persistent sessions in CLI mode');
    res.json({
      success: true,
      message: 'Kill switch acknowledged (CLI mode — agents are process-based)',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[TEST] Kill switch failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/test/create-admin
 * Force create/update admin user for testing
 */
router.post('/create-admin', (req, res) => {
  try {
    const email = process.env.DEFAULT_ADMIN_EMAIL || 'admin@clawops.local';
    const password = process.env.DEFAULT_ADMIN_PASSWORD || 'changeme123';

    // Check if user exists
    const existing = get('SELECT id FROM users WHERE email = ?', [email]);

    if (existing) {
      // Update password
      const hashedPassword = bcrypt.hashSync(password, 12);
      run('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, email]);

      res.json({
        success: true,
        message: 'Admin user password updated',
        email,
        action: 'updated',
      });
    } else {
      // Create new user
      const hashedPassword = bcrypt.hashSync(password, 12);
      const userId = uuidv4();
      run(
        'INSERT INTO users (id, email, password, name, role) VALUES (?, ?, ?, ?, ?)',
        [userId, email, hashedPassword, 'Admin', 'admin']
      );

      res.json({
        success: true,
        message: 'Admin user created',
        email,
        action: 'created',
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
    });
  }
});

module.exports = router;
