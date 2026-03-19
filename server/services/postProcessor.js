/**
 * @file postProcessor.js
 * @description Shared post-processing for LLM agent output.
 *
 * Called from three execution paths:
 *   1. runs.js      — manual /confirm endpoint
 *   2. scheduleRunner.js — scheduled cron execution
 *   3. blitz.js     — batch blitz execution
 *
 * Routes agent output into the unified marketing pipeline tables:
 *   - cfo_content_pieces   (content from cfo-content-engine + jake-content-engine)
 *   - cfo_outreach_sequences (emails from cfo-outreach-agent + jake-outreach-agent)
 *   - cfo_leads            (leads from jake-lead-scout)
 */

'use strict';

const { run, get } = require('../db/connection');
const { checkContent } = require('./contentGuard');
const ralphQA = require('./ralphQA');

/**
 * Derive workspace_id from agent name. Reads from DB first (durable), falls back to prefix matching.
 */
function deriveWorkspaceId(agentNameOrId) {
  // Try DB lookup first
  try {
    const agent = get('SELECT workspace_id FROM agents WHERE name = ? OR id = ?', [agentNameOrId, agentNameOrId]);
    if (agent?.workspace_id) return agent.workspace_id;
  } catch {}

  // Prefix fallback
  const name = (agentNameOrId || '').toLowerCase();
  if (name.startsWith('jake') || name.startsWith('ralph') || name.startsWith('charlie') ||
      name.startsWith('todd') || name.startsWith('cfo-') || name.startsWith('bid-result') ||
      name.startsWith('permit') || name.startsWith('hiring-signal') || name.startsWith('pain-signal') ||
      name.startsWith('meeting-booker') || name.startsWith('linkedin-direct') || name.startsWith('twitter-poster')) return 1;
  if (name.startsWith('hoa')) return 2;
  if (name.startsWith('owen')) return 3;
  if (name.startsWith('data-rehab')) return 4;

  return null; // global/system agent
}

/**
 * Parse JSON from agent output — handles raw JSON and ```json``` code blocks.
 */
function parseAgentJSON(text) {
  try { return JSON.parse(text); } catch {}
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) try { return JSON.parse(m[1]); } catch {}
  return null;
}

/**
 * Detect the outreach angle type for A/B tracking.
 * Returns one of: pain_signal, social_proof, curious_question, direct_ask, industry_insight, general
 */
function detectAngleType(body) {
  if (!body) return 'general';
  const lower = body.toLowerCase();
  if (/\b(noticed|saw that|came across|spotted|found that)\b.*\b(hiring|posting|job|position|growing|expanding)\b/i.test(lower)) return 'pain_signal';
  if (/\b(similar companies|other (GCs?|contractors)|companies like|peers in)\b/i.test(lower)) return 'social_proof';
  if (/\?\s*$/.test(body.split('\n').slice(0, 3).join(' '))) return 'curious_question'; // question in opening lines
  if (/\b(free|complimentary|no cost|pilot|data health check)\b.*\b(review|audit|assessment|analysis)\b/i.test(lower)) return 'direct_ask';
  if (/\b(industry|construction|market|trend|regulation)\b.*\b(change|shift|challenge|impact)\b/i.test(lower)) return 'industry_insight';
  return 'general';
}

/**
 * Post-process LLM agent output into marketing pipeline tables.
 *
 * @param {object} agent  - Agent record { id, name, config }
 * @param {string} outputText - Raw text output from the agent
 * @param {string} message - The prompt/message sent to the agent
 * @param {object} [opts] - Optional metadata
 * @param {string} [opts.runId] - Run ID for outcome attribution tracing
 */
