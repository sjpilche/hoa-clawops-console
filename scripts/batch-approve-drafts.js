#!/usr/bin/env node
/**
 * batch-approve-drafts.js — Unblock the outreach pipeline
 *
 * Moves draft outreach sequences to 'approved' so the 10 AM sender can pick them up.
 * Also cleans up zombie runs (stuck 'running' or 'pending' for too long).
 *
 * Usage:
 *   node scripts/batch-approve-drafts.js --dry-run          # Preview only
 *   node scripts/batch-approve-drafts.js                    # Approve drafts
 *   node scripts/batch-approve-drafts.js --clean-zombies    # Also clean zombie runs
 *   node scripts/batch-approve-drafts.js --yes              # Skip confirmation prompt
 */

const { initDatabase, all, run, get } = require('../server/db/connection');
const readline = require('readline');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const CLEAN_ZOMBIES = args.includes('--clean-zombies');
const SKIP_CONFIRM = args.includes('--yes');

async function confirm(msg) {
  if (SKIP_CONFIRM || DRY_RUN) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(`${msg} (y/N) `, answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

async function main() {
  await initDatabase();
  console.log(DRY_RUN ? '\n=== DRY RUN (no changes) ===' : '\n=== BATCH APPROVE DRAFTS ===');

  // ── 1. Count draft sequences by status ─────────────────────────────────────
  const statusCounts = all(`
    SELECT status, qa_status, COUNT(*) as cnt
    FROM cfo_outreach_sequences
    WHERE status IN ('draft', 'flagged')
    GROUP BY status, qa_status
    ORDER BY status, qa_status
  `);
  console.log('\nCurrent draft/flagged breakdown:');
  statusCounts.forEach(r => console.log(`  status=${r.status}, qa_status=${r.qa_status || 'NULL'} → ${r.cnt}`));

  // ── 2. Find approvable drafts ──────────────────────────────────────────────
  // Approve drafts where QA passed or was never run (NULL), skip failed/flagged
  const approvable = all(`
    SELECT s.id, s.lead_id, l.company_name, l.contact_email
    FROM cfo_outreach_sequences s
    LEFT JOIN cfo_leads l ON l.id = s.lead_id
    WHERE s.status = 'draft'
      AND (s.qa_status IS NULL OR s.qa_status = 'passed' OR s.qa_status = '')
      AND l.contact_email IS NOT NULL AND l.contact_email != ''
  `);

  const skippedNoEmail = all(`
    SELECT COUNT(*) as cnt FROM cfo_outreach_sequences s
    LEFT JOIN cfo_leads l ON l.id = s.lead_id
    WHERE s.status = 'draft'
      AND (l.contact_email IS NULL OR l.contact_email = '')
  `)?.cnt || 0;

  const skippedFailed = all(`
    SELECT COUNT(*) as cnt FROM cfo_outreach_sequences
    WHERE status IN ('draft', 'flagged')
      AND qa_status = 'failed'
  `)?.[0]?.cnt || 0;

  const skippedFlagged = all(`
    SELECT COUNT(*) as cnt FROM cfo_outreach_sequences
    WHERE status = 'flagged'
  `)?.[0]?.cnt || 0;

  console.log(`\nApprovable drafts: ${approvable.length}`);
  console.log(`Skipped (no email): ${skippedNoEmail}`);
  console.log(`Skipped (QA failed): ${skippedFailed}`);
  console.log(`Skipped (flagged): ${skippedFlagged}`);

  if (approvable.length > 0 && !DRY_RUN) {
    const ok = await confirm(`\nApprove ${approvable.length} draft sequences?`);
    if (ok) {
      const result = run(`
        UPDATE cfo_outreach_sequences
        SET status = 'approved'
        WHERE status = 'draft'
          AND (qa_status IS NULL OR qa_status = 'passed' OR qa_status = '')
          AND lead_id IN (
            SELECT id FROM cfo_leads WHERE contact_email IS NOT NULL AND contact_email != ''
          )
      `);
      console.log(`Approved ${result.changes} sequences.`);
    } else {
      console.log('Skipped.');
    }
  }

  // ── 3. Clean zombie runs ───────────────────────────────────────────────────
  if (CLEAN_ZOMBIES || DRY_RUN) {
    console.log('\n=== ZOMBIE RUN CLEANUP ===');

    const staleRunning = all(`
      SELECT r.id, a.name as agent_name, r.created_at, r.started_at
      FROM runs r
      LEFT JOIN agents a ON a.id = r.agent_id
      WHERE r.status = 'running'
        AND r.created_at < datetime('now', '-2 hours')
    `);
    console.log(`Stuck 'running' (>2h): ${staleRunning.length}`);
    staleRunning.forEach(r => console.log(`  ${r.agent_name || 'unknown'} — created ${r.created_at}`));

    const stalePending = all(`
      SELECT r.id, a.name as agent_name, r.created_at, r.trigger
      FROM runs r
      LEFT JOIN agents a ON a.id = r.agent_id
      WHERE r.status = 'pending'
        AND r.created_at < datetime('now', '-24 hours')
    `);
    console.log(`Stuck 'pending' (>24h): ${stalePending.length}`);
    stalePending.forEach(r => console.log(`  ${r.agent_name || 'unknown'} — trigger=${r.trigger} created ${r.created_at}`));

    if (!DRY_RUN && (staleRunning.length > 0 || stalePending.length > 0)) {
      const ok = await confirm(`\nClean up ${staleRunning.length} stale running + ${stalePending.length} stale pending runs?`);
      if (ok) {
        const r1 = run(`
          UPDATE runs SET status = 'failed', error_msg = 'Stale run: no update after 2+ hours', completed_at = datetime('now'), updated_at = datetime('now')
          WHERE status = 'running' AND created_at < datetime('now', '-2 hours')
        `);
        const r2 = run(`
          UPDATE runs SET status = 'failed', error_msg = 'Abandoned: pending for 24+ hours', completed_at = datetime('now'), updated_at = datetime('now')
          WHERE status = 'pending' AND created_at < datetime('now', '-24 hours')
        `);
        console.log(`Cleaned: ${r1.changes} stale running, ${r2.changes} stale pending.`);

        // Reset agent status for any that are stuck in 'running' state
        run(`UPDATE agents SET status = 'idle', updated_at = datetime('now') WHERE status = 'running'`);
        console.log('Reset stuck agent statuses to idle.');
      }
    }
  }

  console.log('\nDone.');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
