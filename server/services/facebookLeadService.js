/**
 * Facebook Lead Generation Service
 * Retrieves leads from Facebook Lead Ads for HOA Project Funding
 */

const axios = require('axios');
const { run, get, all } = require('../db/connection');
const { AuditService } = require('./auditService');

class FacebookLeadService {
  constructor() {
    this.pageId = process.env.FACEBOOK_PAGE_ID;
    this.accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
    this.apiVersion = process.env.FACEBOOK_GRAPH_API_VERSION || 'v22.0';
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
    this.pollInterval = parseInt(process.env.FACEBOOK_LEAD_POLL_INTERVAL) || 300000; // 5 minutes default
    this.isPolling = false;
    this.pollTimer = null;
  }

  /**
   * Get all lead forms associated with the Facebook Page
   */
  async getLeadForms() {
    try {
      const url = `${this.baseUrl}/${this.pageId}/leadgen_forms`;
      const response = await axios.get(url, {
        params: {
          access_token: this.accessToken,
          fields: 'id,name,status,leads_count,created_time'
        }
      });

      await AuditService.log({
        action: 'facebook.get_lead_forms',
        resource: 'facebook_api',
        details: { form_count: response.data.data.length }
      });

      return response.data.data;
    } catch (error) {
      console.error('[FacebookLeadService] Error fetching lead forms:', error.response?.data || error.message);
      throw new Error(`Failed to fetch lead forms: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Get leads from a specific lead form
   */
  async getLeadsFromForm(formId, limit = 100) {
    try {
      const url = `${this.baseUrl}/${formId}/leads`;
      const response = await axios.get(url, {
        params: {
          access_token: this.accessToken,
          fields: 'id,created_time,field_data',
          limit: limit
        }
      });

      return response.data.data;
    } catch (error) {
      console.error(`[FacebookLeadService] Error fetching leads from form ${formId}:`, error.response?.data || error.message);
      throw new Error(`Failed to fetch leads: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Parse lead data into a standardized format
   */
  parseLeadData(rawLead) {
    const leadData = {
      facebook_lead_id: rawLead.id,
      created_time: rawLead.created_time,
      raw_data: {}
    };

    // Parse field_data array into key-value pairs
    rawLead.field_data.forEach(field => {
      const fieldName = field.name.toLowerCase().replace(/\s+/g, '_');
      leadData.raw_data[fieldName] = field.values[0];

      // Map common fields
      if (fieldName === 'full_name' || fieldName === 'name') {
        leadData.name = field.values[0];
      } else if (fieldName === 'email') {
        leadData.email = field.values[0];
      } else if (fieldName === 'phone_number' || fieldName === 'phone') {
        leadData.phone = field.values[0];
      } else if (fieldName === 'company_name' || fieldName === 'company') {
        leadData.company = field.values[0];
      }
    });

    return leadData;
  }

  /**
   * Store lead in the database
   */
  async storeLead(leadData, formId, formName) {
    try {
      // Check if lead already exists
      const existing = get(`
        SELECT id FROM leads WHERE facebook_lead_id = ?
      `, [leadData.facebook_lead_id]);

      if (existing) {
        console.log(`[FacebookLeadService] Lead ${leadData.facebook_lead_id} already exists, skipping`);
        return existing.id;
      }

      // Insert new lead
      const result = run(`
        INSERT INTO leads (
          source,
          name,
          email,
          phone,
          company,
          raw_data,
          facebook_lead_id,
          status,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        `facebook_${formName}`,
        leadData.name || null,
        leadData.email || null,
        leadData.phone || null,
        leadData.company || null,
        JSON.stringify(leadData.raw_data),
        leadData.facebook_lead_id,
        'new',
        leadData.created_time
      ]);

      // Get the last inserted ID
      const insertedLead = get('SELECT last_insert_rowid() as id');
      const leadId = insertedLead.id;

      await AuditService.log({
        action: 'facebook.lead_created',
        resource: 'leads',
        resource_id: leadId,
        details: {
          facebook_lead_id: leadData.facebook_lead_id,
          form_id: formId,
          form_name: formName,
          email: leadData.email
        }
      });

      console.log(`[FacebookLeadService] Stored new lead: ${leadData.facebook_lead_id} (DB ID: ${leadId})`);
      return leadId;
    } catch (error) {
      console.error('[FacebookLeadService] Error storing lead:', error);
      throw error;
    }
  }

  /**
   * Sync all leads from all active forms
   */
  async syncAllLeads() {
    try {
      console.log('[FacebookLeadService] Starting lead sync...');

      const forms = await this.getLeadForms();
      const activeForms = forms.filter(form => form.status === 'ACTIVE');

      console.log(`[FacebookLeadService] Found ${activeForms.length} active lead forms`);

      let totalNewLeads = 0;

      for (const form of activeForms) {
        try {
          const rawLeads = await this.getLeadsFromForm(form.id);
          console.log(`[FacebookLeadService] Form "${form.name}": Found ${rawLeads.length} leads`);

          for (const rawLead of rawLeads) {
            const parsedLead = this.parseLeadData(rawLead);
            await this.storeLead(parsedLead, form.id, form.name);
            totalNewLeads++;
          }
        } catch (formError) {
          console.error(`[FacebookLeadService] Error syncing form ${form.id}:`, formError.message);
          // Continue with other forms even if one fails
        }
      }

      await AuditService.log({
        action: 'facebook.sync_completed',
        resource: 'facebook_api',
        details: {
          forms_synced: activeForms.length,
          new_leads: totalNewLeads
        }
      });

      console.log(`[FacebookLeadService] Sync completed. Total new leads: ${totalNewLeads}`);
      return { forms: activeForms.length, newLeads: totalNewLeads };
    } catch (error) {
      console.error('[FacebookLeadService] Error during sync:', error);
      throw error;
    }
  }

  /**
   * Start automatic polling for new leads
   */
  startPolling() {
    if (this.isPolling) {
      console.log('[FacebookLeadService] Polling already active');
      return;
    }

    console.log(`[FacebookLeadService] Starting polling every ${this.pollInterval / 1000} seconds`);
    this.isPolling = true;

    // Initial sync
    this.syncAllLeads().catch(err => {
      console.error('[FacebookLeadService] Initial sync failed:', err);
    });

    // Set up recurring sync
    this.pollTimer = setInterval(() => {
      this.syncAllLeads().catch(err => {
        console.error('[FacebookLeadService] Scheduled sync failed:', err);
      });
    }, this.pollInterval);
  }

  /**
   * Stop automatic polling
   */
  stopPolling() {
    if (!this.isPolling) {
      return;
    }

    console.log('[FacebookLeadService] Stopping polling');
    this.isPolling = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Process a single lead from webhook notification
   * Called when Facebook sends us a webhook event about a new lead
   */
  async processWebhookLead(leadgenId, formId) {
    try {
      console.log(`[FacebookLeadService] Processing webhook lead: ${leadgenId}`);

      // Fetch the full lead data from Facebook
      const url = `${this.baseUrl}/${leadgenId}`;
      const response = await axios.get(url, {
        params: {
          access_token: this.accessToken,
          fields: 'id,created_time,field_data'
        }
      });

      const rawLead = response.data;

      // Get form name for better tracking
      let formName = `Form_${formId}`;
      try {
        const formResponse = await axios.get(`${this.baseUrl}/${formId}`, {
          params: {
            access_token: this.accessToken,
            fields: 'name'
          }
        });
        formName = formResponse.data.name || formName;
      } catch (error) {
        console.warn(`[FacebookLeadService] Could not fetch form name for ${formId}`);
      }

      // Parse and store the lead
      const parsedLead = this.parseLeadData(rawLead);
      const leadId = await this.storeLead(parsedLead, formId, formName);

      await AuditService.log({
        action: 'facebook.webhook_lead_received',
        resource: 'leads',
        resource_id: leadId,
        details: {
          facebook_lead_id: leadgenId,
          form_id: formId,
          form_name: formName,
          source: 'webhook'
        }
      });

      console.log(`[FacebookLeadService] ✅ Webhook lead ${leadgenId} stored successfully as lead ID ${leadId}`);
      return leadId;
    } catch (error) {
      console.error(`[FacebookLeadService] Error processing webhook lead ${leadgenId}:`, error);
      throw error;
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      isPolling: this.isPolling,
      pollInterval: this.pollInterval,
      pageId: this.pageId,
      configured: !!(this.pageId && this.accessToken)
    };
  }

  /**
   * Test Facebook API connection
   */
  async testConnection() {
    try {
      const url = `${this.baseUrl}/${this.pageId}`;
      const response = await axios.get(url, {
        params: {
          access_token: this.accessToken,
          fields: 'id,name'
        }
      });

      return {
        success: true,
        page: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message
      };
    }
  }
}

// Singleton instance
const facebookLeadService = new FacebookLeadService();

module.exports = { facebookLeadService, FacebookLeadService };
