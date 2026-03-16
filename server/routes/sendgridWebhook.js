/**
 * @file sendgridWebhook.js (routes)
 * @description SendGrid webhooks — event tracking + inbound email reply ingestion.
 *
 * ENDPOINTS:
 *   POST /api/webhooks/sendgrid         — Event webhook (bounce, delivered, open, click)
 *   POST /api/webhooks/sendgrid/inbound — Inbound Parse (catches email replies, auto-classifies)
 *
 * SETUP — Event Webhook:
 *   SendGrid → Settings → Mail Settings → Event Webhook
 *   URL: https://your-domain/api/webhooks/sendgrid
 *   Events: Bounced, Dropped, Spam Report, Delivered, Opened, Clicked
 *
 * SETUP — Inbound Parse:
 *   1. DNS: Add MX record for reply.hoaprojectfunding.com → mx.sendgrid.net (priority 10)
 *   2. SendGrid → Settings → Inbound Parse → Add Host & URL:
 *      Host: reply.hoaprojectfunding.com
 *      URL:  https://your-domain/api/webhooks/sendgrid/inbound
 *      Check: "POST the raw, full MIME message" = OFF (we want parsed JSON)
 *   3. Set REPLY_FROM_EMAIL=reply@reply.hoaprojectfunding.com in .env.local
 *      (or use info@hoaprojectfunding.com if MX is set on root domain)
 *
 * HOW REPLIES GET ROUTED:
 *   Prospect replies → reply.hoaprojectfunding.com
 *   → SendGrid Inbound Parse catches it
 *   → POST /api/webhooks/sendgrid/inbound (multipart form: from, subject, text, html)
 *   → Match sender email to cfo_leads.contact_email
 *   → Run jake_reply_classifier logic inline (INTERESTED/NOT_NOW/WRONG_PERSON/UNSUBSCRIBE/BOUNCED)
 *   → Update lead status + outreach sequence status
 *   → Brain learns from outcome (Layer 2 feedback + Layer 3 episode)
 *   → Discord alert on INTERESTED replies
 *   → If INTERESTED → auto-create pending run for jake-meeting-booker
 */

const { Router } = require('express');
const multer = require('multer');
const { run, get, all } = require('../db/connection');
const { v4: uuidv4 } = require('uuid');

// Revenue tracking — engagement scoring + event logging
let revenue;
try { revenue = require('../services/revenueTracker'); } catch { revenue = null; }

const router = Router();
// Multer for multipart/form-data from SendGrid Inbound Parse (no file storage needed)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ════════════════════════════════════════════════════════════════════════════
// 1. EVENT WEBHOOK — bounce, delivered, open, click, spamreport
// ════════════════════════════════════════════════════════════════════════════

