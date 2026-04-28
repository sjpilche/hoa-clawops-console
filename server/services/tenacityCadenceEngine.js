/**
 * @file tenacityCadenceEngine.js
 * @description Adaptive multi-touch persistence layer.
 *
 * Supports BOTH Jake (cfo_leads) and HOA (lg_engagement_queue) symmetrically.
 *
 * Default cadence schedule (12 touches max):
 *   Touch 1 → Day  0  (initial outreach)      — email
 *   Touch 2 → +5d     (first follow-up)       — email
 *   Touch 3 → +4d     (second follow-up)      — linkedin
 *   Touch 4 → +7d     (longer pause)          — email
 *   Touch 5 → +5d     (firm tone starts)      — email
 *   Touch 6 → +7d                             — sms (if enriched)
 *   Touch 7 → +10d    (authority + urgency)   — email
 *   Touch 8 → +7d                             — linkedin
 *   Touch 9 → +14d    (long pause)            — email
 *   Touch 10→ +7d                             — email
 *   Touch 11→ +10d    (last effort)           — email
 *   Touch 12→ +5d     (breakup email)         — email
 *
 * Brain v2 adjustments:
 *   - High urgency_score (>=70) compresses gaps by 30%
 *   - Winning episodes for same market/erp shift the tone
 *   - Channel rotates based on enrichment (linkedin only if has URL, sms only if has phone)
 *
 * $0/run — no LLM in this file; LLM calls are queued as pending runs.
 */

'use strict';

const { run, get, all }  = require('../db/connection');
const discord             = require('./discordNotifier');

// ── Default 12-touch schedule ─────────────────────────────────────────────────
// wait_days: days after previous touch
// tone: 'friendly' | 'firm' | 'urgent'
// channel: 'email' | 'linkedin' | 'sms'
const DEFAULT_CADENCE = [
  { touch: 1,  wait_days: 0,  tone: 'friendly', channel: 'email'    },
  { touch: 2,  wait_days: 5,  tone: 'friendly', channel: 'email'    },
  { touch: 3,  wait_days: 4,  tone: 'friendly', channel: 'linkedin' },
  { touch: 4,  wait_days: 7,  tone: 'firm',     channel: 'email'    },
  { touch: 5,  wait_days: 5,  tone: 'firm',     channel: 'email'    },
  { touch: 6,  wait_days: 7,  tone: 'firm',     channel: 'sms'      },
  { touch: 7,  wait_days: 10, tone: 'firm',     channel: 'email'    },
  { touch: 8,  wait_days: 7,  tone: 'urgent',   channel: 'linkedin' },
  { touch: 9,  wait_days: 14, tone: 'urgent',   channel: 'email'    },
  { touch: 10, wait_days: 7,  tone: 'urgent',   channel: 'email'    },
  { touch: 11, wait_days: 10, tone: 'urgent',   channel: 'email'    },
  { touch: 12, wait_days: 5,  tone: 'urgent',   channel: 'email'    },
];

// ── Channel eligibility ───────────────────────────────────────────────────────

function eligibleChannel(lead, desiredChannel) {
  if (desiredChannel === 'linkedin' && !lead.contact_linkedin) return 'email';
  if (desiredChannel === 'sms'      && !lead.phone)            return 'email';
  return desiredChannel;
}

// ── Brain episode lookup (Azure + Chroma RAG) ─────────────────────────────────

