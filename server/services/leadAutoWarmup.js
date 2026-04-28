/**
 * @file leadAutoWarmup.js
 * @description Bridges the gap between enrichment and outreach.
 *
 * When jake-contact-enricher finds an email for a lead, the lead sits idle
 * until someone manually triggers outreach. This service automatically queues
 * enriched leads into the tenacity cadence engine so first-touch emails go
 * out on the next cadence cycle.
 *
 * Also catches "stale" leads — contacted once but then dropped — and
 * reactivates their cadence so nothing falls through the cracks.
 *
 * $0/run — no LLM, pure SQL.
 */

'use strict';

const { get, all, run } = require('../db/connection');
const discordNotifier     = require('./discordNotifier');

// ── 1. Activate newly enriched leads ────────────────────────────────────────

function activateNewLeads(maxPerCycle = 20) {
  // CRAP playbook: quality over quantity. Only qualified leads enter cadence.
  // - Must have a title (no blind emails)
  // - Must score >70 (CRAP rubric) OR be manually approved
  // - Cap at 20/cycle (10-20 new first-touches/day)
  // - Prioritize by score (best leads first)
  const leads = all(`
    SELECT l.id, l.company_name, l.contact_email, l.status, l.urgency_score, l.contact_title
    FROM cfo_leads l
    WHERE l.enrichment_status = 'enriched'
      AND l.contact_email IS NOT NULL
      AND l.contact_title IS NOT NULL AND l.contact_title != ''
      AND (l.cadence_active IS NULL OR l.cadence_active = 0)
      AND (l.status IS NULL OR l.status NOT IN ('interested', 'unsubscribed', 'bounced', 'converted', 'disqualified'))
      AND (l.urgency_score >= 70 OR l.pilot_fit_score >= 70)
    ORDER BY l.urgency_score DESC, l.pilot_fit_score DESC, l.created_at ASC
    LIMIT ?
  `, [maxPerCycle]);

  if (!leads || leads.length === 0) {
    return { activated: 0, leads: [] };
  }

  const activated = [];

  for (const lead of leads) {
    const newStatus = (!lead.status || lead.status === 'new' || lead.status === 'discovered')
      ? 'queued'
      : lead.status;

    run(`
      UPDATE cfo_leads
      SET cadence_active   = 1,
          next_touch_due   = datetime('now'),
          last_touch_number = 0,
          status           = ?,
          updated_at       = datetime('now')
      WHERE id = ?
    `, [newStatus, lead.id]);

    console.log(`[AutoWarmup] Activated lead: ${lead.company_name} (${lead.contact_email})`);
    activated.push({ id: lead.id, company: lead.company_name, email: lead.contact_email });
  }

  return { activated: activated.length, leads: activated };
}

// ── 2. Check and reactivate stale leads ─────────────────────────────────────

function checkStaleLeads() {
  // Find contacted leads whose cadence is off and last activity was > 7 days ago
  const leads = all(`
    SELECT l.id, l.company_name, l.contact_email,
           COALESCE(
             (SELECT MAX(ct.sent_at) FROM cadence_touches ct WHERE ct.lead_id = l.id),
             l.updated_at
           ) AS last_activity
    FROM cfo_leads l
    WHERE l.status = 'contacted'
      AND (l.cadence_active IS NULL OR l.cadence_active = 0)
      AND l.contact_email IS NOT NULL
      AND julianday('now') - julianday(
        COALESCE(
          (SELECT MAX(ct.sent_at) FROM cadence_touches ct WHERE ct.lead_id = l.id),
          l.updated_at
        )
      ) > 7
  `);

  if (!leads || leads.length === 0) {
    return { reactivated: 0, leads: [] };
  }

  const reactivated = [];

  for (const lead of leads) {
    const daysSinceContact = Math.floor(
      (Date.now() - new Date(lead.last_activity).getTime()) / 86400000
    );

    run(`
      UPDATE cfo_leads
      SET cadence_active = 1,
          next_touch_due = datetime('now'),
          updated_at     = datetime('now')
      WHERE id = ?
    `, [lead.id]);

    console.log(`[AutoWarmup] Reactivated stale lead: ${lead.company_name} (last contact ${daysSinceContact}d ago)`);
    reactivated.push({ id: lead.id, company: lead.company_name, daysSinceContact });
  }

  return { reactivated: reactivated.length, leads: reactivated };
}

// ── 3. Combined warmup cycle ────────────────────────────────────────────────

async function runWarmupCycle() {
  const newResult   = activateNewLeads();
  const staleResult = checkStaleLeads();

  const results = {
    activated: newResult.activated,
    reactivated: staleResult.reactivated,
    newLeads: newResult.leads,
    staleLeads: staleResult.leads,
  };

  // Discord notification if anything happened
  if (results.activated > 0 || results.reactivated > 0) {
    discordNotifier.sendEmbed({
      title: 'Lead Auto-Warmup',
      color: 0xf59e0b,
      fields: [
        { name: 'New Leads Activated', value: String(results.activated), inline: true },
        { name: 'Stale Leads Reactivated', value: String(results.reactivated), inline: true },
      ],
      timestamp: new Date().toISOString(),
    }).catch(e => console.warn('[LeadAutoWarmup] notify failed:', e.message));
  }

  return results;
}

module.exports = { activateNewLeads, checkStaleLeads, runWarmupCycle };