router.post('/sendgrid', (req, res) => {
  const events = Array.isArray(req.body) ? req.body : [req.body];

  let processed = 0;
  let bounced = 0;
  let delivered = 0;
  let complained = 0;

  for (const event of events) {
    if (!event || !event.email) continue;

    const email = event.email.toLowerCase();
    const eventType = event.event;

    try {
      switch (eventType) {
        case 'bounce':
        case 'dropped': {
          const seq = get(
            "SELECT s.id, s.lead_id FROM cfo_outreach_sequences s JOIN cfo_leads l ON l.id = s.lead_id WHERE LOWER(l.contact_email)=? AND s.status='sent' ORDER BY s.sent_at DESC LIMIT 1",
            [email]
          );
          if (seq) {
            run("UPDATE cfo_outreach_sequences SET status='bounced', delivery_status='bounced', delivery_error=? WHERE id=?",
              [event.reason || event.response || eventType, seq.id]);
            run("UPDATE cfo_leads SET status='bounced', updated_at=datetime('now') WHERE id=?", [seq.lead_id]);
            if (revenue) {
              revenue.recordEvent(seq.lead_id, 'deal_lost', {
                agent: 'sendgrid-webhook', sequenceId: seq.id, channel: 'email',
                metadata: { reason: event.reason || eventType },
              });
            }
            try {
              const cadence = require('../services/tenacityCadenceEngine');
              cadence.deactivateCadence(seq.lead_id, 'jake');
            } catch {}
            bounced++;
          }
          break;
        }

        case 'spamreport': {
          const seq = get(
            "SELECT s.id, s.lead_id FROM cfo_outreach_sequences s JOIN cfo_leads l ON l.id = s.lead_id WHERE LOWER(l.contact_email)=? ORDER BY s.sent_at DESC LIMIT 1",
            [email]
          );
          if (seq) {
            run("UPDATE cfo_leads SET status='unsubscribed', updated_at=datetime('now') WHERE id=?", [seq.lead_id]);
            if (revenue) {
              revenue.recordEvent(seq.lead_id, 'deal_lost', {
                agent: 'sendgrid-webhook', sequenceId: seq.id, channel: 'email',
                metadata: { reason: 'spam_report' },
              });
            }
            try {
              const cadence = require('../services/tenacityCadenceEngine');
              cadence.deactivateCadence(seq.lead_id, 'jake');
            } catch {}
            complained++;
          }
          break;
        }

        case 'delivered': {
          const seq = get(
            "SELECT s.id, s.lead_id FROM cfo_outreach_sequences s JOIN cfo_leads l ON l.id = s.lead_id WHERE LOWER(l.contact_email)=? AND s.status='sent' ORDER BY s.sent_at DESC LIMIT 1",
            [email]
          );
          if (seq) {
            run("UPDATE cfo_outreach_sequences SET delivery_status='delivered' WHERE id=?", [seq.id]);
            if (revenue) {
              revenue.updateEngagementScore(seq.lead_id, 'delivered', { sequenceId: seq.id });
              revenue.recordEvent(seq.lead_id, 'contacted', { agent: 'outreach-sender', sequenceId: seq.id, channel: 'email' });
              revenue.updateVariantOutcome(seq.id, 'delivered', 1);
            }
            delivered++;
          }
          break;
        }

        case 'open':
        case 'click': {
          const seq2 = get(
            "SELECT s.id, s.lead_id, s.email_subject FROM cfo_outreach_sequences s JOIN cfo_leads l ON l.id = s.lead_id WHERE LOWER(l.contact_email)=? ORDER BY s.sent_at DESC LIMIT 1",
            [email]
          );
          if (seq2) {
            run("UPDATE cfo_leads SET updated_at=datetime('now') WHERE id=?", [seq2.lead_id]);
            if (revenue) {
              revenue.updateEngagementScore(seq2.lead_id, eventType, {
                sequenceId: seq2.id,
                subject: seq2.email_subject,
                linkUrl: event.url || null,
              });
              if (eventType === 'open') {
                revenue.updateVariantOutcome(seq2.id, 'opened', 1);
                revenue.updateVariantOutcome(seq2.id, 'open_count', 1);
                revenue.updateVariantOutcome(seq2.id, 'first_open_at', new Date().toISOString());
              }
              if (eventType === 'click') {
                revenue.updateVariantOutcome(seq2.id, 'clicked', 1);
                revenue.updateVariantOutcome(seq2.id, 'first_click_at', new Date().toISOString());
              }
            }
          }
          break;
        }
      }
      processed++;
    } catch (err) {
      console.error(`[SendGrid Webhook] Error processing ${eventType} for ${email}:`, err.message);
    }
  }

  console.log(`[SendGrid Webhook] Processed ${processed} events: ${delivered} delivered, ${bounced} bounced, ${complained} complaints`);
  res.status(200).json({ processed, bounced, delivered, complained });
});


// ════════════════════════════════════════════════════════════════════════════
// 2. INBOUND PARSE — Reply ingestion pipeline
// ════════════════════════════════════════════════════════════════════════════
//
// SendGrid Inbound Parse POSTs multipart form data with these fields:
//   from:     "John Smith <john@company.com>"
//   to:       "info@hoaprojectfunding.com"
//   subject:  "Re: Quick question about your AP process"
//   text:     "Sure, I'd love to learn more..."     (plain text body)
//   html:     "<html>..."                            (HTML body)
//   envelope: '{"from":"john@company.com","to":["info@hoaprojectfunding.com"]}'