async function getBrainAdjustments(lead, product) {
  try {
    const brain      = require('./collectiveBrain');
    const chromaBrain = require('./chromaBrain');
    const market    = [lead.city, lead.state].filter(Boolean).join(', ') || null;
    const erpCtx    = lead.erp_type || null;

    // Primary: Azure SQL episodes
    const azureEpisodes = await brain.getSimilarEpisodes({
      market,
      erpContext:  erpCtx,
      minScore:    0.7,
      limit:       5,
    });

    // Supplement with Chroma semantic search for timing patterns
    let chromaEpisodes = [];
    if (chromaBrain.isReady()) {
      const queryText = `cadence timing for ${erpCtx || 'construction'} company in ${market || 'unknown'} outreach follow-up`;
      const chromaResults = await chromaBrain.queryRelevant(queryText, 3, {
        outcome_score_min: 0.7,
        collection: 'episodes',
      });
      chromaEpisodes = chromaResults.map(r => ({
        days_to_outcome: r.metadata.days_to_outcome || null,
        outcome_type:    r.metadata.outcome_type    || null,
        outcome_score:   r.metadata.outcome_score   || 0,
      }));
    }

    const episodes = [...azureEpisodes, ...chromaEpisodes];

    if (episodes.length === 0) return { compress: false, preferredTone: null, medianDays: null };

    // Median days_to_outcome from all winning episodes (Azure + Chroma)
    const daysList = episodes.map(e => e.days_to_outcome).filter(d => d != null && d > 0);
    const medianDays = daysList.length > 0
      ? daysList.sort((a, b) => a - b)[Math.floor(daysList.length / 2)]
      : null;

    // Most common outcome_type
    const typeCounts = {};
    episodes.forEach(e => { typeCounts[e.outcome_type] = (typeCounts[e.outcome_type] || 0) + 1; });
    const bestType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    // Preferred tone: if most wins came from 'replied'/'booked' at touch 2-3, stay friendly
    const preferredTone = (bestType === 'replied' || bestType === 'booked') ? 'friendly' : null;

    return {
      compress:       false,
      preferredTone,
      medianDays,
      episodeCount:   episodes.length,
      chromaSupplied: chromaEpisodes.length,
    };
  } catch {
    return { compress: false, preferredTone: null, medianDays: null };
  }
}

// ── Core: compute cadence parameters for one lead ────────────────────────────

/**
 * Compute adaptive cadence schedule for a single lead.
 *
 * @param {number} leadId
 * @param {'jake'|'hoa'} product
 * @returns {Promise<{
 *   wait_days_next: number,
 *   tone: string,
 *   channel: string,
 *   channel_sequence: string[],
 *   rationale: string,
 *   next_touch_number: number,
 *   next_touch_due: string,
 * }>}
 */
async function computeCadenceForLead(leadId, product = 'jake') {
  const table = product === 'hoa' ? 'lg_engagement_queue' : 'cfo_leads';
  const lead  = get(`SELECT * FROM ${table} WHERE id = ?`, [leadId]);
  if (!lead) throw new Error(`Lead ${leadId} not found in ${table}`);

  const lastTouch = lead.last_touch_number || 0;
  const nextTouchNumber = Math.min(lastTouch + 1, 12);
  const step = DEFAULT_CADENCE[nextTouchNumber - 1] || DEFAULT_CADENCE[11];

  // Base wait and channel
  let waitDays = step.wait_days;
  let tone     = step.tone;
  let channel  = eligibleChannel(lead, step.channel);

  // Urgency compression: high-urgency leads get 30% shorter waits (min 1 day)
  const urgency = lead.urgency_score || 0;
  const rationale_parts = [];
  if (urgency >= 70) {
    waitDays = Math.max(1, Math.round(waitDays * 0.7));
    rationale_parts.push(`urgency ${urgency} → compressed wait to ${waitDays}d`);
  }

  // Brain adjustments
  const brainAdj = await getBrainAdjustments(lead, product);
  if (brainAdj.preferredTone && nextTouchNumber <= 3) {
    tone = brainAdj.preferredTone;
    rationale_parts.push(`brain: ${brainAdj.episodeCount} winning episodes prefer ${tone} tone`);
  }
  if (brainAdj.medianDays && nextTouchNumber === 2) {
    // Align touch-2 timing with what actually worked
    const brainWait = Math.max(2, Math.min(brainAdj.medianDays, 14));
    if (Math.abs(brainWait - waitDays) >= 2) {
      waitDays = brainWait;
      rationale_parts.push(`brain: median reply in ${brainAdj.medianDays}d → adjusted wait to ${waitDays}d`);
    }
  }

  if (rationale_parts.length === 0) {
    rationale_parts.push(`default cadence step ${nextTouchNumber}: +${waitDays}d, ${tone}, ${channel}`);
  }

  // next_touch_due
  const nextTouchDue = new Date(Date.now() + waitDays * 86400000).toISOString();

  // Full channel sequence for context
  const channelSequence = DEFAULT_CADENCE.slice(0, 12).map(s => eligibleChannel(lead, s.channel));

  return {
    wait_days_next:   waitDays,
    tone,
    channel,
    channel_sequence: channelSequence,
    rationale:        rationale_parts.join('; '),
    next_touch_number: nextTouchNumber,
    next_touch_due:   nextTouchDue,
  };
}

