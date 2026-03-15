/**
 * @file rseSignalScorer.js
 * @description Scores YouTube transcripts for actionable signals using Ollama ($0).
 *
 * HOW IT WORKS:
 *   1. Chunks transcript into ~2000 word segments
 *   2. Ollama extracts signals from each chunk (technique, tool, pattern, strategy, etc.)
 *   3. Each signal scored on 3 axes: truth_density, implementation_depth, monetization_relevance
 *   4. Composite score = (truth*0.35 + impl*0.35 + monet*0.30) — threshold 3.0 to accept
 *
 * COST: $0 — all Ollama local inference
 */

const { all, run, get } = require('../db/connection');
const { chat } = require('./llmClient');

// GPT-4o-mini for reliable structured JSON scoring (~$0.002/transcript)
const SCORER_MODEL = process.env.RSE_SCORER_MODEL || 'gpt-4o-mini';
const SCORER_PROVIDER = process.env.RSE_SCORER_PROVIDER || 'openai';
const ACCEPT_THRESHOLD = parseFloat(process.env.RSE_ACCEPT_THRESHOLD) || 2.5;

function scorerChat(systemPrompt, userMessage, timeoutMs = 60000) {
  return chat(systemPrompt, userMessage, {
    model: SCORER_MODEL, provider: SCORER_PROVIDER, temperature: 0.3, maxTokens: 2048, timeoutMs,
  });
}

// ════════════════════════════════════════════════════════════════════════════
// SCORING RUBRIC — embedded in every scoring prompt
// ════════════════════════════════════════════════════════════════════════════

const SCORING_RUBRIC = `
SCORING RUBRIC — score each axis 1-5:

TRUTH DENSITY (how concrete is the information?):
  1 = Buzzwords only ("AI is the future", "automate everything")
  2 = Some specifics but mostly opinion
  3 = Concrete examples with tool names and versions
  4 = Step-by-step walkthrough with real code or config
  5 = Production-ready code shown, with before/after comparisons

IMPLEMENTATION DEPTH (how actionable?):
  1 = Concept mentioned but no guidance
  2 = High-level architecture described
  3 = Code snippets or detailed config shown
  4 = Full walkthrough — someone could follow along and build it
  5 = Deployable — includes error handling, edge cases, real-world constraints

MONETIZATION RELEVANCE (does this lead to money?):
  1 = Purely academic or entertainment
  2 = Could save some time if implemented
  3 = Clear cost savings or efficiency gain ($X saved/month)
  4 = Direct revenue path (sell this, charge for this, generate leads with this)
  5 = Proven revenue — specific dollar amounts, client results, or conversion metrics shown

PENALTIES (reduce score by 1 on relevant axis):
  - Hype language without substance
  - "Just use AI" without specifics
  - Affiliate promotion disguised as tutorial
  - No proof of claims (no screenshots, no metrics, no code)
  - Creator vanity content (subscriber milestones, behind-the-scenes fluff)
`;

const EXTRACT_SYSTEM = `You are a signal extraction engine for an AI automation business.
Your job: find ACTIONABLE techniques, tools, patterns, and strategies in YouTube transcript chunks.

ONLY extract signals that meet ALL of these criteria:
- Specific enough to implement (not just "use AI to make money")
- Related to: Claude Code, OpenClaw, AI agents, automation, developer tools, or AI-driven revenue
- Contains enough detail that a skilled developer could start building within 1 hour

For each signal found, output JSON:
{
  "signals": [
    {
      "signal_type": "technique|tool|pattern|strategy|integration|workflow|monetization",
      "title": "One-line summary (max 80 chars)",
      "description": "2-3 sentences describing the technique/tool/pattern",
      "key_insights": ["insight 1", "insight 2", "insight 3"],
      "tags": ["claude_code", "mcp", "agent_framework"],
      "difficulty": "trivial|moderate|complex|expert",
      "time_to_build": "1h|4h|1d|1w"
    }
  ]
}

If NO actionable signals found in this chunk, return: {"signals": []}
Do NOT invent signals. Only extract what is explicitly discussed.
Return ONLY valid JSON, no markdown fences.`;

const SCORE_SYSTEM = `You are a strict signal quality judge for an AI automation business.
Score each signal using the rubric below. Be harsh — reject fluff aggressively.

${SCORING_RUBRIC}

For the given signal and its transcript context, output JSON:
{
  "truth_density": <1-5>,
  "implementation_depth": <1-5>,
  "monetization_relevance": <1-5>,
  "reasoning": "1-2 sentences explaining scores"
}

Return ONLY valid JSON, no markdown fences.`;

// ════════════════════════════════════════════════════════════════════════════
// TRANSCRIPT CHUNKING
// ════════════════════════════════════════════════════════════════════════════

function chunkTranscript(text, maxWords = 2000) {
  const words = text.split(/\s+/);
  const chunks = [];

  for (let i = 0; i < words.length; i += maxWords) {
    const chunk = words.slice(i, i + maxWords).join(' ');
    if (chunk.length > 50) chunks.push(chunk);  // Skip tiny trailing chunks
  }

  return chunks;
}

// ════════════════════════════════════════════════════════════════════════════
// SIGNAL EXTRACTION + SCORING
// ════════════════════════════════════════════════════════════════════════════

