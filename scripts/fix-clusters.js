/**
 * Fix opportunity clusters:
 * 1. Classify 145 unclassified signals via Ollama
 * 2. Recluster ALL signals using category-first strategy
 *
 * Must be run with server STOPPED (sql.js in-memory DB).
 */
'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

async function main() {
  const { initDatabase, all, get, run } = require('../server/db/connection');
  await initDatabase();

  // 1. Classify unclassified signals
  const unclassified = all("SELECT id, title, body_text FROM opp_signals WHERE category IS NULL LIMIT 200");
  console.log(`Step 1: Classifying ${unclassified.length} unclassified signals via Ollama...`);

  const { chat } = require('../server/services/llmClient');
  let classified = 0;
  let errors = 0;

  for (const sig of unclassified) {
    try {
      const text = `Title: ${sig.title}\nBody: ${(sig.body_text || '').slice(0, 300)}`;
      const raw = await chat(
        'Classify this signal into EXACTLY ONE category. Return ONLY the category word, nothing else. Categories: finance, construction, automation, dev_tools, marketing, operations, analytics, hiring, compliance, other',
        text,
        { model: 'llama3.2:3b', provider: 'ollama', temperature: 0.1, maxTokens: 20, timeoutMs: 15000 }
      );
      const category = (raw || '').trim().toLowerCase().replace(/[^a-z_]/g, '').slice(0, 30) || 'other';
      run('UPDATE opp_signals SET category = ? WHERE id = ?', [category, sig.id]);
      classified++;
      if (classified % 20 === 0) console.log(`  Classified ${classified}/${unclassified.length}...`);
    } catch (err) {
      errors++;
      run('UPDATE opp_signals SET category = ? WHERE id = ?', ['other', sig.id]);
    }
  }
  console.log(`Classified: ${classified} | Errors (defaulted to "other"): ${errors}`);

  // Show category distribution
  const cats = all('SELECT category, COUNT(*) c FROM opp_signals WHERE category IS NOT NULL GROUP BY category ORDER BY c DESC');
  console.log('\nCategory distribution:');
  cats.forEach(c => console.log(`  ${c.category}: ${c.c}`));

  // 2. Recluster using category-first strategy
  console.log('\nStep 2: Reclustering all signals...');
  const signals = all('SELECT id, pain_fingerprint, category, title FROM opp_signals WHERE category IS NOT NULL ORDER BY id');

  run('UPDATE opp_signals SET cluster_id = NULL');
  run('DELETE FROM opp_clusters');

  const dedup = require('../server/services/signalDedup');
  let created = 0, merged = 0;

  for (const sig of signals) {
    const result = dedup.assignToCluster(sig.id, sig.pain_fingerprint, sig.title, sig.category);
    if (result.isNew) created++; else merged++;
  }

  const dist = all('SELECT signal_count, COUNT(*) c FROM opp_clusters GROUP BY signal_count ORDER BY signal_count DESC');
  const scorable = get('SELECT COUNT(*) c FROM opp_clusters WHERE signal_count >= 3')?.c || 0;

  console.log(`\nResults: ${created} clusters, ${merged} merged`);
  console.log('Distribution:');
  dist.forEach(d => console.log(`  signal_count=${d.signal_count}: ${d.c} clusters`));
  console.log(`\nScorable (signal_count >= 3): ${scorable}`);

  // Show top clusters
  const top = all('SELECT id, pain_summary, pain_category, signal_count FROM opp_clusters ORDER BY signal_count DESC LIMIT 5');
  console.log('\nTop clusters:');
  top.forEach(c => console.log(`  [${c.signal_count} signals] ${c.pain_category}: ${(c.pain_summary || '').slice(0, 60)}`));
}

main().catch(e => { console.error(e); process.exit(1); });
