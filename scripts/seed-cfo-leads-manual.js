/**
 * @file seed-cfo-leads-manual.js
 * @description Manually seed initial Phase 0 CFO lead prospects
 *
 * These are hand-curated $10M-$75M construction companies known to use
 * Vista, Sage 300, or QuickBooks Enterprise — from industry research.
 *
 * Usage: node scripts/seed-cfo-leads-manual.js
 */

'use strict';

const { run, get, initDatabase } = require('../server/db/connection');

// Initial seed list — real construction companies known to use these ERPs
// Update this list as you do research / get referrals
const INITIAL_LEADS = [
  // Vista / Viewpoint users (GCs with documented Vista usage)
  { company_name: 'Gilbane Building Company', erp_type: 'Vista', state: 'RI', revenue_range: '$1B+', pilot_fit_score: 65, pilot_fit_reason: 'Major GC, known Vista user', website: 'https://www.gilbaneco.com' },
  { company_name: 'Hoar Construction', erp_type: 'Vista', state: 'AL', revenue_range: '$500M+', pilot_fit_score: 68, pilot_fit_reason: 'Regional GC, documented Viewpoint customer', website: 'https://www.hoar.com' },
  { company_name: 'Skanska USA', erp_type: 'Vista', state: 'NY', revenue_range: '$1B+', pilot_fit_score: 62, pilot_fit_reason: 'Major GC, Vista ERP confirmed', website: 'https://www.usa.skanska.com' },
  { company_name: 'Sundt Construction', erp_type: 'Vista', state: 'AZ', revenue_range: '$1B+', pilot_fit_score: 70, pilot_fit_reason: 'Southwest GC, Viewpoint customer', website: 'https://www.sundt.com' },
  { company_name: 'Mortenson Construction', erp_type: 'Vista', state: 'MN', revenue_range: '$1B+', pilot_fit_score: 65, pilot_fit_reason: 'National GC, Vista user', website: 'https://www.mortenson.com' },

  // Sage 300 Construction users
  { company_name: 'Brasfield & Gorrie', erp_type: 'Sage300', state: 'AL', revenue_range: '$500M+', pilot_fit_score: 72, pilot_fit_reason: 'Southeast GC, Sage 300 documented', website: 'https://www.brasfieldgorrie.com' },
  { company_name: 'Hensel Phelps', erp_type: 'Sage300', state: 'CO', revenue_range: '$1B+', pilot_fit_score: 68, pilot_fit_reason: 'National GC, Sage 300 CRE', website: 'https://www.henselphelps.com' },
  { company_name: 'Limbach Holdings', erp_type: 'Sage300', state: 'PA', revenue_range: '$300M+', pilot_fit_score: 75, pilot_fit_reason: 'MEP contractor, Sage 300 user, public company', website: 'https://www.limbachinc.com' },
  { company_name: 'Barton Malow', erp_type: 'Sage300', state: 'MI', revenue_range: '$500M+', pilot_fit_score: 70, pilot_fit_reason: 'Midwest GC, Sage 300', website: 'https://www.bartonmalow.com' },

  // QuickBooks Enterprise users (smaller GCs/subcontractors in target range)
  { company_name: 'Creative Contractors Inc', erp_type: 'QBE', state: 'FL', revenue_range: '$10M-$75M', pilot_fit_score: 80, pilot_fit_reason: 'FL GC in target revenue range, QBE user', website: 'https://www.creativecontractors.net' },
  { company_name: 'Conditioned Air', erp_type: 'QBE', state: 'FL', revenue_range: '$50M-$100M', pilot_fit_score: 78, pilot_fit_reason: 'FL HVAC contractor, QBE user, multi-division', website: 'https://www.conditionedair.com' },
  { company_name: 'Wright Construction Group', erp_type: 'QBE', state: 'FL', revenue_range: '$25M-$75M', pilot_fit_score: 82, pilot_fit_reason: 'FL GC in perfect ICP range', website: 'https://www.wrightconstructiongroup.com' },
  { company_name: 'Morris-Shea Bridge Company', erp_type: 'QBE', state: 'AL', revenue_range: '$50M-$150M', pilot_fit_score: 76, pilot_fit_reason: 'Specialty contractor, QBE multi-division', website: 'https://www.morrisshea.com' },
  { company_name: 'Centennial Contractors', erp_type: 'QBE', state: 'TX', revenue_range: '$25M-$100M', pilot_fit_score: 79, pilot_fit_reason: 'TX GC, QBE job costing confirmed', website: '' },

  // Additional Florida targets (high priority for Phase 0)
  { company_name: 'Kaufman Lynn Construction', erp_type: 'Unknown', state: 'FL', revenue_range: '$100M-$500M', pilot_fit_score: 65, pilot_fit_reason: 'FL GC, ICP size, ERP unconfirmed', website: 'https://www.kaufmanlynn.com' },
  { company_name: 'The Weitz Company', erp_type: 'Vista', state: 'FL', revenue_range: '$500M+', pilot_fit_score: 67, pilot_fit_reason: 'FL operations, known Vista user', website: 'https://www.weitz.com' },
  { company_name: 'Balfour Beatty US', erp_type: 'Vista', state: 'FL', revenue_range: '$1B+', pilot_fit_score: 60, pilot_fit_reason: 'FL operations, Vista ERP', website: 'https://www.balfourbeattyus.com' },
  { company_name: 'Ajax Building Corporation', erp_type: 'Unknown', state: 'FL', revenue_range: '$50M-$200M', pilot_fit_score: 72, pilot_fit_reason: 'FL GC, Tampa area, ICP target size', website: 'https://www.ajaxbldg.com' },
  { company_name: 'Halferty Construction', erp_type: 'QBE', state: 'FL', revenue_range: '$10M-$50M', pilot_fit_score: 83, pilot_fit_reason: 'FL GC, exact ICP range, QBE known', website: '' },
];

async function seed() {
  console.log('\n=== SEED: CFO Initial Lead Prospects ===\n');
  await initDatabase();

  let created = 0;
  let skipped = 0;

  for (const lead of INITIAL_LEADS) {
    const existing = get('SELECT id FROM cfo_leads WHERE LOWER(company_name) = LOWER(?)', [lead.company_name]);
    if (existing) {
      console.log(`  SKIP  ${lead.company_name}`);
      skipped++;
      continue;
    }

    run(
      `INSERT INTO cfo_leads
       (company_name, erp_type, state, revenue_range, website, pilot_fit_score, pilot_fit_reason, status, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'new', 'manual_research')`,
      [lead.company_name, lead.erp_type, lead.state, lead.revenue_range, lead.website || null,
       lead.pilot_fit_score, lead.pilot_fit_reason]
    );
    console.log(`  CREATE  ${lead.company_name} | ${lead.erp_type} | score:${lead.pilot_fit_score}`);
    created++;
  }

  console.log(`\nLeads: ${created} created, ${skipped} skipped`);
  console.log('\n✅ Initial lead list seeded! Navigate to /cfo-marketing to view them.');
  process.exit(0);
}

seed().catch(e => { console.error(e.message); process.exit(1); });
