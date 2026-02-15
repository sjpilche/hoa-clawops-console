#!/usr/bin/env node
/**
 * Import OpenClaw Workspace Agents into ClawOps Console
 *
 * Scans OpenClaw workspaces and imports them as agents in ClawOps Console.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const CLAWOPS_API = process.env.CLAWOPS_API || 'http://localhost:3001/api';
const OPENCLAW_WORKSPACES = process.env.OPENCLAW_PATH || '/home/sjpilche/projects/openclaw-v1/workspaces';

// HOA agents to import
const HOA_AGENTS = [
  'hoa-content-writer',
  'hoa-email-campaigns',
];

/**
 * Login to ClawOps and get JWT token
 */
async function login() {
  console.log('🔐 Logging in to ClawOps...');

  const response = await fetch(`${CLAWOPS_API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@clawops.local',
      password: 'changeme123',
    }),
  });

  if (!response.ok) {
    throw new Error(`Login failed: ${response.statusText}`);
  }

  const data = await response.json();
  console.log('✅ Logged in successfully\n');
  return data.token.token;
}

/**
 * Read SOUL.md from OpenClaw workspace
 */
function readSoulMd(workspaceName) {
  try {
    const soulPath = `${OPENCLAW_WORKSPACES}/${workspaceName}/SOUL.md`;
    const command = `wsl bash -c "cat '${soulPath}' 2>/dev/null || echo 'NOT_FOUND'"`;
    const content = execSync(command, { encoding: 'utf-8' });

    if (content.trim() === 'NOT_FOUND' || content.trim() === '') {
      return null;
    }

    return content;
  } catch (error) {
    console.error(`⚠️  Could not read SOUL.md for ${workspaceName}:`, error.message);
    return null;
  }
}

/**
 * Create agent configuration from workspace
 */
function createAgentConfig(workspaceName, soulContent) {
  const configs = {
    'hoa-content-writer': {
      name: 'HOA Content Writer',
      description: 'Creates outreach emails and trigger-specific explainers for HOA leads',
      target_system: 'Web Browser + Email',
      permissions: 'read-write',
      domains: ['hoafinancial.com', 'gmail.com'],
      config: {
        soul_enabled: true,
        openclaw_id: workspaceName,
        openclaw_workspace: `${OPENCLAW_WORKSPACES}/${workspaceName}`,
        task: {
          message: 'Create personalized outreach content for hot leads or trigger-specific explainer articles based on current events and lead activity.',
          schedule: {
            enabled: false,
          },
        },
        advanced: {
          maxDurationSeconds: 300,
          maxCostUSD: 5,
          maxTokens: 100000,
          notifyOnComplete: true,
        },
      },
    },
    'hoa-email-campaigns': {
      name: 'HOA Email Campaigns',
      description: 'Manages 2-touch follow-up sequences for hot HOA leads',
      target_system: 'Email + CRM',
      permissions: 'read-write',
      domains: ['hoafinancial.com', 'gmail.com'],
      config: {
        soul_enabled: true,
        openclaw_id: workspaceName,
        openclaw_workspace: `${OPENCLAW_WORKSPACES}/${workspaceName}`,
        task: {
          message: 'Create and send 2-touch email sequences for hot leads. Touch 1 (immediate), Touch 2 (3-5 days later).',
          schedule: {
            enabled: false,
          },
        },
        advanced: {
          maxDurationSeconds: 180,
          maxCostUSD: 3,
          maxTokens: 50000,
          notifyOnComplete: true,
        },
      },
    },
  };

  return configs[workspaceName] || null;
}

/**
 * Import agent into ClawOps
 */
async function importAgent(token, workspaceName) {
  console.log(`\n📦 Importing ${workspaceName}...`);

  // Read SOUL.md
  const soulContent = readSoulMd(workspaceName);
  if (!soulContent) {
    console.log(`⚠️  No SOUL.md found for ${workspaceName}, skipping...`);
    return false;
  }

  // Create agent config
  const agentConfig = createAgentConfig(workspaceName, soulContent);
  if (!agentConfig) {
    console.log(`⚠️  No configuration defined for ${workspaceName}, skipping...`);
    return false;
  }

  const agentData = {
    name: agentConfig.name,
    description: agentConfig.description,
    target_system: agentConfig.target_system,
    permissions: agentConfig.permissions,
    domains: agentConfig.domains,
    config: agentConfig.config, // Send as object, not string
    instructions: soulContent.substring(0, 4999), // Truncate to fit schema limit
  };

  console.log(`   Name: ${agentData.name}`);
  console.log(`   Description: ${agentData.description}`);
  console.log(`   Workspace: ${agentConfig.config.openclaw_workspace}`);

  // Create agent via API
  try {
    const response = await fetch(`${CLAWOPS_API}/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(agentData),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error: ${response.status} - ${error}`);
    }

    const result = await response.json();
    console.log(`✅ Successfully imported ${agentConfig.name} (ID: ${result.agent.id})`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to import ${workspaceName}:`, error.message);
    return false;
  }
}

/**
 * Main import process
 */
async function main() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║  OpenClaw → ClawOps Agent Import Tool     ║');
  console.log('╚════════════════════════════════════════════╝\n');

  try {
    // Login
    const token = await login();

    // Import each HOA agent
    let successCount = 0;
    let failCount = 0;

    for (const workspaceName of HOA_AGENTS) {
      const success = await importAgent(token, workspaceName);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
    }

    // Summary
    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║  Import Complete                           ║');
    console.log('╚════════════════════════════════════════════╝');
    console.log(`✅ Successfully imported: ${successCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log(`📊 Total: ${HOA_AGENTS.length}`);
    console.log('\n🌐 View agents at: http://localhost:5177\n');

  } catch (error) {
    console.error('\n❌ Import failed:', error.message);
    process.exit(1);
  }
}

// Run
main();