router.post('/sendgrid/inbound', upload.any(), async (req, res) => {
  const startTime = Date.now();

  try {
    // ── Parse sender email from SendGrid's multipart fields ──
    const rawFrom = req.body.from || '';
    const envelope = safeJsonParse(req.body.envelope);
    const senderEmail = extractEmail(rawFrom) || envelope?.from || null;
    const subject = req.body.subject || '';
    const textBody = req.body.text || '';
    const htmlBody = req.body.html || '';

    // Use plain text body, fall back to stripping HTML
    const replyText = textBody.trim() || stripHtml(htmlBody).trim();

    console.log(`[Inbound] Received reply from: ${senderEmail} | Subject: "${subject}" | Body length: ${replyText.length}`);

    if (!senderEmail) {
      console.warn('[Inbound] No sender email found — dropping');
      return res.status(200).json({ status: 'dropped', reason: 'no_sender_email' });
    }

    if (!replyText) {
      console.warn(`[Inbound] Empty reply body from ${senderEmail} — dropping`);
      return res.status(200).json({ status: 'dropped', reason: 'empty_body' });
    }

    // ── Match sender to a lead ──
    const lead = get(
      "SELECT * FROM cfo_leads WHERE LOWER(contact_email) = ?",
      [senderEmail.toLowerCase()]
    );

    if (!lead) {
      console.log(`[Inbound] No matching lead for ${senderEmail} — logging as unmatched`);
      // Store unmatched replies so nothing is lost
      run(
        `INSERT INTO audit_log (id, action, resource, details, outcome)
         VALUES (lower(hex(randomblob(16))), 'inbound_reply_unmatched', ?, ?, 'info')`,
        [
          `email:${senderEmail}`,
          JSON.stringify({ from: senderEmail, subject, body_preview: replyText.slice(0, 500), received_at: new Date().toISOString() }),
        ]
      );
      return res.status(200).json({ status: 'unmatched', email: senderEmail });
    }

    console.log(`[Inbound] Matched to lead #${lead.id}: ${lead.company_name} (${lead.contact_name})`);

    // ── Strip quoted text / email signatures — isolate the actual reply ──
    const cleanReply = stripQuotedText(replyText);

    // ── Classify the reply (same logic as jake_reply_classifier handler) ──
    const classification = classifyReply(cleanReply);
    console.log(`[Inbound] Classification: ${classification.type} | Lead status: ${classification.leadStatus || 'unchanged'}`);

    // ── Update lead + outreach sequence status ──
    if (classification.leadStatus) {
      run("UPDATE cfo_leads SET status=?, updated_at=datetime('now') WHERE id=?",
        [classification.leadStatus, lead.id]);
    }
    if (classification.seqStatus) {
      run(
        "UPDATE cfo_outreach_sequences SET status=?, replied_at=datetime('now') WHERE lead_id=? AND status='sent'",
        [classification.seqStatus, lead.id]
      );
    }

    // ── Store the reply text on the outreach sequence for reference ──
    const lastSeq = get(
      "SELECT id FROM cfo_outreach_sequences WHERE lead_id=? ORDER BY sent_at DESC LIMIT 1",
      [lead.id]
    );
    if (lastSeq) {
      run(
        "UPDATE cfo_outreach_sequences SET delivery_status='replied', delivery_error=NULL WHERE id=?",
        [lastSeq.id]
      );
    }

    // ── Audit log — full reply record ──
    run(
      `INSERT INTO audit_log (id, action, resource, details, outcome)
       VALUES (lower(hex(randomblob(16))), 'inbound_reply_classified', ?, ?, ?)`,
      [
        `lead:${lead.id}`,
        JSON.stringify({
          from: senderEmail,
          subject,
          body_preview: cleanReply.slice(0, 1000),
          classification: classification.type,
          lead_status: classification.leadStatus,
          company: lead.company_name,
          received_at: new Date().toISOString(),
        }),
        classification.type === 'INTERESTED' ? 'success' : 'info',
      ]
    );

    // ── Brain Layer 2: feedback signal ──
    try {
      const brain = require('../services/collectiveBrain');
      const agentName = lead.source_agent === 'jake' ? 'jake-outreach-agent' : 'cfo-outreach-agent';
      const market = [lead.city, lead.state].filter(Boolean).join(', ');
      const signalMap = {
        INTERESTED: 'converted', NOT_NOW: 'rejected', WRONG_PERSON: 'rejected',
        UNSUBSCRIBE: 'rejected', BOUNCED: 'bounced', NEUTRAL: 'approved',
      };

      brain.recordFeedback(agentName, 'outreach', String(lead.id), signalMap[classification.type], {
        notes: `Inbound reply auto-classified: ${classification.type}. Reply: "${cleanReply.slice(0, 100)}"`,
        market,
        metadata: { classification: classification.type, company: lead.company_name, erp: lead.erp_type, source: 'inbound_parse' },
      });

      // Brain Layer 3: episode
      const outcomeScores = { INTERESTED: 0.9, NOT_NOW: 0.3, WRONG_PERSON: 0.2, UNSUBSCRIBE: 0.1, BOUNCED: 0.0, NEUTRAL: 0.5 };
      const outcomeTypes = { INTERESTED: 'replied', NOT_NOW: 'lost', WRONG_PERSON: 'lost', UNSUBSCRIBE: 'lost', BOUNCED: 'lost', NEUTRAL: 'replied' };
      const outcomeTexts = {
        INTERESTED: 'Lead replied — interested in meeting',
        NOT_NOW: 'Lead replied — not right now',
        WRONG_PERSON: 'Lead replied — wrong contact',
        UNSUBSCRIBE: 'Lead replied — unsubscribed',
        BOUNCED: 'Email bounced',
        NEUTRAL: 'Lead replied — neutral/unclear',
      };
      const sentSeq = get("SELECT sent_at FROM cfo_outreach_sequences WHERE lead_id=? AND sequence_position=1 ORDER BY created_at LIMIT 1", [lead.id]);
      const daysToOutcome = sentSeq?.sent_at
        ? Math.floor((Date.now() - new Date(sentSeq.sent_at).getTime()) / 86400000) : null;

      brain.recordEpisode(agentName, {
        market,
        erpContext: lead.erp_type,
        contactTitle: lead.contact_title,
        actionTaken: `Cold email outreach to ${lead.company_name} (${lead.erp_type || 'unknown ERP'})`,
        outcome: outcomeTexts[classification.type] || 'Unknown reply',
        outcomeType: outcomeTypes[classification.type] || 'replied',
        outcomeScore: outcomeScores[classification.type] ?? 0.5,
        daysToOutcome,
        leadId: String(lead.id),
      });
    } catch (brainErr) {
      console.warn('[Inbound] Brain update failed (non-fatal):', brainErr.message);
    }

    // ── Revenue tracking — record reply event + engagement score ──
    if (revenue) {
      const replyEventMap = {
        INTERESTED: 'replied', NOT_NOW: 'replied', WRONG_PERSON: 'replied',
        UNSUBSCRIBE: 'deal_lost', BOUNCED: 'deal_lost', NEUTRAL: 'replied',
      };
      revenue.recordEvent(lead.id, replyEventMap[classification.type], {
        agent: 'jake-reply-classifier',
        sequenceId: lastSeq?.id,
        channel: 'email',
        metadata: { classification: classification.type, reply_preview: cleanReply.slice(0, 200) },
      });
      revenue.updateEngagementScore(lead.id, 'reply', { sequenceId: lastSeq?.id, subject });

      // Update A/B variant with reply outcome
      if (lastSeq) {
        revenue.updateVariantOutcome(lastSeq.id, 'replied', 1);
        revenue.updateVariantOutcome(lastSeq.id, 'reply_sentiment', classification.type);
        revenue.updateVariantOutcome(lastSeq.id, 'replied_at', new Date().toISOString());
        if (classification.type === 'INTERESTED') {
          revenue.updateVariantOutcome(lastSeq.id, 'converted', 1);
        }
      }

      // If INTERESTED, advance to 'meeting' stage
      if (classification.type === 'INTERESTED') {
        revenue.recordEvent(lead.id, 'meeting_booked', {
          agent: 'jake-reply-classifier',
          sequenceId: lastSeq?.id,
          channel: 'email',
        });
      }
    }

    // ── Deactivate cadence on terminal outcomes ──
    if (['INTERESTED', 'UNSUBSCRIBE', 'BOUNCED'].includes(classification.type)) {
      try {
        const cadence = require('../services/tenacityCadenceEngine');
        cadence.deactivateCadence(lead.id, lead.source_agent || 'jake');
      } catch {}
    }

    // ── Discord alert on INTERESTED replies ──
    if (classification.type === 'INTERESTED') {
      try {
        const discord = require('../services/discordNotifier');
        await discord.sendEmbed({
          title: `\ud83d\udfe2 INTERESTED REPLY — ${lead.company_name}`,
          color: 0x22c55e,
          fields: [
            { name: 'Contact', value: `${lead.contact_name || 'Unknown'} (${lead.contact_title || 'N/A'})`, inline: true },
            { name: 'Company', value: lead.company_name, inline: true },
            { name: 'ERP', value: lead.erp_type || 'Unknown', inline: true },
            { name: 'Location', value: [lead.city, lead.state].filter(Boolean).join(', ') || 'Unknown', inline: true },
            { name: 'Reply Preview', value: cleanReply.slice(0, 300) || '(empty)', inline: false },
          ],
          timestamp: new Date().toISOString(),
          footer: { text: 'Inbound Parse → Reply Classifier' },
        });
      } catch (discordErr) {
        console.warn('[Inbound] Discord alert failed (non-fatal):', discordErr.message);
      }

      // Auto-queue meeting booker run
      try {
        const systemUser = get("SELECT id FROM users LIMIT 1");
        const meetingAgent = get("SELECT id FROM agents WHERE name='jake-meeting-booker'");
        if (meetingAgent && systemUser) {
          const runId = uuidv4();
          run(
            `INSERT INTO runs (id, agent_id, user_id, status, trigger, result_data, created_at, updated_at)
             VALUES (?, ?, ?, 'pending', 'auto-reply', ?, datetime('now'), datetime('now'))`,
            [
              runId,
              meetingAgent.id,
              systemUser.id,
              JSON.stringify({
                message: JSON.stringify({ lead_id: lead.id, reply_text: cleanReply.slice(0, 500) }),
                sessionId: runId,
              }),
            ]
          );
          console.log(`[Inbound] Auto-queued meeting booker run ${runId} for lead #${lead.id}`);
        }
      } catch (queueErr) {
        console.warn('[Inbound] Meeting booker queue failed (non-fatal):', queueErr.message);
      }
    }

    // ── Discord alert on other notable replies ──
    if (['NOT_NOW', 'WRONG_PERSON', 'UNSUBSCRIBE'].includes(classification.type)) {
      try {
        const discord = require('../services/discordNotifier');
        const colorMap = { NOT_NOW: 0xf59e0b, WRONG_PERSON: 0xf97316, UNSUBSCRIBE: 0xef4444 };
        await discord.sendEmbed({
          title: `Reply: ${classification.type.replace('_', ' ')} — ${lead.company_name}`,
          color: colorMap[classification.type] || 0x6b7280,
          fields: [
            { name: 'Contact', value: `${lead.contact_name || 'Unknown'}`, inline: true },
            { name: 'Next Action', value: classification.nextAction, inline: false },
            { name: 'Reply', value: cleanReply.slice(0, 200) || '(empty)', inline: false },
          ],
          timestamp: new Date().toISOString(),
          footer: { text: 'Inbound Parse' },
        });
      } catch {}
    }

    const durationMs = Date.now() - startTime;
    console.log(`[Inbound] Processed reply from ${senderEmail} → ${classification.type} in ${durationMs}ms`);

    res.status(200).json({
      status: 'classified',
      lead_id: lead.id,
      company: lead.company_name,
      classification: classification.type,
      new_lead_status: classification.leadStatus,
      next_action: classification.nextAction,
      duration_ms: durationMs,
    });
  } catch (err) {
    console.error('[Inbound] Fatal error:', err);
    // Always return 200 to SendGrid or it will retry forever
    res.status(200).json({ status: 'error', message: err.message });
  }
});


