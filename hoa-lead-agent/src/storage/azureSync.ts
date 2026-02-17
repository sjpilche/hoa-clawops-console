/**
 * @file azureSync.ts
 * @description Syncs HOA leads to Azure SQL Database (empcapmaster2)
 * Pushes leads to the hoa_contacts table in the ClawOps database
 */

import { Lead } from './db';
import { logger } from '../utils/logger';

const sql = require('mssql');

// Azure SQL configuration from environment
const azureConfig = {
  server: process.env.AZURE_SQL_SERVER || 'empirecapital.database.windows.net',
  database: process.env.AZURE_SQL_DATABASE || 'empcapmaster2',
  user: process.env.AZURE_SQL_USER || 'CloudSA1f77fc9b',
  password: process.env.AZURE_SQL_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: false,
    enableArithAbort: true,
    connectTimeout: 30000,
    requestTimeout: 30000,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

// Connection pool
let pool: any = null;

/**
 * Get or create Azure SQL connection pool
 */
async function getPool() {
  if (!pool) {
    logger.info('Connecting to Azure SQL Database...');
    pool = await sql.connect(azureConfig);
    logger.info('✅ Connected to Azure SQL');
  }
  return pool;
}

/**
 * Generate fingerprint for deduplication
 */
function generateFingerprint(lead: Partial<Lead>): string {
  const parts = [
    lead.company_name?.toLowerCase().replace(/[^a-z0-9]/g, ''),
    lead.city?.toLowerCase(),
    lead.state?.toLowerCase(),
  ];
  return parts.filter(Boolean).join('_');
}

/**
 * Map Lead to hoa_contacts table schema
 */
function mapLeadToHOAContact(lead: Partial<Lead>) {
  return {
    // HOA Information (we're storing HOA management companies, not HOAs themselves)
    hoa_name: lead.company_name || 'Unknown',
    entity_number: null, // Not applicable for management companies

    // Contact Information
    contact_person: lead.contact_name || null,
    title: lead.contact_title || null,
    email: lead.primary_email || null,
    phone: lead.phone || null,

    // Property Information
    property_address: null, // Management company address
    city: lead.city || null,
    state: lead.state || null,
    zip: lead.zip || null,
    unit_count: lead.number_of_hoas_managed || null,

    // Management Company
    management_company: lead.company_name || null,

    // Source & Quality
    source_url: lead.website || 'Google Maps',
    source_type: 'hoa_lead_agent', // Mark as coming from this automated agent
    confidence_score: lead.signal_score ? lead.signal_score * 10 : 50, // Convert 0-10 to 0-100

    // Status
    status: 'new',
    notes: `Collected by HOA Lead Agent from ${lead.source || 'Google Maps'}. Signal score: ${lead.signal_score || 0}/10. Email enriched via Hunter.io.`,

    // Deduplication
    fingerprint: generateFingerprint(lead),
  };
}

/**
 * Sync a single lead to Azure SQL
 */
export async function syncLeadToAzure(lead: Partial<Lead>): Promise<{ synced: boolean; existed: boolean }> {
  try {
    const pool = await getPool();
    const contact = mapLeadToHOAContact(lead);

    // Check if contact already exists
    const checkResult = await pool
      .request()
      .input('fingerprint', sql.NVarChar, contact.fingerprint)
      .query('SELECT id FROM hoa_contacts WHERE fingerprint = @fingerprint');

    if (checkResult.recordset.length > 0) {
      // Update existing contact
      const contactId = checkResult.recordset[0].id;

      await pool
        .request()
        .input('id', sql.Int, contactId)
        .input('contact_person', sql.NVarChar, contact.contact_person)
        .input('title', sql.NVarChar, contact.title)
        .input('email', sql.NVarChar, contact.email)
        .input('phone', sql.NVarChar, contact.phone)
        .input('confidence_score', sql.Int, contact.confidence_score)
        .input('notes', sql.NVarChar, contact.notes)
        .query(`
          UPDATE hoa_contacts
          SET contact_person = COALESCE(@contact_person, contact_person),
              title = COALESCE(@title, title),
              email = COALESCE(@email, email),
              phone = COALESCE(@phone, phone),
              confidence_score = @confidence_score,
              notes = @notes,
              updated_at = GETDATE()
          WHERE id = @id
        `);

      logger.debug(`Updated existing contact in Azure: ${contact.hoa_name}`);
      return { synced: true, existed: true };
    } else {
      // Insert new contact
      await pool
        .request()
        .input('hoa_name', sql.NVarChar, contact.hoa_name)
        .input('entity_number', sql.NVarChar, contact.entity_number)
        .input('contact_person', sql.NVarChar, contact.contact_person)
        .input('title', sql.NVarChar, contact.title)
        .input('email', sql.NVarChar, contact.email)
        .input('phone', sql.NVarChar, contact.phone)
        .input('property_address', sql.NVarChar, contact.property_address)
        .input('city', sql.NVarChar, contact.city)
        .input('state', sql.NVarChar, contact.state)
        .input('zip', sql.NVarChar, contact.zip)
        .input('unit_count', sql.Int, contact.unit_count)
        .input('management_company', sql.NVarChar, contact.management_company)
        .input('source_url', sql.NVarChar, contact.source_url)
        .input('source_type', sql.NVarChar, contact.source_type)
        .input('confidence_score', sql.Int, contact.confidence_score)
        .input('status', sql.NVarChar, contact.status)
        .input('notes', sql.NVarChar, contact.notes)
        .input('fingerprint', sql.NVarChar, contact.fingerprint)
        .query(`
          INSERT INTO hoa_contacts (
            hoa_name, entity_number, contact_person, title, email, phone,
            property_address, city, state, zip, unit_count, management_company,
            source_url, source_type, confidence_score, status, notes, fingerprint,
            scraped_at, updated_at
          ) VALUES (
            @hoa_name, @entity_number, @contact_person, @title, @email, @phone,
            @property_address, @city, @state, @zip, @unit_count, @management_company,
            @source_url, @source_type, @confidence_score, @status, @notes, @fingerprint,
            GETDATE(), GETDATE()
          )
        `);

      logger.info(`✅ Synced new contact to Azure: ${contact.hoa_name} (${contact.email || 'no email'})`);
      return { synced: true, existed: false };
    }
  } catch (error: any) {
    logger.error(`❌ Azure sync error for ${lead.company_name}: ${error.message}`);
    return { synced: false, existed: false };
  }
}

/**
 * Sync multiple leads to Azure SQL
 */
export async function syncLeadsToAzure(leads: Partial<Lead>[]): Promise<{
  total: number;
  synced: number;
  updated: number;
  failed: number;
}> {
  const stats = { total: leads.length, synced: 0, updated: 0, failed: 0 };

  logger.info(`\n🔄 Syncing ${leads.length} leads to Azure SQL Database...`);

  for (const lead of leads) {
    const result = await syncLeadToAzure(lead);

    if (result.synced) {
      if (result.existed) {
        stats.updated++;
      } else {
        stats.synced++;
      }
    } else {
      stats.failed++;
    }
  }

  logger.info(`\n✅ Azure Sync Complete:`);
  logger.info(`   New: ${stats.synced} | Updated: ${stats.updated} | Failed: ${stats.failed}`);

  return stats;
}

/**
 * Get Azure SQL connection stats
 */
export async function getAzureStats(): Promise<{
  total: number;
  withEmail: number;
  highValue: number;
  byState: Record<string, number>;
}> {
  try {
    const pool = await getPool();

    // Total contacts
    const totalResult = await pool.request().query('SELECT COUNT(*) as count FROM hoa_contacts');
    const total = totalResult.recordset[0].count;

    // Contacts with email
    const emailResult = await pool.request().query('SELECT COUNT(*) as count FROM hoa_contacts WHERE email IS NOT NULL');
    const withEmail = emailResult.recordset[0].count;

    // High-value contacts (score >= 80)
    const highValueResult = await pool.request().query('SELECT COUNT(*) as count FROM hoa_contacts WHERE confidence_score >= 80');
    const highValue = highValueResult.recordset[0].count;

    // By state
    const stateResult = await pool.request().query('SELECT state, COUNT(*) as count FROM hoa_contacts GROUP BY state ORDER BY count DESC');
    const byState: Record<string, number> = {};
    stateResult.recordset.forEach((row: any) => {
      if (row.state) {
        byState[row.state] = row.count;
      }
    });

    return { total, withEmail, highValue, byState };
  } catch (error: any) {
    logger.error(`Error getting Azure stats: ${error.message}`);
    return { total: 0, withEmail: 0, highValue: 0, byState: {} };
  }
}

/**
 * Close Azure SQL connection
 */
export async function closeAzureConnection() {
  if (pool) {
    await pool.close();
    pool = null;
    logger.info('Azure SQL connection closed');
  }
}
