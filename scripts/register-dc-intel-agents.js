/**
 * Register DC Intel agents directly in the SQLite database.
 *
 * Run: node scripts/register-dc-intel-agents.js
 *
 * This bypasses the API (which requires openclawBridge.createAgent, not yet implemented)
 * and inserts agents + schedule directly into the database.
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.resolve(__dirname, '..', 'data', 'clawops.db');

async function main() {
  const SQL = await initSqlJs();

  if (!fs.existsSync(DB_PATH)) {
    console.error(`Database not found at ${DB_PATH}`);
    process.exit(1);
  }

  const fileBuffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(fileBuffer);

  const now = new Date().toISOString();

  // ── Check if agents already exist ──────────────────────────────────────────
  const existing = db.exec("SELECT name FROM agents WHERE name IN ('dc-intel-owner-research', 'dc-intel-research-queue')");
  if (existing.length > 0 && existing[0].values.length > 0) {
    const names = existing[0].values.map(r => r[0]);
    console.log(`Agents already registered: ${names.join(', ')}`);
    console.log('To re-register, delete them first.');
    db.close();
    return;
  }

  // ── Agent 1: dc-intel-owner-research ───────────────────────────────────────
  const ownerResearchId = uuidv4();
  const ownerResearchConfig = JSON.stringify({
    openclaw_id: 'dc-intel-owner-research',
    openclaw_workspace: 'openclaw-skills/dc-intel-owner-research',
    task: {
      message: 'Research the owner provided in the message. Use web search to find corporate filings, litigation, and distress signals. POST results to DC Site Intel.'
    }
  });

  db.run(
    `INSERT INTO agents (id, name, description, status, config, permissions, instructions, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ownerResearchId,
      'dc-intel-owner-research',
      'Research a land owner for DC site intel — corporate background, related entities, distress signals. Posts findings to DC Site Intel API.',
      'idle',
      ownerResearchConfig,
      'read-write',
      '', // Instructions loaded from SOUL.md by OpenClaw CLI
      now,
      now,
    ]
  );
  console.log(`✓ Registered agent: dc-intel-owner-research (${ownerResearchId})`);

  // ── Agent 2: dc-intel-research-queue ───────────────────────────────────────
  const researchQueueId = uuidv4();
  const researchQueueConfig = JSON.stringify({
    openclaw_id: 'dc-intel-research-queue',
    openclaw_workspace: 'openclaw-skills/dc-intel-research-queue',
    task: {
      schedule: {
        enabled: true,
        cron: '0 6 * * 1',
        timezone: 'America/Chicago',
      },
      message: 'Run the weekly owner research queue. Fetch candidates from DC Site Intel, research each owner, and POST findings back.'
    }
  });

  db.run(
    `INSERT INTO agents (id, name, description, status, config, permissions, instructions, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      researchQueueId,
      'dc-intel-research-queue',
      'Weekly batch research — automatically researches all owners not yet enriched by OpenClaw. Runs Monday 6 AM.',
      'idle',
      researchQueueConfig,
      'read-write',
      '', // Instructions loaded from SOUL.md by OpenClaw CLI
      now,
      now,
    ]
  );
  console.log(`✓ Registered agent: dc-intel-research-queue (${researchQueueId})`);

  // ── Schedule for research queue ────────────────────────────────────────────
  const scheduleId = uuidv4();
  db.run(
    `INSERT INTO schedules (id, name, description, agent_id, agent_name, cron_expression, message, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      scheduleId,
      'DC Intel Weekly Owner Research',
      'Every Monday at 6 AM — fetch unresearched owners from DC Site Intel and run background research on each.',
      researchQueueId,
      'dc-intel-research-queue',
      '0 6 * * 1',
      'Run the weekly owner research queue. Fetch candidates from DC Site Intel, research each owner, and POST findings back.',
      1, // enabled
      now,
      now,
    ]
  );
  console.log(`✓ Created schedule: "DC Intel Weekly Owner Research" — Monday 6 AM (${scheduleId})`);

  // ── Save to disk ───────────────────────────────────────────────────────────
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
  console.log(`\n✓ Database saved to ${DB_PATH}`);

  db.close();

  console.log('\n── Summary ──────────────────────────────────────────');
  console.log(`Agent: dc-intel-owner-research  → ${ownerResearchId}`);
  console.log(`Agent: dc-intel-research-queue  → ${researchQueueId}`);
  console.log(`Schedule: Monday 6 AM CT        → ${scheduleId}`);
  console.log('────────────────────────────────────────────────────');
  console.log('\nNext steps:');
  console.log('1. Add DC_SITE_INTEL_URL and DC_SITE_INTEL_SECRET to .env.local');
  console.log('2. Set OPENCLAW_WEBHOOK_SECRET in DC Site Intel .env');
  console.log('3. Restart OpenClaw server to pick up changes');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
