/**
 * @file signalPerformance.js
 * @description Nightly rollup of signal source performance — measures which discovery
 * sources (pain_signal, hiring_signal, maps_discovery, lead_scout, etc.) produce leads
 * that actually convert. Feeds results back into agent context via collectiveBrain.
 *
 * Tables: signal_performance (migration 041)
 * Schedule: Nightly 1:30 AM (after pipeline state tracker at 1 AM)
 * Cost: $0/run — pure SQL aggregation
 */

'use strict';

function getDb() {
  return require('../db/connection');
}

/**
 * Compute 30-day rolling signal performance for all source types.
 * Inserts/updates rows in signal_performance table.
 *
 * @returns {{ sources: number, totalLeads: number, topSource: string }}
 */
function computeSignalPerformance() {
  const { all, run, get } = getDb();
  const now = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  // ── Aggregate cfo_leads by source + source_agent ──
  const rows = all(`
    SELECT
      COALESCE(source, 'unknown')       AS source,
      COALESCE(source_agent, 'unknown') AS source_agent,
      COUNT(*)                                                                           AS leads_inserted,
      SUM(CASE WHEN enrichment_status = 'enriched'                  THEN 1 ELSE 0 END)  AS leads_enriched,
      SUM(CASE WHEN status IN ('contacted','replied','pilot','closed_won') THEN 1 ELSE 0 END) AS leads_contacted,
      SUM(CASE WHEN status IN ('replied','pilot','closed_won')      THEN 1 ELSE 0 END)  AS leads_replied,
      SUM(CASE WHEN revenue_stage = 'meeting'                       THEN 1 ELSE 0 END)  AS leads_meeting,
      SUM(CASE WHEN status = 'pilot'                                THEN 1 ELSE 0 END)  AS leads_pilot,
      SUM(CASE WHEN status = 'closed_won'                           THEN 1 ELSE 0 END)  AS leads_closed,
      SUM(COALESCE(close_value_cents, 0))                                                AS total_revenue_cents,
      AVG(CASE WHEN days_to_close IS NOT NULL THEN days_to_close END)                    AS avg_days_to_close
    FROM cfo_leads
    WHERE created_at >= ?
    GROUP BY source, source_agent
  `, [thirtyDaysAgo]);

  let sources = 0;
  let totalLeads = 0;
  let topSource = 'none';
  let topReplyRate = 0;

  for (const row of rows) {
    const contacted = row.leads_contacted || 0;
    const replyRate = contacted > 0 ? row.leads_replied / contacted : 0;
    const convRate  = row.leads_inserted > 0 ? row.leads_closed / row.leads_inserted : 0;

    run(`
      INSERT INTO signal_performance
        (period_start, period_end, source, source_agent, market, leads_inserted, leads_enriched,
         leads_contacted, leads_replied, leads_meeting, leads_pilot, leads_closed,
         reply_rate, conversion_rate, avg_days_to_reply, avg_close_value_cents,
         total_revenue_cents)
      VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(period_end, source, source_agent, market) DO UPDATE SET
        leads_inserted    = excluded.leads_inserted,
        leads_enriched    = excluded.leads_enriched,
        leads_contacted   = excluded.leads_contacted,
        leads_replied     = excluded.leads_replied,
        leads_meeting     = excluded.leads_meeting,
        leads_pilot       = excluded.leads_pilot,
        leads_closed      = excluded.leads_closed,
        reply_rate        = excluded.reply_rate,
        conversion_rate   = excluded.conversion_rate,
        avg_days_to_reply = excluded.avg_days_to_reply,
        avg_close_value_cents = excluded.avg_close_value_cents,
        total_revenue_cents   = excluded.total_revenue_cents,
        computed_at       = datetime('now')
    `, [
      thirtyDaysAgo, now, row.source, row.source_agent,
      row.leads_inserted, row.leads_enriched || 0,
      contacted, row.leads_replied || 0,
      row.leads_meeting || 0, row.leads_pilot || 0, row.leads_closed || 0,
      replyRate, convRate,
      row.avg_days_to_close ? Math.round(row.avg_days_to_close) : null,
      row.total_revenue_cents > 0 ? Math.round(row.total_revenue_cents / (row.leads_closed || 1)) : null,
      row.total_revenue_cents || 0,
    ]);

    sources++;
    totalLeads += row.leads_inserted;
    if (replyRate > topReplyRate) {
      topReplyRate = replyRate;
      topSource = `${row.source} (${row.source_agent})`;
    }
  }

  // ── Also compute per-market breakdown for Jake pipeline ──
  const marketRows = all(`
    SELECT
      COALESCE(source, 'unknown') AS source,
      COALESCE(source_agent, 'unknown') AS source_agent,
      COALESCE(state, 'unknown') AS market,
      COUNT(*) AS leads_inserted,
      SUM(CASE WHEN status IN ('contacted','replied','pilot','closed_won') THEN 1 ELSE 0 END) AS leads_contacted,
      SUM(CASE WHEN status IN ('replied','pilot','closed_won') THEN 1 ELSE 0 END) AS leads_replied,
      SUM(CASE WHEN status = 'closed_won' THEN 1 ELSE 0 END) AS leads_closed
    FROM cfo_leads
    WHERE created_at >= ? AND state IS NOT NULL
    GROUP BY source, source_agent, state
    HAVING COUNT(*) >= 3
  `, [thirtyDaysAgo]);

  for (const row of marketRows) {
    const contacted = row.leads_contacted || 0;
    const replyRate = contacted > 0 ? row.leads_replied / contacted : 0;
    const convRate  = row.leads_inserted > 0 ? row.leads_closed / row.leads_inserted : 0;

    run(`
      INSERT INTO signal_performance
        (period_start, period_end, source, source_agent, market, leads_inserted,
         leads_contacted, leads_replied, leads_closed, reply_rate, conversion_rate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(period_end, source, source_agent, market) DO UPDATE SET
        leads_inserted  = excluded.leads_inserted,
        leads_contacted = excluded.leads_contacted,
        leads_replied   = excluded.leads_replied,
        leads_closed    = excluded.leads_closed,
        reply_rate      = excluded.reply_rate,
        conversion_rate = excluded.conversion_rate,
        computed_at     = datetime('now')
    `, [
      thirtyDaysAgo, now, row.source, row.source_agent, row.market,
      row.leads_inserted, contacted, row.leads_replied || 0,
      row.leads_closed || 0, replyRate, convRate,
    ]);
  }

  console.log(`[SignalPerformance] Computed ${sources} source rollups across ${totalLeads} leads. Top: ${topSource} (${(topReplyRate * 100).toFixed(1)}% reply rate)`);
  return { sources, totalLeads, topSource };
}

