/**
 * Inbound Lead Capture API
 *
 * Public endpoints (no auth) for capturing leads from:
 * - Blog contact forms
 * - Lead magnet downloads (checklists, calculators, guides)
 * - Newsletter signups
 *
 * POST /api/capture/lead     — Capture a lead from a form submission
 * POST /api/capture/download — Track a lead magnet download
 * GET  /api/capture/stats    — Capture stats (requires auth)
 *
 * SETUP:
 *   Add a form to hoaprojectfunding.com that POSTs to:
 *   https://your-server/api/capture/lead
 *
 *   Or embed a script that calls the API on form submit.
 */

const express = require('express');
const { run, get, all } = require('../db/connection');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Simple rate limit for public endpoints (in-memory, resets on restart)
const captureAttempts = new Map();
const CAPTURE_LIMIT = 10; // max captures per IP per hour
const CAPTURE_WINDOW = 60 * 60 * 1000; // 1 hour

function checkCaptureRate(ip) {
  const now = Date.now();
  const attempts = captureAttempts.get(ip) || [];
  const recent = attempts.filter(t => now - t < CAPTURE_WINDOW);
  if (recent.length >= CAPTURE_LIMIT) return false;
  recent.push(now);
  captureAttempts.set(ip, recent);
  return true;
}

// ─── Public: Capture Lead ───────────────────────────────────────────────────

