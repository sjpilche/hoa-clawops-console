/**
 * Import all livempaint2004 contacts into ClawOps cfo_leads staging
 *
 * These are NSG's painting customers — property managers, HOA management
 * companies, commercial property owners — perfect leads for Jake's CFO pitch.
 *
 * Maps to cfo_leads with source='livempaint', source_agent='jake'
 * Status = 'new', enrichment_status = 'enriched' (we have email already)
 *
 * Run: node scripts/import-livempaint-contacts.js [--dry-run] [--limit=500]
 */
require('dotenv').config({ path: '.env.local' });
const sql = require('mssql');
const path = require('path');
process.chdir(path.join(__dirname, '..'));
const { initDatabase, run, get, all } = require('../server/db/connection');

const paintConfig = {
  server: 'liveempirepaint.database.windows.net',
  database: 'LIVEempirepaint2004',
  user: 'lcabarcas',
  password: '!NSGColorado00',
  options: { encrypt: true, trustServerCertificate: false, connectTimeout: 20000 },
};

const S = 'LIVEempirepaint2004';
const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1]) : 999999;

async function main() {
  if (DRY_RUN) console.log('DRY RUN — no writes\n');
  await initDatabase();

  const pool = await sql.connect(paintConfig);
  console.log('Connected to livempaint2004');

  // First, understand client types
  const clientTypeCols = await pool.request().query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA='${S}' AND TABLE_NAME='client_type' ORDER BY ORDINAL_POSITION
  `);
  console.log('client_type columns:', clientTypeCols.recordset.map(r => r.COLUMN_NAME).join(', '));

  const clientTypeRows = await pool.request().query(`SELECT * FROM [${S}].[client_type]`);
  console.log('client_type values:');
  clientTypeRows.recordset.forEach(r => console.log(' ', JSON.stringify(r)));

  // Pull all contacts with email, joined to office + client
  console.log('\nPulling contacts...');
  const contacts = await pool.request().query(`
    SELECT
      c.id AS contact_id,
      c.first_name, c.last_name, c.title, c.department, c.email,
      o.label AS office_label, o.address AS office_address, o.city, o.state, o.zip,
      cl.id AS client_id, cl.company_name, cl.type AS client_type,
      cl.website, cl.is_management_fee, cl.description
    FROM [${S}].[contact] c
    JOIN [${S}].[office] o ON c.office_id = o.id
    JOIN [${S}].[client] cl ON o.client_id = cl.id
    WHERE c.email IS NOT NULL AND LEN(c.email) > 5
      AND c.is_active = 1
      AND cl.is_active = 1
      AND c.email NOT LIKE '%test%'
      AND c.email NOT LIKE '%example%'
      AND c.email NOT LIKE '%unknown%'
      AND c.email NOT LIKE '%empirepainting%'
      AND c.email NOT LIKE '%nsgpainting%'
    ORDER BY cl.company_name, c.last_name, c.first_name
  `);
  console.log('Total contacts pulled:', contacts.recordset.length);

  await pool.close();

  // Stats before insert
  const existing = all('SELECT contact_email FROM cfo_leads WHERE source=?', ['livempaint']);
  const existingEmails = new Set(existing.map(r => r.contact_email.toLowerCase()));
  console.log('Already in cfo_leads from livempaint:', existingEmails.size);

  let added = 0, skipped = 0, dupes = 0;
  const seenEmails = new Set();

  for (const r of contacts.recordset.slice(0, LIMIT)) {
    const email = r.email.trim().toLowerCase();

    // Dedup within this run
    if (seenEmails.has(email)) { dupes++; skipped++; continue; }
    seenEmails.add(email);

    // Dedup against existing
    if (existingEmails.has(email)) { skipped++; continue; }

    const contactName = [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || null;
    const companyName = r.company_name || r.office_label || 'Unknown';

    // Score by client type
    // 1=Board, 2=General Contractor, 3=Owner, 4=Property Manager, 5=Law Firm, 6=Construction Manager
    const typeScore = { '1': 80, '4': 75, '2': 70, '6': 70, '3': 55, '5': 40 };
    const score = typeScore[String(r.client_type)] || 50;
    const typeLabel = { '1': 'HOA board member', '2': 'General Contractor', '3': 'Property Owner', '4': 'Property Manager', '5': 'Law Firm', '6': 'Construction Manager' }[String(r.client_type)] || 'contact';
    const notes = `NSG painting client — ${typeLabel}${r.is_management_fee ? ' (mgmt fee)' : ''}`;

    if (!DRY_RUN) {
      try {
        run(
          `INSERT INTO cfo_leads (
            company_name, contact_name, contact_title, contact_email,
            website, state, city,
            pilot_fit_score, pilot_fit_reason,
            enrichment_status, enrichment_method,
            source, source_agent, status, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'enriched', 'livempaint_import', 'livempaint', 'jake', 'new', ?)`,
          [
            companyName,
            contactName,
            r.title || r.department || null,
            r.email.trim(),
            r.website || null,
            r.state || null,
            r.city || null,
            score,
            notes,
            notes,
          ]
        );
        added++;
        if (added % 500 === 0) console.log('  Inserted', added, '...');
      } catch (err) {
        // likely unique constraint — skip
        skipped++;
      }
    } else {
      added++;
      if (added <= 20) {
        console.log('  WOULD ADD:', contactName?.padEnd(22), '|', companyName.substring(0,35).padEnd(35), '|', r.state, '|', email);
      }
    }
  }

  console.log('\n=== RESULT ===');
  console.log('Added to cfo_leads:', added);
  console.log('Skipped (dupes):', skipped, '(run-dupes:', dupes + ')');
  if (DRY_RUN) console.log('\n(DRY RUN — rerun without --dry-run to import)');
  else console.log('\nDone! Kill server → restart → Jake leads will appear in the CFO/Jake pipeline.');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
