/**
 * Fire the daily debrief: create run + confirm in one shot.
 */
const http = require('http');

function req(opts, body) {
  return new Promise((resolve, reject) => {
    const r = http.request({ hostname: 'localhost', port: 3001, timeout: 120000, ...opts }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    r.on('error', reject);
    r.on('timeout', () => { r.destroy(); reject(new Error('timeout')); });
    if (body) r.write(typeof body === 'string' ? body : JSON.stringify(body));
    r.end();
  });
}

async function main() {
  // Login
  const login = await req({ path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' } },
    { email: 'admin@clawops.local', password: 'changeme123' });
  const jwt = JSON.parse(login.body).token.token;
  const auth = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };

  // Find agent
  const agentsRes = await req({ path: '/api/agents', headers: auth });
  const debrief = JSON.parse(agentsRes.body).agents.find(a => a.name === 'daily-debrief');
  console.log('Agent:', debrief.name);

  // Create pending run
  const createRes = await req({ path: '/api/agents/' + debrief.id + '/run', method: 'POST', headers: auth }, { message: '{}' });
  const created = JSON.parse(createRes.body);
  const runId = created.run.id;
  console.log('Run:', runId, '— confirming...\n');

  // Confirm (this fires the handler)
  const confRes = await req({ path: '/api/runs/' + runId + '/confirm', method: 'POST', headers: auth });
  console.log('Status:', confRes.status);

  const result = JSON.parse(confRes.body);
  if (result.run?.outputText || result.success) {
    console.log('\n=== DAILY DEBRIEF ===');
    console.log(result.run.outputText);
    console.log('\nCost: $' + (result.run.cost_usd || 0).toFixed(4));
    console.log('Duration: ' + ((result.run.duration_ms || 0) / 1000).toFixed(1) + 's');
  } else {
    console.log(JSON.stringify(result, null, 2).slice(0, 2000));
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
