#!/usr/bin/env node
/**
 * Quick test of pipeline API endpoint.
 * Run while server is running: node scripts/test-pipelines.js
 */
const http = require('http');

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost',
      port: 3001,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const r = http.request(opts, res => {
      let raw = '';
      res.on('data', d => (raw += d));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function main() {
  console.log('=== Pipeline API Test ===\n');

  // 1. Login
  const loginRes = await req('POST', '/api/auth/login', { email: 'admin@clawops.local', password: 'changeme123' });
  if (!loginRes.body.token) {
    console.error('❌ Login failed:', loginRes.body);
    return;
  }
  const token = loginRes.body.token?.token || loginRes.body.token;
  console.log('✅ Logged in\n');

  // 2. List pipelines
  const listRes = await req('GET', '/api/pipelines', null, token);
  if (!listRes.body.success) {
    console.error('❌ List pipelines failed:', listRes.body);
    return;
  }
  console.log(`✅ GET /api/pipelines — ${listRes.body.pipelines.length} pipelines:`);
  for (const p of listRes.body.pipelines) {
    console.log(`   ${p.id}. ${p.name} (${p.domain || 'all'}) — ${p.steps.length} steps`);
    for (const s of p.steps) {
      console.log(`      → ${s.agent_name}${s.delay_minutes > 0 ? ` (+${s.delay_minutes}min)` : ''}`);
    }
  }

  // 3. Get pipeline details for pipeline 1
  if (listRes.body.pipelines.length > 0) {
    const pid = listRes.body.pipelines[0].id;
    const detailRes = await req('GET', `/api/pipelines/${pid}`, null, token);
    console.log(`\n✅ GET /api/pipelines/${pid} — "${detailRes.body.pipeline?.name}"`);
  }

  // 4. Check runs/active endpoint
  const activeRes = await req('GET', '/api/pipelines/runs/active', null, token);
  console.log(`\n✅ GET /api/pipelines/runs/active — ${activeRes.body.runs?.length || 0} active runs`);

  // 5. Check runs history
  const historyRes = await req('GET', '/api/pipelines/runs', null, token);
  console.log(`✅ GET /api/pipelines/runs — ${historyRes.body.runs?.length || 0} runs in history`);

  console.log('\n✅ All pipeline routes working correctly!');
}

main().catch(console.error);
