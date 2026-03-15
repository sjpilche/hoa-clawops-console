/**
 * @file qa.js (routes)
 * @description Ralph QA API — view QA queue, stats, and re-review items.
 *
 * ENDPOINTS:
 *   GET  /api/qa/stats          — QA queue summary stats
 *   GET  /api/qa/queue          — Pending QA items
 *   POST /api/qa/:id/review     — Re-review a specific outreach sequence
 *   POST /api/qa/:id/override   — Manual override (Steve approves despite QA failure)
 */

const { Router } = require('express');
const { all, get, run } = require('../db/connection');
const { authenticate } = require('../middleware/auth');
const ralph = require('../services/ralphQA');

const router = Router();
router.use(authenticate);

/** GET /api/qa/stats */
router.get('/stats', (req, res, next) => {
  try {
    const stats = ralph.getQAStats();
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

/** GET /api/qa/queue?type=outreach|content&status=pending|failed */
router.get('/queue', (req, res, next) => {
  try {
    const type = req.query.type || 'outreach';
    const status = req.query.status || 'pending';
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);

    let items;
    if (type === 'outreach') {
      const qaFilter = status === 'pending' ? "(s.qa_status IS NULL OR s.qa_status = 'pending')" : `s.qa_status = '${status === 'failed' ? 'failed' : 'passed'}'`;
      items = all(
        `SELECT s.id, s.lead_id, s.email_subject, s.email_body, s.status, s.qa_status, s.qa_score, s.qa_notes, s.qa_reviewed_at, s.angle_type, s.source_agent, s.created_at,
                l.company_name, l.contact_name, l.contact_email
         FROM cfo_outreach_sequences s
         LEFT JOIN cfo_leads l ON s.lead_id = l.id
         WHERE ${qaFilter} AND s.status IN ('draft', 'flagged')
         ORDER BY s.created_at DESC LIMIT ?`,
        [limit]
      );
    } else {
      const qaFilter = status === 'pending' ? "(c.qa_status IS NULL OR c.qa_status = 'pending')" : `c.qa_status = '${status === 'failed' ? 'failed' : 'passed'}'`;
      items = all(
        `SELECT c.id, c.title, c.pillar, c.channel, c.status, c.qa_status, c.qa_score, c.qa_notes, c.qa_reviewed_at, c.source_agent, c.created_at
         FROM cfo_content_pieces c
         WHERE ${qaFilter} AND c.status = 'draft'
         ORDER BY c.created_at DESC LIMIT ?`,
        [limit]
      );
    }

    res.json({ type, status, items, count: items.length });
  } catch (error) {
    next(error);
  }
});

/** POST /api/qa/:id/review — Re-run Ralph QA on a specific outreach sequence */
router.post('/:id/review', (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const result = ralph.reviewSingleOutreach(id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/** POST /api/qa/:id/override — Steve manually approves despite QA failure */
router.post('/:id/override', (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const seq = get('SELECT * FROM cfo_outreach_sequences WHERE id = ?', [id]);
    if (!seq) return res.status(404).json({ error: 'Sequence not found' });

    run(
      `UPDATE cfo_outreach_sequences SET qa_status = 'passed', qa_notes = COALESCE(qa_notes, '') || ' | MANUAL OVERRIDE by Steve', qa_reviewed_at = datetime('now'), status = 'draft' WHERE id = ?`,
      [id]
    );

    res.json({ id, qa_status: 'passed', overridden: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
