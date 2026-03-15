#!/usr/bin/env node
/**
 * Test the Idle Training system components.
 * Usage: node scripts/test-idle-trainer.js
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });

const path = require('path');
const { initDatabase } = require(path.join(__dirname, '..', 'server/db/connection'));

async function main() {
  await initDatabase();
  const trainer = require(path.join(__dirname, '..', 'server/services/idleTrainer'));

  // 1. System capacity
  console.log('\n=== System Capacity ===');
  const cap = trainer.getSystemCapacity();
  console.log(`  CPU: ${cap.cpuPercent}% | RAM: ${cap.ramPercent}% | Free: ${cap.freeMemMB}MB`);
  console.log(`  Running agents: ${cap.runningAgents} | Pending runs: ${cap.pendingRuns}`);
  console.log(`  Has capacity: ${cap.hasCapacity}`);

  // 2. Pick trainee
  console.log('\n=== Picking Trainee ===');
  const trainee = trainer.pickTrainee();
  if (!trainee) {
    console.log('  No eligible agents found (all busy, trained recently, or no schedules)');
    return;
  }
  console.log(`  Selected: ${trainee.name} | Skills: ${trainee.skill_count} | Last trained: ${trainee.last_trained_at || 'never'}`);

  // 3. YouTube search
  console.log('\n=== YouTube Search ===');
  const topic = 'construction industry cold email techniques that actually work';
  console.log(`  Searching: "${topic}"`);
  const video = await trainer.searchYouTube(topic);
  console.log(`  Found: "${video.title}"`);
  console.log(`  Author: ${video.author || 'unknown'} | Views: ${video.viewCount || 'N/A'}`);
  console.log(`  URL: ${video.url}`);

  // 4. Force a full training session (override capacity check)
  console.log('\n=== Running Training Session (forced) ===');
  // Temporarily patch capacity check
  const origCapacity = trainer.getSystemCapacity;
  const mod = require(path.join(__dirname, '..', 'server/services/idleTrainer'));

  // Just call it directly — if capacity blocks, we'll know
  const result = await trainer.runTrainingSession();

  if (result.skipped) {
    console.log(`  Skipped: ${result.reason}`);
    console.log('\n  (System capacity too high — training correctly yields to real work)');
    console.log('  To force-test, reduce pending runs or RAM usage.');
  } else {
    console.log(`  Agent: ${result.agent}`);
    console.log(`  Topic: ${result.topic}`);
    console.log(`  Video: ${result.video.title}`);
    console.log(`  Skill: ${result.skillName}`);
    console.log(`  Quip: "${result.quip}"`);
    console.log(`  Duration: ${(result.durationMs / 1000).toFixed(1)}s`);
  }

  // 5. Training stats
  console.log('\n=== Training Stats ===');
  const stats = trainer.getTrainingStats();
  console.log(`  Total sessions: ${stats.totalSessions}`);
  console.log(`  Total skills: ${stats.totalSkills}`);
  console.log(`  Agents trained: ${stats.uniqueAgents}`);
  console.log(`  Max level: ${stats.maxLevel}`);
  if (stats.recentQuip) console.log(`  Latest quip: ${stats.recentQuip}`);
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
