#!/usr/bin/env node
/**
 * One-shot Apollo enrichment for the stalled CFO leads.
 *
 * Reason: The 22 Apollo construction-CFO leads in cfo_leads were marked
 * enrichment_status='enriched' but have contact_email=NULL — the enricher
 * ran, found nothing, and wrote success status anyway (latent bug).
 * apolloEnricher.enrichLead() skips already-enriched leads, so we reset
 * those statuses first, then re-run.
 *
 * Idempotent: only resets leads with email NULL/empty, only enriches leads
 * in pending/partial/failed status. Re-runs after a successful pass do nothing.
 *
 * Cost: ≤22 Apollo credits (well under the 60K/mo budget and 40/day cap).
 *
 * Usage:
 *   node scripts/enrich-22-cfos-now.js
 *   node scripts/enrich-22-cfos-now.js --dry-run    # preview only
 */

'use strict';

require('dotenv').config({ path: '.env.local' });

const path = require('path');
const { initDatabase, run, all, get } = require(path.join(__dirname, '..', 'server', 'db', 'connection'));

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  await initDatabase();

  const stalled = all(`
    SELECT id, company_name, contact_email, enrichment_status, pilot_fit_score, source
    FROM cfo_leads
    WHERE (contact_email IS NULL OR contact_email = '')
    ORDER BY pilot_fit_score DESC
  `);

  console.log(`Found ${stalled.length} leads with no email.`);
  if (stalled.length === 0) {
    console.log('Nothing to do.');
    process.exit(0);
  }

  const wronglyEnriched = stalled.filter(l => l.enrichment_status === 'enriched');
  const alreadyPending  = stalled.filter(l => l.enrichment_status !== 'enriched');

  console.log(`  ${wronglyEnriched.length} marked 'enriched' but no email — will reset to 'pending'`);
  console.log(`  ${alreadyPending.length} already in pending/partial/failed/in_progress`);

  if (DRY_RUN) {
    console.log('\n--- DRY RUN — top 10 ---');
    for (const l of stalled.slice(0, 10)) {
      console.log(`  [${l.id}] ${l.company_name} (status=${l.enrichment_status}, score=${l.pilot_fit_score})`);
    }
    process.exit(0);
  }

  if (wronglyEnriched.length > 0) {
    run(`
      UPDATE cfo_leads
      SET enrichment_status = 'pending',
          enrichment_method = NULL,
          enriched_at       = NULL,
          updated_at        = datetime('now')
      WHERE (contact_email IS NULL OR contact_email = '')
        AND enrichment_status = 'enriched'
    `);
    console.log(`Reset ${wronglyEnriched.length} leads to enrichment_status='pending'.`);
  }

  if (!process.env.APOLLO_API_KEY) {
    console.error('\nAPOLLO_API_KEY not set in environment. Aborting.');
    process.exit(1);
  }

  const { enrichLead } = require(path.join(__dirname, '..', 'server', 'services', 'apolloEnricher'));

  console.log(`\nEnriching ${stalled.length} leads via Apollo (300ms pacing)…\n`);

  let withEmail = 0;
  let partial   = 0;
  let failed    = 0;
  const t0 = Date.now();

  for (let i = 0; i < stalled.length; i++) {
    const lead = get('SELECT * FROM cfo_leads WHERE id = ?', [stalled[i].id]);
    if (!lead) continue;

    try {
      const result = await enrichLead(lead);
      const after = get('SELECT contact_email, enrichment_status FROM cfo_leads WHERE id = ?', [lead.id]);
      const tag = after.contact_email ? '✓' : (after.enrichment_status === 'partial' ? '~' : '✗');
      console.log(`  ${tag} [${i + 1}/${stalled.length}] ${lead.company_name} → ${after.contact_email || after.enrichment_status}`);
      if (after.contact_email) withEmail++;
      else if (after.enrichment_status === 'partial') partial++;
      else failed++;
    } catch (err) {
      console.warn(`  ✗ [${i + 1}/${stalled.length}] ${lead.company_name} — ${err.message}`);
      failed++;
    }

    if (i < stalled.length - 1) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nDone in ${dt}s.`);
  console.log(`  ${withEmail} got email`);
  console.log(`  ${partial} partial (data but no email)`);
  console.log(`  ${failed} no data found`);
  console.log(`\nNext: trigger drafter via curl in plan A4.`);
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
