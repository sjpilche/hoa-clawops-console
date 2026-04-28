/**
 * @file seed-inline.js
 * @description Inline agent seeder — runs inside the server process using
 * the already-initialized DB connection. Called from server/index.js on startup
 * when agent count < 50.
 *
 * Does NOT call initDatabase() — assumes DB is already initialized.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

module.exports = async function seedInline() {
  const { get, run: dbRun } = require('../server/db/connection');

  const { AGENT_FLEET } = require('./seed-all-agents');

  const workspaceRoot = path.resolve(__dirname, '..', 'openclaw-skills');
  let created = 0;
  let skipped = 0;

  for (const agent of AGENT_FLEET) {
    const existing = get('SELECT id FROM agents WHERE name = ?', [agent.name]);
    if (existing) { skipped++; continue; }

    const config = {
      openclaw_id: agent.name,
      openclaw_workspace: path.join(workspaceRoot, agent.name),
    };
    if (agent.special_handler) config.special_handler = agent.special_handler;

    const soulPath = path.join(workspaceRoot, agent.name, 'SOUL.md');
    let instructions = '';
    if (fs.existsSync(soulPath)) instructions = fs.readFileSync(soulPath, 'utf-8');

    const id = crypto.createHash('md5').update(agent.name).digest('hex');
    const uuid = `${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20,32)}`;

    dbRun(
      `INSERT OR IGNORE INTO agents (id, name, description, config, instructions, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uuid, agent.name, agent.description, JSON.stringify(config), instructions, 'idle']
    );
    created++;
  }

  console.log(`[AutoSeed] ${created} agents created, ${skipped} already existed`);
};
