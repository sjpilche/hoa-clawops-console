/**
 * @file rseBuildSpecGenerator.js
 * @description Generates actionable build specs from accepted signals.
 *
 * HOW IT WORKS:
 *   1. Pulls accepted signal + transcript context + expert library patterns
 *   2. GPT-4o generates structured build spec with problem, solution, steps, revenue model
 *   3. Injects Steve's business context and existing agent fleet capabilities
 *
 * COST: ~$0.03/run (GPT-4o via OpenClaw bridge)
 */

const { all, run, get } = require('../db/connection');
const { getRelevantPatterns } = require('./rseExpertLibrary');
const fs = require('fs');
const path = require('path');

// ════════════════════════════════════════════════════════════════════════════
// BUSINESS CONTEXT — injected into every spec generation
// ════════════════════════════════════════════════════════════════════════════

function getBusinessContext() {
  const mandatePath = path.resolve(__dirname, '../../founder/agent_mandate.md');
  try {
    return fs.readFileSync(mandatePath, 'utf-8');
  } catch {
    return `BUSINESS CONTEXT:
Owner: Steve Pilcher — construction CFO turned AI automation entrepreneur.
Goal: Build autonomous AI systems that generate real revenue.
Stack: Node.js, SQLite, Playwright, OpenClaw, Claude Code, Ollama.
Existing agents: 57+ agents handling marketing, lead gen, trading, content.
Revenue priority: Every spec must answer "How does this make money?"`;
  }
}

function getFleetSummary() {
  try {
    const agents = all('SELECT name, description FROM agents LIMIT 60');
    return agents.map(a => `- ${a.name}: ${a.description}`).join('\n');
  } catch {
    return '(Fleet summary unavailable)';
  }
}

// ════════════════════════════════════════════════════════════════════════════
// SPEC GENERATION — via OpenClaw bridge (GPT-4o)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Generate a build spec for an accepted signal.
 * Uses OpenClaw bridge to call the rse-build-spec-generator LLM agent.
 * Falls back to direct OpenAI if bridge unavailable.
 */
async function generateBuildSpec(signalId) {
  const signal = get(
    `SELECT sig.*, s.name AS source_name, t.transcript_text, t.title AS video_title
     FROM rse_signals sig
     JOIN rse_sources s ON s.id = sig.source_id
     JOIN rse_transcripts t ON t.id = sig.transcript_id
     WHERE sig.id = ?`, [signalId]
  );

  if (!signal) {
    console.log(`[RSE-SpecGen] Signal ${signalId} not found`);
    return null;
  }

  // Get relevant expert library patterns for context
  let tags = [];
  try { tags = JSON.parse(signal.tags || '[]'); } catch {}
  const patterns = getRelevantPatterns(tags, 3);
  const patternContext = patterns.length > 0
    ? '\n\nEXPERT LIBRARY — Proven patterns relevant to this signal:\n' +
      patterns.map(p => `• ${p.pattern_name} (${p.category}): ${p.description}${p.verified ? ' [VERIFIED]' : ''}`).join('\n')
    : '';

  const businessContext = getBusinessContext();
  const fleetSummary = getFleetSummary();

  const message = JSON.stringify({
    action: 'generate_build_spec',
    signal: {
      title: signal.title,
      description: signal.description,
      key_insights: signal.key_insights,
      signal_type: signal.signal_type,
      tags: signal.tags,
      difficulty: signal.difficulty,
      time_to_build: signal.time_to_build,
      composite_score: signal.composite_score,
      source_name: signal.source_name,
      video_title: signal.video_title,
    },
    transcript_excerpt: (signal.transcript_text || '').split(/\s+/).slice(0, 2000).join(' '),
    business_context: businessContext,
    fleet_summary: fleetSummary,
    expert_patterns: patternContext,
  });

  // Try OpenClaw bridge first
  let specJson;
  try {
    const OpenClawBridge = require('./openclawBridge');
    const bridge = new OpenClawBridge();
    const result = await bridge.runAgent('rse-build-spec-generator', { message });
    const parsed = OpenClawBridge.parseOutput(result.output);
    specJson = parseJson(parsed.text);
  } catch (err) {
    console.log(`[RSE-SpecGen] OpenClaw bridge failed, trying direct: ${err.message}`);
    // Fallback: direct LLM call
    try {
      const { chat } = require('./llmClient');
      const raw = await chat(SPEC_SYSTEM_PROMPT, message, {
        model: 'gpt-4o', provider: 'openai', temperature: 0.5, maxTokens: 2048, timeoutMs: 60000,
      });
      specJson = parseJson(raw);
    } catch (err2) {
      console.error(`[RSE-SpecGen] Direct LLM also failed: ${err2.message}`);
      return null;
    }
  }

  if (!specJson) {
    console.log(`[RSE-SpecGen] Failed to parse spec JSON for signal ${signalId}`);
    return null;
  }

  // Save to database
  const specId = run(`INSERT INTO rse_build_specs
    (signal_id, spec_title, spec_type, problem_statement, proposed_solution,
     implementation_steps, tech_stack, estimated_hours, estimated_cost_usd,
     revenue_model, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`, [
    signalId,
    specJson.spec_title || signal.title,
    specJson.spec_type || 'tool',
    specJson.problem_statement || signal.description,
    specJson.proposed_solution || '',
    JSON.stringify(specJson.implementation_steps || []),
    JSON.stringify(specJson.tech_stack || []),
    specJson.estimated_hours || null,
    specJson.estimated_cost_usd || 0,
    specJson.revenue_model || 'TBD',
  ]);

  // Update signal status
  run('UPDATE rse_signals SET status = \'spec_generated\', updated_at = datetime(\'now\') WHERE id = ?', [signalId]);

  console.log(`[RSE-SpecGen] Generated spec: "${specJson.spec_title || signal.title}" (type: ${specJson.spec_type})`);
  return { specId, ...specJson };
}

