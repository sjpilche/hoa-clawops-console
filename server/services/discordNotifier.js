/**
 * @file discordNotifier.js
 * @description Fire-and-forget Discord webhook notifications for agent run completions.
 *
 * Uses Discord Incoming Webhooks — no bot token required on the server side.
 * Set DISCORD_WEBHOOK_URL and DISCORD_ENABLED=true in .env.local to activate.
 *
 * Called from:
 *   - postProcessor.js (LLM agent completions)
 *   - runs.js (special handler completions)
 */

'use strict';

const https = require('https');
const http = require('http');

/**
 * Post a JSON payload to a Discord webhook URL.
 * @param {string} webhookUrl
 * @param {object} body
 * @returns {Promise<void>}
 */
function postWebhook(webhookUrl, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
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
        'User-Agent': 'ClawOps/1.0',
      },
    };

    const req = lib.request(options, (res) => {
      // Consume response body to free the socket
      res.resume();
      if (res.statusCode >= 200 && res.statusCode < 300) {
        resolve();
      } else {
        reject(new Error(`Discord webhook returned ${res.statusCode}`));
      }
    });

    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy(new Error('Discord webhook timed out'));
    });
    req.write(payload);
    req.end();
  });
}

/**
 * Truncate text to maxLen, appending '…' if cut.
 */
function truncate(text, maxLen) {
  if (!text) return '';
  return text.length > maxLen ? text.slice(0, maxLen - 1) + '…' : text;
}

/**
 * Notify Discord that an agent run completed (or failed).
 *
 * @param {object} opts
 * @param {string}  opts.agentName
 * @param {'completed'|'failed'} opts.status
 * @param {string}  [opts.outputText]
 * @param {number}  [opts.durationMs]
 * @param {number}  [opts.costUsd]
 * @param {string}  [opts.runId]
 * @param {string}  [opts.errorMsg]
 */
function notifyRunCompleted({ agentName, status, outputText, durationMs, costUsd, runId, errorMsg } = {}) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl || process.env.DISCORD_ENABLED !== 'true') return;

  const succeeded = status === 'completed';
  const color = succeeded ? 0x57f287 : 0xed4245; // green / red
  const emoji = succeeded ? '✅' : '❌';

  const fields = [];

  if (durationMs != null) {
    fields.push({ name: 'Duration', value: `${Math.round(durationMs / 1000)}s`, inline: true });
  }
  if (costUsd != null) {
    fields.push({ name: 'Cost', value: `$${Number(costUsd).toFixed(4)}`, inline: true });
  }
  if (runId) {
    fields.push({ name: 'Run ID', value: `\`${runId}\``, inline: true });
  }

  const description = succeeded
    ? truncate(outputText || '_No output_', 500)
    : truncate(errorMsg || '_Unknown error_', 500);

  const embed = {
    title: `${emoji} ${agentName}`,
    color,
    description,
    fields,
    timestamp: new Date().toISOString(),
    footer: { text: 'ClawOps' },
  };

  // Fire-and-forget — never block the run pipeline
  postWebhook(webhookUrl, { embeds: [embed] }).catch((err) => {
    console.warn('[DiscordNotifier] Webhook failed (non-fatal):', err.message);
  });
}

module.exports = { notifyRunCompleted };
