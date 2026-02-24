/**
 * @file seed-cfo-marketing-agents.js
 * @description Register 7 CFO AI Suite Marketing agents + 3 schedules in ClawOps Console
 *
 * Agents:
 *   cfo-lead-scout       (special_handler: cfo_lead_scout) — Playwright, $0
 *   cfo-content-engine   (OpenAI GPT-4o) — Steve-voice content, ~$0.025/run
 *   cfo-outreach-agent   (OpenAI GPT-4o) — Personalized email drafts, ~$0.025/run
 *   cfo-social-scheduler (OpenAI GPT-4o) — LinkedIn/X formatting, ~$0.025/run
 *   cfo-analytics-monitor (OpenAI GPT-4o) — Daily pipeline report, ~$0.025/run
 *   cfo-offer-proof-builder (OpenAI GPT-4o) — Landing pages + one-pagers, ~$0.025/run
 *   cfo-pilot-deliverer  (OpenAI GPT-4o) — Pilot execution + case studies, ~$0.025/run
 *
 * Schedules:
 *   Lead Scout: Mon 7am — weekly ICP list refresh
 *   Content Engine: Mon 8am — weekly content batch
 *   Analytics Monitor: Daily 6am — pipeline health report
 *
 * Usage: node scripts/seed-cfo-marketing-agents.js
 */

'use strict';

const { run, get, initDatabase } = require('../server/db/connection');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const AGENTS = [
  // Phase 0 — Launch NOW
  {
    id: 'cfo-lead-scout',
    name: 'CFO Lead Scout',
    description: 'Phase 0: Finds $10M-$75M construction companies using Vista/Sage300/QBE via Google scraping. Scores each lead for pilot readiness (0-100). $0 cost.',
    config: {
      special_handler: 'cfo_lead_scout',
      soul_path: 'openclaw-skills/cfo-lead-scout/SOUL.md',
      cost_per_run: 0,
      phase: 0,
      default_params: {
        erp_type: 'all',
        limit: 30,
      },
    },
    soulDir: 'cfo-lead-scout',
  },
  {
    id: 'cfo-content-engine',
    name: 'CFO Content Engine',
    description: 'Phase 0: Generates Steve Pilcher-voice LinkedIn posts, blog articles, and proof artifacts. Outputs draft for human approval. ~$0.025/run.',
    config: {
      openclaw_id: 'cfo-content-engine',
      soul_path: 'openclaw-skills/cfo-content-engine/SOUL.md',
      cost_per_run: 0.025,
      human_gate: true,
      phase: 0,
      default_params: {
        pillar: 'cash_flow',
        channel: 'linkedin',
      },
    },
    soulDir: 'cfo-content-engine',
  },
  {
    id: 'cfo-outreach-agent',
    name: 'CFO Outreach Agent',
    description: 'Phase 0: Writes personalized cold emails for CFOs/Controllers referencing their ERP and specific pain. Human gate before sending. ~$0.025/run.',
    config: {
      openclaw_id: 'cfo-outreach-agent',
      soul_path: 'openclaw-skills/cfo-outreach-agent/SOUL.md',
      cost_per_run: 0.025,
      human_gate: true,
      phase: 0,
    },
    soulDir: 'cfo-outreach-agent',
  },
  // Phase 1 — After first pilot
  {
    id: 'cfo-social-scheduler',
    name: 'CFO Social Scheduler',
    description: 'Phase 1: Formats and schedules approved content for LinkedIn and X (Twitter). Handles threading and hashtag strategy. ~$0.025/run.',
    config: {
      openclaw_id: 'cfo-social-scheduler',
      soul_path: 'openclaw-skills/cfo-social-scheduler/SOUL.md',
      cost_per_run: 0.025,
      human_gate: true,
      phase: 1,
    },
    soulDir: 'cfo-social-scheduler',
  },
  {
    id: 'cfo-analytics-monitor',
    name: 'CFO Analytics Monitor',
    description: 'Phase 1: Daily pipeline health report — leads, replies, pilots, pipeline value. Surfaces what needs Steve\'s attention today. ~$0.025/run.',
    config: {
      openclaw_id: 'cfo-analytics-monitor',
      soul_path: 'openclaw-skills/cfo-analytics-monitor/SOUL.md',
      cost_per_run: 0.025,
      human_gate: false,
      phase: 1,
    },
    soulDir: 'cfo-analytics-monitor',
  },
  {
    id: 'cfo-offer-proof-builder',
    name: 'CFO Offer & Proof Builder',
    description: 'Phase 1: Creates landing pages, one-pagers, and pricing materials for the 3 Phase 0 pilot offers. Real numbers, guarantees, Trust Envelope™. ~$0.025/run.',
    config: {
      openclaw_id: 'cfo-offer-proof-builder',
      soul_path: 'openclaw-skills/cfo-offer-proof-builder/SOUL.md',
      cost_per_run: 0.025,
      human_gate: true,
      phase: 1,
    },
    soulDir: 'cfo-offer-proof-builder',
  },
  {
    id: 'cfo-pilot-deliverer',
    name: 'CFO Pilot Deliverer',
    description: 'Phase 1: Runs paid pilots — kickoff emails, data checklists, Loom scripts, results summaries, and case study drafts. ~$0.025/run.',
    config: {
      openclaw_id: 'cfo-pilot-deliverer',
      soul_path: 'openclaw-skills/cfo-pilot-deliverer/SOUL.md',
      cost_per_run: 0.025,
      human_gate: true,
      phase: 1,
    },
    soulDir: 'cfo-pilot-deliverer',
  },
];

