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
 * Post-process LLM agent output into marketing pipeline tables.
 *
 * @param {object} agent  - Agent record { id, name, config }
 * @param {string} outputText - Raw text output from the agent
 * @param {string} message - The prompt/message sent to the agent
 */
function postProcessLLMOutput(agent, outputText, message) {
  if (!outputText || !agent?.name) return;

  try {
    const name = agent.name;

    // ── Content engines → cfo_content_pieces ──
    if (name === 'cfo-content-engine' || name === 'jake-content-engine') {
      const source = name.startsWith('jake-') ? 'jake' : 'cfo';
      const p = parseAgentJSON(outputText);
      if (p?.content_markdown) {
        run(
          `INSERT INTO cfo_content_pieces (pillar, channel, title, content_markdown, cta, source_agent, status) VALUES (?, ?, ?, ?, ?, ?, 'draft')`,
          [p.pillar || 'general', p.channel || 'linkedin', p.title || 'Untitled', p.content_markdown, p.cta || '', source]
        );
      }
    }

    // ── Outreach agents → cfo_outreach_sequences ──
    if (name === 'cfo-outreach-agent' || name === 'jake-outreach-agent') {
      const source = name.startsWith('jake-') ? 'jake' : 'cfo';
      const p = parseAgentJSON(outputText);
      if (p?.email_body || p?.body_text) {
        let leadId = null;
        try { leadId = JSON.parse(message)?.lead_id || null; } catch {}
        run(
          `INSERT INTO cfo_outreach_sequences (lead_id, sequence_type, email_subject, email_body, pilot_offer, source_agent, status) VALUES (?, 'blitz', ?, ?, ?, ?, 'draft')`,
          [leadId, p.email_subject || p.subject || 'Outreach', p.email_body || p.body_text, p.pilot_offer || null, source]
        );
      }
    }

    // ── HOA content writer → cfo_content_pieces ──
    if (name === 'hoa-content-writer' || name === 'hoa-website-publisher') {
      const p = parseAgentJSON(outputText);
      if (p?.content_markdown) {
        run(
          `INSERT INTO cfo_content_pieces (pillar, channel, title, content_markdown, cta, source_agent, status) VALUES (?, ?, ?, ?, ?, 'hoa', 'draft')`,
          [p.pillar || 'general', p.channel || 'blog', p.title || 'Untitled', p.content_markdown, p.cta || '']
        );
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

module.exports = { postProcessLLMOutput, parseAgentJSON };
