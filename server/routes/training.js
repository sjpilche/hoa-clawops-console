/**
 * @file training.js (routes)
 * @description Idle Training System API — stats, sessions, skills, manual trigger.
 */

const { Router } = require('express');
const { all, get } = require('../db/connection');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

/**
 * GET /api/training/stats — Dashboard summary
 */
router.get('/stats', (req, res, next) => {
  try {
    const { getTrainingStats, getSystemCapacity } = require('../services/idleTrainer');
    const stats = getTrainingStats();
    const capacity = getSystemCapacity();
    res.json({ ...stats, capacity });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/training/sessions?limit=20 — Recent training sessions
 */
router.get('/sessions', (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const sessions = all(
      `SELECT * FROM training_sessions ORDER BY created_at DESC LIMIT ?`,
      [limit]
    );
    res.json({ sessions });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/training/skills — All agent skills with levels
 */
router.get('/skills', (req, res, next) => {
  try {
    const agentId = req.query.agent_id;
    let skills;
    if (agentId) {
      skills = all('SELECT * FROM agent_skills WHERE agent_id = ? ORDER BY skill_level DESC', [agentId]);
    } else {
      skills = all('SELECT * FROM agent_skills ORDER BY skill_level DESC, agent_name');
    }
    res.json({ skills });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/training/leaderboard — Top agents by total skill points
 */
router.get('/leaderboard', (req, res, next) => {
  try {
    const leaderboard = all(`
      SELECT agent_name, agent_id,
             COUNT(*) AS skills_count,
             SUM(skill_level) AS total_points,
             MAX(skill_level) AS max_level,
             SUM(times_trained) AS total_sessions
      FROM agent_skills
      GROUP BY agent_id
      ORDER BY total_points DESC
      LIMIT 20
    `);
    res.json({ leaderboard });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/training/capacity — Current system capacity + gate check
 */
router.get('/capacity', (req, res, next) => {
  try {
    const { getSystemCapacity, checkTrainingGates } = require('../services/idleTrainer');
    const capacity = getSystemCapacity();
    const gates = checkTrainingGates();
    res.json({ ...capacity, gates });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/training/candidates?status=candidate&limit=50 — Skill candidates pipeline
 */
router.get('/candidates', (req, res, next) => {
  try {
    const status = req.query.status || null;
    const limit = parseInt(req.query.limit) || 50;

    let query = 'SELECT * FROM skill_candidates';
    const params = [];

    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const candidates = all(query, params);

    // Also return summary counts
    const qa = require('../services/trainingQA');
    const stats = qa.getCandidateStats();

    res.json({ candidates, stats });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/training/queue?status=pending — Training queue
 */
router.get('/queue', (req, res, next) => {
  try {
    const status = req.query.status || 'pending';
    const limit = parseInt(req.query.limit) || 50;

    const items = all(
      'SELECT * FROM training_queue WHERE status = ? ORDER BY priority DESC, created_at ASC LIMIT ?',
      [status, limit]
    );

    const counts = all(
      'SELECT status, COUNT(*) AS count FROM training_queue GROUP BY status'
    );

    res.json({ items, counts });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/training/benchmarks?agent_id=xxx — Benchmark results
 */
router.get('/benchmarks', (req, res, next) => {
  try {
    const agentId = req.query.agent_id;
    const limit = parseInt(req.query.limit) || 50;

    let benchmarks;
    if (agentId) {
      benchmarks = all(
        'SELECT * FROM training_benchmarks WHERE agent_id = ? ORDER BY measured_at DESC LIMIT ?',
        [agentId, limit]
      );
    } else {
      benchmarks = all(
        'SELECT * FROM training_benchmarks ORDER BY measured_at DESC LIMIT ?',
        [limit]
      );
    }

    res.json({ benchmarks });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
