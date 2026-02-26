/**
 * One-time fix: add special_handler to jake-lead-scout agent config.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
const { get, run, initDatabase } = require('../server/db/connection');

async function main() {
  await initDatabase();

  const agent = get("SELECT id, config FROM agents WHERE name = 'jake-lead-scout'");
  if (!agent) { console.log('Agent not found'); return; }

  const config = JSON.parse(agent.config || '{}');
  config.special_handler = 'jake_lead_scout';
  run('UPDATE agents SET config = ?, updated_at = datetime(\'now\') WHERE id = ?', [JSON.stringify(config), agent.id]);
  console.log('Updated jake-lead-scout config:', JSON.stringify(config));

  const updated = get("SELECT name, config FROM agents WHERE name = 'jake-lead-scout'");
  console.log('Verified:', updated.name, '->', JSON.parse(updated.config).special_handler);
}
main().catch(console.error);