// ── Build cadence message for outreach/follow-up agent ───────────────────────

/**
 * Assemble the message payload for a cadence-driven outreach/follow-up agent run.
 * Prepends dossier + cadence rationale + brain examples to give the LLM full context.
 *
 * @param {number} leadId
 * @param {'jake'|'hoa'} product
 * @param {number} touchNumber
 * @returns {Promise<string>} JSON string — message for the outreach/follow-up agent
 */
async function buildCadenceMessage(leadId, product = 'jake', touchNumber) {
  const table = product === 'hoa' ? 'lg_engagement_queue' : 'cfo_leads';
  const lead  = get(`SELECT * FROM ${table} WHERE id = ?`, [leadId]);
  if (!lead) throw new Error(`Lead ${leadId} not found in ${table}`);

  const step    = DEFAULT_CADENCE[touchNumber - 1] || DEFAULT_CADENCE[11];
  const isFirst = touchNumber === 1;
  const tone    = step.tone;

  // Previous touches for context
  const prevTouches = all(
    `SELECT touch_number, channel, status, sent_at FROM cadence_touches
     WHERE lead_id = ? AND product = ? ORDER BY touch_number ASC`,
    [leadId, product]
  );

  // Brain: pull similar winning episodes (Azure SQL)
  let brainExamples = '';
  try {
    const brain  = require('./collectiveBrain');
    const market = [lead.city, lead.state].filter(Boolean).join(', ');
    brainExamples = await brain.getEpisodesPromptBlock({
      market,
      erpContext: lead.erp_type || null,
      minScore:   0.65,
      limit:      2,
    });
  } catch { /* non-fatal */ }

  // Chroma RAG: semantic pattern matches for this lead profile
  let chromaPatterns = '';
  try {
    const chromaBrain = require('./chromaBrain');
    if (chromaBrain.isReady()) {
      const market    = [lead.city, lead.state].filter(Boolean).join(', ') || 'unknown';
      const erp       = lead.erp_type || 'construction';
      const toneCtx   = tone === 'friendly' ? 'warm introduction' : tone === 'firm' ? 'follow-up persistence' : 'final attempt urgency';
      const queryText = `touch ${touchNumber} ${toneCtx} outreach ${erp} ${market} winning response`;

      const ragResults = await chromaBrain.queryRelevant(queryText, 2, {
        outcome_score_min: 0.65,
        collection: 'both',
      });

      if (ragResults.length > 0) {
        const patternLines = ragResults.map((r, i) => {
          const meta    = r.metadata || {};
          const mkt     = meta.market        || 'similar market';
          const erpTag  = meta.erp           ? ` (${meta.erp})` : '';
          const score   = meta.outcome_score != null ? ` — ${Math.round(meta.outcome_score * 100)}% confidence` : '';
          const days    = meta.days_to_outcome ? ` in ${meta.days_to_outcome}d` : '';
          const type    = meta.outcome_type   || meta.content_type || 'outcome';
          // First 120 chars of actual content for context
          const snippet = r.content.replace(/\n/g, ' ').slice(0, 120);
          return `Pattern ${i + 1}: ${mkt}${erpTag} → ${type}${days}${score}\n  Context: "${snippet}..."`;
        });
        chromaPatterns = `\n\nCHROMA RAG — Use these winning patterns:\n${patternLines.join('\n')}`;
      }
    }
  } catch { /* non-fatal */ }

  // Dossier content if available
  const dossierText = lead.dossier
    ? `\n\nLEAD DOSSIER:\n${lead.dossier.slice(0, 1500)}`
    : '';

  // Cadence context
  const touchHistory = prevTouches.length > 0
    ? prevTouches.map(t => `  Touch ${t.touch_number}: ${t.channel} on ${(t.sent_at || '?').slice(0,10)} — ${t.status}`).join('\n')
    : '  (no previous touches)';

  const cadenceContext = [
    `\n\nCADENCE CONTEXT:`,
    `  Touch number: ${touchNumber} of 12`,
    `  Tone: ${tone} (touches 1–2 = friendly, 3–5 = firm, 6+ = urgent)`,
    `  Channel: ${step.channel}`,
    `  Is first outreach: ${isFirst}`,
    `  Previous touches:\n${touchHistory}`,
  ].join('\n');

  // Select pilot offer based on lead signals + touch number
  let pilotOffer = null;
  let pilotContext = '';
  if (product === 'jake' || product === 'cfo') {
    pilotOffer = 'spend_leak'; // Default: $490 Spend Leak Finder (lowest friction)
    if (lead.erp_type && /Vista|Sage/i.test(lead.erp_type) && touchNumber >= 4) {
      pilotOffer = 'close_acceleration'; // Upsell for known ERP users on later touches
    }
    const offerDetails = {
      spend_leak: { name: 'Spend Leak Finder', price: '$490', duration: '7 days', hook: 'A real CFO and AI agents dig into your data for 7 days — we find duplicate payments, recurring overcharges, and vendor consolidation opportunities that your team is too busy to catch' },
      close_acceleration: { name: 'Close Acceleration', price: '$950', duration: '10 days', hook: 'We bring the CFO brain and the automation — most clients cut 3-5 days off their month-end close because the agents handle the reconciliation work that used to take your team all week' },
      get_paid_faster: { name: 'AR Acceleration', price: '$750', duration: '14 days', hook: 'AI agents hunt your stuck invoices every morning while a real CFO fixes the process underneath — clients typically recover 15-30% of aged AR in the first two weeks' },
    };
    const offer = offerDetails[pilotOffer];
    pilotContext = `\n\nPILOT OFFER — Include this naturally in the email:\n  Offer: ${offer.name} (${offer.price}, ${offer.duration})\n  Hook: "${offer.hook}"\n  Tone: Position as a low-risk diagnostic, not a sales pitch. Make it feel like a favor, not an ask.`;
  }

  // Assemble the full agent message payload
  const payload = {
    lead_id:      leadId,
    product,
    company_name: lead.company_name || lead.community || `${product}#${leadId}`,
    contact_name: lead.contact_name || null,
    contact_title:lead.contact_title || null,
    erp_type:     lead.erp_type || null,
    city:         lead.city || null,
    state:        lead.state || null,
    touch_number: touchNumber,
    tone,
    channel:      step.channel,
    is_first:     isFirst,
    auto_queued:  true,
    pilot_offer:  pilotOffer,
    cadence_context: cadenceContext + dossierText + brainExamples + chromaPatterns + pilotContext,
  };

  return JSON.stringify(payload);
}

