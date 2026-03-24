/**
 * @file outreachDrafter.js
 * @description Batch outreach email drafter — generates 10+ drafts per run using
 * a single LLM call instead of 25 separate OpenClaw CLI invocations.
 *
 * Replaces jake-outreach-agent's 1-lead-per-run model with a batch approach
 * that avoids OpenAI rate limits and costs ~$0.01/batch.
 *
 * Flow: enriched leads with email -> LLM drafts batch -> insert as drafts ->
 *       Ralph QA auto-reviews -> auto-approval engine -> outreach-sender sends
 *
 * Handler: outreach_batch_drafter
 */

'use strict';

const { run, get, all } = require('../db/connection');
const { chatJSON } = require('./llmClient');

const MODEL = process.env.OUTREACH_MODEL || 'gpt-4o-mini';
const PROVIDER = process.env.OUTREACH_PROVIDER || 'openai';
const BASE_URL = process.env.OUTREACH_BASE_URL || process.env.OPENAI_BASE_URL || '';
const API_KEY = process.env.OUTREACH_API_KEY || process.env.OPENAI_API_KEY || '';

/**
 * Find enriched leads that need outreach drafts.
 * Excludes leads that already have a pending/draft/approved/sent sequence.
 */
function findLeadsNeedingOutreach(limit = 10, sourceAgent = null) {
  const agentClause = sourceAgent ? " AND l.source_agent = ?" : '';
  const params = sourceAgent ? [sourceAgent, limit] : [limit];

  return all(`
    SELECT l.id, l.company_name, l.contact_name, l.contact_title, l.contact_email,
           l.city, l.state, l.website, l.pilot_fit_score, l.pilot_fit_reason,
           l.notes, l.source, l.source_agent
    FROM cfo_leads l
    WHERE l.enrichment_status = 'enriched'
      AND l.contact_email IS NOT NULL AND l.contact_email != ''
      AND l.status IN ('queued', 'new', 'discovered')
      AND NOT EXISTS (
        SELECT 1 FROM cfo_outreach_sequences s
        WHERE s.lead_id = l.id
          AND s.status IN ('draft', 'flagged', 'approved', 'sent', 'replied')
      )
      ${agentClause}
    ORDER BY l.pilot_fit_score DESC, l.created_at ASC
    LIMIT ?
  `, params);
}

/**
 * Build a lead summary for the LLM prompt.
 */
function formatLeadForPrompt(lead) {
  const parts = [
    `Company: ${lead.company_name}`,
    lead.contact_name ? `Contact: ${lead.contact_name}` : null,
    lead.contact_title ? `Title: ${lead.contact_title}` : null,
    lead.contact_email ? `Email: ${lead.contact_email}` : null,
    lead.city && lead.state ? `Location: ${lead.city}, ${lead.state}` : null,
    lead.website ? `Website: ${lead.website}` : null,
    lead.notes ? `Notes: ${lead.notes}` : null,
  ].filter(Boolean);
  return parts.join('\n    ');
}

/**
 * Draft outreach emails for a batch of leads using a single LLM call.
 */
async function draftBatch(leads, persona = 'jake') {
  if (leads.length === 0) return [];

  const leadSummaries = leads.map((l, i) =>
    `  Lead ${i + 1} (id: ${l.id}):\n    ${formatLeadForPrompt(l)}`
  ).join('\n\n');

  const personaConfig = PERSONAS[persona] || PERSONAS.jake;

  const system = personaConfig.system;
  const user = `Draft a short, personalized cold email for each lead below.

RULES:
- Subject line: under 60 chars, specific to the company (never generic)
- Body: 3-5 sentences max. No fluff. Lead with something specific about THEIR business.
- CTA: one clear ask (reply, 15-min call, or check a link)
- Tone: direct, peer-to-peer, not salesy
- Each email must reference something specific about the company (location, reviews, category, etc.)
- Do NOT use placeholder text like [Name] or {Company} — use the actual data provided

LEADS:
${leadSummaries}

Return valid JSON array:
[
  {
    "lead_id": <number>,
    "subject": "<email subject>",
    "body": "<email body text>",
    "angle": "<pain_point|social_proof|direct_offer|curiosity>"
  }
]

Return ONLY the JSON array, no markdown fences.`;

  const opts = {
    model: MODEL,
    provider: PROVIDER,
    temperature: 0.7,
    maxTokens: 4096,
    timeoutMs: 60000,
    maxRetries: 2,
  };
  if (BASE_URL) opts.baseURL = BASE_URL;
  if (API_KEY) opts.apiKey = API_KEY;

  const result = await chatJSON(system, user, opts);

  if (!Array.isArray(result)) {
    console.warn('[OutreachDrafter] LLM returned non-array:', typeof result);
    return [];
  }

  return result;
}

/**
 * Insert drafted emails into cfo_outreach_sequences + run Ralph QA + auto-approval.
 */
