/**
 * @file signalIngest.js
 * @description Core signal ingest framework for the Opportunity Engine.
 *
 * RESPONSIBILITIES:
 *   1. Normalize and insert raw signals from scanners into opp_signals
 *   2. Classify signals via Ollama ($0) — pain type, severity, category, fingerprint
 *   3. Trigger clustering via signalDedup after classification
 *   4. Track scanner state (cursors, run counts)
 *
 * COST: $0 — all classification via local Ollama (llama3.2:3b)
 */

'use strict';

const { get, run, all } = require('../db/connection');
const dedup = require('./signalDedup');
const { chat } = require('./llmClient');

const OLLAMA_MODEL = process.env.OLLAMA_DEFAULT_MODEL || 'llama3.2:3b';

function ollamaChat(systemPrompt, userMessage, timeoutMs = 60000) {
  return chat(systemPrompt, userMessage, {
    model: OLLAMA_MODEL, provider: 'ollama', temperature: 0.3, maxTokens: 512, timeoutMs,
  });
}

// ── Signal ingestion ────────────────────────────────────────────────────────

/**
 * Ingest a raw signal from a scanner.
 * Runs dedup layers 1+2 before inserting. Returns null if duplicate.
 *
 * @param {string} source - Scanner name (reddit, hn, ph, etc.)
 * @param {object} rawData - { url, title, body_text, author, posted_at, platform_score }
 * @returns {{ signalId: number } | null} null if deduplicated
 */