router.post('/lead', (req, res) => {
  try {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    if (!checkCaptureRate(ip)) {
      return res.status(429).json({ error: 'Too many submissions. Please try again later.' });
    }

    const {
      name,
      email,
      company,
      phone,
      source,        // 'blog_form', 'lead_magnet', 'newsletter', 'landing_page'
      source_detail, // page URL, magnet name, etc.
      message,       // optional free-text
      product,       // 'hoa' or 'jake' (default: detect from source)
      // UTM parameters (passed from form JS or parsed from referrer)
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      referrer,      // document.referrer from the form page
    } = req.body;

    // Validate required fields
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    // Build UTM attribution string
    const utmParts = [
      utm_source && `src=${utm_source}`,
      utm_medium && `med=${utm_medium}`,
      utm_campaign && `cmp=${utm_campaign}`,
      utm_content && `cnt=${utm_content}`,
      utm_term && `trm=${utm_term}`,
    ].filter(Boolean);
    const utmString = utmParts.length > 0 ? `[UTM: ${utmParts.join(', ')}]` : '';
    const referrerString = referrer ? `[Referrer: ${referrer}]` : '';

    // Detect product from UTM or source if not specified
    const detectedProduct = product
      || (utm_campaign?.includes('jake') ? 'jake' : null)
      || (utm_campaign?.includes('hoa') ? 'hoa' : null)
      || (source_detail?.includes('hoa') || source_detail?.includes('HOA') ? 'hoa' : 'jake');

    // Check for duplicate by email
    const existing = get('SELECT id, company_name FROM cfo_leads WHERE LOWER(contact_email) = ?',
      [email.toLowerCase()]);

    if (existing) {
      // Update existing lead with inbound interest signal
      run(`UPDATE cfo_leads SET
        notes = COALESCE(notes, '') || '\n[INBOUND ' || datetime('now') || '] ' || ?,
        updated_at = datetime('now')
        WHERE id = ?`,
        [`${source || 'form'}: ${message || 'submitted form'} ${utmString} ${referrerString}`.trim(), existing.id]);

      // Record revenue event — inbound interest from known lead is high-value
      try {
        const revenue = require('../services/revenueTracker');
        revenue.updateEngagementScore(existing.id, 'click', { subject: source_detail });
        revenue.recordEvent(existing.id, 'replied', {
          agent: 'lead-capture',
          channel: 'inbound_form',
          metadata: { source, source_detail, message },
        });
      } catch {}

      return res.status(200).json({
        status: 'existing_lead_updated',
        lead_id: existing.id,
        company: existing.company_name,
      });
    }

    // Create new lead — use large random ID to avoid collisions
    const id = require('crypto').randomInt(1000000, 99999999);
    const contactParts = (name || '').trim().split(' ');
    const contactName = name || null;

    run(`INSERT INTO cfo_leads (
      id, company_name, contact_name, contact_email, phone, status,
      source, source_agent, enrichment_status, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'new', ?, ?, 'pending', ?, datetime('now'), datetime('now'))`,
      [
        id,
        company || `${contactParts[0] || 'Unknown'}'s Company`,
        contactName,
        email.toLowerCase(),
        phone || null,
        `inbound_${source || 'form'}`,
        detectedProduct,
        `[INBOUND ${new Date().toISOString()}] Source: ${source || 'form'}. ${source_detail ? `Page: ${source_detail}. ` : ''}${utmString} ${referrerString} ${message || ''}`.trim(),
      ]);

    // Record revenue event
    try {
      const revenue = require('../services/revenueTracker');
      revenue.recordEvent(id, 'discovered', {
        agent: 'lead-capture',
        channel: 'inbound_form',
        metadata: { source, source_detail, message, utm_source, utm_medium, utm_campaign, utm_content, referrer },
      });
    } catch {}

    // Discord notification for inbound leads (these are high-value)
    try {
      const discord = require('../services/discordNotifier');
      discord.sendEmbed({
        title: `Inbound Lead — ${company || email}`,
        color: 0x22c55e,
        fields: [
          { name: 'Name', value: name || 'Not provided', inline: true },
          { name: 'Email', value: email, inline: true },
          { name: 'Source', value: `${source || 'form'}${source_detail ? ` (${source_detail})` : ''}`, inline: true },
          message ? { name: 'Message', value: message.slice(0, 300), inline: false } : null,
        ].filter(Boolean),
        timestamp: new Date().toISOString(),
        footer: { text: 'Lead Capture — Inbound' },
      }).catch(() => {});
    } catch {}

    console.log(`[LeadCapture] New inbound lead: ${email} (${company || 'no company'}) via ${source || 'form'}`);

    res.status(201).json({
      status: 'captured',
      lead_id: id,
      message: 'Thank you! We\'ll be in touch soon.',
    });
  } catch (err) {
    console.error('[LeadCapture] Error:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ─── Public: Track Download ─────────────────────────────────────────────────

router.post('/download', (req, res) => {
  try {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    if (!checkCaptureRate(ip)) {
      return res.status(429).json({ error: 'Too many requests.' });
    }

    const { email, magnet_name, magnet_url } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    // Check if lead exists
    const lead = get('SELECT id FROM cfo_leads WHERE LOWER(contact_email) = ?', [email.toLowerCase()]);

    if (lead) {
      // Update existing lead
      run(`UPDATE cfo_leads SET
        notes = COALESCE(notes, '') || '\n[DOWNLOAD ' || datetime('now') || '] ' || ?,
        updated_at = datetime('now')
        WHERE id = ?`,
        [`Downloaded: ${magnet_name || magnet_url || 'lead magnet'}`, lead.id]);

      try {
        const revenue = require('../services/revenueTracker');
        revenue.updateEngagementScore(lead.id, 'click', { subject: magnet_name, linkUrl: magnet_url });
      } catch {}
    }

    // Log the download event regardless
    run(`INSERT INTO audit_log (id, action, resource, details, outcome)
      VALUES (lower(hex(randomblob(16))), 'lead_magnet_download', ?, ?, 'info')`,
      [
        `email:${email}`,
        JSON.stringify({ email, magnet_name, magnet_url, lead_id: lead?.id, timestamp: new Date().toISOString() }),
      ]);

    res.status(200).json({
      status: 'tracked',
      lead_id: lead?.id || null,
    });
  } catch (err) {
    console.error('[LeadCapture] Download tracking error:', err.message);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// ─── Authenticated: Capture Stats ───────────────────────────────────────────

router.get('/stats', authenticate, (req, res) => {
  try {
    const total = get("SELECT COUNT(*) as n FROM cfo_leads WHERE source LIKE 'inbound_%'");
    const thisWeek = get("SELECT COUNT(*) as n FROM cfo_leads WHERE source LIKE 'inbound_%' AND created_at >= datetime('now', '-7 days')");
    const bySource = all("SELECT source, COUNT(*) as n FROM cfo_leads WHERE source LIKE 'inbound_%' GROUP BY source ORDER BY n DESC");
    const downloads = get("SELECT COUNT(*) as n FROM audit_log WHERE action = 'lead_magnet_download'");

    res.json({
      total_inbound: total?.n || 0,
      this_week: thisWeek?.n || 0,
      by_source: bySource || [],
      total_downloads: downloads?.n || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Public: Newsletter Signup ───────────────────────────────────────────────

router.post('/newsletter', (req, res) => {
  try {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    if (!checkCaptureRate(ip)) {
      return res.status(429).json({ error: 'Too many submissions.' });
    }

    const { email, name, product, source_detail } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    let newsletter;
    try { newsletter = require('../services/newsletterBroadcast'); } catch {
      return res.status(500).json({ error: 'Newsletter service not available' });
    }

    const result = newsletter.subscribe(email, {
      name: name || null,
      product: product || 'hoa',
      source: 'website',
      sourceDetail: source_detail || null,
    });

    // Also auto-subscribe when someone submits the main lead form
    // (handled by subscribe's duplicate check)

    res.status(result.status === 'subscribed' ? 201 : 200).json(result);
  } catch (err) {
    console.error('[LeadCapture] Newsletter signup error:', err.message);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// ─── Public: Unsubscribe ────────────────────────────────────────────────────

router.get('/unsubscribe', (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).send('Email required');

    let newsletter;
    try { newsletter = require('../services/newsletterBroadcast'); } catch {
      return res.status(200).send('Unsubscribed.');
    }

    newsletter.unsubscribe(email);
    res.status(200).send(`
      <html><body style="font-family:sans-serif;max-width:400px;margin:60px auto;text-align:center;">
        <h2>Unsubscribed</h2>
        <p>You've been removed from our mailing list. We're sorry to see you go.</p>
      </body></html>
    `);
  } catch (err) {
    res.status(200).send('Unsubscribed.');
  }
});

// ─── Authenticated: Newsletter Stats ────────────────────────────────────────

router.get('/newsletter/stats', authenticate, (req, res) => {
  try {
    let newsletter;
    try { newsletter = require('../services/newsletterBroadcast'); } catch {
      return res.json({ active_subscribers: 0, new_this_week: 0, total_broadcasts: 0 });
    }
    res.json(newsletter.getStats());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
