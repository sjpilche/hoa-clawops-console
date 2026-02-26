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
 * Query params: status, erp_type, min_score, source_agent, limit, offset
 */
router.get('/leads', (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const status = req.query.status || null;
    const erp_type = req.query.erp_type || null;
    const source_agent = req.query.source_agent || null;
    const min_score = parseInt(req.query.min_score) || 0;

    let query = `
      SELECT
        id, company_name, erp_type, revenue_range, employee_count,
        contact_name, contact_title, contact_email, contact_linkedin,
        website, state, city,
        pilot_fit_score, pilot_fit_reason,
        status, source, source_agent, notes,
        created_at, updated_at
      FROM cfo_leads
      WHERE pilot_fit_score >= ?
    `;
    const params = [min_score];

    if (status) { query += ' AND status = ?'; params.push(status); }
    if (erp_type) { query += ' AND erp_type = ?'; params.push(erp_type); }
    if (source_agent) { query += ' AND source_agent = ?'; params.push(source_agent); }

    query += ' ORDER BY pilot_fit_score DESC, created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const leads = all(query, params);

    let countQuery = `SELECT COUNT(*) as total FROM cfo_leads WHERE pilot_fit_score >= ?`;
    const countParams = [min_score];
    if (status) { countQuery += ' AND status = ?'; countParams.push(status); }
    if (erp_type) { countQuery += ' AND erp_type = ?'; countParams.push(erp_type); }
    if (source_agent) { countQuery += ' AND source_agent = ?'; countParams.push(source_agent); }
    const { total } = get(countQuery, countParams) || { total: 0 };

    res.json({ leads, total, limit, offset });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/cfo-marketing/leads/stats
 * Pipeline funnel counts and estimated value
 * Query params: source_agent (optional — 'jake', 'cfo', or omit for all)
 */
router.get('/leads/stats', (req, res, next) => {
  try {
    const source_agent = req.query.source_agent || null;
    const sourceFilter = source_agent ? ' AND source_agent = ?' : '';
    const sourceParams = source_agent ? [source_agent] : [];

    const statuses = ['new', 'contacted', 'replied', 'pilot', 'closed_won', 'closed_lost'];
    const counts = {};
    for (const s of statuses) {
      const row = get(`SELECT COUNT(*) as n FROM cfo_leads WHERE status = ?${sourceFilter}`, [s, ...sourceParams]);
      counts[s] = row ? row.n : 0;
    }

    const erpBreakdown = all(
      `SELECT erp_type, COUNT(*) as n, AVG(pilot_fit_score) as avg_score
       FROM cfo_leads WHERE 1=1${sourceFilter} GROUP BY erp_type ORDER BY n DESC`,
      sourceParams
    );

    const topLeads = all(
      `SELECT id, company_name, erp_type, pilot_fit_score, status, contact_email, source_agent
       FROM cfo_leads WHERE status IN ('new','contacted','replied')${sourceFilter}
       ORDER BY pilot_fit_score DESC LIMIT 10`,
      sourceParams
    );

    // Source breakdown
    const sourceBreakdown = all(
      `SELECT source_agent, COUNT(*) as n FROM cfo_leads GROUP BY source_agent ORDER BY n DESC`,
      []
    );

    // Pilot pipeline value estimate ($490 avg for new pilots)
    const pilot_pipeline_value = (counts.replied * 490) + (counts.pilot * 1200);

    res.json({
      pipeline: counts,
      pilot_pipeline_value,
      erp_breakdown: erpBreakdown,
      top_leads: topLeads,
      source_breakdown: sourceBreakdown,
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
    const { status, notes, contact_name, contact_title, contact_email, contact_linkedin, erp_type, website, phone } = req.body;

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
    if (website !== undefined) { updates.push('website = ?'); params.push(website); }
    if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }

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
 * List content pieces, optionally filtered by status/channel/source_agent
 */
router.get('/content', (req, res, next) => {
  try {
    const status = req.query.status || null;
    const channel = req.query.channel || null;
    const source_agent = req.query.source_agent || null;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);

    let query = `SELECT id, pillar, channel, title, cta, source_agent, status, published_at, created_at FROM cfo_content_pieces WHERE 1=1`;
    const params = [];

    if (status) { query += ' AND status = ?'; params.push(status); }
    if (channel) { query += ' AND channel = ?'; params.push(channel); }
    if (source_agent) { query += ' AND source_agent = ?'; params.push(source_agent); }

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
 * Query params: status, source_agent, limit
 */
router.get('/outreach', (req, res, next) => {
  try {
    const status = req.query.status || null;
    const source_agent = req.query.source_agent || null;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);

    let query = `
      SELECT
        s.id, s.lead_id, s.sequence_type, s.email_subject, s.email_body, s.pilot_offer,
        s.status, s.source_agent, s.sent_at, s.replied_at, s.created_at,
        l.company_name, l.contact_name, l.contact_email, l.erp_type, l.pilot_fit_score
      FROM cfo_outreach_sequences s
      LEFT JOIN cfo_leads l ON s.lead_id = l.id
      WHERE 1=1
    `;
    const params = [];

    if (status) { query += ' AND s.status = ?'; params.push(status); }
    if (source_agent) { query += ' AND s.source_agent = ?'; params.push(source_agent); }
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
 * When status changes to 'sent' and lead has contact_email, sends the email via SMTP.
 */
router.put('/outreach/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, email_subject, email_body } = req.body;

    const existing = get('SELECT * FROM cfo_outreach_sequences WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Sequence not found' });

    const brain = require('../services/collectiveBrain');
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

    // If marking as 'sent', try to send the actual email
    if (status === 'sent' && existing.lead_id) {
      const lead = get('SELECT id, contact_email, contact_name, company_name FROM cfo_leads WHERE id = ?', [existing.lead_id]);
      if (!lead?.contact_email) {
        // Revert — can't send without an email address
        run('UPDATE cfo_outreach_sequences SET status = ? WHERE id = ?', ['approved', id]);
        return res.status(400).json({
          error: 'No contact email for this lead. Enrich the lead first.',
          lead_id: existing.lead_id,
          needs_enrichment: true,
        });
      }
      try {
        const { getTransporter } = require('./email');
        const transporter = getTransporter();
        const subject = updated.email_subject || email_subject || 'Hello';
        const body = updated.email_body || email_body || '';
        const info = await transporter.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: lead.contact_email,
          subject,
          text: body,
        });
        console.log(`[CfoMarketing] Email sent to ${lead.contact_email} (${lead.company_name})`);
        // Update delivery tracking
        run("UPDATE cfo_outreach_sequences SET delivery_status = 'delivered', delivery_error = NULL WHERE id = ?", [id]);
        // Auto-progress lead status
        run("UPDATE cfo_leads SET status = 'contacted', updated_at = datetime('now') WHERE id = ? AND status = 'new'", [lead.id]);
        updated.email_sent = true;
      } catch (emailErr) {
        console.error(`[CfoMarketing] Email send failed:`, emailErr.message);
        run("UPDATE cfo_outreach_sequences SET delivery_status = 'failed', delivery_error = ? WHERE id = ?", [emailErr.message, id]);
        updated.email_sent = false;
        updated.email_error = emailErr.message;
      }
    }

    // Auto-progress lead status on reply
    if (status === 'replied' && existing.lead_id) {
      run("UPDATE cfo_leads SET status = 'replied', updated_at = datetime('now') WHERE id = ? AND status IN ('new', 'contacted')", [existing.lead_id]);
    }

    // ── Collective Brain Layer 2: record feedback signal ──
    if (status && ['approved', 'rejected', 'sent', 'replied'].includes(status)) {
      const agentName = existing.source_agent === 'jake' ? 'jake-outreach-agent' : 'cfo-outreach-agent';
      const lead = existing.lead_id ? get('SELECT company_name, city, state, erp_type FROM cfo_leads WHERE id = ?', [existing.lead_id]) : null;
      const market = lead ? [lead.city, lead.state].filter(Boolean).join(', ') : null;
      brain.recordFeedback(agentName, 'outreach', String(id), status, {
        beforeText: existing.email_body || existing.body_text || null,
        afterText:  (email_body && email_body !== existing.email_body) ? email_body : null,
        market,
        notes: req.body.notes || null,
        metadata: lead ? { company: lead.company_name, erp: lead.erp_type } : {},
      });

      // Layer 3: record episode when outcome is known (sent → awaiting, replied → success)
      if (status === 'replied' && lead) {
        brain.recordEpisode(agentName, {
          market,
          erpContext:   lead.erp_type || null,
          contactTitle: existing.contact_title || null,
          actionTaken:  `Subject: ${existing.email_subject || ''}\n${(existing.email_body || '').slice(0, 300)}`,
          outcome:      'Lead replied to outreach email',
          outcomeType:  'replied',
          outcomeScore: 0.8,
          leadId:       String(existing.lead_id),
        });
      }
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ENRICHMENT & BULK OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/cfo-marketing/leads/funnel
 * Pipeline funnel counts for the workflow UI
 */
router.get('/leads/funnel', (req, res, next) => {
  try {
    const source_agent = req.query.source_agent || null;
    const sf = source_agent ? ' AND source_agent = ?' : '';
    const sp = source_agent ? [source_agent] : [];

    const funnel = {
      total: get(`SELECT COUNT(*) as n FROM cfo_leads WHERE 1=1${sf}`, sp)?.n || 0,
      needs_enrichment: get(`SELECT COUNT(*) as n FROM cfo_leads WHERE (contact_email IS NULL OR contact_email = '') AND (enrichment_status IS NULL OR enrichment_status = 'pending')${sf}`, sp)?.n || 0,
      enriching: get(`SELECT COUNT(*) as n FROM cfo_leads WHERE enrichment_status = 'in_progress'${sf}`, sp)?.n || 0,
      enriched: get(`SELECT COUNT(*) as n FROM cfo_leads WHERE enrichment_status = 'enriched' AND status = 'new'${sf}`, sp)?.n || 0,
      has_draft: get(`SELECT COUNT(DISTINCT l.id) as n FROM cfo_leads l JOIN cfo_outreach_sequences s ON s.lead_id = l.id WHERE s.status = 'draft'${sf}`, sp)?.n || 0,
      has_approved: get(`SELECT COUNT(DISTINCT l.id) as n FROM cfo_leads l JOIN cfo_outreach_sequences s ON s.lead_id = l.id WHERE s.status = 'approved'${sf}`, sp)?.n || 0,
      contacted: get(`SELECT COUNT(*) as n FROM cfo_leads WHERE status = 'contacted'${sf}`, sp)?.n || 0,
      replied: get(`SELECT COUNT(*) as n FROM cfo_leads WHERE status = 'replied'${sf}`, sp)?.n || 0,
      pilot: get(`SELECT COUNT(*) as n FROM cfo_leads WHERE status = 'pilot'${sf}`, sp)?.n || 0,
      closed_won: get(`SELECT COUNT(*) as n FROM cfo_leads WHERE status = 'closed_won'${sf}`, sp)?.n || 0,
    };
    res.json(funnel);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/cfo-marketing/leads/:id/enrich
 * Trigger enrichment for a single lead
 */
router.post('/leads/:id/enrich', async (req, res, next) => {
  try {
    const lead = get('SELECT id, company_name FROM cfo_leads WHERE id = ?', [req.params.id]);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const { enrichLead } = require('../services/jakeContactEnricher');
    const result = await enrichLead(lead.id);

    const updated = get('SELECT * FROM cfo_leads WHERE id = ?', [lead.id]);
    res.json({ ...result, lead: updated });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/cfo-marketing/leads/bulk-enrich
 * Trigger enrichment for top N unenriched leads
 */
router.post('/leads/bulk-enrich', async (req, res, next) => {
  try {
    const { limit = 20, min_score = 45 } = req.body || {};
    const { enrichMultipleLeads } = require('../services/jakeContactEnricher');
    const result = await enrichMultipleLeads({ limit, min_score });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/cfo-marketing/outreach/bulk-send
 * Send all approved outreach sequences that have a contact email
 */
router.post('/outreach/bulk-send', async (req, res, next) => {
  try {
    // Find all approved sequences linked to leads with email addresses
    const sequences = all(`
      SELECT s.id, s.email_subject, s.email_body, s.lead_id,
             l.contact_email, l.contact_name, l.company_name
      FROM cfo_outreach_sequences s
      JOIN cfo_leads l ON l.id = s.lead_id
      WHERE s.status = 'approved' AND l.contact_email IS NOT NULL AND l.contact_email != ''
      ORDER BY s.created_at ASC
    `);

    if (sequences.length === 0) {
      return res.json({ sent: 0, failed: 0, skipped_no_email: 0, message: 'No approved sequences with contact emails found.' });
    }

    let sent = 0;
    let failed = 0;
    const details = [];

    let transporter;
    try {
      const { getTransporter } = require('./email');
      transporter = getTransporter();
    } catch (smtpErr) {
      return res.status(500).json({ error: 'SMTP not configured: ' + smtpErr.message });
    }

    for (const seq of sequences) {
      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: seq.contact_email,
          subject: seq.email_subject || 'Hello',
          text: seq.email_body || '',
        });

        run("UPDATE cfo_outreach_sequences SET status = 'sent', sent_at = datetime('now'), delivery_status = 'delivered' WHERE id = ?", [seq.id]);
        run("UPDATE cfo_leads SET status = 'contacted', updated_at = datetime('now') WHERE id = ? AND status = 'new'", [seq.lead_id]);

        sent++;
        details.push({ id: seq.id, company: seq.company_name, email: seq.contact_email, status: 'sent' });
        console.log(`[BulkSend] Sent to ${seq.contact_email} (${seq.company_name})`);

        // 2s stagger between emails
        if (sequences.indexOf(seq) < sequences.length - 1) {
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch (sendErr) {
        failed++;
        run("UPDATE cfo_outreach_sequences SET delivery_status = 'failed', delivery_error = ? WHERE id = ?", [sendErr.message, seq.id]);
        details.push({ id: seq.id, company: seq.company_name, email: seq.contact_email, status: 'failed', error: sendErr.message });
        console.error(`[BulkSend] Failed for ${seq.contact_email}: ${sendErr.message}`);
      }
    }

    res.json({ sent, failed, total: sequences.length, details });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
