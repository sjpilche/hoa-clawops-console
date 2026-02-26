/**
 * Run jake-contact-enricher immediately for pending leads.
 * Run: node scripts/run-enricher-now.js
 */
'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

async function main() {
  const { get, run, all, initDatabase } = require('../server/db/connection');
  await initDatabase();

  // Show what needs enrichment
  const pending = all(`SELECT id, company_name, contact_name, city, state, pilot_fit_score
    FROM cfo_leads WHERE (enrichment_status = 'pending' OR enrichment_status IS NULL) AND source_agent = 'jake'
    ORDER BY pilot_fit_score DESC LIMIT 20`);
  console.log(`\nLeads pending enrichment: ${pending.length}`);
  pending.forEach(l => console.log(`  [${l.pilot_fit_score||0}] ${l.company_name} | ${l.contact_name||'(no name)'} | ${l.city||''}${l.state ? ', '+l.state : ''}`));

  if (pending.length === 0) {
    console.log('Nothing to enrich. Run the lead scout first.');
    return;
  }

  console.log('\nStarting enrichment...\n');

  const { enrichMultipleLeads } = require('../server/services/jakeContactEnricher');
  const result = await enrichMultipleLeads({ limit: 20, min_score: 0, status_filter: 'pending' });

  console.log(`\n✅ Enrichment complete: ${result.enriched}/${result.total} found emails`);
  result.results.forEach(r => console.log(`  ${r.company}: ${r.email || '(no email found)'} via ${r.method || 'failed'}`));

  // Show updated leads
  const updated = all(`SELECT company_name, contact_name, contact_email, contact_title, enrichment_status
    FROM cfo_leads WHERE source_agent = 'jake' ORDER BY created_at DESC LIMIT 10`);
  console.log('\n📋 Jake leads after enrichment:');
  updated.forEach(l => console.log(`  ${l.company_name} | ${l.contact_name||'—'} | ${l.contact_email||'(no email)'} | ${l.enrichment_status}`));
}

main().catch(console.error);
