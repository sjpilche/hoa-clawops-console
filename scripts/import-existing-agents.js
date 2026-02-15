#!/usr/bin/env node
/**
 * Import EXISTING OpenClaw workspace agents directly to database
 * (bypasses OpenClaw registration since workspaces already exist)
 */

const { initDatabase, run, get } = require('../server/db/connection');
const { v4: uuidv4 } = require('uuid');
const { execSync } = require('child_process');

// Initialize database
initDatabase();

const OPENCLAW_WORKSPACES = '/home/sjpilche/projects/openclaw-v1/workspaces';

// Agents to import (they already exist in OpenClaw)
const agents = [
  {
    name: 'HOA Content Writer',
    openclaw_id: 'hoa-content-writer',
    description: 'Creates outreach emails and trigger-specific explainers for HOA leads',
    target_system: 'Web Browser + Email',
    permissions: 'read-write',
    domains: ['hoafinancial.com', 'gmail.com'],
    config: {
      soul_enabled: true,
      openclaw_id: 'hoa-content-writer',
      openclaw_workspace: `${OPENCLAW_WORKSPACES}/hoa-content-writer`,
      task: {
        message: 'Create personalized outreach content for hot leads or trigger-specific explainer articles.',
        schedule: { enabled: false },
      },
      advanced: {
        maxDurationSeconds: 300,
        maxCostUSD: 5,
        maxTokens: 100000,
        notifyOnComplete: true,
      },
    },
  },
  {
    name: 'HOA Email Campaigns',
    openclaw_id: 'hoa-email-campaigns',
    description: 'Manages 2-touch follow-up sequences for hot HOA leads',
    target_system: 'Email + CRM',
    permissions: 'read-write',
    domains: ['hoafinancial.com', 'gmail.com'],
    config: {
      soul_enabled: true,
      openclaw_id: 'hoa-email-campaigns',
      openclaw_workspace: `${OPENCLAW_WORKSPACES}/hoa-email-campaigns`,
      task: {
        message: 'Create and send 2-touch email sequences for hot leads.',
        schedule: { enabled: false },
      },
      advanced: {
        maxDurationSeconds: 180,
        maxCostUSD: 3,
        maxTokens: 50000,
        notifyOnComplete: true,
      },
    },
  },
  {
    name: 'HOA Event Hunter',
    openclaw_id: 'hoa-event-hunter',
    description: 'Detects HOAs with upcoming or active capital projects by monitoring permits, news, social media, and FEMA disasters',
    target_system: 'Web Browser + APIs',
    permissions: 'read-only',
    domains: ['permits.hillsboroughcounty.org', 'fema.gov', 'news.google.com', 'facebook.com'],
    config: {
      soul_enabled: true,
      openclaw_id: 'hoa-event-hunter',
      openclaw_workspace: `${OPENCLAW_WORKSPACES}/hoa-event-hunter`,
      task: {
        message: 'Monitor multiple signal sources to detect HOAs with capital projects, score by intent level, and output qualified prospects.',
        schedule: { enabled: false },
      },
      advanced: {
        maxDurationSeconds: 600,
        maxCostUSD: 10,
        maxTokens: 200000,
        notifyOnComplete: true,
      },
    },
  },
  {
    name: 'Sports Clash Guide',
    openclaw_id: 'sports-clash-guide',
    description: 'Daily Chicago vs Denver sports rivalry newsletter with high-energy coverage of Bears, Broncos, Bulls, Nuggets, Cubs, Rockies, Blackhawks, and Avalanche',
    target_system: 'Web Browser',
    permissions: 'read-only',
    domains: ['espn.com', 'bleacherreport.com', 'twitter.com', 'chicagotribune.com', 'denverpost.com'],
    config: {
      soul_enabled: true,
      openclaw_id: 'sports-clash-guide',
      openclaw_workspace: `${OPENCLAW_WORKSPACES}/sports-clash-guide`,
      task: {
        message: 'Generate daily sports rivalry newsletter covering Chicago and Denver teams with high-energy analysis, stats, and trash-talk.',
        schedule: { enabled: false },
      },
      advanced: {
        maxDurationSeconds: 300,
        maxCostUSD: 5,
        maxTokens: 100000,
        notifyOnComplete: true,
      },
    },
  },
];

function readSoulMd(workspaceName) {
  try {
    const soulPath = `${OPENCLAW_WORKSPACES}/${workspaceName}/SOUL.md`;
    const command = `wsl bash -c "cat '${soulPath}' 2>/dev/null || echo ''"`;
    const content = execSync(command, { encoding: 'utf-8', timeout: 5000 });
    return content.trim().substring(0, 4999); // Truncate to schema limit
  } catch (error) {
    console.error(`⚠️  Could not read SOUL.md for ${workspaceName}`);
    return '';
  }
}

function importAgent(agent) {
  console.log(`\n📦 Importing ${agent.name}...`);
  console.log(`   OpenClaw ID: ${agent.openclaw_id}`);
  console.log(`   Workspace: ${agent.config.openclaw_workspace}`);

  // Check if already exists
  const existing = get('SELECT id, name FROM agents WHERE name = ?', [agent.name]);
  if (existing) {
    console.log(`   ⚠️  Agent already exists (ID: ${existing.id}), skipping...`);
    return false;
  }

  // Read SOUL.md
  const instructions = readSoulMd(agent.openclaw_id);
  if (!instructions) {
    console.log(`   ⚠️  No SOUL.md found, using empty instructions`);
  }

  // Insert into database
  const agentId = uuidv4();
  run(
    `INSERT INTO agents (id, name, description, target_system, config, domains, permissions, instructions)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      agentId,
      agent.name,
      agent.description || '',
      agent.target_system || '',
      JSON.stringify(agent.config),
      JSON.stringify(agent.domains || []),
      agent.permissions || 'read-only',
      instructions || '',
    ]
  );

  console.log(`   ✅ Successfully imported (ID: ${agentId})`);
  return true;
}

async function main() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║  Import Existing OpenClaw Agents (DB)     ║');
  console.log('╚════════════════════════════════════════════╝\n');

  // Wait for database to initialize
  await new Promise(resolve => setTimeout(resolve, 100));

  let successCount = 0;
  let skipCount = 0;

  for (const agent of agents) {
    const imported = importAgent(agent);
    if (imported) {
      successCount++;
    } else {
      skipCount++;
    }
  }

  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║  Import Complete                           ║');
  console.log('╚════════════════════════════════════════════╝');
  console.log(`✅ Successfully imported: ${successCount}`);
  console.log(`⏭️  Skipped (already exist): ${skipCount}`);
  console.log(`📊 Total: ${agents.length}`);
  console.log('\n🌐 View agents at: http://localhost:5180\n');
}

main().catch(console.error);
