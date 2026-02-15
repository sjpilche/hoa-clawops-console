/**
 * List all agents in the database
 */
const db = require('../server/db/connection');

(async () => {
  await db.initDatabase();
  const agents = db.all('SELECT id, name, target_system, status, config FROM agents');

  console.log('='.repeat(60));
  console.log('AGENTS IN DATABASE');
  console.log('='.repeat(60));
  console.log(`Total Agents: ${agents.length}\n`);

  if (agents.length === 0) {
    console.log('No agents found. Create agents via the dashboard or API.\n');
    return;
  }

  agents.forEach((agent, idx) => {
    console.log(`${idx + 1}. ${agent.name}`);
    console.log(`   ID: ${agent.id}`);
    console.log(`   Target: ${agent.target_system}`);
    console.log(`   Status: ${agent.status}`);

    try {
      const config = JSON.parse(agent.config || '{}');
      if (config.task?.schedule?.enabled) {
        console.log(`   Schedule: ${config.task.schedule.cron} (enabled: ${config.task.schedule.enabled})`);
      }
      if (config.openclaw_id) {
        console.log(`   OpenClaw ID: ${config.openclaw_id}`);
      }
      if (config.openclaw_workspace) {
        console.log(`   Workspace: ${config.openclaw_workspace}`);
      }
    } catch (e) {
      console.log(`   Config: (parse error)`);
    }
    console.log('');
  });

  console.log('='.repeat(60));
})();
