/**
 * @file auditService.js
 * @description Audit trail logging service. Logs agent and system actions to audit_log table.
 */

const { run } = require('../db/connection');
const { v4: uuidv4 } = require('uuid');

const AuditService = {
  /**
   * Log an action to the audit trail.
   * @param {Object} params
   * @param {string} params.action — what happened (e.g. 'lead_created', 'agent_run')
   * @param {string} [params.userId] — who did it
   * @param {string} [params.agentId] — which agent was involved
   * @param {string} [params.resourceType] — type of resource (lead, agent, run, etc.)
   * @param {string} [params.resourceId] — ID of the resource
   * @param {object} [params.details] — additional context
   */
  async log({ action, userId, agentId, resourceType, resourceId, details }) {
    try {
      run(
        `INSERT INTO audit_log (id, action, user_id, agent_id, resource_type, resource_id, details, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          uuidv4(),
          action,
          userId || 'system',
          agentId || null,
          resourceType || null,
          resourceId || null,
          details ? JSON.stringify(details) : null,
        ]
      );
    } catch (err) {
      // Audit logging is non-fatal — never crash the caller
      console.warn(`[Audit] Failed to log "${action}": ${err.message}`);
    }
  },
};

module.exports = { AuditService };
