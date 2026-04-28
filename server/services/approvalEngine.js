/**
 * @file approvalEngine.js
 * @description Confidence-based auto-approval / auto-send rules for outreach.
 *
 * decideSendApproval(lead, product) → { autoSend, confidence, reason }
 *
 * Scoring rubric (base = 50):
 *   +20  urgency_score >= 80
 *   +15  dossier present AND length > 400 chars
 *   +15  Brain has >= 3 matching episodes for same market/erp
 *   -10  pipeline_stage is 'Enriched'|'Dossiered' AND days_in_stage > 2 (staleness)
 *   +10  previous cadence touches > 0 AND no negative outcome touch
 *
 * Decision thresholds:
 *   >= 90 → autoSend: true  (bypass confirmation gate)
 *   70–89 → autoSend: false (keep confirmation gate)
 *   < 70  → skip / flag for review
 *
 * AUTO_SEND_ENABLED env var (default false) gates all auto-sends.
 * First 5 auto-sends per day fire a Discord "First auto-send" alert.
 * $0/run — pure SQLite reads.
 */

'use strict';

const { get, all }  = require('../db/connection');
const discord        = require('./discordNotifier');

// ── Auto-send enabled flag ────────────────────────────────────────────────────
function isAutoSendEnabled() {
  // Check env first, then DB settings table
  if (process.env.AUTO_SEND_ENABLED === 'true') return true;
  if (process.env.AUTO_SEND_ENABLED === 'false') return false;
  try {
    const row = get("SELECT value FROM settings WHERE key='auto_send_enabled'");
    return row?.value === 'true';
  } catch { return false; }
}

// ── Track daily first-5 auto-send alerts ─────────────────────────────────────
const _autoSendCountByDay = {};
function getAutoSendCountToday() {
  const today = new Date().toISOString().slice(0, 10);
  return _autoSendCountByDay[today] || 0;
}
function incrementAutoSendCount() {
  const today = new Date().toISOString().slice(0, 10);
  _autoSendCountByDay[today] = (_autoSendCountByDay[today] || 0) + 1;
  return _autoSendCountByDay[today];
}

// ── Brain episode count lookup ────────────────────────────────────────────────
async function getBrainEpisodeCount(market, erp) {
  try {
    const brain = require('./collectiveBrain');
    const episodes = await brain.getSimilarEpisodes({
      market:     market || null,
      erpContext: erp    || null,
      minScore:   0.5,
      limit:      10,
    });
    return episodes.length;
  } catch { return 0; }
}

// ── Main scoring function ─────────────────────────────────────────────────────

/**
 * Compute a confidence score for auto-sending an outreach touch.
 *
 * @param {object} lead    - Row from cfo_leads or lg_engagement_queue
 * @param {'jake'|'hoa'}  product
 * @returns {Promise<{ autoSend: boolean, confidence: number, reason: string, skip: boolean }>}
 */
async function decideSendApproval(lead, product = 'jake') {
  const reasons = [];
  let score = 50;

  // ── +20: urgency_score >= 80 ──────────────────────────────────────────────
  const urgency = lead.urgency_score || 0;
  if (urgency >= 80) {
    score += 20;
    reasons.push(`urgency=${urgency} (+20)`);
  } else if (urgency >= 60) {
    reasons.push(`urgency=${urgency} (no bonus, need ≥80)`);
  }

  // ── +15: dossier present and > 400 chars ─────────────────────────────────
  const dossierLen = (lead.dossier || '').length;
  if (dossierLen > 400) {
    score += 15;
    reasons.push(`dossier=${dossierLen}ch (+15)`);
  } else if (dossierLen > 0) {
    reasons.push(`dossier=${dossierLen}ch (too short, need >400)`);
  } else {
    reasons.push('no dossier');
  }

  // ── +15: Brain has >= 3 matching episodes ─────────────────────────────────
  const market     = [lead.city, lead.state].filter(Boolean).join(', ') || null;
  const erp        = lead.erp_type || null;
  const episodeCount = await getBrainEpisodeCount(market, erp);
  if (episodeCount >= 3) {
    score += 15;
    reasons.push(`brain=${episodeCount} episodes (+15)`);
  } else {
    reasons.push(`brain=${episodeCount} episodes (need ≥3)`);
  }

  // ── -10: stale (Enriched|Dossiered > 2 days) ─────────────────────────────
  const stage      = lead.pipeline_stage || 'New';
  const daysInStage = lead.days_in_stage || 0;
  if ((stage === 'Enriched' || stage === 'Dossiered') && daysInStage > 2) {
    score -= 10;
    reasons.push(`stale(${stage},${daysInStage}d) (-10)`);
  }

  // ── +10: has previous cadence touches with no negative outcome ───────────
  const lastTouch = lead.last_touch_number || 0;
  if (lastTouch > 0) {
    // Check for negative outcome on any previous touch
    const negTouch = get(
      `SELECT id FROM cadence_touches
       WHERE lead_id=? AND product=? AND status IN ('bounced','skipped')
       LIMIT 1`,
      [lead.id, product]
    );
    if (!negTouch) {
      score += 10;
      reasons.push(`prev_touches=${lastTouch} no-neg (+10)`);
    } else {
      reasons.push(`prev_touches=${lastTouch} has-neg (no bonus)`);
    }
  }

  // Clamp to 0–100
  const confidence = Math.max(0, Math.min(100, score));
  const reasonStr  = reasons.join(', ');

  const autoSendEnabled = isAutoSendEnabled();
  const autoSend = autoSendEnabled && confidence >= 90;
  const skip     = confidence < 70;

  return { autoSend, confidence, reason: reasonStr, skip };
}

// ── Post-send Discord alert (first 5 per day) ─────────────────────────────────

/**
 * Called after an auto-send is triggered. Posts alert for first 5 per day.
 * @param {number|string} leadId
 * @param {string} companyName
 * @param {number} confidence
 * @param {string} channel
 */
function notifyAutoSend(leadId, companyName, confidence, channel = 'email') {
  const count = incrementAutoSendCount();

  const title = count <= 5
    ? `🤖 First auto-send triggered — lead #${leadId} (conf=${confidence})`
    : `🤖 Auto-send — lead #${leadId} (conf=${confidence})`;

  if (count > 20) return; // Silence after 20/day to avoid spam

  discord.postWebhook({
    embeds: [{
      title,
      description: `**${companyName}** — ${channel} channel | confidence: ${confidence}/100`,
      color:   confidence >= 95 ? 0x00cc44 : 0x5865f2,
      fields: [
        { name: 'Channel', value: channel, inline: true },
        { name: 'Confidence', value: `${confidence}/100`, inline: true },
        { name: 'Auto-sends today', value: String(count), inline: true },
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'ApprovalEngine · ClawOps' },
    }],
  }).catch(e => console.warn('[ApprovalEngine] notify failed:', e.message));
}

/**
 * Notify on skipped leads (confidence < 70).
 */
function notifyLowConfidence(leadId, companyName, confidence, reason) {
  // Only log to console — don't spam Discord for every low-conf skip
  console.log(`[ApprovalEngine] Skipped lead #${leadId} (${companyName}) — conf=${confidence}: ${reason}`);
}

module.exports = {
  decideSendApproval,
  notifyAutoSend,
  notifyLowConfidence,
  isAutoSendEnabled,
};
