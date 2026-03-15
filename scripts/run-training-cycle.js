#!/usr/bin/env node
/**
 * Run a full training cycle v2 — queue + train + QA grading + promotion.
 * Usage: node scripts/run-training-cycle.js [max_agents]
 *        node scripts/run-training-cycle.js --stats
 *        node scripts/run-training-cycle.js --promote
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const { initDatabase } = require(require('path').join(__dirname, '..', 'server/db/connection'));

async function main() {
  await initDatabase();
  const trainer = require(require('path').join(__dirname, '..', 'server/services/idleTrainer'));

  const arg = process.argv[2];

  // Stats mode
  if (arg === '--stats') {
    const stats = trainer.getTrainingStats();
    const capacity = trainer.getSystemCapacity();
    const gates = trainer.checkTrainingGates();
    console.log('\n=== Training Stats (v2) ===');
    console.log(`  Sessions: ${stats.totalSessions} | Skills: ${stats.totalSkills} | Agents: ${stats.uniqueAgents} | Max level: ${stats.maxLevel}`);
    console.log(`  Candidates: pending=${stats.candidates.pending}, approved=${stats.candidates.approved}, rejected=${stats.candidates.rejected} (avg QA: ${stats.candidates.avgScore})`);
    console.log(`  Queue: ${stats.queueDepth} pending | Activities: ${stats.byActivity.map(a => `${a.activity_type}:${a.count}`).join(', ') || 'none'}`);
    console.log(`  System: CPU ${capacity.cpuPercent}%, RAM ${capacity.ramPercent}%, Free ${capacity.freeMemMB}MB`);
    console.log(`  Gates: ${gates.allowed ? 'OPEN' : `BLOCKED — ${gates.reason}`}`);
    if (stats.recentQuip) console.log(`  Latest quip: ${stats.recentQuip}`);
    if (stats.topSkilled.length > 0) {
      console.log('  Leaderboard:');
      stats.topSkilled.forEach(a => console.log(`    ${a.agent_name}: ${a.skills} skills, ${a.total_levels} total pts`));
    }
    return;
  }

  // Promote-only mode
  if (arg === '--promote') {
    console.log('\n=== Running QA Promotion Cycle ===\n');
    const qa = require(require('path').join(__dirname, '..', 'server/services/trainingQA'));
    const result = await qa.runQACycle(10);
    console.log(`\nDone: ${result.graded} graded → ${result.promoted} promoted, ${result.rejected} rejected, ${result.skipped} pending re-eval`);
    return;
  }

  // Full training cycle
  const maxAgents = parseInt(arg) || 3;

  console.log('\n=== System Capacity ===');
  const cap = trainer.getSystemCapacity();
  console.log(`  CPU: ${cap.cpuPercent}% | RAM: ${cap.ramPercent}% | Free: ${cap.freeMemMB}MB`);
  console.log(`  Running: ${cap.runningAgents} | Active runs: ${cap.activeRuns} | Capacity OK: ${cap.hasCapacity}`);

  console.log('\n=== Training Gates ===');
  const gates = trainer.checkTrainingGates();
  console.log(`  ${gates.allowed ? 'OPEN — all gates pass' : `BLOCKED — ${gates.reason}`}`);

  if (!gates.allowed) {
    console.log('\n  Training blocked by gates. Use --stats to check current state.');
    return;
  }

  console.log(`\n=== Running Training Cycle v2 (up to ${maxAgents} agents) ===\n`);
  const result = await trainer.runTrainingCycle(maxAgents);

  console.log('\n' + result.summary);

  if (result.trained > 0) {
    console.log('\n=== Leaderboard After Training ===');
    const stats = trainer.getTrainingStats();
    console.log(`  Total sessions: ${stats.totalSessions} | Skills: ${stats.totalSkills} | Max level: ${stats.maxLevel}`);
    console.log(`  Candidates: ${stats.candidates.pending} pending QA, ${stats.candidates.approved} approved, ${stats.candidates.rejected} rejected`);
    if (stats.topSkilled.length > 0) {
      stats.topSkilled.forEach(a => console.log(`  ${a.agent_name}: ${a.skills} skills, ${a.total_levels} total points`));
    }
  }
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
