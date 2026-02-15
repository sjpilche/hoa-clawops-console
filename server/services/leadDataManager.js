/**
 * @file leadDataManager.js
 * @description Service for managing lead data from EMPCAMPMaster2 Azure SQL database
 *
 * This service provides:
 * - Connection to Azure SQL EMPCAMPMaster2 database
 * - Pull lead data (emails, contacts, customer info)
 * - Push updated lead data back to Azure SQL
 * - Sync leads with local SQLite database
 * - Query and filter leads
 */

const sql = require('mssql');
require('dotenv').config({ path: '.env.local' });

class LeadDataManager {
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
        encrypt: true, // Required for Azure SQL
        trustServerCertificate: false,
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
      console.log('[LeadDataManager] Connecting to Azure SQL Server...');
      this.pool = await sql.connect(this.config);
      this.isConnected = true;
      console.log('[LeadDataManager] ✅ Connected to EMPCAMPMaster2');
      return this.pool;
    } catch (error) {
      console.error('[LeadDataManager] ❌ Connection failed:', error.message);
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
      console.log('[LeadDataManager] Disconnected from Azure SQL');
    }
  }

  /**
   * Test the connection
   */
  async testConnection() {
    try {
      const pool = await this.connect();
      const result = await pool.request().query('SELECT DB_NAME() as DatabaseName');
      console.log(`[LeadDataManager] Connected to database: ${result.recordset[0].DatabaseName}`);
      return true;
    } catch (error) {
      console.error('[LeadDataManager] Connection test failed:', error.message);
      return false;
    }
  }

  /**
   * Get all leads from the database
   * @param {Object} filters - Optional filters (e.g., { status: 'active', limit: 100 })
   * @returns {Array} Array of lead records
   */
  async getLeads(filters = {}) {
    const pool = await this.connect();

    try {
      let query = 'SELECT * FROM Leads';
      const conditions = [];
      const params = {};

      // Apply filters
      if (filters.status) {
        conditions.push('Status = @status');
        params.status = filters.status;
      }

      if (filters.email) {
        conditions.push('Email LIKE @email');
        params.email = `%${filters.email}%`;
      }

      if (filters.createdAfter) {
        conditions.push('CreatedDate >= @createdAfter');
        params.createdAfter = filters.createdAfter;
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY CreatedDate DESC';

      if (filters.limit) {
        query = `SELECT TOP ${parseInt(filters.limit)} * FROM (${query}) AS subquery`;
      }

      const request = pool.request();
      Object.keys(params).forEach(key => {
        request.input(key, params[key]);
      });

      const result = await request.query(query);
      console.log(`[LeadDataManager] Retrieved ${result.recordset.length} leads`);
      return result.recordset;
    } catch (error) {
      console.error('[LeadDataManager] Error fetching leads:', error.message);
      throw error;
    }
  }

  /**
   * Get lead by ID
   * @param {number|string} leadId - Lead ID
   * @returns {Object|null} Lead record or null if not found
   */
  async getLeadById(leadId) {
    const pool = await this.connect();

    try {
      const result = await pool.request()
        .input('leadId', sql.Int, leadId)
        .query('SELECT * FROM Leads WHERE LeadId = @leadId');

      return result.recordset[0] || null;
    } catch (error) {
      console.error(`[LeadDataManager] Error fetching lead ${leadId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get all emails from leads
   * @param {Object} filters - Optional filters
   * @returns {Array} Array of email addresses
   */
  async getEmails(filters = {}) {
    const pool = await this.connect();

    try {
      let query = `
        SELECT DISTINCT Email, FirstName, LastName, Company
        FROM Leads
        WHERE Email IS NOT NULL AND Email != ''
      `;

      if (filters.status) {
        query += ` AND Status = '${filters.status}'`;
      }

      query += ' ORDER BY Email';

      const result = await pool.request().query(query);
      console.log(`[LeadDataManager] Retrieved ${result.recordset.length} email addresses`);
      return result.recordset;
    } catch (error) {
      console.error('[LeadDataManager] Error fetching emails:', error.message);
      throw error;
    }
  }

  /**
   * Create a new lead
   * @param {Object} leadData - Lead data object
   * @returns {number} New lead ID
   */
  async createLead(leadData) {
    const pool = await this.connect();

    try {
      const columns = Object.keys(leadData);
      const values = columns.map(col => `@${col}`).join(', ');
      const columnsStr = columns.join(', ');

      const query = `
        INSERT INTO Leads (${columnsStr})
        OUTPUT INSERTED.LeadId
        VALUES (${values})
      `;

      const request = pool.request();
      columns.forEach(col => {
        request.input(col, leadData[col]);
      });

      const result = await request.query(query);
      const newLeadId = result.recordset[0].LeadId;

      console.log(`[LeadDataManager] Created new lead with ID: ${newLeadId}`);
      return newLeadId;
    } catch (error) {
      console.error('[LeadDataManager] Error creating lead:', error.message);
      throw error;
    }
  }

  /**
   * Update an existing lead
   * @param {number|string} leadId - Lead ID
   * @param {Object} updates - Fields to update
   * @returns {boolean} Success status
   */
  async updateLead(leadId, updates) {
    const pool = await this.connect();

    try {
      const setClause = Object.keys(updates)
        .map(key => `${key} = @${key}`)
        .join(', ');

      const query = `
        UPDATE Leads
        SET ${setClause}, ModifiedDate = GETDATE()
        WHERE LeadId = @leadId
      `;

      const request = pool.request();
      request.input('leadId', sql.Int, leadId);
      Object.keys(updates).forEach(key => {
        request.input(key, updates[key]);
      });

      const result = await request.query(query);
      const rowsAffected = result.rowsAffected[0];

      console.log(`[LeadDataManager] Updated lead ${leadId} (${rowsAffected} rows affected)`);
      return rowsAffected > 0;
    } catch (error) {
      console.error(`[LeadDataManager] Error updating lead ${leadId}:`, error.message);
      throw error;
    }
  }

  /**
   * Delete a lead (soft delete - mark as inactive)
   * @param {number|string} leadId - Lead ID
   * @returns {boolean} Success status
   */
  async deleteLead(leadId) {
    const pool = await this.connect();

    try {
      const result = await pool.request()
        .input('leadId', sql.Int, leadId)
        .query(`
          UPDATE Leads
          SET Status = 'Inactive', ModifiedDate = GETDATE()
          WHERE LeadId = @leadId
        `);

      console.log(`[LeadDataManager] Soft deleted lead ${leadId}`);
      return result.rowsAffected[0] > 0;
    } catch (error) {
      console.error(`[LeadDataManager] Error deleting lead ${leadId}:`, error.message);
      throw error;
    }
  }

  /**
   * Bulk import leads
   * @param {Array} leads - Array of lead objects
   * @returns {Object} Import statistics
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
          const columns = Object.keys(lead);
          const values = columns.map(col => `@${col}`).join(', ');
          const columnsStr = columns.join(', ');

          const query = `INSERT INTO Leads (${columnsStr}) VALUES (${values})`;

          columns.forEach(col => {
            request.input(col, lead[col]);
          });

          await request.query(query);
          stats.success++;
        } catch (error) {
          stats.failed++;
          stats.errors.push({ lead, error: error.message });
        }
      }

      await transaction.commit();
      console.log(`[LeadDataManager] Bulk import complete: ${stats.success} success, ${stats.failed} failed`);
      return stats;
    } catch (error) {
      await transaction.rollback();
      console.error('[LeadDataManager] Bulk import failed, transaction rolled back:', error.message);
      throw error;
    }
  }

  /**
   * Export leads to CSV format
   * @param {Object} filters - Optional filters
   * @returns {string} CSV string
   */
  async exportLeadsToCSV(filters = {}) {
    const leads = await this.getLeads(filters);

    if (leads.length === 0) {
      return '';
    }

    // Get headers from first record
    const headers = Object.keys(leads[0]);
    const csvRows = [];

    // Add header row
    csvRows.push(headers.join(','));

    // Add data rows
    for (const lead of leads) {
      const values = headers.map(header => {
        const value = lead[header];
        // Escape commas and quotes
        if (value === null || value === undefined) return '';
        const escaped = String(value).replace(/"/g, '""');
        return escaped.includes(',') ? `"${escaped}"` : escaped;
      });
      csvRows.push(values.join(','));
    }

    return csvRows.join('\n');
  }

  /**
   * Get database statistics
   * @returns {Object} Database statistics
   */
  async getStats() {
    const pool = await this.connect();

    try {
      const result = await pool.request().query(`
        SELECT
          COUNT(*) as TotalLeads,
          COUNT(DISTINCT Email) as UniqueEmails,
          SUM(CASE WHEN Status = 'Active' THEN 1 ELSE 0 END) as ActiveLeads,
          SUM(CASE WHEN Status = 'Converted' THEN 1 ELSE 0 END) as ConvertedLeads,
          SUM(CASE WHEN Email IS NOT NULL AND Email != '' THEN 1 ELSE 0 END) as LeadsWithEmail
        FROM Leads
      `);

      return result.recordset[0];
    } catch (error) {
      console.error('[LeadDataManager] Error fetching stats:', error.message);
      throw error;
    }
  }
}

// Export singleton instance
const leadDataManager = new LeadDataManager();

module.exports = leadDataManager;
