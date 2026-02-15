/**
 * Webhook Routes for Lead Capture
 *
 * PUBLIC endpoint (no JWT auth required)
 * Security: HMAC signature verification
 *
 * POST /api/webhooks/form-submission - Receive WordPress form submissions
 * GET /api/webhooks/test - Health check endpoint
 */

const { Router } = require('express');
const crypto = require('crypto');
const { AppError } = require('../middleware/errorHandler');
const { leadCaptureSchema } = require('../schemas/lead.schema');
const { scoreLead } = require('../lib/leadScoring');
const { addLeadToSendGrid } = require('../lib/espIntegration');
const { sendLeadNotification } = require('../lib/telegramNotification');
const CRMLogger = require('../lib/crmLogger');
const FollowUpDrafter = require('../lib/followUpDrafter');
const OpenClawAgentTrigger = require('../lib/openclawAgentTrigger');

const router = Router();

/**
 * Verify HMAC signature for webhook security
 * Prevents unauthorized form submissions
 * @param {Object} req - Express request object
 * @param {string} secret - Webhook secret from env
 * @throws {AppError} - If signature missing or invalid
 */
function verifyWebhookSignature(req, secret) {
  const signature = req.headers['x-webhook-signature'] || req.body.signature;

  if (!signature) {
    throw new AppError('Missing webhook signature', 'WEBHOOK_SIGNATURE_MISSING', 401);
  }

  // Create HMAC signature of request body
  const payload = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  // Compare signatures (timing-safe comparison)
  const isValid = crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );

  if (!isValid) {
    throw new AppError('Invalid webhook signature', 'WEBHOOK_SIGNATURE_INVALID', 401);
  }

  return true;
}

/**
 * POST /api/webhooks/form-submission
 * Receive form submissions from WordPress (Contact Form 7)
 *
 * Process:
 * 1. Verify HMAC signature
 * 2. Validate form data
 * 3. Score lead (Hot/Warm/General)
 * 4. Add to SendGrid with tags
 * 5. Send Telegram notification
 * 6. Log to CRM files
 * 7. Draft personalized follow-up (hot leads only)
 * 8. Return success response
 */
router.post('/form-submission', async (req, res, next) => {
  try {
    // 1. Verify webhook signature
    const webhookSecret = process.env.WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new AppError(
        'Webhook secret not configured',
        'WEBHOOK_NOT_CONFIGURED',
        503
      );
    }

    verifyWebhookSignature(req, webhookSecret);

    // 2. Validate form data
    const validationResult = leadCaptureSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid form data',
        code: 'VALIDATION_ERROR',
        details: validationResult.error.errors
      });
    }

    const leadData = validationResult.data;

    console.log('[Webhook] New lead received:', {
      name: leadData.name,
      email: leadData.email,
      hoa: leadData.hoa_name,
      amount: leadData.estimated_amount
    });

    // 3. Score lead
    const scoringResult = scoreLead(leadData);

    console.log('[Webhook] Lead scored:', {
      score: scoringResult.score,
      priority: scoringResult.priority,
      points: scoringResult.points
    });

    // 4. Add to SendGrid and trigger nurture sequence
    let espResult;

    try {
      espResult = await addLeadToSendGrid(leadData, scoringResult);
      console.log('[Webhook] Lead added to SendGrid');
    } catch (error) {
      console.error('[Webhook] SendGrid integration failed:', error.message);
      // Don't fail the whole webhook - continue with other actions
      espResult = { success: false, error: error.message };
    }

    // 5. Log to CRM
    const crm = new CRMLogger();
    const leadRecord = await crm.logLead(leadData, scoringResult, espResult);

    console.log('[Webhook] Lead logged to CRM:', leadRecord.id);

    // 6. Send Telegram notification
    const telegramResult = await sendLeadNotification(leadData, scoringResult);

    if (telegramResult.success) {
      console.log('[Webhook] Telegram notification sent');
      await crm.updateLeadStatus(leadRecord.id, { telegram_sent: true });
    }

    // 7. Draft personalized follow-up for hot leads
    let followUpPath = null;
    if (scoringResult.score === 'hot') {
      const drafter = new FollowUpDrafter();
      followUpPath = await drafter.draftFollowUp(leadRecord);

      await crm.updateLeadStatus(leadRecord.id, {
        follow_up_drafted: true,
        follow_up_path: followUpPath
      });

      console.log('[Webhook] Follow-up email drafted:', followUpPath);

      // 7b. Trigger OpenClaw agents for hot leads (outreach + 2-touch sequence)
      try {
        const agentTrigger = new OpenClawAgentTrigger();
        const agentResults = await agentTrigger.triggerHotLeadAgents(leadRecord);

        if (agentResults.outreach_triggered || agentResults.sequence_triggered) {
          console.log('[Webhook] OpenClaw agents triggered:', {
            outreach: agentResults.outreach_triggered,
            sequence: agentResults.sequence_triggered
          });
        }

        if (agentResults.errors.length > 0) {
          console.warn('[Webhook] OpenClaw agent errors:', agentResults.errors);
        }
      } catch (agentError) {
        // Don't fail webhook if agent triggering fails
        console.error('[Webhook] Failed to trigger OpenClaw agents:', agentError.message);
      }
    }

    // 8. Return success response
    res.json({
      success: true,
      message: 'Lead captured and processed successfully',
      lead_id: leadRecord.id,
      score: scoringResult.score,
      priority: scoringResult.priority,
      esp_added: espResult.success,
      telegram_sent: telegramResult.success,
      follow_up_drafted: followUpPath !== null
    });

  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      console.error('[Webhook] Processing failed:', error);
      next(new AppError(
        `Webhook processing failed: ${error.message}`,
        'WEBHOOK_PROCESSING_FAILED',
        500
      ));
    }
  }
});

/**
 * GET /api/webhooks/test
 * Test webhook endpoint (for debugging)
 */
router.get('/test', (req, res) => {
  res.json({
    message: 'Webhook endpoint is active',
    timestamp: new Date().toISOString(),
    configured: !!process.env.WEBHOOK_SECRET
  });
});

module.exports = router;