async function insertDrafts(drafts, sourceAgent = 'jake', runId = null) {
  let ralphQA, autoApproval;
  try { ralphQA = require('./ralphQA'); } catch {}
  try { autoApproval = require('./autoApprovalEngine'); } catch {}

  const results = [];

  for (const draft of drafts) {
    if (!draft.lead_id || !draft.subject || !draft.body) {
      results.push({ lead_id: draft.lead_id, status: 'skipped', reason: 'missing fields' });
      continue;
    }

    // Basic content safety check
    let status = 'draft';
    const bodyLower = (draft.body || '').toLowerCase();
    const dangerousPatterns = [/guarantee/i, /100%/i, /act now/i, /limited time/i, /free money/i, /click here/i];
    if (dangerousPatterns.some(p => p.test(bodyLower))) status = 'flagged';

    try {
      run(
        `INSERT INTO cfo_outreach_sequences
         (lead_id, sequence_type, email_subject, email_body, source_agent, status,
          sequence_position, qa_status, angle_type, source_run_id)
         VALUES (?, 'blitz', ?, ?, ?, ?, 1, 'pending', ?, ?)`,
        [draft.lead_id, draft.subject, draft.body, sourceAgent, status, draft.angle || 'direct_offer', runId]
      );
    } catch (colErr) {
      // Fallback if angle_type column doesn't exist
      run(
        `INSERT INTO cfo_outreach_sequences
         (lead_id, sequence_type, email_subject, email_body, source_agent, status,
          sequence_position, qa_status, source_run_id)
         VALUES (?, 'blitz', ?, ?, ?, ?, 1, 'pending', ?)`,
        [draft.lead_id, draft.subject, draft.body, sourceAgent, status, runId]
      );
    }

    const inserted = get('SELECT id FROM cfo_outreach_sequences WHERE lead_id = ? ORDER BY id DESC LIMIT 1', [draft.lead_id]);
    let qaResult = null;
    let approvalResult = null;

    // Ralph QA
    if (inserted && ralphQA) {
      try {
        qaResult = ralphQA.reviewSingleOutreach(inserted.id);
        console.log(`[OutreachDrafter] QA #${inserted.id}: ${qaResult.passed ? 'PASSED' : 'FAILED'} (${qaResult.score}/100)`);
      } catch (e) {
        console.warn(`[OutreachDrafter] QA failed for #${inserted.id}: ${e.message}`);
      }
    }

    // Auto-approval
    if (inserted && qaResult?.passed && autoApproval) {
      try {
        approvalResult = await autoApproval.processNewDraft(inserted.id);
        console.log(`[OutreachDrafter] Approval #${inserted.id}: ${approvalResult.decision} — ${approvalResult.reason}`);
      } catch (e) {
        console.warn(`[OutreachDrafter] Auto-approval failed for #${inserted.id}: ${e.message}`);
      }
    }

    // Update lead status
    run("UPDATE cfo_leads SET status = 'contacted', updated_at = datetime('now') WHERE id = ? AND status IN ('queued', 'new', 'discovered')", [draft.lead_id]);

    results.push({
      lead_id: draft.lead_id,
      sequence_id: inserted?.id,
      status: status,
      qa: qaResult ? { passed: qaResult.passed, score: qaResult.score } : null,
      approval: approvalResult?.decision || null,
    });
  }

  return results;
}

/**
 * Main entry point — find leads, draft emails, insert + QA + approve.
 */
async function runBatchDraft({ limit = 10, sourceAgent = null, persona = 'jake' } = {}) {
  console.log(`[OutreachDrafter] Starting batch draft: limit=${limit}, persona=${persona}`);

  const leads = findLeadsNeedingOutreach(limit, sourceAgent);
  if (leads.length === 0) {
    console.log('[OutreachDrafter] No leads need outreach drafts.');
    return { leads: 0, drafted: 0, qa_passed: 0, approved: 0, results: [] };
  }

  console.log(`[OutreachDrafter] Found ${leads.length} leads needing outreach`);

  const drafts = await draftBatch(leads, persona);
  console.log(`[OutreachDrafter] LLM generated ${drafts.length} drafts`);

  const results = await insertDrafts(drafts, persona === 'jake' ? 'jake' : persona);

  const stats = {
    leads: leads.length,
    drafted: results.filter(r => r.status !== 'skipped').length,
    qa_passed: results.filter(r => r.qa?.passed).length,
    approved: results.filter(r => r.approval === 'approved').length,
    flagged: results.filter(r => r.status === 'flagged').length,
    results,
  };

  console.log(`[OutreachDrafter] Done: ${stats.drafted} drafted, ${stats.qa_passed} QA passed, ${stats.approved} approved`);
  return stats;
}

// ── Persona configs ─────────────────────────────────────────────────────────

const PERSONAS = {
  jake: {
    system: `You are Jake, a construction finance consultant who helps GCs and contractors fix their back-office chaos. You write cold emails that are direct, specific, and sound like a peer — not a marketer. You understand construction: pay apps, change orders, cash flow gaps, bonding, sub management. Never be generic. Always reference something specific about the company you're writing to.`,
  },
  hoa: {
    system: `You are a community management technology consultant. You help HOA and condo associations modernize their operations — digital payments, violation tracking, board meeting portals, reserve studies. Your emails are professional but friendly, referencing specific community details. Never pushy, always helpful.`,
  },
  data_rehab: {
    system: `You are a data quality consultant who helps companies clean up their CRM, ERP, and operational data. You write emails that diagnose specific data problems the company likely has based on their size and industry. Direct, technical credibility, no fluff.`,
  },
};

module.exports = { runBatchDraft, findLeadsNeedingOutreach, draftBatch, insertDrafts, PERSONAS };
