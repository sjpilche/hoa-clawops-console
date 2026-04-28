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
const crm = require('../db/crm');
const { chatJSON } = require('./llmClient');

const MODEL = process.env.OUTREACH_MODEL || 'gpt-4o-mini';
const PROVIDER = process.env.OUTREACH_PROVIDER || 'openai';
const BASE_URL = process.env.OUTREACH_BASE_URL || process.env.OPENAI_BASE_URL || '';
const API_KEY = process.env.OUTREACH_API_KEY || process.env.OPENAI_API_KEY || '';

/**
 * Find enriched leads that need outreach drafts.
 * Excludes leads that already have a pending/draft/approved/sent sequence.
 */
async function findLeadsNeedingOutreach(limit = 10, sourceAgent = null) {
  // Use CRM module — Azure primary, SQLite fallback
  return crm.findLeadsForOutreach(limit, sourceAgent);
}

/**
 * Sanitize a contact name — strip scraped garbage, newlines, nav fragments.
 * Returns null if the name is clearly not a real person name.
 */
function sanitizeContactName(name) {
  if (!name) return null;
  // Strip newlines, tabs, excessive whitespace
  let clean = name.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  // Reject if it looks like scraped page content (common nav/footer fragments)
  const garbagePatterns = [
    /\b(about us|employee|portal|reports|blog|founded|trade|benefits|stock|access|menu|home|contact us|careers|login|sign in)\b/i,
    /[<>{}\[\]|]/, // HTML-like chars
    /.{60,}/, // over 60 chars is not a name
  ];
  if (garbagePatterns.some(p => p.test(clean))) return null;
  // Must look like a name: at least 2 chars, starts with a letter
  if (clean.length < 2 || !/^[A-Za-z]/.test(clean)) return null;
  return clean;
}

/**
 * Build a lead summary for the LLM prompt.
 */
