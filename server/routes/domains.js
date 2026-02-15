/**
 * @file domains.js (routes)
 * @description Business domain management endpoints.
 *
 * ENDPOINTS:
 *   GET    /api/domains                    — List all domains
 *   GET    /api/domains/:id                — Get domain details + stats
 *   POST   /api/domains                    — Create new domain
 *   PUT    /api/domains/:id                — Update domain
 *   DELETE /api/domains/:id                — Delete domain
 *   GET    /api/domains/:id/agents         — List agents in domain
 *   POST   /api/domains/:id/test-connection — Test database connection
 */

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { validateBody } = require('../middleware/validator');
const { createDomainSchema, updateDomainSchema } = require('../schemas');
const domainManager = require('../services/domainManager');

const router = Router();
router.use(authenticate);

/**
 * GET /api/domains
 * List all domains with stats.
 */
router.get('/', (_req, res, next) => {
  try {
    const domains = domainManager.getAllDomains();
    const domainsWithStats = domains.map(d => ({
      ...d,
      stats: domainManager.getDomainStats(d.id),
    }));
    res.json({ domains: domainsWithStats });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/domains/:id
 * Get domain details with stats.
 */
router.get('/:id', (req, res, next) => {
  try {
    const domain = domainManager.getDomain(req.params.id);
    if (!domain) {
      throw new AppError('Domain not found', 'DOMAIN_NOT_FOUND', 404);
    }
    domain.stats = domainManager.getDomainStats(domain.id);
    res.json({ domain });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/domains
 * Create a new domain.
 */
router.post('/', validateBody(createDomainSchema.shape.body), (req, res, next) => {
  try {
    const domain = domainManager.createDomain(req.validated.body);
    res.status(201).json({ domain });
  } catch (error) {
    if (error.message?.includes('UNIQUE constraint')) {
      throw new AppError('A domain with this name already exists', 'DOMAIN_EXISTS', 409);
    }
    next(error);
  }
});

/**
 * PUT /api/domains/:id
 * Update a domain.
 */
router.put('/:id', validateBody(updateDomainSchema.shape.body), (req, res, next) => {
  try {
    const existing = domainManager.getDomain(req.params.id);
    if (!existing) {
      throw new AppError('Domain not found', 'DOMAIN_NOT_FOUND', 404);
    }
    const domain = domainManager.updateDomain(req.params.id, req.validated.body);
    res.json({ domain });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/domains/:id
 * Delete a domain. Agents are unlinked (not deleted).
 */
router.delete('/:id', (req, res, next) => {
  try {
    const existing = domainManager.getDomain(req.params.id);
    if (!existing) {
      throw new AppError('Domain not found', 'DOMAIN_NOT_FOUND', 404);
    }
    domainManager.deleteDomain(req.params.id);
    res.json({ message: 'Domain deleted', id: req.params.id });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/domains/:id/agents
 * List agents belonging to a domain.
 */
router.get('/:id/agents', (req, res, next) => {
  try {
    const existing = domainManager.getDomain(req.params.id);
    if (!existing) {
      throw new AppError('Domain not found', 'DOMAIN_NOT_FOUND', 404);
    }
    const agents = domainManager.getDomainAgents(req.params.id);
    res.json({ agents });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/domains/:id/test-connection
 * Test external database connection for a domain.
 */
router.post('/:id/test-connection', async (req, res, next) => {
  try {
    const existing = domainManager.getDomain(req.params.id);
    if (!existing) {
      throw new AppError('Domain not found', 'DOMAIN_NOT_FOUND', 404);
    }
    const result = await domainManager.testDatabaseConnection(req.params.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
