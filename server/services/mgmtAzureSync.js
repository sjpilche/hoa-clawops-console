/**
 * @file mgmtAzureSync.js
 * @description Azure SQL dual-write for Management Company Research pipeline (Agents 36-40).
 *
 * Follows the same pattern as googleMapsDiscovery.js:
 *   - SQLite is the source of truth
 *   - Azure SQL is an async mirror for analytics/reporting
 *   - All Azure ops are non-fatal (fire-and-forget)
 *
 * Tables synced to Azure SQL (empcapmaster2):
 *   dbo.mgmt_companies         — management companies discovered by Agent 40
 *   dbo.mgmt_company_contacts  — contacts pulled by Agent 37
 *   dbo.mgmt_review_signals    — review signals from Agent 39
 *   dbo.prospector_runs         — reuses existing run tracking table
 *
 * Cost: $0 — just database writes
 */

const mssql = require('mssql');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.resolve('.env.local') });

// ═══════════════════════════════════════════════════════════════════════════
// AZURE CONNECTION
// ═══════════════════════════════════════════════════════════════════════════

const azureConfig = {
  server: process.env.AZURE_SQL_SERVER,
  database: process.env.AZURE_SQL_DATABASE,
  user: process.env.AZURE_SQL_USER,
  password: process.env.AZURE_SQL_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
    connectTimeout: 30000,
  },
  pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
};

let pool = null;

async function getPool() {
  if (!pool) {
    pool = await mssql.connect(azureConfig);
    console.log('[MgmtAzure] Connected to Azure SQL');
  }
  return pool;
}

