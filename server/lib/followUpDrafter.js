/**
 * Follow-up Email Drafter for Hot Leads
 *
 * Generates personalized follow-up emails for leads scoring 15+ points
 * Emails are saved as markdown files for manual review and sending
 *
 * Email structure:
 * - Personalized greeting
 * - Project-specific guidance
 * - Financing options explanation
 * - Clear call-to-action
 * - Internal notes with scoring details
 */

const fs = require('fs').promises;
const path = require('path');

class FollowUpDrafter {
  constructor() {
    this.draftsDir = path.join(process.cwd(), 'data', 'leads', 'drafts');
  }

  async init() {
    await fs.mkdir(this.draftsDir, { recursive: true });
  }

  /**
   * Draft personalized follow-up email for hot lead
   * @param {Object} leadRecord - Complete lead record with scoring
   * @returns {string} - Path to drafted email file
   */
  async draftFollowUp(leadRecord) {
    await this.init();

    const email = this._generateEmail(leadRecord);
    const fileName = `follow-up-${leadRecord.id}-${Date.now()}.md`;
    const filePath = path.join(this.draftsDir, fileName);

    await fs.writeFile(filePath, email);

    return filePath;
  }

  /**
   * Generate personalized email content
   * @private
   */
  _generateEmail(lead) {
    const firstName = lead.name.split(' ')[0];
    const projectType = lead.project_type ? lead.project_type.replace(/_/g, ' ') : 'project';
    const amount = lead.estimated_amount ? `$${lead.estimated_amount.toLocaleString()}` : 'your project';

    let email = '';

    // Email metadata
    email += `---\n`;
    email += `To: ${lead.email}\n`;
    email += `Subject: Re: Financing for ${lead.hoa_name} - ${projectType}\n`;
    email += `Lead ID: ${lead.id}\n`;
    email += `Generated: ${new Date().toISOString()}\n`;
    email += `---\n\n`;

    // Email body
    email += `Hi ${firstName},\n\n`;

    email += `Thank you for reaching out about financing options for ${lead.hoa_name}. `;

    // Personalize based on project details
    if (lead.project_urgency === 'immediate' || lead.project_urgency === 'within_3_months') {
      email += `I understand you're working on a tight timeline, so I wanted to get back to you right away.\n\n`;
    } else {
      email += `I'm glad to help you explore your options.\n\n`;
    }

    // Project-specific guidance
    if (lead.estimated_amount) {
      if (lead.estimated_amount >= 250000) {
        email += `For a ${projectType} in the ${amount} range, `;
        email += `you typically have three main financing options:\n\n`;
        email += `1. **Reserve Fund Loan** - If your reserves can serve as collateral (typically need 30-50% of project cost in reserves)\n`;
        email += `2. **Assessment-Backed Bonds** - Spread costs over 10-15 years with low monthly assessments\n`;
        email += `3. **HOA Line of Credit** - Flexible option if the project will be completed in phases\n\n`;
      } else {
        email += `For a ${projectType} around ${amount}, `;
        email += `you likely have a few good financing options depending on your HOA's reserve fund balance and credit profile.\n\n`;
      }
    }

    // Address special assessment concerns
    if (lead.special_assessment_concerns) {
      email += `I noticed you mentioned concerns about special assessments. `;
      email += `The good news is that all three financing options I mentioned allow you to avoid large one-time special assessments by spreading the cost over time. `;
      email += `This makes major projects much more manageable for homeowners.\n\n`;
    }

    // Reserve fund context
    if (lead.current_reserve_fund && lead.estimated_amount) {
      const reserveRatio = lead.current_reserve_fund / lead.estimated_amount;
      if (reserveRatio < 0.3) {
        email += `Based on your reserve fund balance, an assessment-backed bond or line of credit would likely be the best fit, `;
        email += `as these don't require significant reserves as collateral.\n\n`;
      } else {
        email += `With your current reserve fund level, you may qualify for a reserve fund loan, which typically offers the most favorable terms.\n\n`;
      }
    }

    // Call to action
    email += `**Next Steps:**\n\n`;

    if (lead.project_urgency === 'immediate') {
      email += `Given your timeline, I'd suggest we schedule a call this week to discuss your HOA's specific situation and get the approval process started. `;
    } else {
      email += `I'd be happy to schedule a brief consultation call (15-20 minutes) to discuss your HOA's specific situation and help you determine which financing option makes the most sense. `;
    }

    email += `No obligation - just a chance to answer your questions and provide some clarity on the process.\n\n`;

    email += `You can book a time here: [CALENDAR LINK]\n`;
    email += `Or reply to this email with a few times that work for you.\n\n`;

    // Urgency for hot leads
    if (lead.urgency_signals.length > 0) {
      email += `*I typically respond to consultations within 24 hours, so we can move quickly once you're ready.*\n\n`;
    }

    // Closing
    email += `Looking forward to helping ${lead.hoa_name} fund this ${projectType}!\n\n`;

    email += `Best regards,\n`;
    email += `[Your Name]\n`;
    email += `HOA Project Funding\n`;
    email += `contact@hoaprojectfunding.com\n`;
    email += `[Phone Number]\n\n`;

    // Footer with internal notes
    email += `---\n\n`;
    email += `## Internal Notes\n\n`;
    email += `**Lead Score**: ${lead.score.toUpperCase()} (${lead.scoring_points} points)\n\n`;

    if (lead.urgency_signals.length > 0) {
      email += `**Urgency Signals**:\n`;
      lead.urgency_signals.forEach(signal => {
        email += `- ${signal}\n`;
      });
      email += `\n`;
    }

    if (lead.keywords.length > 0) {
      email += `**Keywords**: ${lead.keywords.join(', ')}\n\n`;
    }

    email += `**Original Message**:\n`;
    email += `> ${lead.message || '(No message provided)'}\n\n`;

    return email;
  }
}

module.exports = FollowUpDrafter;