/**
 * Batch generate specs for accepted signals that don't have one yet.
 */
async function generateBatch(limit = 3) {
  const signals = all(
    `SELECT sig.id, sig.title, sig.composite_score
     FROM rse_signals sig
     LEFT JOIN rse_build_specs bs ON bs.signal_id = sig.id
     WHERE sig.status = 'accepted' AND bs.id IS NULL
     ORDER BY sig.composite_score DESC
     LIMIT ?`, [limit]
  );

  let generated = 0, failed = 0;
  const results = [];

  for (const signal of signals) {
    const spec = await generateBuildSpec(signal.id);
    if (spec) {
      generated++;
      results.push({ signalId: signal.id, title: signal.title, specTitle: spec.spec_title, status: 'ok' });
    } else {
      failed++;
      results.push({ signalId: signal.id, title: signal.title, status: 'failed' });
    }
  }

  return { generated, failed, total: signals.length, results };
}

// ════════════════════════════════════════════════════════════════════════════
// FALLBACK SYSTEM PROMPT (used when OpenClaw bridge unavailable)
// ════════════════════════════════════════════════════════════════════════════

const SPEC_SYSTEM_PROMPT = `You are a pragmatic build spec generator for an AI automation business.
Given a signal (insight/technique from a YouTube creator), generate a concrete, actionable build specification.

EVERY spec MUST answer: "How does this make money?"

Output ONLY valid JSON:
{
  "spec_title": "Short title (max 80 chars)",
  "spec_type": "feature|tool|integration|automation|product",
  "problem_statement": "What problem does this solve? (1-2 sentences)",
  "proposed_solution": "How to solve it (1-2 paragraphs)",
  "implementation_steps": ["Step 1: ...", "Step 2: ...", "Step 3: ..."],
  "tech_stack": ["node", "sqlite", "playwright"],
  "estimated_hours": 8,
  "estimated_cost_usd": 0,
  "revenue_model": "How this makes money (1-2 sentences)"
}`;

// ════════════════════════════════════════════════════════════════════════════
// JSON PARSING HELPER
// ════════════════════════════════════════════════════════════════════════════

function parseJson(raw) {
  if (!raw) return null;
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }
    return null;
  }
}

module.exports = {
  generateBuildSpec,
  generateBatch,
};
