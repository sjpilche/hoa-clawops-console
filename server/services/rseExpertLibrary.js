/**
 * @file rseExpertLibrary.js
 * @description Expert pattern library — extracts, stores, and retrieves proven techniques.
 *
 * HOW IT WORKS:
 *   - extractPatterns(signalId): Ollama extracts discrete, reusable patterns from high-scoring signals
 *   - getRelevantPatterns(tags, limit): Retrieval for spec/campaign generators
 *   - markPatternVerified(patternId, notes): Called when we successfully use a pattern
 *   - pruneStalePatterns(): Archives patterns with 0 references after 60 days
 *
 * COST: $0 — all Ollama local inference
 */

const { all, run, get } = require('../db/connection');
const { chat } = require('./llmClient');

// GPT-4o-mini for reliable structured JSON pattern extraction (~$0.002/signal)
const LIBRARIAN_MODEL = process.env.RSE_LIBRARIAN_MODEL || 'gpt-4o-mini';
const LIBRARIAN_PROVIDER = process.env.RSE_LIBRARIAN_PROVIDER || 'openai';

function librarianChat(systemPrompt, userMessage, timeoutMs = 60000) {
  return chat(systemPrompt, userMessage, {
    model: LIBRARIAN_MODEL, provider: LIBRARIAN_PROVIDER, temperature: 0.3, maxTokens: 2048, timeoutMs,
  });
}

// ════════════════════════════════════════════════════════════════════════════
// PATTERN EXTRACTION PROMPT
// ════════════════════════════════════════════════════════════════════════════

const EXTRACT_PATTERNS_SYSTEM = `You are a pattern librarian for an AI automation business.
Your job: extract discrete, REUSABLE patterns from a scored signal.

A pattern is a technique, approach, or integration that can be applied in multiple contexts.
It is NOT a summary — it is a blueprint that someone can follow.

For each pattern, output JSON:
{
  "patterns": [
    {
      "pattern_name": "Short name (max 60 chars, e.g. 'MCP Tool Chaining for Data Pipelines')",
      "category": "claude_code|prompt_engineering|agent_architecture|monetization|automation|dev_tools|integration",
      "description": "2-4 sentences: what this pattern is, when to use it, what problem it solves",
      "example_code": "Code snippet if applicable (null if not)",
      "prerequisites": ["list of skills/tools needed"],
      "tags": ["tag1", "tag2", "tag3"]
    }
  ]
}

Rules:
- Extract 1-3 patterns per signal (quality over quantity)
- Only extract patterns with enough detail to be ACTIONABLE
- Skip patterns that are too generic ("use AI agents") or too specific (only works for one exact scenario)
- If the signal describes a workflow, extract the reusable steps as a pattern
- If the signal describes a tool integration, extract the integration approach
- Return ONLY valid JSON, no markdown fences`;

// ════════════════════════════════════════════════════════════════════════════
// CORE FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Extract patterns from a high-scoring signal into the expert library.
 * @param {number} signalId
 * @returns {{ extracted: number, duplicatesSkipped: number }}
 */
