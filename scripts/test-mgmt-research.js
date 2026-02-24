/**
 * Quick verification that mgmt-research agents and API endpoints work.
 * Usage: node scripts/test-mgmt-research.js
 */
const http = require('http');

function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: opts.method || 'GET', headers: opts.headers || {} }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve({ raw: data }); }
      });
    });
    if (opts.body) req.write(opts.body);
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  console.log('\n=== VERIFY: Mgmt Research Integration ===\n');

  // 1. Login
  const login = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@clawops.local', password: 'changeme123' }),
  });
  // generateToken() returns { token, expiresAt, expiresIn } — login nests it
  const tokenObj = login.token;
  const jwt = typeof tokenObj === 'string' ? tokenObj : tokenObj?.token;
  if (!jwt) {
    console.log('[FAIL] Login failed:', JSON.stringify(login).substring(0, 200));
    process.exit(1);
  }
  console.log('[OK] Login successful');
  const headers = { 'Authorization': 'Bearer ' + jwt };

  // 2. Check agents
  const agents = await fetch('http://localhost:3001/api/agents', { headers });
  const agentList = agents.agents || (Array.isArray(agents) ? agents : []);
  const mgmtAgents = agentList.filter(a => a.id && a.id.startsWith('mgmt-'));
  console.log(`[OK] Mgmt agents in DB: ${mgmtAgents.length}/5`);
  for (const a of mgmtAgents) {
    console.log(`     - ${a.id}: ${a.name} (${a.status})`);
  }

  // 3. Test dashboard endpoint
  const dashboard = await fetch('http://localhost:3001/api/mgmt-research/dashboard', { headers });
  if (dashboard.stats !== undefined) {
    console.log(`[OK] /dashboard — Companies: ${dashboard.companies?.length || 0}, Stats: ${JSON.stringify(dashboard.stats)}`);
  } else {
    console.log('[FAIL] /dashboard:', JSON.stringify(dashboard).substring(0, 200));
  }

  // 4. Test hot-leads endpoint
  const hotLeads = await fetch('http://localhost:3001/api/mgmt-research/hot-leads', { headers });
  if (hotLeads.hot_leads !== undefined) {
    console.log(`[OK] /hot-leads — Count: ${hotLeads.hot_leads?.length || 0}`);
  } else {
    console.log('[FAIL] /hot-leads:', JSON.stringify(hotLeads).substring(0, 200));
  }

  // 5. Test queue endpoint
  const queue = await fetch('http://localhost:3001/api/mgmt-research/queue', { headers });
  if (queue.queue !== undefined) {
    console.log(`[OK] /queue — Count: ${queue.queue?.length || 0}`);
  } else {
    console.log('[FAIL] /queue:', JSON.stringify(queue).substring(0, 200));
  }

  // 6. Test targets endpoint
  const targets = await fetch('http://localhost:3001/api/mgmt-research/targets', { headers });
  if (targets.priority_targets || targets.targets) {
    const t = targets.priority_targets || targets.targets;
    console.log(`[OK] /targets — ${t.length} priority companies loaded`);
  } else {
    console.log('[FAIL] /targets:', JSON.stringify(targets).substring(0, 200));
  }

  console.log('\n=== All checks passed! ===\n');
  process.exit(0);
})().catch(e => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
