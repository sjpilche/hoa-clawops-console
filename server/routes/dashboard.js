/**
 * @file dashboard.js (routes)
 * @description War Room dashboard — single endpoint aggregating all operational data.
 *
 * ENDPOINTS:
 *   GET /api/dashboard/warroom — Full operational snapshot (runs, leads, emails, brain, cost)
 */

const { Router } = require('express');
const { all, get } = require('../db/connection');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

/**
 * GET /api/dashboard/warroom
 * Returns everything needed for a single-page operational overview.
 * Query params: days (default 7) — lookback window for trends
 */
router.get('/warroom', async (req, res, next) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 7, 30);
    const today = new Date().toISOString().slice(0, 10);
    const sinceDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

    // ── 1. PIPELINE SNAPSHOT ──────────────────────────────────────
    const pipeline = {
      total:       get("SELECT COUNT(*) c FROM cfo_leads")?.c || 0,
      new:         get("SELECT COUNT(*) c FROM cfo_leads WHERE status='new'")?.c || 0,
      contacted:   get("SELECT COUNT(*) c FROM cfo_leads WHERE status='contacted'")?.c || 0,
      replied:     get("SELECT COUNT(*) c FROM cfo_leads WHERE status='replied'")?.c || 0,
      pilot:       get("SELECT COUNT(*) c FROM cfo_leads WHERE status='pilot'")?.c || 0,
      closed_won:  get("SELECT COUNT(*) c FROM cfo_leads WHERE status='closed_won'")?.c || 0,
      nurture:     get("SELECT COUNT(*) c FROM cfo_leads WHERE status='nurture'")?.c || 0,
      unsubscribed: get("SELECT COUNT(*) c FROM cfo_leads WHERE status='unsubscribed'")?.c || 0,
      bounced:     get("SELECT COUNT(*) c FROM cfo_leads WHERE status='bounced'")?.c || 0,
      needs_enrichment: get("SELECT COUNT(*) c FROM cfo_leads WHERE contact_email IS NULL OR contact_email=''")?.c || 0,
      new_today:   get("SELECT COUNT(*) c FROM cfo_leads WHERE DATE(created_at)=?", [today])?.c || 0,
      new_this_week: get("SELECT COUNT(*) c FROM cfo_leads WHERE DATE(created_at)>=?", [sinceDate])?.c || 0,
    };

    // ── 2. EMAIL / OUTREACH ──────────────────────────────────────
    const outreach = {
      total_drafts:    get("SELECT COUNT(*) c FROM cfo_outreach_sequences WHERE status='draft'")?.c || 0,
      total_approved:  get("SELECT COUNT(*) c FROM cfo_outreach_sequences WHERE status='approved'")?.c || 0,
      total_sent:      get("SELECT COUNT(*) c FROM cfo_outreach_sequences WHERE status='sent'")?.c || 0,
      total_replied:   get("SELECT COUNT(*) c FROM cfo_outreach_sequences WHERE status='replied'")?.c || 0,
      total_bounced:   get("SELECT COUNT(*) c FROM cfo_outreach_sequences WHERE status='bounced'")?.c || 0,
      sent_today:      get("SELECT COUNT(*) c FROM cfo_outreach_sequences WHERE status='sent' AND DATE(sent_at)=?", [today])?.c || 0,
      sent_this_week:  get("SELECT COUNT(*) c FROM cfo_outreach_sequences WHERE status='sent' AND DATE(sent_at)>=?", [sinceDate])?.c || 0,
      replied_this_week: get("SELECT COUNT(*) c FROM cfo_outreach_sequences WHERE status='replied' AND DATE(replied_at)>=?", [sinceDate])?.c || 0,
    };
    outreach.reply_rate = outreach.total_sent > 0
      ? Math.round(outreach.total_replied / outreach.total_sent * 100)
      : 0;
    // Ready to send = approved + has email
    outreach.ready_to_send = get(`
      SELECT COUNT(*) c FROM cfo_outreach_sequences s
      JOIN cfo_leads l ON l.id = s.lead_id
      WHERE s.status='approved' AND l.contact_email IS NOT NULL AND l.contact_email != ''
    `)?.c || 0;

    // ── 3. AGENT RUNS ─────────────────────────────────────────────
    const runs = {
      today: {
        total:     get("SELECT COUNT(*) c FROM runs WHERE DATE(created_at)=?", [today])?.c || 0,
        completed: get("SELECT COUNT(*) c FROM runs WHERE DATE(created_at)=? AND status='completed'", [today])?.c || 0,
        failed:    get("SELECT COUNT(*) c FROM runs WHERE DATE(created_at)=? AND status='failed'", [today])?.c || 0,
        running:   get("SELECT COUNT(*) c FROM runs WHERE status='running'")?.c || 0,
        pending:   get("SELECT COUNT(*) c FROM runs WHERE status='pending'")?.c || 0,
      },
      this_week: {
        total:     get("SELECT COUNT(*) c FROM runs WHERE DATE(created_at)>=?", [sinceDate])?.c || 0,
        completed: get("SELECT COUNT(*) c FROM runs WHERE DATE(created_at)>=? AND status='completed'", [sinceDate])?.c || 0,
        failed:    get("SELECT COUNT(*) c FROM runs WHERE DATE(created_at)>=? AND status='failed'", [sinceDate])?.c || 0,
      },
      // Last 5 completed runs for the activity feed
      recent: all(`
        SELECT r.id, COALESCE(a.name, r.agent_id) as agent_name, r.status, r.cost_usd, r.duration_ms, r.created_at
        FROM runs r LEFT JOIN agents a ON r.agent_id = a.id
        ORDER BY r.created_at DESC LIMIT 10
      `),
    };
    runs.this_week.success_rate = runs.this_week.total > 0
      ? Math.round(runs.this_week.completed / runs.this_week.total * 100)
      : 0;

    // ── 4. COSTS ──────────────────────────────────────────────────
    const costs = {
      today:     get("SELECT COALESCE(SUM(cost_usd),0) c FROM runs WHERE DATE(created_at)=?", [today])?.c || 0,
      this_week: get("SELECT COALESCE(SUM(cost_usd),0) c FROM runs WHERE DATE(created_at)>=?", [sinceDate])?.c || 0,
      all_time:  get("SELECT COALESCE(SUM(cost_usd),0) c FROM runs")?.c || 0,
      avg_per_run: get("SELECT COALESCE(AVG(cost_usd),0) c FROM runs WHERE cost_usd > 0")?.c || 0,
    };
    // Cost by agent (top 10 this week)
    costs.by_agent = all(`
      SELECT COALESCE(a.name, r.agent_id) as agent, SUM(r.cost_usd) as cost, COUNT(*) as runs
      FROM runs r LEFT JOIN agents a ON r.agent_id = a.id
      WHERE DATE(r.created_at) >= ?
      GROUP BY r.agent_id ORDER BY cost DESC LIMIT 10
    `, [sinceDate]);

    // ── 5. SCHEDULES ──────────────────────────────────────────────
    let schedules = {};
    try {
      schedules = {
        total:   get("SELECT COUNT(*) c FROM schedules")?.c || 0,
        enabled: get("SELECT COUNT(*) c FROM schedules WHERE enabled=1")?.c || 0,
        never_ran: get("SELECT COUNT(*) c FROM schedules WHERE last_run_at IS NULL AND enabled=1")?.c || 0,
        // Next 5 upcoming
        next_up: all(`
          SELECT name, agent_name AS agent, cron_expression AS cron, last_run_at
          FROM schedules WHERE enabled=1
          ORDER BY COALESCE(last_run_at, '1970-01-01') ASC LIMIT 5
        `),
      };
    } catch { /* schedules table may not exist */ }

    // ── 6. BRAIN HEALTH ───────────────────────────────────────────
    let brain = {};
    try {
      const brainService = require('../services/collectiveBrain');
      brain = await brainService.getStats();
    } catch {
      brain = { status: 'unavailable' };
    }

    // ── 7. SENDGRID STATUS ────────────────────────────────────────
    let emailStatus = {};
    try {
      const sg = require('../services/sendgrid');
      emailStatus = sg.status();
    } catch {
      emailStatus = { configured: false };
    }

    // ── 8. CONTENT ────────────────────────────────────────────────
    let content = {};
    try {
      content = {
        total:     get("SELECT COUNT(*) c FROM cfo_content_pieces")?.c || 0,
        published: get("SELECT COUNT(*) c FROM cfo_content_pieces WHERE status='published'")?.c || 0,
        draft:     get("SELECT COUNT(*) c FROM cfo_content_pieces WHERE status='draft'")?.c || 0,
        this_week: get("SELECT COUNT(*) c FROM cfo_content_pieces WHERE DATE(created_at)>=?", [sinceDate])?.c || 0,
      };
    } catch { content = { status: 'unavailable' }; }

    // ── 9. DAILY TREND (runs + leads per day) ─────────────────────
    const trend = all(`
      SELECT DATE(created_at) as date,
             COUNT(*) as runs,
             COALESCE(SUM(cost_usd), 0) as cost
      FROM runs
      WHERE DATE(created_at) >= ?
      GROUP BY DATE(created_at)
      ORDER BY date
    `, [sinceDate]);

    const leadTrend = all(`
      SELECT DATE(created_at) as date, COUNT(*) as leads
      FROM cfo_leads WHERE DATE(created_at) >= ?
      GROUP BY DATE(created_at) ORDER BY date
    `, [sinceDate]);

    // ── 10. TOP LEADS (highest urgency, actionable) ───────────────
    const topLeads = all(`
      SELECT id, company_name, contact_name, contact_email, erp_type,
             pilot_fit_score, urgency_score, status, city, state, source_agent
      FROM cfo_leads
      WHERE status IN ('new', 'contacted', 'replied')
      ORDER BY COALESCE(urgency_score, 0) DESC, pilot_fit_score DESC
      LIMIT 10
    `);

    // ── ASSEMBLE ──────────────────────────────────────────────────
    res.json({
      generated_at: new Date().toISOString(),
      lookback_days: days,
      pipeline,
      outreach,
      runs,
      costs,
      schedules,
      brain,
      email: emailStatus,
      content,
      trend: { runs: trend, leads: leadTrend },
      top_leads: topLeads,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
