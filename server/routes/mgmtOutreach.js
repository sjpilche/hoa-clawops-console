/**
 * @file mgmtOutreach.js
 * @description HOA management company outreach email queue API.
 *
 * ENDPOINTS:
 *   GET    /api/mgmt-outreach/stats          — Queue stats + total contacts with email
 *   GET    /api/mgmt-outreach/queue          — List queue (filter by status)
 *   POST   /api/mgmt-outreach/build          — Build queue from management_companies
 *   POST   /api/mgmt-outreach/approve-all    — Approve all pending
 *   POST   /api/mgmt-outreach/send           — Send all approved
 *   POST   /api/mgmt-outreach/:id/approve    — Approve one
 *   POST   /api/mgmt-outreach/:id/skip       — Skip one
 *   POST   /api/mgmt-outreach/:id/send-one   — Send one (must be approved)
 *   DELETE /api/mgmt-outreach/:id            — Remove from queue
 */

const express = require('express');
const router = express.Router();
const { all, get, run } = require('../db/connection');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// ─── GET /api/mgmt-outreach/stats ────────────────────────────────────────────

router.get('/stats', (req, res) => {
  try {
    const { getStats } = require('../services/mgmtEmailSender');
    const stats = getStats();
    const sgStatus = require('../services/sendgrid').status();
    res.json({ success: true, stats, sendgrid: sgStatus });
  } catch (err) {
    console.error('[MgmtOutreach] stats error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/mgmt-outreach/queue ────────────────────────────────────────────

router.get('/queue', (req, res) => {
  try {
    const { status = 'all', limit = 200, offset = 0 } = req.query;

    let sql = 'SELECT * FROM mgmt_outreach_queue WHERE 1=1';
    const params = [];

    if (status !== 'all') {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY CASE status WHEN \'pending\' THEN 1 WHEN \'approved\' THEN 2 WHEN \'failed\' THEN 3 WHEN \'sent\' THEN 4 ELSE 5 END, signal_score DESC, id ASC';
    sql += ' LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const items = all(sql, params);

    const countRow = get(
      `SELECT COUNT(*) as total FROM mgmt_outreach_queue${status !== 'all' ? ' WHERE status = ?' : ''}`,
      status !== 'all' ? [status] : []
    );

    res.json({ success: true, items, total: countRow?.total || 0 });
  } catch (err) {
    console.error('[MgmtOutreach] queue list error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/mgmt-outreach/build ───────────────────────────────────────────

router.post('/build', async (req, res) => {
  try {
    const { limit = 200 } = req.body;
    const { buildQueue } = require('../services/mgmtEmailSender');
    console.log(`[MgmtOutreach] Building queue (limit=${limit})...`);
    const result = await buildQueue(parseInt(limit));
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[MgmtOutreach] build error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/mgmt-outreach/approve-all ─────────────────────────────────────

router.post('/approve-all', (req, res) => {
  try {
    const result = run(
      `UPDATE mgmt_outreach_queue SET status='approved', approved_at=datetime('now'), updated_at=datetime('now') WHERE status='pending'`,
      []
    );
    const count = result.changes || 0;
    console.log(`[MgmtOutreach] Approved ${count} pending emails`);
    res.json({ success: true, approved: count });
  } catch (err) {
    console.error('[MgmtOutreach] approve-all error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/mgmt-outreach/send ────────────────────────────────────────────

router.post('/send', async (req, res) => {
  try {
    const { sendBatch } = require('../services/mgmtEmailSender');
    console.log('[MgmtOutreach] Starting batch send...');
    const result = await sendBatch();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[MgmtOutreach] send error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/mgmt-outreach/:id/approve ─────────────────────────────────────

router.post('/:id/approve', (req, res) => {
  try {
    const { id } = req.params;
    const item = get('SELECT id, status FROM mgmt_outreach_queue WHERE id = ?', [id]);
    if (!item) return res.status(404).json({ success: false, error: 'Not found' });
    if (item.status === 'sent') return res.status(400).json({ success: false, error: 'Already sent' });

    run(
      `UPDATE mgmt_outreach_queue SET status='approved', approved_at=datetime('now'), updated_at=datetime('now') WHERE id=?`,
      [id]
    );
    res.json({ success: true, id, status: 'approved' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/mgmt-outreach/:id/skip ────────────────────────────────────────

router.post('/:id/skip', (req, res) => {
  try {
    const { id } = req.params;
    const item = get('SELECT id FROM mgmt_outreach_queue WHERE id = ?', [id]);
    if (!item) return res.status(404).json({ success: false, error: 'Not found' });

    run(
      `UPDATE mgmt_outreach_queue SET status='skipped', updated_at=datetime('now') WHERE id=?`,
      [id]
    );
    res.json({ success: true, id, status: 'skipped' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/mgmt-outreach/:id/send-one ────────────────────────────────────

router.post('/:id/send-one', async (req, res) => {
  try {
    const { id } = req.params;
    const item = get('SELECT id, status, contact_email FROM mgmt_outreach_queue WHERE id = ?', [id]);
    if (!item) return res.status(404).json({ success: false, error: 'Not found' });
    if (item.status === 'sent') return res.status(400).json({ success: false, error: 'Already sent' });

    // Auto-approve if still pending so sendOne doesn't reject it
    if (item.status === 'pending') {
      run(
        `UPDATE mgmt_outreach_queue SET status='approved', approved_at=datetime('now'), updated_at=datetime('now') WHERE id=?`,
        [id]
      );
    }

    const { sendOne } = require('../services/mgmtEmailSender');
    const result = await sendOne(parseInt(id));

    if (result.success) {
      res.json({ success: true, id, email: item.contact_email, messageId: result.messageId });
    } else {
      res.status(502).json({ success: false, error: result.error });
    }
  } catch (err) {
    console.error('[MgmtOutreach] send-one error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── DELETE /api/mgmt-outreach/:id ───────────────────────────────────────────

router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const result = run('DELETE FROM mgmt_outreach_queue WHERE id = ?', [id]);
    if (!result.changes) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
