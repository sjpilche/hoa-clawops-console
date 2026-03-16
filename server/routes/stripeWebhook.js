/**
 * @file stripeWebhook.js
 * @description Stripe webhook handler for payment confirmations.
 *
 * When a customer pays on the data audit landing page, Stripe sends a webhook
 * event here. On confirmed payment, we update the audit record and auto-trigger
 * the audit run if it's still pending.
 *
 * Route: POST /api/stripe/webhook
 *
 * IMPORTANT: This route uses raw body parsing (not JSON) because Stripe
 * requires the raw request body to verify webhook signatures. The raw body
 * middleware is mounted in index.js BEFORE the global express.json() parser.
 */

'use strict';

const express = require('express');
const { get, run } = require('../db/connection');

const router = express.Router();

// ── Stripe SDK (optional — graceful if not installed) ───────────────────────

let stripe = null;
try {
  const Stripe = require('stripe');
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
} catch {
  // stripe package not installed — signature verification will be skipped
}

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Verify Stripe webhook signature. Returns the parsed event or null on failure.
 */
function verifySignature(rawBody, sigHeader) {
  if (!WEBHOOK_SECRET) {
    console.warn('[stripe-webhook] STRIPE_WEBHOOK_SECRET not set — skipping signature verification');
    try {
      return JSON.parse(rawBody);
    } catch (err) {
      console.error('[stripe-webhook] Failed to parse raw body as JSON:', err.message);
      return null;
    }
  }

  if (!stripe) {
    console.warn('[stripe-webhook] Stripe SDK not available — skipping signature verification');
    try {
      return JSON.parse(rawBody);
    } catch (err) {
      console.error('[stripe-webhook] Failed to parse raw body as JSON:', err.message);
      return null;
    }
  }

  try {
    return stripe.webhooks.constructEvent(rawBody, sigHeader, WEBHOOK_SECRET);
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed:', err.message);
    return null;
  }
}

/**
 * Find an audit record by auditId (client_reference_id) or customer email.
 */
function findAudit(auditId, email) {
  if (auditId) {
    const audit = get('SELECT * FROM audit_requests WHERE id = ?', [auditId]);
    if (audit) return audit;
  }

  if (email) {
    // Fall back to most recent pending/processing audit for this email
    const audit = get(
      `SELECT * FROM audit_requests
       WHERE contact_email = ? AND status IN ('pending', 'processing')
       ORDER BY created_at DESC LIMIT 1`,
      [email]
    );
    if (audit) return audit;
  }

  return null;
}

/**
 * Mark an audit as paid and auto-trigger if still pending.
 */
async function handlePaymentConfirmed({ auditId, email, amountCents, stripePaymentId, metadata }) {
  const audit = findAudit(auditId, email);

  if (!audit) {
    console.warn('[stripe-webhook] No matching audit found for auditId=%s email=%s', auditId, email);
    // Still return success — we don't want Stripe to retry for a missing record.
    // The payment is valid; we just don't have an audit to link it to yet.
    // A manual reconciliation can pick this up later.
    return { matched: false, auditId, email };
  }

  console.log('[stripe-webhook] Matched audit %s (%s) — updating payment status', audit.id, audit.company_name);

  // Update payment fields
  run(
    `UPDATE audit_requests
     SET payment_status = 'paid',
         amount_cents = ?,
         stripe_payment_id = ?,
         source = CASE WHEN source = 'manual' THEN 'stripe' ELSE source END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [amountCents || 0, stripePaymentId || null, audit.id]
  );

  // Auto-trigger audit if still pending
  if (audit.status === 'pending') {
    console.log('[stripe-webhook] Audit %s is pending — auto-triggering run', audit.id);
    try {
      const { createAndRunAudit } = require('../services/dataAuditService');
      // createAndRunAudit handles its own DB updates; pass existing audit info
      // We update status to 'processing' first to avoid double-triggers
      run("UPDATE audit_requests SET status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'", [audit.id]);

      // Fire and forget — don't block the webhook response
      createAndRunAudit({
        existingAuditId: audit.id,
        companyName: audit.company_name,
        website: audit.website,
        industry: audit.industry,
        erpSystem: audit.erp_system,
        contactName: audit.contact_name,
        contactEmail: audit.contact_email,
        source: 'stripe',
        amountCents: amountCents || audit.amount_cents,
      }).then(result => {
        console.log('[stripe-webhook] Audit %s triggered successfully: chaos_score=%s', audit.id, result?.chaosScore);
      }).catch(err => {
        console.error('[stripe-webhook] Audit %s trigger failed:', audit.id, err.message);
        // Mark as failed so it can be retried
        run("UPDATE audit_requests SET status = 'pending', error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          [`Stripe auto-trigger failed: ${err.message}`, audit.id]);
      });
    } catch (err) {
      console.error('[stripe-webhook] Failed to import/call createAndRunAudit:', err.message);
    }
  }

  return { matched: true, auditId: audit.id, status: audit.status };
}

// ── Webhook Endpoint ────────────────────────────────────────────────────────

router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const rawBody = req.body; // Buffer — raw body middleware set in index.js

  // Verify signature
  const event = verifySignature(rawBody, sig);
  if (!event) {
    console.error('[stripe-webhook] Invalid payload or signature');
    return res.status(400).json({ error: 'Invalid payload or signature' });
  }

  const eventType = event.type;
  const eventId = event.id;

  console.log('[stripe-webhook] Received event: %s (id: %s)', eventType, eventId);

  try {
    switch (eventType) {
      // ── Primary: Checkout Session Completed ─────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object;
        const auditId = session.client_reference_id || null;
        const email = session.customer_email || session.customer_details?.email || session.metadata?.contact_email || null;
        const amountCents = session.amount_total || 0;
        const stripePaymentId = session.payment_intent || session.id;

        console.log('[stripe-webhook] checkout.session.completed — auditId=%s email=%s amount=%d',
          auditId, email, amountCents);

        const result = await handlePaymentConfirmed({
          auditId,
          email,
          amountCents,
          stripePaymentId,
          metadata: session.metadata || {},
        });

        return res.status(200).json({ received: true, ...result });
      }

      // ── Fallback: Payment Intent Succeeded ──────────────────────────────
      case 'payment_intent.succeeded': {
        const intent = event.data.object;
        const auditId = intent.metadata?.audit_id || null;
        const email = intent.receipt_email || intent.metadata?.contact_email || null;
        const amountCents = intent.amount_received || intent.amount || 0;
        const stripePaymentId = intent.id;

        console.log('[stripe-webhook] payment_intent.succeeded — auditId=%s email=%s amount=%d',
          auditId, email, amountCents);

        const result = await handlePaymentConfirmed({
          auditId,
          email,
          amountCents,
          stripePaymentId,
          metadata: intent.metadata || {},
        });

        return res.status(200).json({ received: true, ...result });
      }

      // ── Unhandled events — acknowledge but ignore ───────────────────────
      default:
        console.log('[stripe-webhook] Ignoring unhandled event type: %s', eventType);
        return res.status(200).json({ received: true, ignored: true });
    }
  } catch (err) {
    // Log but still return 200 — we don't want Stripe to retry on our internal errors.
    // The payment is already confirmed; our processing can be retried manually.
    console.error('[stripe-webhook] Error processing event %s:', eventId, err.message);
    return res.status(200).json({ received: true, error: err.message });
  }
});

module.exports = router;
