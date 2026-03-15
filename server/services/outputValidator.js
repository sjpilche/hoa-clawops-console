/**
 * @file outputValidator.js
 * @description Validates LLM agent output against expected schemas.
 *
 * Each LLM agent has an expected output format. This validator checks that
 * the parsed output contains required fields and reasonable values. Logs
 * quality metrics for monitoring degradation over time.
 *
 * Usage:
 *   const { validateAgentOutput } = require('./outputValidator');
 *   const result = validateAgentOutput('jake-lead-scout', parsedOutput);
 *   // result: { valid, score, errors, warnings }
 */

'use strict';

const { run: dbRun, get: dbGet } = require('../db/connection');

// ══════════════════════════════════════════════════════════════
// SCHEMA DEFINITIONS — one per LLM agent
// ══════════════════════════════════════════════════════════════

const AGENT_SCHEMAS = {
  'jake-lead-scout': {
    description: 'Lead scout should return JSON with leads array and search_summary',
    validate: (data) => {
      const errors = [];
      const warnings = [];

      if (!data) { errors.push('No JSON parsed from output'); return { errors, warnings }; }
      if (!Array.isArray(data.leads)) { errors.push('Missing "leads" array'); return { errors, warnings }; }
      if (data.leads.length === 0) warnings.push('Empty leads array — market may be exhausted');
      if (data.leads.length > 20) warnings.push(`Unusually large leads array (${data.leads.length}) — may contain duplicates`);

      // search_summary validation — SOUL.md mandates exactly 3 searches
      if (!data.search_summary) {
        warnings.push('Missing search_summary — cannot verify search discipline');
      } else {
        if (data.search_summary.queries_run !== undefined && data.search_summary.queries_run !== 3) {
          warnings.push(`queries_run=${data.search_summary.queries_run} — SOUL.md requires exactly 3`);
        }
      }

      for (let i = 0; i < Math.min(data.leads.length, 5); i++) {
        const lead = data.leads[i];
        if (!lead.company_name) errors.push(`Lead[${i}]: missing company_name`);
        if (!lead.contact_name) errors.push(`Lead[${i}]: missing contact_name`);
        if (lead.qualification_score !== undefined && (lead.qualification_score < 0 || lead.qualification_score > 100)) {
          errors.push(`Lead[${i}]: score ${lead.qualification_score} out of range`);
        }
      }

      return { errors, warnings };
    },
  },

  'jake-outreach-agent': {
    description: 'Outreach agent should return JSON with email subject, body, and research_sources',
    validate: (data) => {
      const errors = [];
      const warnings = [];

      if (!data) { errors.push('No JSON parsed from output'); return { errors, warnings }; }

      const body = data.email_body || data.body_text;
      const subject = data.email_subject || data.subject;

      if (!body) errors.push('Missing email body (email_body or body_text)');
      if (!subject) errors.push('Missing email subject (email_subject or subject)');

      // Research-first verification — SOUL.md says MUST use web_search
      if (!data.research_sources || !Array.isArray(data.research_sources) || data.research_sources.length === 0) {
        warnings.push('Missing or empty research_sources — agent may have skipped web_search');
      }

      if (body) {
        const wordCount = body.split(/\s+/).filter(Boolean).length;
        if (wordCount < 30) warnings.push(`Email body too short (${wordCount} words)`);
        if (wordCount > 500) warnings.push(`Email body too long (${wordCount} words)`);
        if (!body.includes('\n')) warnings.push('Email body has no paragraph breaks');
      }

      if (subject && subject.length > 100) warnings.push('Subject line too long');
      if (subject && subject.length > 45) warnings.push('Subject > 45 chars — SOUL.md says under 45');

      return { errors, warnings };
    },
  },

  'cfo-outreach-agent': {
    description: 'CFO outreach — same base schema as jake-outreach, plus self-eval check',
    validate: (data, rawText) => {
      // Run base outreach validation
      const base = AGENT_SCHEMAS['jake-outreach-agent'].validate(data);
      // Check for self-evaluation scorecard in raw text
      const text = rawText || '';
      if (!text.includes('SELF-EVALUATION')) {
        base.warnings.push('Missing SELF-EVALUATION scorecard — LLM may have skipped mandatory review loop');
      }
      return base;
    },
  },

  'jake-follow-up-agent': {
    description: 'Follow-up agent should return JSON with subject, body_text, and follow_up_angle',
    validate: (data) => {
      const errors = [];
      const warnings = [];

      if (!data) { errors.push('No JSON parsed from output'); return { errors, warnings }; }

      const body = data.body_text || data.email_body;
      if (!body) errors.push('Missing body_text');
      if (!data.subject) warnings.push('Missing subject field');

      // follow_up_angle is required per SOUL.md — one of 5 values
      const validAngles = ['bump', 'new_angle', 'social_proof', 'curious_question', 'direct_ask'];
      if (!data.follow_up_angle) {
        warnings.push('Missing follow_up_angle — cannot track A/B performance');
      } else if (!validAngles.includes(data.follow_up_angle)) {
        warnings.push(`Invalid follow_up_angle "${data.follow_up_angle}" — must be one of: ${validAngles.join(', ')}`);
      }

      if (body) {
        const wordCount = body.split(/\s+/).filter(Boolean).length;
        if (wordCount < 20) warnings.push(`Follow-up too short (${wordCount} words)`);
        if (wordCount > 200) warnings.push(`Follow-up too long (${wordCount} words) — SOUL.md says under 100`);
      }

      return { errors, warnings };
    },
  },

  'jake-meeting-booker': {
    description: 'Meeting booker should return JSON with body_text containing Calendly reference',
    validate: (data) => {
      const errors = [];
      const warnings = [];

      if (!data) { errors.push('No JSON parsed from output'); return { errors, warnings }; }

      const body = data.body_text || data.email_body;
      if (!body) errors.push('Missing body_text');

      if (body && !(/calendly|schedule|book|meeting/i.test(body))) {
        warnings.push('Meeting email does not reference scheduling — may be missing CTA');
      }

      return { errors, warnings };
    },
  },

  'jake-content-engine': {
    description: 'Content engine should return JSON with content_markdown, title, pillar + self-eval',
    validate: (data, rawText) => {
      const errors = [];
      const warnings = [];

      if (!data) { errors.push('No JSON parsed from output'); return { errors, warnings }; }
      if (!data.content_markdown) errors.push('Missing content_markdown');
      if (!data.title) warnings.push('Missing title');
      if (!data.pillar) warnings.push('Missing pillar category');
      if (!data.cta) warnings.push('Missing CTA — content should drive action');

      if (data.content_markdown) {
        const wordCount = data.content_markdown.split(/\s+/).filter(Boolean).length;
        if (wordCount < 200) warnings.push(`Content too short (${wordCount} words) — target 800-1500`);
        if (wordCount > 3000) warnings.push(`Content too long (${wordCount} words) — may need trimming`);
        if (!data.content_markdown.includes('#')) warnings.push('No headings found in content');
      }

      // Check for self-evaluation scorecard (SOUL.md mandates 8-criteria loop)
      const text = rawText || '';
      if (!text.includes('SELF-EVALUATION')) {
        warnings.push('Missing SELF-EVALUATION scorecard — LLM may have skipped mandatory review loop');
      }

      return { errors, warnings };
    },
  },

  'cfo-content-engine': {
    description: 'CFO content — same schema as jake-content-engine with trust envelope check',
    validate: (data, rawText) => {
      const base = AGENT_SCHEMAS['jake-content-engine'].validate(data, rawText);
      // CFO content should include trust_envelope field
      if (data && !data.trust_envelope) {
        base.warnings.push('Missing trust_envelope — SOUL.md requires Trust Envelope™ section');
      }
      return base;
    },
  },

  'hoa-content-writer': {
    description: 'HOA content — same schema as jake-content-engine',
    validate: (data) => AGENT_SCHEMAS['jake-content-engine'].validate(data),
  },

  'hoa-outreach-drafter': {
    description: 'HOA outreach — should return email sequences',
    validate: (data) => {
      const errors = [];
      const warnings = [];

      if (!data) { errors.push('No JSON parsed from output'); return { errors, warnings }; }
      const body = data.email_body || data.body_text;
      if (!body) errors.push('Missing email body');

      return { errors, warnings };
    },
  },

  'hoa-facebook-poster': {
    description: 'Facebook poster should report publish results',
    validate: (data, rawText) => {
      const errors = [];
      const warnings = [];
      const text = rawText || '';
      // Facebook poster returns a text report, not JSON
      if (text.length < 20) errors.push('Output too short — may have failed');
      if (!/published|posted|failed/i.test(text)) warnings.push('Output does not mention publish status');
      return { errors, warnings };
    },
  },

  'jake-meeting-booker': {
    description: 'Meeting booker should return JSON with body_text containing Calendly link and agenda',
    validate: (data) => {
      const errors = [];
      const warnings = [];

      if (!data) { errors.push('No JSON parsed from output'); return { errors, warnings }; }

      const body = data.body_text || data.email_body;
      if (!body) errors.push('Missing body_text');
      if (!data.subject) warnings.push('Missing subject field');

      if (body) {
        if (!/calendly|CALENDLY_URL/i.test(body)) warnings.push('Missing Calendly link in meeting email — critical for booking');
        const wordCount = body.split(/\s+/).filter(Boolean).length;
        if (wordCount > 200) warnings.push(`Meeting email too long (${wordCount} words) — target under 150`);
      }

      if (!data.meeting_agenda || !Array.isArray(data.meeting_agenda) || data.meeting_agenda.length === 0) {
        warnings.push('Missing meeting_agenda — SOUL.md requires 3 concrete items');
      }
      if (!data.prep_question) warnings.push('Missing prep_question — SOUL.md requires one');
      if (!data.research_used) warnings.push('Missing research_used — did agent skip web_search?');

      return { errors, warnings };
    },
  },

  'daily-debrief': {
    description: 'Debrief should return narrative text with stats',
    validate: (data, rawText) => {
      const errors = [];
      const warnings = [];
      const text = rawText || '';

      if (text.length < 100) errors.push('Debrief too short — may have failed generation');
      if (!/\d/.test(text)) warnings.push('Debrief contains no numbers — may be generic');

      return { errors, warnings };
    },
  },
};

