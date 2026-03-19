/**
 * @file dreamTeam.js
 * @description API routes for Dream Team scorecard data
 *
 * Endpoints:
 *   GET /api/dream-team/scorecards         — Scorecards list (filterable by days, agent)
 *   GET /api/dream-team/scorecards/latest  — Most recent scorecard per agent with trend data
 */

'use strict';

const { Router } = require('express');
const { all } = require('../db/connection');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

// ═══════════════════════════════════════════════════════════════════════════
// SCORECARDS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/dream-team/scorecards
 * Query dt_scorecards table with optional filters.
 * Query params: days (default 7), agent_name (optional)
 */
router.get('/scorecards', (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const agent_name = req.query.agent_name || null;

    let query = `
      SELECT *
      FROM dt_scorecards
      WHERE score_date >= date('now', '-' || ? || ' days')
    `;
    const params = [days];

    if (agent_name) {
      query += ' AND agent_name = ?';
      params.push(agent_name);
    }

    query += ' ORDER BY score_date DESC, agent_name ASC';

    const scorecards = all(query, params);
    res.json({ success: true, scorecards });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/dream-team/scorecards/latest
 * Returns the most recent scorecard per agent with trend arrow data.
 */
router.get('/scorecards/latest', (req, res, next) => {
  try {
    const scorecards = all(`
      SELECT s.*
      FROM dt_scorecards s
      INNER JOIN (
        SELECT agent_name, MAX(score_date) AS max_date
        FROM dt_scorecards
        GROUP BY agent_name
      ) latest ON s.agent_name = latest.agent_name AND s.score_date = latest.max_date
      ORDER BY s.agent_name ASC
    `);

    res.json({ success: true, scorecards });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
