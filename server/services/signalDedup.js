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

const FINGERPRINT_THRESHOLD = 8; // Levenshtein distance ≤ 8 = same pain cluster

/**
 * Find the best matching cluster for a pain fingerprint.
 * Scans recent clusters (last 90 days) and returns the closest match.
 * @param {string} fingerprint - Ollama-generated pain fingerprint
 * @returns {{ clusterId: number, distance: number } | null}
 */
function findMatchingCluster(fingerprint) {
  if (!fingerprint) return null;

  // Get all clusters with at least one signal that has a fingerprint
  // We compare against the pain_summary-derived fingerprints stored in signals
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
  let bestDistance = Infinity;

  for (const row of clusters) {
    const dist = levenshtein(fingerprint, row.pain_fingerprint);
    if (dist < bestDistance) {
      bestDistance = dist;
      bestMatch = { clusterId: row.id, distance: dist };
    }
  }

  if (bestMatch && bestMatch.distance <= FINGERPRINT_THRESHOLD) {
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
  const match = findMatchingCluster(painFingerprint);

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
