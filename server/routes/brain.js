/**
 * @file brain.js
 * @description Collective Brain API — visibility into the cross-agent learning system.
 *
 * GET  /api/brain/stats           — Dashboard stats across all 4 layers
 * GET  /api/brain/observations    — Recent shared observations (Layer 1)
 * GET  /api/brain/feedback        — Recent feedback signals (Layer 2)
 * GET  /api/brain/episodes        — Best episodes by market (Layer 3)
 * GET  /api/brain/knowledge       — Knowledge base contents (Layer 4)
 * POST /api/brain/distill         — Trigger manual distillation run
 * POST /api/brain/feedback        — Manually record a feedback signal
 */

'use strict';

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const brain = require('../services/collectiveBrain');

const router = Router();
router.use(authenticate);

/**
 * GET /api/brain/stats
 * Overview dashboard — counts across all 4 layers.
 */
router.get('/stats', async (req, res, next) => {
  try {
    const stats = await brain.getStats();
    res.json({ stats });
  } catch (err) { next(err); }
});

/**
 * GET /api/brain/observations?session_id=&type=&limit=50
 */
router.get('/observations', async (req, res, next) => {
  try {
    const { session_id, type, limit = 50 } = req.query;
    const types = type ? [type] : [];
    const obs = await brain.getObservations(session_id || '', types, parseInt(limit));
    res.json({ observations: obs, total: obs.length });
  } catch (err) { next(err); }
});

/**
 * GET /api/brain/feedback?agent=&signal=&limit=20
 */
router.get('/feedback', async (req, res, next) => {
  try {
    const { agent, limit = 20 } = req.query;
    const sql = require('mssql');
    const pool = await brain.getPool ? brain.getPool() : null;

    // Direct query since getStats is aggregate-only
    if (!pool) return res.json({ feedback: [] });

    const req2 = pool.request().input('limit', sql.Int, parseInt(limit));
    let query = 'SELECT TOP (@limit) * FROM agent_feedback';
    if (agent) {
      req2.input('agent', sql.NVarChar, agent);
      query += ' WHERE agent_name = @agent';
    }
    query += ' ORDER BY created_at DESC';
    const result = await req2.query(query);
    res.json({ feedback: result.recordset, total: result.recordset.length });
  } catch (err) { next(err); }
});

/**
 * GET /api/brain/episodes?market=&min_score=0.5&limit=20
 */
router.get('/episodes', async (req, res, next) => {
  try {
    const { market, erp, min_score = 0, limit = 20 } = req.query;
    const episodes = await brain.getSimilarEpisodes({
      market:      market  || undefined,
      erpContext:  erp     || undefined,
      minScore:    parseFloat(min_score),
      limit:       parseInt(limit),
    });
    res.json({ episodes, total: episodes.length });
  } catch (err) { next(err); }
});

/**
 * GET /api/brain/knowledge?type=outreach_email&market=&limit=20
 */
router.get('/knowledge', async (req, res, next) => {
  try {
    const { type = 'outreach_email', market, erp, limit = 20 } = req.query;
    const examples = await brain.getKnowledgeExamples(type, {
      market:     market || undefined,
      erpContext: erp    || undefined,
      limit:      parseInt(limit),
    });
    res.json({ examples, total: examples.length });
  } catch (err) { next(err); }
});

/**
 * POST /api/brain/distill
 * Manually trigger the distillation job (runs nightly automatically).
 */
router.post('/distill', async (req, res, next) => {
  try {
    const result = await brain.runDistillation();
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

/**
 * POST /api/brain/feedback
 * Manually record a feedback signal.
 * Body: { agent_name, output_type, output_id, signal, notes, market }
 */
router.post('/feedback', async (req, res, next) => {
  try {
    const { agent_name, output_type, output_id, signal, notes, market } = req.body;
    if (!agent_name || !signal) return res.status(400).json({ error: 'agent_name and signal required' });
    brain.recordFeedback(agent_name, output_type || 'manual', output_id, signal, { notes, market });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
