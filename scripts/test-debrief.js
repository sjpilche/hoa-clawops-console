/**
 * Test-fire the daily debrief handler directly.
 */
const http = require('http');
const path = require('path');

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

  // Find the daily-debrief agent
  const agentsRes = await fetch('http://localhost:3001/api/agents', {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  const { agents } = JSON.parse(agentsRes.body);
  const debrief = agents.find(a => a.name === 'daily-debrief');
  if (!debrief) { console.error('daily-debrief agent not found'); process.exit(1); }

  // Create a pending run
  const { v4: uuidv4 } = require('uuid');
  const runId = uuidv4();

  // Use the runs API to create + confirm
  const createRes = await fetch('http://localhost:3001/api/runs', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent_id: debrief.id, message: '{}' }),
  });

  // If no POST /api/runs endpoint, create directly then confirm
  if (createRes.status === 404) {
    // Direct approach — use the handler via schedule-style execution
    console.log('No POST /api/runs — using direct handler test instead');

    // Just test the collectDebrief + summary generation
    require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
    const { collectDebrief } = require('../server/services/debriefCollector');
    const { initDatabase } = require('../server/db/connection');
    await initDatabase();

    const data = await collectDebrief();
    const r = data.runs;
    const failedList = r.runs.filter(x => x.status === 'failed').map(x => `${x.agent}: ${(x.error || '').slice(0, 60)}`);
    const topCostAgents = data.costs.byAgent.filter(a => a.cost > 0).slice(0, 5).map(a => `${a.agent}: $${a.cost.toFixed(4)} (${a.runs} runs)`);

    const summary = [
      `Date: ${data.date}`,
      ``,
      `RUNS: ${r.total} total | ${r.completed} completed | ${r.failed} failed | ${r.pending} pending`,
      `Cost today: $${r.totalCost.toFixed(4)} | Yesterday: $${r.yesterday.cost.toFixed(4)}`,
      failedList.length > 0 ? `Failed: ${failedList.join('; ')}` : 'No failures',
      topCostAgents.length > 0 ? `Top cost: ${topCostAgents.join(', ')}` : 'All runs $0',
      ``,
      `AGENTS: ${data.agentUtilization.total} total | ${data.agentUtilization.usedToday} active today | ${data.agentUtilization.idle.length} idle`,
      ``,
      `LEADS: HOA ${data.leads.hoa.total} total (+${data.leads.hoa.newToday} today) | CFO ${data.leads.cfo.total} total (+${data.leads.cfo.newToday} today)`,
      ``,
      `TRADING: ${data.trading.status}`,
      ``,
      `COSTS: Today $${data.costs.today.toFixed(4)} | Week $${data.costs.thisWeek.toFixed(4)} | All-time $${data.costs.allTime.toFixed(4)}`,
    ].join('\n');

    console.log('\n=== DEBRIEF SUMMARY (what the LLM would receive) ===');
    console.log(summary);
    console.log(`\n=== SIZE: ${summary.length} chars (limit: 6000) ===`);
    console.log(summary.length < 6000 ? '✅ Fits within CLI limit' : '❌ STILL TOO LONG');
    return;
  }

  const run = JSON.parse(createRes.body);
  console.log('Created run:', run);
}

main().catch(e => { console.error(e); process.exit(1); });