async function postProcessLLMOutput(agent, outputText, message, { runId } = {}) {
  if (!outputText || !agent?.name) return;

  try {
    const name = agent.name;
    const wsId = deriveWorkspaceId(name);

    // ── Content engines → cfo_content_pieces (with QA + Brain obs + self-eval) ──
    if (name === 'cfo-content-engine' || name === 'jake-content-engine') {
      const source = name.startsWith('jake-') ? 'jake' : 'cfo';
      const p = parseAgentJSON(outputText);
      if (p?.content_markdown) {
        run(
          `INSERT INTO cfo_content_pieces (pillar, channel, title, content_markdown, cta, source_agent, status, qa_status, workspace_id) VALUES (?, ?, ?, ?, ?, ?, 'draft', 'pending', ?)`,
          [p.pillar || 'general', p.channel || 'linkedin', p.title || 'Untitled', p.content_markdown, p.cta || '', source, wsId]
        );

        // Auto-trigger Ralph QA on content
        try {
          const inserted = get('SELECT id FROM cfo_content_pieces WHERE source_agent = ? ORDER BY id DESC LIMIT 1', [source]);
          if (inserted) {
            const qaResult = ralphQA.reviewSingleContent(inserted.id);
            console.log(`[RalphQA] Content #${inserted.id}: ${qaResult.passed ? 'PASSED' : 'FAILED'} (${qaResult.score}/100)`);
          }
        } catch (qaErr) {
          console.warn('[RalphQA] Content review failed (non-fatal):', qaErr.message);
        }

        // Brain Layer 1: content_drafted observation
        try {
          const brain = require('./collectiveBrain');
          const today = new Date().toISOString().slice(0, 10);
          const wordCount = p.content_markdown.split(/\s+/).filter(Boolean).length;
          brain.observe(`content-${today}`, name, 'content_drafted', {
            subject: p.title || 'Untitled',
            content: `Content drafted: "${p.title}" (${p.pillar}/${p.channel}, ${wordCount} words, ${source} brand).`,
            confidence: 1.0,
            metadata: { pillar: p.pillar, channel: p.channel, word_count: wordCount, source_agent: source },
          });
        } catch {}

        // Parse and store self-evaluation scorecard if present
        try {
          const selfEvalMatch = outputText.match(/SELF-EVALUATION[\s\S]*?((?:\w[\w\s]+:\s*\d+\/10[\s\n]*)+)/);
          if (selfEvalMatch) {
            const selfEvalText = selfEvalMatch[0].slice(0, 500);
            const inserted = get('SELECT id, qa_notes FROM cfo_content_pieces WHERE source_agent = ? ORDER BY id DESC LIMIT 1', [source]);
            if (inserted) {
              const combined = [inserted.qa_notes, `LLM Self-Eval: ${selfEvalText.replace(/\n/g, ' | ')}`].filter(Boolean).join(' || ');
              run('UPDATE cfo_content_pieces SET qa_notes = ? WHERE id = ?', [combined, inserted.id]);
            }
          }
        } catch {}

        // Auto-approve QA-passed content + queue social amplification
        try {
          const inserted = get('SELECT id, title, qa_status, qa_score, channel FROM cfo_content_pieces WHERE source_agent = ? ORDER BY id DESC LIMIT 1', [source]);
          // Auto-approve content that passes QA with score >= 85
          if (inserted && inserted.qa_status === 'passed' && (inserted.qa_score || 0) >= 85) {
            run("UPDATE cfo_content_pieces SET status = 'approved' WHERE id = ? AND status = 'draft'", [inserted.id]);
            console.log(`[PostProcessor] Auto-approved content #${inserted.id} "${inserted.title}" (QA: ${inserted.qa_score})`);
          }
          if (inserted && inserted.qa_status === 'passed' && inserted.channel === 'blog') {
            // Queue social derivatives spread across the week
            const title = inserted.title || 'New post';
            const crypto = require('crypto');
            run(`INSERT INTO content_queue (id, platform, content, source_agent, status, scheduled_for)
              VALUES (?, 'linkedin', ?, ?, 'pending', datetime('now', '+1 day'))`,
              [crypto.randomUUID(), JSON.stringify({ text: `New article: ${title}`, title }), source]);
            run(`INSERT INTO content_queue (id, platform, content, source_agent, status, scheduled_for)
              VALUES (?, 'twitter', ?, ?, 'pending', datetime('now', '+2 days'))`,
              [crypto.randomUUID(), JSON.stringify({ text: title }), source]);
            run(`INSERT INTO content_queue (id, platform, content, source_agent, status, scheduled_for)
              VALUES (?, 'facebook', ?, ?, 'pending', datetime('now', '+3 days'))`,
              [crypto.randomUUID(), JSON.stringify({ text: title }), source]);
            console.log(`[PostProcessor] Auto-queued social amplification for "${title}" (LinkedIn +1d, Twitter +2d, Facebook +3d)`);
          }
        } catch (ampErr) {
          console.warn('[PostProcessor] Social amplification queue failed (non-fatal):', ampErr.message);
        }
      }
    }

    // ── Outreach agents → cfo_outreach_sequences (with content guard) ──
    if (name === 'cfo-outreach-agent' || name === 'jake-outreach-agent') {
      const source = name.startsWith('jake-') ? 'jake' : 'cfo';
      const p = parseAgentJSON(outputText);
      if (p?.email_body || p?.body_text) {
        const body = p.email_body || p.body_text;
        const subject = p.email_subject || p.subject || 'Outreach';

        // Content safety check — flag dangerous content before saving
        const guard = checkContent(body, subject);
        const status = guard.safe ? 'draft' : 'flagged';
        if (!guard.safe) {
          console.warn(`[ContentGuard] ${name} output flagged (${guard.flagCount} issues):`, guard.flags.map(f => `${f.type}:${f.match}`).join(', '));
        }

        let leadId = null;
        try { leadId = JSON.parse(message)?.lead_id || null; } catch {}

        // Detect angle type for A/B tracking
        const angleType = detectAngleType(body);

        run(
          `INSERT INTO cfo_outreach_sequences (lead_id, sequence_type, email_subject, email_body, pilot_offer, source_agent, status, qa_status, angle_type, workspace_id, source_run_id) VALUES (?, 'blitz', ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
          [leadId, subject, body, p.pilot_offer || null, source, status, angleType, wsId, runId || null]
        );

        // Auto-trigger Ralph QA on the newly inserted draft
        try {
          const inserted = get('SELECT id FROM cfo_outreach_sequences WHERE lead_id = ? ORDER BY id DESC LIMIT 1', [leadId]);
          if (inserted) {
            const qaResult = ralphQA.reviewSingleOutreach(inserted.id);
            console.log(`[RalphQA] Auto-reviewed outreach #${inserted.id}: ${qaResult.passed ? 'PASSED' : 'FAILED'} (${qaResult.score}/100)`);

            // Brain Layer 1: outreach_drafted observation
            try {
              const brain = require('./collectiveBrain');
              const today = new Date().toISOString().slice(0, 10);
              brain.observe(`outreach-${today}`, name, 'outreach_drafted', {
                subject: p.email_subject || p.subject || 'Outreach',
                content: `Outreach drafted for lead #${leadId} (${source}). QA: ${qaResult.passed ? 'PASSED' : 'FAILED'} (${qaResult.score}/100). Angle: ${angleType}.`,
                confidence: 1.0,
                metadata: { lead_id: leadId, qa_score: qaResult.score, qa_passed: qaResult.passed, angle_type: angleType, source_agent: source },
              });
            } catch {}

            // Auto-approval: if QA passed, evaluate for autonomous send
            if (qaResult.passed) {
              try {
                const autoApproval = require('./autoApprovalEngine');
                const decision = await autoApproval.processNewDraft(inserted.id);
                console.log(`[AutoApproval] Outreach #${inserted.id}: ${decision.decision} — ${decision.reason}`);
              } catch (autoErr) {
                console.warn('[AutoApproval] Non-fatal:', autoErr.message);
              }
            }
          }
        } catch (qaErr) {
          console.warn('[RalphQA] Auto-review failed (non-fatal):', qaErr.message);
        }

        // Parse and store self-evaluation scorecard if present (cfo-outreach produces this)
        try {
          const selfEvalMatch = outputText.match(/SELF-EVALUATION[\s\S]*?((?:\w[\w\s]+:\s*\d+\/10[\s\n]*)+)/);
          if (selfEvalMatch) {
            const selfEvalText = selfEvalMatch[0].slice(0, 500);
            // Append to qa_notes if we have the inserted row
            const inserted = get('SELECT id, qa_notes FROM cfo_outreach_sequences WHERE lead_id = ? ORDER BY id DESC LIMIT 1', [leadId]);
            if (inserted) {
              const combined = [inserted.qa_notes, `LLM Self-Eval: ${selfEvalText.replace(/\n/g, ' | ')}`].filter(Boolean).join(' || ');
              run('UPDATE cfo_outreach_sequences SET qa_notes = ? WHERE id = ?', [combined, inserted.id]);
            }
          }
        } catch {}
      }
    }

    // ── HOA content writer → cfo_content_pieces ──
    if (name === 'hoa-content-writer' || name === 'hoa-website-publisher') {
      const p = parseAgentJSON(outputText);
      if (p?.content_markdown) {
        run(
          `INSERT INTO cfo_content_pieces (pillar, channel, title, content_markdown, cta, source_agent, status, qa_status) VALUES (?, ?, ?, ?, ?, 'hoa', 'draft', 'pending')`,
          [p.pillar || 'general', p.channel || 'blog', p.title || 'Untitled', p.content_markdown, p.cta || '']
        );

        // Auto-trigger Ralph QA
        try {
          const inserted = get("SELECT id FROM cfo_content_pieces WHERE source_agent = 'hoa' ORDER BY id DESC LIMIT 1");
          if (inserted) {
            const qaResult = ralphQA.reviewSingleContent(inserted.id);
            console.log(`[RalphQA] HOA Content #${inserted.id}: ${qaResult.passed ? 'PASSED' : 'FAILED'} (${qaResult.score}/100)`);

            // Auto-queue social amplification if QA passed and it's a blog post
            if (qaResult.passed && (p.channel === 'blog' || !p.channel)) {
              const title = p.title || 'New HOA article';
              const crypto = require('crypto');
              run(`INSERT INTO content_queue (id, platform, content, source_agent, status, scheduled_for)
                VALUES (?, 'linkedin', ?, 'hoa', 'pending', datetime('now', '+1 day'))`,
                [crypto.randomUUID(), JSON.stringify({ text: `New article: ${title}`, title })]);
              run(`INSERT INTO content_queue (id, platform, content, source_agent, status, scheduled_for)
                VALUES (?, 'twitter', ?, 'hoa', 'pending', datetime('now', '+2 days'))`,
                [crypto.randomUUID(), JSON.stringify({ text: title })]);
              run(`INSERT INTO content_queue (id, platform, content, source_agent, status, scheduled_for)
                VALUES (?, 'facebook', ?, 'hoa', 'pending', datetime('now', '+3 days'))`,
                [crypto.randomUUID(), JSON.stringify({ text: title })]);
              console.log(`[PostProcessor] HOA social amplification queued for "${title}"`);
            }
          }
        } catch (qaErr) {
          console.warn('[PostProcessor] HOA QA/amplification failed (non-fatal):', qaErr.message);
        }

        // Brain observation
        try {
          const brain = require('./collectiveBrain');
          brain.observe(`content-${new Date().toISOString().slice(0, 10)}`, name, 'content_drafted', {
            subject: p.title || 'Untitled',
            content: `HOA content drafted: "${p.title}" (${p.pillar || 'general'}/${p.channel || 'blog'})`,
            confidence: 1.0,
          });
        } catch {}
      }
    }

    // ── HOA/Jake social schedulers → cfo_content_pieces (channel=social) ──
    if (name === 'hoa-social-media' || name === 'jake-social-scheduler' || name === 'cfo-social-scheduler') {
      const source = name.startsWith('jake-') ? 'jake' : (name.startsWith('cfo-') ? 'cfo' : 'hoa');
      const p = parseAgentJSON(outputText);
      if (p?.content_markdown || p?.post_text || p?.body) {
        const content = p.content_markdown || p.post_text || p.body;
        run(
          `INSERT INTO cfo_content_pieces (pillar, channel, title, content_markdown, cta, source_agent, status) VALUES (?, 'social', ?, ?, ?, ?, 'draft')`,
          [p.pillar || 'general', p.title || p.platform || 'Social Post', content, p.cta || '', source]
        );
      }
    }

    // ── Analytics monitors → Discord embed (not a DB table) ──
    if (name === 'jake-analytics-monitor' || name === 'cfo-analytics-monitor') {
      const p = parseAgentJSON(outputText);
      if (p && process.env.DISCORD_ENABLED === 'true' && process.env.DISCORD_WEBHOOK_URL) {
        try {
          const { postWebhook } = require('./discordNotifier');
          const summary = p.summary || outputText.slice(0, 400);
          postWebhook({
            embeds: [{
              title: `📊 ${name === 'jake-analytics-monitor' ? 'Jake' : 'CFO'} Analytics Report`,
              color: 0x5865f2,
              description: summary,
              timestamp: new Date().toISOString(),
            }]
          }).catch(() => {});
        } catch {}
      }
    }

    // ── Lead scouts → cfo_leads ──
    if (name === 'jake-lead-scout') {
      const p = parseAgentJSON(outputText);
      if (p?.leads && Array.isArray(p.leads)) {
        for (const lead of p.leads) {
          if (!lead.company_name) continue;
          // Dedup by company name
          const existing = get('SELECT id FROM cfo_leads WHERE LOWER(company_name) = LOWER(?)', [lead.company_name]);
          if (existing) continue;
          // Parse location string ("Tampa, FL") into city/state if not provided separately
          let city = lead.city || null;
          let state = lead.state || null;
          if (!city && !state && lead.location) {
            const parts = lead.location.split(',').map(s => s.trim());
            if (parts.length >= 2) { city = parts[0]; state = parts[parts.length - 1]; }
            else if (parts.length === 1) { city = parts[0]; }
          }
          const email = lead.contact_email && lead.contact_email !== 'unknown' ? lead.contact_email : null;
          const enrichStatus = email ? 'enriched' : 'pending';
          run(
            `INSERT INTO cfo_leads (company_name, revenue_range, contact_name, contact_title, contact_email, contact_linkedin, website, employee_count, erp_type, pilot_fit_score, pilot_fit_reason, state, city, enrichment_status, source, source_agent, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'lead_scout', 'jake', 'new')`,
            [
              lead.company_name,
              lead.revenue_range || lead.estimated_revenue || null,
              lead.contact_name || null,
              lead.contact_title || null,
              email,
              lead.contact_linkedin && lead.contact_linkedin !== 'unknown' ? lead.contact_linkedin : null,
              lead.website || null,
              lead.employee_count || null,
              lead.erp_system || lead.erp_type || 'Unknown',
              lead.qualification_score || lead.pilot_fit_score || 0,
              lead.notes || (lead.pain_signals ? (Array.isArray(lead.pain_signals) ? lead.pain_signals.join('; ') : lead.pain_signals) : null),
              state,
              city,
              enrichStatus,
            ]
          );
        }
      }
    }

  } catch (err) {
    console.warn('[PostProcessor] Non-fatal error:', err.message);
  }

  // Discord notification — fire-and-forget, never throws
  try {
    const { notifyRunCompleted } = require('./discordNotifier');
    notifyRunCompleted({ agentName: agent.name, status: 'completed', outputText });
  } catch {}
}

module.exports = { postProcessLLMOutput, parseAgentJSON, deriveWorkspaceId };
