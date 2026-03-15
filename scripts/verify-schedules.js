// Quick verification script — checks schedule and run state
const http = require('http');
function req(method, path, body, headers) {
  return new Promise((resolve, reject) => {
    const r = http.request({ hostname: 'localhost', port: 3001, path, method, headers: { 'Content-Type': 'application/json', ...headers } }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve({ raw: b }); } });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}
async function main() {
  const auth = await req('POST', '/api/auth/login', { email: 'admin@clawops.local', password: 'changeme123' });
  const h = { Authorization: 'Bearer ' + auth.token.token };

  // Schedules
  const sched = await req('GET', '/api/schedules', null, h);
  const schedules = sched.schedules || [];
  const enabled = schedules.filter(s => s.enabled);
  const neverRan = schedules.filter(s => s.lastRunAt === null || s.lastRunAt === undefined);
  console.log(`\n=== SCHEDULES ===`);
  console.log(`Total: ${schedules.length} | Enabled: ${enabled.length} | Never ran: ${neverRan.length}`);

  // Recent runs
  const runs = await req('GET', '/api/runs?limit=10', null, h);
  console.log(`\n=== RECENT RUNS ===`);
  (runs.runs || []).forEach(r => {
    console.log(`  ${r.status.padEnd(12)} ${r.trigger.padEnd(15)} ${(r.agent_name || '?').padEnd(35)} ${r.created_at}`);
  });

  // Trigger pipeline-state-tracker as proof of life
  const pst = schedules.find(s => s.agentName === 'urgency-scorer');
  if (pst) {
    console.log(`\n=== LIVE FIRE TEST: ${pst.name} ===`);
    const trigger = await req('POST', `/api/schedules/${pst.id}/run`, {}, h);
    if (trigger.run) {
      console.log(`  Run created: ${trigger.run.id} (${trigger.run.status})`);
      // Confirm it
      const confirm = await req('POST', `/api/runs/${trigger.run.id}/confirm`, {}, h);
      console.log(`  Result: ${confirm.run?.status || confirm.error}`);
      console.log(`  Output: ${(confirm.run?.outputText || confirm.message || '').slice(0, 200)}`);
      console.log(`  Duration: ${confirm.run?.duration_ms}ms | Cost: $${confirm.run?.cost_usd || 0}`);
    } else {
      console.log(`  Trigger failed:`, trigger.error || trigger.message);
    }
  }
}
main().catch(e => console.error(e.message));
