/**
 * @file seed-hoa-outreach-drafter-agent.js
 * @description Register Agent 4: Outreach Drafter in ClawOps Console
 *
 * Usage: node scripts/seed-hoa-outreach-drafter-agent.js
 */

const { run, get, initDatabase } = require('../server/db/connection');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

async function seedOutreachDrafterAgent() {
  console.log('\n🦁 SEED AGENT 4: OUTREACH DRAFTER\n');
  console.log('='.repeat(60));

  try {
    await initDatabase();
    console.log('✅ Database connection established');

    const existing = get('SELECT * FROM agents WHERE id = ?', ['hoa-outreach-drafter']);
    if (existing) {
      console.log('⚠️  Agent already exists!');
      console.log(`   ID: ${existing.id}`);
      console.log(`   Name: ${existing.name}`);
      console.log('');
      console.log('To re-create, first delete:');
      console.log('   DELETE FROM agents WHERE id = \'hoa-outreach-drafter\';');
      console.log('');
      process.exit(1);
    }

    const agentId = 'hoa-outreach-drafter';
    const agentName = 'HOA Outreach Drafter';
    const agentDescription = 'Generates personalized outreach emails for enriched HOT/WARM leads. Uses 5 scenario-based templates with 3-email sequences. References exact quotes from meeting minutes. Cost: $0/month (template mode).';

    const config = {
      special_handler: 'hoa_outreach_drafter',
      soul_path: 'openclaw-skills/hoa-outreach-drafter/SOUL.md',
      database: 'hoa_leads.sqlite',
      email_scenarios: [
        'special_assessment',
        'reserve_deficiency',
        'compliance_trigger',
        'active_project',
        'general'
      ],
      sequence_config: {
        email_count: 3,
        delays: [0, 3, 7] // days
      },
      personalization_variables: [
        'hoa_name',
        'contact_name',
        'city',
        'state',
        'project_type',
        'signal_quote',
        'compliance_type'
      ],
      default_params: {
        limit: 10,
        tier: null
      },
      schedule: {
        frequency: 'hourly',
        enabled: false,
        trigger: 'New enriched leads with status=complete'
      }
    };

    const soulPath = path.join(__dirname, '..', 'openclaw-skills', 'hoa-outreach-drafter', 'SOUL.md');
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
    console.log(`Special Handler: hoa_outreach_drafter`);
    console.log(`Database: hoa_leads.sqlite`);
    console.log(`Email Templates: 5 scenarios`);
    console.log(`Sequence: 3 emails (0, 3, 7 days)`);
    console.log(`Cost: $0/month (template mode)`);
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
    console.log('5. ⏭️  Test agent via CLI:');
    console.log('       node scripts/run-outreach-drafter.js --limit=5 --tier=HOT');
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

seedOutreachDrafterAgent();
