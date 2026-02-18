/**
 * @file seed-google-reviews-monitor-agent.js
 * @description Register Agent 5: Google Reviews Monitor in ClawOps Console
 *
 * Usage: node scripts/seed-google-reviews-monitor-agent.js
 */

const { run, get, initDatabase } = require('../server/db/connection');
const fs = require('fs');
const path = require('path');

async function seedGoogleReviewsMonitorAgent() {
  console.log('\n🦁 SEED AGENT 5: GOOGLE REVIEWS MONITOR\n');
  console.log('='.repeat(60));

  try {
    await initDatabase();
    console.log('✅ Database connection established');

    const existing = get('SELECT * FROM agents WHERE id = ?', ['google-reviews-monitor']);
    if (existing) {
      console.log('⚠️  Agent already exists!');
      console.log(`   ID: ${existing.id}`);
      console.log(`   Name: ${existing.name}`);
      console.log('');
      console.log('To re-create, first delete:');
      console.log('   DELETE FROM agents WHERE id = \'google-reviews-monitor\';');
      console.log('');
      process.exit(1);
    }

    const agentId = 'google-reviews-monitor';
    const agentName = 'Google Reviews Signal Monitor';
    const agentDescription = 'Monitors Google Maps reviews for HOA capital need signals. Detects real-time buying signals (special assessments, roof replacements, etc.). Highest ROI agent. Cost: $0/month (public web scraping).';

    const config = {
      special_handler: 'google_reviews_monitor',
      soul_path: 'openclaw-skills/google-reviews-monitor/SOUL.md',
      database: 'hoa_leads.sqlite',
      scoring_config: {
        tier1_points: 15,
        tier2_points: 10,
        tier3_points: 5,
        star_multipliers: { 1: 1.5, 2: 1.3, 3: 1.1, 4: 0.9, 5: 0.5 },
        recency_multipliers: { 30: 2.0, 90: 1.5, 180: 1.0, 365: 0.6, 999: 0.3 },
        tiers: { HOT: 75, WARM: 50, MONITOR: 25, COLD: 0 }
      },
      scraping_config: {
        max_reviews: 50,
        max_reviews_first_scrape: 200,
        scroll_wait_ms: 800,
        expand_wait_ms: 300
      },
      default_params: {
        limit: 10,
        tier: null
      },
      schedule: {
        frequency: 'manual',
        enabled: false
      }
    };

    const soulPath = path.join(__dirname, '..', 'openclaw-skills', 'google-reviews-monitor', 'SOUL.md');
    let instructions = '';
    if (fs.existsSync(soulPath)) {
      instructions = fs.readFileSync(soulPath, 'utf-8');
      console.log(`✅ Loaded SOUL.md (${instructions.length} characters)`);
    }

    console.log('');
    console.log('Creating agent...');
    run(`
      INSERT INTO agents (
        id, name, description, status, config, instructions,
        last_run_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, CURRENT_TIMESTAMP)
    `, [
      agentId,
      agentName,
      agentDescription,
      'idle',
      JSON.stringify(config),
      instructions
    ]);

    console.log('✅ Agent created successfully!');
    console.log('');
    console.log('='.repeat(60));
    console.log('📋 AGENT DETAILS');
    console.log('='.repeat(60));
    console.log(`ID: ${agentId}`);
    console.log(`Name: ${agentName}`);
    console.log(`Description: ${agentDescription}`);
    console.log(`Status: idle`);
    console.log(`Special Handler: google_reviews_monitor`);
    console.log(`Database: hoa_leads.sqlite`);
    console.log(`Cost: $0/month (FREE!)`);
    console.log(`ROI: INFINITE (no cost, pure profit)`);
    console.log('');

    const created = get('SELECT * FROM agents WHERE id = ?', [agentId]);
    if (created) {
      console.log('✅ Verified agent exists in database');
      console.log('');
    }

    console.log('='.repeat(60));
    console.log('🎯 NEXT STEPS');
    console.log('='.repeat(60));
    console.log('1. ✅ Agent registered in ClawOps');
    console.log('2. ⏭️  Update server/routes/runs.js with special handler');
    console.log('3. ⏭️  Restart server: npm run dev');
    console.log('4. ⏭️  Test via CLI:');
    console.log('       node scripts/run-google-reviews-monitor.js --limit=3');
    console.log('');

    process.exit(0);

  } catch (error) {
    console.error('');
    console.error('❌ SEED FAILED');
    console.error('='.repeat(60));
    console.error('Error:', error.message);
    console.error('');
    if (error.stack) {
      console.error('Stack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

seedGoogleReviewsMonitorAgent();
