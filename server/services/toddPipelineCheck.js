/**
 * @file toddPipelineCheck.js
 * @description Todd — Pipeline Commander. Runs every 2 hours.
 *
 * Todd's contract (from AGENT_CONTRACTS.md):
 *   - Force-activate enriched leads >24h not in cadence
 *   - Hot lead escalation: score >70 → Discord alert, >85 → CRITICAL
 *   - Stalled lead intervention: stuck >48h → flag, re-route, or re-enrich
 *   - Agent health monitoring: failed schedules → alert
 *
 * Morning briefing (7 AM):
 *   - Pipeline snapshot: leads at each stage
 *   - Stuck items, hot leads, core KPIs
 *   - Posts to Discord
 *
 * $0/run — pure SQL, no LLM.
 */

'use strict';

const { get, all, run } = require('../db/connection');

/**
 * Todd's pipeline monitoring cycle. Runs every 2 hours.
 * Returns summary of actions taken.
 */
function toddPipelineMonitor() {
  const actions = [];
  const now = new Date().toISOString();

  // ── 1. Force-activate enriched leads >24h not in cadence ────────────────
  let activated = 0;
  try {
    const stuck = all(`
      SELECT id, company_name, contact_email
      FROM cfo_leads
      WHERE enrichment_status = 'enriched'
        AND contact_email IS NOT NULL
        AND (cadence_active IS NULL OR cadence_active = 0)
        AND (status IS NULL OR status NOT IN ('interested', 'unsubscribed', 'bounced', 'converted', 'disqualified'))
        AND created_at < datetime('now', '-1 day')
      ORDER BY urgency_score DESC
      LIMIT 100
    `);

    for (const lead of stuck) {
      run(`UPDATE cfo_leads SET cadence_active = 1, next_touch_due = datetime('now'),
           last_touch_number = 0, status = CASE WHEN status IN ('new','discovered') THEN 'queued' ELSE status END,
           updated_at = datetime('now') WHERE id = ?`, [lead.id]);
      activated++;
    }

    if (activated > 0) {
      actions.push({ type: 'force_activate', count: activated, detail: `${activated} enriched leads >24h forced into cadence` });
    }
  } catch (err) {
    actions.push({ type: 'error', detail: `Force-activate failed: ${err.message}` });
  }

  // ── 2. Hot lead escalation (urgency score >70) ──────────────────────────
  let hotLeads = [];
  try {
    hotLeads = all(`
      SELECT id, company_name, contact_name, contact_title, urgency_score, city, state, erp_type
      FROM cfo_leads
      WHERE urgency_score > 70
        AND status NOT IN ('contacted', 'replied', 'meeting_booked', 'pilot', 'closed_won', 'closed_lost', 'disqualified')
        AND cadence_active = 1
      ORDER BY urgency_score DESC
      LIMIT 10
    `);

    if (hotLeads.length > 0) {
      actions.push({ type: 'hot_leads', count: hotLeads.length, leads: hotLeads.map(l => ({
        id: l.id, company: l.company_name, score: l.urgency_score, title: l.contact_title,
        location: [l.city, l.state].filter(Boolean).join(', '),
      }))});

      // Discord alert for hot leads
      try {
        const discord = require('./discordNotifier');
        const critical = hotLeads.filter(l => l.urgency_score > 85);
        const important = hotLeads.filter(l => l.urgency_score <= 85);

        if (critical.length > 0) {
          discord.postWebhook({
            embeds: [{
              title: `🔴 CRITICAL: ${critical.length} Hot Lead${critical.length > 1 ? 's' : ''} (score >85)`,
              color: 0xff0000,
              description: critical.map(l => `**${l.company_name}** — ${l.contact_title || 'Unknown'} (${l.urgency_score}/100)\n${[l.city, l.state].filter(Boolean).join(', ')}`).join('\n\n'),
              timestamp: now,
              footer: { text: 'Todd · Pipeline Commander' },
            }],
          }).catch(() => {});
        }

        if (important.length > 0) {
          discord.postWebhook({
            embeds: [{
              title: `🟡 ${important.length} Hot Lead${important.length > 1 ? 's' : ''} (score >70)`,
              color: 0xffaa00,
              description: important.map(l => `${l.company_name} — ${l.urgency_score}/100`).join('\n'),
              timestamp: now,
              footer: { text: 'Todd · Pipeline Commander' },
            }],
          }).catch(() => {});
        }
      } catch {}
    }
  } catch (err) {
    actions.push({ type: 'error', detail: `Hot lead check failed: ${err.message}` });
  }

  // ── 3. Stalled leads >48h ──────────────────────────────────────────────
  let stalledCount = 0;
  try {
    const stalled = all(`
      SELECT id, company_name, status, updated_at
      FROM cfo_leads
      WHERE cadence_active = 1
        AND status NOT IN ('disqualified', 'closed_won', 'closed_lost', 'unsubscribed', 'bounced')
        AND updated_at < datetime('now', '-2 days')
      ORDER BY updated_at ASC
      LIMIT 20
    `);
    stalledCount = stalled.length;

    if (stalledCount > 0) {
      actions.push({ type: 'stalled_leads', count: stalledCount, detail: `${stalledCount} leads stalled >48h` });
    }
  } catch {}

  // ── 4. Agent health check — failed runs in last 2 hours ────────────────
  let failedRuns = 0;
  try {
    const failed = get("SELECT COUNT(*) as c FROM runs WHERE status = 'failed' AND created_at > datetime('now', '-2 hours')");
    failedRuns = failed?.c || 0;
    if (failedRuns > 0) {
      actions.push({ type: 'failed_runs', count: failedRuns, detail: `${failedRuns} agent runs failed in last 2 hours` });
    }
  } catch {}

  // ── Log to audit_log ───────────────────────────────────────────────────
  try {
    run(
      "INSERT INTO audit_log (action, resource, details, created_at) VALUES ('todd_pipeline_check', 'system', ?, datetime('now'))",
      [JSON.stringify({ activated, hotLeads: hotLeads.length, stalledCount, failedRuns, actions: actions.length })]
    );
  } catch {}

  return {
    activated,
    hotLeads: hotLeads.length,
    stalledLeads: stalledCount,
    failedRuns,
    actions,
    timestamp: now,
  };
}

