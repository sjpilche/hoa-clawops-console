/**
 * @file autoApproval.js (routes)
 * @description Auto-approval configuration and monitoring endpoints.
 *
 * ENDPOINTS:
 *   GET  /api/auto-approval/config    — Current thresholds, enabled state, circuit breaker
 *   PUT  /api/auto-approval/config    — Update thresholds / toggle enabled
 *   GET  /api/auto-approval/activity  — Recent auto-approval decisions
 *   GET  /api/auto-approval/stats     — Rates and counts
 *   POST /api/auto-approval/pause     — Emergency kill switch
 *   POST /api/auto-approval/resume    — Re-enable after pause
 */

'use strict';

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { run, get } = require('../db/connection');
const engine = require('../services/autoApprovalEngine');

const router = Router();
router.use(authenticate);

/**
 * GET /api/auto-approval/config
 */
router.get('/config', (_req, res) => {
  const stats = engine.getAutoApprovalStats();
  res.json({
    enabled: stats.enabled,
    paused: stats.paused,
    qaThreshold: stats.qaThreshold,
    dailyCap: stats.dailyCap,
    bounceThreshold: stats.bounceThreshold,
    circuitBreaker: stats.circuitBreaker,
  });
});

/**
 * PUT /api/auto-approval/config
 * Body: { enabled?, qaThreshold?, dailyCap?, bounceThreshold? }
 */
router.put('/config', (req, res) => {
  const { enabled, qaThreshold, dailyCap, bounceThreshold } = req.body;

  const settingMap = {
    auto_approval_enabled: enabled,
    auto_approval_qa_threshold: qaThreshold,
    auto_approval_daily_cap: dailyCap,
    auto_approval_bounce_threshold: bounceThreshold,
  };

  const updated = [];
  for (const [key, value] of Object.entries(settingMap)) {
    if (value === undefined || value === null) continue;
    try {
      run(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [key, String(value)]
      );
      updated.push(key);
    } catch (err) {
      return res.status(500).json({ error: `Failed to update ${key}: ${err.message}` });
    }
  }

  // If enabling, also unpause
  if (enabled === true || enabled === 'true') {
    engine.resumeAutoApproval();
  }

  res.json({ updated, config: engine.getAutoApprovalStats() });
});

/**
 * GET /api/auto-approval/activity
 */
router.get('/activity', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const activity = engine.getRecentActivity(Math.min(limit, 100));
  res.json({ activity, total: activity.length });
});

/**
 * GET /api/auto-approval/stats
 */
router.get('/stats', (_req, res) => {
  res.json(engine.getAutoApprovalStats());
});

/**
 * POST /api/auto-approval/pause
 */
router.post('/pause', (req, res) => {
  const reason = req.body.reason || 'Manual pause via API';
  engine.pauseAutoApproval(reason);
  res.json({ success: true, paused: true, reason });
});

/**
 * POST /api/auto-approval/resume
 */
router.post('/resume', (_req, res) => {
  engine.resumeAutoApproval();
  res.json({ success: true, paused: false });
});

module.exports = router;