// ══════════════════════════════════════════════════════════════
// VALIDATION FUNCTION
// ══════════════════════════════════════════════════════════════

/**
 * Validate LLM agent output against its expected schema.
 *
 * @param {string} agentName — e.g. 'jake-lead-scout'
 * @param {object|null} parsedData — JSON-parsed output (null if parse failed)
 * @param {string} [rawText] — raw text output for agents that return prose
 * @returns {{ valid: boolean, score: number, errors: string[], warnings: string[], agentName: string }}
 */
function validateAgentOutput(agentName, parsedData, rawText = '') {
  const schema = AGENT_SCHEMAS[agentName];

  if (!schema) {
    // No schema defined — pass by default but note it
    return { valid: true, score: 100, errors: [], warnings: ['No output schema defined for this agent'], agentName };
  }

  const { errors, warnings } = schema.validate(parsedData, rawText);

  // Score: start at 100, deduct for errors (20 each) and warnings (5 each)
  const score = Math.max(0, 100 - (errors.length * 20) - (warnings.length * 5));
  const valid = errors.length === 0;

  // Log for monitoring
  if (errors.length > 0) {
    console.warn(`[OutputValidator] ${agentName}: INVALID (score ${score}) — ${errors.join(', ')}`);
  } else if (warnings.length > 0) {
    console.log(`[OutputValidator] ${agentName}: valid with warnings (score ${score}) — ${warnings.join(', ')}`);
  }

  return { valid, score, errors, warnings, agentName };
}

/**
 * Record output quality metric for trend tracking.
 */
function recordOutputQuality(agentName, runId, score, errorCount, warningCount) {
  try {
    dbRun(
      `INSERT INTO audit_log (id, action, resource, details, outcome) VALUES (lower(hex(randomblob(16))), 'output_validation', ?, ?, ?)`,
      [
        `agent:${agentName}`,
        JSON.stringify({ run_id: runId, score, errors: errorCount, warnings: warningCount }),
        score >= 60 ? 'success' : 'failure',
      ]
    );
  } catch (err) {
    // Non-fatal — don't break the run pipeline
    console.warn('[OutputValidator] Failed to record quality metric:', err.message);
  }
}

module.exports = { validateAgentOutput, recordOutputQuality, AGENT_SCHEMAS };
