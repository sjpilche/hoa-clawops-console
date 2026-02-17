/**
 * @file seed-hoa-discovery-agent.js
 * @description Register Agent 1: HOA Discovery in ClawOps Console
 *
 * This creates the agent record in the database with special_handler config.
 * The special handler bypasses OpenClaw CLI and runs pure Node.js code.
 *
 * Usage: node scripts/seed-hoa-discovery-agent.js
 */

const { run, get, initDatabase } = require('../server/db/connection');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

async function seedHOADiscoveryAgent() {
  console.log('\n🦁 SEED AGENT 1: HOA DISCOVERY\n');
  console.log('='.repeat(60));

  try {
    // Initialize database
    await initDatabase();
    console.log('✅ Database connection established');

    // Check if agent already exists
    const existing = get('SELECT * FROM agents WHERE id = ?', ['hoa-discovery']);
    if (existing) {
      console.log('⚠️  Agent already exists!');
      console.log(`   ID: ${existing.id}`);
      console.log(`   Name: ${existing.name}`);
      console.log(`   Status: ${existing.status}`);
      console.log('');
      console.log('To re-create, first delete:');
      console.log('   DELETE FROM agents WHERE id = \'hoa-discovery\';');
      console.log('');
      process.exit(1);
    }

    // Create agent configuration
    const agentId = 'hoa-discovery';
    const agentName = 'HOA Discovery';
    const agentDescription = 'Discovers HOA communities from public directories (FL DBPR, CO DORA, CA SOS). Zero-cost scraping with Playwright.';

    // Special handler configuration (pure Node.js, no OpenClaw CLI)
    const config = {
      special_handler: 'hoa_discovery',
      soul_path: 'openclaw-skills/hoa-discovery/SOUL.md',
      database: 'hoa_leads.sqlite',
      sources: {
        'fl-dbpr': { priority: 10, estimated_records: 25000, cost: 0 },
        'co-dora': { priority: 10, estimated_records: 10000, cost: 0 },
        'ca-sos': { priority: 9, estimated_records: 5000, cost: 0 },
        'mock': { priority: 1, estimated_records: 50, cost: 0 }
      },
      supported_states: ['CA', 'FL', 'CO'],
      default_params: {
        source: 'mock',
        state: 'FL',
        limit: 100
      }
    };

    // Read SOUL.md
    const soulPath = path.join(__dirname, '..', 'openclaw-skills', 'hoa-discovery', 'SOUL.md');
    let instructions = '';
    if (fs.existsSync(soulPath)) {
      instructions = fs.readFileSync(soulPath, 'utf-8');
      console.log(`✅ Loaded SOUL.md (${instructions.length} characters)`);
    } else {
      console.log('⚠️  SOUL.md not found, agent will have empty instructions');
    }

    // Insert agent
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
      'idle', // idle until first run
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
    console.log(`Special Handler: hoa_discovery`);
    console.log(`Database: hoa_leads.sqlite`);
    console.log(`Sources: fl-dbpr, co-dora, ca-sos, mock`);
    console.log('');

    // Verify it was created
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
    console.log('       node scripts/run-hoa-discovery.js --source=mock --state=FL --limit=20');
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

// Run seed
seedHOADiscoveryAgent();
