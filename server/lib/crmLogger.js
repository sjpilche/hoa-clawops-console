/**
 * CRM Logger for Lead Tracking
 *
 * Logs leads to JSON files for CRM tracking:
 * - hot-leads.json (15+ points)
 * - warm-leads.json (8-14 points)
 * - general-leads.json (0-7 points)
 * - all-leads.json (complete history)
 *
 * Each lead record includes:
 * - Contact information
 * - Project details
 * - Scoring data
 * - Status tracking
 * - Timestamps
 */

const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class CRMLogger {
  constructor() {
    this.leadsDir = path.join(process.cwd(), 'data', 'leads');
    this.hotLeadsFile = path.join(this.leadsDir, 'hot-leads.json');
    this.warmLeadsFile = path.join(this.leadsDir, 'warm-leads.json');
    this.generalLeadsFile = path.join(this.leadsDir, 'general-leads.json');
    this.allLeadsFile = path.join(this.leadsDir, 'all-leads.json');
  }

  /**
   * Initialize leads directory and files
   */
  async init() {
    await fs.mkdir(this.leadsDir, { recursive: true });

    // Create files if they don't exist
    for (const file of [this.hotLeadsFile, this.warmLeadsFile, this.generalLeadsFile, this.allLeadsFile]) {
      try {
        await fs.access(file);
      } catch {
        await fs.writeFile(file, JSON.stringify({ leads: [] }, null, 2));
      }
    }
  }

  /**
   * Log lead to appropriate files based on score
   * @param {Object} leadData - Raw lead data from form
   * @param {Object} scoringResult - Lead scoring results
   * @param {Object} espResult - ESP integration results
   * @returns {Object} - Complete lead record with UUID
   */
  async logLead(leadData, scoringResult, espResult) {
    await this.init();

    // Create full lead record
    const leadRecord = {
      id: uuidv4(),
      date: new Date().toISOString(),

      // Contact info
      name: leadData.name,
      email: leadData.email,
      phone: leadData.phone || null,

      // HOA details
      hoa_name: leadData.hoa_name,
      hoa_units: leadData.hoa_units || null,

      // Project details
      project_type: leadData.project_type || 'not_specified',
      project_description: leadData.project_description || null,
      estimated_amount: leadData.estimated_amount || null,
      project_urgency: leadData.project_urgency || null,
      current_reserve_fund: leadData.current_reserve_fund || null,
      message: leadData.message || null,

      // Lead scoring
      score: scoringResult.score,
      priority: scoringResult.priority,
      keywords: scoringResult.keywords,
      urgency_signals: scoringResult.urgency_signals,
      scoring_points: scoringResult.points,

      // Source tracking
      source: 'wordpress-form',
      source_url: leadData.source_url || null,
      form_id: leadData.form_id || null,

      // Status tracking
      status: 'new',
      esp_added: espResult.success,
      esp_provider: 'sendgrid',
      esp_tags: espResult.tags || [],
      nurture_sequence_started: espResult.success,
      telegram_sent: false, // Will be updated after Telegram call
      follow_up_drafted: false, // Will be updated if hot lead

      // Timestamps
      contacted_at: null,
      converted_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Add to appropriate score-based file
    let scoreFile;
    if (scoringResult.score === 'hot') {
      scoreFile = this.hotLeadsFile;
    } else if (scoringResult.score === 'warm') {
      scoreFile = this.warmLeadsFile;
    } else {
      scoreFile = this.generalLeadsFile;
    }

    await this._appendToFile(scoreFile, leadRecord);

    // Add to all-leads file
    await this._appendToFile(this.allLeadsFile, leadRecord);

    return leadRecord;
  }

  /**
   * Append lead to JSON file
   * @private
   */
  async _appendToFile(filePath, leadRecord) {
    const content = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(content);

    data.leads.push(leadRecord);

    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  }

  /**
   * Update lead status and metadata
   * @param {string} leadId - UUID of lead to update
   * @param {Object} updates - Fields to update
   * @returns {Object|null} - Updated lead record or null if not found
   */
  async updateLeadStatus(leadId, updates) {
    // Update in all-leads file
    const content = await fs.readFile(this.allLeadsFile, 'utf8');
    const data = JSON.parse(content);

    const lead = data.leads.find(l => l.id === leadId);
    if (lead) {
      Object.assign(lead, updates);
      lead.updated_at = new Date().toISOString();

      await fs.writeFile(this.allLeadsFile, JSON.stringify(data, null, 2));
      return lead;
    }

    return null;
  }

  /**
   * Get lead by ID
   * @param {string} leadId - UUID of lead
   * @returns {Object|undefined} - Lead record or undefined
   */
  async getLead(leadId) {
    const content = await fs.readFile(this.allLeadsFile, 'utf8');
    const data = JSON.parse(content);
    return data.leads.find(l => l.id === leadId);
  }

  /**
   * Get recent leads
   * @param {number} limit - Max number of leads to return
   * @param {string} score - Filter by score (hot/warm/general) or null for all
   * @returns {Array} - Array of lead records (most recent first)
   */
  async getRecentLeads(limit = 50, score = null) {
    let file = this.allLeadsFile;

    if (score === 'hot') file = this.hotLeadsFile;
    else if (score === 'warm') file = this.warmLeadsFile;
    else if (score === 'general') file = this.generalLeadsFile;

    const content = await fs.readFile(file, 'utf8');
    const data = JSON.parse(content);

    // Return most recent first
    return data.leads.slice(-limit).reverse();
  }
}

module.exports = CRMLogger;