// ════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Extract email address from "John Smith <john@company.com>" format
 */
function extractEmail(fromStr) {
  if (!fromStr) return null;
  const match = fromStr.match(/<([^>]+)>/);
  if (match) return match[1].toLowerCase();
  // Bare email
  if (fromStr.includes('@')) return fromStr.trim().toLowerCase();
  return null;
}

/**
 * Strip HTML tags to get plain text
 */
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Strip quoted text and email signatures from reply body.
 * Catches: "On Mon, Mar 14... wrote:", "> quoted lines", "---", "Sent from my iPhone"
 */
function stripQuotedText(text) {
  if (!text) return '';
  const lines = text.split('\n');
  const cleanLines = [];

  for (const line of lines) {
    // Stop at quoted text markers
    if (/^On .+ wrote:$/i.test(line.trim())) break;
    if (/^-{3,}/.test(line.trim())) break;
    if (/^_{3,}/.test(line.trim())) break;
    if (/^>/.test(line.trim())) break;
    if (/^Sent from my/i.test(line.trim())) break;
    if (/^Get Outlook/i.test(line.trim())) break;
    if (/^From:.*@/i.test(line.trim())) break;
    if (/^Begin forwarded/i.test(line.trim())) break;
    if (/^\*From:\*/i.test(line.trim())) break;

    cleanLines.push(line);
  }

  return cleanLines.join('\n').trim();
}

