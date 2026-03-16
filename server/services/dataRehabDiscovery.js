/**
 * @file dataRehabDiscovery.js
 * @description Data Rehab Cross-Sell Discovery — mines existing leads and web signals
 * for companies showing data chaos that need a data audit before Jake/Owen CFO.
 *
 * Two discovery modes:
 * 1. Cross-sell: Mine existing cfo_leads for companies with ERP pain signals
 * 2. Web scan: Find companies posting about data migration, QB complaints, etc.
 *
 * Cost: $0/run (deterministic + existing lead mining)
 * Handler: data_rehab_discovery
 */

'use strict';

const { run, get, all } = require('../db/connection');

// ── Data chaos signals ────────────────────────────────────────────────────────

const DATA_CHAOS_KEYWORDS = [
  'quickbooks', 'qb enterprise', 'qbe', 'excel', 'spreadsheet',
  'manual', 'paper', 'legacy', 'migration', 'data cleanup',
  'data quality', 'duplicate', 'reconciliation', 'month-end',
];

const HIGH_CHAOS_ERP = ['QuickBooks', 'QBE', 'Excel', 'Unknown', 'Manual', 'None'];

/**
 * Mine existing leads for Data Rehab cross-sell opportunities.
 * Finds leads with ERP pain signals that haven't been pitched Data Rehab yet.
 *
 * @param {{ limit?: number }} opts
 * @returns {{ crossSellLeads: object[], tagged: number }}
 */
function mineExistingLeads({ limit = 30 } = {}) {
  // Find leads with data chaos signals that haven't been tagged for data rehab
  const candidates = all(`
    SELECT id, company_name, erp_type, city, state, contact_name, contact_email,
           pilot_fit_score, source, source_agent, status, notes, employee_count
    FROM cfo_leads
    WHERE (
      erp_type IN ('QuickBooks', 'QBE', 'Excel', 'Unknown', 'Manual', 'None')
      OR notes LIKE '%data%' OR notes LIKE '%migration%' OR notes LIKE '%cleanup%'
      OR notes LIKE '%spreadsheet%' OR notes LIKE '%manual%' OR notes LIKE '%reconcil%'
    )
    AND attribution_source IS NOT 'data_rehab_cross_sell'
    AND status IN ('new', 'contacted', 'replied')
    ORDER BY pilot_fit_score DESC
    LIMIT ?
  `, [limit]);

  const crossSellLeads = [];

  for (const lead of candidates) {
    // Score data-readiness
    let dataRehabScore = 30; // Base: existing lead with some signal
    const signals = [];

    if (HIGH_CHAOS_ERP.includes(lead.erp_type)) {
      dataRehabScore += 25;
      signals.push(`ERP: ${lead.erp_type} (high chaos)`);
    }
    if (lead.employee_count && lead.employee_count >= 20) {
      dataRehabScore += 10;
      signals.push(`${lead.employee_count} employees (complex data)`);
    }
    if (lead.notes && /manual|spreadsheet|excel|data.*(mess|chaos|cleanup)/i.test(lead.notes)) {
      dataRehabScore += 20;
      signals.push('Explicit data pain in notes');
    }
    if (lead.contact_email) {
      dataRehabScore += 10;
      signals.push('Has contact email');
    }
    if (lead.status === 'contacted' || lead.status === 'replied') {
      dataRehabScore += 5;
      signals.push(`Already ${lead.status} — warm lead`);
    }

    crossSellLeads.push({
      lead_id: lead.id,
      company: lead.company_name,
      erp: lead.erp_type,
      data_rehab_score: Math.min(dataRehabScore, 100),
      signals,
      source_agent: lead.source_agent,
      upsell_to: lead.source_agent === 'owen' ? 'owen' : 'jake',
    });
  }

  // Sort by data rehab score
  crossSellLeads.sort((a, b) => b.data_rehab_score - a.data_rehab_score);

  // Tag top candidates
  let tagged = 0;
  for (const lead of crossSellLeads.slice(0, limit)) {
    if (lead.data_rehab_score >= 50) {
      run('UPDATE cfo_leads SET attribution_source = ? WHERE id = ? AND attribution_source IS NOT ?',
        ['data_rehab_cross_sell', lead.lead_id, 'data_rehab_cross_sell']);
      tagged++;
    }
  }

  return { crossSellLeads: crossSellLeads.slice(0, limit), tagged };
}

/**
 * Score a lead for Data Rehab fitness.
 *
 * @param {number} leadId
 * @returns {{ score: number, signals: string[], recommendation: string }}
 */
function scoreLeadForDataRehab(leadId) {
  const lead = get('SELECT * FROM cfo_leads WHERE id = ?', [leadId]);
  if (!lead) return { score: 0, signals: [], recommendation: 'Lead not found' };

  let score = 0;
  const signals = [];

  // ERP assessment
  if (HIGH_CHAOS_ERP.includes(lead.erp_type)) {
    score += 30;
    signals.push(`${lead.erp_type} — likely needs data audit`);
  } else if (lead.erp_type) {
    score += 10;
    signals.push(`${lead.erp_type} — may need migration prep`);
  }

  // Company size
  if (lead.employee_count >= 50) { score += 15; signals.push('50+ employees — complex data landscape'); }
  else if (lead.employee_count >= 20) { score += 10; signals.push('20+ employees — growing data needs'); }

  // Pain signals in notes
  if (lead.notes) {
    if (/data.*(mess|chaos|cleanup|quality)/i.test(lead.notes)) { score += 20; signals.push('Explicit data pain mentioned'); }
    if (/migration|convert|switch/i.test(lead.notes)) { score += 15; signals.push('Migration/switching signal'); }
    if (/duplicate|reconcil|manual/i.test(lead.notes)) { score += 10; signals.push('Manual process pain'); }
  }

  // Contact quality
  if (lead.contact_email) { score += 10; signals.push('Has email contact'); }
  if (lead.contact_title && /cfo|controller|vp.finance|director.finance/i.test(lead.contact_title)) {
    score += 10;
    signals.push(`Decision maker: ${lead.contact_title}`);
  }

  const recommendation = score >= 75 ? 'HIGH — pitch data audit immediately'
    : score >= 50 ? 'MEDIUM — include in next Data Rehab outreach batch'
    : score >= 30 ? 'LOW — nurture with data education content'
    : 'SKIP — not a data rehab candidate';

  return { score: Math.min(score, 100), signals, recommendation };
}

module.exports = { mineExistingLeads, scoreLeadForDataRehab };
