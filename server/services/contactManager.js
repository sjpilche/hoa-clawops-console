/**
 * @file contactManager.js
 * @description Contact Management Service for Azure SQL (empcapmaster2)
 *
 * This service manages contacts across multiple tables:
 * - dbo.leads - Main leads table
 * - dbo.hoa_contact - HOA contacts with emails
 * - dbo.mkt_outreach_queue - Marketing outreach queue
 *
 * Designed to be used by OpenClaw agents for contact management
 */

const sql = require('mssql');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config({ path: '.env.local' });

class ContactManager {
  constructor() {
    this.pool = null;
    this.isConnected = false;

    // Azure SQL Connection Configuration
    this.config = {
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
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000,
      },
    };
  }

  /**
   * Connect to Azure SQL Server
   */
  async connect() {
    if (this.isConnected && this.pool) {
      return this.pool;
    }

    try {
      console.log('[ContactManager] Connecting to Azure SQL...');
      this.pool = await sql.connect(this.config);
      this.isConnected = true;
      console.log('[ContactManager] ✅ Connected to empcapmaster2');
      return this.pool;
    } catch (error) {
      console.error('[ContactManager] ❌ Connection failed:', error.message);
      throw new Error(`Failed to connect to Azure SQL: ${error.message}`);
    }
  }

  /**
   * Disconnect from Azure SQL Server
   */
  async disconnect() {
    if (this.pool) {
      await this.pool.close();
      this.isConnected = false;
      console.log('[ContactManager] Disconnected from Azure SQL');
    }
  }

  /**
   * Test the connection
   */
  async testConnection() {
    try {
      const pool = await this.connect();
      const result = await pool.request().query('SELECT DB_NAME() as DatabaseName');
      console.log(`[ContactManager] Connected to: ${result.recordset[0].DatabaseName}`);
      return true;
    } catch (error) {
      console.error('[ContactManager] Connection test failed:', error.message);
      return false;
    }
  }

  // ============================================================================
  // LEADS TABLE OPERATIONS (dbo.leads)
  // ============================================================================

  /**
   * Add a new lead
   * @param {Object} leadData - Lead information
   * @returns {string} New lead ID (UUID)
   */
  async addLead(leadData) {
    const pool = await this.connect();

    try {
      const result = await pool.request()
        .input('contact_name', sql.NVarChar(255), leadData.contact_name || null)
        .input('email', sql.NVarChar(255), leadData.email || null)
        .input('phone', sql.NVarChar(50), leadData.phone || null)
        .input('hoa_name', sql.NVarChar(255), leadData.hoa_name || null)
        .input('city', sql.NVarChar(100), leadData.city || null)
        .input('state', sql.NVarChar(50), leadData.state || null)
        .input('zip', sql.NVarChar(20), leadData.zip || null)
        .input('units', sql.Int, leadData.units || null)
        .input('source', sql.NVarChar(100), leadData.source || 'agent')
        .input('form_name', sql.NVarChar(100), leadData.form_name || null)
        .input('notes', sql.NVarChar(sql.MAX), leadData.notes || null)
        .input('segment', sql.NVarChar(100), leadData.segment || null)
        .input('score', sql.Int, leadData.score || null)
        .input('utm_source', sql.NVarChar(100), leadData.utm_source || null)
        .input('utm_campaign', sql.NVarChar(100), leadData.utm_campaign || null)
        .input('utm_medium', sql.NVarChar(100), leadData.utm_medium || null)
        .input('status', sql.NVarChar(50), leadData.status || 'new')
        .query(`
          INSERT INTO dbo.leads (
            created_at, source, form_name, contact_name, email, phone,
            hoa_name, city, state, zip, units, notes, segment, score,
            utm_source, utm_campaign, utm_medium, status
          )
          OUTPUT INSERTED.lead_id
          VALUES (
            GETDATE(), @source, @form_name, @contact_name, @email, @phone,
            @hoa_name, @city, @state, @zip, @units, @notes, @segment, @score,
            @utm_source, @utm_campaign, @utm_medium, @status
          )
        `);

      const newLeadId = result.recordset[0].lead_id;
      console.log(`[ContactManager] Created lead: ${newLeadId}`);
      return newLeadId;
    } catch (error) {
      console.error('[ContactManager] Error creating lead:', error.message);
      throw error;
    }
  }

  /**
   * Get all leads with optional filters
   */
  async getLeads(filters = {}) {
    const pool = await this.connect();

    try {
      let query = 'SELECT * FROM dbo.leads WHERE 1=1';
      const request = pool.request();

      if (filters.email) {
        query += ' AND email = @email';
        request.input('email', sql.NVarChar, filters.email);
      }

      if (filters.status) {
        query += ' AND status = @status';
        request.input('status', sql.NVarChar, filters.status);
      }

      if (filters.source) {
        query += ' AND source = @source';
        request.input('source', sql.NVarChar, filters.source);
      }

      query += ' ORDER BY created_at DESC';

      const result = await request.query(query);
      return result.recordset;
    } catch (error) {
      console.error('[ContactManager] Error fetching leads:', error.message);
      throw error;
    }
  }

  /**
   * Update a lead
   */
  async updateLead(leadId, updates) {
    const pool = await this.connect();

    try {
      const setClauses = [];
      const request = pool.request();
      request.input('lead_id', sql.Int, leadId);

      const allowedFields = [
        'contact_name', 'email', 'phone', 'hoa_name', 'city', 'state', 'zip',
        'units', 'notes', 'segment', 'score', 'status'
      ];

      Object.keys(updates).forEach(key => {
        if (allowedFields.includes(key)) {
          setClauses.push(`${key} = @${key}`);
          request.input(key, updates[key]);
        }
      });

      if (setClauses.length === 0) {
        throw new Error('No valid fields to update');
      }

      const query = `
        UPDATE dbo.leads
        SET ${setClauses.join(', ')}
        WHERE lead_id = @lead_id
      `;

      await request.query(query);
      console.log(`[ContactManager] Updated lead: ${leadId}`);
      return true;
    } catch (error) {
      console.error('[ContactManager] Error updating lead:', error.message);
      throw error;
    }
  }

  // ============================================================================
  // HOA CONTACTS TABLE OPERATIONS (dbo.hoa_contact)
  // ============================================================================

  /**
   * Add HOA contact
   */
  async addHOAContact(contactData) {
    const pool = await this.connect();

    try {
      const newContactId = uuidv4();

      const result = await pool.request()
        .input('id', sql.UniqueIdentifier, newContactId)
        .input('application_id', sql.UniqueIdentifier, contactData.application_id || null)
        .input('role', sql.NVarChar(50), contactData.role || 'contact')
        .input('name', sql.NVarChar(255), contactData.name || null)
        .input('title', sql.NVarChar(255), contactData.title || null)
        .input('phone', sql.NVarChar(50), contactData.phone || null)
        .input('email', sql.NVarChar(255), contactData.email || null)
        .input('company', sql.NVarChar(255), contactData.company || null)
        .query(`
          INSERT INTO dbo.hoa_contact (id, application_id, role, name, title, phone, email, company)
          VALUES (@id, @application_id, @role, @name, @title, @phone, @email, @company)
        `);

      console.log(`[ContactManager] Created HOA contact: ${newContactId}`);
      return newContactId.toString();
    } catch (error) {
      console.error('[ContactManager] Error creating HOA contact:', error.message);
      throw error;
    }
  }

  /**
   * Get all HOA contacts
   */
  async getHOAContacts(filters = {}) {
    const pool = await this.connect();

    try {
      let query = 'SELECT * FROM dbo.hoa_contact WHERE 1=1';
      const request = pool.request();

      if (filters.email) {
        query += ' AND email = @email';
        request.input('email', sql.NVarChar, filters.email);
      }

      if (filters.role) {
        query += ' AND role = @role';
        request.input('role', sql.NVarChar, filters.role);
      }

      if (filters.hasEmail) {
        query += ' AND email IS NOT NULL AND email != \'\'';
      }

      const result = await request.query(query);
      return result.recordset;
    } catch (error) {
      console.error('[ContactManager] Error fetching HOA contacts:', error.message);
      throw error;
    }
  }

  /**
   * Get all email addresses from contacts
   */
  async getAllEmails() {
    const pool = await this.connect();

    try {
      const result = await pool.request().query(`
        SELECT DISTINCT
          email,
          name,
          title,
          company,
          'hoa_contact' as source
        FROM dbo.hoa_contact
        WHERE email IS NOT NULL AND email != ''

        UNION

        SELECT DISTINCT
          email,
          contact_name as name,
          NULL as title,
          hoa_name as company,
          'leads' as source
        FROM dbo.leads
        WHERE email IS NOT NULL AND email != ''

        ORDER BY email
      `);

      console.log(`[ContactManager] Retrieved ${result.recordset.length} unique emails`);
      return result.recordset;
    } catch (error) {
      console.error('[ContactManager] Error fetching emails:', error.message);
      throw error;
    }
  }

  // ============================================================================
  // MARKETING OUTREACH QUEUE OPERATIONS (dbo.mkt_outreach_queue)
  // ============================================================================

  /**
   * Add to marketing outreach queue
   */
  async addToMarketingQueue(outreachData) {
    const pool = await this.connect();

    try {
      const newId = uuidv4();

      const result = await pool.request()
        .input('id', sql.UniqueIdentifier, newId)
        .input('campaign', sql.NVarChar(100), outreachData.campaign || null)
        .input('draft_subject', sql.NVarChar(sql.MAX), outreachData.draft_subject || null)
        .input('draft_body', sql.NVarChar(sql.MAX), outreachData.draft_body || null)
        .input('approval_status', sql.NVarChar(50), outreachData.approval_status || 'pending')
        .input('scheduled_send_at', sql.DateTime2, outreachData.scheduled_send_at || null)
        .query(`
          INSERT INTO dbo.mkt_outreach_queue (
            id, campaign, draft_subject, draft_body, approval_status,
            scheduled_send_at, created_at
          )
          VALUES (
            @id, @campaign, @draft_subject, @draft_body, @approval_status,
            @scheduled_send_at, GETDATE()
          )
        `);

      console.log(`[ContactManager] Added to marketing queue: ${newId}`);
      return newId.toString();
    } catch (error) {
      console.error('[ContactManager] Error adding to marketing queue:', error.message);
      throw error;
    }
  }

  // ============================================================================
  // BULK OPERATIONS
  // ============================================================================

  /**
   * Bulk import leads
   */
  async bulkImportLeads(leads) {
    const pool = await this.connect();
    const stats = { success: 0, failed: 0, errors: [] };

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      for (const lead of leads) {
        try {
          const request = new sql.Request(transaction);

          await request
            .input('contact_name', sql.NVarChar(255), lead.contact_name || null)
            .input('email', sql.NVarChar(255), lead.email || null)
            .input('phone', sql.NVarChar(50), lead.phone || null)
            .input('hoa_name', sql.NVarChar(255), lead.hoa_name || null)
            .input('city', sql.NVarChar(100), lead.city || null)
            .input('state', sql.NVarChar(50), lead.state || null)
            .input('source', sql.NVarChar(100), lead.source || 'bulk_import')
            .input('status', sql.NVarChar(50), lead.status || 'new')
            .query(`
              INSERT INTO dbo.leads (
                created_at, source, contact_name, email, phone,
                hoa_name, city, state, status
              )
              VALUES (
                GETDATE(), @source, @contact_name, @email, @phone,
                @hoa_name, @city, @state, @status
              )
            `);

          stats.success++;
        } catch (error) {
          stats.failed++;
          stats.errors.push({ lead, error: error.message });
        }
      }

      await transaction.commit();
      console.log(`[ContactManager] Bulk import: ${stats.success} success, ${stats.failed} failed`);
      return stats;
    } catch (error) {
      await transaction.rollback();
      console.error('[ContactManager] Bulk import failed:', error.message);
      throw error;
    }
  }

  // ============================================================================
  // SEARCH & QUERY OPERATIONS
  // ============================================================================

  /**
   * Search contacts across all tables
   */
  async searchContacts(searchTerm) {
    const pool = await this.connect();

    try {
      const result = await pool.request()
        .input('search', sql.NVarChar, `%${searchTerm}%`)
        .query(`
          SELECT
            contact_name as name,
            email,
            phone,
            hoa_name,
            city,
            state,
            'leads' as source,
            created_at
          FROM dbo.leads
          WHERE
            contact_name LIKE @search OR
            email LIKE @search OR
            phone LIKE @search OR
            hoa_name LIKE @search

          UNION ALL

          SELECT
            name,
            email,
            phone,
            company as hoa_name,
            NULL as city,
            NULL as state,
            'hoa_contact' as source,
            NULL as created_at
          FROM dbo.hoa_contact
          WHERE
            name LIKE @search OR
            email LIKE @search OR
            phone LIKE @search OR
            company LIKE @search

          ORDER BY name
        `);

      return result.recordset;
    } catch (error) {
      console.error('[ContactManager] Error searching contacts:', error.message);
      throw error;
    }
  }

  /**
   * Get database statistics
   */
  async getStats() {
    const pool = await this.connect();

    try {
      const result = await pool.request().query(`
        SELECT
          (SELECT COUNT(*) FROM dbo.leads) as total_leads,
          (SELECT COUNT(*) FROM dbo.leads WHERE email IS NOT NULL AND email != '') as leads_with_email,
          (SELECT COUNT(*) FROM dbo.hoa_contact) as total_hoa_contacts,
          (SELECT COUNT(*) FROM dbo.hoa_contact WHERE email IS NOT NULL AND email != '') as hoa_contacts_with_email,
          (SELECT COUNT(*) FROM dbo.mkt_outreach_queue) as marketing_queue_items
      `);

      return result.recordset[0];
    } catch (error) {
      console.error('[ContactManager] Error fetching stats:', error.message);
      throw error;
    }
  }

  /**
   * Export all contacts to CSV-compatible format
   */
  async exportAllContacts() {
    const pool = await this.connect();

    try {
      const result = await pool.request().query(`
        SELECT
          contact_name as name,
          email,
          phone,
          hoa_name as company,
          city,
          state,
          zip,
          source,
          status,
          created_at
        FROM dbo.leads

        UNION ALL

        SELECT
          name,
          email,
          phone,
          company,
          NULL as city,
          NULL as state,
          NULL as zip,
          'hoa_contact' as source,
          NULL as status,
          NULL as created_at
        FROM dbo.hoa_contact

        ORDER BY created_at DESC, name
      `);

      return result.recordset;
    } catch (error) {
      console.error('[ContactManager] Error exporting contacts:', error.message);
      throw error;
    }
  }
}

// Export singleton instance
const contactManager = new ContactManager();

module.exports = contactManager;
