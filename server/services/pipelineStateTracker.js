/**
 * @file pipelineStateTracker.js
 * @description Computes and writes pipeline_stage for every lead in both products.
 *
 * Stage ladder (Jake / CFO):
 *   New → Enriched → Dossiered → Outreached → Replied → CallBooked →
 *   Diagnostic → Committed → Closed | Dead | Stalled
 *
 * Stage ladder (HOA):
 *   New → Dossiered → Outreached → Replied → Closed | Dead | Stalled
 *
 * $0/run — pure SQL reads + writes, no LLM calls.
 * Called by:
 *   - pipelineDirector.js before every director cycle
 *   - SPECIAL_HANDLER 'pipeline_state_tracker' (manual run from UI)
 *   - scheduleRunner cron: 0 1 * * * (1 AM daily)
 */

'use strict';

const { run, get, all, getDb, saveDatabase } = require('../db/connection');
const discord = require('./discordNotifier');

/**
 * Execute a callback with all DB writes batched into a single transaction +
 * single saveDatabase() flush. 1000× faster than individual run() calls
 * for bulk updates on sql.js (which flushes to disk after every run()).
 */
function withTransaction(fn) {
  const db = getDb();
  db.run('BEGIN TRANSACTION');
  try {
    fn(db);
    db.run('COMMIT');
  } catch (err) {
    try { db.run('ROLLBACK'); } catch {}
    throw err;
  }
  saveDatabase();
}

// ── Stage thresholds (days before "stalled" flag fires) ──────────────────────
const STALL_DAYS = {
  New:          3,   // Should be enriched or dossier'd within 3 days
  Enriched:     5,   // Dossier should follow enrichment within 5 days
  Dossiered:    3,   // Outreach should fire within 3 days of dossier
  Outreached:   7,   // Follow-up after 7 days of silence
  Replied:      2,   // Next step (call/diagnostic) within 2 days of reply
  CallBooked:   5,   // Diagnostic within 5 days
  Diagnostic:  10,   // Commit/close within 10 days
  Committed:   14,   // Closed or dead within 14 days
};

// ── Stage determination logic ─────────────────────────────────────────────────

/**
 * Derive the canonical pipeline stage for a Jake/CFO lead.
 * Reads from existing columns — no extra queries needed.
 */
function deriveJakeStage(lead, sequences) {
  const s = lead.status || 'new';

  // Terminal states
  if (s === 'closed' || s === 'client')     return 'Closed';
  if (s === 'dead' || s === 'unsubscribed') return 'Dead';
  if (s === 'bounced')                      return 'Dead';

  // Positive progression (most specific → least specific)
  if (s === 'pilot' || s === 'committed')   return 'Committed';
  if (s === 'diagnostic')                   return 'Diagnostic';
  if (s === 'meeting_booked')               return 'CallBooked';
  if (s === 'replied' || s === 'nurture')   return 'Replied';

  // Contacted = at least one sequence sent
  const hasSent = sequences.some(seq => seq.status === 'sent' || seq.status === 'replied');
  if (hasSent || s === 'contacted')         return 'Outreached';

  // Dossier generated
  if (lead.dossier)                         return 'Dossiered';

  // Enriched = has email (primary signal)
  if (lead.contact_email)                   return 'Enriched';

  return 'New';
}

/**
 * Derive the canonical pipeline stage for an HOA engagement.
 */
function deriveHoaStage(eng) {
  const s = (eng.status || 'pending_review').toLowerCase();

  if (s === 'posted')                                       return 'Outreached';
  if (s === 'rejected' || s === 'expired')                  return 'Dead';

  // If we have an urgency_score and dossier, mark Dossiered
  if (eng.dossier)                                          return 'Dossiered';
  if (s === 'approved')                                     return 'Dossiered'; // approved = ready to post
  if (eng.relevance_score && eng.relevance_score >= 60)     return 'Enriched';  // high-relevance treated as enriched

  return 'New';
}

/**
 * Determine next_action and next_action_due for a Jake lead given its stage.
 */