// ── Run a full cadence cycle ──────────────────────────────────────────────────

/**
 * Find all leads with cadence_active=1 and next_touch_due <= now.
 * Queue appropriate handler (outreach or follow-up) for each.
 *
 * @param {'jake'|'hoa'|'both'} product
 * @returns {Promise<{queued: number, skipped: number, errors: number, details: object[]}>}
 */
async function runCadenceCycle(product = 'both') {
  const startTime = Date.now();
  const now       = new Date().toISOString();
  const MAX_CYCLE = 25; // safety cap
  const details   = [];
  let queued = 0, skipped = 0, errors = 0, opened = 0;

  const { v4: uuidv4 } = require('uuid');

  function getSystemUserId() {
    try { return get('SELECT id FROM users LIMIT 1')?.id || 'system'; } catch { return 'system'; }
  }

  function queueRun(agentName, message, userId) {
    try {
      const agent = get('SELECT * FROM agents WHERE name = ?', [agentName]);
      if (!agent) return null;
      const runId = uuidv4();
      run(
        `INSERT INTO runs (id, agent_id, user_id, status, trigger, result_data, created_at, updated_at)
         VALUES (?, ?, ?, 'pending', 'cadence', ?, datetime('now'), datetime('now'))`,
        [runId, agent.id, userId,
         JSON.stringify({ sessionId: runId, message, output: null, outputText: '' })]
      );
      return runId;
    } catch (err) {
      console.error(`[Cadence] queueRun failed for ${agentName}:`, err.message);
      return null;
    }
  }

  const userId = getSystemUserId();

  // ── Jake pipeline ──────────────────────────────────────────────────────────
  if (product === 'jake' || product === 'both') {
    const jakeLeads = all(`
      SELECT * FROM cfo_leads
      WHERE cadence_active = 1
        AND (next_touch_due IS NULL OR next_touch_due <= ?)
        AND last_touch_number < 12
        AND status NOT IN ('dead','closed','unsubscribed','bounced','replied','meeting_booked','pilot')
      ORDER BY urgency_score DESC, pilot_fit_score DESC
      LIMIT ?
    `, [now, MAX_CYCLE]);

    for (const lead of jakeLeads) {
      if (queued + errors >= MAX_CYCLE) break;
      try {
        const cadence = await computeCadenceForLead(lead.id, 'jake');
        const msg     = await buildCadenceMessage(lead.id, 'jake', cadence.next_touch_number);
        const isFirst = cadence.next_touch_number === 1;
        const agentName = isFirst
          ? (lead.source_agent === 'cfo' ? 'cfo-outreach-agent' : 'jake-outreach-agent')
          : 'jake-follow-up-agent';

        const runId = queueRun(agentName, msg, userId);
        if (runId) {
          // Record the touch (status=pending until agent confirms send)
          run(
            `INSERT INTO cadence_touches (lead_id, product, touch_number, channel, status, rationale, run_id, updated_at)
             VALUES (?, 'jake', ?, ?, 'pending', ?, ?, datetime('now'))`,
            [lead.id, cadence.next_touch_number, cadence.channel, cadence.rationale, runId]
          );
          // Advance lead state
          run(
            `UPDATE cfo_leads SET last_touch_number=?, next_touch_due=?, updated_at=datetime('now') WHERE id=?`,
            [cadence.next_touch_number, cadence.next_touch_due, lead.id]
          );
          details.push({ leadId: lead.id, product: 'jake', touch: cadence.next_touch_number, channel: cadence.channel, agent: agentName });
          queued++;
        } else {
          skipped++;
        }
      } catch (err) {
        errors++;
        console.error(`[Cadence] Jake lead ${lead.id} (${lead.company_name}): ${err.message}`);
        try {
          discord.postWebhook({
            embeds: [{
              title: '❌ Cadence Engine Error',
              description: `Jake lead #${lead.id} (${lead.company_name}): ${err.message}`,
              color: 0xff3333,
              footer: { text: 'TenacityCadenceEngine · ClawOps' },
            }],
          }).catch(e => console.warn('[Cadence] notify failed:', e.message));
        } catch {}
      }
    }
  }

  // ── HOA pipeline ──────────────────────────────────────────────────────────
  if (product === 'hoa' || product === 'both') {
    const hoaLeads = all(`
      SELECT * FROM lg_engagement_queue
      WHERE cadence_active = 1
        AND (next_touch_due IS NULL OR next_touch_due <= ?)
        AND last_touch_number < 12
        AND status NOT IN ('rejected','expired','posted')
      ORDER BY relevance_score DESC
      LIMIT ?
    `, [now, Math.max(1, MAX_CYCLE - queued)]);

    for (const eng of hoaLeads) {
      if (queued + errors >= MAX_CYCLE) break;
      try {
        const cadence = await computeCadenceForLead(eng.id, 'hoa');
        const msg     = await buildCadenceMessage(eng.id, 'hoa', cadence.next_touch_number);
        const agentName = 'hoa-email-campaigns';

        const runId = queueRun(agentName, msg, userId);
        if (runId) {
          run(
            `INSERT INTO cadence_touches (lead_id, product, touch_number, channel, status, rationale, run_id, updated_at)
             VALUES (?, 'hoa', ?, ?, 'pending', ?, ?, datetime('now'))`,
            [eng.id, cadence.next_touch_number, cadence.channel, cadence.rationale, runId]
          );
          run(
            `UPDATE lg_engagement_queue SET last_touch_number=?, next_touch_due=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
            [cadence.next_touch_number, cadence.next_touch_due, eng.id]
          );
          details.push({ leadId: eng.id, product: 'hoa', touch: cadence.next_touch_number, channel: cadence.channel, agent: agentName });
          queued++;
        } else {
          skipped++;
        }
      } catch (err) {
        errors++;
        console.error(`[Cadence] HOA engagement ${eng.id}: ${err.message}`);
        try {
          discord.postWebhook({
            embeds: [{
              title: '❌ Cadence Engine Error',
              description: `HOA engagement #${eng.id}: ${err.message}`,
              color: 0xff3333,
              footer: { text: 'TenacityCadenceEngine · ClawOps' },
            }],
          }).catch(e => console.warn('[Cadence] notify failed:', e.message));
        } catch {}
      }
    }
  }

  // Count opened touches (for Discord metric)
  try {
    const today = new Date().toISOString().slice(0, 10);
    opened = get(
      `SELECT COUNT(*) c FROM cadence_touches WHERE DATE(opened_at) = ?`, [today]
    )?.c || 0;
  } catch {}

  const durationMs = Date.now() - startTime;

  // ── Discord cycle summary ─────────────────────────────────────────────────
  const byChannel = details.reduce((acc, d) => {
    acc[d.channel] = (acc[d.channel] || 0) + 1;
    return acc;
  }, {});
  const channelStr = Object.entries(byChannel).map(([c, n]) => `${c}:${n}`).join(' · ') || 'none';

  try {
    discord.postWebhook({
      embeds: [{
        title: '⚡ Cadence Cycle',
        description: [
          `**${queued}** touches queued · **${opened}** opened today · **${skipped}** skipped · **${errors}** errors`,
          `Channels: ${channelStr}`,
        ].join('\n'),
        color: queued > 0 ? 0x5865f2 : 0x888888,
        fields: details.slice(0, 8).map(d => ({
          name: `${d.product === 'hoa' ? '🏘️' : '🏗️'} Touch ${d.touch}`,
          value: `Lead #${d.leadId} → ${d.channel} via ${d.agent}`,
          inline: true,
        })),
        timestamp: new Date().toISOString(),
        footer: { text: `TenacityCadenceEngine · ${(durationMs / 1000).toFixed(1)}s` },
      }],
    }).catch(e => console.warn('[Cadence] notify failed:', e.message));
  } catch {}

  const summary = [
    `Cadence cycle: ${queued} touches queued, ${opened} opened today, ${skipped} skipped, ${errors} errors`,
    `  Channels: ${channelStr}`,
    `  Duration: ${(durationMs / 1000).toFixed(1)}s`,
  ].join('\n');

  console.log(`[Cadence] ${summary}`);
  return { queued, skipped, errors, opened, details, summary, durationMs };
}