async function closePool() {
  if (pool) {
    await pool.close();
    pool = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TABLE INITIALIZATION (idempotent — CREATE IF NOT EXISTS pattern for MSSQL)
// ═══════════════════════════════════════════════════════════════════════════

async function ensureTables() {
  try {
    const p = await getPool();

    // mgmt_companies
    await p.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'mgmt_companies')
      CREATE TABLE dbo.mgmt_companies (
        id NVARCHAR(255) PRIMARY KEY,
        name NVARCHAR(500) NOT NULL,
        website_url NVARCHAR(1000),
        phone NVARCHAR(100),
        email NVARCHAR(255),
        city NVARCHAR(100),
        state NVARCHAR(50),
        priority_tier NVARCHAR(50) DEFAULT 'UNKNOWN',
        cai_designations NVARCHAR(MAX) DEFAULT '[]',
        communities_managed INT,
        google_rating FLOAT,
        google_review_count INT,
        company_health NVARCHAR(50) DEFAULT 'unknown',
        switching_signals INT DEFAULT 0,
        outreach_priority NVARCHAR(50) DEFAULT 'UNKNOWN',
        has_vendor_program BIT DEFAULT 0,
        portfolio_scraped BIT DEFAULT 0,
        contacts_pulled BIT DEFAULT 0,
        portfolio_mapped BIT DEFAULT 0,
        reviews_scanned BIT DEFAULT 0,
        source NVARCHAR(100),
        created_date DATETIME2 DEFAULT GETDATE(),
        updated_date DATETIME2 DEFAULT GETDATE()
      )
    `);

    // mgmt_company_contacts
    await p.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'mgmt_company_contacts')
      CREATE TABLE dbo.mgmt_company_contacts (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        mgmt_company_id NVARCHAR(255),
        mgmt_company_name NVARCHAR(500) NOT NULL,
        contact_type NVARCHAR(100) NOT NULL,
        full_name NVARCHAR(255),
        title NVARCHAR(255),
        email NVARCHAR(255),
        email_quality NVARCHAR(50) DEFAULT 'unknown',
        phone NVARCHAR(100),
        linkedin_url NVARCHAR(500),
        office_location NVARCHAR(255),
        source_url NVARCHAR(1000),
        created_date DATETIME2 DEFAULT GETDATE()
      )
    `);

    // mgmt_review_signals
    await p.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'mgmt_review_signals')
      CREATE TABLE dbo.mgmt_review_signals (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        mgmt_company_id NVARCHAR(255),
        mgmt_company_name NVARCHAR(500) NOT NULL,
        review_source NVARCHAR(100) NOT NULL,
        reviewer_name NVARCHAR(255),
        star_rating INT,
        review_text NVARCHAR(MAX),
        community_mentioned NVARCHAR(500),
        community_city NVARCHAR(100),
        community_state NVARCHAR(50),
        signal_score INT DEFAULT 0,
        primary_issue NVARCHAR(255),
        urgency NVARCHAR(50) DEFAULT 'low',
        scan_run_id NVARCHAR(255),
        created_date DATETIME2 DEFAULT GETDATE()
      )
    `);

    console.log('[MgmtAzure] Tables ensured');
  } catch (err) {
    console.warn(`[MgmtAzure] ensureTables failed (non-fatal): ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RUN TRACKING (reuses existing prospector_runs table)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a run record in Azure SQL prospector_runs.
 * @param {string} runType — e.g. 'mgmt_cai_scraper', 'mgmt_review_scanner'
 * @param {string} sourceFilter — descriptive label
 * @returns {string|null} Azure run GUID
 */
async function azureCreateRun(runType, sourceFilter) {
  try {
    const p = await getPool();
    const runId = crypto.randomUUID();
    await p.request()
      .input('id', mssql.UniqueIdentifier, runId)
      .input('run_type', mssql.NVarChar(100), runType)
      .input('status', mssql.NVarChar(50), 'running')
      .input('source_filter', mssql.NVarChar(255), sourceFilter || '')
      .input('config', mssql.NVarChar(mssql.MAX), JSON.stringify({ run_type: runType, source: sourceFilter }))
      .query(`
        INSERT INTO dbo.prospector_runs
          (id, run_type, status, source_filter, config, created_date, started_at)
        VALUES
          (@id, @run_type, @status, @source_filter, @config, GETDATE(), GETDATE())
      `);
    console.log(`[MgmtAzure] Run created: ${runId} (${runType})`);
    return runId;
  } catch (err) {
    console.warn(`[MgmtAzure] createRun failed (non-fatal): ${err.message}`);
    return null;
  }
}

/**
 * Complete a run record with final stats.
 */
async function azureCompleteRun(azureRunId, stats) {
  if (!azureRunId) return;
  try {
    const p = await getPool();
    await p.request()
      .input('id', mssql.UniqueIdentifier, azureRunId)
      .input('status', mssql.NVarChar(50), 'completed')
      .input('leads_found', mssql.Int, stats.total_found || stats.results_found || 0)
      .input('leads_qualified', mssql.Int, stats.new_records || stats.signal_reviews || 0)
      .input('pages_scraped', mssql.Int, stats.pages_scraped || stats.queries_run || 0)
      .input('results', mssql.NVarChar(mssql.MAX), JSON.stringify(stats))
      .query(`
        UPDATE dbo.prospector_runs SET
          status = @status,
          leads_found = @leads_found,
          leads_qualified = @leads_qualified,
          pages_scraped = @pages_scraped,
          results = @results,
          completed_at = GETDATE(),
          updated_date = GETDATE()
        WHERE id = @id
      `);
    console.log(`[MgmtAzure] Run completed: ${azureRunId}`);
  } catch (err) {
    console.warn(`[MgmtAzure] completeRun failed (non-fatal): ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPANY SYNC (Agent 40 CAI Scraper, Agent 36 Portfolio Scraper)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Upsert a management company to Azure SQL.
 * Fire-and-forget — non-fatal.
 */
async function azureUpsertCompany(company) {
  try {
    const p = await getPool();
    await p.request()
      .input('id', mssql.NVarChar(255), company.id)
      .input('name', mssql.NVarChar(500), company.name)
      .input('website_url', mssql.NVarChar(1000), company.website_url || company.website || null)
      .input('phone', mssql.NVarChar(100), company.phone || null)
      .input('email', mssql.NVarChar(255), company.email || null)
      .input('city', mssql.NVarChar(100), company.city || null)
      .input('state', mssql.NVarChar(50), company.state || null)
      .input('priority_tier', mssql.NVarChar(50), company.priority_tier || 'UNKNOWN')
      .input('cai_designations', mssql.NVarChar(mssql.MAX), JSON.stringify(company.cai_designations || []))
      .input('communities_managed', mssql.Int, company.communities_managed || null)
      .input('google_rating', mssql.Float, company.google_rating || null)
      .input('source', mssql.NVarChar(100), company.source || null)
      .query(`
        MERGE dbo.mgmt_companies AS target
        USING (SELECT @id AS id) AS source
        ON target.id = source.id
        WHEN MATCHED THEN
          UPDATE SET
            name = @name, website_url = @website_url, phone = @phone, email = @email,
            city = @city, state = @state, priority_tier = @priority_tier,
            cai_designations = @cai_designations, communities_managed = @communities_managed,
            google_rating = @google_rating, source = @source, updated_date = GETDATE()
        WHEN NOT MATCHED THEN
          INSERT (id, name, website_url, phone, email, city, state, priority_tier,
                  cai_designations, communities_managed, google_rating, source)
          VALUES (@id, @name, @website_url, @phone, @email, @city, @state, @priority_tier,
                  @cai_designations, @communities_managed, @google_rating, @source);
      `);
  } catch (err) {
    console.warn(`[MgmtAzure] upsertCompany failed (non-fatal): ${err.message}`);
  }
}

/**
 * Update pipeline flags on a company after an agent completes.
 */
async function azureUpdateCompanyPipeline(companyId, flags) {
  try {
    const p = await getPool();
    const setClauses = [];
    const req = p.request().input('id', mssql.NVarChar(255), companyId);

    if (flags.portfolio_scraped !== undefined) {
      setClauses.push('portfolio_scraped = @ps');
      req.input('ps', mssql.Bit, flags.portfolio_scraped ? 1 : 0);
    }
    if (flags.contacts_pulled !== undefined) {
      setClauses.push('contacts_pulled = @cp');
      req.input('cp', mssql.Bit, flags.contacts_pulled ? 1 : 0);
    }
    if (flags.portfolio_mapped !== undefined) {
      setClauses.push('portfolio_mapped = @pm');
      req.input('pm', mssql.Bit, flags.portfolio_mapped ? 1 : 0);
    }
    if (flags.reviews_scanned !== undefined) {
      setClauses.push('reviews_scanned = @rs');
      req.input('rs', mssql.Bit, flags.reviews_scanned ? 1 : 0);
    }
    if (flags.company_health) {
      setClauses.push('company_health = @ch');
      req.input('ch', mssql.NVarChar(50), flags.company_health);
    }
    if (flags.google_rating !== undefined) {
      setClauses.push('google_rating = @gr');
      req.input('gr', mssql.Float, flags.google_rating);
    }
    if (flags.google_review_count !== undefined) {
      setClauses.push('google_review_count = @grc');
      req.input('grc', mssql.Int, flags.google_review_count);
    }
    if (flags.switching_signals !== undefined) {
      setClauses.push('switching_signals = @ss');
      req.input('ss', mssql.Int, flags.switching_signals);
    }
    if (flags.has_vendor_program !== undefined) {
      setClauses.push('has_vendor_program = @hvp');
      req.input('hvp', mssql.Bit, flags.has_vendor_program ? 1 : 0);
    }
    if (flags.outreach_priority) {
      setClauses.push('outreach_priority = @op');
      req.input('op', mssql.NVarChar(50), flags.outreach_priority);
    }

    if (setClauses.length === 0) return;
    setClauses.push('updated_date = GETDATE()');

    await req.query(`UPDATE dbo.mgmt_companies SET ${setClauses.join(', ')} WHERE id = @id`);
  } catch (err) {
    console.warn(`[MgmtAzure] updateCompanyPipeline failed (non-fatal): ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTACT SYNC (Agent 37 Contact Puller)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Write a contact to Azure SQL.
 */
async function azureWriteContact(contact) {
  try {
    const p = await getPool();
    await p.request()
      .input('mgmt_company_id', mssql.NVarChar(255), contact.mgmt_company_id || null)
      .input('mgmt_company_name', mssql.NVarChar(500), contact.mgmt_company_name)
      .input('contact_type', mssql.NVarChar(100), contact.contact_type)
      .input('full_name', mssql.NVarChar(255), contact.full_name || null)
      .input('title', mssql.NVarChar(255), contact.title || null)
      .input('email', mssql.NVarChar(255), contact.email || null)
      .input('email_quality', mssql.NVarChar(50), contact.email_quality || 'unknown')
      .input('phone', mssql.NVarChar(100), contact.phone || null)
      .input('linkedin_url', mssql.NVarChar(500), contact.linkedin_url || null)
      .input('office_location', mssql.NVarChar(255), contact.office_location || null)
      .input('source_url', mssql.NVarChar(1000), contact.source_url || null)
      .query(`
        INSERT INTO dbo.mgmt_company_contacts
          (mgmt_company_id, mgmt_company_name, contact_type, full_name, title,
           email, email_quality, phone, linkedin_url, office_location, source_url)
        VALUES
          (@mgmt_company_id, @mgmt_company_name, @contact_type, @full_name, @title,
           @email, @email_quality, @phone, @linkedin_url, @office_location, @source_url)
      `);
  } catch (err) {
    console.warn(`[MgmtAzure] writeContact failed (non-fatal): ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// REVIEW SIGNAL SYNC (Agent 39 Review Scanner)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Write a review signal to Azure SQL.
 */
async function azureWriteSignal(signal) {
  try {
    const p = await getPool();
    await p.request()
      .input('mgmt_company_id', mssql.NVarChar(255), signal.mgmt_company_id || null)
      .input('mgmt_company_name', mssql.NVarChar(500), signal.mgmt_company_name)
      .input('review_source', mssql.NVarChar(100), signal.review_source || 'google')
      .input('reviewer_name', mssql.NVarChar(255), signal.reviewer_name || null)
      .input('star_rating', mssql.Int, signal.star_rating || null)
      .input('review_text', mssql.NVarChar(mssql.MAX), signal.review_text || '')
      .input('community_mentioned', mssql.NVarChar(500), signal.community_mentioned || null)
      .input('community_city', mssql.NVarChar(100), signal.community_city || null)
      .input('community_state', mssql.NVarChar(50), signal.community_state || null)
      .input('signal_score', mssql.Int, signal.signal_score || 0)
      .input('primary_issue', mssql.NVarChar(255), signal.primary_issue || null)
      .input('urgency', mssql.NVarChar(50), signal.urgency || 'low')
      .input('scan_run_id', mssql.NVarChar(255), signal.scan_run_id || null)
      .query(`
        INSERT INTO dbo.mgmt_review_signals
          (mgmt_company_id, mgmt_company_name, review_source, reviewer_name, star_rating,
           review_text, community_mentioned, community_city, community_state,
           signal_score, primary_issue, urgency, scan_run_id)
        VALUES
          (@mgmt_company_id, @mgmt_company_name, @review_source, @reviewer_name, @star_rating,
           @review_text, @community_mentioned, @community_city, @community_state,
           @signal_score, @primary_issue, @urgency, @scan_run_id)
      `);
  } catch (err) {
    console.warn(`[MgmtAzure] writeSignal failed (non-fatal): ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  ensureTables,
  getPool,
  closePool,
  azureCreateRun,
  azureCompleteRun,
  azureUpsertCompany,
  azureUpdateCompanyPipeline,
  azureWriteContact,
  azureWriteSignal,
};
