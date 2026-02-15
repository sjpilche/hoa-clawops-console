/**
 * @file runs.js (routes)
 * @description Agent run management endpoints.
 * Mostly scaffolded for Phase 3 — the OpenClaw bridge will populate these.
 *
 * ENDPOINTS:
 *   GET  /api/runs           — List recent runs
 *   GET  /api/runs/:id       — Get run details
 *   POST /api/runs/:id/stop  — Stop a running agent (Phase 3)
 */

const { Router } = require('express');
const { all, get } = require('../db/connection');
const { authenticate } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { validateParams, validateQuery } = require('../middleware/validator');
const { runIdParamSchema, listRunsQuerySchema } = require('../schemas');

const router = Router();
router.use(authenticate);

/**
 * GET /api/runs?limit=50&agent_id=xxx&status=running
 * List recent runs with optional filtering
 */
router.get('/', validateQuery(listRunsQuerySchema), (req, res, next) => {
  try {
    const { limit, offset, agent_id, status, start_date, end_date } = req.validated.query;

    let query = 'SELECT runs.*, agents.name AS agent_name FROM runs LEFT JOIN agents ON runs.agent_id = agents.id WHERE 1=1';
    const params = [];

    // Apply filters
    if (agent_id) {
      query += ' AND runs.agent_id = ?';
      params.push(agent_id);
    }

    if (status) {
      query += ' AND runs.status = ?';
      params.push(status);
    }

    if (start_date) {
      query += ' AND runs.created_at >= ?';
      params.push(start_date);
    }

    if (end_date) {
      query += ' AND runs.created_at <= ?';
      params.push(end_date);
    }

    query += ' ORDER BY runs.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const runs = all(query, params);
    res.json({ runs, limit, offset });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/runs/:id
 * Get detailed information about a specific run
 */
router.get('/:id', validateParams(runIdParamSchema), (req, res, next) => {
  try {
    const runId = req.validated.params.id;
    const run = get('SELECT * FROM runs WHERE id = ?', [runId]);
    if (!run) {
      throw new AppError(`Run with ID "${runId}" not found.`, 'RUN_NOT_FOUND', 404);
    }
    res.json({ run });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