// ── Mark a touch as sent (called when agent confirms delivery) ────────────────

/**
 * Called from the outreach/follow-up agent after confirmed send.
 * Updates cadence_touches.status → 'sent' and stamps sent_at.
 */
function markTouchSent(leadId, product, touchNumber, runId) {
  try {
    run(
      `UPDATE cadence_touches SET status='sent', sent_at=datetime('now'), updated_at=datetime('now')
       WHERE lead_id=? AND product=? AND touch_number=? AND run_id=?`,
      [leadId, product, touchNumber, runId]
    );
  } catch (err) {
    console.warn(`[Cadence] markTouchSent failed for lead ${leadId}:`, err.message);
  }
}

/**
 * Called when a reply is received — deactivates the cadence for this lead.
 */
function deactivateCadence(leadId, product) {
  const table = product === 'hoa' ? 'lg_engagement_queue' : 'cfo_leads';
  try {
    run(`UPDATE ${table} SET cadence_active=0, next_touch_due=NULL, updated_at=datetime('now') WHERE id=?`, [leadId]);
    // Mark any pending touches as skipped
    run(
      `UPDATE cadence_touches SET status='skipped', updated_at=datetime('now')
       WHERE lead_id=? AND product=? AND status='pending'`,
      [leadId, product]
    );
  } catch (err) {
    console.warn(`[Cadence] deactivateCadence failed for lead ${leadId}:`, err.message);
  }
}

module.exports = {
  computeCadenceForLead,
  buildCadenceMessage,
  runCadenceCycle,
  markTouchSent,
  deactivateCadence,
};
