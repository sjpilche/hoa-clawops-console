/**
 * @file sendgrid.js
 * @description Shared SendGrid email service — single source of truth for all email sending
 * in ClawOps Console. Used for outreach campaigns, digests, and transactional emails.
 *
 * SENDER IDENTITIES (per persona):
 *   hoa   → Steve Pilcher <spilcher@hoaprojectfunding.com>
 *   jake  → Jim McGuire <JimMcGuire@jakecfo.com>
 *   owen  → Jim McGuire <JimMcGuire@owencfo.com>
 *
 * Fallback uses SENDGRID_FROM_EMAIL / SENDGRID_FROM_NAME env vars.
 *
 * USAGE:
 *   const sg = require('../services/sendgrid');
 *   await sg.send({ to, subject, html, text });
 *   await sg.send({ to, subject, html, persona: 'jake' });
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
  sgMail.setTimeout(30000); // 30s timeout — prevents hangs if SendGrid is slow
  initialized = true;
  console.log('[SendGrid] Initialized');
}

// Call init immediately so it's ready when the module loads
init();

/**
 * Persona → sender identity mapping.
 * Each persona sends from a different verified email address.
 */
const SENDER_IDENTITIES = {
  hoa: {
    email: 'spilcher@hoaprojectfunding.com',
    name: 'Steve Pilcher',
  },
  jake: {
    email: 'JimMcGuire@jakecfo.com',
    name: 'Jim McGuire',
  },
  owen: {
    email: 'JimMcGuire@owencfo.com',
    name: 'Jim McGuire',
  },
  data_rehab: {
    email: 'JimMcguire@getdatarehab.com',
    name: 'Jim McGuire',
  },
  terrapin: {
    email: 'adam@terrapinstationfences.com',
    name: 'Adam Weir',
  },
  fence: {
    email: 'adam@terrapinstationfences.com',
    name: 'Adam Weir',
  },
};

/**
 * Resolve the from address for an email.
 * Priority: explicit from/fromName > persona lookup > env vars > fallback
 */
function resolveFrom({ from, fromName, persona }) {
  if (from) {
    return { email: from, name: fromName || from };
  }
  if (persona && SENDER_IDENTITIES[persona]) {
    return SENDER_IDENTITIES[persona];
  }
  return {
    email: process.env.SENDGRID_FROM_EMAIL || 'spilcher@hoaprojectfunding.com',
    name: process.env.SENDGRID_FROM_NAME || 'Steve Pilcher',
  };
}

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
 * @param {string}          [opts.persona]  — Persona key (hoa, jake, owen) → auto-resolves sender
 * @returns {{ success: boolean, messageId?: string, error?: string }}
 */
async function send({ to, subject, html, text, from, fromName, persona }) {
  if (!process.env.SENDGRID_API_KEY) {
    console.warn('[SendGrid] Skipping send — SENDGRID_API_KEY not configured');
    return { success: false, reason: 'not_configured' };
  }

  const sender = resolveFrom({ from, fromName, persona });

  const msg = {
    to,
    from: sender,
    subject,
    html: html || text || '',
    text: text || stripHtml(html || ''),
  };

  try {
    const [response] = await sgMail.send(msg);
    const msgId = response?.headers?.['x-message-id'] || null;
    console.log(`[SendGrid] Sent to ${Array.isArray(to) ? to.join(', ') : to} from ${sender.name} <${sender.email}>: "${subject}"`);
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
 * @param {Array<{ to, subject, html, text, from?, fromName?, persona? }>} messages
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
    // Use allSettled so one failure doesn't crash the entire batch
    const settled = await Promise.allSettled(
      batch.map(async (msg) => {
        const result = await send(msg);
        if (result.success) sent++;
        else failed++;
        return { to: msg.to, subject: msg.subject, ...result };
      })
    );
    for (const s of settled) {
      if (s.status === 'fulfilled') results.push(s.value);
      else { failed++; results.push({ error: s.reason?.message || 'Unknown error' }); }
    }

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
 * @returns {{ configured: boolean, from: string|null, identities: Object }}
 */
function status() {
  return {
    configured: !!process.env.SENDGRID_API_KEY,
    from: process.env.SENDGRID_FROM_EMAIL || null,
    fromName: process.env.SENDGRID_FROM_NAME || null,
    identities: SENDER_IDENTITIES,
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
 * Persona-aware branding config for email shells.
 * Each persona gets its own header, footer, and color scheme.
 */
const BRAND_SHELLS = {
  hoa: {
    title: 'HOA Project Funding',
    url: 'hoaprojectfunding.com',
    gradient: 'linear-gradient(135deg,#1e40af,#3b82f6)',
    footer: 'HOA Project Funding',
    footerNote: 'You received this email because your community was identified as a potential fit for our services.',
  },
  jake: {
    title: 'Pilcher Financial — Fractional CFO + AI',
    url: 'jakecfo.com',
    gradient: 'linear-gradient(135deg,#b45309,#f59e0b)',
    footer: 'Pilcher Financial Consulting',
    footerNote: 'You received this email because your company was identified as a potential fit for our construction CFO services.',
  },
  owen: {
    title: 'Pilcher Financial — PM Finance',
    url: 'owencfo.com',
    gradient: 'linear-gradient(135deg,#0e7490,#22d3ee)',
    footer: 'Pilcher Financial Consulting',
    footerNote: 'You received this email because your company was identified as a potential fit for our property management CFO services.',
  },
  data_rehab: {
    title: 'Privium Data Services',
    url: 'getdatarehab.com',
    gradient: 'linear-gradient(135deg,#7c3aed,#a78bfa)',
    footer: 'Privium Data Services',
    footerNote: 'You received this email because your company was identified as a potential fit for our data services.',
  },
  terrapin: {
    title: 'Terrapin Station Community Services',
    url: 'terrapinstationfences.com',
    gradient: 'linear-gradient(135deg,#15803d,#4ade80)',
    footer: 'Terrapin Station Community Services',
    footerNote: 'You received this email because your community was identified as a potential fit for our services.',
  },
};
// Alias
BRAND_SHELLS.fence = BRAND_SHELLS.terrapin;
BRAND_SHELLS.cfo = BRAND_SHELLS.jake;

/**
 * Branded HTML email shell — persona-aware.
 * Pass your body content as an HTML string.
 *
 * @param {string} bodyHtml — Inner HTML content (paragraphs, etc.)
 * @param {Object} [opts]
 * @param {string} [opts.preheader] — Preview text shown in email client
 * @param {string} [opts.persona]  — Persona key (hoa, jake, data_rehab, etc.) for brand-specific shell
 * @returns {string} Full HTML email
 */
function wrapInBrandedShell(bodyHtml, { preheader = '', persona = 'hoa' } = {}) {
  const brand = BRAND_SHELLS[persona] || BRAND_SHELLS.hoa;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${brand.title}</title>
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
            <td style="background:${brand.gradient};border-radius:8px 8px 0 0;padding:28px 32px;">
              <div style="font-size:22px;font-weight:700;color:#ffffff;">${brand.title}</div>
              <div style="font-size:13px;color:rgba(255,255,255,0.8);margin-top:4px;">${brand.url}</div>
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
                ${brand.footer} &bull; <a href="https://${brand.url}" style="color:#6b7280;text-decoration:none;">${brand.url}</a>
              </p>
              <p style="margin:8px 0 0;font-size:11px;color:#9ca3af;text-align:center;">
                ${brand.footerNote}
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

module.exports = { send, sendBulk, status, wrapInBrandedShell, stripHtml, SENDER_IDENTITIES, BRAND_SHELLS, resolveFrom };
