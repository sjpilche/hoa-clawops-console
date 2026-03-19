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

// Apollo enrichment — safe import (additive, non-breaking)
let apollo;
try { apollo = require('./apolloEnricher'); } catch {}

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
async function mineExistingLeads({ limit = 30 } = {}) {
  // Find leads with data chaos signals that haven't been tagged for data rehab
  const candidates = all(`
    SELECT l.id, l.company_name, l.erp_type, l.city, l.state, l.contact_name, l.contact_email,
           l.contact_title, l.pilot_fit_score, l.source, l.source_agent, l.status, l.notes,
           l.employee_count, l.enrichment_status, l.revenue_stage,
           (SELECT COUNT(*) FROM cfo_outreach_sequences s WHERE s.lead_id = l.id) AS outreach_count
    FROM cfo_leads l
    WHERE (
      l.erp_type IN ('QuickBooks', 'QBE', 'Excel', 'Unknown', 'Manual', 'None')
      OR l.notes LIKE '%data%' OR l.notes LIKE '%migration%' OR l.notes LIKE '%cleanup%'
      OR l.notes LIKE '%spreadsheet%' OR l.notes LIKE '%manual%' OR l.notes LIKE '%reconcil%'
      OR l.notes LIKE '%duplicate%' OR l.notes LIKE '%audit%' OR l.notes LIKE '%legacy%'
      OR l.erp_type LIKE '%+%' OR l.erp_type LIKE '%/%'
    )
    AND l.attribution_source IS NOT 'data_rehab_cross_sell'
    AND l.status IN ('new', 'contacted', 'replied')
    ORDER BY l.pilot_fit_score DESC
    LIMIT ?
  `, [limit * 3]); // Over-fetch to get better scoring distribution

  const crossSellLeads = [];

  for (const lead of candidates) {
    let score = 0;
    const signals = [];

    // ── ERP chaos tier (0-30 pts) ────────────────────────
    const erp = (lead.erp_type || '').toLowerCase();
    const multiSystem = erp.includes('+') || erp.includes('/') || erp.includes(',');
    if (multiSystem) {
      score += 30;
      signals.push(`Multi-system: ${lead.erp_type} (high complexity)`);
    } else if (['unknown', 'none', 'manual', ''].includes(erp)) {
      score += 15;
      signals.push(`No ERP identified — likely spreadsheet-driven`);
    } else if (['quickbooks', 'qbe', 'excel'].includes(erp.replace(/\s/g, '').toLowerCase())) {
      score += 20;
      signals.push(`${lead.erp_type} — common data-mess system`);
    } else if (['sage300', 'sage 300', 'vista', 'spectrum'].includes(erp.toLowerCase())) {
      score += 10;
      signals.push(`${lead.erp_type} — enterprise ERP, migration candidate`);
    }

    // ── Company size (0-20 pts) ──────────────────────────
    const emp = parseInt(lead.employee_count) || 0;
    if (emp >= 100) { score += 20; signals.push(`${emp} employees — complex data, likely multi-entity`); }
    else if (emp >= 50) { score += 15; signals.push(`${emp} employees — meaningful data volume`); }
    else if (emp >= 20) { score += 10; signals.push(`${emp} employees — growing pains likely`); }
    else if (emp >= 5) { score += 5; signals.push(`Small team — may be drowning in manual work`); }

    // ── Pain signals in notes (0-25 pts) ─────────────────
    const notes = (lead.notes || '').toLowerCase();
    if (/multi.?entity|multiple.?(compan|entit|location)/i.test(notes)) { score += 15; signals.push('Multi-entity complexity'); }
    if (/migration|convert|switch|moving to/i.test(notes)) { score += 10; signals.push('Migration/switching signal'); }
    if (/data.*(mess|chaos|cleanup|quality|issue)/i.test(notes)) { score += 10; signals.push('Explicit data pain'); }
    if (/duplicate|reconcil|manual.*(report|process|entry)/i.test(notes)) { score += 8; signals.push('Manual process pain'); }
    if (/audit|compliance|sarbanes|sox/i.test(notes)) { score += 8; signals.push('Audit/compliance pressure'); }
    if (/spreadsheet|excel.*(bridge|depend|critical)/i.test(notes)) { score += 7; signals.push('Excel dependency'); }

    // ── Contact quality (0-15 pts) ───────────────────────
    if (lead.contact_email) { score += 5; signals.push('Has email'); }
    if (lead.contact_title && /cfo|controller|vp.finance|director.finance|coo|cto/i.test(lead.contact_title)) {
      score += 10;
      signals.push(`Decision maker: ${lead.contact_title}`);
    }

    // ── Engagement signals (0-10 pts) ────────────────────
    if (lead.status === 'replied') { score += 10; signals.push('Already replied — warm'); }
    else if (lead.status === 'contacted') { score += 5; signals.push('Already contacted — warm'); }
    if (lead.outreach_count > 0 && lead.status !== 'replied') { score += 0; } // no extra credit for ignored outreach

    // ── Tier recommendation ──────────────────────────────
    const tier = multiSystem || emp >= 100 ? 'complex'
      : (erp.includes('sage') || emp >= 50 || /migration|multi/i.test(notes)) ? 'core'
      : score >= 50 ? 'lite'
      : 'autopsy';

    crossSellLeads.push({
      lead_id: lead.id,
      company: lead.company_name,
      erp: lead.erp_type,
      data_rehab_score: Math.min(score, 100),
      signals,
      tier,
      source_agent: lead.source_agent,
      upsell_to: lead.source_agent === 'owen' ? 'owen' : 'jake',
    });
  }

  // Sort by score — best candidates first
  crossSellLeads.sort((a, b) => b.data_rehab_score - a.data_rehab_score);

  // ── Apollo ERP enrichment pass for Unknown/None/null ERP leads ──────────
  if (apollo) {
    const unknownErpLeads = crossSellLeads
      .filter(l => {
        const erp = (l.erp || '').toLowerCase();
        return !erp || erp === 'unknown' || erp === 'none';
      })
      .slice(0, 20);

    for (const item of unknownErpLeads) {
      try {
        const dbLead = get('SELECT * FROM cfo_leads WHERE id = ?', [item.lead_id]);
        if (!dbLead) continue;

        // Try domain-based org enrichment first, fall back to people search
        let technologies = null;
        let employees = null;
        const domain = (dbLead.website || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');

        if (domain) {
          const orgResult = await apollo.enrichOrganization(domain);
          if (orgResult.success) {
            technologies = orgResult.technologies;
            employees = orgResult.employees;
          }
        }

        if (!technologies || technologies.length === 0) {
          const people = await apollo.searchPeople({ companyName: dbLead.company_name, limit: 1 });
          if (people.length > 0 && people[0].organization) {
            technologies = people[0].organization.technologies || [];
            if (!employees) employees = people[0].organization.employees;
          }
        }

        // Detect ERP from technologies
        const detectedErp = technologies ? apollo.detectErp(technologies) : null;
        if (detectedErp) {
          run('UPDATE cfo_leads SET erp_type = ?, updated_at = datetime(\'now\') WHERE id = ?', [detectedErp, item.lead_id]);
          console.log(`[DataRehabDiscovery] Apollo enriched ERP: ${item.erp || 'Unknown'} → ${detectedErp} for ${item.company}`);
          item.erp = detectedErp;

          // Re-score with new ERP data
          const rescored = scoreLeadForDataRehab(item.lead_id);
          item.data_rehab_score = rescored.score;
          item.signals = rescored.signals;
        }

        if (employees) {
          run('UPDATE cfo_leads SET employee_count = ?, updated_at = datetime(\'now\') WHERE id = ?', [employees, item.lead_id]);
        }

        // 200ms delay between Apollo calls
        await new Promise(r => setTimeout(r, 200));
      } catch (err) {
        console.warn(`[DataRehabDiscovery] Apollo enrichment failed for ${item.company}: ${err.message}`);
      }
    }

    // Re-sort after enrichment may have changed scores
    crossSellLeads.sort((a, b) => b.data_rehab_score - a.data_rehab_score);
  }

  // Tag top candidates + assign to data-rehab workspace
  let tagged = 0;
  const highCount = crossSellLeads.filter(l => l.data_rehab_score >= 60).length;
  const medCount = crossSellLeads.filter(l => l.data_rehab_score >= 40 && l.data_rehab_score < 60).length;

  for (const lead of crossSellLeads.slice(0, limit)) {
    if (lead.data_rehab_score >= 40) {
      run(`UPDATE cfo_leads SET attribution_source = 'data_rehab_cross_sell', workspace_id = 4
           WHERE id = ? AND (attribution_source IS NULL OR attribution_source != 'data_rehab_cross_sell')`,
        [lead.lead_id]);
      tagged++;
    }
  }

  const summary = `Data Rehab Discovery: ${crossSellLeads.length} candidates scored, ${tagged} tagged for outreach\n`
    + `  HIGH (60+): ${highCount} | MEDIUM (40-59): ${medCount} | Below threshold: ${crossSellLeads.length - highCount - medCount}`;

  return { crossSellLeads: crossSellLeads.slice(0, limit), tagged, summary };
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

  // ERP assessment — use partial matching so Apollo composite values like "QuickBooks+Excel" still match
  const erpVal = (lead.erp_type || '').toLowerCase();
  const isMultiSystem = erpVal.includes('+') || erpVal.includes('/') || erpVal.includes(',');
  const matchesChaosERP = HIGH_CHAOS_ERP.some(e => erpVal.includes(e.toLowerCase()));
  if (isMultiSystem) {
    score += 35;
    signals.push(`${lead.erp_type} — multi-system, high data complexity`);
  } else if (matchesChaosERP) {
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
