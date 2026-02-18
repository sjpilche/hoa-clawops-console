/**
 * @file settings.js (routes)
 * @description System configuration endpoints.
 *
 * ENDPOINTS:
 *   GET  /api/settings       — Get all settings as key-value map
 *   PUT  /api/settings       — Bulk upsert multiple settings at once
 *   PUT  /api/settings/:key  — Update a single setting by key
 */

const { Router } = require('express');
const { all, get, run } = require('../db/connection');
const { authenticate } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { validateMultiple } = require('../middleware/validator');
const { settingKeyParamSchema, updateSettingSchema } = require('../schemas');

const router = Router();
router.use(authenticate);

// All valid setting keys — used for bulk upsert validation
const VALID_KEYS = new Set([
  'max_concurrent_agents',
  'max_cost_per_run',
  'max_duration_per_run',
  'max_tokens_per_run',
  'max_runs_per_hour',
  'data_retention_days',
  'domain_allowlist',
  'openclaw_api_url',
  'openclaw_mode',
  'pii_masking_enabled',
  'log_level',
  'enable_audit_logging',
  'cost_warning_threshold',
  'enable_cost_warnings',
  'default_model',
  'notification_email',
  'slack_webhook_url',
]);

// Seed any missing keys with defaults (called once on module load)
function ensureDefaultSettings() {
  const defaults = [
    ['openclaw_mode', 'openai', 'OpenClaw execution mode (openai, shell)'],
    ['log_level', 'info', 'Server log verbosity (error, warn, info, debug)'],
    ['enable_audit_logging', 'true', 'Log all agent actions to audit trail'],
    ['enable_cost_warnings', 'true', 'Show warnings when approaching cost limits'],
    ['cost_warning_threshold', '2.00', 'Warn when run cost exceeds this amount (USD)'],
    ['default_model', 'gpt-4o', 'Default LLM model for new agents'],
    ['notification_email', '', 'Email address for system alerts'],
    ['slack_webhook_url', '', 'Slack webhook URL for agent notifications'],
  ];
  for (const [key, value, description] of defaults) {
    try {
      run(
        'INSERT OR IGNORE INTO settings (key, value, description) VALUES (?, ?, ?)',
        [key, value, description]
      );
    } catch { /* ignore */ }
  }
}

// Seed on startup
try { ensureDefaultSettings(); } catch { /* db may not be ready yet — will retry on first request */ }

/**
 * GET /api/settings
 * Get all system settings
 */
router.get('/', (_req, res, next) => {
  try {
    // Ensure defaults exist (idempotent)
    try { ensureDefaultSettings(); } catch { /* ignore */ }

    const rows = all('SELECT * FROM settings ORDER BY key ASC');
    const settingsMap = {};
    for (const s of rows) {
      settingsMap[s.key] = { value: s.value, description: s.description, updated_at: s.updated_at };
    }
    res.json({ settings: settingsMap });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/settings
 * Bulk upsert multiple settings at once.
 * Body: { key1: value1, key2: value2, ... }
 */
router.put('/', (req, res, next) => {
  try {
    const updates = req.body;
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
      return res.status(400).json({ error: 'Body must be a key-value object of settings' });
    }

    const saved = [];
    const errors = [];

    for (const [key, value] of Object.entries(updates)) {
      if (!VALID_KEYS.has(key)) {
        errors.push(`Unknown setting key: ${key}`);
        continue;
      }
      try {
        run(
          `INSERT INTO settings (key, value, updated_at)
           VALUES (?, ?, datetime('now'))
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
          [key, String(value)]
        );
        saved.push(key);
      } catch (err) {
        errors.push(`Failed to save ${key}: ${err.message}`);
      }
    }

    res.json({ saved, errors });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/settings/:key
 * Update a specific setting by key
 */
router.put(
  '/:key',
  validateMultiple({
    params: settingKeyParamSchema,
    body: updateSettingSchema,
  }),
  (req, res, next) => {
    try {
      const key = req.validated.params.key;
      const { value } = req.validated.body;

      // Upsert — insert if not exists, update if exists
      run(
        `INSERT INTO settings (key, value, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [key, String(value)]
      );

      res.json({ key, value: String(value) });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
