/**
 * @file activate-marketing-team.js
 * @description Import and activate all 5 HOA marketing agents with schedules
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { run, get, all, initDatabase } = require('../server/db/connection');

const OPENCLAW_SKILLS_PATH = path.join(__dirname, '../openclaw-skills');
const OPENCLAW_WORKSPACES = '/home/sjpilche/projects/openclaw-v1/workspaces';

// Marketing team agent definitions
const MARKETING_AGENTS = [
  {
    id: 'hoa-content-writer',
    name: 'HOA Content Writer',
    description: 'Generate SEO blog posts about HOA financing (1200-1500 words)',
    target_system: 'Web Browser + Email',
    skills_path: 'hoa-content-writer',
    schedules: [
      { cron: '0 6 * * 1,3,5', description: 'Generate blog post (Mon/Wed/Fri 6am)', tz: 'America/New_York' }
    ],
    permissions: 'read-write',
    domains: ['hoaprojectfunding.com'],
  },
  {
    id: 'hoa-social-media',
    name: 'HOA Social Media',
    description: 'Convert blog posts to LinkedIn, Twitter, and Facebook content',
    target_system: 'Social Media APIs',
    skills_path: 'hoa-social-media',
    schedules: [
      { cron: '0 7 * * 1,3,5', description: 'Convert latest blog to social posts (Mon/Wed/Fri 7am)', tz: 'America/New_York' }
    ],
    permissions: 'read-write',
    domains: ['linkedin.com', 'twitter.com', 'facebook.com'],
  },
  {
    id: 'hoa-cms-publisher',
    name: 'HOA CMS Publisher',
    description: 'Publish approved posts to WordPress as drafts',
    target_system: 'WordPress REST API',
    skills_path: 'hoa-cms-publisher',
    schedules: [
      { cron: '30 8 * * 1,3,5', description: 'Publish approved posts to WordPress (Mon/Wed/Fri 8:30am)', tz: 'America/New_York' }
    ],
    permissions: 'read-write',
    domains: ['hoaprojectfunding.com'],
  },
  {
    id: 'hoa-social-engagement',
    name: 'HOA Social Engagement Monitor',
    description: 'Monitor social media for engagement and leads, draft responses',
    target_system: 'Social Media APIs',
    skills_path: 'hoa-social-engagement',
    schedules: [
      { cron: '0 8 * * *', description: 'Check platforms for engagement and draft responses (Daily 8am)', tz: 'America/New_York' },
      { cron: '0 9 * * 1', description: 'Generate weekly engagement report (Monday 9am)', tz: 'America/New_York' }
    ],
    permissions: 'read-write',
    domains: ['linkedin.com', 'twitter.com', 'facebook.com'],
  },
  {
    id: 'hoa-email-campaigns',
    name: 'HOA Email Campaigns',
    description: 'Email nurture sequences, newsletters, and re-engagement campaigns',
    target_system: 'Email + CRM',
    skills_path: 'hoa-email-campaigns',
    schedules: [
      { cron: '0 9 * * *', description: 'Check for inactive leads and create re-engagement emails (Daily 9am)', tz: 'America/New_York' },
      { cron: '0 10 * * 2', description: 'Generate weekly newsletter from recent posts (Tuesday 10am)', tz: 'America/New_York' }
    ],
    permissions: 'read-write',
    domains: ['gmail.com', 'mailchimp.com'],
  },
];

async function loadSOULDocument(skillsPath) {
  const soulPath = path.join(OPENCLAW_SKILLS_PATH, skillsPath, 'SOUL.md');

  if (fs.existsSync(soulPath)) {
    return fs.readFileSync(soulPath, 'utf8');
  }

  console.warn(`  ⚠️  SOUL.md not found at ${soulPath}, using default`);
  return `# Agent Instructions\n\nYou are a professional marketing automation agent. Follow best practices and deliver high-quality results.`;
}

async function loadSkillDocument(skillsPath) {
  const skillPath = path.join(OPENCLAW_SKILLS_PATH, skillsPath, 'SKILL.md');

  if (fs.existsSync(skillPath)) {
    return fs.readFileSync(skillPath, 'utf8');
  }

  return null;
}

async function importAgent(agentDef) {
  console.log(`\n📦 Importing: ${agentDef.name}`);
  console.log(`   OpenClaw ID: ${agentDef.id}`);

  // Check if already exists
  const existing = get('SELECT id FROM agents WHERE name = ?', [agentDef.name]);

  if (existing) {
    console.log(`   ✅ Already exists in database (ID: ${existing.id})`);
    console.log(`   🔄 Updating configuration...`);

    // Load SOUL and SKILL
    const soulDocument = await loadSOULDocument(agentDef.skills_path);
    const skillDocument = await loadSkillDocument(agentDef.skills_path);

    // Update existing agent
    const config = {
      openclaw_id: agentDef.id,
      workspace: `${OPENCLAW_WORKSPACES}/${agentDef.id}`,
      model: 'claude-sonnet-4-5',
      task: {
        schedule: {
          enabled: true,
          schedules: agentDef.schedules,
        },
      },
    };

    run(
      `UPDATE agents SET
        description = ?,
        target_system = ?,
        config = ?,
        domains = ?,
        permissions = ?,
        instructions = ?,
        updated_at = datetime('now')
       WHERE id = ?`,
      [
        agentDef.description,
        agentDef.target_system,
        JSON.stringify(config),
        JSON.stringify(agentDef.domains),
        agentDef.permissions,
        soulDocument,
        existing.id,
      ]
    );

    console.log(`   ✅ Updated successfully`);
    return existing.id;
  } else {
    console.log(`   🆕 Creating new agent...`);

    // Load SOUL and SKILL
    const soulDocument = await loadSOULDocument(agentDef.skills_path);
    const skillDocument = await loadSkillDocument(agentDef.skills_path);

    const agentId = uuidv4();
    const config = {
      openclaw_id: agentDef.id,
      workspace: `${OPENCLAW_WORKSPACES}/${agentDef.id}`,
      model: 'claude-sonnet-4-5',
      task: {
        schedule: {
          enabled: true,
          schedules: agentDef.schedules,
        },
      },
    };

    run(
      `INSERT INTO agents (
        id, name, description, target_system, status, config, domains, permissions, instructions,
        success_rate, total_runs, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [
        agentId,
        agentDef.name,
        agentDef.description,
        agentDef.target_system,
        'idle',
        JSON.stringify(config),
        JSON.stringify(agentDef.domains),
        agentDef.permissions,
        soulDocument,
        0,
        0,
      ]
    );

    console.log(`   ✅ Created with ID: ${agentId}`);
    return agentId;
  }
}

async function displayMarketingTeam() {
  console.log('\n' + '='.repeat(70));
  console.log('🎯 MARKETING TEAM STATUS');
  console.log('='.repeat(70));

  const agents = all(`
    SELECT id, name, description, target_system, status, config
    FROM agents
    WHERE name LIKE 'HOA%'
    ORDER BY name
  `);

  console.log(`\n📊 Total Marketing Agents: ${agents.length}\n`);

  agents.forEach((agent, index) => {
    const config = JSON.parse(agent.config || '{}');
    const schedules = config.task?.schedule?.schedules || [];

    console.log(`${index + 1}. ${agent.name}`);
    console.log(`   Description: ${agent.description}`);
    console.log(`   Target: ${agent.target_system}`);
    console.log(`   Status: ${agent.status}`);
    console.log(`   OpenClaw ID: ${config.openclaw_id || 'N/A'}`);
    console.log(`   Workspace: ${config.workspace || 'N/A'}`);

    if (schedules.length > 0) {
      console.log(`   📅 Schedules:`);
      schedules.forEach(sched => {
        console.log(`      • ${sched.cron} - ${sched.description}`);
      });
    } else {
      console.log(`   ⚠️  No schedules configured`);
    }
    console.log('');
  });
}

async function createOpenClawAgents() {
  console.log('\n' + '='.repeat(70));
  console.log('🔧 OPENCLAW AGENT CREATION');
  console.log('='.repeat(70));
  console.log('\nNext steps to complete in WSL/Linux:');
  console.log('');

  MARKETING_AGENTS.forEach(agent => {
    console.log(`# ${agent.name}`);
    console.log(`npx openclaw agents add ${agent.id} \\`);
    console.log(`  --workspace ${OPENCLAW_WORKSPACES}/${agent.id} \\`);
    console.log(`  --model claude-sonnet-4-5 \\`);
    console.log(`  --non-interactive`);
    console.log('');

    // Copy SOUL.md command
    const soulPath = path.join(OPENCLAW_SKILLS_PATH, agent.skills_path, 'SOUL.md');
    if (fs.existsSync(soulPath)) {
      const windowsPath = soulPath.replace(/\\/g, '/').replace('C:', '/mnt/c');
      console.log(`# Copy SOUL.md`);
      console.log(`cp "${windowsPath}" \\`);
      console.log(`   ${OPENCLAW_WORKSPACES}/${agent.id}/SOUL.md`);
      console.log('');
    }
  });
}

async function createScheduleCommands() {
  console.log('\n' + '='.repeat(70));
  console.log('⏰ SCHEDULE CREATION COMMANDS');
  console.log('='.repeat(70));
  console.log('\nRun these in WSL/Linux to activate schedules:');
  console.log('');

  MARKETING_AGENTS.forEach(agent => {
    console.log(`# ${agent.name}`);
    agent.schedules.forEach(sched => {
      console.log(`npx openclaw cron add \\`);
      console.log(`  --agent ${agent.id} \\`);
      console.log(`  --cron "${sched.cron}" \\`);
      console.log(`  --message "${sched.description}" \\`);
      console.log(`  --tz "${sched.tz || 'America/New_York'}" \\`);
      console.log(`  --json`);
      console.log('');
    });
  });
}

async function main() {
  console.log('');
  console.log('🚀 ACTIVATING HOA MARKETING TEAM');
  console.log('='.repeat(70));
  console.log('');
  console.log('This script will:');
  console.log('  1. Import all 5 marketing agents into database');
  console.log('  2. Load SOUL.md documents from openclaw-skills/');
  console.log('  3. Configure schedules for each agent');
  console.log('  4. Display current status');
  console.log('  5. Generate OpenClaw setup commands');
  console.log('');

  try {
    // Initialize database first
    await initDatabase();
    // Import all agents
    console.log('📥 IMPORTING AGENTS INTO DATABASE');
    console.log('='.repeat(70));

    for (const agentDef of MARKETING_AGENTS) {
      await importAgent(agentDef);
    }

    // Display status
    await displayMarketingTeam();

    // Show OpenClaw commands
    await createOpenClawAgents();
    await createScheduleCommands();

    console.log('\n' + '='.repeat(70));
    console.log('✅ DATABASE IMPORT COMPLETE');
    console.log('='.repeat(70));
    console.log('');
    console.log('Next steps:');
    console.log('  1. Copy the OpenClaw agent creation commands above');
    console.log('  2. Run them in WSL to create agents in OpenClaw');
    console.log('  3. Copy the schedule creation commands');
    console.log('  4. Run them to activate cron schedules');
    console.log('  5. Check status: npx openclaw agents list');
    console.log('  6. Check schedules: npx openclaw cron list');
    console.log('');
    console.log('All agents are now visible in your dashboard at /agents');
    console.log('');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
