/**
 * Trigger jake-contact-enricher via the live server API.
 * Finds email addresses for pending Jake leads via Google/website scrape/LinkedIn.
 *
 * ⚠️  Server (npm run dev) must be running first.
 *
 * Usage:
 *   node scripts/trigger-enricher.js                       # enrich 20 Google Maps leads
 *   node scripts/trigger-enricher.js 50                    # enrich 50 Google Maps leads
 *   node scripts/trigger-enricher.js 50 pending maps       # explicitly target Maps leads
 *   node scripts/trigger-enricher.js 50 pending dbpr       # target DBPR/license-scraped leads
 *   node scripts/trigger-enricher.js 50 pending all        # all pending leads regardless of source
 *   node scripts/trigger-enricher.js 50 partial maps       # re-enrich partial Maps leads
 */
'use strict';

const http = require('http');
const limit   = process.argv[2] ? parseInt(process.argv[2]) : 20;
const status  = process.argv[3] || 'pending';
// Source filter: 'maps' → google_maps_discovery, 'dbpr' → dbpr_scrape, 'all' or omit → no filter
const sourceArg = process.argv[4] || 'maps';
const sourceMap = {
  maps: 'google_maps_discovery',
  dbpr: 'dbpr_scrape',
  scout: 'lead_scout',
  all: null,
};
const source = sourceMap[sourceArg] !== undefined ? sourceMap[sourceArg] : 'google_maps_discovery';

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

  const msg = JSON.stringify({ limit, status_filter: status, min_score: 0, source });

  console.log(`📧 Triggering jake-contact-enricher...`);
  console.log(`   Limit: ${limit} leads | Status: ${status} | Source: ${source || 'all'}`);
  console.log(`   Each lead: ~30-90s of Google search + website scrape\n`);

  const createResp = await request('POST', '/api/agents/jake-contact-enricher/run', {
    message: msg, json: true,
  }, token);

  if (!createResp.run?.id) {
    console.error('Create run failed:', JSON.stringify(createResp));
    process.exit(1);
  }

  const runId = createResp.run.id;
  console.log(`📋 Run ID: ${runId}`);
  console.log(`⏳ Enriching ${limit} leads — ${Math.ceil(limit * 1)} min estimated...\n`);

  const confirmResp = await request('POST', `/api/runs/${runId}/confirm`, {}, token);
  const r = confirmResp.run || confirmResp;

  console.log(`\nStatus:   ${r.status}`);
  console.log(`Duration: ${((r.duration_ms || 0) / 1000).toFixed(0)}s`);

  if (r.result_data) {
    try {
      const rd = JSON.parse(r.result_data);
      console.log('\n' + (rd.outputText || ''));
    } catch {}
  }
  if (r.error_msg) console.error('\nError:', r.error_msg);
  if (r.status !== 'completed') process.exit(1);
}

main().catch(err => {
  console.error('\n❌', err.message);
  console.error('Is the server running? npm run dev');
  process.exit(1);
});
