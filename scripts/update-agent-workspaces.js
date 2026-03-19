/**
 * One-time script: update the 4 new dc-intel agents to point to their own skill directories.
 */
const path = require('path');
const db = require('../server/db/connection');

const BASE = path.join(__dirname, '..', 'openclaw-skills');

const agents = [
  ['c9c2c209-51e8-47b7-80d4-e111217c128f', 'dc-intel-auto-generate',    'dc_intel_auto_generate'],
  ['229cb775-28fc-4c5d-8291-d09866dfc62f', 'dc-intel-rto-scanner',      'dc_intel_rto_scanner'],
  ['f7ec4cb3-853a-4ed0-8728-a0142fc4e71b', 'dc-intel-planning-scanner', 'dc_intel_planning_scanner'],
  ['c86e74ea-1175-49b9-a574-e02895d71dac', 'dc-intel-distress-scanner', 'dc_intel_distress_scanner'],
];

db.initDatabase().then(async () => {
  for (const [id, name, handler] of agents) {
    const workspace = path.join(BASE, name);
    const cfg = JSON.stringify({ openclaw_id: name, openclaw_workspace: workspace, special_handler: handler });
    await db.run('UPDATE agents SET config=? WHERE id=?', [cfg, id]);
    const row = await db.get('SELECT config FROM agents WHERE id=?', [id]);
    const parsed = JSON.parse(row.config);
    console.log('[OK]', name, '->', parsed.openclaw_workspace);
  }
  console.log('Done.');
  process.exit(0);
}).catch(e => { console.error('ERR:', e.message); process.exit(1); });
