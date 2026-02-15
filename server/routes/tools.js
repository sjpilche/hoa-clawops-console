/**
 * @file tools.js (routes)
 * @description MCP tool catalog endpoints.
 *
 * ENDPOINTS:
 *   GET  /api/tools                  — List all tools
 *   GET  /api/tools/categories       — List tool categories
 *   GET  /api/tools/by-category/:cat — List tools by category
 *   GET  /api/tools/:id              — Get tool details
 */

const { Router } = require('express');
const { get, all } = require('../db/connection');
const { authenticate } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const extensionSync = require('../services/extensionSync');

const router = Router();
router.use(authenticate);

/**
 * GET /api/tools
 * List all tools, optionally filtered by extension or search query.
 */
router.get('/', (req, res, next) => {
  try {
    const { extension_id, search, category } = req.query;

    let tools;
    if (extension_id) {
      tools = extensionSync.getExtensionTools(extension_id);
    } else if (category) {
      tools = extensionSync.getToolsByCategory(category);
    } else {
      tools = extensionSync.getAllTools();
    }

    // Apply search filter if provided
    if (search) {
      const term = search.toLowerCase();
      tools = tools.filter(t =>
        t.name.toLowerCase().includes(term) ||
        (t.display_name && t.display_name.toLowerCase().includes(term)) ||
        (t.description && t.description.toLowerCase().includes(term))
      );
    }

    res.json({ tools, total: tools.length });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/tools/categories
 * List all tool categories with counts.
 */
router.get('/categories', (_req, res, next) => {
  try {
    const categories = all(
      `SELECT category, COUNT(*) as count
       FROM tools
       WHERE category IS NOT NULL
       GROUP BY category
       ORDER BY count DESC`
    );
    res.json({ categories });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/tools/by-category/:category
 * List tools in a specific category.
 */
router.get('/by-category/:category', (req, res, next) => {
  try {
    const tools = extensionSync.getToolsByCategory(req.params.category);
    res.json({ tools });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/tools/:id
 * Get tool details.
 */
router.get('/:id', (req, res, next) => {
  try {
    const tool = get(
      `SELECT t.*, e.name as extension_name, e.domain_id
       FROM tools t
       JOIN extensions e ON t.extension_id = e.id
       WHERE t.id = ?`,
      [req.params.id]
    );

    if (!tool) {
      throw new AppError('Tool not found', 'TOOL_NOT_FOUND', 404);
    }

    res.json({ tool });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
