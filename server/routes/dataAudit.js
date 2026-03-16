/**
 * @file dataAudit.js
 * @description API routes for Data Audit service (Lane 3: Service Arbitrage).
 *
 * Routes:
 *   POST /api/data-audit          — Create + run a new audit
 *   GET  /api/data-audit          — List audits
 *   GET  /api/data-audit/:id      — Get audit detail
 *   POST /api/data-audit/:id/deliver — Email report to customer
 *   GET  /api/data-audit/stats    — Dashboard stats
 */

'use strict';

const express = require('express');
const { get, all } = require('../db/connection');
const { authenticate } = require('../middleware/auth');
const { createAndRunAudit, deliverReport, processPendingAudits } = require('../services/dataAuditService');

const router = express.Router();
router.use(authenticate);

// ── Create + Run Audit ───────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  try {
    const { companyName, website, industry, erpSystem, contactName, contactEmail, source, amountCents } = req.body;

    if (!companyName) {
      return res.status(400).json({ error: 'companyName is required' });
    }

    const result = await createAndRunAudit({
      companyName, website, industry, erpSystem, contactName, contactEmail,
      source: source || 'manual', amountCents: amountCents || 0,
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[data-audit] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── List Audits ──────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    let query = 'SELECT id, company_name, industry, status, chaos_score, source, payment_status, amount_cents, contact_email, created_at, delivered_at FROM audit_requests';
    const params = [];

    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const audits = all(query, params);
    const total = get('SELECT COUNT(*) as count FROM audit_requests' + (status ? ' WHERE status = ?' : ''), status ? [status] : []);

    res.json({ audits, total: total.count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Stats ────────────────────────────────────────────────────────────────────

router.get('/stats', (req, res) => {
  try {
    const stats = {
      total: get('SELECT COUNT(*) as n FROM audit_requests')?.n || 0,
      completed: get('SELECT COUNT(*) as n FROM audit_requests WHERE status = ?', ['completed'])?.n || 0,
      delivered: get('SELECT COUNT(*) as n FROM audit_requests WHERE status = ?', ['delivered'])?.n || 0,
      pending: get('SELECT COUNT(*) as n FROM audit_requests WHERE status = ?', ['pending'])?.n || 0,
      failed: get('SELECT COUNT(*) as n FROM audit_requests WHERE status = ?', ['failed'])?.n || 0,
      revenue_cents: get('SELECT SUM(amount_cents) as n FROM audit_requests WHERE payment_status = ?', ['paid'])?.n || 0,
      avg_chaos_score: get('SELECT AVG(chaos_score) as n FROM audit_requests WHERE status IN (?, ?)', ['completed', 'delivered'])?.n || 0,
      leads_created: (() => { try { return get('SELECT COUNT(*) as n FROM cfo_leads WHERE attribution_source = ?', ['data_audit_report'])?.n || 0; } catch { return 0; } })(),
    };

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Get Detail ───────────────────────────────────────────────────────────────

router.get('/:id', (req, res) => {
  try {
    const audit = get('SELECT * FROM audit_requests WHERE id = ?', [req.params.id]);
    if (!audit) return res.status(404).json({ error: 'Audit not found' });

    // Parse report JSON for response
    if (audit.report_json) {
      try { audit.report = JSON.parse(audit.report_json); } catch {}
    }

    res.json(audit);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Deliver Report ───────────────────────────────────────────────────────────

router.post('/:id/deliver', async (req, res) => {
  try {
    const result = await deliverReport(req.params.id);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Process Pending (batch) ──────────────────────────────────────────────────

router.post('/batch', async (req, res) => {
  try {
    const { limit = 5 } = req.body;
    const result = await processPendingAudits(limit);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
