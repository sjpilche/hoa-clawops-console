/**
 * Run jake-lead-scout immediately for a specific region.
 * Replicates EXACTLY what scheduleRunner.js does — same DB save pattern.
 *
 * Run: node scripts/run-scout-now.js "Denver, CO"
 */
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const region = process.argv[2] || 'Denver, CO';
const message = JSON.stringify({ region, trade: 'GC', limit: 8 });

async function main() {
  const { initDatabase, get, run, all } = require('../server/db/connection');
  await initDatabase();

  // Find agent
  const agent = get("SELECT * FROM agents WHERE name = 'jake-lead-scout'");
  if (!agent) throw new Error('jake-lead-scout agent not found in DB');
  console.log('Agent:', agent.name, agent.id.slice(0, 8));

  // Create run — use exact same pattern as scheduleRunner.js
  const { v4: uuidv4 } = require('uuid');
  const runId = uuidv4();

  run(`
    INSERT INTO runs (id, agent_id, user_id, status, trigger, started_at, created_at, updated_at)
    VALUES (?, ?, 'system', 'running', ?, datetime('now'), datetime('now'), datetime('now'))
  `, [runId, agent.id, message]);

  run(`UPDATE agents SET status='running', updated_at=datetime('now') WHERE id=?`, [agent.id]);

  console.log(`\n🚀 Jake Lead Scout — ${region}`);
  console.log(`   Run ID: ${runId.slice(0, 8)}`);
  console.log(`   Searching for CFOs/Controllers at construction companies...`);
  console.log(`   Uses LinkedIn, Facebook, job boards — expect 4-10 minutes.\n`);

  // Load SPECIAL_HANDLERS from runs.js — exported as router.SPECIAL_HANDLERS
  const runsRouter = require('../server/routes/runs');
  const SPECIAL_HANDLERS = runsRouter.SPECIAL_HANDLERS;

  if (!SPECIAL_HANDLERS) throw new Error('SPECIAL_HANDLERS not exported from runs.js');
  if (!SPECIAL_HANDLERS.jake_lead_scout) throw new Error('jake_lead_scout not in SPECIAL_HANDLERS');

  const startTime = Date.now();
  try {
    const result = await SPECIAL_HANDLERS.jake_lead_scout({ message, runId, agent });
    const durationMs = Date.now() - startTime;

    // Save result using same pattern as markRunCompleted
    run(`
      UPDATE runs
      SET status='completed', completed_at=datetime('now'), duration_ms=?, tokens_used=?, cost_usd=?, result_data=?, updated_at=datetime('now')
      WHERE id=?
    `, [durationMs, result.tokensUsed || 0, result.costUsd || 0, JSON.stringify({ outputText: result.outputText, ...(result.extra || {}) }), runId]);

    run(`UPDATE agents SET status='idle', total_runs=total_runs+1, last_run_at=datetime('now'), updated_at=datetime('now') WHERE id=?`, [agent.id]);

    console.log('\n✅ SCOUT COMPLETE');
    console.log(result.outputText || '(no output)');
    console.log(`\nDuration: ${(durationMs / 1000).toFixed(0)}s | Cost: $${(result.costUsd || 0).toFixed(4)}`);

    // Show results
    const newLeads = all(
      `SELECT company_name, contact_name, contact_email, contact_title, pilot_fit_score, city, state
       FROM cfo_leads WHERE source_agent='jake' AND source='lead_scout' ORDER BY created_at DESC LIMIT 15`
    );
    console.log(`\n📋 Jake leads in DB (most recent):`);
    newLeads.forEach(l =>
      console.log(`  [${l.pilot_fit_score||0}] ${l.company_name} | ${l.contact_name||'(no contact)'} | ${l.contact_email||'(no email)'} | ${l.city||''}${l.state ? ', '+l.state : ''}`)
    );

  } catch (err) {
    run(`
      UPDATE runs SET status='failed', error_msg=?, completed_at=datetime('now'), updated_at=datetime('now') WHERE id=?
    `, [err.message, runId]);
    run(`UPDATE agents SET status='idle', updated_at=datetime('now') WHERE id=?`, [agent.id]);
    throw err;
  }
}

main().catch(err => { console.error('\n❌ FAILED:', err.message); process.exit(1); });
