/**
 * @file fenceOutreach.js
 * @description Terrapin Station Community Services outreach API — leads, email sequences, metrics.
 *
 * ENDPOINTS:
 *   GET    /api/fence/leads              — List leads (filter by type, tier, status)
 *   GET    /api/fence/leads/:id          — Single lead with sequence history
 *   POST   /api/fence/leads              — Create lead
 *   PUT    /api/fence/leads/:id          — Update lead
 *   DELETE /api/fence/leads/:id          — Delete lead
 *   GET    /api/fence/sequences          — List outreach queue (filter by status, type)
 *   POST   /api/fence/sequences/build    — Generate email sequences for pending leads
 *   POST   /api/fence/sequences/:id/approve  — Approve one email
 *   POST   /api/fence/sequences/approve-all  — Approve all draft emails
 *   POST   /api/fence/sequences/:id/send-one — Send one approved email
 *   POST   /api/fence/sequences/send     — Send all approved emails
 *   GET    /api/fence/metrics            — Daily metrics
 *   GET    /api/fence/metrics/summary    — Aggregate summary stats
 */

const express = require('express');
const router = express.Router();
const { all, get, run } = require('../db/connection');
const { authenticate } = require('../middleware/auth');
const { buildFenceEmail, getMaxSteps } = require('../services/fenceEmailTemplate');

router.use(authenticate);

// ─── LEADS ──────────────────────────────────────────────────────────────────