/**
 * Build a prompt block summarizing signal performance for agent context injection.
 * Called by collectiveBrain.buildAgentContext() for discovery/enrichment agents.
 *
 * @param {string} [sourceAgent] - Filter to specific product line (jake, owen, hoa, data_rehab)
 * @returns {string} - Formatted prompt block
 */
function getSignalPerformanceBlock(sourceAgent) {
  const { all } = getDb();

  // Get most recent rollup
  const latest = all(`
    SELECT source, source_agent, leads_inserted, leads_contacted, leads_replied,
           leads_closed, reply_rate, conversion_rate, total_revenue_cents
    FROM signal_performance
    WHERE market IS NULL
      ${sourceAgent ? 'AND source_agent = ?' : ''}
    ORDER BY period_end DESC, leads_inserted DESC
    LIMIT 10
  `, sourceAgent ? [sourceAgent] : []);

  if (!latest.length) return '';

  const lines = latest.map(r => {
    const rr = (r.reply_rate * 100).toFixed(1);
    const cr = (r.conversion_rate * 100).toFixed(1);
    return `  ${r.source} (${r.source_agent}): ${r.leads_inserted} leads → ${r.leads_replied} replied (${rr}%) → ${r.leads_closed} closed (${cr}%)`;
  });

  return [
    '\n━━━ SIGNAL SOURCE PERFORMANCE (30-day) ━━━',
    ...lines,
    '━━━ END SIGNAL PERFORMANCE ━━━\n',
  ].join('\n');
}

/**
 * Build a Discord-ready summary of signal performance.
 * @returns {string}
 */
function getDiscordSummary() {
  const { all } = getDb();

  const rows = all(`
    SELECT source, source_agent, leads_inserted, leads_replied, leads_closed,
           reply_rate, conversion_rate, total_revenue_cents
    FROM signal_performance
    WHERE market IS NULL
    ORDER BY period_end DESC, reply_rate DESC
    LIMIT 10
  `);

  if (!rows.length) return 'No signal performance data yet.';

  return rows.map(r => {
    const rr = (r.reply_rate * 100).toFixed(1);
    const rev = r.total_revenue_cents ? ` | $${(r.total_revenue_cents / 100).toFixed(0)} rev` : '';
    return `**${r.source}** (${r.source_agent}): ${r.leads_inserted} leads → ${rr}% reply${rev}`;
  }).join('\n');
}

module.exports = {
  computeSignalPerformance,
  getSignalPerformanceBlock,
  getDiscordSummary,
};