/**
 * Todd's morning briefing. Produces a pipeline snapshot for Discord.
 */
function toddMorningBriefing() {
  const monitor = toddPipelineMonitor(); // Run the monitor first

  // Gather the 5 core KPIs
  const kpis = getCorKPIs();

  // Pipeline snapshot
  const pipeline = {};
  try {
    const stages = all("SELECT status, COUNT(*) as c FROM cfo_leads WHERE status IS NOT NULL GROUP BY status ORDER BY c DESC");
    for (const s of stages) pipeline[s.status] = s.c;
  } catch {}

  const totalLeads = get("SELECT COUNT(*) as c FROM cfo_leads")?.c || 0;
  const inCadence = get("SELECT COUNT(*) as c FROM cfo_leads WHERE cadence_active = 1")?.c || 0;

  // Build briefing text
  const lines = [
    `📊 **MORNING BRIEFING** — ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`,
    '',
    '**Pipeline Snapshot:**',
    `  Total leads: ${totalLeads} | In cadence: ${inCadence}`,
    ...Object.entries(pipeline).map(([status, count]) => `  ${status}: ${count}`),
    '',
    '**Core KPIs:**',
    `  1. Activation rate (24h): ${kpis.activationRate}% (target: >80%)`,
    `  2. Reply rate (7d): ${kpis.replyRate}% (target: >2%)`,
    `  3. Meetings booked (14d): ${kpis.meetingsBooked} (target: 3+)`,
    `  4. Cost per meeting: ${kpis.costPerMeeting}`,
    `  5. Stalled leads >48h: ${kpis.stalledLeads} (target: <10)`,
    '',
  ];

  if (monitor.activated > 0) lines.push(`✅ Force-activated ${monitor.activated} stuck leads`);
  if (monitor.hotLeads > 0) lines.push(`🔥 ${monitor.hotLeads} hot leads detected (score >70)`);
  if (monitor.stalledLeads > 0) lines.push(`⚠️ ${monitor.stalledLeads} leads stalled >48h`);
  if (monitor.failedRuns > 0) lines.push(`❌ ${monitor.failedRuns} agent runs failed overnight`);
  if (monitor.actions.length === 0) lines.push('✅ All systems nominal');

  const briefingText = lines.join('\n');

  // Post to Discord
  try {
    const discord = require('./discordNotifier');
    discord.postWebhook({
      embeds: [{
        title: '🏢 Todd — Morning Briefing',
        description: briefingText,
        color: 0x3b82f6,
        timestamp: new Date().toISOString(),
        footer: { text: 'Todd · Pipeline Commander · ClawOps' },
      }],
    }).catch(() => {});
  } catch {}

  return { briefingText, monitor, kpis, pipeline };
}

