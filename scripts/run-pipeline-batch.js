/**
 * Run the management company research pipeline on seeded companies.
 * Runs agents sequentially on each company: 39 (Reviews), 36 (Portfolio), 37 (Contacts).
 *
 * Usage: node scripts/run-pipeline-batch.js [--agent=39] [--limit=5]
 */
const http = require('http');

const AGENTS = {
  39: { id: 'mgmt-review-scanner', name: 'Review Scanner (THE MONEY AGENT)' },
  36: { id: 'mgmt-portfolio-scraper', name: 'Portfolio Scraper' },
  37: { id: 'mgmt-contact-puller', name: 'Contact Puller' },
  38: { id: 'mgmt-portfolio-mapper', name: 'Portfolio Mapper' },
};

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

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const [key, val] = arg.replace('--', '').split('=');
    args[key] = val;
  }
  return args;
}

async function runAgent(jwt, agentId, message) {
  const headers = { 'Authorization': 'Bearer ' + jwt, 'Content-Type': 'application/json' };

  // Create run
  const runRes = await apiFetch(`http://localhost:3001/api/agents/${agentId}/run`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message }),
  });

  const runId = runRes.run?.id || runRes.runId;
  if (!runId) {
    return { error: `Failed to create run: ${JSON.stringify(runRes).substring(0, 200)}` };
  }

  // Confirm run (triggers execution)
  const confirmRes = await apiFetch(`http://localhost:3001/api/runs/${runId}/confirm`, {
    method: 'POST',
    headers,
  });

  return confirmRes;
}

(async () => {
  const args = parseArgs();
  const agentNum = parseInt(args.agent || '39');
  const limit = parseInt(args.limit || '5');
  const agent = AGENTS[agentNum];

  if (!agent) {
    console.error(`Unknown agent number: ${agentNum}. Valid: 36, 37, 38, 39`);
    process.exit(1);
  }

  console.log(`\n=== PIPELINE: ${agent.name} (Agent ${agentNum}) ===`);
  console.log(`Processing up to ${limit} companies\n`);

  // Login
  const login = await apiFetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@clawops.local', password: 'changeme123' }),
  });
  const jwt = (typeof login.token === 'string') ? login.token : login.token?.token;
  if (!jwt) {
    console.error('Login failed');
    process.exit(1);
  }

  // Get queued companies from dashboard
  const headers = { 'Authorization': 'Bearer ' + jwt };
  const dashboard = await apiFetch('http://localhost:3001/api/mgmt-research/dashboard', { headers });
  const companies = dashboard.companies || [];

  // Pick field to check based on agent
  const pipelineField = {
    39: 'reviews_scanned',
    36: 'portfolio_scraped',
    37: 'contacts_pulled',
    38: 'portfolio_mapped',
  }[agentNum];

  // Filter to unprocessed companies, sorted by priority
  const queued = companies
    .filter(c => !c[pipelineField])
    .slice(0, limit);

  if (queued.length === 0) {
    console.log('No companies need processing for this agent. Done!');
    process.exit(0);
  }

  console.log(`Found ${queued.length} companies to process:\n`);
  for (const c of queued) {
    console.log(`  - ${c.name} (${c.priority_tier}, ~${c.communities_managed || '?'} communities)`);
  }
  console.log('');

  let successes = 0;
  let failures = 0;
  const startTime = Date.now();

  for (let i = 0; i < queued.length; i++) {
    const company = queued[i];
    const companyUrl = company.website_url || company.website || '';

    console.log(`\n[${i + 1}/${queued.length}] Processing: ${company.name}`);
    console.log(`  URL: ${companyUrl || '(none)'}`);
    console.log(`  Tier: ${company.priority_tier}`);

    // Build message based on agent type
    let message;
    if (agentNum === 39) {
      message = JSON.stringify({
        company_name: company.name,
        company_url: companyUrl,
        mgmt_company_id: company.id,
        state: company.state || '',
        min_signal_score: 5,
        max_reviews: 80,
      });
    } else if (agentNum === 36) {
      message = JSON.stringify({
        company_name: company.name,
        company_url: companyUrl,
        mgmt_company_id: company.id,
      });
    } else if (agentNum === 37) {
      message = JSON.stringify({
        company_name: company.name,
        company_url: companyUrl,
        mgmt_company_id: company.id,
      });
    } else if (agentNum === 38) {
      message = JSON.stringify({
        company_name: company.name,
        company_url: companyUrl,
        mgmt_company_id: company.id,
      });
    }

    const runStart = Date.now();
    const result = await runAgent(jwt, agent.id, message);
    const runDuration = ((Date.now() - runStart) / 1000).toFixed(1);

    if (result.success) {
      console.log(`  ✅ Completed in ${runDuration}s`);
      if (result.run?.outputText) {
        // Print first few lines of output
        const lines = result.run.outputText.split('\n').slice(0, 8);
        for (const line of lines) {
          console.log(`     ${line}`);
        }
      }
      successes++;
    } else {
      console.log(`  ❌ Failed: ${result.error || result.run?.error_msg || 'unknown error'}`);
      failures++;
    }
  }

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n' + '='.repeat(60));
  console.log(`PIPELINE BATCH COMPLETE`);
  console.log('='.repeat(60));
  console.log(`Agent:     ${agent.name}`);
  console.log(`Companies: ${queued.length}`);
  console.log(`Success:   ${successes}`);
  console.log(`Failed:    ${failures}`);
  console.log(`Duration:  ${totalDuration}s`);
  console.log(`Cost:      $0.00`);
  console.log('='.repeat(60));
  console.log('');

  process.exit(failures > 0 ? 1 : 0);
})().catch(e => {
  console.error('FATAL:', e.message);
  if (e.stack) console.error(e.stack);
  process.exit(1);
});
