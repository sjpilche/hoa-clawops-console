'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
const { initDatabase, run, all } = require('../server/db/connection');

async function main() {
  await initDatabase();

  // Maps leads breakdown
  const maps = all("SELECT id, company_name, city, state, contact_email, phone, contact_name, website, enrichment_status, enrichment_method FROM cfo_leads WHERE source='google_maps_discovery' ORDER BY enrichment_status, id");
  const mapsEnriched = maps.filter(l => l.contact_email);
  const mapsPartial  = maps.filter(l => !l.contact_email && (l.phone || l.website));
  const mapsFailed   = maps.filter(l => !l.contact_email && !l.phone && !l.website);
  const mapsPending  = maps.filter(l => l.enrichment_status === 'pending');

  console.log('\n=== MAPS LEADS — ENRICHED WITH EMAIL ===');
  mapsEnriched.forEach(l => console.log(`  [${l.id}] ${l.company_name} (${l.city})\n        ${l.contact_email} | ${l.phone || 'no phone'} | ${l.enrichment_method}`));

  console.log('\n=== MAPS LEADS — PARTIAL (website/phone only) ===');
  mapsPartial.forEach(l => console.log(`  [${l.id}] ${l.company_name} — phone: ${l.phone || '-'} | site: ${l.website || '-'}`));

  console.log('\n=== MAPS LEADS SUMMARY ===');
  console.log(`  Total:   ${maps.length}`);
  console.log(`  Email:   ${mapsEnriched.length} (${Math.round(mapsEnriched.length/maps.length*100)}%)`);
  console.log(`  Partial: ${mapsPartial.length}`);
  console.log(`  Failed:  ${mapsFailed.length}`);
  console.log(`  Pending: ${mapsPending.length}`);

  // Overall pipeline health
  const allLeads = all("SELECT source, enrichment_status, contact_email IS NOT NULL AS has_email FROM cfo_leads");
  const sources = {};
  allLeads.forEach(l => {
    if (!sources[l.source]) sources[l.source] = { total: 0, has_email: 0 };
    sources[l.source].total++;
    if (l.has_email) sources[l.source].has_email++;
  });

  console.log('\n=== ALL LEADS BY SOURCE ===');
  Object.entries(sources).forEach(([src, s]) =>
    console.log(`  ${src}: ${s.total} total, ${s.has_email} with email (${Math.round(s.has_email/s.total*100)}%)`));
  console.log(`  TOTAL: ${allLeads.length} leads, ${allLeads.filter(l => l.has_email).length} with email`);

  // Clean up obvious false-match emails (phone merged into email prefix, pattern guesses from bad contact names)
  const badPatterns = maps.filter(l => l.contact_email && (
    /^\d+/.test(l.contact_email) ||                          // starts with digit (phone prefix merged)
    /^with\.|^our\.|^the\./.test(l.contact_email)           // pattern guess from bad contact name
  ));
  if (badPatterns.length > 0) {
    console.log('\n=== CLEANING BAD EMAILS ===');
    badPatterns.forEach(l => {
      console.log(`  Clearing: [${l.id}] ${l.company_name} → ${l.contact_email}`);
      run("UPDATE cfo_leads SET contact_email=NULL, contact_name=NULL, enrichment_status='partial', enrichment_method='phone_only' WHERE id=?", [l.id]);
    });
  }
}
main().catch(console.error);