function nextActionForJake(lead, stage, daysInStage) {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 86400000).toISOString();
  const in3Days  = new Date(now.getTime() + 3 * 86400000).toISOString();
  const in5Days  = new Date(now.getTime() + 5 * 86400000).toISOString();

  switch (stage) {
    case 'New':
      return { next_action: 'enrich', next_action_due: tomorrow };
    case 'Enriched':
      // If urgency >= 70 or pilot_fit >= 60, generate dossier; else low priority
      if ((lead.urgency_score || 0) >= 70 || (lead.pilot_fit_score || 0) >= 60) {
        return { next_action: 'generate_dossier', next_action_due: tomorrow };
      }
      return { next_action: 'generate_dossier', next_action_due: in3Days };
    case 'Dossiered':
      return { next_action: 'send_outreach', next_action_due: tomorrow };
    case 'Outreached':
      if (daysInStage >= 5) {
        return { next_action: 'follow_up', next_action_due: tomorrow };
      }
      const followUpAt = new Date(now.getTime() + (5 - daysInStage) * 86400000).toISOString();
      return { next_action: 'follow_up', next_action_due: followUpAt };
    case 'Replied':
      return { next_action: 'book_call', next_action_due: tomorrow };
    case 'CallBooked':
      return { next_action: 'run_diagnostic', next_action_due: in3Days };
    case 'Diagnostic':
      return { next_action: 'close_or_commit', next_action_due: in5Days };
    case 'Committed':
      return { next_action: 'close', next_action_due: in5Days };
    default:
      return { next_action: null, next_action_due: null };
  }
}

/**
 * Determine next_action and next_action_due for an HOA engagement.
 */
function nextActionForHoa(eng, stage, daysInStage) {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 86400000).toISOString();
  const in3Days  = new Date(now.getTime() + 3 * 86400000).toISOString();

  switch (stage) {
    case 'New':
      return { next_action: 'generate_dossier', next_action_due: tomorrow };
    case 'Enriched':
      return { next_action: 'generate_dossier', next_action_due: tomorrow };
    case 'Dossiered':
      return { next_action: 'send_outreach', next_action_due: tomorrow };
    case 'Outreached':
      if (daysInStage >= 5) {
        return { next_action: 'follow_up', next_action_due: tomorrow };
      }
      return { next_action: 'follow_up', next_action_due: in3Days };
    case 'Replied':
      return { next_action: 'book_call', next_action_due: tomorrow };
    default:
      return { next_action: null, next_action_due: null };
  }
}

// ── State computation ─────────────────────────────────────────────────────────

/**
 * Compute and persist state for a single Jake/CFO lead.
 * db parameter is optional — if provided, writes go into the caller's transaction.
 * @param {object} lead - Row from cfo_leads
 * @param {object[]} sequences - cfo_outreach_sequences for this lead
 * @param {object} [db] - sql.js db instance (for batched writes)
 * @returns {{ stage, prevStage, changed, stalled, next_action }}
 */
function computeJakeLeadState(lead, sequences, db) {
  const newStage = deriveJakeStage(lead, sequences);
  const prevStage = lead.pipeline_stage || 'New';
  const stageChanged = newStage !== prevStage;

  // Calculate days_in_stage
  let stageEnteredAt = lead.stage_entered_at;
  if (stageChanged || !stageEnteredAt) {
    stageEnteredAt = new Date().toISOString();
  }
  const daysInStage = stageEnteredAt
    ? Math.floor((Date.now() - new Date(stageEnteredAt).getTime()) / 86400000)
    : 0;

  // Check stalled
  const stallThreshold = STALL_DAYS[newStage] || 7;
  const isTerminal = ['Closed', 'Dead'].includes(newStage);
  const isStalled = !isTerminal && daysInStage > stallThreshold;

  // Determine next action
  const { next_action, next_action_due } = isTerminal
    ? { next_action: null, next_action_due: null }
    : nextActionForJake(lead, newStage, daysInStage);

  // Write back to DB (use db.run() inside transaction when provided, else standalone run())
  const writer = db
    ? (sql, params) => db.run(sql, params)
    : run;

  writer(`UPDATE cfo_leads SET
    pipeline_stage    = ?,
    stage_entered_at  = ?,
    days_in_stage     = ?,
    next_action       = ?,
    next_action_due   = ?,
    stalled           = ?,
    updated_at        = datetime('now')
    WHERE id = ?`,
    [newStage, stageEnteredAt, daysInStage, next_action, next_action_due,
     isStalled ? 1 : 0, lead.id]
  );

  // Insert pipeline_event on stage change
  if (stageChanged) {
    writer(`INSERT INTO pipeline_events (lead_id, product, from_stage, to_stage, agent, action, notes)
         VALUES (?, 'jake', ?, ?, 'pipeline-state-tracker', 'stage_change', ?)`,
      [lead.id, prevStage, newStage,
       `${lead.company_name} moved ${prevStage} \u2192 ${newStage}`]
    );
  }

  return { stage: newStage, prevStage, changed: stageChanged, stalled: isStalled, next_action, daysInStage };
}

