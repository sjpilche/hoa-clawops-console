/**
 * Campaign Table Manager Service
 * Manages campaign-specific table creation, migration, and access
 *
 * Each campaign gets its own isolated tables:
 * - {slug}_leads
 * - {slug}_runs
 * - {slug}_content_queue
 * - {slug}_hoa_contacts
 */

const { run, all, get } = require('../db/connection');

// Table schemas for each entity type
const TABLE_SCHEMAS = {
  leads: `
    CREATE TABLE IF NOT EXISTS {tableName} (
      id TEXT PRIMARY KEY,
      company_name TEXT,
      contact_name TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      zip TEXT,
      source TEXT,
      status TEXT DEFAULT 'new',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,

  runs: `
    CREATE TABLE IF NOT EXISTS {tableName} (
      id TEXT PRIMARY KEY,
      agent_id TEXT,
      user_id TEXT,
      status TEXT DEFAULT 'pending',
      trigger TEXT,
      started_at TEXT,
      completed_at TEXT,
      duration_ms INTEGER,
      tokens_used INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0,
      result_data TEXT DEFAULT '{}',
      error_msg TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,

  content_queue: `
    CREATE TABLE IF NOT EXISTS {tableName} (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL DEFAULT 'facebook',
      post_type TEXT NOT NULL DEFAULT 'page',
      content TEXT NOT NULL,
      topic TEXT,
      source_agent TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      scheduled_for TEXT,
      posted_at TEXT,
      facebook_post_id TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,

  hoa_contacts: `
    CREATE TABLE IF NOT EXISTS {tableName} (
      id TEXT PRIMARY KEY,
      HOA_Name TEXT,
      County TEXT,
      City TEXT,
      State TEXT,
      Zip_Code TEXT,
      Property_Count INTEGER,
      Phone TEXT,
      Fax TEXT,
      Email TEXT,
      Website TEXT,
      Management_Company TEXT,
      Contact_Name TEXT,
      Contact_Title TEXT,
      Contact_Email TEXT,
      Contact_Phone TEXT,
      Notes TEXT,
      Lead_Status TEXT DEFAULT 'new',
      Last_Contact_Date DATETIME,
      Next_Follow_Up DATETIME,
      Sync_Status TEXT DEFAULT 'pending',
      Azure_Sync_At DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `
};

// Whitelist of valid table name patterns (security - SQL injection prevention)
const VALID_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const VALID_ENTITIES = ['leads', 'runs', 'content_queue', 'hoa_contacts'];

class CampaignTableManager {
  /**
   * Validates campaign slug for table naming
   * @param {string} slug - Campaign slug
   * @returns {boolean} - True if valid
   * @throws {Error} - If slug is invalid
   */
  validateSlug(slug) {
    if (!slug) {
      throw new Error('Campaign slug is required for table naming');
    }

    if (!VALID_SLUG_PATTERN.test(slug)) {
      throw new Error(`Invalid campaign slug for table naming: ${slug}. Must match pattern: ${VALID_SLUG_PATTERN}`);
    }

    return true;
  }

  /**
   * Validates entity type
   * @param {string} entity - Entity type
   * @returns {boolean} - True if valid
   * @throws {Error} - If entity is invalid
   */
  validateEntity(entity) {
    if (!VALID_ENTITIES.includes(entity)) {
      throw new Error(`Invalid entity type: ${entity}. Must be one of: ${VALID_ENTITIES.join(', ')}`);
    }
    return true;
  }

  /**
   * Generate table name for campaign + entity
   * @param {string} campaignSlug - Campaign slug (validated)
   * @param {string} entity - Entity type (leads, runs, content_queue, hoa_contacts)
   * @returns {string} - Safe table name
   */
  getTableName(campaignSlug, entity) {
    this.validateSlug(campaignSlug);
    this.validateEntity(entity);

    // Replace hyphens with underscores for SQL compatibility
    const safeName = campaignSlug.replace(/-/g, '_');
    return `${safeName}_${entity}`;
  }

  /**
   * Create all tables for a new campaign
   * @param {string} campaignSlug - Campaign slug
   */
  async createCampaignTables(campaignSlug) {
    this.validateSlug(campaignSlug);

    console.log(`[CampaignTableManager] Creating tables for campaign: ${campaignSlug}`);

    const entities = Object.keys(TABLE_SCHEMAS);

    for (const entity of entities) {
      const tableName = this.getTableName(campaignSlug, entity);
      const schema = TABLE_SCHEMAS[entity].replace(/\{tableName\}/g, tableName);

      try {
        run(schema);
        console.log(`  ✓ Created table: ${tableName}`);
      } catch (error) {
        console.error(`  ✗ Failed to create ${tableName}:`, error.message);
        throw error;
      }
    }

    // Create indexes for performance
    const safeName = campaignSlug.replace(/-/g, '_');
    const indexes = [
      // Content queue indexes
      `CREATE INDEX IF NOT EXISTS idx_${safeName}_content_queue_status ON ${safeName}_content_queue(status)`,
      `CREATE INDEX IF NOT EXISTS idx_${safeName}_content_queue_scheduled ON ${safeName}_content_queue(scheduled_for)`,
      `CREATE INDEX IF NOT EXISTS idx_${safeName}_content_queue_platform ON ${safeName}_content_queue(platform)`,

      // Runs indexes
      `CREATE INDEX IF NOT EXISTS idx_${safeName}_runs_status ON ${safeName}_runs(status)`,
      `CREATE INDEX IF NOT EXISTS idx_${safeName}_runs_agent ON ${safeName}_runs(agent_id)`,
      `CREATE INDEX IF NOT EXISTS idx_${safeName}_runs_created ON ${safeName}_runs(created_at)`,

      // Leads indexes
      `CREATE INDEX IF NOT EXISTS idx_${safeName}_leads_status ON ${safeName}_leads(status)`,

      // HOA contacts indexes
      `CREATE INDEX IF NOT EXISTS idx_${safeName}_hoa_contacts_status ON ${safeName}_hoa_contacts(Lead_Status)`,
      `CREATE INDEX IF NOT EXISTS idx_${safeName}_hoa_contacts_state ON ${safeName}_hoa_contacts(State)`,
    ];

    for (const indexSql of indexes) {
      try {
        run(indexSql);
      } catch (error) {
        // Index might already exist, that's fine
        console.log(`  ℹ️  Index already exists or skipped: ${error.message}`);
      }
    }

    console.log(`[CampaignTableManager] All tables and indexes created for ${campaignSlug}`);
  }

  /**
   * Check if campaign tables exist
   * @param {string} campaignSlug - Campaign slug
   * @returns {boolean} - True if tables exist
   */
  tablesExist(campaignSlug) {
    this.validateSlug(campaignSlug);

    const tableName = this.getTableName(campaignSlug, 'leads');
    const tables = all(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name=?
    `, [tableName]);

    return tables.length > 0;
  }

  /**
   * Get all campaign-specific table names
   * @param {string} campaignSlug - Campaign slug
   * @returns {object} - Map of entity -> table name
   */
  getCampaignTables(campaignSlug) {
    this.validateSlug(campaignSlug);

    const tables = {};
    for (const entity of Object.keys(TABLE_SCHEMAS)) {
      tables[entity] = this.getTableName(campaignSlug, entity);
    }
    return tables;
  }

  /**
   * Migrate data from shared table to campaign table
   * @param {string} campaignId - Campaign ID
   * @param {string} campaignSlug - Campaign slug
   */
  async migrateData(campaignId, campaignSlug) {
    this.validateSlug(campaignSlug);

    console.log(`[CampaignTableManager] Migrating data for campaign ${campaignSlug}`);

    try {
      // Migrate leads
      const leadsTable = this.getTableName(campaignSlug, 'leads');
      const leadsCount = get(`SELECT COUNT(*) as count FROM leads WHERE campaign_id = ?`, [campaignId]);
      if (leadsCount?.count > 0) {
        run(`INSERT INTO ${leadsTable} SELECT id, company_name, contact_name, email, phone, address, city, state, zip, source, status, notes, created_at, updated_at FROM leads WHERE campaign_id = ?`, [campaignId]);
        console.log(`    ✓ Migrated ${leadsCount.count} leads`);
      } else {
        console.log(`    ℹ No leads to migrate`);
      }

      // Migrate runs
      const runsTable = this.getTableName(campaignSlug, 'runs');
      const runsCount = get(`SELECT COUNT(*) as count FROM runs WHERE campaign_id = ?`, [campaignId]);
      if (runsCount?.count > 0) {
        run(`INSERT INTO ${runsTable} SELECT id, agent_id, user_id, status, trigger, started_at, completed_at, duration_ms, tokens_used, cost_usd, result_data, error_msg, created_at FROM runs WHERE campaign_id = ?`, [campaignId]);
        console.log(`    ✓ Migrated ${runsCount.count} runs`);
      } else {
        console.log(`    ℹ No runs to migrate`);
      }

      // Migrate content_queue
      const contentTable = this.getTableName(campaignSlug, 'content_queue');
      const contentCount = get(`SELECT COUNT(*) as count FROM content_queue WHERE campaign_id = ?`, [campaignId]);
      if (contentCount?.count > 0) {
        run(`INSERT INTO ${contentTable} (id, platform, post_type, content, topic, source_agent, status, scheduled_for, posted_at, facebook_post_id, error_message, created_at, updated_at)
             SELECT id, platform, post_type, content, topic, source_agent, status, scheduled_for, posted_at, facebook_post_id, error_message, created_at, updated_at
             FROM content_queue WHERE campaign_id = ?`, [campaignId]);
        console.log(`    ✓ Migrated ${contentCount.count} content queue items`);
      } else {
        console.log(`    ℹ No content queue items to migrate`);
      }

      // Migrate hoa_contacts
      const contactsTable = this.getTableName(campaignSlug, 'hoa_contacts');
      const contactsCount = get(`SELECT COUNT(*) as count FROM hoa_contacts WHERE campaign_id = ?`, [campaignId]);
      if (contactsCount?.count > 0) {
        run(`INSERT INTO ${contactsTable} SELECT id, HOA_Name, County, City, State, Zip_Code, Property_Count, Phone, Fax, Email, Website, Management_Company, Contact_Name, Contact_Title, Contact_Email, Contact_Phone, Notes, Lead_Status, Last_Contact_Date, Next_Follow_Up, Sync_Status, Azure_Sync_At, created_at, updated_at FROM hoa_contacts WHERE campaign_id = ?`, [campaignId]);
        console.log(`    ✓ Migrated ${contactsCount.count} HOA contacts`);
      } else {
        console.log(`    ℹ No HOA contacts to migrate`);
      }

      console.log(`[CampaignTableManager] Migration complete for ${campaignSlug}`);
    } catch (error) {
      console.error(`[CampaignTableManager] Migration failed for ${campaignSlug}:`, error.message);
      throw error;
    }
  }

  /**
   * Drop all campaign tables (for testing/cleanup)
   * @param {string} campaignSlug - Campaign slug
   */
  async dropCampaignTables(campaignSlug) {
    this.validateSlug(campaignSlug);

    console.log(`[CampaignTableManager] Dropping tables for campaign: ${campaignSlug}`);

    for (const entity of Object.keys(TABLE_SCHEMAS)) {
      const tableName = this.getTableName(campaignSlug, entity);
      try {
        run(`DROP TABLE IF EXISTS ${tableName}`);
        console.log(`  ✓ Dropped table: ${tableName}`);
      } catch (error) {
        console.error(`  ✗ Failed to drop ${tableName}:`, error.message);
      }
    }
  }

  /**
   * Get count of records in campaign tables
   * @param {string} campaignSlug - Campaign slug
   * @returns {object} - Map of entity -> count
   */
  getRecordCounts(campaignSlug) {
    this.validateSlug(campaignSlug);

    const counts = {};
    const tables = this.getCampaignTables(campaignSlug);

    for (const [entity, tableName] of Object.entries(tables)) {
      try {
        const result = get(`SELECT COUNT(*) as count FROM ${tableName}`);
        counts[entity] = result?.count || 0;
      } catch (error) {
        console.error(`[CampaignTableManager] Failed to count ${tableName}:`, error.message);
        counts[entity] = 0;
      }
    }

    return counts;
  }
}

module.exports = new CampaignTableManager();
