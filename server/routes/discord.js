/**
 * @file discord.js
 * @description Express routes for Discord integration.
 *
 * GET  /api/discord/status   — Bot connection status
 * POST /api/discord/message  — Send a message to a Discord channel via webhook
 * POST /api/discord/test     — Send a test notification
 */

'use strict';

const express = require('express');
const { authenticate: authenticateToken } = require('../middleware/auth');
const { notifyRunCompleted } = require('../services/discordNotifier');

const router = express.Router();

// All discord routes require authentication
router.use(authenticateToken);

/**
 * GET /api/discord/status
 * Returns current Discord bot connection status.
 * The openclaw-discord extension sets globalThis.__discordBotInfo when connected.
 */
router.get('/status', (_req, res) => {
  const botInfo = (globalThis).__discordBotInfo;

  if (botInfo?.connected) {
    res.json({
      connected: true,
      bot: {
        id: botInfo.id,
        username: botInfo.username,
      },
      notifyChannelId: botInfo.notifyChannelId || null,
      webhookConfigured: Boolean(process.env.DISCORD_WEBHOOK_URL),
      enabled: process.env.DISCORD_ENABLED === 'true',
    });
  } else {
    res.json({
      connected: false,
      webhookConfigured: Boolean(process.env.DISCORD_WEBHOOK_URL),
      enabled: process.env.DISCORD_ENABLED === 'true',
      message: 'Discord bot not connected. Ensure openclaw-discord extension is installed and DISCORD_BOT_TOKEN is set.',
    });
  }
});

/**
 * POST /api/discord/test
 * Sends a test notification to the configured notify channel.
 * Body: {} (no body needed)
 */
router.post('/test', (req, res) => {
  if (process.env.DISCORD_ENABLED !== 'true') {
    return res.status(400).json({ error: 'DISCORD_ENABLED is not set to true in .env.local' });
  }
  if (!process.env.DISCORD_WEBHOOK_URL) {
    return res.status(400).json({ error: 'DISCORD_WEBHOOK_URL is not set in .env.local' });
  }

  notifyRunCompleted({
    agentName: 'ClawOps System',
    status: 'completed',
    outputText: '🎉 Discord integration is working! Your agent runs will now post here.',
    durationMs: 0,
    costUsd: 0,
    runId: 'test',
  });

  res.json({ success: true, message: 'Test notification sent to Discord webhook.' });
});

/**
 * POST /api/discord/message
 * Send a custom message via the Discord webhook.
 * Body: { content: string }
 */
router.post('/message', (req, res) => {
  const { content } = req.body || {};

  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'content (string) is required' });
  }
  if (!process.env.DISCORD_WEBHOOK_URL) {
    return res.status(400).json({ error: 'DISCORD_WEBHOOK_URL not configured' });
  }

  // Re-use the notifyRunCompleted approach but with a plain message
  const https = require('https');
  const http = require('http');

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  const payload = JSON.stringify({ content: content.slice(0, 2000) });
  const url = new URL(webhookUrl);
  const isHttps = url.protocol === 'https:';
  const lib = isHttps ? https : http;

  const options = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname + url.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  };

  const reqOut = lib.request(options, (resp) => {
    resp.resume();
    if (resp.statusCode >= 200 && resp.statusCode < 300) {
      res.json({ success: true });
    } else {
      res.status(502).json({ error: `Discord returned ${resp.statusCode}` });
    }
  });

  reqOut.on('error', (err) => {
    res.status(502).json({ error: err.message });
  });

  reqOut.write(payload);
  reqOut.end();
});

module.exports = router;
