/**
 * Sync livempaint2004 contacts → empcapmaster2.livempaint_leads
 *
 * Creates the table if it doesn't exist, then upserts all active contacts
 * with email. Idempotent — safe to re-run.
 *
 * Run: node scripts/sync-livempaint-to-azure.js [--dry-run]
 */
require('dotenv').config({ path: '.env.local' });
const sql = require('mssql');

const sourceConfig = {
  server: 'liveempirepaint.database.windows.net',
  database: 'LIVEempirepaint2004',
  user: 'lcabarcas',
  password: '!NSGColorado00',
  options: { encrypt: true, trustServerCertificate: false, connectTimeout: 20000 },
};

const destConfig = {
  server: process.env.AZURE_SQL_SERVER,   // empirecapital.database.windows.net
  database: process.env.AZURE_SQL_DATABASE, // empcapmaster2
  user: process.env.AZURE_SQL_USER,
  password: process.env.AZURE_SQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: false, connectTimeout: 20000 },
};

const S = 'LIVEempirepaint2004';
const DRY_RUN = process.argv.includes('--dry-run');

const CREATE_TABLE = `
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'livempaint_leads')
CREATE TABLE livempaint_leads (
  id                  INT IDENTITY(1,1) PRIMARY KEY,
  contact_id          NVARCHAR(50),
  first_name          NVARCHAR(100),
  last_name           NVARCHAR(100),
  full_name           NVARCHAR(200),
  title               NVARCHAR(200),
  department          NVARCHAR(200),
  email               NVARCHAR(255) NOT NULL,
  company_name        NVARCHAR(300),
  office_label        NVARCHAR(300),
  client_type         NVARCHAR(50),   -- Board|General Contractor|Owner|Property Manager|Law Firm|Construction Manager
  client_id           NVARCHAR(50),
  is_management_fee   BIT DEFAULT 0,
  website             NVARCHAR(500),
  city                NVARCHAR(100),
  state               NVARCHAR(10),
  zip                 NVARCHAR(20),
  pilot_fit_score     INT DEFAULT 50,
  outreach_status     NVARCHAR(50) DEFAULT 'new',  -- new|contacted|replied|unsubscribed
  source              NVARCHAR(50) DEFAULT 'livempaint',
  notes               NVARCHAR(500),
  created_at          DATETIME DEFAULT GETDATE(),
  updated_at          DATETIME DEFAULT GETDATE(),
  CONSTRAINT uq_livempaint_email UNIQUE (email)
);
`;

const TYPE_LABELS = {
  '1': 'Board',
  '2': 'General Contractor',
  '3': 'Owner',
  '4': 'Property Manager',
  '5': 'Law Firm',
  '6': 'Construction Manager',
};
const TYPE_SCORES = { '1': 80, '4': 75, '2': 70, '6': 70, '3': 55, '5': 40 };

