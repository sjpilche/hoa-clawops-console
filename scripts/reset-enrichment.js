/**
 * Reset enrichment_status back to 'pending' for leads that failed enrichment.
 * Run this BEFORE re-running the enricher after a bug fix.
 *
 * Usage:
 *   node scripts/reset-enrichment.js                    # reset all failed leads
 *   node scripts/reset-enrichment.js maps               # reset only google_maps_discovery leads
 *   node scripts/reset-enrichment.js maps CO            # reset Maps leads in Colorado only
 */
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
const { initDatabase, run, all } = require('../server/db/connection');

const sourceArg = process.argv[2] || null;
const stateArg  = process.argv[3] || null;

const sourceMap = { maps: 'google_maps_discovery', dbpr: 'dbpr_scrape', scout: 'lead_scout' };
const source = (sourceArg && sourceMap[sourceArg]) ? sourceMap[sourceArg] : sourceArg || null;

async function main() {
  await initDatabase();

  const conditions = [`enrichment_status IN ('failed', 'in_progress')`, `(contact_email IS NULL OR contact_email = '')`];
  const params = [];

  if (source) { conditions.push(`source = ?`); params.push(source); }
  if (stateArg) { conditions.push(`UPPER(state) = UPPER(?)`); params.push(stateArg); }

  const where = conditions.join(' AND ');
  const leads = all(`SELECT id, company_name, city, state, source, enrichment_status FROM cfo_leads WHERE ${where}`, params);

  if (leads.length === 0) {
    console.log('No leads to reset.');
    return;
  }

  console.log(`Resetting ${leads.length} leads to 'pending':`);
  leads.forEach(l => console.log(`  [${l.id}] ${l.company_name} (${l.city}, ${l.state}) — ${l.source} — was: ${l.enrichment_status}`));

  run(`UPDATE cfo_leads SET enrichment_status = 'pending', enrichment_method = NULL, enriched_at = NULL WHERE ${where}`, params);
  console.log(`\n✅ Reset ${leads.length} leads to pending. Run trigger-enricher.js to re-enrich.`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
