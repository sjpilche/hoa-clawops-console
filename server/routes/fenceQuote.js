/**
 * @file fenceQuote.js
 * @description AI-powered fence quote generation API.
 *
 * ENDPOINTS:
 *   POST  /api/fence/quotes/generate   — Generate a quote (AI summary + pricing)
 *   GET   /api/fence/quotes            — List saved quotes
 *   GET   /api/fence/quotes/:id        — Get single quote
 *   POST  /api/fence/quotes/:id/send   — Send quote to prospect via email
 */

const express = require('express');
const router = express.Router();
const { all, get, run } = require('../db/connection');
const { authenticate } = require('../middleware/auth');
const { generateQuote } = require('../services/fenceQuoteEngine');

router.use(authenticate);

// ─── GENERATE QUOTE ─────────────────────────────────────────────────────────

router.post('/generate', async (req, res) => {
  try {
    const {
      communityName, city, state, homesCount, role,
      fenceType, commonLF, privateLF, fenceCondition, lastPainted,
      contactName, contactEmail, contactPhone, timeline, notes,
      leadId,
    } = req.body;

    if (!communityName) {
      return res.status(400).json({ success: false, error: 'communityName is required' });
    }

    const input = {
      communityName, city, state, homesCount, role,
      fenceType, commonLF, privateLF, fenceCondition, lastPainted,
      contactName, contactEmail, contactPhone, timeline, notes,
    };

    console.log(`[FenceQuote] Generating quote for ${communityName}...`);
    const result = await generateQuote(input);

    // Save to database
    const dbResult = run(
      `INSERT INTO fence_quotes
       (lead_id, community_name, city, state, homes_count, role,
        fence_type, common_lf, private_lf, fence_condition, last_painted,
        common_area_total, private_fence_total, assessment_fee, management_fee, total_estimate,
        ai_summary, ai_confidence, estimation_method,
        contact_name, contact_email, contact_phone, timeline, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        leadId || null, communityName, city || null, state || null,
        homesCount ? parseInt(homesCount) : null, role || null,
        fenceType || null, result.pricing.commonLF, result.pricing.privateLF,
        fenceCondition || null, lastPainted || null,
        result.pricing.commonTotal, result.pricing.privateTotal,
        result.pricing.assessmentFee, result.pricing.managementFee,
        result.pricing.totalEstimate,
        result.summary, result.confidence, result.pricing.estimationMethod,
        contactName || null, contactEmail || null, contactPhone || null,
        timeline || null, notes || null,
      ]
    );

    console.log(`[FenceQuote] Quote #${dbResult.lastInsertRowid} generated: $${result.pricing.totalEstimate}`);

    res.json({
      success: true,
      quoteId: dbResult.lastInsertRowid,
      pricing: result.pricing,
      summary: result.summary,
      confidence: result.confidence,
      quoteHtml: result.quoteHtml,
    });
  } catch (err) {
    console.error('[FenceQuote] generate error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── LIST QUOTES ────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    let sql = 'SELECT id, community_name, city, state, homes_count, total_estimate, estimation_method, ai_confidence, status, contact_name, contact_email, created_at FROM fence_quotes WHERE 1=1';
    const params = [];

    if (status) { sql += ' AND status = ?'; params.push(status); }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const quotes = all(sql, params);
    res.json({ success: true, quotes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET SINGLE QUOTE ───────────────────────────────────────────────────────

router.get('/:id', (req, res) => {
  try {
    const quote = get('SELECT * FROM fence_quotes WHERE id = ?', [req.params.id]);
    if (!quote) return res.status(404).json({ success: false, error: 'Quote not found' });
    res.json({ success: true, quote });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── SEND QUOTE VIA EMAIL ───────────────────────────────────────────────────

router.post('/:id/send', async (req, res) => {
  try {
    const quote = get('SELECT * FROM fence_quotes WHERE id = ?', [req.params.id]);
    if (!quote) return res.status(404).json({ success: false, error: 'Quote not found' });
    if (!quote.contact_email) return res.status(400).json({ success: false, error: 'No contact email on this quote' });

    const { buildQuoteEmail, buildQuoteText } = require('../services/fenceQuoteEngine');
    const input = {
      communityName: quote.community_name,
      city: quote.city,
      state: quote.state,
      homesCount: quote.homes_count,
      fenceType: quote.fence_type,
      fenceCondition: quote.fence_condition,
      lastPainted: quote.last_painted,
    };
    const pricing = {
      commonLF: quote.common_lf,
      privateLF: quote.private_lf,
      commonTotal: quote.common_area_total,
      privateTotal: quote.private_fence_total,
      assessmentFee: quote.assessment_fee,
      managementFee: quote.management_fee,
      totalEstimate: quote.total_estimate,
      estimationMethod: quote.estimation_method,
    };

    const html = buildQuoteEmail(input, pricing, quote.ai_summary);
    const text = buildQuoteText(input, pricing, quote.ai_summary);

    const { sendEmail } = require('../services/sendgrid');
    const result = await sendEmail({
      to: quote.contact_email,
      subject: `Fence Program Estimate — ${quote.community_name}`,
      html,
      text,
    });

    if (result.success) {
      run("UPDATE fence_quotes SET status = 'sent', sent_at = datetime('now') WHERE id = ?", [req.params.id]);
      res.json({ success: true, message: `Quote sent to ${quote.contact_email}` });
    } else {
      res.status(502).json({ success: false, error: result.error });
    }
  } catch (err) {
    console.error('[FenceQuote] send error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
