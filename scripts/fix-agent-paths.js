/**
 * One-time fix: Update all agent workspace paths from old SPilcher machine to current.
 * Run with server STOPPED: node scripts/fix-agent-paths.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env.local') });

const path = require('path');
const { initDatabase, all, run, saveDatabase } = require('../server/db/connection');

const OLD_PREFIX = 'C:\\Users\\SPilcher\\OpenClaw2.0 for linux - Copy';
const NEW_PREFIX = path.resolve(__dirname, '..');

async function main() {
  await initDatabase();

  const agents = all("SELECT id, name, config FROM agents");
  console.log('Total agents:', agents.length);

  let fixed = 0;
  for (const agent of agents) {
    if (!agent.config) continue;
    try {
      const cfg = JSON.parse(agent.config);
      let changed = false;

      for (const key of Object.keys(cfg)) {
        if (typeof cfg[key] === 'string' && cfg[key].includes(OLD_PREFIX)) {
          cfg[key] = cfg[key].replace(OLD_PREFIX, NEW_PREFIX);
          changed = true;
        }
      }

      if (changed) {
        run("UPDATE agents SET config = ? WHERE id = ?", [JSON.stringify(cfg), agent.id]);
        fixed++;
      }
    } catch (e) {
      console.log('  ERR:', agent.name, e.message);
    }
  }

  console.log('Fixed:', fixed, 'agents');

  // Verify
  const remaining = all("SELECT count(*) as n FROM agents WHERE config LIKE '%SPilcher%'");
  console.log('Remaining stale:', remaining[0].n);

  if (remaining[0].n === 0) {
    const sample = all("SELECT name, config FROM agents LIMIT 3");
    for (const s of sample) {
      const cfg = JSON.parse(s.config);
      console.log('  OK:', s.name, '->', cfg.openclaw_workspace || 'n/a');
    }
  }

  // Force final save
  saveDatabase();
  console.log('Done. Database saved to disk.');
}

main().catch(console.error);
