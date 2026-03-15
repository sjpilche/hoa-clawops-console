const http = require('http');
function req(m, p, b, h) {
  return new Promise((res, rej) => {
    const r = http.request({ hostname: 'localhost', port: 3001, path: p, method: m, headers: { 'Content-Type': 'application/json', ...h } }, s => {
      let d = ''; s.on('data', c => d += c); s.on('end', () => { try { res(JSON.parse(d)); } catch { res({ raw: d }); } });
    });
    r.on('error', rej);
    if (b) r.write(JSON.stringify(b));
    r.end();
  });
}
async function main() {
  const auth = await req('POST', '/api/auth/login', { email: 'admin@clawops.local', password: 'changeme123' });
  const h = { Authorization: 'Bearer ' + auth.token.token };
  const sched = await req('GET', '/api/schedules', null, h);
  const s = sched.schedules || [];
  console.log('Total schedules:', s.length);
  console.log('Enabled:', s.filter(x => x.enabled).length);
  console.log('Never ran:', s.filter(x => x.lastRunAt === null || x.lastRunAt === undefined).length);

  const now = new Date();
  const dow = now.getDay(); // 0=Sun, 5=Fri
  const hour = now.getHours();
  console.log('\nLocal time:', now.toTimeString().slice(0, 5), '| DOW:', dow, '(0=Sun)');
  console.log('\nUpcoming today (remaining hours):');

  s.forEach(x => {
    const parts = x.cronExpression.split(' ');
    const cronMin = parts[0], cronHour = parts[1], cronDow = parts[4];
    const h2 = parseInt(cronHour);
    const m2 = parseInt(cronMin);

    // Check if today matches DOW
    let matchesDay = false;
    if (cronDow === '*') matchesDay = true;
    else if (cronDow.includes(',')) matchesDay = cronDow.split(',').map(Number).includes(dow);
    else if (cronDow.includes('-')) {
      const [lo, hi] = cronDow.split('-').map(Number);
      matchesDay = dow >= lo && dow <= hi;
    } else matchesDay = parseInt(cronDow) === dow;

    if (matchesDay && (h2 > hour || (h2 === hour && m2 > now.getMinutes()))) {
      console.log(`  ${String(h2).padStart(2, '0')}:${String(m2).padStart(2, '0')}  ${(x.agentName || '?').padEnd(35)} [${x.cronExpression}]`);
    }
  });

  // Recent runs
  const runs = await req('GET', '/api/runs?limit=5', null, h);
  console.log('\nRecent runs:');
  (runs.runs || []).forEach(r => {
    console.log(`  ${r.status.padEnd(12)} ${r.trigger.padEnd(15)} ${(r.agent_name || '?').padEnd(30)} ${r.created_at}`);
  });
}
main().catch(e => console.error(e.message));
