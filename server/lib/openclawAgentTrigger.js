/**
 * OpenClaw Agent Trigger Service
 *
 * Automatically triggers OpenClaw agents (hoa-content-writer, hoa-email-campaigns)
 * when hot leads are captured through the webhook
 *
 * Agents generate:
 * - Personalized outreach emails
 * - 2-touch follow-up sequences
 */

const { spawn } = require('child_process');
const path = require('path');

class OpenClawAgentTrigger {
  constructor() {
    this.openclawPath = '/home/sjpilche/projects/openclaw-v1';
  }

  /**
   * Trigger both OpenClaw agents for a hot lead
   * @param {Object} leadRecord - Complete lead record with scoring
   * @returns {Object} - Status of agent triggers
   */
  async triggerHotLeadAgents(leadRecord) {
    const results = {
      outreach_triggered: false,
      sequence_triggered: false,
      errors: []
    };

    // Only trigger for hot leads (15+ points)
    if (leadRecord.score !== 'hot') {
      return results;
    }

    try {
      // Trigger hoa-content-writer for outreach
      const outreachResult = await this._triggerOutreachAgent(leadRecord);
      results.outreach_triggered = outreachResult.success;
      if (!outreachResult.success) {
        results.errors.push(`Outreach: ${outreachResult.error}`);
      }
    } catch (error) {
      results.errors.push(`Outreach exception: ${error.message}`);
    }

    try {
      // Trigger hoa-email-campaigns for 2-touch sequence
      const sequenceResult = await this._triggerSequenceAgent(leadRecord);
      results.sequence_triggered = sequenceResult.success;
      if (!sequenceResult.success) {
        results.errors.push(`Sequence: ${sequenceResult.error}`);
      }
    } catch (error) {
      results.errors.push(`Sequence exception: ${error.message}`);
    }

    return results;
  }

  /**
   * Trigger hoa-content-writer agent for outreach
   * @private
   */
  async _triggerOutreachAgent(lead) {
    const firstName = lead.name.split(' ')[0];
    const projectType = lead.project_type ? lead.project_type.replace(/_/g, ' ') : 'project';
    const amount = lead.estimated_amount ? `$${lead.estimated_amount.toLocaleString()}` : '';
    const urgency = lead.project_urgency || 'standard';

    // Build urgency signals string
    const signals = [];
    if (lead.urgency_signals && lead.urgency_signals.length > 0) {
      signals.push(...lead.urgency_signals);
    }

    const message = `Draft hot lead outreach for ${lead.hoa_name}. ` +
      `Contact: ${firstName} (${lead.email}). ` +
      `Project: ${amount} ${projectType}, ` +
      `Timeline: ${urgency}. ` +
      (signals.length > 0 ? `Urgency signals: ${signals.join(', ')}. ` : '') +
      `Lead ID: ${lead.id}`;

    return this._runOpenClawAgent('hoa-content-writer', message, lead.id);
  }

  /**
   * Trigger hoa-email-campaigns agent for 2-touch sequence
   * @private
   */
  async _triggerSequenceAgent(lead) {
    const firstName = lead.name.split(' ')[0];
    const projectType = lead.project_type ? lead.project_type.replace(/_/g, ' ') : 'project';
    const amount = lead.estimated_amount ? `$${lead.estimated_amount.toLocaleString()}` : '';

    const reserveNote = lead.current_reserve_fund && lead.estimated_amount
      ? (lead.current_reserve_fund / lead.estimated_amount < 0.3 ? ', low reserve fund' : '')
      : '';

    const message = `Create 2-touch follow-up sequence for hot lead: ` +
      `${lead.hoa_name}, ` +
      `${firstName} (${lead.email}), ` +
      `${amount} ${projectType}, ` +
      `${lead.project_urgency || 'standard timeline'}${reserveNote}. ` +
      `Lead ID: ${lead.id}`;

    return this._runOpenClawAgent('hoa-email-campaigns', message, lead.id);
  }

  /**
   * Run OpenClaw agent via WSL
   * @private
   */
  async _runOpenClawAgent(agentId, message, sessionId) {
    return new Promise((resolve) => {
      const args = [
        'bash',
        '-c',
        [
          `cd ${this.openclawPath}`,
          `npx openclaw agent`,
          `--agent ${agentId}`,
          `--local`,
          `--session-id ${sessionId}`,
          `--message "${message.replace(/"/g, '\\"')}"`
        ].join(' && ')
      ];

      const process = spawn('wsl.exe', args);

      let output = '';
      let errorOutput = '';

      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      // Don't wait for completion - let it run in background
      setTimeout(() => {
        resolve({
          success: true,
          message: 'Agent triggered successfully (running in background)',
          agent: agentId
        });
      }, 2000);

      process.on('close', (code) => {
        console.log(`[OpenClawAgentTrigger] ${agentId} completed with code ${code}`);
      });

      process.on('error', (error) => {
        console.error(`[OpenClawAgentTrigger] ${agentId} error:`, error.message);
      });
    });
  }
}

module.exports = OpenClawAgentTrigger;
