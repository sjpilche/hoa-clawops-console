/**
 * Trigger jake-construction-discovery via the live server API.
 * Goes through the server's in-memory DB — no isolation issues.
 *
 * ⚠️  Server (npm run dev) must be running first.
 *
 * Usage:
 *   node scripts/trigger-discovery.js                   # auto-rotation (next Jake market)
 *   node scripts/trigger-discovery.js "Denver, CO"      # specific market
 *   node scripts/trigger-discovery.js "Atlanta, GA" 200 # specific market + limit
 */
'use strict';

const http = require('http');
const region = process.argv[2] || null;
const limit  = process.argv[3] ? parseInt(process.argv[3]) : 100;

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);

    const req = http.request({ hostname: 'localhost', port: 3001, path, method, headers }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ _raw: data }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('\n🔑 Logging in...');
  const auth = await request('POST', '/api/auth/login', {
    email: 'admin@clawops.local',
    password: 'changeme123',
  });
  const token = (auth.token && typeof auth.token === 'object') ? auth.token.token : auth.token;
  if (!token) { console.error('Login failed:', auth); process.exit(1); }

  const msg = region
    ? JSON.stringify({ region, limit })
    : JSON.stringify({ limit });

  console.log(`🗺️  Triggering jake-construction-discovery${region ? ` for "${region}"` : ' (auto-rotation)'}...`);
  console.log(`   Limit: ${limit} companies`);

  // Create pending run
  const createResp = await request('POST', '/api/agents/jake-construction-discovery/run', {
    message: msg, json: true,
  }, token);

  if (!createResp.run?.id) {
    console.error('Create run failed:', JSON.stringify(createResp));
    process.exit(1);
  }

  const runId = createResp.run.id;
  console.log(`📋 Run ID: ${runId}`);
  console.log(`⏳ Scraping Google Maps — ${Math.ceil(limit / 20)}-8 min depending on market size...\n`);

  // Confirm + execute (waits for agent to finish)
  const confirmResp = await request('POST', `/api/runs/${runId}/confirm`, {}, token);
  const r = confirmResp.run || confirmResp;

  console.log(`\nStatus:   ${r.status}`);
  console.log(`Duration: ${((r.duration_ms || 0) / 1000).toFixed(0)}s`);
  console.log(`Cost:     $${(r.cost_usd || 0).toFixed(4)}`);

  if (r.result_data) {
    try {
      const rd = JSON.parse(r.result_data);
      console.log('\n' + (rd.outputText || ''));
    } catch {}
  }
  if (r.error_msg) console.error('\nError:', r.error_msg);
  if (r.status !== 'completed') process.exit(1);

  console.log('\n🔍 Run jake-contact-enricher next:');
  console.log('   node scripts/trigger-enricher.js');
}

main().catch(err => {
  console.error('\n❌', err.message);
  console.error('Is the server running? npm run dev');
  process.exit(1);
});
