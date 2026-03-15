#!/usr/bin/env node
/**
 * Full scan cycle: run all HTTP scanners → ingest → dedup → classify via Ollama.
 * Same logic as the opportunity_scanner handler but runs standalone.
 *
 * Usage:
 *   node scripts/run-full-scan.js              # All enabled HTTP scanners
 *   node scripts/run-full-scan.js --classify    # Also classify via Ollama after ingest
 *   node scripts/run-full-scan.js github        # Single scanner
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });

const path = require('path');
const resolve = (p) => path.join(__dirname, '..', p);

const { initDatabase } = require(resolve('server/db/connection'));
const ingest = require(resolve('server/services/signalIngest'));

const SCANNER_MAP = {
  reddit:         () => require(resolve('server/services/scanners/redditScanner')),
  hn:             () => require(resolve('server/services/scanners/hnScanner')),
  ph:             () => require(resolve('server/services/scanners/phScanner')),
  github:         () => require(resolve('server/services/scanners/githubScanner')),
  trends:         () => require(resolve('server/services/scanners/trendsScanner')),
  stackoverflow:  () => require(resolve('server/services/scanners/stackoverflowScanner')),
};

async function main() {
  const args = process.argv.slice(2);
  const doClassify = args.includes('--classify');
  const singleScanner = args.find(a => !a.startsWith('--'));

  await initDatabase();

  const scanners = singleScanner ? [singleScanner] : Object.keys(SCANNER_MAP);

  console.log(`\n🔍 Running ${scanners.length} scanners: ${scanners.join(', ')}`);
  if (doClassify) console.log('📊 Classification enabled — will classify after ingest');

  let totalNew = 0;
  let totalSkipped = 0;

  for (const name of scanners) {
    const loader = SCANNER_MAP[name];
    if (!loader) { console.warn(`  Unknown scanner: ${name}`); continue; }

    const start = Date.now();
    try {
      const state = ingest.getScannerState(name);
      const mod = loader();
      const result = await mod.scan(state.last_cursor);

      let inserted = 0;
      let skipped = 0;
      for (const signal of result.signals) {
        const r = ingest.ingestSignal(name, signal);
        if (r) inserted++;
        else skipped++;
      }

      ingest.updateScannerState(name, result.nextCursor, inserted, result.errors || 0);
      totalNew += inserted;
      totalSkipped += skipped;

      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`  ✅ ${name.padEnd(16)} ${inserted} new, ${skipped} dupes in ${elapsed}s`);
    } catch (err) {
      console.error(`  ❌ ${name}: ${err.message}`);
    }
  }

  console.log(`\n📦 Ingest complete: ${totalNew} new signals, ${totalSkipped} duplicates`);

  // Stats
  const stats = ingest.getStats();
  console.log(`📊 DB state: ${stats.signals_total} signals total, ${stats.signals_classified} classified, ${stats.signals_pending} pending, ${stats.clusters_total} clusters`);

  // Classify if requested
  if (doClassify && stats.signals_pending > 0) {
    console.log(`\n🧠 Classifying up to 20 signals via Ollama...`);
    const classResult = await ingest.classifyBatch(20);
    console.log(`   Classified: ${classResult.classified}, Noise: ${classResult.noise}, Errors: ${classResult.errors}`);

    const postStats = ingest.getStats();
    console.log(`📊 Post-classify: ${postStats.signals_classified} classified, ${postStats.signals_pending} pending, ${postStats.clusters_total} clusters`);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