async function main() {
  if (DRY_RUN) console.log('DRY RUN — no writes to Azure\n');

  // Connect to both
  console.log('Connecting to source (livempaint2004)...');
  const src = await sql.connect(sourceConfig);
  console.log('Connecting to dest (empcapmaster2)...');
  // Use a separate connection pool for dest
  const dest = await new sql.ConnectionPool(destConfig).connect();
  console.log('Both connected.\n');

  // Create table in dest
  if (!DRY_RUN) {
    await dest.request().query(CREATE_TABLE);
    console.log('Table livempaint_leads ensured.\n');
  }

  // Pull all active contacts from source
  console.log('Pulling contacts from livempaint2004...');
  const { recordset: contacts } = await src.request().query(`
    SELECT
      c.id AS contact_id,
      c.first_name, c.last_name, c.title, c.department, c.email,
      o.label AS office_label, o.city, o.state, o.zip,
      cl.id AS client_id, cl.company_name, cl.type AS client_type,
      cl.website, cl.is_management_fee
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
  console.log(`Pulled ${contacts.length} contacts.\n`);
  await src.close();

  // Deduplicate by email
  const seen = new Set();
  const unique = contacts.filter(r => {
    const e = r.email.trim().toLowerCase();
    if (seen.has(e)) return false;
    seen.add(e);
    return true;
  });
  console.log(`Unique emails: ${unique.length} (${contacts.length - unique.length} dupes removed)\n`);

  if (DRY_RUN) {
    console.log('Sample (first 20):');
    unique.slice(0, 20).forEach(r => {
      const name = [r.first_name, r.last_name].filter(Boolean).join(' ').padEnd(22);
      const co = (r.company_name || r.office_label || '?').substring(0, 38).padEnd(38);
      const type = TYPE_LABELS[String(r.client_type)] || '?';
      console.log(' ', name, '|', co, '|', type.padEnd(20), '|', r.email);
    });
    console.log('\n(DRY RUN — rerun without --dry-run to write to empcapmaster2)');
    await dest.close();
    return;
  }

  // Batch upsert into dest
  let inserted = 0, updated = 0, failed = 0;
  const BATCH = 100;

  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH);
    for (const r of batch) {
      try {
        const email = r.email.trim();
        const fullName = [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || null;
        const companyName = r.company_name || r.office_label || null;
        const typeStr = String(r.client_type);
        const typeLabel = TYPE_LABELS[typeStr] || null;
        const score = TYPE_SCORES[typeStr] || 50;
        const notes = `NSG painting client — ${typeLabel || 'contact'}${r.is_management_fee ? ' (mgmt fee)' : ''}`;

        const req = dest.request();
        req.input('email',         sql.NVarChar, email);
        req.input('contact_id',    sql.NVarChar, String(r.contact_id));
        req.input('first_name',    sql.NVarChar, r.first_name || null);
        req.input('last_name',     sql.NVarChar, r.last_name || null);
        req.input('full_name',     sql.NVarChar, fullName);
        req.input('title',         sql.NVarChar, r.title || null);
        req.input('department',    sql.NVarChar, r.department || null);
        req.input('company_name',  sql.NVarChar, companyName);
        req.input('office_label',  sql.NVarChar, r.office_label || null);
        req.input('client_type',   sql.NVarChar, typeLabel);
        req.input('client_id',     sql.NVarChar, String(r.client_id));
        req.input('is_mgmt_fee',   sql.Bit, r.is_management_fee ? 1 : 0);
        req.input('website',       sql.NVarChar, r.website || null);
        req.input('city',          sql.NVarChar, r.city || null);
        req.input('state',         sql.NVarChar, r.state || null);
        req.input('zip',           sql.NVarChar, r.zip || null);
        req.input('score',         sql.Int, score);
        req.input('notes',         sql.NVarChar, notes);

        const result = await req.query(`
          MERGE livempaint_leads AS target
          USING (SELECT @email AS email) AS source ON target.email = source.email
          WHEN MATCHED THEN UPDATE SET
            first_name = @first_name, last_name = @last_name, full_name = @full_name,
            title = @title, company_name = @company_name, client_type = @client_type,
            updated_at = GETDATE()
          WHEN NOT MATCHED THEN INSERT (
            contact_id, first_name, last_name, full_name, title, department, email,
            company_name, office_label, client_type, client_id, is_management_fee,
            website, city, state, zip, pilot_fit_score, notes
          ) VALUES (
            @contact_id, @first_name, @last_name, @full_name, @title, @department, @email,
            @company_name, @office_label, @client_type, @client_id, @is_mgmt_fee,
            @website, @city, @state, @zip, @score, @notes
          );
        `);
        if (result.rowsAffected[0] > 0) inserted++;
      } catch (e) {
        failed++;
        if (failed <= 5) console.error('  Insert error:', e.message.substring(0, 100));
      }
    }
    if ((i + BATCH) % 1000 === 0 || i + BATCH >= unique.length) {
      console.log(`  Progress: ${Math.min(i + BATCH, unique.length)}/${unique.length} processed, ${inserted} upserted, ${failed} failed`);
    }
  }

  // Final stats
  const countRes = await dest.request().query(`SELECT COUNT(*) AS n, SUM(CASE WHEN outreach_status='new' THEN 1 ELSE 0 END) AS new_count FROM livempaint_leads`);
  console.log('\n=== RESULT ===');
  console.log('Upserted:', inserted);
  console.log('Failed:', failed);
  console.log('Total in livempaint_leads table:', countRes.recordset[0].n);
  console.log('Status=new (ready to contact):', countRes.recordset[0].new_count);

  // Breakdown by client type
  const breakdown = await dest.request().query(`
    SELECT client_type, COUNT(*) AS n, SUM(pilot_fit_score) / COUNT(*) AS avg_score
    FROM livempaint_leads GROUP BY client_type ORDER BY n DESC
  `);
  console.log('\nBy type:');
  breakdown.recordset.forEach(r => console.log(' ', String(r.client_type||'?').padEnd(25), 'n=' + r.n, 'avg_score=' + r.avg_score));

  await dest.close();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
