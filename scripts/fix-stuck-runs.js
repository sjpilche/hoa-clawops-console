'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
const { initDatabase, run, all } = require('../server/db/connection');

async function main() {
  await initDatabase();

  // Fix stuck running runs
  const stuckRuns = all("SELECT id, agent_id FROM runs WHERE status='running'");
  if (stuckRuns.length > 0) {
    console.log(`Fixing ${stuckRuns.length} stuck running runs...`);
    stuckRuns.forEach(r => {
      run(
        "UPDATE runs SET status='failed', error_msg='Killed — server restart', completed_at=datetime('now'), updated_at=datetime('now') WHERE id=?",
        [r.id]
      );
      run("UPDATE agents SET status='idle', updated_at=datetime('now') WHERE id=?", [r.agent_id]);
      console.log('  Fixed run:', r.id);
    });
  } else {
    console.log('No stuck running runs found.');
  }

  // Reset in_progress enrichment to partial
  const inProg = all("SELECT id, company_name FROM cfo_leads WHERE enrichment_status='in_progress'");
  if (inProg.length > 0) {
    console.log(`\nResetting ${inProg.length} in_progress leads to partial:`);
    inProg.forEach(l => console.log('  [' + l.id + ']', l.company_name));
    run("UPDATE cfo_leads SET enrichment_status='partial' WHERE enrichment_status='in_progress'");
  }

  // Show partial leads ready for re-enrichment
  const partials = all("SELECT id, company_name, website FROM cfo_leads WHERE source='google_maps_discovery' AND enrichment_status='partial' AND (contact_email IS NULL OR contact_email='')");
  console.log(`\n✅ ${partials.length} partial Maps leads ready for re-enrichment:`);
  partials.forEach(l => console.log('  [' + l.id + ']', l.company_name, '|', l.website || 'no website'));
}

main().catch(err => { console.error(err.message); process.exit(1); });
