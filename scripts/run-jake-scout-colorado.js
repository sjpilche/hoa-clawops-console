/**
 * Manually trigger jake-lead-scout for a specific region.
 * ⚠️  WARNING: Do NOT run while the server (npm run dev) is also running.
 *    Both processes share the same SQLite file — concurrent writes will corrupt data.
 *    Use run-scout-now.js instead, or trigger via the API.
 *
 * Run: node scripts/run-jake-scout-colorado.js [region]
 * Example: node scripts/run-jake-scout-colorado.js "Phoenix, AZ"
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
const { get, run, initDatabase } = require('../server/db/connection');
const { v4: uuidv4 } = require('uuid');

async function main() {
  await initDatabase();

  // Load the special handler registry from runs.js
  const runsRouter = require('../server/routes/runs');
  const SPECIAL_HANDLERS = runsRouter.SPECIAL_HANDLERS;

  if (!SPECIAL_HANDLERS || !SPECIAL_HANDLERS.jake_lead_scout) {
    console.error('jake_lead_scout handler not found in SPECIAL_HANDLERS');
    console.log('Available handlers:', Object.keys(SPECIAL_HANDLERS || {}));
    return;
  }

  // Get the agent from DB
  const agent = get("SELECT * FROM agents WHERE name = 'jake-lead-scout'");
  if (!agent) {
    console.error('jake-lead-scout agent not found in DB');
    return;
  }

  // Create a run record
  const runId = uuidv4();
  const region = process.argv[2] || 'Denver, CO';
  const message = JSON.stringify({
    region,
    trade: 'GC',
    limit: 8,
    pain_focus: 'legacy_erp',
  });

  run(
    `INSERT INTO runs (id, agent_id, user_id, status, trigger, started_at, created_at, updated_at)
     VALUES (?, ?, 'system', 'running', ?, datetime('now'), datetime('now'), datetime('now'))`,
    [runId, agent.id, message]
  );
  run(`UPDATE agents SET status='running', updated_at=datetime('now') WHERE id=?`, [agent.id]);

  console.log(`\n🚀 Jake Lead Scout — Denver, CO`);
  console.log(`   Run ID: ${runId}`);
  console.log(`   Searching LinkedIn, Facebook, job boards, industry directories...`);
  console.log(`   This takes 3-8 minutes — agent is doing real web searches.\n`);

  const startTime = Date.now();
  try {
    const result = await SPECIAL_HANDLERS.jake_lead_scout({ message, runId, agent });

    // Mark completed
    const durationMs = Date.now() - startTime;
    run(
      `UPDATE runs SET status='completed', completed_at=datetime('now'), duration_ms=?, cost_usd=?, tokens_used=?, result_data=?, updated_at=datetime('now') WHERE id=?`,
      [durationMs, result.costUsd || 0, result.tokensUsed || 0, JSON.stringify({ outputText: result.outputText, ...result.extra }), runId]
    );
    run(`UPDATE agents SET status='idle', total_runs=total_runs+1, last_run_at=datetime('now'), updated_at=datetime('now') WHERE id=?`, [agent.id]);

    console.log('\n✅ COMPLETE');
    console.log(result.outputText);
    console.log(`\n   Duration: ${(durationMs / 1000).toFixed(0)}s | Cost: $${(result.costUsd || 0).toFixed(4)}`);

    // Show what's in the DB now
    const newLeads = get(`
      SELECT COUNT(*) as n FROM cfo_leads
      WHERE source_agent = 'jake' AND city = 'Denver' AND source = 'lead_scout'
    `);
    console.log(`\n   New leads in DB for Denver: ${newLeads ? newLeads.n : 0}`);

    const enrichedLeads = get(`
      SELECT COUNT(*) as n FROM cfo_leads
      WHERE source_agent = 'jake' AND contact_email IS NOT NULL AND contact_email != ''
    `);
    console.log(`   Total Jake leads with email: ${enrichedLeads ? enrichedLeads.n : 0}`);

  } catch (err) {
    run(
      `UPDATE runs SET status='failed', error_msg=?, completed_at=datetime('now'), updated_at=datetime('now') WHERE id=?`,
      [err.message, runId]
    );
    run(`UPDATE agents SET status='idle', updated_at=datetime('now') WHERE id=?`, [agent.id]);
    console.error('❌ Scout failed:', err.message);
  }
}

main().catch(console.error);
