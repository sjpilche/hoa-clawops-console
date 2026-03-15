/**
 * @file rseEvaluator.js
 * @description Evaluates RSE signals/specs into ranked business opportunities.
 *
 * HOW IT WORKS:
 *   1. Takes accepted signals (with or without specs)
 *   2. GPT-4o-mini scores on 5 business axes (revenue, effort, fit, timing, differentiation)
 *   3. Generates one-liner, first step, revenue path, risk assessment
 *   4. Ranks all evaluations by composite score
 *
 * This replaces autonomous code generation — produces a ranked shortlist
 * for Steve to pick from and bring to Claude Code for real building.
 *
 * COST: ~$0.003/evaluation (GPT-4o-mini)
 */

'use strict';

const { get, run, all } = require('../db/connection');
const { chat } = require('./llmClient');

const EVAL_MODEL = process.env.RSE_EVAL_MODEL || 'gpt-4o-mini';
const EVAL_PROVIDER = process.env.RSE_EVAL_PROVIDER || 'openai';

// ════════════════════════════════════════════════════════════════════════════
// EVALUATION PROMPT
// ════════════════════════════════════════════════════════════════════════════

const EVAL_SYSTEM = `You are a brutally honest business evaluator for a solo entrepreneur.
Your job: score whether an idea is worth building THIS WEEK, not in theory.

The entrepreneur is Steve Pilcher — a construction CFO who runs an AI automation platform.
His stack: Node.js, SQLite, Express, Playwright, OpenClaw, Claude Code, 81 AI agents.
His strengths: automation, web scraping, AI agents, marketing pipelines, construction industry knowledge.
His goal: build things that make money with AI, not research projects.

Score each axis 1-10 honestly. If an idea is mediocre, say so. Don't inflate scores.

Return ONLY valid JSON:
{
  "revenue_potential": <1-10>,
  "build_effort": <1-10>,
  "stack_fit": <1-10>,
  "market_timing": <1-10>,
  "differentiation": <1-10>,
  "one_liner": "Build X to solve Y for Z (max 15 words)",
  "why_now": "One sentence on why this matters right now",
  "revenue_path": "Specific mechanism: who pays, how much, how often",
  "first_step": "To start building this, do X (one concrete step)",
  "estimated_hours": <number>,
  "comparable": "Existing product/tool this competes with, or 'none'",
  "risk": "Main reason this might fail or not be worth it"
}

SCORING GUIDE:
  revenue_potential: 1=no path to money, 5=could make $500/mo, 10=clear $5k+/mo path
  build_effort: 1=months of work, 5=a weekend, 10=a few hours (HIGHER = EASIER)
  stack_fit: 1=needs new stack/skills, 5=some new libs, 10=perfect fit for existing tools
  market_timing: 1=saturated/late, 5=steady demand, 10=hot right now/first mover
  differentiation: 1=many competitors, 5=some angle, 10=nobody else doing this

BE HARSH on:
- Ideas that are "interesting but who pays?"
- Tools that solve developer problems (hard to monetize)
- Anything that requires building a marketplace or network effect
- Ideas where the creator showed a demo but no revenue proof

BE GENEROUS on:
- Ideas with clear "charge X per month" paths
- Automation that saves businesses measurable money
- Things Steve can build with his existing 81-agent fleet
- Construction/finance industry-specific opportunities`;

// ════════════════════════════════════════════════════════════════════════════
// CORE EVALUATION
// ════════════════════════════════════════════════════════════════════════════

/**
 * Evaluate a single signal (and its spec if available).
 */
