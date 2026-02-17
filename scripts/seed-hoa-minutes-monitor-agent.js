/**
 * @file seed-hoa-minutes-monitor-agent.js
 * @description Register Agent 2: Minutes Monitor in ClawOps Console
 *
 * Usage: node scripts/seed-hoa-minutes-monitor-agent.js
 */

const { run, get, initDatabase } = require('../server/db/connection');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

async function seedMinutesMonitorAgent() {
  console.log('\n🦁 SEED AGENT 2: MINUTES MONITOR\n');
  console.log('='.repeat(60));

  try {
    await initDatabase();
    console.log('✅ Database connection established');

    const existing = get('SELECT * FROM agents WHERE id = ?', ['hoa-minutes-monitor']);
    if (existing) {
      console.log('⚠️  Agent already exists!');
      console.log(`   ID: ${existing.id}`);
      console.log(`   Name: ${existing.name}`);
      console.log('');
      console.log('To re-create, first delete:');
      console.log('   DELETE FROM agents WHERE id = \'hoa-minutes-monitor\';');
      console.log('');
      process.exit(1);
    }

    const agentId = 'hoa-minutes-monitor';
    const agentName = 'HOA Minutes Monitor';
    const agentDescription = 'Scans HOA meeting minutes and scores for capital project signals. Identifies HOT/WARM/WATCH leads. Cost: $0.50/run (LLM for PDF parsing).';

    const config = {
      special_handler: 'hoa_minutes_monitor',
      soul_path: 'openclaw-skills/hoa-minutes-monitor/SOUL.md',
      database: 'hoa_leads.sqlite',
      keyword_config_path: 'c:/Users/SPilcher/Downloads/files (6)/keyword-scoring.json',
      scoring_thresholds: {
        HOT: 15,
        WARM: 8,
        WATCH: 3,
        ARCHIVE: 0
      },
      default_params: {
        limit: 20,
        state: null,
        priority_min: 5
      },
      schedule: {
        frequency: 'daily',
        time: '03:00',
        enabled: false
      }
    };

    const soulPath = path.join(__dirname, '..', 'openclaw-skills', 'hoa-minutes-monitor', 'SOUL.md');
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
    console.log(`Special Handler: hoa_minutes_monitor`);
    console.log(`Database: hoa_leads.sqlite`);
    console.log(`Scoring: HOT ≥15, WARM ≥8, WATCH ≥3`);
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
    console.log('4. ⏭️  Open UI: http://localhost:5174/agents');
    console.log('5. ⏭️  Test agent via UI or CLI:');
    console.log('       node scripts/run-minutes-monitor.js --limit=10');
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

seedMinutesMonitorAgent();
