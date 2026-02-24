/**
 * @file seed-jake-agents.js
 * @description Register 7 Jake AI CFO Marketing agents + 3 schedules in ClawOps Console
 *
 * Agents:
 *   jake-content-engine     (OpenClaw GPT-4o) — Jake-voice content, ~$0.025/run
 *   jake-outreach-agent     (OpenClaw GPT-4o) — Personalized email drafts, ~$0.025/run
 *   jake-lead-scout         (OpenClaw GPT-4o) — LLM-powered lead research, ~$0.025/run
 *   jake-social-scheduler   (OpenClaw GPT-4o) — Social platform formatting, ~$0.025/run
 *   jake-analytics-monitor  (OpenClaw GPT-4o) — Daily pipeline report, ~$0.025/run
 *   jake-offer-proof-builder(OpenClaw GPT-4o) — Case studies & proof materials, ~$0.025/run
 *   jake-pilot-deliverer    (OpenClaw GPT-4o) — Pilot delivery coordination, ~$0.025/run
 *
 * Schedules:
 *   Lead Scout: Mon 7am — weekly lead discovery
 *   Content Engine: Mon 9am — weekly content batch
 *   Analytics Monitor: Daily 7am — pipeline health report
 *
 * Usage: node scripts/seed-jake-agents.js
 */

'use strict';

const { run, get, initDatabase } = require('../server/db/connection');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function makeUUID(name) {
  const id = crypto.createHash('md5').update(name).digest('hex');
  return `${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20,32)}`;
}

const AGENTS = [
  {
    name: 'jake-content-engine',
    description: 'Jake-voice content — LinkedIn posts, blog articles, emails. Self-evaluation loop for quality. ~$0.025/run.',
    config: {
      openclaw_id: 'jake-content-engine',
      openclaw_workspace: 'openclaw-skills/jake-content-engine',
      cost_per_run: 0.025,
      human_gate: true,
    },
  },
  {
    name: 'jake-outreach-agent',
    description: 'Personalized cold emails to construction SMBs. Human gate before sending. ~$0.025/run.',
    config: {
      openclaw_id: 'jake-outreach-agent',
      openclaw_workspace: 'openclaw-skills/jake-outreach-agent',
      cost_per_run: 0.025,
      human_gate: true,
    },
  },
  {
    name: 'jake-lead-scout',
    description: 'Discovers construction SMB leads nationally via LLM-powered research. Scores and qualifies. ~$0.025/run.',
    config: {
      openclaw_id: 'jake-lead-scout',
      openclaw_workspace: 'openclaw-skills/jake-lead-scout',
      cost_per_run: 0.025,
      human_gate: false,
    },
  },
  {
    name: 'jake-social-scheduler',
    description: 'Formats and schedules approved Jake content for LinkedIn, Twitter, Facebook, Instagram. ~$0.025/run.',
    config: {
      openclaw_id: 'jake-social-scheduler',
      openclaw_workspace: 'openclaw-skills/jake-social-scheduler',
      cost_per_run: 0.025,
      human_gate: true,
    },
  },
  {
    name: 'jake-analytics-monitor',
    description: 'Daily pipeline health report — leads, outreach, content performance, conversions. ~$0.025/run.',
    config: {
      openclaw_id: 'jake-analytics-monitor',
      openclaw_workspace: 'openclaw-skills/jake-analytics-monitor',
      cost_per_run: 0.025,
      human_gate: false,
    },
  },
  {
    name: 'jake-offer-proof-builder',
    description: 'Builds case studies, demo scripts, ROI calculators, and proof-of-value materials. ~$0.025/run.',
    config: {
      openclaw_id: 'jake-offer-proof-builder',
      openclaw_workspace: 'openclaw-skills/jake-offer-proof-builder',
      cost_per_run: 0.025,
      human_gate: true,
    },
  },
  {
    name: 'jake-pilot-deliverer',
    description: 'Coordinates pilot delivery — kickoff emails, data checklists, insight reports, case study drafts. ~$0.025/run.',
    config: {
      openclaw_id: 'jake-pilot-deliverer',
      openclaw_workspace: 'openclaw-skills/jake-pilot-deliverer',
      cost_per_run: 0.025,
      human_gate: true,
    },
  },
];

const SCHEDULES = [
  {
    name: 'Jake Lead Scout (Weekly)',
    agent_name: 'jake-lead-scout',
    cron_expression: '0 7 * * 1',  // Monday at 7am
    message: JSON.stringify({ region: 'Florida', trade: 'general_contractor', limit: 20 }),
    enabled: 1,
  },
  {
    name: 'Jake Content Engine (Weekly)',
    agent_name: 'jake-content-engine',
    cron_expression: '0 9 * * 1',  // Monday at 9am
    message: JSON.stringify({ pillar: 'cash_flow', channel: 'linkedin' }),
    enabled: 1,
  },
  {
    name: 'Jake Analytics Monitor (Daily)',
    agent_name: 'jake-analytics-monitor',
    cron_expression: '0 7 * * *',  // Daily at 7am
    message: JSON.stringify({ report_type: 'daily' }),
    enabled: 1,
  },
];