/**
 * Compute and persist state for a single HOA engagement.
 * @param {object} eng
 * @param {object} [db] - sql.js db instance for batched writes
 */
function computeHoaLeadState(eng, db) {
  const newStage = deriveHoaStage(eng);
  const prevStage = eng.pipeline_stage || 'New';
  const stageChanged = newStage !== prevStage;

  let stageEnteredAt = eng.stage_entered_at;
  if (stageChanged || !stageEnteredAt) {
    stageEnteredAt = new Date().toISOString();
  }
  const daysInStage = stageEnteredAt
    ? Math.floor((Date.now() - new Date(stageEnteredAt).getTime()) / 86400000)
    : 0;

  const stallThreshold = STALL_DAYS[newStage] || 7;
  const isTerminal = ['Closed', 'Dead'].includes(newStage);
  const isStalled = !isTerminal && daysInStage > stallThreshold;

  const { next_action, next_action_due } = isTerminal
    ? { next_action: null, next_action_due: null }
    : nextActionForHoa(eng, newStage, daysInStage);

  const writer = db
    ? (sql, params) => db.run(sql, params)
    : run;

  writer(`UPDATE lg_engagement_queue SET
    pipeline_stage    = ?,
    stage_entered_at  = ?,
    days_in_stage     = ?,
    next_action       = ?,
    next_action_due   = ?,
    stalled           = ?,
    notes             = COALESCE(notes, '')
    WHERE id = ?`,
    [newStage, stageEnteredAt, daysInStage, next_action, next_action_due,
     isStalled ? 1 : 0, eng.id]
  );

  if (stageChanged) {
    const label = eng.post_title || eng.community || `HOA ${eng.id}`;
    writer(`INSERT INTO pipeline_events (lead_id, product, from_stage, to_stage, agent, action, notes)
         VALUES (?, 'hoa', ?, ?, 'pipeline-state-tracker', 'stage_change', ?)`,
      [eng.id, prevStage, newStage, `${label} moved ${prevStage} \u2192 ${newStage}`]
    );
  }

  return { stage: newStage, prevStage, changed: stageChanged, stalled: isStalled, next_action, daysInStage };
}

// ── Batch compute ─────────────────────────────────────────────────────────────

/**
 * Compute pipeline state for all active Jake leads.
 * @returns {{ total, changed, stalled, byStage }}
 */
function computeJakeStates() {
  const leads = all(`SELECT * FROM cfo_leads WHERE status NOT IN ('dead','closed','unsubscribed') ORDER BY pilot_fit_score DESC`);

  // Bulk-load sequences in one query to avoid N+1
  const allSequences = all(`SELECT lead_id, status FROM cfo_outreach_sequences`);
  const seqByLead = {};
  for (const s of allSequences) {
    (seqByLead[s.lead_id] = seqByLead[s.lead_id] || []).push(s);
  }

  const stats = { total: leads.length, changed: 0, stalled: 0, byStage: {} };
  const stalledLeads = [];

  withTransaction((db) => {
    for (const lead of leads) {
      try {
        const result = computeJakeLeadState(lead, seqByLead[lead.id] || [], db);
        if (result.changed) stats.changed++;
        if (result.stalled) {
          stats.stalled++;
          stalledLeads.push({ name: lead.company_name, stage: result.stage, days: result.daysInStage });
        }
        stats.byStage[result.stage] = (stats.byStage[result.stage] || 0) + 1;
      } catch (err) {
        console.error(`[PipelineTracker] Jake lead ${lead.id} (${lead.company_name}): ${err.message}`);
      }
    }
  });

  return { ...stats, stalledLeads };
}

