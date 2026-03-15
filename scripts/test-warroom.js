/**
 * Quick test of the war room dashboard endpoint
 */
const http = require('http');

function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: opts.method || 'GET', headers: opts.headers || {} }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function main() {
  // Login
  const loginRes = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@clawops.local', password: 'changeme123' }),
  });
  const { token } = JSON.parse(loginRes.body);
  const jwt = token.token || token;

  // War room
  const res = await fetch('http://localhost:3001/api/dashboard/warroom', {
    headers: { Authorization: `Bearer ${jwt}` },
  });

  if (res.status !== 200) {
    console.error('FAILED:', res.status, res.body);
    process.exit(1);
  }

  const j = JSON.parse(res.body);
  console.log('=== WAR ROOM DASHBOARD ===');
  console.log('Pipeline:', JSON.stringify(j.pipeline, null, 2));
  console.log('\nOutreach:', JSON.stringify(j.outreach, null, 2));
  console.log('\nRuns today:', JSON.stringify(j.runs?.today));
  console.log('Runs this week:', JSON.stringify(j.runs?.this_week));
  console.log('Recent runs:', j.runs?.recent?.length);
  console.log('\nCosts:', JSON.stringify(j.costs));
  console.log('\nEmail config:', JSON.stringify(j.email));
  console.log('Schedules:', j.schedules?.total, 'total,', j.schedules?.enabled, 'enabled');
  console.log('Content:', JSON.stringify(j.content));
  console.log('Top leads:', j.top_leads?.length);
  console.log('\nBrain:', JSON.stringify(j.brain).slice(0, 200));
  console.log('\n✅ War room endpoint working!');
}

main().catch(e => { console.error(e); process.exit(1); });
