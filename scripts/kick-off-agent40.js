/**
 * Kick off Agent 40 (CAI Scraper) full run across FL, CA, CO.
 * Usage: node scripts/kick-off-agent40.js
 */
const http = require('http');

function apiFetch(url, opts = {}) {
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
  console.log('\n=== KICK OFF: Agent 40 — CAI Directory Scraper (Full Run) ===\n');

  // 1. Login
  const login = await apiFetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@clawops.local', password: 'changeme123' }),
  });
  const jwt = (typeof login.token === 'string') ? login.token : login.token?.token;
  if (!jwt) {
    console.error('[FAIL] Login failed:', JSON.stringify(login).substring(0, 200));
    process.exit(1);
  }
  console.log('[OK] Logged in');

  const headers = { 'Authorization': 'Bearer ' + jwt, 'Content-Type': 'application/json' };

  // 2. Create a run for Agent 40
  console.log('[...] Creating run for mgmt-cai-scraper with target_states: FL, CA, CO');
  const runRes = await apiFetch('http://localhost:3001/api/agents/mgmt-cai-scraper/run', {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: '{"target_states": "FL, CA, CO"}' }),
  });
  console.log('[Run response]', JSON.stringify(runRes).substring(0, 300));

  const runId = runRes.run?.id || runRes.runId;
  if (!runId) {
    console.error('[FAIL] No runId returned');
    process.exit(1);
  }
  console.log(`[OK] Run created: ${runId}\n`);

  // 3. Confirm the run (this triggers execution)
  console.log('[...] Confirming run — this will take several minutes...');
  console.log('[...] Scraping 12 CAI chapters across FL (5), CA (6), CO (1)\n');

  const confirmRes = await apiFetch('http://localhost:3001/api/runs/' + runId + '/confirm', {
    method: 'POST',
    headers,
  });

  console.log('\n=== RESULT ===\n');
  console.log(JSON.stringify(confirmRes, null, 2));

  if (confirmRes.run?.output) {
    try {
      const output = JSON.parse(confirmRes.run.output);
      console.log('\n=== SUMMARY ===');
      console.log(`Chapters scraped: ${output.chapters_scraped || 'N/A'}`);
      console.log(`Companies found:  ${output.companies_found || 0}`);
      console.log(`New companies:    ${output.new_companies || 0}`);
      console.log(`Updated:          ${output.updated_companies || 0}`);
      console.log(`AAMC companies:   ${output.aamc_companies || 0}`);
      console.log(`Duration:         ${output.duration_seconds || 0}s`);
      console.log(`Cost:             $${output.cost_usd || 0}`);
      if (output.chapter_details) {
        console.log('\nChapter breakdown:');
        for (const ch of output.chapter_details) {
          const status = ch.error ? `ERROR: ${ch.error}` : `${ch.companies_found} companies`;
          console.log(`  ${ch.name} (${ch.state}): ${status}`);
        }
      }
    } catch (e) {
      console.log('Output:', confirmRes.run.output);
    }
  }

  console.log('\n=== DONE ===\n');
  process.exit(0);
})().catch(e => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