async function evaluateSignal(signalId) {
  const signal = get(
    `SELECT sig.*, s.name AS source_name, t.title AS video_title
     FROM rse_signals sig
     JOIN rse_sources s ON s.id = sig.source_id
     JOIN rse_transcripts t ON t.id = sig.transcript_id
     WHERE sig.id = ?`, [signalId]
  );
  if (!signal) throw new Error(`Signal ${signalId} not found`);

  // Check if already evaluated
  const existing = get('SELECT id FROM rse_evaluations WHERE signal_id = ?', [signalId]);
  if (existing) {
    console.log(`[RSE-Evaluator] Signal ${signalId} already evaluated, skipping`);
    return null;
  }

  const spec = get('SELECT * FROM rse_build_specs WHERE signal_id = ?', [signalId]);

  let steps = '';
  if (spec?.implementation_steps) {
    try { steps = JSON.parse(spec.implementation_steps).map((s, i) => `${i + 1}. ${s}`).join('\n'); } catch { steps = spec.implementation_steps; }
  }

  const userPrompt = `Evaluate this idea:

SIGNAL: ${signal.title}
TYPE: ${signal.signal_type}
DESCRIPTION: ${signal.description}
KEY INSIGHTS: ${signal.key_insights}
SOURCE: ${signal.source_name} (YouTube)
VIDEO: ${signal.video_title}
SIGNAL SCORE: ${signal.composite_score}/5 (truth=${signal.truth_density}, impl=${signal.implementation_depth}, monet=${signal.monetization_relevance})
${spec ? `
BUILD SPEC: ${spec.spec_title}
PROBLEM: ${spec.problem_statement}
SOLUTION: ${spec.proposed_solution}
STEPS:\n${steps}
TECH STACK: ${spec.tech_stack}
REVENUE MODEL: ${spec.revenue_model}
ESTIMATED HOURS: ${spec.estimated_hours || 'unknown'}` : '(No build spec generated yet)'}`;

  console.log(`[RSE-Evaluator] Evaluating: "${signal.title}" from ${signal.source_name}`);

  const raw = await chat(EVAL_SYSTEM, userPrompt, {
    model: EVAL_MODEL, provider: EVAL_PROVIDER, temperature: 0.3, maxTokens: 1024, timeoutMs: 30000,
  });

  const evalData = parseJson(raw);
  if (!evalData?.revenue_potential || !evalData?.build_effort) {
    console.warn(`[RSE-Evaluator] Failed to parse evaluation for signal ${signalId}`);
    return null;
  }

  // Clamp scores
  const rp = Math.max(1, Math.min(10, evalData.revenue_potential));
  const be = Math.max(1, Math.min(10, evalData.build_effort));
  const sf = Math.max(1, Math.min(10, evalData.stack_fit));
  const mt = Math.max(1, Math.min(10, evalData.market_timing));
  const df = Math.max(1, Math.min(10, evalData.differentiation));

  // Weighted composite — revenue and effort matter most
  const composite = (rp * 0.30) + (be * 0.25) + (sf * 0.15) + (mt * 0.15) + (df * 0.15);

  run(`INSERT INTO rse_evaluations
    (signal_id, spec_id, revenue_potential, build_effort, stack_fit, market_timing, differentiation,
     composite_score, one_liner, why_now, revenue_path, first_step, estimated_hours, comparable, risk)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    signalId, spec?.id || null,
    rp, be, sf, mt, df, composite,
    evalData.one_liner || signal.title,
    evalData.why_now || null,
    evalData.revenue_path || null,
    evalData.first_step || null,
    evalData.estimated_hours || null,
    evalData.comparable || null,
    evalData.risk || null,
  ]);

  console.log(`[RSE-Evaluator] Score: ${composite.toFixed(1)}/10 — "${evalData.one_liner}"`);
  return { signalId, composite, one_liner: evalData.one_liner, ...evalData };
}

/**
 * Batch evaluate unscored signals.
 */
async function evaluateBatch(limit = 10) {
  const signals = all(
    `SELECT sig.id, sig.title, sig.composite_score
     FROM rse_signals sig
     LEFT JOIN rse_evaluations ev ON ev.signal_id = sig.id
     WHERE ev.id IS NULL
     ORDER BY sig.composite_score DESC
     LIMIT ?`, [limit]
  );

  let evaluated = 0, failed = 0;
  const results = [];

  for (const signal of signals) {
    try {
      const result = await evaluateSignal(signal.id);
      if (result) {
        evaluated++;
        results.push(result);
      }
    } catch (err) {
      failed++;
      console.error(`[RSE-Evaluator] Failed on signal ${signal.id}: ${err.message}`);
    }
  }

  // Re-rank all evaluations
  rerank();

  return { evaluated, failed, total: signals.length, results };
}

/**
 * Re-rank all evaluations by composite score.
 */
function rerank() {
  const evals = all('SELECT id, composite_score FROM rse_evaluations WHERE status != \'passed\' ORDER BY composite_score DESC');
  evals.forEach((ev, i) => {
    run('UPDATE rse_evaluations SET rank = ? WHERE id = ?', [i + 1, ev.id]);
  });
}

/**
 * Get the ranked leaderboard.
 */
function getLeaderboard(limit = 20) {
  return all(`
    SELECT ev.*, sig.title AS signal_title, sig.signal_type, sig.tags,
           s.name AS source_name, t.video_url, t.title AS video_title,
           bs.spec_title, bs.spec_type
    FROM rse_evaluations ev
    JOIN rse_signals sig ON sig.id = ev.signal_id
    JOIN rse_sources s ON s.id = sig.source_id
    JOIN rse_transcripts t ON t.id = sig.transcript_id
    LEFT JOIN rse_build_specs bs ON bs.id = ev.spec_id
    WHERE ev.status NOT IN ('passed')
    ORDER BY ev.rank ASC, ev.composite_score DESC
    LIMIT ?
  `, [limit]);
}

/**
 * Update evaluation status (shortlisted, picked, passed).
 */
function updateStatus(evalId, status) {
  run('UPDATE rse_evaluations SET status = ? WHERE id = ?', [status, evalId]);
  if (status === 'passed') rerank();
}

// ════════════════════════════════════════════════════════════════════════════
// JSON PARSING
// ════════════════════════════════════════════════════════════════════════════

function parseJson(raw) {
  if (!raw) return null;
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }
  try { return JSON.parse(cleaned); } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) try { return JSON.parse(m[0]); } catch {}
  }
  return null;
}

module.exports = {
  evaluateSignal,
  evaluateBatch,
  getLeaderboard,
  updateStatus,
  rerank,
};