/**
 * The 5 core KPIs from the Operating Constitution.
 */
function getCorKPIs() {
  // KPI 1: % enriched leads activated within 24h
  let activationRate = 0;
  try {
    const enriched24h = get("SELECT COUNT(*) as c FROM cfo_leads WHERE enrichment_status = 'enriched' AND created_at > datetime('now', '-1 day')")?.c || 0;
    const activated24h = get("SELECT COUNT(*) as c FROM cfo_leads WHERE enrichment_status = 'enriched' AND cadence_active = 1 AND created_at > datetime('now', '-1 day')")?.c || 0;
    activationRate = enriched24h > 0 ? Math.round((activated24h / enriched24h) * 100) : 100;
  } catch {}

  // KPI 2: Positive reply rate (7-day rolling)
  let replyRate = 0;
  try {
    const sent7d = get("SELECT COUNT(*) as c FROM cfo_outreach_sequences WHERE status IN ('sent','delivered') AND sent_at > datetime('now', '-7 days')")?.c || 0;
    const replied7d = get("SELECT COUNT(*) as c FROM cfo_leads WHERE status IN ('replied','meeting_booked','pilot','closed_won') AND updated_at > datetime('now', '-7 days')")?.c || 0;
    replyRate = sent7d > 0 ? Math.round((replied7d / sent7d) * 100 * 10) / 10 : 0;
  } catch {}

  // KPI 3: Meetings booked (14-day cumulative)
  let meetingsBooked = 0;
  try {
    meetingsBooked = get("SELECT COUNT(*) as c FROM cfo_leads WHERE status IN ('meeting_booked','pilot','closed_won') AND updated_at > datetime('now', '-14 days')")?.c || 0;
  } catch {}

  // KPI 4: Cost per meeting
  let costPerMeeting = 'N/A';
  try {
    const totalCost14d = get("SELECT COALESCE(SUM(cost_usd), 0) as c FROM runs WHERE created_at > datetime('now', '-14 days')")?.c || 0;
    costPerMeeting = meetingsBooked > 0 ? `$${(totalCost14d / meetingsBooked).toFixed(2)}` : `$${totalCost14d.toFixed(2)} (0 meetings)`;
  } catch {}

  // KPI 5: Stalled leads >48h
  let stalledLeads = 0;
  try {
    stalledLeads = get("SELECT COUNT(*) as c FROM cfo_leads WHERE cadence_active = 1 AND status NOT IN ('disqualified','closed_won','closed_lost','unsubscribed','bounced') AND updated_at < datetime('now', '-2 days')")?.c || 0;
  } catch {}

  return { activationRate, replyRate, meetingsBooked, costPerMeeting, stalledLeads };
}

module.exports = { toddPipelineMonitor, toddMorningBriefing, getCorKPIs };
