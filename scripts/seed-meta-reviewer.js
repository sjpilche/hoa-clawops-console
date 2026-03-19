/**
 * One-time: insert dc-intel-meta-reviewer agent + daily 9am schedule.
 */
const path = require('path');
const crypto = require('crypto');
const db = require('../server/db/connection');

const AGENT_NAME = 'dc-intel-meta-reviewer';
const WORKSPACE  = path.join(__dirname, '..', 'openclaw-skills', AGENT_NAME);

db.initDatabase().then(async () => {
  const existing = await db.get('SELECT id FROM agents WHERE name = ?', [AGENT_NAME]);
  if (existing) {
    console.log('Already exists:', AGENT_NAME, existing.id);
    process.exit(0);
  }

  const agentId = crypto.randomUUID();
  const schedId = crypto.randomUUID();

  const config = JSON.stringify({
    openclaw_id:        AGENT_NAME,
    openclaw_workspace: WORKSPACE,
    special_handler:    'dc_intel_meta_reviewer',
  });

  await db.run(
    "INSERT INTO agents (id, name, status, config, created_at, updated_at) VALUES (?, ?, 'idle', ?, datetime('now'), datetime('now'))",
    [agentId, AGENT_NAME, config]
  );
  console.log('Agent inserted:', AGENT_NAME, agentId);

  await db.run(
    "INSERT INTO schedules (id, name, agent_id, agent_name, cron_expression, message, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '{}', 1, datetime('now'), datetime('now'))",
    [schedId, 'Meta-Reviewer — Daily 9am', agentId, AGENT_NAME, '0 9 * * *']
  );
  console.log('Schedule inserted: 0 9 * * * (daily 9am)');

  const row = await db.get('SELECT config FROM agents WHERE id = ?', [agentId]);
  console.log('Workspace:', JSON.parse(row.config).openclaw_workspace);
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