function formatLeadForPrompt(lead) {
  const cleanName = sanitizeContactName(lead.contact_name);
  const parts = [
    `Company: ${lead.company_name}`,
    cleanName ? `Contact: ${cleanName}` : null,
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
  const user = `Write a cold email for each lead below. These are real people — write like you're emailing one person, not blasting a list.

STYLE RULES:
- Subject: 4-8 words. Lowercase unless proper noun. No clickbait. No "insights" or "solutions".
  GOOD: "quick question about Kalin's AR" or "Jesse, 13-week forecast idea"
  BAD: "Finance Strategies for Kalin in Denver" or "Texas Construction Company CFO Insights"
- Opening line: Do NOT start with "As a construction company in [city]..." — that screams mass email.
  Instead, lead with a specific observation or question. Use their Google rating, review count, notes, or something from their company.
  GOOD: "Saw Kalin has 4.8 stars and 200+ reviews — you're clearly winning work. Curious how the back office keeps up."
  GOOD: "Jesse — quick question. When Texas Construction closes a $2M contract, how long before you know your real margin?"
  BAD: "As a construction company in Austin, Texas Construction Company knows the strain..."
- Body: 2-4 sentences. One clear pain, one clear fix, one clear CTA. No bullet points. No feature lists.
- CTA: "Worth a 15-min call?" or "Reply and I'll send a quick example" — not "let's connect" or "set it up".
- Sign-off: "— Jim" (not "Best, Jim McGuire")
- NEVER use: "streamline", "leverage", "innovative", "cutting-edge", "comprehensive", "solutions"
- Each email must be genuinely different — vary the angle, the opening, the CTA.

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
    temperature: 0.5,
    maxTokens: 4096,
    timeoutMs: 180000,
    maxRetries: 2,
  };
  if (BASE_URL) opts.baseURL = BASE_URL;
  if (API_KEY) opts.apiKey = API_KEY;

  const result = await chatJSON(system, user, opts);

  if (!Array.isArray(result)) {
    console.warn('[OutreachDrafter] LLM returned non-array:', typeof result);
    return [];
  }

  // ── Post-LLM personalization validation ──
  // Reject drafts that don't mention the company or contact name — these are generic.
  const leadsById = Object.fromEntries(leads.map(l => [l.id, l]));
  const validated = [];
  let rejected = 0;

  // Detect duplicate subjects (sign of generic output)
  const subjectCounts = {};
  for (const draft of result) {
    const subj = (draft.subject || '').toLowerCase().trim();
    subjectCounts[subj] = (subjectCounts[subj] || 0) + 1;
  }

  for (const draft of result) {
    const lead = leadsById[draft.lead_id];
    if (!lead) { validated.push(draft); continue; }

    const combined = ((draft.subject || '') + ' ' + (draft.body || '')).toLowerCase();
    const companyFirst = (lead.company_name || '').split(/[\s,]+/)[0].toLowerCase();
    const cleanName = sanitizeContactName(lead.contact_name);
    const contactFirst = (cleanName || '').split(/\s+/)[0].toLowerCase();

    const hasCompany = companyFirst.length > 2 && combined.includes(companyFirst);
    const hasContact = contactFirst.length > 2 && combined.includes(contactFirst);
    const isDupeSubject = subjectCounts[(draft.subject || '').toLowerCase().trim()] > 1;

    if (!hasCompany && !hasContact) {
      console.warn(`[OutreachDrafter] Rejected generic draft for lead ${draft.lead_id} (${lead.company_name}) — no company/contact mention`);
      rejected++;
      continue;
    }

    if (isDupeSubject) {
      console.warn(`[OutreachDrafter] Rejected duplicate subject for lead ${draft.lead_id}: "${draft.subject}"`);
      rejected++;
      continue;
    }

    validated.push(draft);
  }

  if (rejected > 0) {
    console.log(`[OutreachDrafter] Personalization gate: ${validated.length} passed, ${rejected} rejected`);
  }

  return validated;
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

    // Reject if this exact subject was already used for another lead recently
    const dupeSubject = get(
      `SELECT COUNT(*) as cnt FROM cfo_outreach_sequences
       WHERE email_subject = ? AND status IN ('draft', 'approved', 'sent')
         AND created_at >= datetime('now', '-7 days')`,
      [draft.subject]
    );
    if (dupeSubject && dupeSubject.cnt >= 10) {
      console.warn(`[OutreachDrafter] Skipping draft for lead ${draft.lead_id} — subject "${draft.subject.slice(0, 40)}" already used ${dupeSubject.cnt}x this week`);
      results.push({ lead_id: draft.lead_id, status: 'skipped', reason: `duplicate subject (${dupeSubject.cnt}x this week)` });
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

  const leads = await findLeadsNeedingOutreach(limit, sourceAgent);
  if (!leads || leads.length === 0) {
    console.log('[OutreachDrafter] No leads need outreach drafts.');
    return { leads: 0, drafted: 0, qa_passed: 0, approved: 0, results: [] };
  }

  console.log(`[OutreachDrafter] Found ${leads.length} leads needing outreach`);

  const drafts = await draftBatch(leads, persona);
  console.log(`[OutreachDrafter] LLM generated ${drafts.length} drafts`);

  const results = await insertDrafts(drafts, sourceAgent || persona);

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
    system: `You are Jim McGuire. Former construction CFO — you ran AP/AR for a 20-division GC, dealt with subcontractor pay apps, retainage tracking, cash flow forecasting, and QuickBooks held together with duct tape. You and Steve Pilcher built AI automations that handle the back-office grind (AR aging, 13-week cash forecasts, job cost recon) and now offer it as a fractional CFO service.

You write cold emails the way a contractor texts — short, direct, no corporate fluff. You sound like a guy who's been on jobsites, not a SaaS sales rep. Your emails should feel like they came from one person to one person. Never start with "As a construction company in..." — that's spam. Instead, reference something real about their company (their rating, their specialty, their market). Keep it under 100 words. Sign as "— Jim".`,
    sender: 'jake',  // → JimMcGuire@jakecfo.com
  },
  owen: {
    system: `You are Jim McGuire, a CFO who ran finance for property management companies — trust accounting across dozens of LLCs, CAM reconciliation nightmares, owner distributions that took days. You and Steve Pilcher built AI agents to automate all of it and now offer the full stack as a fractional CFO service: the finance expertise, the automations, and the data cleanup underneath. You write cold emails that are direct and show you understand PM finance. Sign emails as "Jim McGuire".`,
    sender: 'owen',  // → JimMcGuire@owencfo.com
  },
  hoa: {
    system: `You are Steve Pilcher. You were a CFO for a 20-division construction company for 9 years. You built AI agents that run on real financial data — forecasting, reconciliation, collections — and achieved 5-7% MAPE on cost forecasting. Now you bring that same technology stack to HOA and condo associations: the CFO brain, the AI automations, and the data infrastructure to modernize community operations. Your emails are professional but direct, referencing specific community details. You're not selling software — you built this yourself and you're offering to bring it to their community. Sign emails as "Steve Pilcher".`,
    sender: 'hoa',  // → spilcher@hoaprojectfunding.com
  },
  data_rehab: {
    system: `You are Steve Pilcher, founder of Data Rehab. You help growing service businesses get control of messy AR, weak cash visibility, and reporting that takes too long to produce and still isn't trusted. You do it through short, practical sprints — not six-month consulting engagements. You spent 9 years as CFO of a 20-division construction company, so you've lived these exact problems at scale. Your two offers are the AR Recovery Sprint (clean up aging, assess collectibility, build follow-up systems) and the Cash + Reporting Sprint (weekly cash view, KPI dashboard, management reporting). Write cold emails that are direct, operator-led, and specific to the prospect's industry. NEVER say "AI agents", "AI-powered", "autonomous", "digital transformation", or "full-stack platform". Instead say "short practical sprints", "operator-led cleanup", "software-assisted delivery". Sign emails as "Steve Pilcher".`,
    sender: 'data_rehab',  // → JimMcguire@getdatarehab.com
  },
};

module.exports = { runBatchDraft, findLeadsNeedingOutreach, draftBatch, insertDrafts, sanitizeContactName, PERSONAS };