async function extractPatterns(signalId) {
  const signal = get(
    `SELECT sig.*, s.name AS source_name, t.transcript_text
     FROM rse_signals sig
     JOIN rse_sources s ON s.id = sig.source_id
     JOIN rse_transcripts t ON t.id = sig.transcript_id
     WHERE sig.id = ?`, [signalId]
  );

  if (!signal) return { extracted: 0, duplicatesSkipped: 0 };

  const userMsg = `Signal: ${signal.title}
Type: ${signal.signal_type}
Description: ${signal.description}
Key Insights: ${signal.key_insights}
Source: ${signal.source_name}
Tags: ${signal.tags}

Transcript excerpt (first 1500 words for context):
${(signal.transcript_text || '').split(/\s+/).slice(0, 1500).join(' ')}`;

  let result;
  try {
    const raw = await librarianChat(EXTRACT_PATTERNS_SYSTEM, userMsg);
    result = parseJson(raw);
  } catch (err) {
    console.log(`[RSE-Library] Pattern extraction failed for signal ${signalId}: ${err.message}`);
    return { extracted: 0, duplicatesSkipped: 0 };
  }

  if (!result?.patterns?.length) return { extracted: 0, duplicatesSkipped: 0 };

  let extracted = 0, duplicatesSkipped = 0;

  for (const pattern of result.patterns) {
    // Dedup check: similar pattern_name in same category
    const existing = get(
      'SELECT id FROM rse_expert_library WHERE pattern_name = ? AND category = ?',
      [pattern.pattern_name, pattern.category]
    );

    if (existing) {
      duplicatesSkipped++;
      continue;
    }

    run(`INSERT INTO rse_expert_library
         (signal_id, source_name, pattern_name, category, description, example_code,
          prerequisites, tags)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
      signalId,
      signal.source_name,
      pattern.pattern_name,
      pattern.category || 'automation',
      pattern.description,
      pattern.example_code || null,
      JSON.stringify(pattern.prerequisites || []),
      JSON.stringify(pattern.tags || []),
    ]);

    extracted++;
    console.log(`[RSE-Library] New pattern: "${pattern.pattern_name}" (${pattern.category})`);
  }

  return { extracted, duplicatesSkipped };
}

/**
 * Batch extract patterns from high-scoring signals that don't have patterns yet.
 * @param {number} limit - Max signals to process
 * @param {number} minScore - Minimum composite score (default 4.0)
 */
async function extractBatch(limit = 10, minScore = 4.0) {
  // Find high-scoring signals without library entries
  const signals = all(
    `SELECT sig.id, sig.title, sig.composite_score
     FROM rse_signals sig
     LEFT JOIN rse_expert_library lib ON lib.signal_id = sig.id
     WHERE sig.composite_score >= ? AND lib.id IS NULL
     ORDER BY sig.composite_score DESC
     LIMIT ?`, [minScore, limit]
  );

  let totalExtracted = 0, totalDuplicates = 0;
  const results = [];

  for (const signal of signals) {
    const result = await extractPatterns(signal.id);
    totalExtracted += result.extracted;
    totalDuplicates += result.duplicatesSkipped;
    results.push({ signalId: signal.id, title: signal.title, ...result });
  }

  return { processed: signals.length, extracted: totalExtracted, duplicatesSkipped: totalDuplicates, results };
}

/**
 * Get relevant patterns for a set of tags.
 * Verified patterns ranked higher. Increments times_referenced.
 */
function getRelevantPatterns(tags, limit = 5) {
  if (!tags || tags.length === 0) return [];

  // Build tag matching — any tag overlap
  const tagClauses = tags.map(t => `tags LIKE '%"${t.replace(/'/g, "''").replace(/"/g, '')}"%'`);
  const whereClause = tagClauses.join(' OR ');

  const patterns = all(
    `SELECT * FROM rse_expert_library
     WHERE (${whereClause})
     ORDER BY verified DESC, times_referenced DESC, created_at DESC
     LIMIT ?`, [limit]
  );

  // Increment reference count
  for (const p of patterns) {
    run('UPDATE rse_expert_library SET times_referenced = times_referenced + 1 WHERE id = ?', [p.id]);
  }

  return patterns;
}

/**
 * Mark a pattern as verified (we used it successfully ourselves).
 */
function markPatternVerified(patternId, notes) {
  run('UPDATE rse_expert_library SET verified = 1, verification_notes = ?, updated_at = datetime(\'now\') WHERE id = ?', [
    notes, patternId,
  ]);
}

/**
 * Prune stale patterns — archive patterns with 0 references after 60 days.
 */
function pruneStalePatterns() {
  const stale = all(
    `SELECT id, pattern_name FROM rse_expert_library
     WHERE times_referenced = 0 AND verified = 0
     AND created_at < datetime('now', '-60 days')`
  );

  for (const p of stale) {
    run('DELETE FROM rse_expert_library WHERE id = ?', [p.id]);
    console.log(`[RSE-Library] Pruned stale pattern: "${p.pattern_name}"`);
  }

  return { pruned: stale.length };
}

/**
 * Get library stats for reporting.
 */
function getLibraryStats() {
  const total = get('SELECT COUNT(*) AS count FROM rse_expert_library')?.count || 0;
  const verified = get('SELECT COUNT(*) AS count FROM rse_expert_library WHERE verified = 1')?.count || 0;
  const categories = all(
    'SELECT category, COUNT(*) AS count FROM rse_expert_library GROUP BY category ORDER BY count DESC'
  );
  const topPatterns = all(
    'SELECT pattern_name, category, times_referenced, verified FROM rse_expert_library ORDER BY times_referenced DESC LIMIT 10'
  );

  return { total, verified, categories, topPatterns };
}

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
  extractPatterns,
  extractBatch,
  getRelevantPatterns,
  markPatternVerified,
  pruneStalePatterns,
  getLibraryStats,
};
