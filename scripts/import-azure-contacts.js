/**
 * Import Azure SQL contacts into ClawOps mgmt_outreach_queue
 *
 * Sources:
 *   - hoa_contacts (Azure) — 56 management company contacts with emails
 *   - mgmt_company_contacts (Azure) — 1 contact with email (Vesta)
 *
 * Skips:
 *   - Contacts already in mgmt_outreach_queue (dedup by email)
 *   - hoa_contact table (loan application contacts — Steve's own test entries)
 *
 * Run: node scripts/import-azure-contacts.js [--dry-run]
 */
require('dotenv').config({ path: '.env.local' });

const sql = require('mssql');
const path = require('path');

// Bootstrap the SQLite DB the same way the server does
process.chdir(path.join(__dirname, '..'));
const { initDatabase, run, get, all } = require('../server/db/connection');

const { buildMgmtEmail } = require('../server/services/mgmtEmailTemplate');

const DRY_RUN = process.argv.includes('--dry-run');

const azureConfig = {
  server: process.env.AZURE_SQL_SERVER,
  database: process.env.AZURE_SQL_DATABASE,
  user: process.env.AZURE_SQL_USER,
  password: process.env.AZURE_SQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: false, connectTimeout: 20000 },
};

async function main() {
  if (DRY_RUN) console.log('DRY RUN — no writes to local DB\n');

  // Must await initDatabase — sql.js is async
  await initDatabase();

  const pool = await sql.connect(azureConfig);
  console.log('✅ Connected to Azure:', process.env.AZURE_SQL_DATABASE);

  // ── Source 1: hoa_contacts (management companies with named contacts) ──
  const hoaContacts = await pool.request().query(`
    SELECT
      hoa_name       AS company_name,
      contact_person AS contact_name,
      title          AS contact_title,
      email          AS contact_email,
      management_company,
      city, state,
      unit_count,
      source_type    AS contact_type
    FROM hoa_contacts
    WHERE email IS NOT NULL AND LEN(email) > 3
      AND email NOT LIKE '%steve%'
      AND email NOT LIKE '%pilcher%'
    ORDER BY state, hoa_name
  `);
  console.log('hoa_contacts with email:', hoaContacts.recordset.length);

  // ── Source 2: mgmt_company_contacts with email (Vesta etc.) ──
  const mgmtContacts = await pool.request().query(`
    SELECT
      mc.name        AS company_name,
      mcc.full_name  AS contact_name,
      mcc.title      AS contact_title,
      mcc.email      AS contact_email,
      mc.state,
      mcc.contact_type
    FROM mgmt_company_contacts mcc
    JOIN mgmt_companies mc ON mcc.mgmt_company_id = mc.id
    WHERE mcc.email IS NOT NULL AND LEN(mcc.email) > 3
  `);
  console.log('mgmt_company_contacts with email:', mgmtContacts.recordset.length);

  await pool.close();

  // ── Combine all sources ──
  const allContacts = [
    ...hoaContacts.recordset.map(r => ({ ...r, source: 'hoa_contacts' })),
    ...mgmtContacts.recordset.map(r => ({ ...r, source: 'mgmt_company_contacts' })),
  ];

  console.log('\nTotal contacts to process:', allContacts.length);

  let added = 0;
  let skipped = 0;
  const skippedReasons = { already_queued: 0, template_error: 0, no_email: 0, duplicate_email: 0 };
  const seenEmails = new Set();

  for (const contact of allContacts) {
    const email = (contact.contact_email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      skipped++; skippedReasons.no_email++; continue;
    }

    // Dedup within this run
    if (seenEmails.has(email)) {
      skipped++; skippedReasons.duplicate_email++;
      console.log('  SKIP (dup email):', email);
      continue;
    }
    seenEmails.add(email);

    // Check if already in queue (by email)
    const existing = get('SELECT id FROM mgmt_outreach_queue WHERE contact_email = ?', [email]);
    if (existing) {
      skipped++; skippedReasons.already_queued++;
      continue;
    }

    // Build email
    try {
      const { subject, body_html, body_text } = buildMgmtEmail({
        companyName:   contact.company_name || '',
        contactName:   contact.contact_name || '',
        contactTitle:  contact.contact_title || '',
        hotCommunity:  null,
        signalIssue:   null,
        companyHealth: null,
        state:         contact.state || '',
      });

      if (!DRY_RUN) {
        run(
          `INSERT INTO mgmt_outreach_queue
            (mgmt_company_id, company_name, contact_id, contact_name, contact_email,
             contact_title, contact_type, subject, body_html, body_text,
             hot_community, signal_issue, signal_score, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
          [
            'azure-' + contact.source,   // synthetic mgmt_company_id
            contact.company_name || '',
            null,                         // no local contact id
            contact.contact_name || null,
            email,
            contact.contact_title || null,
            contact.contact_type || 'general',
            subject,
            body_html,
            body_text,
            null, null, 0,
          ]
        );
      }

      added++;
      console.log('  QUEUED:', (contact.company_name||'?').substring(0,35).padEnd(35), '→', email);
    } catch (err) {
      console.error('  TEMPLATE ERROR for', contact.company_name, ':', err.message);
      skipped++; skippedReasons.template_error++;
    }
  }

  console.log('\n=== RESULT ===');
  console.log('Added to queue:', added);
  console.log('Skipped:', skipped, JSON.stringify(skippedReasons));
  if (DRY_RUN) console.log('\n(DRY RUN — rerun without --dry-run to actually import)');
  else console.log('\nDone! Open Mgmt Research → Outreach tab → Approve All → Send All Approved');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