router.get('/leads', (req, res) => {
  try {
    const { type, tier, status, limit = 200, offset = 0 } = req.query;
    let sql = 'SELECT * FROM fence_leads WHERE 1=1';
    const params = [];

    if (type) { sql += ' AND lead_type = ?'; params.push(type); }
    if (tier) { sql += ' AND tier = ?'; params.push(parseInt(tier)); }
    if (status) { sql += ' AND status = ?'; params.push(status); }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const items = all(sql, params);
    const countSql = sql.replace(/SELECT \*/, 'SELECT COUNT(*) as total').replace(/ ORDER BY.*/, '');
    const countRow = get(countSql, params.slice(0, -2));

    res.json({ success: true, items, total: countRow?.total || 0 });
  } catch (err) {
    console.error('[FenceOutreach] leads list error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/leads/:id', (req, res) => {
  try {
    const lead = get('SELECT * FROM fence_leads WHERE id = ?', [req.params.id]);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

    const sequences = all(
      'SELECT * FROM fence_outreach_sequences WHERE lead_id = ? ORDER BY sequence_step ASC',
      [req.params.id]
    );

    res.json({ success: true, lead, sequences });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/leads', (req, res) => {
  try {
    const { lead_type, tier, company_name, community_name, contact_name, contact_email,
            contact_title, homes_count, linear_feet_estimate, previous_project_type, source, notes,
            wui_zone, wui_data_source, insurance_renewal_month } = req.body;

    if (!lead_type) return res.status(400).json({ success: false, error: 'lead_type is required' });
    if (!contact_email) return res.status(400).json({ success: false, error: 'contact_email is required' });

    // Enforce: cold_board and wui_community require community_name
    if ((lead_type === 'board_president' || lead_type === 'wui_community') && !community_name) {
      return res.status(400).json({ success: false, error: 'community_name is required for board_president and wui_community leads' });
    }

    const result = run(
      `INSERT INTO fence_leads (lead_type, tier, company_name, community_name, contact_name, contact_email,
        contact_title, homes_count, linear_feet_estimate, previous_project_type, source, notes,
        wui_zone, wui_data_source, insurance_renewal_month)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [lead_type, tier || null, company_name || null, community_name || null, contact_name || null,
       contact_email, contact_title || null, homes_count || null, linear_feet_estimate || null,
       previous_project_type || null, source || 'manual', notes || null,
       wui_zone ? 1 : 0, wui_data_source || null, insurance_renewal_month || null]
    );

    res.json({ success: true, id: result.lastInsertRowid, message: 'Lead created' });
  } catch (err) {
    console.error('[FenceOutreach] create lead error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/leads/:id', (req, res) => {
  try {
    const { id } = req.params;
    const lead = get('SELECT id FROM fence_leads WHERE id = ?', [id]);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

    const fields = ['lead_type', 'tier', 'company_name', 'community_name', 'contact_name',
                    'contact_email', 'contact_title', 'homes_count', 'linear_feet_estimate',
                    'previous_project_type', 'source', 'status', 'notes',
                    'wui_zone', 'wui_data_source', 'insurance_renewal_month'];

    const updates = [];
    const params = [];

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        params.push(req.body[field]);
      }
    }

    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });

    updates.push("updated_at = datetime('now')");
    params.push(id);

    run(`UPDATE fence_leads SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ success: true, id: parseInt(id), message: 'Lead updated' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/leads/:id', (req, res) => {
  try {
    const result = run('DELETE FROM fence_leads WHERE id = ?', [req.params.id]);
    if (!result.changes) return res.status(404).json({ success: false, error: 'Lead not found' });

    // Clean up any sequences for this lead
    run('DELETE FROM fence_outreach_sequences WHERE lead_id = ?', [req.params.id]);

    res.json({ success: true, message: 'Lead and sequences deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── SEQUENCES ──────────────────────────────────────────────────────────────

router.get('/sequences', (req, res) => {
  try {
    const { status, type, limit = 200, offset = 0 } = req.query;
    let sql = `SELECT s.*, l.contact_name, l.contact_email, l.company_name, l.community_name, l.lead_type
               FROM fence_outreach_sequences s
               JOIN fence_leads l ON s.lead_id = l.id
               WHERE 1=1`;
    const params = [];

    if (status) { sql += ' AND s.status = ?'; params.push(status); }
    if (type) { sql += ' AND s.sequence_type = ?'; params.push(type); }

    sql += ` ORDER BY CASE s.status
               WHEN 'draft' THEN 1 WHEN 'approved' THEN 2 WHEN 'sent' THEN 3
               ELSE 4 END, s.scheduled_send_date ASC, s.id ASC`;
    sql += ' LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const items = all(sql, params);
    res.json({ success: true, items, total: items.length });
  } catch (err) {
    console.error('[FenceOutreach] sequences list error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/sequences/build', (req, res) => {
  try {
    const { lead_ids, sender_name = 'Adam Weir' } = req.body;

    // Get leads that need sequences built
    let leads;
    if (lead_ids && lead_ids.length > 0) {
      const placeholders = lead_ids.map(() => '?').join(',');
      leads = all(`SELECT * FROM fence_leads WHERE id IN (${placeholders}) AND status = 'new'`, lead_ids);
    } else {
      leads = all("SELECT * FROM fence_leads WHERE status = 'new' LIMIT 100");
    }

    let created = 0;
    let skipped = 0;

    for (const lead of leads) {
      // Determine sequence type (routing logic from SOUL.md)
      let seqType;
      if (lead.previous_project_type || lead.lead_type === 'warm_contact') {
        seqType = 'warm';
      } else if (lead.wui_zone === 1 && lead.community_name) {
        seqType = 'fire_wui';
      } else if (lead.lead_type === 'mgmt_company') {
        seqType = 'cold_mgmt';
      } else if (lead.lead_type === 'board_president') {
        if (!lead.community_name) { skipped++; continue; }
        seqType = 'cold_board';
      } else {
        skipped++;
        continue;
      }

      // Check if sequences already exist for this lead
      const existing = get(
        'SELECT COUNT(*) as cnt FROM fence_outreach_sequences WHERE lead_id = ?',
        [lead.id]
      );
      if (existing.cnt > 0) { skipped++; continue; }

      // Build all steps for this sequence
      const maxSteps = getMaxSteps(seqType);
      for (let step = 1; step <= maxSteps; step++) {
        const email = buildFenceEmail(lead, seqType, step, sender_name);

        const scheduledDate = new Date();
        scheduledDate.setDate(scheduledDate.getDate() + email.dayOffset);

        run(
          `INSERT INTO fence_outreach_sequences
           (lead_id, sequence_type, sequence_step, email_subject, email_body_html, email_body_text,
            status, scheduled_send_date)
           VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)`,
          [lead.id, seqType, step, email.subject, email.body_html, email.body_text,
           scheduledDate.toISOString()]
        );
        created++;
      }

      // Mark lead as contacted
      run("UPDATE fence_leads SET status = 'contacted', updated_at = datetime('now') WHERE id = ?", [lead.id]);
    }

    console.log(`[FenceOutreach] Built ${created} emails for ${leads.length} leads (${skipped} skipped)`);
    res.json({ success: true, leads_processed: leads.length, emails_created: created, skipped });
  } catch (err) {
    console.error('[FenceOutreach] build error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/sequences/approve-all', (req, res) => {
  try {
    const result = run(
      `UPDATE fence_outreach_sequences SET status='approved', approved_at=datetime('now') WHERE status='draft'`,
      []
    );
    const count = result.changes || 0;
    console.log(`[FenceOutreach] Approved ${count} draft emails`);
    res.json({ success: true, approved: count });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/sequences/:id/approve', (req, res) => {
  try {
    const { id } = req.params;
    const item = get('SELECT id, status FROM fence_outreach_sequences WHERE id = ?', [id]);
    if (!item) return res.status(404).json({ success: false, error: 'Not found' });
    if (item.status === 'sent') return res.status(400).json({ success: false, error: 'Already sent' });

    run(`UPDATE fence_outreach_sequences SET status='approved', approved_at=datetime('now') WHERE id=?`, [id]);
    res.json({ success: true, id: parseInt(id), status: 'approved' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/sequences/:id/send-one', async (req, res) => {
  try {
    const { id } = req.params;
    const item = get(
      `SELECT s.*, l.contact_email FROM fence_outreach_sequences s
       JOIN fence_leads l ON s.lead_id = l.id WHERE s.id = ?`,
      [id]
    );
    if (!item) return res.status(404).json({ success: false, error: 'Not found' });
    if (item.status === 'sent') return res.status(400).json({ success: false, error: 'Already sent' });

    // Auto-approve if draft
    if (item.status === 'draft') {
      run(`UPDATE fence_outreach_sequences SET status='approved', approved_at=datetime('now') WHERE id=?`, [id]);
    }

    // Send via SendGrid
    const { sendEmail } = require('../services/sendgrid');
    const result = await sendEmail({
      to: item.contact_email,
      subject: item.email_subject,
      html: item.email_body_html,
      text: item.email_body_text,
    });

    if (result.success) {
      run(
        `UPDATE fence_outreach_sequences SET status='sent', sent_at=datetime('now'),
         delivery_status='delivered', sendgrid_msg_id=? WHERE id=?`,
        [result.messageId || null, id]
      );
      res.json({ success: true, id: parseInt(id), email: item.contact_email, messageId: result.messageId });
    } else {
      run(
        `UPDATE fence_outreach_sequences SET delivery_status='failed', delivery_error=? WHERE id=?`,
        [result.error || 'Unknown error', id]
      );
      res.status(502).json({ success: false, error: result.error });
    }
  } catch (err) {
    console.error('[FenceOutreach] send-one error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/sequences/send', async (req, res) => {
  try {
    const approved = all(
      `SELECT s.*, l.contact_email FROM fence_outreach_sequences s
       JOIN fence_leads l ON s.lead_id = l.id
       WHERE s.status = 'approved' AND s.scheduled_send_date <= datetime('now')
       ORDER BY s.scheduled_send_date ASC`,
      []
    );

    if (approved.length === 0) {
      return res.json({ success: true, sent: 0, failed: 0, message: 'No approved emails ready to send' });
    }

    const { sendEmail } = require('../services/sendgrid');
    let sent = 0;
    let failed = 0;

    for (const item of approved) {
      try {
        const result = await sendEmail({
          to: item.contact_email,
          subject: item.email_subject,
          html: item.email_body_html,
          text: item.email_body_text,
        });

        if (result.success) {
          run(
            `UPDATE fence_outreach_sequences SET status='sent', sent_at=datetime('now'),
             delivery_status='delivered', sendgrid_msg_id=? WHERE id=?`,
            [result.messageId || null, item.id]
          );
          sent++;
        } else {
          run(
            `UPDATE fence_outreach_sequences SET delivery_status='failed', delivery_error=? WHERE id=?`,
            [result.error || 'Unknown error', item.id]
          );
          failed++;
        }
      } catch (sendErr) {
        run(
          `UPDATE fence_outreach_sequences SET delivery_status='failed', delivery_error=? WHERE id=?`,
          [sendErr.message, item.id]
        );
        failed++;
      }
    }

    // Update daily metrics
    const today = new Date().toISOString().split('T')[0];
    const existing = get('SELECT id FROM fence_metrics WHERE date = ?', [today]);
    if (existing) {
      run('UPDATE fence_metrics SET emails_sent = emails_sent + ? WHERE date = ?', [sent, today]);
    } else {
      run('INSERT INTO fence_metrics (date, emails_sent) VALUES (?, ?)', [today, sent]);
    }

    console.log(`[FenceOutreach] Batch send: ${sent} sent, ${failed} failed`);
    res.json({ success: true, sent, failed });
  } catch (err) {
    console.error('[FenceOutreach] batch send error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── METRICS ────────────────────────────────────────────────────────────────

router.get('/metrics', (req, res) => {
  try {
    const { days = 30 } = req.query;
    const metrics = all(
      `SELECT * FROM fence_metrics WHERE date >= date('now', '-' || ? || ' days') ORDER BY date DESC`,
      [parseInt(days)]
    );
    res.json({ success: true, metrics });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/metrics/summary', (req, res) => {
  try {
    const leads = get(`SELECT
      COUNT(*) as total_leads,
      SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as new_leads,
      SUM(CASE WHEN status = 'contacted' THEN 1 ELSE 0 END) as contacted,
      SUM(CASE WHEN status = 'replied' THEN 1 ELSE 0 END) as replied,
      SUM(CASE WHEN status = 'assessment_booked' THEN 1 ELSE 0 END) as assessments_booked,
      SUM(CASE WHEN status = 'contracted' THEN 1 ELSE 0 END) as contracted,
      SUM(CASE WHEN lead_type = 'mgmt_company' THEN 1 ELSE 0 END) as mgmt_leads,
      SUM(CASE WHEN lead_type = 'board_president' THEN 1 ELSE 0 END) as board_leads,
      SUM(CASE WHEN lead_type = 'warm_contact' THEN 1 ELSE 0 END) as warm_leads
    FROM fence_leads`, []);

    const sequences = get(`SELECT
      COUNT(*) as total_emails,
      SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as drafts,
      SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
      SUM(CASE WHEN status = 'replied' THEN 1 ELSE 0 END) as replied,
      SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) as bounced
    FROM fence_outreach_sequences`, []);

    const replyRate = sequences.sent > 0
      ? ((sequences.replied / sequences.sent) * 100).toFixed(1) + '%'
      : 'N/A';

    res.json({
      success: true,
      leads,
      sequences,
      replyRate,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
