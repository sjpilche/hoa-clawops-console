/**
 * @file sendgrid.js
 * @description Shared SendGrid email service — single source of truth for all email sending
 * in ClawOps Console. Used for outreach campaigns, digests, and transactional emails.
 *
 * STANDARD ENV VARS (same across all projects):
 *   SENDGRID_API_KEY      — SG.xxx API key from sendgrid.com/settings/api_keys
 *   SENDGRID_FROM_EMAIL   — verified sender address (e.g. info@hoaprojectfunding.com)
 *   SENDGRID_FROM_NAME    — display name (e.g. "HOA Project Funding")
 *
 * USAGE:
 *   const sg = require('../services/sendgrid');
 *   await sg.send({ to, subject, html, text });
 *   await sg.sendBulk(messages);
 */

const sgMail = require('@sendgrid/mail');

let initialized = false;

function init() {
  if (initialized) return;
  const key = process.env.SENDGRID_API_KEY;
  if (!key) {
    console.warn('[SendGrid] SENDGRID_API_KEY not set — email sending disabled');
    return;
  }
  sgMail.setApiKey(key);
  initialized = true;
  console.log('[SendGrid] Initialized');
}

// Call init immediately so it's ready when the module loads
init();

/**
 * Send a single email.
 *
 * @param {Object} opts
 * @param {string|string[]} opts.to         — Recipient(s)
 * @param {string}          opts.subject    — Subject line
 * @param {string}          opts.html       — HTML body
 * @param {string}          [opts.text]     — Plain text fallback
 * @param {string}          [opts.from]     — Override from address
 * @param {string}          [opts.fromName] — Override from name
 * @returns {{ success: boolean, messageId?: string, error?: string }}
 */
async function send({ to, subject, html, text, from, fromName }) {
  if (!process.env.SENDGRID_API_KEY) {
    console.warn('[SendGrid] Skipping send — SENDGRID_API_KEY not configured');
    return { success: false, reason: 'not_configured' };
  }

  const msg = {
    to,
    from: {
      email: from || process.env.SENDGRID_FROM_EMAIL || 'info@hoaprojectfunding.com',
      name: fromName || process.env.SENDGRID_FROM_NAME || 'HOA Project Funding',
    },
    subject,
    html: html || text || '',
    text: text || stripHtml(html || ''),
  };

  try {
    const [response] = await sgMail.send(msg);
    const msgId = response?.headers?.['x-message-id'] || null;
    console.log(`[SendGrid] Sent to ${Array.isArray(to) ? to.join(', ') : to}: "${subject}"`);
    return { success: true, messageId: msgId };
  } catch (err) {
    const errMsg = err?.response?.body?.errors?.[0]?.message || err.message;
    console.error(`[SendGrid] Send failed to ${to}: ${errMsg}`);
    return { success: false, error: errMsg };
  }
}

/**
 * Send multiple emails efficiently.
 * SendGrid allows up to 1000 personalizations per API call.
 * We batch in groups of 100 to stay well within limits.
 *
 * @param {Array<{ to, subject, html, text, from?, fromName? }>} messages
 * @returns {{ sent: number, failed: number, results: Array }}
 */
async function sendBulk(messages) {
  if (!process.env.SENDGRID_API_KEY) {
    console.warn('[SendGrid] Skipping bulk send — SENDGRID_API_KEY not configured');
    return { sent: 0, failed: messages.length, results: [] };
  }

  const results = [];
  let sent = 0;
  let failed = 0;

  // Process in batches of 100
  const BATCH_SIZE = 100;
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);

    // Send each in the batch (parallel within batch, serial between batches)
    const batchResults = await Promise.all(
      batch.map(async (msg) => {
        const result = await send(msg);
        if (result.success) sent++;
        else failed++;
        return { to: msg.to, subject: msg.subject, ...result };
      })
    );
    results.push(...batchResults);

    // Small delay between batches to avoid rate limits
    if (i + BATCH_SIZE < messages.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log(`[SendGrid] Bulk send complete: ${sent} sent, ${failed} failed`);
  return { sent, failed, results };
}

/**
 * Check if SendGrid is configured and ready.
 * @returns {{ configured: boolean, from: string|null }}
 */
function status() {
  return {
    configured: !!process.env.SENDGRID_API_KEY,
    from: process.env.SENDGRID_FROM_EMAIL || null,
    fromName: process.env.SENDGRID_FROM_NAME || null,
  };
}

/**
 * Strip HTML tags for plain text fallback generation.
 */
function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

/**
 * Branded HTML email shell — HOA Project Funding style.
 * Pass your body content as an HTML string.
 *
 * @param {string} bodyHtml — Inner HTML content (paragraphs, etc.)
 * @param {Object} [opts]
 * @param {string} [opts.preheader] — Preview text shown in email client
 * @returns {string} Full HTML email
 */
function wrapInBrandedShell(bodyHtml, { preheader = '' } = {}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HOA Project Funding</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}&nbsp;</div>` : ''}
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e40af,#3b82f6);border-radius:8px 8px 0 0;padding:28px 32px;">
              <div style="font-size:22px;font-weight:700;color:#ffffff;">HOA Project Funding</div>
              <div style="font-size:13px;color:rgba(255,255,255,0.8);margin-top:4px;">hoaprojectfunding.com</div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:32px;border:1px solid #e5e7eb;border-top:none;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:20px 32px;">
              <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
                HOA Project Funding &bull; <a href="https://hoaprojectfunding.com" style="color:#6b7280;text-decoration:none;">hoaprojectfunding.com</a>
              </p>
              <p style="margin:8px 0 0;font-size:11px;color:#9ca3af;text-align:center;">
                You received this email because your company was identified as a HOA management firm.
                To opt out, reply with "unsubscribe" in the subject line.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = { send, sendBulk, status, wrapInBrandedShell, stripHtml };
