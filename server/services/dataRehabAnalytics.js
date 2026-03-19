/**
 * @file dataRehabAnalytics.js
 * @description Daily Data Rehab pipeline analytics — leads, outreach, replies, conversion rates.
 *
 * Queries workspace_id=4 across cfo_leads, cfo_outreach_sequences, and outreach_variants
 * to produce a pipeline health snapshot with conversion funnel metrics.
 *
 * Cost: $0/run (pure SQL aggregation)
 * Handler: data_rehab_analytics
 */

'use strict';

const { all, get } = require('../db/connection');

let discordNotifier;
try {
  discordNotifier = require('./discordNotifier');
} catch {
  // Discord not available — non-fatal
}

const DATA_REHAB_WORKSPACE_ID = 4;

// ── Helpers ─────────────────────────────────────────────────────────────────

function pct(numerator, denominator) {
  if (!denominator) return '0.0%';
  return ((numerator / denominator) * 100).toFixed(1) + '%';
}

function statusMap(rows) {
  const map = {};
  for (const row of rows) {
    map[row.status || 'unknown'] = Number(row.cnt);
  }
  return map;
}

// ── Main analytics runner ───────────────────────────────────────────────────

async function runAnalytics() {
  // 1. Pipeline lead counts by status
  const leadRows = all(`
    SELECT status, COUNT(*) AS cnt
    FROM cfo_leads
    WHERE workspace_id = ?
    GROUP BY status
  `, [DATA_REHAB_WORKSPACE_ID]);

  const leads = statusMap(leadRows);
  const totalLeads = Object.values(leads).reduce((s, n) => s + n, 0);

  // 2. Outreach sequence counts by status
  const seqRows = all(`
    SELECT status, COUNT(*) AS cnt
    FROM cfo_outreach_sequences
    WHERE workspace_id = ?
    GROUP BY status
  `, [DATA_REHAB_WORKSPACE_ID]);

  const sequences = statusMap(seqRows);
  const totalSequences = Object.values(sequences).reduce((s, n) => s + n, 0);

  // 3. Outreach variant stats (sent, opens, replies)
  const variantStats = get(`
    SELECT
      COUNT(*)                                   AS total,
      SUM(CASE WHEN ov.status = 'sent' OR ov.status = 'replied' THEN 1 ELSE 0 END) AS sent,
      SUM(CASE WHEN ov.opened_at IS NOT NULL THEN 1 ELSE 0 END) AS opened,
      SUM(CASE WHEN ov.status = 'replied' THEN 1 ELSE 0 END)    AS replied
    FROM outreach_variants ov
    INNER JOIN cfo_leads cl ON cl.id = ov.lead_id
    WHERE cl.workspace_id = ?
  `, [DATA_REHAB_WORKSPACE_ID]) || { total: 0, sent: 0, opened: 0, replied: 0 };

  const sent = Number(variantStats.sent) || 0;
  const opened = Number(variantStats.opened) || 0;
  const replied = Number(variantStats.replied) || 0;

  // 4. Conversion rates
  const contacted = (leads.contacted || 0) + (leads.replied || 0) + (leads.meeting || 0) +
    (leads.pilot || 0) + (leads.closed_won || 0) + (leads.closed_lost || 0);
  const repliedLeads = (leads.replied || 0) + (leads.meeting || 0) +
    (leads.pilot || 0) + (leads.closed_won || 0);
  const meetings = (leads.meeting || 0) + (leads.pilot || 0) +
    (leads.closed_won || 0);
  const closedWon = leads.closed_won || 0;
  const closedLost = leads.closed_lost || 0;

  const conversion = {
    contacted_rate: pct(contacted, totalLeads),
    replied_rate: pct(repliedLeads, contacted),
    meeting_rate: pct(meetings, repliedLeads),
    closed_rate: pct(closedWon, meetings),
    open_rate: pct(opened, sent),
    reply_rate: pct(replied, sent),
  };

  // 5. Build stats object
  const stats = {
    workspace_id: DATA_REHAB_WORKSPACE_ID,
    generated_at: new Date().toISOString(),
    pipeline: {
      total: totalLeads,
      new: leads.new || 0,
      contacted: leads.contacted || 0,
      replied: leads.replied || 0,
      meeting: leads.meeting || 0,
      pilot: leads.pilot || 0,
      closed_won: closedWon,
      closed_lost: closedLost,
    },
    outreach: {
      total_sequences: totalSequences,
      draft: sequences.draft || 0,
      approved: sequences.approved || 0,
      sent: sequences.sent || 0,
      replied: sequences.replied || 0,
      bounced: sequences.bounced || 0,
    },
    variants: {
      total: Number(variantStats.total) || 0,
      sent,
      opened,
      replied,
    },
    conversion,
  };

  // 6. Formatted text summary
  const lines = [
    '=== Data Rehab Pipeline Health ===',
    `Generated: ${stats.generated_at}`,
    '',
    '--- Leads by Status ---',
    `  Total:       ${stats.pipeline.total}`,
    `  New:         ${stats.pipeline.new}`,
    `  Contacted:   ${stats.pipeline.contacted}`,
    `  Replied:     ${stats.pipeline.replied}`,
    `  Meeting:     ${stats.pipeline.meeting}`,
    `  Pilot:       ${stats.pipeline.pilot}`,
    `  Closed Won:  ${stats.pipeline.closed_won}`,
    `  Closed Lost: ${stats.pipeline.closed_lost}`,
    '',
    '--- Outreach Sequences ---',
    `  Total:    ${stats.outreach.total_sequences}`,
    `  Draft:    ${stats.outreach.draft}`,
    `  Approved: ${stats.outreach.approved}`,
    `  Sent:     ${stats.outreach.sent}`,
    `  Replied:  ${stats.outreach.replied}`,
    `  Bounced:  ${stats.outreach.bounced}`,
    '',
    '--- Email Variants ---',
    `  Total:   ${stats.variants.total}`,
    `  Sent:    ${stats.variants.sent}`,
    `  Opened:  ${stats.variants.opened}`,
    `  Replied: ${stats.variants.replied}`,
    '',
    '--- Conversion Rates ---',
    `  Contacted / Total:    ${conversion.contacted_rate}`,
    `  Replied / Contacted:  ${conversion.replied_rate}`,
    `  Meeting / Replied:    ${conversion.meeting_rate}`,
    `  Closed / Meeting:     ${conversion.closed_rate}`,
    `  Open Rate (emails):   ${conversion.open_rate}`,
    `  Reply Rate (emails):  ${conversion.reply_rate}`,
  ];

  const outputText = lines.join('\n');

  // 7. Post to Discord (optional, fire-and-forget)
  if (discordNotifier) {
    discordNotifier.sendEmbed({
      title: 'Data Rehab Pipeline Health',
      color: 0x3498db,
      description: [
        `**Leads:** ${stats.pipeline.total} total | ${stats.pipeline.new} new | ${closedWon} won`,
        `**Outreach:** ${stats.outreach.total_sequences} sequences | ${sent} emails sent`,
        `**Conversion:** ${conversion.contacted_rate} contacted | ${conversion.replied_rate} replied | ${conversion.closed_rate} closed`,
      ].join('\n'),
      fields: [
        { name: 'Open Rate', value: conversion.open_rate, inline: true },
        { name: 'Reply Rate', value: conversion.reply_rate, inline: true },
        { name: 'Meeting Rate', value: conversion.meeting_rate, inline: true },
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'Data Rehab Analytics' },
    });
  }

  return { outputText, stats };
}

module.exports = { runAnalytics };