function ingestSignal(source, rawData) {
  const { url, title, body_text, author, posted_at, platform_score } = rawData;

  // Dedup layers 1 + 2
  const dupCheck = dedup.checkDuplicate({ url, title, body_text });
  if (dupCheck.isDuplicate) {
    return null;
  }

  // Truncate body to 5000 chars
  const truncatedBody = (body_text || '').slice(0, 5000);

  run(`
    INSERT INTO opp_signals (source, url, title, body_text, author, posted_at, platform_score, content_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [source, url, title || null, truncatedBody || null, author || null, posted_at || null, platform_score || 0, dupCheck.contentHash]);

  const row = get('SELECT last_insert_rowid() AS id');
  return { signalId: row.id };
}

// ── Ollama classification ───────────────────────────────────────────────────

const CLASSIFY_SYSTEM_PROMPT = `You are a signal classifier for an opportunity discovery engine.
Given a post title and body from the internet, classify it as a software/business opportunity signal.

Return ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "classification": "software_pain" | "workflow_gap" | "tooling_need" | "market_signal" | "noise",
  "severity": 1-5,
  "category": "automation" | "saas" | "dev_tools" | "finance" | "construction" | "data" | "other",
  "pain_summary": "One sentence describing the pain point",
  "pain_fingerprint": "lowercase-hyphenated-64-char-max-semantic-key"
}

Rules:
- "noise" = not a real pain point (memes, jokes, self-promotion, news without complaint)
- severity 1 = mild annoyance, 5 = business-critical blocker people would pay to fix
- pain_fingerprint should capture the ESSENCE of the pain (e.g., "manual-invoice-data-entry-erp-migration")
- Two posts about the same fundamental problem should produce similar fingerprints
- construction/finance/data categories get +1 severity bonus (Steve's verticals)`;

/**
 * Classify a single signal via Ollama. Updates opp_signals in place.
 * @param {number} signalId
 * @returns {{ classification: string, severity: number, category: string, fingerprint: string } | null}
 */
async function classifySignal(signalId) {
  const signal = get('SELECT * FROM opp_signals WHERE id = ?', [signalId]);
  if (!signal) return null;

  const input = `Title: ${signal.title || 'N/A'}\nBody: ${(signal.body_text || '').slice(0, 2000)}\nSource: ${signal.source}\nScore: ${signal.platform_score}`;

  try {
    const raw = await ollamaChat(CLASSIFY_SYSTEM_PROMPT, input);

    // Parse JSON — handle markdown fences
    let cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
    const firstBrace = cleaned.indexOf('{');
    if (firstBrace > 0) cleaned = cleaned.slice(firstBrace);

    let data;
    try { data = JSON.parse(cleaned); } catch {
      // Try to extract JSON object
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (m) try { data = JSON.parse(m[0]); } catch {}
    }

    if (!data || !data.classification) {
      console.warn(`[SignalIngest] Ollama returned unparseable output for signal ${signalId}`);
      run("UPDATE opp_signals SET classification = 'noise' WHERE id = ?", [signalId]);
      return null;
    }

    // Update signal
    run(`
      UPDATE opp_signals
      SET classification = ?, severity = ?, category = ?,
          pain_fingerprint = ?
      WHERE id = ?
    `, [
      data.classification,
      Math.min(5, Math.max(1, data.severity || 1)),
      data.category || 'other',
      (data.pain_fingerprint || '').slice(0, 64).toLowerCase(),
      signalId,
    ]);

    // If not noise, assign to cluster (Layer 3 dedup)
    if (data.classification !== 'noise' && data.pain_fingerprint) {
      dedup.assignToCluster(
        signalId,
        (data.pain_fingerprint || '').slice(0, 64).toLowerCase(),
        data.pain_summary || signal.title || 'Unknown pain',
        data.category || 'other'
      );
    }

    return {
      classification: data.classification,
      severity: data.severity,
      category: data.category,
      fingerprint: data.pain_fingerprint,
    };
  } catch (err) {
    console.error(`[SignalIngest] Classification failed for signal ${signalId}:`, err.message);
    return null;
  }
}

/**
 * Batch classify unclassified signals.
 * @param {number} limit - Max signals to classify in one batch
 * @returns {{ classified: number, noise: number, errors: number }}
 */
async function classifyBatch(limit = 50) {
  const unclassified = all(
    'SELECT id FROM opp_signals WHERE classification IS NULL ORDER BY created_at DESC LIMIT ?',
    [limit]
  );

  let classified = 0;
  let noise = 0;
  let errors = 0;

  for (const row of unclassified) {
    const result = await classifySignal(row.id);
    if (!result) {
      errors++;
    } else if (result.classification === 'noise') {
      noise++;
    } else {
      classified++;
    }
    // Small delay between Ollama calls to avoid overwhelming local GPU
    await new Promise(r => setTimeout(r, 200));
  }

  return { classified, noise, errors, total: unclassified.length };
}

// ── Scanner state management ────────────────────────────────────────────────

/**
 * Get scanner cursor state.
 * @param {string} scannerName
 * @returns {{ last_cursor: string|null, last_run_at: string|null, enabled: boolean }}
 */
function getScannerState(scannerName) {
  const row = get('SELECT * FROM opp_scanner_state WHERE scanner_name = ?', [scannerName]);
  if (!row) {
    // Auto-create disabled
    run('INSERT OR IGNORE INTO opp_scanner_state (scanner_name, enabled) VALUES (?, 0)', [scannerName]);
    return { last_cursor: null, last_run_at: null, enabled: false };
  }
  return { last_cursor: row.last_cursor, last_run_at: row.last_run_at, enabled: !!row.enabled };
}

/**
 * Update scanner state after a run.
 * @param {string} scannerName
 * @param {string|null} cursor - New pagination cursor
 * @param {number} itemsFound - Signals found this run
 * @param {number} errors - Errors this run
 */
function updateScannerState(scannerName, cursor, itemsFound, errors = 0) {
  run(`
    UPDATE opp_scanner_state
    SET last_cursor = ?, last_run_at = datetime('now'),
        items_found_total = items_found_total + ?,
        items_found_last_run = ?, errors_last_run = ?
    WHERE scanner_name = ?
  `, [cursor, itemsFound, itemsFound, errors, scannerName]);
}

// ── Stats ───────────────────────────────────────────────────────────────────

/**
 * Get summary stats for the opportunity engine.
 * @returns {object}
 */
function getStats() {
  const signals = get('SELECT COUNT(*) AS total FROM opp_signals') || { total: 0 };
  const classified = get("SELECT COUNT(*) AS total FROM opp_signals WHERE classification IS NOT NULL AND classification != 'noise'") || { total: 0 };
  const noise = get("SELECT COUNT(*) AS total FROM opp_signals WHERE classification = 'noise'") || { total: 0 };
  const pending = get('SELECT COUNT(*) AS total FROM opp_signals WHERE classification IS NULL') || { total: 0 };
  const clusters = get('SELECT COUNT(*) AS total FROM opp_clusters') || { total: 0 };
  const scoredClusters = get("SELECT COUNT(*) AS total FROM opp_clusters WHERE composite_score IS NOT NULL") || { total: 0 };
  const hotClusters = get("SELECT COUNT(*) AS total FROM opp_clusters WHERE composite_score >= 75") || { total: 0 };
  const prototypes = get('SELECT COUNT(*) AS total FROM opp_prototypes') || { total: 0 };

  return {
    signals_total: signals.total,
    signals_classified: classified.total,
    signals_noise: noise.total,
    signals_pending: pending.total,
    clusters_total: clusters.total,
    clusters_scored: scoredClusters.total,
    clusters_hot: hotClusters.total,
    prototypes_total: prototypes.total,
  };
}

// ── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  ingestSignal,
  classifySignal,
  classifyBatch,
  getScannerState,
  updateScannerState,
  getStats,
};
