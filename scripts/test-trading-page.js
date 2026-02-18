/**
 * Test script for the Trading page backend routes.
 * Tests both the console API (port 3001) and trader service (port 3002).
 */

const http = require('http');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    }).on('error', (err) => reject(err));
  });
}

function httpPost(url, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', (err) => reject(err));
    req.write(body);
    req.end();
  });
}

function pass(label) { console.log(`  ✅ ${label}`); }
function fail(label, detail) { console.log(`  ❌ ${label}: ${detail}`); }
function section(title) { console.log(`\n${'─'.repeat(50)}\n  ${title}\n${'─'.repeat(50)}`); }

async function run() {
  console.log('\n🧪 Trading Page Test Suite\n');

  // ── Console API (port 3001) ─────────────────────────────────────────────
  section('Console API — port 3001');

  try {
    const r = await httpGet('http://localhost:3001/api/agents');
    if (r.status === 200 || r.status === 401) {
      pass(`Console API reachable (${r.status})`);
    } else {
      fail('Console API', `unexpected status ${r.status}`);
    }
  } catch (e) {
    fail('Console API DOWN', e.message);
    console.log('  ⚠️  Start with: npm run dev');
  }

  // Settings routes
  try {
    const r = await httpGet('http://localhost:3001/api/settings');
    if (r.status === 200 || r.status === 401) {
      pass(`Settings route reachable (${r.status})`);
      if (r.status === 200 && r.body.settings) {
        const keys = Object.keys(r.body.settings);
        pass(`Settings has ${keys.length} keys: ${keys.slice(0,5).join(', ')}...`);
        const hasNew = ['openclaw_mode','log_level','enable_audit_logging'].every(k => keys.includes(k));
        if (hasNew) pass('New setting keys seeded correctly');
        else fail('Missing new setting keys', `got: ${keys.join(', ')}`);
      }
    } else {
      fail('Settings route', `status ${r.status}`);
    }
  } catch (e) {
    fail('Settings route', e.message);
  }

  // ── Trader Service (port 3002) ──────────────────────────────────────────
  section('Trader Service — port 3002');

  let traderUp = false;

  try {
    const r = await httpGet('http://localhost:3002/health');
    if (r.status === 200) {
      traderUp = true;
      const h = r.body;
      pass(`Health endpoint OK`);

      // Key fix: status should be 'healthy' not 'ok'
      if (h.status === 'healthy') {
        pass(`health.status = '${h.status}' ✓ (frontend now checks 'healthy')`);
      } else {
        fail(`health.status`, `got '${h.status}', expected 'healthy'`);
      }

      // Kill switch field
      if (h.killSwitch === 'armed' || h.killSwitch === 'triggered') {
        pass(`health.killSwitch = '${h.killSwitch}' ✓`);
      } else {
        fail('health.killSwitch field', `got '${h.killSwitch}'`);
      }

      console.log(`     Mode: ${h.mode}, Uptime: ${Math.floor(h.uptime)}s, Version: ${h.version}`);
    } else {
      fail('Trader health', `status ${r.status}: ${JSON.stringify(r.body)}`);
    }
  } catch (e) {
    fail('Trader Service DOWN', e.message);
    console.log('  ⚠️  Start with: npm run dev (trader runs on port 3002)');
  }

  if (!traderUp) {
    console.log('\n  Skipping trader route tests (service offline)\n');
    return;
  }

  // Strategies
  try {
    const r = await httpGet('http://localhost:3002/api/strategies');
    if (r.status === 200) {
      const strats = r.body.strategies ?? [];
      pass(`Strategies endpoint OK — ${strats.length} strategies`);
      strats.forEach(s => {
        const hasParams = s.params !== undefined;
        const hasSymbols = Array.isArray(s.symbols);
        if (hasParams && hasSymbols) {
          pass(`  Strategy '${s.name}': enabled=${s.enabled}, symbols=${s.symbols.length}, params=${Object.keys(s.params).length}`);
        } else {
          fail(`  Strategy '${s.name}'`, `missing params=${!hasParams} or symbols=${!hasSymbols}`);
        }
      });
    } else {
      fail('Strategies', `status ${r.status}: ${JSON.stringify(r.body).slice(0,100)}`);
    }
  } catch (e) {
    fail('Strategies', e.message);
  }

  // Positions
  try {
    const r = await httpGet('http://localhost:3002/api/positions');
    if (r.status === 200) {
      const positions = r.body.positions ?? [];
      pass(`Positions endpoint OK — ${positions.length} open positions`);
    } else {
      fail('Positions', `status ${r.status}: ${JSON.stringify(r.body).slice(0,100)}`);
    }
  } catch (e) {
    fail('Positions', e.message);
  }

  // P&L
  try {
    const r = await httpGet('http://localhost:3002/api/positions/pnl');
    if (r.status === 200) {
      pass(`P&L endpoint OK`);
    } else {
      fail('P&L', `status ${r.status}`);
    }
  } catch (e) {
    fail('P&L', e.message);
  }

  // Portfolio value
  try {
    const r = await httpGet('http://localhost:3002/api/positions/portfolio/value');
    if (r.status === 200) {
      pass(`Portfolio value endpoint OK`);
    } else {
      fail('Portfolio value', `status ${r.status}`);
    }
  } catch (e) {
    fail('Portfolio value', e.message);
  }

  // Orders
  try {
    const r = await httpGet('http://localhost:3002/api/orders');
    if (r.status === 200) {
      pass(`Orders history endpoint OK — ${(r.body.orders ?? []).length} orders`);
    } else {
      fail('Orders', `status ${r.status}: ${JSON.stringify(r.body).slice(0,100)}`);
    }
  } catch (e) {
    fail('Orders', e.message);
  }

  // Risk limits
  try {
    const r = await httpGet('http://localhost:3002/api/risk/limits');
    if (r.status === 200) {
      const limits = r.body.limits ?? [];
      pass(`Risk limits OK — ${limits.length} limits configured`);
      limits.forEach(l => console.log(`     ${l.limitType}: ${l.unit === 'USD' ? '$' : ''}${l.value} ${l.unit}`));
    } else {
      fail('Risk limits', `status ${r.status}`);
    }
  } catch (e) {
    fail('Risk limits', e.message);
  }

  // Risk breaches
  try {
    const r = await httpGet('http://localhost:3002/api/risk/breaches');
    if (r.status === 200) {
      pass(`Risk breaches endpoint OK — ${(r.body.breaches ?? []).length} breaches`);
    } else {
      fail('Risk breaches', `status ${r.status}`);
    }
  } catch (e) {
    fail('Risk breaches', e.message);
  }

  // Kill switch status
  try {
    const r = await httpGet('http://localhost:3002/api/kill-switch/status');
    if (r.status === 200) {
      const status = r.body.status;
      const statusStr = typeof status === 'object' ? status?.status : status;
      pass(`Kill switch status OK: '${statusStr}'`);
      if (statusStr === 'armed' || statusStr === 'triggered') {
        pass(`Kill switch status value valid ('armed'/'triggered')`);
      } else {
        fail('Kill switch status value', `got '${JSON.stringify(status)}'`);
      }
    } else {
      fail('Kill switch status', `status ${r.status}`);
    }
  } catch (e) {
    fail('Kill switch status', e.message);
  }

  // Kill switch events
  try {
    const r = await httpGet('http://localhost:3002/api/kill-switch/events');
    if (r.status === 200) {
      pass(`Kill switch events OK — ${(r.body.events ?? []).length} events`);
    } else {
      fail('Kill switch events', `status ${r.status}`);
    }
  } catch (e) {
    fail('Kill switch events', e.message);
  }

  // Broker test
  try {
    const r = await httpGet('http://localhost:3002/api/broker/test');
    if (r.status === 200) {
      pass(`Broker connection OK: ${r.body.message ?? r.body.status}`);
    } else if (r.status === 400) {
      pass(`Broker test reachable — credentials not configured (expected in dev): ${r.body.error}`);
    } else {
      fail('Broker test', `status ${r.status}: ${JSON.stringify(r.body).slice(0,100)}`);
    }
  } catch (e) {
    fail('Broker test', e.message);
  }

  console.log('\n' + '═'.repeat(50));
  console.log('  Test run complete');
  console.log('═'.repeat(50) + '\n');
}

run().catch(console.error);
