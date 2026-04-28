/**
 * @file pipeline.js (routes)
 * @description Live pipeline health dashboard + Blitz Mode.
 *
 * ENDPOINTS:
 *   GET  /api/pipeline/health  — Pipeline health summary (stages, stalled, urgent, cadence)
 *   POST /api/pipeline/blitz   — Blitz Mode: run director + cadence NOW for urgency ≥ 75 leads
 */

'use strict';

const { Router }      = require('express');
const { all, get }    = require('../db/connection');
const { authenticate } = require('../middleware/auth');
const discord          = require('../services/discordNotifier');

const router = Router();
router.use(authenticate);

// ── GET /api/pipeline/health ──────────────────────────────────────────────────

router.get('/health', async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const now   = new Date().toISOString();

    // ── Jake stats ────────────────────────────────────────────────────────────
    const jakeByStage = all(`
      SELECT pipeline_stage, COUNT(*) AS cnt
      FROM cfo_leads
      WHERE status NOT IN ('dead','closed','unsubscribed','bounced')
      GROUP BY pipeline_stage
    `);
    const jakeStageCounts = {};
    jakeByStage.forEach(r => { jakeStageCounts[r.pipeline_stage || 'New'] = r.cnt; });

    const jakeStats = get(`
      SELECT
        COUNT(*)                                               AS totalLeads,
        SUM(CASE WHEN stalled=1 THEN 1 ELSE 0 END)            AS stalled,
        SUM(CASE WHEN urgency_score>=75 THEN 1 ELSE 0 END)    AS highUrgency,
        SUM(CASE WHEN cadence_active=1 THEN 1 ELSE 0 END)     AS activeCadence
      FROM cfo_leads
      WHERE status NOT IN ('dead','closed','unsubscribed','bounced')
    `);

    // ── HOA stats ─────────────────────────────────────────────────────────────
    const hoaByStage = all(`
      SELECT pipeline_stage, COUNT(*) AS cnt
      FROM lg_engagement_queue
      WHERE status NOT IN ('rejected','expired')
      GROUP BY pipeline_stage
    `);
    const hoaStageCounts = {};
    hoaByStage.forEach(r => { hoaStageCounts[r.pipeline_stage || 'New'] = r.cnt; });

    const hoaStats = get(`
      SELECT
        COUNT(*)                                               AS totalLeads,
        SUM(CASE WHEN stalled=1 THEN 1 ELSE 0 END)            AS stalled,
        SUM(CASE WHEN relevance_score>=75 THEN 1 ELSE 0 END)  AS highUrgency,
        SUM(CASE WHEN cadence_active=1 THEN 1 ELSE 0 END)     AS activeCadence
      FROM lg_engagement_queue
      WHERE status NOT IN ('rejected','expired')
    `);

    // ── Recent activity ───────────────────────────────────────────────────────

    // Last director/cadence cycle (most recent completed run for either agent)
    const lastCycleRun = get(`
      SELECT r.completed_at
      FROM runs r
      JOIN agents a ON r.agent_id = a.id
      WHERE a.name IN ('pipeline-director','tenacity-cadence-engine')
        AND r.status = 'completed'
      ORDER BY r.completed_at DESC
      LIMIT 1
    `);

    // Cadence touches queued today
    const touchesToday = get(
      `SELECT COUNT(*) AS cnt FROM cadence_touches WHERE DATE(updated_at)=?`, [today]
    );

    // Auto-sends today: cadence touches that went to 'sent' today
    const autoSentsToday = get(
      `SELECT COUNT(*) AS cnt FROM cadence_touches WHERE status='sent' AND DATE(sent_at)=?`, [today]
    );

    // Manual approvals pending: runs with status='pending' for outreach agents
    const pendingApprovals = get(`
      SELECT COUNT(*) AS cnt
      FROM runs r
      JOIN agents a ON r.agent_id = a.id
      WHERE r.status = 'pending'
        AND a.name IN ('jake-outreach-agent','cfo-outreach-agent','jake-follow-up-agent','hoa-email-campaigns')
    `);

    // Replies today
    const repliesToday = get(
      `SELECT COUNT(*) AS cnt FROM cfo_outreach_sequences WHERE DATE(replied_at)=?`, [today]
    );

    // ── Top 10 high-urgency leads (Jake + HOA interleaved) ────────────────────
    const topJake = all(`
      SELECT id, company_name AS name, urgency_score, pipeline_stage,
             next_action_due, 'jake' AS product
      FROM cfo_leads
      WHERE urgency_score >= 75
        AND stalled = 0
        AND status NOT IN ('dead','closed','unsubscribed','bounced')
      ORDER BY urgency_score DESC
      LIMIT 8
    `);

    const topHoa = all(`
      SELECT id,
             COALESCE(post_title, community, 'HOA engagement') AS name,
             relevance_score AS urgency_score, pipeline_stage,
             next_action_due, 'hoa' AS product
      FROM lg_engagement_queue
      WHERE relevance_score >= 75
        AND stalled = 0
        AND status NOT IN ('rejected','expired')
      ORDER BY relevance_score DESC
      LIMIT 4
    `);

    // Merge and take top 10 by score
    const topLeads = [...topJake, ...topHoa]
      .sort((a, b) => (b.urgency_score || 0) - (a.urgency_score || 0))
      .slice(0, 10)
      .map(l => ({
        id:             l.id,
        company_name:   l.name,
        urgency_score:  l.urgency_score || 0,
        pipeline_stage: l.pipeline_stage || 'New',
        next_action_due:l.next_action_due,
        product:        l.product,
      }));

    res.json({
      products: {
        jake: {
          totalLeads:    jakeStats?.totalLeads    || 0,
          byStage:       jakeStageCounts,
          stalled:       jakeStats?.stalled       || 0,
          highUrgency:   jakeStats?.highUrgency   || 0,
          activeCadence: jakeStats?.activeCadence || 0,
        },
        hoa: {
          totalLeads:    hoaStats?.totalLeads    || 0,
          byStage:       hoaStageCounts,
          stalled:       hoaStats?.stalled       || 0,
          highUrgency:   hoaStats?.highUrgency   || 0,
          activeCadence: hoaStats?.activeCadence || 0,
        },
      },
      recentActivity: {
        lastCycle:              lastCycleRun?.completed_at || null,
        touchesQueuedToday:     touchesToday?.cnt    || 0,
        autoSentsToday:         autoSentsToday?.cnt  || 0,
        manualApprovalsPending: pendingApprovals?.cnt || 0,
        repliesToday:           repliesToday?.cnt    || 0,
      },
      topHighUrgencyLeads: topLeads,
      generatedAt: now,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/pipeline/blitz ──────────────────────────────────────────────────

router.post('/blitz', async (req, res, next) => {
  try {
    const { product = 'both', urgency_min = 75 } = req.body || {};
    const startTime = Date.now();

    console.log(`[PipelineBlitz] Starting blitz mode — product=${product}, urgency_min=${urgency_min}`);

    // Temporarily override the lead queries in director/cadence to high-urgency only
    // We do this by running the services directly with filtered data

    let directorResult = null;
    let cadenceResult  = null;
    let errors         = [];

    // ── Step 1: director cycle ────────────────────────────────────────────────
    try {
      const { runDirectorCycle } = require('../services/pipelineDirector');
      directorResult = await runDirectorCycle({ urgencyMin: urgency_min, blitzMode: true });
    } catch (err) {
      errors.push(`Director: ${err.message}`);
      console.error('[PipelineBlitz] Director failed:', err.message);
    }

    // ── Step 2: cadence cycle ─────────────────────────────────────────────────
    try {
      const { runCadenceCycle } = require('../services/tenacityCadenceEngine');
      cadenceResult = await runCadenceCycle(product);
    } catch (err) {
      errors.push(`Cadence: ${err.message}`);
      console.error('[PipelineBlitz] Cadence failed:', err.message);
    }

    const durationMs     = Date.now() - startTime;
    const directorQueued = directorResult?.plan?.total_actions || 0;
    const cadenceQueued  = cadenceResult?.queued               || 0;
    const autoSents      = cadenceResult?.queued               || 0; // cadence touches become pending runs

    // ── Discord summary ───────────────────────────────────────────────────────
    discord.postWebhook({
      embeds: [{
        title: '⚡ Blitz Mode Triggered',
        description: [
          `**${directorQueued + cadenceQueued}** actions dispatched`,
          `Product: ${product} | Urgency ≥ ${urgency_min}`,
        ].join('\n'),
        color: 0xff6600,
        fields: [
          { name: 'Director actions', value: String(directorQueued), inline: true },
          { name: 'Cadence touches',  value: String(cadenceQueued),  inline: true },
          { name: 'Duration',         value: `${(durationMs/1000).toFixed(1)}s`, inline: true },
          errors.length ? { name: 'Errors', value: errors.join('\n'), inline: false } : null,
        ].filter(Boolean),
        timestamp: new Date().toISOString(),
        footer: { text: 'PipelineBlitz · ClawOps' },
      }],
    }).catch(e => console.warn('[Pipeline] notify failed:', e.message));

    // Emit socket.io event so PipelineHealth page refreshes live
    try {
      const io = req.app.get('io');
      if (io) io.emit('pipeline-update', { blitz: true, queued: directorQueued + cadenceQueued });
    } catch {}

    res.json({
      success: true,
      queued:          directorQueued + cadenceQueued,
      autoSent:        autoSents,
      pendingApproval: directorQueued,
      durationMs,
      errors: errors.length ? errors : undefined,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
