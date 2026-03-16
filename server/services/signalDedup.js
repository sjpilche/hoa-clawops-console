/**
 * @file signalDedup.js
 * @description 3-layer signal deduplication for the Opportunity Engine.
 *
 * LAYERS:
 *   1. Exact URL match — skip if url already exists in opp_signals
 *   2. Content fingerprint — SHA-256 of normalized(title + body)
 *   3. Semantic clustering — Ollama pain_fingerprint, Levenshtein distance ≤ 8 = same cluster
 *
 * $0/run — all local computation except Ollama (also $0).
 */

'use strict';

const crypto = require('crypto');
const { get, run, all } = require('../db/connection');

// ── Layer 1: Exact URL dedup ────────────────────────────────────────────────

/**
 * Check if a URL already exists in opp_signals.
 * @param {string} url
 * @returns {boolean} true if duplicate
 */
function isDuplicateUrl(url) {
  if (!url) return false;
  const row = get('SELECT id FROM opp_signals WHERE url = ? LIMIT 1', [url]);
  return !!row;
}

// ── Layer 2: Content fingerprint ────────────────────────────────────────────

/**
 * Normalize text for fingerprinting: lowercase, collapse whitespace, strip punctuation.
 * @param {string} text
 * @returns {string}
 */
function normalizeText(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generate SHA-256 content hash from title + body.
 * @param {string} title
 * @param {string} body
 * @returns {string} hex digest
 */
function contentHash(title, body) {
  const normalized = normalizeText((title || '') + ' ' + (body || ''));
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Check if content hash already exists.
 * @param {string} hash
 * @returns {boolean}
 */
function isDuplicateContent(hash) {
  if (!hash) return false;
  const row = get('SELECT id FROM opp_signals WHERE content_hash = ? LIMIT 1', [hash]);
  return !!row;
}

// ── Layer 3: Semantic clustering via pain fingerprints ──────────────────────

/**
 * Levenshtein distance between two strings.
 * Used to compare Ollama-generated pain fingerprints.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function levenshtein(a, b) {
  if (!a || !b) return Infinity;
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;

  // Use single-row DP for memory efficiency
  let prev = Array.from({ length: lb + 1 }, (_, i) => i);
  let curr = new Array(lb + 1);

  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[lb];
}

const FINGERPRINT_THRESHOLD = 20; // Levenshtein distance — loosened from 8 (too strict for LLM-generated fingerprints)
const WORD_OVERLAP_THRESHOLD = 0.4; // 40% shared words between fingerprints = same cluster

/**
 * Calculate word overlap ratio between two fingerprints.
 * "manual-data-import-excel" vs "manual-csv-import-google-sheets" → 0.33 (shared: manual, import)
 */
function wordOverlap(a, b) {
  const wordsA = new Set(a.replace(/-/g, ' ').split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.replace(/-/g, ' ').split(/\s+/).filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let shared = 0;
  for (const w of wordsA) { if (wordsB.has(w)) shared++; }
  return shared / Math.min(wordsA.size, wordsB.size);
}

/**
 * Find the best matching cluster for a signal.
 * Strategy: CATEGORY-FIRST clustering. If a cluster exists with the same
 * pain_category, the signal joins it. Period. Levenshtein is used as a
 * tiebreaker only when multiple clusters share the same category.
 *
 * Previous approach (Levenshtein distance ≤ 8) produced 46 singleton clusters
 * because LLM fingerprints are too varied. Category clustering is coarser
 * but actually produces scorable clusters.
 */
function findMatchingCluster(fingerprint, category) {
  // Primary: match by category (coarse but effective)
  if (category) {
    const catCluster = get(`
      SELECT c.id FROM opp_clusters c
      WHERE c.pain_category = ? AND c.status NOT IN ('killed', 'scaled')
      ORDER BY c.last_signal_at DESC LIMIT 1
    `, [category]);
    if (catCluster) return { clusterId: catCluster.id, distance: 0 };
  }

  // Fallback: word overlap on fingerprint (if no category match)
  if (!fingerprint) return null;
  const clusters = all(`
    SELECT DISTINCT c.id, s.pain_fingerprint
    FROM opp_clusters c
    JOIN opp_signals s ON s.cluster_id = c.id
    WHERE s.pain_fingerprint IS NOT NULL
      AND c.status NOT IN ('killed', 'scaled')
    ORDER BY c.last_signal_at DESC
    LIMIT 500
  `);

  let bestMatch = null;
  let bestOverlap = 0;

  for (const row of clusters) {
    const overlap = wordOverlap(fingerprint, row.pain_fingerprint);
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestMatch = { clusterId: row.id, distance: 0, overlap };
    }
  }

  if (bestMatch && bestOverlap >= WORD_OVERLAP_THRESHOLD) {
    return bestMatch;
  }
  return null;
}

/**
 * Assign a signal to an existing cluster or create a new one.
 * @param {number} signalId
 * @param {string} painFingerprint
 * @param {string} painSummary - Human-readable summary (from Ollama classification)
 * @param {string} category
 * @returns {{ clusterId: number, isNew: boolean }}
 */
function assignToCluster(signalId, painFingerprint, painSummary, category) {
  const match = findMatchingCluster(painFingerprint, category);

  if (match) {
    // Existing cluster — add signal and update aggregates
    run('UPDATE opp_signals SET cluster_id = ? WHERE id = ?', [match.clusterId, signalId]);

    // Recompute cluster aggregates
    const stats = get(`
      SELECT COUNT(*) AS cnt, AVG(platform_score) AS avg_score,
             COUNT(DISTINCT source) AS src_div
      FROM opp_signals WHERE cluster_id = ?
    `, [match.clusterId]);

    run(`
      UPDATE opp_clusters
      SET signal_count = ?, avg_platform_score = ?, source_diversity = ?,
          last_signal_at = datetime('now'), updated_at = datetime('now'),
          velocity = CAST(? AS REAL) / MAX(1.0, JULIANDAY('now') - JULIANDAY(first_seen_at)) * 7.0
      WHERE id = ?
    `, [stats.cnt, stats.avg_score || 0, stats.src_div || 1, stats.cnt, match.clusterId]);

    return { clusterId: match.clusterId, isNew: false };
  }

  // New cluster
  run(`
    INSERT INTO opp_clusters (pain_summary, pain_category, signal_count, source_diversity)
    VALUES (?, ?, 1, 1)
  `, [painSummary || 'Uncategorized pain signal', category || 'other']);

  const newCluster = get('SELECT last_insert_rowid() AS id');
  const clusterId = newCluster.id;

  run('UPDATE opp_signals SET cluster_id = ? WHERE id = ?', [clusterId, signalId]);

  return { clusterId, isNew: true };
}

// ── Full dedup pipeline ─────────────────────────────────────────────────────

/**
 * Run all 3 dedup layers on a candidate signal.
 * @param {{ url: string, title: string, body_text: string }} signal
 * @returns {{ isDuplicate: boolean, reason?: string, contentHash?: string }}
 */
function checkDuplicate(signal) {
  // Layer 1: URL
  if (isDuplicateUrl(signal.url)) {
    return { isDuplicate: true, reason: 'url_match' };
  }

  // Layer 2: Content hash
  const hash = contentHash(signal.title, signal.body_text);
  if (isDuplicateContent(hash)) {
    return { isDuplicate: true, reason: 'content_hash_match' };
  }

  return { isDuplicate: false, contentHash: hash };
}

// ── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  isDuplicateUrl,
  contentHash,
  isDuplicateContent,
  normalizeText,
  levenshtein,
  findMatchingCluster,
  assignToCluster,
  checkDuplicate,
  FINGERPRINT_THRESHOLD,
};
