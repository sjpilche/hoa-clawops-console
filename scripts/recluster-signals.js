/**
 * Re-cluster existing opportunity signals with the loosened threshold.
 * Merges singleton clusters that should be together.
 *
 * Usage: node scripts/recluster-signals.js [--dry-run]
 */
'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
const { initDatabase, all, get, run } = require('../server/db/connection');
const dedup = require('../server/services/signalDedup');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  await initDatabase();

  // Get all signals with fingerprints
  const signals = all(`
    SELECT id, pain_fingerprint, cluster_id, title
    FROM opp_signals
    WHERE pain_fingerprint IS NOT NULL
    ORDER BY id
  `);

  console.log(`Found ${signals.length} signals with fingerprints`);
  if (DRY_RUN) console.log('[DRY RUN — no changes]');

  // Reset all cluster assignments
  if (!DRY_RUN) {
    run('UPDATE opp_signals SET cluster_id = NULL WHERE pain_fingerprint IS NOT NULL');
    run('DELETE FROM opp_clusters');
    console.log('Cleared all clusters');
  }

  let clustersCreated = 0;
  let merged = 0;

  for (const sig of signals) {
    const result = dedup.assignToCluster(sig.id, sig.pain_fingerprint, sig.title, null);
    if (result.isNew) {
      clustersCreated++;
    } else {
      merged++;
    }
  }

  // Show results
  const dist = all('SELECT signal_count, COUNT(*) c FROM opp_clusters GROUP BY signal_count ORDER BY signal_count DESC');
  console.log(`\nResults: ${clustersCreated} clusters created, ${merged} signals merged into existing`);
  console.log('Distribution:');
  dist.forEach(d => console.log(`  signal_count=${d.signal_count}: ${d.c} clusters`));

  const scorable = get('SELECT COUNT(*) c FROM opp_clusters WHERE signal_count >= 3')?.c || 0;
  console.log(`\nScorable clusters (signal_count >= 3): ${scorable}`);
}

main().catch(e => { console.error(e); process.exit(1); });