async function seed() {
  console.log('\n=== SEED: Jake AI CFO Marketing Agents ===\n');
  console.log('='.repeat(60));

  try {
    await initDatabase();
    console.log('Database initialized\n');

    // ── Seed Agents ────────────────────────────────────────────────────────
    let created = 0;
    let skipped = 0;

    const workspaceRoot = path.resolve(__dirname, '..', 'openclaw-skills');

    for (const agent of AGENTS) {
      const existing = get('SELECT id FROM agents WHERE name = ?', [agent.name]);
      if (existing) {
        console.log(`  SKIP  ${agent.name} (already exists)`);
        skipped++;
        continue;
      }

      // Read SOUL.md
      let instructions = '';
      const soulPath = path.join(workspaceRoot, agent.name, 'SOUL.md');
      if (fs.existsSync(soulPath)) {
        instructions = fs.readFileSync(soulPath, 'utf-8');
      }

      const uuid = makeUUID(agent.name);

      run(
        `INSERT OR IGNORE INTO agents (id, name, description, status, config, instructions, last_run_at, created_at)
         VALUES (?, ?, ?, 'idle', ?, ?, NULL, CURRENT_TIMESTAMP)`,
        [uuid, agent.name, agent.description, JSON.stringify(agent.config), instructions]
      );

      console.log(`  CREATE  ${agent.name} (${uuid})`);
      created++;
    }

    console.log(`\nAgents: ${created} created, ${skipped} skipped\n`);

    // ── Seed Schedules ─────────────────────────────────────────────────────
    let schedCreated = 0;
    let schedSkipped = 0;

    for (const sched of SCHEDULES) {
      // Look up agent ID by name
      const agent = get('SELECT id FROM agents WHERE name = ?', [sched.agent_name]);
      if (!agent) {
        console.log(`  WARN  Schedule "${sched.name}" — agent "${sched.agent_name}" not found, skipping`);
        continue;
      }

      const existing = get(
        'SELECT id FROM schedules WHERE agent_id = ? AND name = ?',
        [agent.id, sched.name]
      );
      if (existing) {
        console.log(`  SKIP  Schedule: ${sched.name}`);
        schedSkipped++;
        continue;
      }

      const schedId = makeUUID(sched.name + '-schedule');

      run(
        `INSERT INTO schedules (id, name, agent_id, agent_name, cron_expression, message, enabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [schedId, sched.name, agent.id, sched.agent_name, sched.cron_expression, sched.message, sched.enabled]
      );

      console.log(`  CREATE  Schedule: ${sched.name} (${sched.cron_expression})`);
      schedCreated++;
    }

    console.log(`\nSchedules: ${schedCreated} created, ${schedSkipped} skipped\n`);

    // ── Summary ────────────────────────────────────────────────────────────
    console.log('='.repeat(60));
    console.log('\nJake Marketing agents seeded successfully!\n');
    console.log('All 7 agents ready:');
    console.log('  jake-content-engine      — Jake-voice LinkedIn/blog/email content');
    console.log('  jake-outreach-agent      — Personalized cold emails to construction SMBs');
    console.log('  jake-lead-scout          — LLM-powered lead discovery & qualification');
    console.log('  jake-social-scheduler    — Social platform formatting & scheduling');
    console.log('  jake-analytics-monitor   — Daily pipeline health reports');
    console.log('  jake-offer-proof-builder — Case studies & proof materials');
    console.log('  jake-pilot-deliverer     — Pilot delivery coordination\n');
    console.log('Schedules:');
    console.log('  Mon 7 AM  — Jake Lead Scout (weekly lead discovery)');
    console.log('  Mon 9 AM  — Jake Content Engine (weekly content batch)');
    console.log('  Daily 7 AM — Jake Analytics Monitor (pipeline health)\n');
    console.log('Next steps:');
    console.log('  1. Restart server: npm run dev');
    console.log('  2. Open Console: http://localhost:5174');
    console.log('  3. Navigate to Agents page — "Jake Marketing" group should appear');
    console.log('  4. Test: run jake-content-engine with {"pillar":"cash_flow","channel":"linkedin"}');

  } catch (err) {
    console.error('\nSeed failed:', err.message);
    process.exit(1);
  }

  process.exit(0);
}

seed();
