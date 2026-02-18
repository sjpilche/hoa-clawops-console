/**
 * @file cfoMarketing.js
 * @description API routes for CFO AI Suite Marketing pipeline
 *
 * Endpoints:
 *   GET /api/cfo-marketing/leads        — Lead list (paginated, filterable)
 *   GET /api/cfo-marketing/leads/stats  — Pipeline funnel counts + value
 *   PUT /api/cfo-marketing/leads/:id    — Update lead status/notes
 *   GET /api/cfo-marketing/content      — Content pieces list
 *   PUT /api/cfo-marketing/content/:id  — Update content status (approve/publish)
 *   GET /api/cfo-marketing/outreach     — Outreach sequences list
 *   GET /api/cfo-marketing/outreach/:leadId — Sequences for a specific lead
 *   PUT /api/cfo-marketing/outreach/:id — Update sequence status (approve/send)
 */

'use strict';

const { Router } = require('express');
const { run, get, all } = require('../db/connection');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

// ═══════════════════════════════════════════════════════════════════════════
// LEADS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/cfo-marketing/leads
 * Paginated lead list with optional filters
 */
router.get('/leads', (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const status = req.query.status || null;
    const erp_type = req.query.erp_type || null;
    const min_score = parseInt(req.query.min_score) || 0;

    let query = `
      SELECT
        id, company_name, erp_type, revenue_range, employee_count,
        contact_name, contact_title, contact_email, contact_linkedin,
        website, state, city,
        pilot_fit_score, pilot_fit_reason,
        status, source, notes,
        created_at, updated_at
      FROM cfo_leads
      WHERE pilot_fit_score >= ?
    `;
    const params = [min_score];

    if (status) { query += ' AND status = ?'; params.push(status); }
    if (erp_type) { query += ' AND erp_type = ?'; params.push(erp_type); }

    query += ' ORDER BY pilot_fit_score DESC, created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const leads = all(query, params);

    const countQuery = `SELECT COUNT(*) as total FROM cfo_leads WHERE pilot_fit_score >= ?${status ? ' AND status = ?' : ''}${erp_type ? ' AND erp_type = ?' : ''}`;
    const countParams = [min_score];
    if (status) countParams.push(status);
    if (erp_type) countParams.push(erp_type);
    const { total } = get(countQuery, countParams) || { total: 0 };

    res.json({ leads, total, limit, offset });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/cfo-marketing/leads/stats
 * Pipeline funnel counts and estimated value
 */
router.get('/leads/stats', (req, res, next) => {
  try {
    const statuses = ['new', 'contacted', 'replied', 'pilot', 'closed_won', 'closed_lost'];
    const counts = {};
    for (const s of statuses) {
      const row = get('SELECT COUNT(*) as n FROM cfo_leads WHERE status = ?', [s]);
      counts[s] = row ? row.n : 0;
    }

    const erpBreakdown = all(
      `SELECT erp_type, COUNT(*) as n, AVG(pilot_fit_score) as avg_score
       FROM cfo_leads GROUP BY erp_type ORDER BY n DESC`,
      []
    );

    const topLeads = all(
      `SELECT id, company_name, erp_type, pilot_fit_score, status, contact_email
       FROM cfo_leads WHERE status IN ('new','contacted','replied')
       ORDER BY pilot_fit_score DESC LIMIT 10`,
      []
    );

    // Pilot pipeline value estimate ($490 avg for new pilots)
    const pilot_pipeline_value = (counts.replied * 490) + (counts.pilot * 1200);

    res.json({
      pipeline: counts,
      pilot_pipeline_value,
      erp_breakdown: erpBreakdown,
      top_leads: topLeads,
      total_leads: Object.values(counts).reduce((a, b) => a + b, 0),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/cfo-marketing/leads/:id
 * Update lead status, contact info, or notes
 */
router.put('/leads/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, notes, contact_name, contact_title, contact_email, contact_linkedin, erp_type } = req.body;

    const existing = get('SELECT id FROM cfo_leads WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Lead not found' });

    const updates = [];
    const params = [];

    if (status !== undefined) { updates.push('status = ?'); params.push(status); }
    if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }
    if (contact_name !== undefined) { updates.push('contact_name = ?'); params.push(contact_name); }
    if (contact_title !== undefined) { updates.push('contact_title = ?'); params.push(contact_title); }
    if (contact_email !== undefined) { updates.push('contact_email = ?'); params.push(contact_email); }
    if (contact_linkedin !== undefined) { updates.push('contact_linkedin = ?'); params.push(contact_linkedin); }
    if (erp_type !== undefined) { updates.push('erp_type = ?'); params.push(erp_type); }

    if (updates.length === 0) return res.json({ message: 'No changes' });

    updates.push("updated_at = datetime('now')");
    params.push(id);

    run(`UPDATE cfo_leads SET ${updates.join(', ')} WHERE id = ?`, params);

    const updated = get('SELECT * FROM cfo_leads WHERE id = ?', [id]);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// CONTENT PIECES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/cfo-marketing/content
 * List content pieces, optionally filtered by status/channel
 */
router.get('/content', (req, res, next) => {
  try {
    const status = req.query.status || null;
    const channel = req.query.channel || null;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);

    let query = `SELECT id, pillar, channel, title, cta, status, published_at, created_at FROM cfo_content_pieces WHERE 1=1`;
    const params = [];

    if (status) { query += ' AND status = ?'; params.push(status); }
    if (channel) { query += ' AND channel = ?'; params.push(channel); }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const pieces = all(query, params);
    res.json({ pieces, total: pieces.length });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/cfo-marketing/content/:id
 * Get full content piece including markdown body
 */
router.get('/content/:id', (req, res, next) => {
  try {
    const piece = get('SELECT * FROM cfo_content_pieces WHERE id = ?', [req.params.id]);
    if (!piece) return res.status(404).json({ error: 'Content piece not found' });
    res.json(piece);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/cfo-marketing/content/:id
 * Approve or update a content piece (human gate)
 */
router.put('/content/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, title, content_markdown, cta } = req.body;

    const existing = get('SELECT id FROM cfo_content_pieces WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Content piece not found' });

    const updates = [];
    const params = [];

    if (status !== undefined) {
      updates.push('status = ?'); params.push(status);
      if (status === 'published') { updates.push("published_at = datetime('now')"); }
    }
    if (title !== undefined) { updates.push('title = ?'); params.push(title); }
    if (content_markdown !== undefined) { updates.push('content_markdown = ?'); params.push(content_markdown); }
    if (cta !== undefined) { updates.push('cta = ?'); params.push(cta); }

    if (updates.length === 0) return res.json({ message: 'No changes' });

    params.push(id);
    run(`UPDATE cfo_content_pieces SET ${updates.join(', ')} WHERE id = ?`, params);

    const updated = get('SELECT * FROM cfo_content_pieces WHERE id = ?', [id]);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// OUTREACH SEQUENCES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/cfo-marketing/outreach
 * List outreach sequences with lead info
 */
router.get('/outreach', (req, res, next) => {
  try {
    const status = req.query.status || null;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);

    let query = `
      SELECT
        s.id, s.lead_id, s.sequence_type, s.email_subject, s.pilot_offer,
        s.status, s.sent_at, s.replied_at, s.created_at,
        l.company_name, l.contact_name, l.contact_email, l.erp_type, l.pilot_fit_score
      FROM cfo_outreach_sequences s
      LEFT JOIN cfo_leads l ON s.lead_id = l.id
      WHERE 1=1
    `;
    const params = [];

    if (status) { query += ' AND s.status = ?'; params.push(status); }
    query += ' ORDER BY s.created_at DESC LIMIT ?';
    params.push(limit);

    const sequences = all(query, params);
    res.json({ sequences, total: sequences.length });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/cfo-marketing/outreach/:leadId
 * Get all sequences for a specific lead
 */
router.get('/outreach/:leadId', (req, res, next) => {
  try {
    const sequences = all(
      'SELECT * FROM cfo_outreach_sequences WHERE lead_id = ? ORDER BY created_at DESC',
      [req.params.leadId]
    );
    res.json({ sequences });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/cfo-marketing/outreach/:id
 * Approve or mark sent (human gate)
 */
router.put('/outreach/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, email_subject, email_body } = req.body;

    const existing = get('SELECT id FROM cfo_outreach_sequences WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Sequence not found' });

    const updates = [];
    const params = [];

    if (status !== undefined) {
      updates.push('status = ?'); params.push(status);
      if (status === 'sent') { updates.push("sent_at = datetime('now')"); }
    }
    if (email_subject !== undefined) { updates.push('email_subject = ?'); params.push(email_subject); }
    if (email_body !== undefined) { updates.push('email_body = ?'); params.push(email_body); }

    if (updates.length === 0) return res.json({ message: 'No changes' });

    params.push(id);
    run(`UPDATE cfo_outreach_sequences SET ${updates.join(', ')} WHERE id = ?`, params);

    const updated = get('SELECT * FROM cfo_outreach_sequences WHERE id = ?', [id]);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
