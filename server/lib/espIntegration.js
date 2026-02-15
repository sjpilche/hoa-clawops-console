/**
 * SendGrid ESP Integration for Lead Capture
 *
 * Adds leads to SendGrid contact lists with smart tagging:
 * - Lead score tags (hot/warm/general)
 * - Project type tags
 * - Funding range tags
 * - Urgency tags
 * - Source tags
 *
 * Once added, SendGrid automation triggers 6-email nurture sequence
 */

const axios = require('axios');

/**
 * Add lead to SendGrid contact list with tags and custom fields
 * @param {Object} leadData - Lead information from form
 * @param {Object} scoringResult - Lead scoring results
 * @returns {Object} - { success, provider, list_id, job_id, tags }
 */
async function addLeadToSendGrid(leadData, scoringResult) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const apiSecret = process.env.SENDGRID_API_SECRET;
  const listId = process.env.SENDGRID_LIST_ID;

  if (!apiKey || !listId) {
    throw new Error('SendGrid credentials not configured');
  }

  // Twilio SendGrid uses Basic Auth with SID:Secret
  const authToken = Buffer.from(`${apiKey}:${apiSecret || ''}`).toString('base64');

  // Generate tags based on lead characteristics
  const tags = generateTags(leadData, scoringResult);

  // Parse name into first/last
  const [firstName, ...lastNameParts] = leadData.name.split(' ');
  const lastName = lastNameParts.join(' ');

  // Add contact to SendGrid
  const url = 'https://api.sendgrid.com/v3/marketing/contacts';

  const response = await axios.put(url, {
    list_ids: [listId],
    contacts: [{
      email: leadData.email,
      first_name: firstName,
      last_name: lastName,
      custom_fields: {
        hoa_name: leadData.hoa_name,
        project_type: leadData.project_type || '',
        estimated_amount: leadData.estimated_amount || 0,
        phone: leadData.phone || '',
        lead_score: scoringResult.score,
        urgency_level: leadData.project_urgency || ''
      }
    }]
  }, {
    headers: {
      // Twilio SendGrid supports both Bearer and Basic Auth
      'Authorization': apiSecret ? `Basic ${authToken}` : `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  return {
    success: true,
    provider: 'sendgrid',
    list_id: listId,
    job_id: response.data.job_id,
    tags
  };
}

/**
 * Generate tags based on lead characteristics
 * @param {Object} leadData - Lead information
 * @param {Object} scoringResult - Scoring results
 * @returns {Array<string>} - Array of tag strings
 */
function generateTags(leadData, scoringResult) {
  const tags = [];

  // Lead score tags
  tags.push(`lead-score-${scoringResult.score}`); // hot, warm, general

  // Project type tags
  if (leadData.project_type) {
    tags.push(`project-${leadData.project_type}`);
  }

  // Funding range tags
  if (leadData.estimated_amount) {
    if (leadData.estimated_amount >= 500000) {
      tags.push('funding-range-500k-plus');
    } else if (leadData.estimated_amount >= 250000) {
      tags.push('funding-range-250k-500k');
    } else if (leadData.estimated_amount >= 100000) {
      tags.push('funding-range-100k-250k');
    } else {
      tags.push('funding-range-under-100k');
    }
  }

  // Urgency tags
  if (leadData.project_urgency) {
    tags.push(`urgency-${leadData.project_urgency}`);
  }

  // Source tag
  tags.push('source-wordpress-form');

  // Special assessment concern tag
  if (leadData.special_assessment_concerns) {
    tags.push('special-assessment-concerns');
  }

  return tags;
}

module.exports = { addLeadToSendGrid };
