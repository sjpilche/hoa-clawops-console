/**
 * @file extensions.js (routes)
 * @description OpenClaw extension management endpoints.
 *
 * ENDPOINTS:
 *   GET    /api/extensions                — List all extensions
 *   GET    /api/extensions/:id            — Get extension details
 *   POST   /api/extensions/sync           — Sync from OpenClaw
 *   PUT    /api/extensions/:id/config     — Update extension configuration
 *   POST   /api/extensions/:id/enable     — Enable extension
 *   POST   /api/extensions/:id/disable    — Disable extension
 *   GET    /api/extensions/:id/tools      — List tools from extension
 */

const { Router } = require('express');
const { run } = require('../db/connection');
const { authenticate } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { validateBody } = require('../middleware/validator');
const { updateExtensionConfigSchema } = require('../schemas');
const extensionSync = require('../services/extensionSync');

const router = Router();
router.use(authenticate);

/**
 * GET /api/extensions
 * List all extensions.
 */
router.get('/', (_req, res, next) => {
  try {
    const extensions = extensionSync.getAllExtensions();
    res.json({ extensions });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/extensions/:id
 * Get extension details.
 */
router.get('/:id', (req, res, next) => {
  try {
    const extension = extensionSync.getExtension(req.params.id);
    if (!extension) {
      throw new AppError('Extension not found', 'EXTENSION_NOT_FOUND', 404);
    }
    // Include tools
    extension.tools = extensionSync.getExtensionTools(req.params.id);
    res.json({ extension });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/extensions/sync
 * Sync all extensions from OpenClaw.
 */
router.post('/sync', async (_req, res, next) => {
  try {
    const result = await extensionSync.syncExtensions();
    res.json({
      message: 'Sync complete',
      extensions: result.extensions,
      tools: result.tools,
      errors: result.errors,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/extensions/:id/config
 * Update extension configuration and optionally assign to domain.
 */
router.put(
  '/:id/config',
  validateBody(updateExtensionConfigSchema.shape.body),
  (req, res, next) => {
    try {
      const extension = extensionSync.getExtension(req.params.id);
      if (!extension) {
        throw new AppError('Extension not found', 'EXTENSION_NOT_FOUND', 404);
      }

      const updates = [];
      const params = [];

      if (req.validated.body.config !== undefined) {
        updates.push('config = ?');
        params.push(JSON.stringify(req.validated.body.config));
      }
      if (req.validated.body.domain_id !== undefined) {
        updates.push('domain_id = ?');
        params.push(req.validated.body.domain_id);
      }

      if (updates.length > 0) {
        updates.push("updated_at = datetime('now')");
        params.push(req.params.id);
        run(`UPDATE extensions SET ${updates.join(', ')} WHERE id = ?`, params);
      }

      const updated = extensionSync.getExtension(req.params.id);
      res.json({ extension: updated });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/extensions/:id/enable
 * Enable an extension.
 */
router.post('/:id/enable', (req, res, next) => {
  try {
    const extension = extensionSync.getExtension(req.params.id);
    if (!extension) {
      throw new AppError('Extension not found', 'EXTENSION_NOT_FOUND', 404);
    }
    run("UPDATE extensions SET enabled = 1, status = 'active', updated_at = datetime('now') WHERE id = ?", [req.params.id]);
    res.json({ message: 'Extension enabled', id: req.params.id });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/extensions/:id/disable
 * Disable an extension.
 */
router.post('/:id/disable', (req, res, next) => {
  try {
    const extension = extensionSync.getExtension(req.params.id);
    if (!extension) {
      throw new AppError('Extension not found', 'EXTENSION_NOT_FOUND', 404);
    }
    run("UPDATE extensions SET enabled = 0, status = 'inactive', updated_at = datetime('now') WHERE id = ?", [req.params.id]);
    res.json({ message: 'Extension disabled', id: req.params.id });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/extensions/:id/tools
 * List tools provided by an extension.
 */
router.get('/:id/tools', (req, res, next) => {
  try {
    const extension = extensionSync.getExtension(req.params.id);
    if (!extension) {
      throw new AppError('Extension not found', 'EXTENSION_NOT_FOUND', 404);
    }
    const tools = extensionSync.getExtensionTools(req.params.id);
    res.json({ tools });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