/**
 * Compute pipeline state for all active HOA engagements.
 */
function computeHoaStates() {
  const engagements = all(`SELECT * FROM lg_engagement_queue WHERE status NOT IN ('rejected','expired') ORDER BY relevance_score DESC`);

  const stats = { total: engagements.length, changed: 0, stalled: 0, byStage: {} };
  const stalledLeads = [];

  withTransaction((db) => {
    for (const eng of engagements) {
      try {
        const result = computeHoaLeadState(eng, db);
        if (result.changed) stats.changed++;
        if (result.stalled) {
          stats.stalled++;
          stalledLeads.push({ name: eng.post_title || eng.community, stage: result.stage, days: result.daysInStage });
        }
        stats.byStage[result.stage] = (stats.byStage[result.stage] || 0) + 1;
      } catch (err) {
        console.error(`[PipelineTracker] HOA engagement ${eng.id}: ${err.message}`);
      }
    }
  });

  return { ...stats, stalledLeads };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute state for all active leads across products.
 * @param {'jake'|'hoa'|'both'} product
 * @returns {{ jake, hoa, total_stalled }}
 */
async function computeAllStates(product = 'both') {
  console.log(`[PipelineTracker] Computing states for product="${product}"...`);
  const startTime = Date.now();

  const result = { jake: null, hoa: null };

  if (product === 'jake' || product === 'both') {
    result.jake = computeJakeStates();
    console.log(`[PipelineTracker] Jake: ${result.jake.total} leads, ${result.jake.changed} changed, ${result.jake.stalled} stalled`);
    console.log(`[PipelineTracker] Jake stages: ${JSON.stringify(result.jake.byStage)}`);
  }

  if (product === 'hoa' || product === 'both') {
    result.hoa = computeHoaStates();
    console.log(`[PipelineTracker] HOA: ${result.hoa.total} leads, ${result.hoa.changed} changed, ${result.hoa.stalled} stalled`);
    console.log(`[PipelineTracker] HOA stages: ${JSON.stringify(result.hoa.byStage)}`);
  }

  const totalStalled = (result.jake?.stalled || 0) + (result.hoa?.stalled || 0);
  result.total_stalled = totalStalled;
  result.duration_ms = Date.now() - startTime;

  // Discord alert if stalled leads found
  if (totalStalled > 0) {
    const lines = [];
    if (result.jake?.stalledLeads?.length) {
      lines.push(`**Jake stalled (${result.jake.stalled}):**`);
      result.jake.stalledLeads.slice(0, 5).forEach(l =>
        lines.push(`  • ${l.name} — ${l.stage} for ${l.days}d`)
      );
    }
    if (result.hoa?.stalledLeads?.length) {
      lines.push(`**HOA stalled (${result.hoa.stalled}):**`);
      result.hoa.stalledLeads.slice(0, 5).forEach(l =>
        lines.push(`  • ${l.name || 'Engagement'} — ${l.stage} for ${l.days}d`)
      );
    }
    discord.postWebhook({
      embeds: [{
        title: `⚠️ Pipeline Stalled Leads — ${totalStalled} need attention`,
        description: lines.join('\n'),
        color: 0xff9900,
        timestamp: new Date().toISOString(),
        footer: { text: 'PipelineTracker · ClawOps' },
      }],
    }).catch(() => {});
  }

  return result;
}

/**
 * Compute state for a single Jake lead by ID.
 * @param {number} leadId
 * @param {'jake'|'hoa'} product
 */
async function computeLeadState(leadId, product = 'jake') {
  if (product === 'hoa') {
    const eng = get('SELECT * FROM lg_engagement_queue WHERE id = ?', [leadId]);
    if (!eng) throw new Error(`HOA engagement ${leadId} not found`);
    return computeHoaLeadState(eng);
  }
  const lead = get('SELECT * FROM cfo_leads WHERE id = ?', [leadId]);
  if (!lead) throw new Error(`Jake lead ${leadId} not found`);
  const sequences = all('SELECT lead_id, status FROM cfo_outreach_sequences WHERE lead_id = ?', [leadId]);
  return computeJakeLeadState(lead, sequences);
}

module.exports = { computeAllStates, computeLeadState };
