/**
 * Revenue Attribution API Routes
 *
 * GET  /api/revenue/funnel          — Funnel conversion stats
 * GET  /api/revenue/funnel/hoa      — HOA funnel stats
 * GET  /api/revenue/agents          — Revenue per agent
 * GET  /api/revenue/variants        — A/B test results
 * GET  /api/revenue/engagement      — Engagement leaderboard
 * GET  /api/revenue/cycle-time      — Cycle time analytics
 * POST /api/revenue/deal            — Record a deal close
 * POST /api/revenue/deal-lost       — Record a lost deal
 * POST /api/revenue/event           — Record a revenue event manually
 */

const express = require('express');
const { authenticate } = require('../middleware/auth');
const revenue = require('../services/revenueTracker');

const router = express.Router();

// All routes require auth
router.use(authenticate);

// ─── Funnel Stats ────────────────────────────────────────────────────────────

router.get('/funnel', (req, res) => {
  try {
    const stats = revenue.getFunnelStats('cfo_leads');
    res.json({ product: 'jake', ...stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/funnel/hoa', (req, res) => {
  try {
    const stats = revenue.getFunnelStats('lg_engagement_queue');
    res.json({ product: 'hoa', ...stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Agent ROI ───────────────────────────────────────────────────────────────

router.get('/agents', (req, res) => {
  try {
    const agents = revenue.getAgentROI();
    res.json(agents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── A/B Variant Stats ──────────────────────────────────────────────────────

router.get('/variants', (req, res) => {
  try {
    const groupBy = req.query.group_by || 'angle_type';
    const stats = revenue.getVariantStats(groupBy);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Content Performance ────────────────────────────────────────────────────

router.get('/content', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const stats = revenue.getContentPerformance(limit);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Engagement Leaderboard ─────────────────────────────────────────────────

router.get('/engagement', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const table = req.query.product === 'hoa' ? 'lg_engagement_queue' : 'cfo_leads';
    const leads = revenue.getEngagementLeaderboard(limit, table);
    res.json(leads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Cycle Time ─────────────────────────────────────────────────────────────

router.get('/cycle-time', (req, res) => {
  try {
    const table = req.query.product === 'hoa' ? 'lg_engagement_queue' : 'cfo_leads';
    const stats = revenue.getCycleTimeStats(table);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Record Deal ────────────────────────────────────────────────────────────

router.post('/deal', (req, res) => {
  try {
    const { lead_id, value_dollars, closed_by, product } = req.body;
    if (!lead_id || value_dollars === undefined) {
      return res.status(400).json({ error: 'lead_id and value_dollars required' });
    }
    const parsed = parseFloat(value_dollars);
    if (isNaN(parsed) || parsed < 0) {
      return res.status(400).json({ error: 'value_dollars must be a positive number' });
    }
    const valueCents = Math.round(parsed * 100);
    const table = product === 'hoa' ? 'lg_engagement_queue' : 'cfo_leads';
    const result = revenue.recordDeal(lead_id, valueCents, closed_by || 'manual', table);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Record Deal Lost ───────────────────────────────────────────────────────

router.post('/deal-lost', (req, res) => {
  try {
    const { lead_id, reason, product } = req.body;
    if (!lead_id) return res.status(400).json({ error: 'lead_id required' });
    const table = product === 'hoa' ? 'lg_engagement_queue' : 'cfo_leads';
    const result = revenue.recordDealLost(lead_id, reason, table);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Record Manual Event ────────────────────────────────────────────────────

router.post('/event', (req, res) => {
  try {
    const { lead_id, event_type, agent, sequence_id, touch_number, channel, product } = req.body;
    if (!lead_id || !event_type) {
      return res.status(400).json({ error: 'lead_id and event_type required' });
    }
    const table = product === 'hoa' ? 'lg_engagement_queue' : 'cfo_leads';
    const result = revenue.recordEvent(lead_id, event_type, {
      leadTable: table,
      agent,
      sequenceId: sequence_id,
      touchNumber: touch_number,
      channel,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