/**
 * Classify reply text — same regex logic as jake_reply_classifier handler
 */
function classifyReply(replyText) {
  const text = replyText.toLowerCase();

  if (/\b(yes|interested|tell me more|let'?s? talk|schedule|call|would like|sounds good|love to|set up|book|connect)\b/.test(text)) {
    return { type: 'INTERESTED', leadStatus: 'replied', seqStatus: 'replied', nextAction: 'Auto-queued meeting booker' };
  }
  if (/\b(not right now|maybe later|reach out in|try (me |us )?(again|in|next)|busy|not a (good|right) time|few months|next (quarter|year))\b/.test(text)) {
    return { type: 'NOT_NOW', leadStatus: 'nurture', seqStatus: 'replied', nextAction: 'Move to nurture — re-engage in 60 days' };
  }
  if (/\b(wrong person|not my area|not my department|forward(ed)? to|try [A-Z][a-z]|reach out to|you want|should contact)\b/.test(text)) {
    return { type: 'WRONG_PERSON', leadStatus: 'bad_contact', seqStatus: 'replied', nextAction: 'Find correct decision maker' };
  }
  if (/\b(unsubscribe|remove me|take me off|stop (emailing|contacting)|don'?t (contact|email)|opt out|no more)\b/.test(text)) {
    return { type: 'UNSUBSCRIBE', leadStatus: 'unsubscribed', seqStatus: 'replied', nextAction: 'Do not contact again' };
  }
  if (/\b(delivery failed|no such user|mailbox full|undeliverable|bounce|does not exist|invalid address)\b/.test(text)) {
    return { type: 'BOUNCED', leadStatus: 'bounced', seqStatus: 'bounced', nextAction: 'Find correct email' };
  }

  return { type: 'NEUTRAL', leadStatus: null, seqStatus: 'replied', nextAction: 'Monitor — no clear intent signal' };
}

function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

module.exports = router;
