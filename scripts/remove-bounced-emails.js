/**
 * remove-bounced-emails.js
 *
 * Reads SendGrid suppression_bounces.csv and marks/removes all bounced emails
 * across every table in clawops.db that stores email addresses.
 *
 * Usage:
 *   node scripts/remove-bounced-emails.js [--dry-run] [--delete]
 *
 * Flags:
 *   --dry-run   Show what would change without touching the DB
 *   --delete    Hard-delete from cfo_leads + email_prospects instead of marking bounced
 */

'use strict';

const fs        = require('fs');
const path      = require('path');
const initSqlJs = require('sql.js');

const DRY_RUN = process.argv.includes('--dry-run');
const DELETE  = process.argv.includes('--delete');

const DB_PATH  = path.resolve(__dirname, '../data/clawops.db');
const CSV_PATH = 'C:/Users/SPilcher/Downloads/suppression_bounces.csv';

// ── CSV Parser ────────────────────────────────────────────────────────────────
function parseCSV(filePath) {
  const raw   = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split('\n');
  const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
  const emailIdx = header.indexOf('email');
  if (emailIdx === -1) throw new Error('No "email" column found in CSV');

  const emails = new Set();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Parse CSV fields respecting quoted commas
    const cols = [];
    let inQuote = false, cur = '';
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === ',' && !inQuote) { cols.push(cur); cur = ''; }
      else { cur += ch; }
    }
    cols.push(cur);
    const email = cols[emailIdx]?.toLowerCase().trim().replace(/"/g, '');
    if (email && email.includes('@')) emails.add(email);
  }
  return emails;
}

// ── sql.js query helpers ──────────────────────────────────────────────────────
function dbRun(db, sql, params = []) {
  if (DRY_RUN) return 0;
  db.run(sql, params);
  return db.getRowsModified();
}

function dbGet(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const result = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return result;
}

// Count how many rows in a table match the bounced email list (for reporting)
function countMatches(db, table, emailCol, chunk) {
  const ph  = chunk.map(() => '?').join(',');
  const row = dbGet(db, `SELECT COUNT(*) AS c FROM ${table} WHERE LOWER(${emailCol}) IN (${ph})`, chunk);
  return row?.c || 0;
}

