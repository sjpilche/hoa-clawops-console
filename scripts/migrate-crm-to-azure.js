#!/usr/bin/env node
/**
 * migrate-crm-to-azure.js — Create CRM schema in Azure SQL and migrate data from SQLite
 *
 * Usage:
 *   node scripts/migrate-crm-to-azure.js --schema       # Create tables only
 *   node scripts/migrate-crm-to-azure.js --migrate       # Migrate data (creates schema first)
 *   node scripts/migrate-crm-to-azure.js --dry-run       # Show counts, don't write
 *   node scripts/migrate-crm-to-azure.js --verify        # Compare row counts
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
const sql = require('mssql');
const { initDatabase, all, get } = require('../server/db/connection');

const args = process.argv.slice(2);
const SCHEMA_ONLY = args.includes('--schema');
const MIGRATE = args.includes('--migrate');
const DRY_RUN = args.includes('--dry-run');
const VERIFY = args.includes('--verify');

const config = {
  server: process.env.AZURE_SQL_SERVER,
  database: process.env.AZURE_SQL_DATABASE,
  user: process.env.AZURE_SQL_USER,
  password: process.env.AZURE_SQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: false, connectTimeout: 30000 },
  pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
};

// ═══════════════════════════════════════════════════════════════════════════
// SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

const SCHEMA_SQL = `
-- CRM Leads — unified multi-domain lead table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='crm_leads' AND xtype='U')
CREATE TABLE crm_leads (
  id INT IDENTITY(1,1) PRIMARY KEY,
  old_id INT NULL,
  domain VARCHAR(20) NOT NULL DEFAULT 'jake',
  company_name NVARCHAR(255) NOT NULL,
  erp_type VARCHAR(50) NULL,
  revenue_range VARCHAR(50) NULL,
  employee_count INT NULL,
  contact_name NVARCHAR(200) NULL,
  contact_title NVARCHAR(200) NULL,
  contact_email VARCHAR(255) NULL,
  contact_linkedin VARCHAR(500) NULL,
  website VARCHAR(500) NULL,
  state VARCHAR(10) NULL,
  city NVARCHAR(100) NULL,
  phone VARCHAR(50) NULL,
  pilot_fit_score INT DEFAULT 0,
  pilot_fit_reason NVARCHAR(MAX) NULL,
  status VARCHAR(30) DEFAULT 'new',
  source VARCHAR(50) NULL,
  source_agent VARCHAR(30) DEFAULT 'jake',
  notes NVARCHAR(MAX) NULL,
  enrichment_status VARCHAR(30) DEFAULT 'pending',
  enrichment_method VARCHAR(50) NULL,
  enriched_at DATETIME2 NULL,
  urgency_score INT DEFAULT 0,
  urgency_signals NVARCHAR(MAX) NULL,
  urgency_updated_at DATETIME2 NULL,
  dossier NVARCHAR(MAX) NULL,
  dossier_generated_at DATETIME2 NULL,
  dossier_version INT DEFAULT 1,
  pipeline_stage VARCHAR(30) DEFAULT 'New',
  stage_entered_at DATETIME2 NULL,
  days_in_stage INT DEFAULT 0,
  next_action NVARCHAR(500) NULL,
  next_action_due DATETIME2 NULL,
  stalled BIT DEFAULT 0,
  last_touch_number INT DEFAULT 0,
  cadence_active BIT DEFAULT 0,
  next_touch_due DATETIME2 NULL,
  deal_value_cents INT NULL,
  deal_closed_at DATETIME2 NULL,
  deal_closed_by VARCHAR(100) NULL,
  revenue_stage VARCHAR(30) DEFAULT 'discovered',
  revenue_stage_changed_at DATETIME2 NULL,
  days_to_first_reply INT NULL,
  days_to_close INT NULL,
  attributed_sequence_id INT NULL,
  attributed_touch_number INT NULL,
  engagement_score INT DEFAULT 0,
  last_engaged_at DATETIME2 NULL,
  attribution_source VARCHAR(100) NULL,
  close_value_cents INT DEFAULT 0,
  workspace_id INT NULL,
  created_at DATETIME2 DEFAULT GETUTCDATE(),
  updated_at DATETIME2 DEFAULT GETUTCDATE()
);

-- Indexes for crm_leads
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_crm_leads_domain')
  CREATE INDEX idx_crm_leads_domain ON crm_leads(domain);
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_crm_leads_status')
  CREATE INDEX idx_crm_leads_status ON crm_leads(status);
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_crm_leads_enrichment')
  CREATE INDEX idx_crm_leads_enrichment ON crm_leads(enrichment_status);
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_crm_leads_email')
  CREATE INDEX idx_crm_leads_email ON crm_leads(contact_email);
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_crm_leads_source_agent')
  CREATE INDEX idx_crm_leads_source_agent ON crm_leads(source_agent);
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_crm_leads_domain_status')
  CREATE INDEX idx_crm_leads_domain_status ON crm_leads(domain, status);


-- CRM Outreach Sequences
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='crm_outreach_sequences' AND xtype='U')
CREATE TABLE crm_outreach_sequences (
  id INT IDENTITY(1,1) PRIMARY KEY,
  old_id INT NULL,
  lead_id INT NOT NULL,
  domain VARCHAR(20) NOT NULL DEFAULT 'jake',
  sequence_type VARCHAR(30) DEFAULT 'blitz',
  email_subject NVARCHAR(500) NULL,
  email_body NVARCHAR(MAX) NULL,
  pilot_offer VARCHAR(100) NULL,
  status VARCHAR(30) DEFAULT 'draft',
  sent_at DATETIME2 NULL,
  replied_at DATETIME2 NULL,
  source_agent VARCHAR(30) DEFAULT 'jake',
  delivery_status VARCHAR(30) NULL,
  delivery_error NVARCHAR(500) NULL,
  sequence_position INT DEFAULT 1,
  qa_status VARCHAR(30) NULL,
  qa_score INT NULL,
  qa_notes NVARCHAR(MAX) NULL,
  qa_reviewed_at DATETIME2 NULL,
  workspace_id INT NULL,
  auto_approval_decision VARCHAR(30) NULL,
  auto_approval_reason NVARCHAR(500) NULL,
  auto_approved_at DATETIME2 NULL,
  source_run_id VARCHAR(100) NULL,
  created_at DATETIME2 DEFAULT GETUTCDATE()
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_crm_seq_lead')
  CREATE INDEX idx_crm_seq_lead ON crm_outreach_sequences(lead_id);
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_crm_seq_status')
  CREATE INDEX idx_crm_seq_status ON crm_outreach_sequences(status);
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_crm_seq_domain')
  CREATE INDEX idx_crm_seq_domain ON crm_outreach_sequences(domain);
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_crm_seq_source_agent')
  CREATE INDEX idx_crm_seq_source_agent ON crm_outreach_sequences(source_agent);


-- CRM Cadence Touches
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='crm_cadence_touches' AND xtype='U')
CREATE TABLE crm_cadence_touches (
  id INT IDENTITY(1,1) PRIMARY KEY,
  old_id INT NULL,
  lead_id INT NOT NULL,
  domain VARCHAR(20) NOT NULL DEFAULT 'jake',
  product VARCHAR(30) NOT NULL,
  touch_number INT NOT NULL,
  channel VARCHAR(30) DEFAULT 'email',
  sent_at DATETIME2 NULL,
  opened_at DATETIME2 NULL,
  replied_at DATETIME2 NULL,
  status VARCHAR(30) DEFAULT 'pending',
  variant NVARCHAR(200) NULL,
  rationale NVARCHAR(MAX) NULL,
  run_id VARCHAR(100) NULL,
  updated_at DATETIME2 DEFAULT GETUTCDATE()
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_crm_touch_lead')
  CREATE INDEX idx_crm_touch_lead ON crm_cadence_touches(lead_id);


-- CRM Content Pieces
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='crm_content_pieces' AND xtype='U')
CREATE TABLE crm_content_pieces (
  id INT IDENTITY(1,1) PRIMARY KEY,
  old_id INT NULL,
  domain VARCHAR(20) NOT NULL DEFAULT 'jake',
  pillar VARCHAR(50) NULL,
  channel VARCHAR(50) NULL,
  title NVARCHAR(500) NULL,
  content_markdown NVARCHAR(MAX) NULL,
  cta NVARCHAR(500) NULL,
  status VARCHAR(30) DEFAULT 'draft',
  published_at DATETIME2 NULL,
  source_agent VARCHAR(30) DEFAULT 'jake',
  performance_score INT NULL,
  leads_generated INT DEFAULT 0,
  email_clicks INT DEFAULT 0,
  social_shares INT DEFAULT 0,
  newsletter_clicks INT DEFAULT 0,
  page_views INT DEFAULT 0,
  scored_at DATETIME2 NULL,
  target_keyword NVARCHAR(200) NULL,
  calendar_id INT NULL,
  qa_status VARCHAR(30) NULL,
  qa_score INT NULL,
  qa_notes NVARCHAR(MAX) NULL,
  qa_reviewed_at DATETIME2 NULL,
  workspace_id INT NULL,
  created_at DATETIME2 DEFAULT GETUTCDATE()
);


-- ID mapping table for foreign key resolution
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='crm_id_map' AND xtype='U')
CREATE TABLE crm_id_map (
  table_name VARCHAR(50) NOT NULL,
  old_id INT NOT NULL,
  new_id INT NOT NULL,
  PRIMARY KEY (table_name, old_id)
);
`;

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function domainFromSourceAgent(sourceAgent) {
  const map = { jake: 'jake', hoa: 'hoa', owen: 'owen', cfo: 'jake', 'data-rehab': 'data-rehab', data_rehab: 'data-rehab' };
  return map[sourceAgent] || 'jake';
}

function parseDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

// ═══════════════════════════════════════════════════════════════════════════
// MIGRATION
// ═══════════════════════════════════════════════════════════════════════════

async function migrateLeads(pool) {
  const rows = all('SELECT * FROM cfo_leads ORDER BY id');
  console.log(`  cfo_leads: ${rows.length} rows to migrate`);
  if (DRY_RUN) return;

  // Clear existing data for clean migration
  await pool.request().query('DELETE FROM crm_id_map WHERE table_name = \'crm_leads\'');

  let migrated = 0;
  for (const r of rows) {
    try {
      const result = await pool.request()
        .input('old_id', sql.Int, r.id)
        .input('domain', sql.VarChar, domainFromSourceAgent(r.source_agent))
        .input('company_name', sql.NVarChar, r.company_name)
        .input('erp_type', sql.VarChar, r.erp_type)
        .input('revenue_range', sql.VarChar, r.revenue_range)
        .input('employee_count', sql.Int, r.employee_count)
        .input('contact_name', sql.NVarChar, r.contact_name)
        .input('contact_title', sql.NVarChar, r.contact_title)
        .input('contact_email', sql.VarChar, r.contact_email)
        .input('contact_linkedin', sql.VarChar, r.contact_linkedin)
        .input('website', sql.VarChar, r.website)
        .input('state', sql.VarChar, r.state)
        .input('city', sql.NVarChar, r.city)
        .input('phone', sql.VarChar, r.phone)
        .input('pilot_fit_score', sql.Int, r.pilot_fit_score || 0)
        .input('pilot_fit_reason', sql.NVarChar, r.pilot_fit_reason)
        .input('status', sql.VarChar, r.status || 'new')
        .input('source', sql.VarChar, r.source)
        .input('source_agent', sql.VarChar, r.source_agent || 'jake')
        .input('notes', sql.NVarChar, r.notes)
        .input('enrichment_status', sql.VarChar, r.enrichment_status || 'pending')
        .input('enrichment_method', sql.VarChar, r.enrichment_method)
        .input('enriched_at', sql.DateTime2, parseDate(r.enriched_at))
        .input('urgency_score', sql.Int, r.urgency_score || 0)
        .input('cadence_active', sql.Bit, r.cadence_active ? 1 : 0)
        .input('last_touch_number', sql.Int, r.last_touch_number || 0)
        .input('next_touch_due', sql.DateTime2, parseDate(r.next_touch_due))
        .input('engagement_score', sql.Int, r.engagement_score || 0)
        .input('revenue_stage', sql.VarChar, r.revenue_stage || 'discovered')
        .input('pipeline_stage', sql.VarChar, r.pipeline_stage || 'New')
        .input('workspace_id', sql.Int, r.workspace_id)
        .input('created_at', sql.DateTime2, parseDate(r.created_at) || new Date())
        .input('updated_at', sql.DateTime2, parseDate(r.updated_at) || new Date())
        .query(`INSERT INTO crm_leads (old_id, domain, company_name, erp_type, revenue_range, employee_count,
          contact_name, contact_title, contact_email, contact_linkedin, website, state, city, phone,
          pilot_fit_score, pilot_fit_reason, status, source, source_agent, notes,
          enrichment_status, enrichment_method, enriched_at, urgency_score, cadence_active,
          last_touch_number, next_touch_due, engagement_score, revenue_stage, pipeline_stage,
          workspace_id, created_at, updated_at)
        OUTPUT INSERTED.id
        VALUES (@old_id, @domain, @company_name, @erp_type, @revenue_range, @employee_count,
          @contact_name, @contact_title, @contact_email, @contact_linkedin, @website, @state, @city, @phone,
          @pilot_fit_score, @pilot_fit_reason, @status, @source, @source_agent, @notes,
          @enrichment_status, @enrichment_method, @enriched_at, @urgency_score, @cadence_active,
          @last_touch_number, @next_touch_due, @engagement_score, @revenue_stage, @pipeline_stage,
          @workspace_id, @created_at, @updated_at)`);

      const newId = result.recordset[0].id;
      await pool.request()
        .input('old_id', sql.Int, r.id)
        .input('new_id', sql.Int, newId)
        .query("INSERT INTO crm_id_map (table_name, old_id, new_id) VALUES ('crm_leads', @old_id, @new_id)");

      migrated++;
      if (migrated % 500 === 0) console.log(`    ...${migrated}/${rows.length}`);
    } catch (err) {
      console.error(`  Error migrating lead ${r.id} (${r.company_name}): ${err.message}`);
    }
  }
  console.log(`  Migrated ${migrated}/${rows.length} leads`);
}

async function migrateSequences(pool) {
  const rows = all('SELECT * FROM cfo_outreach_sequences ORDER BY id');
  console.log(`  cfo_outreach_sequences: ${rows.length} rows to migrate`);
  if (DRY_RUN) return;

  let migrated = 0;
  for (const r of rows) {
    try {
      // Resolve lead_id to new Azure ID
      const mapped = await pool.request()
        .input('old_id', sql.Int, r.lead_id)
        .query("SELECT new_id FROM crm_id_map WHERE table_name = 'crm_leads' AND old_id = @old_id");
      const newLeadId = mapped.recordset[0]?.new_id;
      if (!newLeadId) continue; // Skip orphaned sequences

      await pool.request()
        .input('old_id', sql.Int, r.id)
        .input('lead_id', sql.Int, newLeadId)
        .input('domain', sql.VarChar, domainFromSourceAgent(r.source_agent))
        .input('sequence_type', sql.VarChar, r.sequence_type || 'blitz')
        .input('email_subject', sql.NVarChar, r.email_subject)
        .input('email_body', sql.NVarChar, r.email_body)
        .input('pilot_offer', sql.VarChar, r.pilot_offer)
        .input('status', sql.VarChar, r.status || 'draft')
        .input('sent_at', sql.DateTime2, parseDate(r.sent_at))
        .input('replied_at', sql.DateTime2, parseDate(r.replied_at))
        .input('source_agent', sql.VarChar, r.source_agent || 'jake')
        .input('delivery_status', sql.VarChar, r.delivery_status)
        .input('sequence_position', sql.Int, r.sequence_position || 1)
        .input('qa_status', sql.VarChar, r.qa_status)
        .input('qa_score', sql.Int, r.qa_score)
        .input('source_run_id', sql.VarChar, r.source_run_id)
        .input('workspace_id', sql.Int, r.workspace_id)
        .input('created_at', sql.DateTime2, parseDate(r.created_at) || new Date())
        .query(`INSERT INTO crm_outreach_sequences (old_id, lead_id, domain, sequence_type, email_subject,
          email_body, pilot_offer, status, sent_at, replied_at, source_agent, delivery_status,
          sequence_position, qa_status, qa_score, source_run_id, workspace_id, created_at)
        VALUES (@old_id, @lead_id, @domain, @sequence_type, @email_subject,
          @email_body, @pilot_offer, @status, @sent_at, @replied_at, @source_agent, @delivery_status,
          @sequence_position, @qa_status, @qa_score, @source_run_id, @workspace_id, @created_at)`);

      migrated++;
      if (migrated % 2000 === 0) console.log(`    ...${migrated}/${rows.length}`);
    } catch (err) {
      console.error(`  Error migrating sequence ${r.id}: ${err.message}`);
    }
  }
  console.log(`  Migrated ${migrated}/${rows.length} sequences`);
}

async function migrateTouches(pool) {
  const rows = all('SELECT * FROM cadence_touches ORDER BY id');
  console.log(`  cadence_touches: ${rows.length} rows to migrate`);
  if (DRY_RUN) return;

  let migrated = 0;
  for (const r of rows) {
    try {
      const mapped = await pool.request()
        .input('old_id', sql.Int, r.lead_id)
        .query("SELECT new_id FROM crm_id_map WHERE table_name = 'crm_leads' AND old_id = @old_id");
      const newLeadId = mapped.recordset[0]?.new_id;
      if (!newLeadId) continue;

      await pool.request()
        .input('old_id', sql.Int, r.id)
        .input('lead_id', sql.Int, newLeadId)
        .input('domain', sql.VarChar, domainFromSourceAgent(r.product))
        .input('product', sql.VarChar, r.product)
        .input('touch_number', sql.Int, r.touch_number)
        .input('channel', sql.VarChar, r.channel || 'email')
        .input('sent_at', sql.DateTime2, parseDate(r.sent_at))
        .input('status', sql.VarChar, r.status || 'pending')
        .input('variant', sql.NVarChar, r.variant)
        .input('rationale', sql.NVarChar, r.rationale)
        .input('run_id', sql.VarChar, r.run_id)
        .query(`INSERT INTO crm_cadence_touches (old_id, lead_id, domain, product, touch_number, channel,
          sent_at, status, variant, rationale, run_id)
        VALUES (@old_id, @lead_id, @domain, @product, @touch_number, @channel,
          @sent_at, @status, @variant, @rationale, @run_id)`);
      migrated++;
    } catch (err) {
      console.error(`  Error migrating touch ${r.id}: ${err.message}`);
    }
  }
  console.log(`  Migrated ${migrated}/${rows.length} touches`);
}

async function verify(pool) {
  const azureLeads = await pool.request().query('SELECT COUNT(*) as cnt FROM crm_leads');
  const azureSeqs = await pool.request().query('SELECT COUNT(*) as cnt FROM crm_outreach_sequences');
  const azureTouches = await pool.request().query('SELECT COUNT(*) as cnt FROM crm_cadence_touches');

  const sqliteLeads = get('SELECT COUNT(*) as c FROM cfo_leads')?.c || 0;
  const sqliteSeqs = get('SELECT COUNT(*) as c FROM cfo_outreach_sequences')?.c || 0;
  const sqliteTouches = get('SELECT COUNT(*) as c FROM cadence_touches')?.c || 0;

  console.log('\n=== VERIFICATION ===');
  console.log(`  Leads:     SQLite=${sqliteLeads} → Azure=${azureLeads.recordset[0].cnt}`);
  console.log(`  Sequences: SQLite=${sqliteSeqs} → Azure=${azureSeqs.recordset[0].cnt}`);
  console.log(`  Touches:   SQLite=${sqliteTouches} → Azure=${azureTouches.recordset[0].cnt}`);

  // Domain breakdown
  const domainCounts = await pool.request().query('SELECT domain, COUNT(*) as cnt FROM crm_leads GROUP BY domain ORDER BY cnt DESC');
  console.log('\n  Azure CRM leads by domain:');
  domainCounts.recordset.forEach(r => console.log(`    ${r.domain}: ${r.cnt}`));
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  await initDatabase();

  if (!config.server || !config.database) {
    console.error('Missing AZURE_SQL_* environment variables. Check .env.local');
    process.exit(1);
  }

  console.log(`Connecting to Azure SQL: ${config.server}/${config.database}...`);
  const pool = await sql.connect(config);
  console.log('Connected.\n');

  if (SCHEMA_ONLY || MIGRATE || DRY_RUN) {
    console.log('=== CREATING SCHEMA ===');
    // Execute schema statements one by one (SQL Server doesn't like batch GO-separated statements via mssql)
    const statements = SCHEMA_SQL.split(';').filter(s => s.trim().length > 5);
    for (const stmt of statements) {
      try {
        await pool.request().query(stmt);
      } catch (err) {
        // Ignore "already exists" errors
        if (!err.message.includes('already') && !err.message.includes('duplicate')) {
          console.warn(`  Schema warning: ${err.message.substring(0, 100)}`);
        }
      }
    }
    console.log('Schema ready.\n');
  }

  if (MIGRATE || DRY_RUN) {
    console.log(DRY_RUN ? '=== DRY RUN ===' : '=== MIGRATING DATA ===');
    await migrateLeads(pool);
    await migrateSequences(pool);
    await migrateTouches(pool);
  }

  if (VERIFY || MIGRATE) {
    await verify(pool);
  }

  await pool.close();
  console.log('\nDone.');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
