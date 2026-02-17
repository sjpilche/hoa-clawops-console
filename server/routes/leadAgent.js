/**
 * Lead Monitoring Agent API Routes
 *
 * Exposes operational endpoints for the lead monitoring agent
 */

const express = require('express');
const router = express.Router();
const leadAgent = require('../agents/leadMonitoringAgent');

// ============================================
// HEALTH CHECKS
// ============================================

/**
 * GET /api/lead-agent/health
 * Overall health check
 */
router.get('/health', async (req, res) => {
  try {
    const stats = await leadAgent.getStats();

    const isHealthy = leadAgent.isRunning && stats.stats.errors < 100;

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'degraded',
      agent: stats.agent,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/lead-agent/health/db
 * Database connectivity check
 */
router.get('/health/db', async (req, res) => {
  try {
    const sql = require('mssql');
    const pool = await sql.connect({
      server: process.env.AZURE_SQL_SERVER,
      database: process.env.AZURE_SQL_DATABASE,
      user: process.env.AZURE_SQL_USER,
      password: process.env.AZURE_SQL_PASSWORD,
      options: { encrypt: true, trustServerCertificate: false }
    });

    const result = await pool.request().query('SELECT 1 as ok');
    await pool.close();

    res.json({
      status: 'healthy',
      database: process.env.AZURE_SQL_DATABASE,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/lead-agent/health/facebook
 * Facebook API token validity
 */
router.get('/health/facebook', async (req, res) => {
  try {
    const axios = require('axios');
    const response = await axios.get(
      `https://graph.facebook.com/v22.0/${process.env.FACEBOOK_PAGE_ID}`,
      {
        params: {
          access_token: process.env.FACEBOOK_ACCESS_TOKEN,
          fields: 'name'
        },
        timeout: 10000
      }
    );

    res.json({
      status: 'healthy',
      page: response.data.name,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.response?.data?.error?.message || error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ============================================
// STATISTICS & MONITORING
// ============================================

/**
 * GET /api/lead-agent/stats
 * Complete statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await leadAgent.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/lead-agent/stats/ingestion
 * Ingestion-specific stats
 */
router.get('/stats/ingestion', async (req, res) => {
  try {
    const stats = await leadAgent.getStats();
    res.json({
      total: stats.stats.total_leads,
      webhook: stats.stats.webhook_leads,
      polling: stats.stats.polling_leads,
      duplicates: stats.stats.duplicatesDetected,
      last24h: stats.stats.leads_last_24h,
      lastHour: stats.stats.leads_last_hour,
      lastLeadAt: stats.stats.last_lead_at
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/lead-agent/stats/notifications
 * Notification stats
 */
router.get('/stats/notifications', async (req, res) => {
  try {
    const sql = require('mssql');
    const pool = leadAgent.dbPool || await sql.connect({
      server: process.env.AZURE_SQL_SERVER,
      database: process.env.AZURE_SQL_DATABASE,
      user: process.env.AZURE_SQL_USER,
      password: process.env.AZURE_SQL_PASSWORD,
      options: { encrypt: true, trustServerCertificate: false }
    });

    const result = await pool.request().query(`
      SELECT
        notification_type,
        status,
        COUNT(*) as count
      FROM notification_log
      GROUP BY notification_type, status
    `);

    res.json({
      breakdown: result.recordset,
      total: leadAgent.stats.notificationsSent
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// DATA ACCESS
// ============================================

/**
 * GET /api/lead-agent/leads/recent
 * Get recent leads
 */
router.get('/leads/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const leads = await leadAgent.getLastLeads(limit);
    res.json(leads);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/lead-agent/leads/:id
 * Get specific lead details
 */
router.get('/leads/:id', async (req, res) => {
  try {
    const sql = require('mssql');
    const pool = leadAgent.dbPool || await sql.connect({
      server: process.env.AZURE_SQL_SERVER,
      database: process.env.AZURE_SQL_DATABASE,
      user: process.env.AZURE_SQL_USER,
      password: process.env.AZURE_SQL_PASSWORD,
      options: { encrypt: true, trustServerCertificate: false }
    });

    const result = await pool.request()
      .input('id', sql.NVarChar, req.params.id)
      .query(`
        SELECT
          l.*,
          r.raw_payload,
          r.source,
          r.received_at,
          r.signature_valid
        FROM leads l
        JOIN raw_leads r ON l.raw_lead_id = r.id
        WHERE l.facebook_lead_id = @id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    res.json(result.recordset[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/lead-agent/failed-events
 * Get failed events from dead letter queue
 */
router.get('/failed-events', async (req, res) => {
  try {
    const events = await leadAgent.getFailedEvents();
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ADMIN OPERATIONS
// ============================================

/**
 * POST /api/lead-agent/reprocess/:id
 * Reprocess a failed event
 */
router.post('/reprocess/:id', async (req, res) => {
  try {
    const sql = require('mssql');
    const pool = leadAgent.dbPool || await sql.connect({
      server: process.env.AZURE_SQL_SERVER,
      database: process.env.AZURE_SQL_DATABASE,
      user: process.env.AZURE_SQL_USER,
      password: process.env.AZURE_SQL_PASSWORD,
      options: { encrypt: true, trustServerCertificate: false }
    });

    // Get failed event
    const eventResult = await pool.request()
      .input('id', sql.BigInt, req.params.id)
      .query('SELECT * FROM errors_deadletter WHERE id = @id');

    if (eventResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const event = eventResult.recordset[0];

    // Attempt reprocessing
    let result;
    try {
      const payload = JSON.parse(event.payload);
      await leadAgent.processLead(payload);
      result = 'success';
    } catch (error) {
      result = `failed: ${error.message}`;
    }

    // Mark as reprocessed
    await pool.request()
      .input('id', sql.BigInt, req.params.id)
      .input('result', sql.NVarChar, result)
      .query(`
        UPDATE errors_deadletter
        SET reprocessed = 1,
            reprocessed_at = GETUTCDATE(),
            reprocess_result = @result
        WHERE id = @id
      `);

    res.json({
      success: result === 'success',
      result,
      event_id: req.params.id
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/lead-agent/reconcile
 * Force reconciliation (backfill)
 */
router.post('/reconcile', async (req, res) => {
  try {
    // Trigger polling immediately
    await leadAgent.pollForLeads();

    res.json({
      success: true,
      message: 'Reconciliation completed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/lead-agent/start
 * Start the agent (if stopped)
 */
router.post('/start', async (req, res) => {
  try {
    if (leadAgent.isRunning) {
      return res.json({ message: 'Agent already running' });
    }

    await leadAgent.start();
    res.json({ success: true, message: 'Agent started' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/lead-agent/stop
 * Stop the agent
 */
router.post('/stop', async (req, res) => {
  try {
    if (!leadAgent.isRunning) {
      return res.json({ message: 'Agent already stopped' });
    }

    await leadAgent.stop();
    res.json({ success: true, message: 'Agent stopped' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// WEBHOOK ENDPOINT
// ============================================

/**
 * POST /api/lead-agent/webhook
 * Facebook webhook receiver
 */
router.post('/webhook', async (req, res) => {
  try {
    const result = await leadAgent.handleWebhook(req);
    res.status(result.status).json({ message: result.message });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/lead-agent/webhook
 * Webhook verification (Facebook requirement)
 */
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifyToken = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[LeadAgent] Webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

module.exports = router;