const SCHEDULES = [
  {
    id: uuidv4(),
    name: 'CFO Lead Scout (Weekly)',
    agent_id: 'cfo-lead-scout',
    cron_expression: '0 7 * * 1',  // Monday at 7am
    message: JSON.stringify({ erp_type: 'all', limit: 30 }),
    enabled: 1,
  },
  {
    id: uuidv4(),
    name: 'CFO Content Engine (Weekly)',
    agent_id: 'cfo-content-engine',
    cron_expression: '0 8 * * 1',  // Monday at 8am
    message: JSON.stringify({ pillar: 'cash_flow', channel: 'linkedin' }),
    enabled: 1,
  },
  {
    id: uuidv4(),
    name: 'CFO Analytics Monitor (Daily)',
    agent_id: 'cfo-analytics-monitor',
    cron_expression: '0 6 * * *',  // Daily at 6am
    message: JSON.stringify({ report_type: 'daily' }),
    enabled: 1,
  },
];

async function seed() {
  console.log('\n=== SEED: CFO AI Suite Marketing Agents ===\n');
  console.log('='.repeat(60));

  try {
    await initDatabase();
    console.log('Database initialized\n');

    // ── Seed Agents ────────────────────────────────────────────────────────
    let created = 0;
    let skipped = 0;

    for (const agent of AGENTS) {
      const existing = get('SELECT id FROM agents WHERE id = ?', [agent.id]);
      if (existing) {
        console.log(`  SKIP  ${agent.id} (already exists)`);
        skipped++;
        continue;
      }

      // Read SOUL.md
      let instructions = '';
      const soulPath = path.join(__dirname, '..', 'openclaw-skills', agent.soulDir, 'SOUL.md');
      if (fs.existsSync(soulPath)) {
        instructions = fs.readFileSync(soulPath, 'utf-8');
      }

      run(
        `INSERT INTO agents (id, name, description, status, config, instructions, last_run_at, created_at)
         VALUES (?, ?, ?, 'idle', ?, ?, NULL, CURRENT_TIMESTAMP)`,
        [agent.id, agent.name, agent.description, JSON.stringify(agent.config), instructions]
      );

      console.log(`  CREATE  ${agent.id} — ${agent.name}`);
      created++;
    }

    console.log(`\nAgents: ${created} created, ${skipped} skipped\n`);

    // ── Seed Schedules ─────────────────────────────────────────────────────
    let schedCreated = 0;
    let schedSkipped = 0;

    for (const sched of SCHEDULES) {
      const existing = get(
        'SELECT id FROM schedules WHERE agent_id = ? AND name = ?',
        [sched.agent_id, sched.name]
      );
      if (existing) {
        console.log(`  SKIP  Schedule: ${sched.name}`);
        schedSkipped++;
        continue;
      }

      run(
        `INSERT INTO schedules (id, name, agent_id, cron_expression, message, enabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [sched.id, sched.name, sched.agent_id, sched.cron_expression, sched.message, sched.enabled]
      );

      console.log(`  CREATE  Schedule: ${sched.name} (${sched.cron_expression})`);
      schedCreated++;
    }

    console.log(`\nSchedules: ${schedCreated} created, ${schedSkipped} skipped\n`);

    // ── Summary ────────────────────────────────────────────────────────────
    console.log('='.repeat(60));
    console.log('\n✅ CFO Marketing agents seeded successfully!\n');
    console.log('Phase 0 agents ready to run:');
    console.log('  • cfo-lead-scout      — Find construction companies (run first)');
    console.log('  • cfo-content-engine  — Generate Steve-voice LinkedIn posts');
    console.log('  • cfo-outreach-agent  — Draft personalized pilot outreach emails\n');
    console.log('Next steps:');
    console.log('  1. Restart server (migration 020 will apply on startup)');
    console.log('  2. Navigate to /cfo-marketing in the Console');
    console.log('  3. Run Lead Scout with: {"erp_type":"Vista","state":"FL","limit":20}');
    console.log('  4. Leads appear in table with pilot fit scores');
    console.log('  5. Run Content Engine to generate first LinkedIn post draft\n');

  } catch (err) {
    console.error('\n❌ Seed failed:', err.message);
    process.exit(1);
  }

  process.exit(0);
}

seed();