function reportLine(label, count, action) {
  const icon = count > 0 ? '  ✅' : '  ➖';
  console.log(`${icon} ${label}: ${count} records${count > 0 ? ` → ${action}` : ''}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (DRY_RUN) console.log('\n🔍 DRY RUN — no changes will be made\n');
  if (DELETE)  console.log('\n⚠️  DELETE mode — hard deleting from cfo_leads + email_prospects\n');

  console.log(`Loading bounced emails from:\n  ${CSV_PATH}\n`);
  const emails = parseCSV(CSV_PATH);
  console.log(`📋 ${emails.size} unique bounced emails loaded\n`);

  // Load DB
  const SQL    = await initSqlJs();
  const buffer = fs.readFileSync(DB_PATH);
  const db     = new SQL.Database(buffer);

  const emailList = [...emails].map(e => e.toLowerCase());

  // Chunk into groups of 900 (SQLite IN() limit is ~999)
  const chunks = [];
  for (let i = 0; i < emailList.length; i += 900) {
    chunks.push(emailList.slice(i, i + 900));
  }

  const totals = {
    cfo_leads: 0,
    cfo_sequences: 0,
    email_prospects: 0,
    hoa_contacts: 0,
    mgmt_outreach_queue: 0,
    referral_partners: 0,
    podcasts: 0,
    webinar_registrants: 0,
  };

  for (const chunk of chunks) {
    const ph   = chunk.map(() => '?').join(',');
    const args = chunk;

    // 1. cfo_leads
    if (DELETE) {
      totals.cfo_leads += dbRun(db,
        `DELETE FROM cfo_leads WHERE LOWER(contact_email) IN (${ph})`,
        args
      );
    } else {
      totals.cfo_leads += dbRun(db,
        `UPDATE cfo_leads
         SET status='bounced', enrichment_status='failed', updated_at=datetime('now')
         WHERE LOWER(contact_email) IN (${ph})
           AND status NOT IN ('bounced','unsubscribed')`,
        args
      );
    }

    // 2. cfo_outreach_sequences (via cfo_leads join — mark pending/draft sequences bounced)
    totals.cfo_sequences += dbRun(db,
      `UPDATE cfo_outreach_sequences
       SET status='bounced'
       WHERE lead_id IN (
         SELECT id FROM cfo_leads WHERE LOWER(contact_email) IN (${ph})
       )
       AND status NOT IN ('bounced','replied')`,
      args
    );

    // 3. email_prospects (no updated_at column)
    if (DELETE) {
      totals.email_prospects += dbRun(db,
        `DELETE FROM email_prospects WHERE LOWER(email) IN (${ph})`,
        args
      );
    } else {
      totals.email_prospects += dbRun(db,
        `UPDATE email_prospects
         SET status='disqualified'
         WHERE LOWER(email) IN (${ph})
           AND status != 'disqualified'`,
        args
      );
    }

    // 4. hoa_contacts
    totals.hoa_contacts += dbRun(db,
      `UPDATE hoa_contacts
       SET status='disqualified', updated_at=datetime('now')
       WHERE LOWER(email) IN (${ph})
         AND status != 'disqualified'`,
      args
    );

    // 5. mgmt_outreach_queue
    totals.mgmt_outreach_queue += dbRun(db,
      `UPDATE mgmt_outreach_queue
       SET status='failed', updated_at=datetime('now')
       WHERE LOWER(contact_email) IN (${ph})
         AND status NOT IN ('failed','sent')`,
      args
    );

    // 6. referral_partners — clear bad email (no updated_at column)
    totals.referral_partners += dbRun(db,
      `UPDATE referral_partners
       SET contact_email=NULL
       WHERE LOWER(contact_email) IN (${ph})`,
      args
    );

    // 7. podcasts — clear bad email (no updated_at column)
    totals.podcasts += dbRun(db,
      `UPDATE podcasts
       SET contact_email=NULL
       WHERE LOWER(contact_email) IN (${ph})`,
      args
    );

    // 8. webinar_registrants — count only (no status column to update)
    totals.webinar_registrants += countMatches(db, 'webinar_registrants', 'email', chunk);
  }

  // Save changes to disk
  if (!DRY_RUN) {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  }

  // ── Report ─────────────────────────────────────────────────────────────────
  console.log('─'.repeat(60));
  console.log(`Results ${DRY_RUN ? '(DRY RUN — nothing changed)' : '(applied)'}:\n`);

  const cfoAction      = DELETE ? 'hard deleted' : "status='bounced'";
  const prospectAction = DELETE ? 'hard deleted' : "status='disqualified'";

  reportLine('cfo_leads',             totals.cfo_leads,            cfoAction);
  reportLine('cfo_outreach_sequences', totals.cfo_sequences,       "status='bounced'");
  reportLine('email_prospects',        totals.email_prospects,      prospectAction);
  reportLine('hoa_contacts',           totals.hoa_contacts,         "status='disqualified'");
  reportLine('mgmt_outreach_queue',    totals.mgmt_outreach_queue,  "status='failed'");
  reportLine('referral_partners',      totals.referral_partners,    'email cleared');
  reportLine('podcasts',               totals.podcasts,             'email cleared');

  if (totals.webinar_registrants > 0) {
    console.log(`  ℹ️  webinar_registrants: ${totals.webinar_registrants} matches (no status column — manual review)`);
  } else {
    console.log(`  ➖ webinar_registrants: 0 matches`);
  }

  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  console.log('\n' + '─'.repeat(60));
  console.log(`Total records affected: ${total}`);
  if (DRY_RUN) console.log(`\n👆 Run without --dry-run to apply changes.`);
  else         console.log(`\n✅ Done. Bounced emails suppressed — they won't be targeted in future sends.`);

  db.close();
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