/**
 * Score a single transcript — extract signals, score each, save accepted ones.
 * @param {number} transcriptId
 * @returns {{ signals: number, accepted: number, rejected: number }}
 */
async function scoreTranscript(transcriptId) {
  const transcript = get('SELECT t.*, s.name AS source_name FROM rse_transcripts t JOIN rse_sources s ON s.id = t.source_id WHERE t.id = ?', [transcriptId]);
  if (!transcript || !transcript.transcript_text) {
    console.log(`[RSE-Scorer] No transcript text for ID ${transcriptId}`);
    return { signals: 0, accepted: 0, rejected: 0 };
  }

  console.log(`[RSE-Scorer] Scoring: "${transcript.title}" by ${transcript.source_name} (${transcript.word_count} words)`);

  const chunks = chunkTranscript(transcript.transcript_text);
  let totalSignals = 0, accepted = 0, rejected = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`[RSE-Scorer] Chunk ${i + 1}/${chunks.length} (${chunk.split(/\s+/).length} words)`);

    // Step 1: Extract signals from chunk
    let extracted;
    try {
      const raw = await scorerChat(EXTRACT_SYSTEM, `Video: "${transcript.title}" by ${transcript.source_name}\n\nTranscript chunk:\n${chunk}`);
      extracted = parseJson(raw);
    } catch (err) {
      console.log(`[RSE-Scorer] Extraction failed for chunk ${i + 1}: ${err.message}`);
      continue;
    }

    if (!extracted?.signals?.length) continue;

    // Step 2: Score each signal
    for (const signal of extracted.signals) {
      totalSignals++;

      let scores;
      try {
        const scoreRaw = await scorerChat(
          SCORE_SYSTEM,
          `Signal: ${signal.title}\nDescription: ${signal.description}\nKey insights: ${JSON.stringify(signal.key_insights)}\n\nTranscript context (for verification):\n${chunk.slice(0, 1000)}`
        );
        scores = parseJson(scoreRaw);
      } catch (err) {
        console.log(`[RSE-Scorer] Scoring failed for signal "${signal.title}": ${err.message}`);
        rejected++;
        continue;
      }

      if (!scores?.truth_density || !scores?.implementation_depth || !scores?.monetization_relevance) {
        rejected++;
        continue;
      }

      const td = Math.max(1, Math.min(5, scores.truth_density));
      const id = Math.max(1, Math.min(5, scores.implementation_depth));
      const mr = Math.max(1, Math.min(5, scores.monetization_relevance));
      const composite = (td * 0.35) + (id * 0.35) + (mr * 0.30);

      if (composite < ACCEPT_THRESHOLD) {
        console.log(`[RSE-Scorer] Rejected: "${signal.title}" (score: ${composite.toFixed(2)})`);
        rejected++;
        continue;
      }

      // Save accepted signal
      run(`INSERT INTO rse_signals
           (transcript_id, source_id, signal_type, title, description, key_insights,
            truth_density, implementation_depth, monetization_relevance, composite_score,
            score_reasoning, tags, difficulty, time_to_build, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'accepted')`, [
        transcriptId, transcript.source_id,
        signal.signal_type || 'technique',
        signal.title,
        signal.description,
        JSON.stringify(signal.key_insights || []),
        td, id, mr, composite,
        scores.reasoning || '',
        JSON.stringify(signal.tags || []),
        signal.difficulty || 'moderate',
        signal.time_to_build || '4h',
      ]);

      accepted++;
      console.log(`[RSE-Scorer] Accepted: "${signal.title}" (score: ${composite.toFixed(2)})`);
    }
  }

  // Update transcript status
  const newStatus = accepted > 0 ? 'accepted' : 'rejected';
  run('UPDATE rse_transcripts SET status = ?, scored_at = datetime(\'now\') WHERE id = ?', [newStatus, transcriptId]);

  // Update source stats
  if (accepted > 0) {
    run('UPDATE rse_sources SET total_signals_accepted = total_signals_accepted + ? WHERE id = ?', [
      accepted, transcript.source_id,
    ]);
  }

  return { signals: totalSignals, accepted, rejected };
}

/**
 * Score a batch of transcribed-but-unscored transcripts.
 * Called by rse_signal_scorer handler.
 */
async function scoreBatch(limit = 10) {
  const pending = all(
    `SELECT id, title FROM rse_transcripts
     WHERE status = 'transcribed'
     ORDER BY created_at ASC LIMIT ?`, [limit]
  );

  let totalScored = 0, totalAccepted = 0, totalRejected = 0;
  const results = [];

  for (const row of pending) {
    const result = await scoreTranscript(row.id);
    totalScored++;
    totalAccepted += result.accepted;
    totalRejected += result.rejected;
    results.push({ id: row.id, title: row.title, ...result });
  }

  return { scored: totalScored, accepted: totalAccepted, rejected: totalRejected, results };
}

// ════════════════════════════════════════════════════════════════════════════
// JSON PARSING HELPER
// ════════════════════════════════════════════════════════════════════════════

function parseJson(raw) {
  if (!raw) return null;
  // Strip markdown fences if present
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to find JSON object in the response
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }
    return null;
  }
}

module.exports = {
  scoreTranscript,
  scoreBatch,
  chunkTranscript,
  SCORING_RUBRIC,
};
