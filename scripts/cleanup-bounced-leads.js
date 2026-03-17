#!/usr/bin/env node
/**
 * cleanup-bounced-leads.js — Clean bounced/invalid leads from the pipeline
 *
 * What it does:
 *   1. Marks leads with bounced outreach as status='bounced', cadence_active=0
 *   2. Flags pattern-guessed emails for re-verification
 *   3. Reports lead database health metrics
 *
 * Usage:
 *   node scripts/cleanup-bounced-leads.js --dry-run   # Preview changes
 *   node scripts/cleanup-bounced-leads.js --yes        # Execute changes
 */

'use strict';

const { initDatabase, get, all, run } = require('../server/db/connection');

const isDryRun = process.argv.includes('--dry-run');
const isConfirmed = process.argv.includes('--yes');

if (!isDryRun && !isConfirmed) {
  console.log('Usage:');
  console.log('  node scripts/cleanup-bounced-leads.js --dry-run   # Preview');
  console.log('  node scripts/cleanup-bounced-leads.js --yes        # Execute');
  process.exit(1);
}

(async () => {
  await initDatabase();

  console.log(`\n=== BOUNCED LEAD CLEANUP ${isDryRun ? '(DRY RUN)' : '(EXECUTING)'} ===\n`);

  // 1. Find leads with bounced outreach sequences
  const bouncedLeads = all(`
    SELECT DISTINCT l.id, l.company_name, l.contact_email, l.status, l.cadence_active
    FROM cfo_leads l
    JOIN cfo_outreach_sequences s ON s.lead_id = l.id
    WHERE s.status = 'bounced' OR s.delivery_status = 'bounced'
  `);
  console.log(`1. Leads with bounced emails: ${bouncedLeads.length}`);

  const needsUpdate = bouncedLeads.filter(l => l.status !== 'bounced' || l.cadence_active !== 0);
  console.log(`   Already marked bounced: ${bouncedLeads.length - needsUpdate.length}`);
  console.log(`   Need status update: ${needsUpdate.length}`);

  if (!isDryRun && needsUpdate.length > 0) {
    for (const lead of needsUpdate) {
      run("UPDATE cfo_leads SET status = 'bounced', cadence_active = 0, updated_at = datetime('now') WHERE id = ?", [lead.id]);
    }
    console.log(`   ✓ Updated ${needsUpdate.length} leads to status=bounced, cadence_active=0`);
  }

  // 2. Find pattern-guessed emails
  const guessedEmails = all(`
    SELECT id, company_name, contact_email, enrichment_method
    FROM cfo_leads
    WHERE enrichment_method = 'pattern_guess'
      AND status NOT IN ('bounced', 'unsubscribed', 'closed_lost')
  `);
  console.log(`\n2. Pattern-guessed emails (unverified): ${guessedEmails.length}`);

  if (!isDryRun && guessedEmails.length > 0) {
    run("UPDATE cfo_leads SET enrichment_status = 'needs_mx_check' WHERE enrichment_method = 'pattern_guess' AND status NOT IN ('bounced', 'unsubscribed', 'closed_lost')");
    console.log(`   ✓ Flagged ${guessedEmails.length} for MX re-verification`);
  }

  // 3. Find generic role emails (info@, contact@, sales@, etc.)
  const genericEmails = all(`
    SELECT id, company_name, contact_email
    FROM cfo_leads
    WHERE contact_email IS NOT NULL
      AND (
        contact_email LIKE 'info@%' OR contact_email LIKE 'contact@%' OR
        contact_email LIKE 'sales@%' OR contact_email LIKE 'admin@%' OR
        contact_email LIKE 'office@%' OR contact_email LIKE 'support@%' OR
        contact_email LIKE 'hello@%' OR contact_email LIKE 'mail@%' OR
        contact_email LIKE 'general@%' OR contact_email LIKE 'team@%'
      )
      AND status NOT IN ('bounced', 'unsubscribed', 'closed_lost', 'replied')
  `);
  console.log(`\n3. Generic role emails (info@, contact@, etc.): ${genericEmails.length}`);

  // 4. Health metrics
  const total = get('SELECT COUNT(*) c FROM cfo_leads')?.c || 0;
  const withEmail = get('SELECT COUNT(*) c FROM cfo_leads WHERE contact_email IS NOT NULL')?.c || 0;
  const withTitle = get('SELECT COUNT(*) c FROM cfo_leads WHERE contact_title IS NOT NULL')?.c || 0;
  const bounced = get("SELECT COUNT(*) c FROM cfo_leads WHERE status = 'bounced'")?.c || 0;
  const active = get("SELECT COUNT(*) c FROM cfo_leads WHERE status NOT IN ('bounced', 'unsubscribed', 'closed_lost', 'dead')")?.c || 0;
  const enriched = get("SELECT COUNT(*) c FROM cfo_leads WHERE enrichment_status = 'enriched'")?.c || 0;

  console.log('\n=== LEAD DATABASE HEALTH ===');
  console.log(`  Total leads:          ${total}`);
  console.log(`  With email:           ${withEmail} (${(withEmail/total*100).toFixed(0)}%)`);
  console.log(`  With title:           ${withTitle} (${(withTitle/total*100).toFixed(0)}%)`);
  console.log(`  Enriched:             ${enriched}`);
  console.log(`  Bounced:              ${bounced}`);
  console.log(`  Active (contactable): ${active}`);
  console.log(`  Generic emails:       ${genericEmails.length}`);
  console.log(`  Pattern-guessed:      ${guessedEmails.length}`);

  if (isDryRun) {
    console.log('\n--- DRY RUN — no changes made. Run with --yes to execute. ---');
  } else {
    console.log('\n✓ Cleanup complete.');
  }
})();
