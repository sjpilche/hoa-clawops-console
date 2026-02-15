/**
 * @file audit.js
 * @description API routes for viewing audit logs
 *
 * Provides read-only access to the audit_log table for security monitoring
 */

const express = require('express');
const router = express.Router();
const { all } = require('../db/connection');

/**
 * GET /api/audit
 * List audit log entries with pagination and filtering
 *
 * Query params:
 * - limit: Max records to return (default: 100, max: 1000)
 * - offset: Skip N records (for pagination)
 * - user_id: Filter by user
 * - action: Filter by action (supports LIKE)
 * - outcome: Filter by outcome (success/failure)
 * - from: Start date (ISO 8601)
 * - to: End date (ISO 8601)
 */
router.get('/', async (req, res) => {
  try {
    const {
      limit = 100,
      offset = 0,
      user_id,
      action,
      outcome,
      from,
      to,
    } = req.query;

    // Validate and constrain limit
    const safeLimit = Math.min(parseInt(limit, 10) || 100, 1000);
    const safeOffset = parseInt(offset, 10) || 0;

    // Build WHERE clauses
    const whereClauses = [];
    const params = [];

    if (user_id) {
      whereClauses.push('user_id = ?');
      params.push(user_id);
    }

    if (action) {
      whereClauses.push('action LIKE ?');
      params.push(`%${action}%`);
    }

    if (outcome) {
      whereClauses.push('outcome = ?');
      params.push(outcome);
    }

    if (from) {
      whereClauses.push('timestamp >= ?');
      params.push(from);
    }

    if (to) {
      whereClauses.push('timestamp <= ?');
      params.push(to);
    }

    const whereClause = whereClauses.length > 0
      ? 'WHERE ' + whereClauses.join(' AND ')
      : '';

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM audit_log ${whereClause}`;
    const countResult = all(countQuery, params);
    const total = countResult[0]?.total || 0;

    // Get paginated results
    const query = `
      SELECT
        id,
        timestamp,
        user_id,
        action,
        resource,
        details,
        ip_address,
        outcome
      FROM audit_log
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `;

    const logs = all(query, [...params, safeLimit, safeOffset]);

    res.json({
      success: true,
      total,
      count: logs.length,
      limit: safeLimit,
      offset: safeOffset,
      logs: logs.map(log => ({
        ...log,
        details: tryParseJSON(log.details),
      })),
    });
  } catch (error) {
    console.error('[Audit API] Error fetching logs:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/audit/stats
 * Get audit log statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = {
      total_logs: 0,
      success_count: 0,
      failure_count: 0,
      unique_users: 0,
      unique_actions: 0,
      logs_last_24h: 0,
      logs_last_7d: 0,
      top_actions: [],
      recent_failures: [],
    };

    // Total logs
    const totalResult = all('SELECT COUNT(*) as count FROM audit_log');
    stats.total_logs = totalResult[0]?.count || 0;

    // Success vs failure
    const outcomeResult = all(`
      SELECT outcome, COUNT(*) as count
      FROM audit_log
      GROUP BY outcome
    `);
    outcomeResult.forEach(row => {
      if (row.outcome === 'success') stats.success_count = row.count;
      if (row.outcome === 'failure') stats.failure_count = row.count;
    });

    // Unique users and actions
    const uniqueUsers = all('SELECT COUNT(DISTINCT user_id) as count FROM audit_log WHERE user_id IS NOT NULL');
    stats.unique_users = uniqueUsers[0]?.count || 0;

    const uniqueActions = all('SELECT COUNT(DISTINCT action) as count FROM audit_log');
    stats.unique_actions = uniqueActions[0]?.count || 0;

    // Logs in last 24 hours
    const last24h = all(`
      SELECT COUNT(*) as count
      FROM audit_log
      WHERE timestamp >= datetime('now', '-24 hours')
    `);
    stats.logs_last_24h = last24h[0]?.count || 0;

    // Logs in last 7 days
    const last7d = all(`
      SELECT COUNT(*) as count
      FROM audit_log
      WHERE timestamp >= datetime('now', '-7 days')
    `);
    stats.logs_last_7d = last7d[0]?.count || 0;

    // Top 10 actions
    const topActions = all(`
      SELECT action, COUNT(*) as count
      FROM audit_log
      GROUP BY action
      ORDER BY count DESC
      LIMIT 10
    `);
    stats.top_actions = topActions;

    // Recent failures (last 20)
    const recentFailures = all(`
      SELECT
        id,
        timestamp,
        action,
        resource,
        details
      FROM audit_log
      WHERE outcome = 'failure'
      ORDER BY timestamp DESC
      LIMIT 20
    `);
    stats.recent_failures = recentFailures.map(log => ({
      ...log,
      details: tryParseJSON(log.details),
    }));

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('[Audit API] Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/audit/:id
 * Get a specific audit log entry by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const logs = all('SELECT * FROM audit_log WHERE id = ?', [id]);

    if (logs.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Audit log entry not found',
      });
    }

    const log = logs[0];

    res.json({
      success: true,
      log: {
        ...log,
        details: tryParseJSON(log.details),
      },
    });
  } catch (error) {
    console.error('[Audit API] Error fetching log:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/audit/user/:userId
 * Get audit logs for a specific user
 */
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    const safeLimit = Math.min(parseInt(limit, 10) || 100, 1000);
    const safeOffset = parseInt(offset, 10) || 0;

    const logs = all(
      `SELECT * FROM audit_log
       WHERE user_id = ?
       ORDER BY timestamp DESC
       LIMIT ? OFFSET ?`,
      [userId, safeLimit, safeOffset]
    );

    const countResult = all(
      'SELECT COUNT(*) as total FROM audit_log WHERE user_id = ?',
      [userId]
    );
    const total = countResult[0]?.total || 0;

    res.json({
      success: true,
      total,
      count: logs.length,
      limit: safeLimit,
      offset: safeOffset,
      logs: logs.map(log => ({
        ...log,
        details: tryParseJSON(log.details),
      })),
    });
  } catch (error) {
    console.error('[Audit API] Error fetching user logs:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Helper: Safely parse JSON strings
 */
function tryParseJSON(str) {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

module.exports = router;
