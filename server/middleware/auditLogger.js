/**
 * @file auditLogger.js
 * @description Middleware that logs EVERY API call to the audit_log table.
 *
 * WHY THIS EXISTS (Safety Requirement):
 * The safety model requires: Intent → Confirmation → Execution → Audit Log
 * This middleware handles the "Audit Log" part. Every request that hits our
 * API is recorded with who did it, what they did, and the outcome.
 *
 * This is APPEND-ONLY — audit records are never updated or deleted.
 * Think of it as your black box flight recorder for agent operations.
 */

const { v4: uuidv4 } = require('uuid');
const { run } = require('../db/connection');

/**
 * Middleware: Log every API request to the audit trail.
 *
 * Captures:
 * - Who: user ID (from JWT) or "anonymous"
 * - What: HTTP method + URL path (e.g., "POST /api/agents/run")
 * - When: timestamp
 * - Where: client IP address
 * - Outcome: HTTP status code (logged AFTER response is sent)
 */
function auditLogger(req, res, next) {
  // Capture the start time to measure request duration
  const startTime = Date.now();

  // Log AFTER the response is sent (so we know the outcome)
  res.on('finish', () => {
    try {
      const userId = req.user?.id || null;
      const action = `${req.method} ${req.originalUrl}`;
      const outcome = res.statusCode < 400 ? 'success' : 'failure';

      // Build details object with useful debugging info
      const details = JSON.stringify({
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - startTime,
        // Include request body for write operations (but not passwords!)
        body: req.method !== 'GET' ? sanitizeBody(req.body) : undefined,
      });

      run(
        `INSERT INTO audit_log (id, user_id, action, resource, details, ip_address, outcome)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          userId,
          action,
          req.originalUrl,
          details,
          req.ip || req.connection?.remoteAddress || 'unknown',
          outcome,
        ]
      );
    } catch (error) {
      // Audit logging should NEVER crash the server.
      // If it fails, log to console but keep serving requests.
      console.error('[AuditLogger] Failed to write audit log:', error.message);
    }
  });

  next();
}

/**
 * Remove sensitive fields from request body before logging.
 * NEVER log passwords, API keys, or other secrets.
 *
 * @param {Object} body - Request body
 * @returns {Object} - Sanitized body safe for logging
 */
function sanitizeBody(body) {
  if (!body) return undefined;

  const sanitized = { ...body };
  // List of field names that should NEVER appear in logs
  const sensitiveFields = ['password', 'apiKey', 'api_key', 'secret', 'token', 'credential'];

  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }

  return sanitized;
}

module.exports = auditLogger;
