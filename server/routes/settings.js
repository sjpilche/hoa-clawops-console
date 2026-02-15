/**
 * @file settings.js (routes)
 * @description System configuration endpoints.
 *
 * ENDPOINTS:
 *   GET  /api/settings     — Get all settings
 *   PUT  /api/settings/:key — Update a setting
 */

const { Router } = require('express');
const { all, get, run } = require('../db/connection');
const { authenticate } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { validateParams, validateMultiple } = require('../middleware/validator');
const { settingKeyParamSchema, updateSettingSchema } = require('../schemas');

const router = Router();
router.use(authenticate);

/**
 * GET /api/settings
 * Get all system settings
 */
router.get('/', (_req, res, next) => {
  try {
    const settings = all('SELECT * FROM settings ORDER BY key ASC');
    // Convert to key-value map for easier frontend consumption
    const settingsMap = {};
    for (const s of settings) {
      settingsMap[s.key] = { value: s.value, description: s.description };
    }
    res.json({ settings: settingsMap });
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

      const existing = get('SELECT * FROM settings WHERE key = ?', [key]);
      if (!existing) {
        throw new AppError(`Setting "${key}" not found.`, 'SETTING_NOT_FOUND', 404);
      }

      run('UPDATE settings SET value = ?, updated_at = datetime(\'now\') WHERE key = ?', [
        String(value),
        key,
      ]);

      res.json({ key, value: String(value) });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
