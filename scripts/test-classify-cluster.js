/**
 * Test: classify signals via Ollama, then cluster them.
 * Usage: node scripts/test-classify-cluster.js
 */
require('dotenv').config({ path: '.env.local' });
const { initDatabase, all, get } = require('../server/db/connection');

(async () => {
  await initDatabase();
  
  const unclassified = get("SELECT COUNT(*) AS c FROM opp_signals WHERE classification IS NULL");
  console.log('Unclassified signals:', unclassified.c);
  
  // Classify via Ollama
  const { classifyBatch } = require('../server/services/signalIngest');
  console.log('\n--- Classifying signals via Ollama ---');
  const classified = await classifyBatch(20); // classify 20 at a time
  console.log('Classified:', classified, 'signals');
  
  // Show classification results
  const stats = all("SELECT classification, COUNT(*) AS c FROM opp_signals GROUP BY classification ORDER BY c DESC");
  console.log('\nClassification breakdown:');
  stats.forEach(s => console.log('  ', s.classification || 'null', ':', s.c));
  
  // Show clusters formed
  const clusters = all("SELECT * FROM opp_clusters ORDER BY signal_count DESC LIMIT 10");
  console.log('\nClusters formed:', clusters.length);
  clusters.forEach(c => {
    console.log(`  [${c.signal_count} signals] ${c.pain_summary?.substring(0, 60)} | cat: ${c.pain_category}`);
  });
  
  const remaining = get("SELECT COUNT(*) AS c FROM opp_signals WHERE classification IS NULL");
  console.log('\nStill unclassified:', remaining.c);
  
  process.exit(0);
})();
