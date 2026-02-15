/**
 * @file teams.js (routes)
 * @description Agent team management endpoints.
 *
 * ENDPOINTS:
 *   GET    /api/teams                      — List all teams
 *   GET    /api/teams/:id                  — Get team details
 *   POST   /api/teams                      — Create team
 *   PUT    /api/teams/:id                  — Update team
 *   DELETE /api/teams/:id                  — Delete team
 *   POST   /api/teams/:id/members          — Add team member
 *   DELETE /api/teams/:id/members/:agentId — Remove member
 */

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { validateBody } = require('../middleware/validator');
const { createTeamSchema, updateTeamSchema, addTeamMemberSchema } = require('../schemas');
const hierarchyManager = require('../services/hierarchyManager');

const router = Router();
router.use(authenticate);

/**
 * GET /api/teams
 * List all teams, optionally filtered by domain.
 */
router.get('/', (req, res, next) => {
  try {
    const { domain_id } = req.query;
    const teams = hierarchyManager.getAllTeams(domain_id || null);
    res.json({ teams });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/teams/:id
 * Get team details with members.
 */
router.get('/:id', (req, res, next) => {
  try {
    const team = hierarchyManager.getTeam(req.params.id);
    if (!team) {
      throw new AppError('Team not found', 'TEAM_NOT_FOUND', 404);
    }
    res.json({ team });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/teams
 * Create a new team.
 */
router.post('/', validateBody(createTeamSchema.shape.body), (req, res, next) => {
  try {
    const team = hierarchyManager.createTeam(req.validated.body);
    res.status(201).json({ team });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/teams/:id
 * Update a team.
 */
router.put('/:id', validateBody(updateTeamSchema.shape.body), (req, res, next) => {
  try {
    const existing = hierarchyManager.getTeam(req.params.id);
    if (!existing) {
      throw new AppError('Team not found', 'TEAM_NOT_FOUND', 404);
    }
    const team = hierarchyManager.updateTeam(req.params.id, req.validated.body);
    res.json({ team });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/teams/:id
 * Delete a team.
 */
router.delete('/:id', (req, res, next) => {
  try {
    const existing = hierarchyManager.getTeam(req.params.id);
    if (!existing) {
      throw new AppError('Team not found', 'TEAM_NOT_FOUND', 404);
    }
    hierarchyManager.deleteTeam(req.params.id);
    res.json({ message: 'Team deleted', id: req.params.id });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/teams/:id/members
 * Add an agent to a team.
 */
router.post('/:id/members', validateBody(addTeamMemberSchema.shape.body), (req, res, next) => {
  try {
    const existing = hierarchyManager.getTeam(req.params.id);
    if (!existing) {
      throw new AppError('Team not found', 'TEAM_NOT_FOUND', 404);
    }
    const { agent_id, role, order_index } = req.validated.body;
    const team = hierarchyManager.addTeamMember(req.params.id, agent_id, role, order_index);
    res.json({ team });
  } catch (error) {
    if (error.message?.includes('UNIQUE constraint')) {
      next(new AppError('Agent is already a member of this team', 'DUPLICATE_MEMBER', 409));
    } else {
      next(error);
    }
  }
});

/**
 * DELETE /api/teams/:id/members/:agentId
 * Remove an agent from a team.
 */
router.delete('/:id/members/:agentId', (req, res, next) => {
  try {
    const existing = hierarchyManager.getTeam(req.params.id);
    if (!existing) {
      throw new AppError('Team not found', 'TEAM_NOT_FOUND', 404);
    }
    const team = hierarchyManager.removeTeamMember(req.params.id, req.params.agentId);
    res.json({ team });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
