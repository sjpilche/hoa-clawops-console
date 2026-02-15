/**
 * @file hierarchies.js (routes)
 * @description Agent hierarchy management endpoints.
 *
 * ENDPOINTS:
 *   GET    /api/hierarchies                    — Get all hierarchies
 *   GET    /api/hierarchies/domain/:domainId   — Get hierarchy for domain
 *   GET    /api/hierarchies/tree/:domainId     — Get tree structure
 *   POST   /api/hierarchies                    — Create hierarchy relationship
 *   PUT    /api/hierarchies/:id                — Update relationship
 *   DELETE /api/hierarchies/:id                — Delete relationship
 */

const { Router } = require('express');
const { all } = require('../db/connection');
const { authenticate } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { validateBody } = require('../middleware/validator');
const { createHierarchySchema, updateHierarchySchema } = require('../schemas');
const hierarchyManager = require('../services/hierarchyManager');

const router = Router();
router.use(authenticate);

/**
 * GET /api/hierarchies
 * Get all hierarchies, optionally filtered by domain.
 */
router.get('/', (req, res, next) => {
  try {
    const { domain_id } = req.query;
    let hierarchies;

    if (domain_id) {
      hierarchies = hierarchyManager.getDomainHierarchies(domain_id);
    } else {
      hierarchies = all(
        `SELECT h.*, a.name as agent_name, a.status as agent_status,
                a.orchestration_role, p.name as parent_name
         FROM agent_hierarchies h
         JOIN agents a ON h.agent_id = a.id
         LEFT JOIN agents p ON h.parent_id = p.id
         ORDER BY h.domain_id, h.layer, h.order_index`
      );
    }

    res.json({ hierarchies });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/hierarchies/domain/:domainId
 * Get hierarchies for a specific domain.
 */
router.get('/domain/:domainId', (req, res, next) => {
  try {
    const hierarchies = hierarchyManager.getDomainHierarchies(req.params.domainId);
    res.json({ hierarchies });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/hierarchies/tree/:domainId
 * Get nested tree structure for a domain.
 */
router.get('/tree/:domainId', (req, res, next) => {
  try {
    const tree = hierarchyManager.buildHierarchyTree(req.params.domainId);
    res.json({ tree });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/hierarchies
 * Create a hierarchy relationship.
 */
router.post('/', validateBody(createHierarchySchema.shape.body), (req, res, next) => {
  try {
    const data = req.validated.body;

    // Validate no cycle
    if (data.parent_id && !hierarchyManager.validateNoCycle(data.agent_id, data.parent_id)) {
      throw new AppError(
        'This relationship would create a cycle in the hierarchy',
        'HIERARCHY_CYCLE',
        400
      );
    }

    const hierarchy = hierarchyManager.createHierarchy(data);
    res.status(201).json({ hierarchy });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/hierarchies/:id
 * Update a hierarchy relationship.
 */
router.put('/:id', validateBody(updateHierarchySchema.shape.body), (req, res, next) => {
  try {
    const data = req.validated.body;

    // Validate no cycle if parent is changing
    if (data.parent_id !== undefined) {
      const existing = require('../db/connection').get(
        'SELECT agent_id FROM agent_hierarchies WHERE id = ?',
        [req.params.id]
      );
      if (existing && data.parent_id && !hierarchyManager.validateNoCycle(existing.agent_id, data.parent_id)) {
        throw new AppError(
          'This relationship would create a cycle in the hierarchy',
          'HIERARCHY_CYCLE',
          400
        );
      }
    }

    const hierarchy = hierarchyManager.updateHierarchy(req.params.id, data);
    if (!hierarchy) {
      throw new AppError('Hierarchy relationship not found', 'HIERARCHY_NOT_FOUND', 404);
    }
    res.json({ hierarchy });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/hierarchies/:id
 * Delete a hierarchy relationship.
 */
router.delete('/:id', (req, res, next) => {
  try {
    hierarchyManager.deleteHierarchy(req.params.id);
    res.json({ message: 'Hierarchy relationship deleted', id: req.params.id });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
