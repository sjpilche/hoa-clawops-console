/**
 * Telegram Notification System for Lead Alerts
 *
 * Sends formatted lead notifications to Telegram with:
 * - Lead score emoji (🔥 Hot / 🌟 Warm / 💬 General)
 * - Contact information
 * - Project details
 * - Urgency signals
 * - Action checklist
 */

const axios = require('axios');

/**
 * Send lead notification to Telegram
 * @param {Object} leadData - Lead information from form
 * @param {Object} scoringResult - Lead scoring results
 * @returns {Object} - { success, message_id } or { success: false, reason }
 */
async function sendLeadNotification(leadData, scoringResult) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.warn('[Telegram] Not configured - skipping notification');
    return { success: false, reason: 'not_configured' };
  }

  const message = formatLeadMessage(leadData, scoringResult);

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  try {
    const response = await axios.post(url, {
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });

    return {
      success: true,
      message_id: response.data.result.message_id
    };
  } catch (error) {
    console.error('[Telegram] Failed to send notification:', error.message);
    return {
      success: false,
      reason: error.message
    };
  }
}

/**
 * Format lead data into Telegram message with Markdown
 * @param {Object} leadData - Lead information
 * @param {Object} scoringResult - Scoring results
 * @returns {string} - Formatted message
 */
function formatLeadMessage(leadData, scoringResult) {
  const emoji = scoringResult.score === 'hot' ? '🔥' : scoringResult.score === 'warm' ? '🌟' : '💬';
  const scoreLabel = scoringResult.score.toUpperCase();

  let message = `${emoji} *${scoreLabel} LEAD* - WordPress Form Submission\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Contact info
  message += `*Contact*: ${leadData.name}\n`;
  message += `*Email*: ${leadData.email}\n`;
  if (leadData.phone) {
    message += `*Phone*: ${leadData.phone}\n`;
  }
  message += `\n`;

  // HOA details
  message += `*HOA*: ${leadData.hoa_name}\n`;
  if (leadData.hoa_units) {
    message += `*Units*: ${leadData.hoa_units}\n`;
  }
  message += `\n`;

  // Project details
  if (leadData.project_type) {
    message += `*Project*: ${leadData.project_type.replace(/_/g, ' ')}\n`;
  }
  if (leadData.estimated_amount) {
    message += `*Estimated Amount*: $${leadData.estimated_amount.toLocaleString()}\n`;
  }
  if (leadData.project_urgency) {
    message += `*Timeline*: ${leadData.project_urgency.replace(/_/g, ' ')}\n`;
  }
  message += `\n`;

  // Message
  if (leadData.message) {
    const truncated = leadData.message.length > 300
      ? leadData.message.substring(0, 300) + '...'
      : leadData.message;
    message += `*Message*:\n${truncated}\n\n`;
  }

  // Scoring details
  if (scoringResult.urgency_signals.length > 0) {
    message += `*Urgency Signals*:\n`;
    scoringResult.urgency_signals.forEach(signal => {
      message += `• ${signal}\n`;
    });
    message += `\n`;
  }

  if (scoringResult.keywords.length > 0) {
    message += `*Keywords*: ${scoringResult.keywords.slice(0, 5).join(', ')}\n\n`;
  }

  // Actions taken
  message += `*Actions*:\n`;
  message += `✅ Added to SendGrid nurture sequence\n`;
  message += `✅ Logged to CRM\n`;
  if (scoringResult.score === 'hot') {
    message += `✅ Personalized follow-up drafted\n`;
  }
  message += `\n`;

  // Next steps
  message += `*Next Steps*:\n`;
  if (scoringResult.score === 'hot') {
    message += `⚡ *RESPOND WITHIN 2 HOURS*\n`;
    message += `• Review drafted follow-up email\n`;
    message += `• Call lead if phone provided\n`;
    message += `• Schedule consultation call\n`;
  } else {
    message += `• Lead will receive Day 0 welcome email\n`;
    message += `• Monitor engagement with nurture sequence\n`;
    message += `• Follow up if high engagement detected\n`;
  }

  message += `\n━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  message += `🕐 ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} EST`;

  return message;
}

module.exports = { sendLeadNotification };
