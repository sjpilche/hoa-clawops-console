/**
 * Facebook Integration Routes
 * Endpoints for managing Facebook Lead Generation
 */

const express = require('express');
const router = express.Router();
const { facebookLeadService } = require('../services/facebookLeadService');
const { AuditService } = require('../services/auditService');
const { authenticate } = require('../middleware/auth');

// Webhook endpoints (NO AUTH - Facebook calls these)
// Must come BEFORE authenticate middleware

/**
 * GET /api/facebook/webhook
 * Facebook webhook verification endpoint
 * Facebook will call this to verify your webhook URL
 */
router.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN;

  // Parse params from the webhook verification request
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('[Facebook Webhook] Verification request received');
  console.log(`  Mode: ${mode}`);
  console.log(`  Token matches: ${token === VERIFY_TOKEN}`);

  // Check if a token and mode were sent
  if (mode && token) {
    // Check the mode and token sent are correct
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      // Respond with 200 OK and challenge token from the request
      console.log('[Facebook Webhook] ✅ Verification successful!');
      res.status(200).send(challenge);
    } else {
      // Responds with '403 Forbidden' if verify tokens do not match
      console.error('[Facebook Webhook] ❌ Verification failed - token mismatch');
      res.sendStatus(403);
    }
  } else {
    console.error('[Facebook Webhook] ❌ Verification failed - missing params');
    res.sendStatus(403);
  }
});

/**
 * POST /api/facebook/webhook
 * Facebook webhook event receiver
 * Facebook calls this when a new lead is created
 */
router.post('/webhook', async (req, res) => {
  const body = req.body;

  console.log('[Facebook Webhook] Event received:', JSON.stringify(body, null, 2));

  // Check if this is a page webhook event
  if (body.object === 'page') {
    // Iterate over each entry - there may be multiple if batched
    for (const entry of body.entry) {
      // Get the webhook event
      const webhookEvent = entry.changes?.[0];

      if (!webhookEvent) {
        continue;
      }

      console.log('[Facebook Webhook] Processing event:', webhookEvent.field);

      // Handle leadgen events
      if (webhookEvent.field === 'leadgen') {
        const leadgenId = webhookEvent.value.leadgen_id;
        const formId = webhookEvent.value.form_id;
        const pageId = webhookEvent.value.page_id;
        const createdTime = webhookEvent.value.created_time;

        console.log(`[Facebook Webhook] New lead detected!`);
        console.log(`  Lead ID: ${leadgenId}`);
        console.log(`  Form ID: ${formId}`);
        console.log(`  Page ID: ${pageId}`);

        try {
          // Fetch the full lead data from Facebook
          await facebookLeadService.processWebhookLead(leadgenId, formId);

          console.log(`[Facebook Webhook] ✅ Lead ${leadgenId} processed successfully`);
        } catch (error) {
          console.error(`[Facebook Webhook] ❌ Error processing lead ${leadgenId}:`, error);
          // Don't return error to Facebook - we'll retry later
        }
      }
    }

    // Return a '200 OK' response to all events
    res.status(200).send('EVENT_RECEIVED');
  } else {
    // Return a '404 Not Found' if event is not from a page
    res.sendStatus(404);
  }
});

// Apply authentication to all OTHER Facebook routes (not webhooks)
router.use(authenticate);

/**
 * GET /api/facebook/status
 * Get Facebook integration status
 */
router.get('/status', async (req, res) => {
  try {
    const status = facebookLeadService.getStatus();
    res.json(status);
  } catch (error) {
    console.error('[Facebook Routes] Error getting status:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

/**
 * GET /api/facebook/test
 * Test Facebook API connection
 */
router.get('/test', async (req, res) => {
  try {
    const result = await facebookLeadService.testConnection();

    await AuditService.log({
      user_id: req.user?.id,
      action: 'facebook.test_connection',
      resource: 'facebook_api',
      details: result
    });

    res.json(result);
  } catch (error) {
    console.error('[Facebook Routes] Error testing connection:', error);
    res.status(500).json({ error: 'Failed to test connection' });
  }
});

/**
 * GET /api/facebook/forms
 * Get all lead forms
 */
router.get('/forms', async (req, res) => {
  try {
    const forms = await facebookLeadService.getLeadForms();

    await AuditService.log({
      user_id: req.user?.id,
      action: 'facebook.list_forms',
      resource: 'facebook_api',
      details: { form_count: forms.length }
    });

    res.json({ forms });
  } catch (error) {
    console.error('[Facebook Routes] Error fetching forms:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/facebook/forms/:formId/leads
 * Get leads from a specific form
 */
router.get('/forms/:formId/leads', async (req, res) => {
  try {
    const { formId } = req.params;
    const limit = parseInt(req.query.limit) || 100;

    const leads = await facebookLeadService.getLeadsFromForm(formId, limit);

    await AuditService.log({
      user_id: req.user?.id,
      action: 'facebook.get_form_leads',
      resource: 'facebook_api',
      resource_id: formId,
      details: { lead_count: leads.length }
    });

    res.json({ leads });
  } catch (error) {
    console.error('[Facebook Routes] Error fetching leads:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/facebook/sync
 * Manually trigger lead sync
 */
router.post('/sync', async (req, res) => {
  try {
    await AuditService.log({
      user_id: req.user?.id,
      action: 'facebook.manual_sync',
      resource: 'facebook_api',
      details: { triggered_by: req.user?.email }
    });

    const result = await facebookLeadService.syncAllLeads();

    res.json({
      success: true,
      message: 'Lead sync completed',
      ...result
    });
  } catch (error) {
    console.error('[Facebook Routes] Error during sync:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/facebook/polling/start
 * Start automatic lead polling
 */
router.post('/polling/start', async (req, res) => {
  try {
    facebookLeadService.startPolling();

    await AuditService.log({
      user_id: req.user?.id,
      action: 'facebook.start_polling',
      resource: 'facebook_api',
      details: { started_by: req.user?.email }
    });

    res.json({
      success: true,
      message: 'Polling started',
      status: facebookLeadService.getStatus()
    });
  } catch (error) {
    console.error('[Facebook Routes] Error starting polling:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/facebook/polling/stop
 * Stop automatic lead polling
 */
router.post('/polling/stop', async (req, res) => {
  try {
    facebookLeadService.stopPolling();

    await AuditService.log({
      user_id: req.user?.id,
      action: 'facebook.stop_polling',
      resource: 'facebook_api',
      details: { stopped_by: req.user?.email }
    });

    res.json({
      success: true,
      message: 'Polling stopped',
      status: facebookLeadService.getStatus()
    });
  } catch (error) {
    console.error('[Facebook Routes] Error stopping polling:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
