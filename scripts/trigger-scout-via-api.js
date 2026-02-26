/**
 * Trigger jake-lead-scout via the live server API.
 * Uses the same flow the schedule runner uses.
 *
 * Run: node scripts/trigger-scout-via-api.js
 */
const http = require('http');

const BASE = 'http://localhost:3001';

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost',
      port: 3001,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = http.request(opts, res => {
      let out = '';
      res.on('data', c => (out += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(out) }); }
        catch { resolve({ status: res.statusCode, body: out }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  // 1. Login
  console.log('Logging in...');
  const loginRes = await request('POST', '/api/auth/login', {
    email: 'admin@clawops.local',
    password: 'changeme123',
  });
  if (!loginRes.body.token) {
    console.error('Login failed:', loginRes.body);
    return;
  }
  const token = loginRes.body.token;
  console.log('Logged in.');

  // 2. Find the jake-lead-scout agent
  const agentsRes = await request('GET', '/api/agents?limit=100', null, token);
  const agents = agentsRes.body.agents || [];
  const scout = agents.find(a => a.name === 'jake-lead-scout');
  if (!scout) {
    console.error('jake-lead-scout not found. Agents:', agents.map(a => a.name).join(', '));
    return;
  }
  console.log('Found agent:', scout.name, scout.id.slice(0, 8));

  // 3. Create a pending run (POST to /api/schedules/:id/run or direct run creation)
  // The schedule runner directly calls SPECIAL_HANDLERS — let's use the same path
  // by finding the jake schedule and triggering it
  const schedulesRes = await request('GET', '/api/schedules', null, token);
  const schedules = schedulesRes.body.schedules || schedulesRes.body || [];
  const scoutSchedule = (Array.isArray(schedules) ? schedules : []).find(s => s.agent_name === 'jake-lead-scout');

  if (scoutSchedule) {
    console.log('Found schedule:', scoutSchedule.name, scoutSchedule.id.slice(0, 8));
    // Override the schedule message for this run with Colorado
    const runRes = await request('POST', `/api/schedules/${scoutSchedule.id}/run`, {
      message: JSON.stringify({ region: 'Denver, CO', trade: 'GC', limit: 8 }),
    }, token);
    console.log('Schedule run triggered:', runRes.status, JSON.stringify(runRes.body).slice(0, 200));
  } else {
    console.log('No schedule found — available schedules:', (Array.isArray(schedules) ? schedules : []).map(s => s.agent_name).join(', '));
    console.log('\nGo to http://localhost:5174 → Jake Marketing page → click "Discover (CO)" button, or');
    console.log('use the Agents page to manually trigger jake-lead-scout with message:');
    console.log('  {"region":"Denver, CO","trade":"GC","limit":8}');
  }
}

main().catch(console.error);
