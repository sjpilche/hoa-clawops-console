/**
 * @file chromaBrain.js
 * @description ClawOps 2.0 Option B — Local SQLite-backed semantic store for
 * retrieval of winning episodes and KB entries.
 *
 * Originally designed for Chroma vector DB, reimplemented as plain SQLite tables
 * for zero-dependency operation. Uses keyword tokenization + metadata scoring
 * to approximate semantic search without embeddings.
 *
 * Two tables:
 *   "brain_rag_episodes"  — Layer 3 raw outcome episodes
 *   "brain_rag_knowledge" — Distilled Layer 4 KB entries
 *
 * No embeddings, no API key, no server required.
 *
 * EXPORTS:
 *   async initCollections()
 *   async addEpisode(episodeObj)
 *   async addKnowledge(kbObj)
 *   async queryRelevant(queryText, limit, filter) → [{id, content, score, metadata}]
 *   async getRecentAdditions(since, limit) → [{id, content, metadata}]
 *   getStats() → {ready, episodes, knowledge}
 *   isReady() → boolean
 *
 * Safety: Every function wraps in try/catch — errors never crash the server.
 */

'use strict';

// ── Singleton state ──────────────────────────────────────────────────────────
let _ready         = false;
let _initAttempted = false;
let _db            = null;

const discord = require('./discordNotifier');

function notifyChromaError(context, err) {
  console.warn(`[ChromaBrain] ⚠️  ${context}: ${err.message}`);
  try {
    discord.postWebhook({
      embeds: [{
        title: '⚠️ ChromaBrain Error',
        description: `**${context}**\n\`${err.message.slice(0, 300)}\``,
        color: 0xf39c12,
        timestamp: new Date().toISOString(),
        footer: { text: 'ChromaBrain · ClawOps' },
      }],
    }).catch(() => {});
  } catch {}
}

function isReady() { return _ready; }

// ── Initialization ────────────────────────────────────────────────────────────

async function initCollections() {
  if (_ready) return;
  if (_initAttempted) return;
  _initAttempted = true;

  try {
    const { get: dbGet, run: dbRun, all: dbAll } = require('../db/connection');
    _db = { get: dbGet, run: dbRun, all: dbAll };

    _db.run(`
      CREATE TABLE IF NOT EXISTS brain_rag_episodes (
        doc_id       TEXT PRIMARY KEY,
        content      TEXT NOT NULL DEFAULT '',
        keywords     TEXT NOT NULL DEFAULT '',
        product      TEXT DEFAULT '',
        market       TEXT DEFAULT '',
        erp          TEXT DEFAULT '',
        outcome_type TEXT DEFAULT '',
        outcome_score REAL DEFAULT 0,
        days_to_outcome INTEGER,
        agent_name   TEXT DEFAULT '',
        added_at     TEXT NOT NULL
      )
    `);
    _db.run('CREATE INDEX IF NOT EXISTS idx_rag_ep_added ON brain_rag_episodes(added_at)');
    _db.run('CREATE INDEX IF NOT EXISTS idx_rag_ep_product ON brain_rag_episodes(product)');

    _db.run(`
      CREATE TABLE IF NOT EXISTS brain_rag_knowledge (
        doc_id        TEXT PRIMARY KEY,
        content       TEXT NOT NULL DEFAULT '',
        keywords      TEXT NOT NULL DEFAULT '',
        source_agent  TEXT DEFAULT '',
        content_type  TEXT DEFAULT '',
        market        TEXT DEFAULT '',
        erp           TEXT DEFAULT '',
        quality_score REAL DEFAULT 0,
        product       TEXT DEFAULT '',
        added_at      TEXT NOT NULL
      )
    `);
    _db.run('CREATE INDEX IF NOT EXISTS idx_rag_kb_added ON brain_rag_knowledge(added_at)');
    _db.run('CREATE INDEX IF NOT EXISTS idx_rag_kb_product ON brain_rag_knowledge(product)');

    _ready = true;
    const epCount = _db.get('SELECT COUNT(*) AS c FROM brain_rag_episodes')?.c || 0;
    const kbCount = _db.get('SELECT COUNT(*) AS c FROM brain_rag_knowledge')?.c || 0;
    console.log(`[ChromaBrain] ✅ SQLite RAG ready — episodes: ${epCount}, knowledge: ${kbCount}`);
  } catch (err) {
    _ready = false;
    console.warn('[ChromaBrain] Init failed (non-fatal, RAG disabled):', err.message);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeId(prefix, sourceId) {
  return `${prefix}_${String(sourceId).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

/** Extract meaningful keywords from text for scoring */
function extractKeywords(text) {
  if (!text) return '';
  const stopWords = new Set(['the','and','for','are','was','with','that','this','from','have','they','been','their','will','when','what','your','into','each','more','also','than','then','some','such','most','over','only','very','can','not','but','all','its']);
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w))
    .slice(0, 40)
    .join(' ');
}

/** Score a row's relevance to a query using keyword overlap */
function keywordScore(rowKeywords, queryWords) {
  if (!rowKeywords || !queryWords.length) return 0;
  const rowWords = new Set(rowKeywords.split(' '));
  let hits = 0;
  for (const w of queryWords) {
    if (rowWords.has(w)) hits++;
  }
  return hits / queryWords.length;
}

// ── WRITE: Add Episode ────────────────────────────────────────────────────────

async function addEpisode({ id, content, metadata = {} }) {
  if (!_ready) return;
  try {
    const docId    = makeId('ep', id);
    const keywords = extractKeywords(content + ' ' + (metadata.market || '') + ' ' + (metadata.erp || ''));
    const addedAt  = new Date().toISOString();

    _db.run(
      `INSERT OR REPLACE INTO brain_rag_episodes
         (doc_id, content, keywords, product, market, erp, outcome_type, outcome_score, days_to_outcome, agent_name, added_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        docId, content || '', keywords,
        metadata.product || '',
        metadata.market  || '',
        metadata.erp     || '',
        metadata.outcome_type || '',
        parseFloat(metadata.outcome_score) || 0,
        metadata.days_to_outcome != null ? parseInt(metadata.days_to_outcome) : null,
        metadata.agent_name || '',
        addedAt,
      ]
    );
  } catch (err) {
    notifyChromaError(`addEpisode for ${id}`, err);
  }
}

// ── WRITE: Add Knowledge ──────────────────────────────────────────────────────

async function addKnowledge({ id, content, metadata = {} }) {
  if (!_ready) return;
  try {
    const docId    = makeId('kb', id);
    const keywords = extractKeywords(content + ' ' + (metadata.market || '') + ' ' + (metadata.erp || ''));
    const addedAt  = new Date().toISOString();

    _db.run(
      `INSERT OR REPLACE INTO brain_rag_knowledge
         (doc_id, content, keywords, source_agent, content_type, market, erp, quality_score, product, added_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        docId, content || '', keywords,
        metadata.source_agent  || '',
        metadata.content_type  || '',
        metadata.market        || '',
        metadata.erp           || '',
        parseFloat(metadata.quality_score) || 0,
        metadata.product       || '',
        addedAt,
      ]
    );
  } catch (err) {
    notifyChromaError(`addKnowledge for ${id}`, err);
  }
}

// ── READ: Semantic query ──────────────────────────────────────────────────────

async function queryRelevant(queryText, limit = 5, filter = {}) {
  if (!_ready) return [];
  const results = [];

  const { product, market, outcome_score_min, collection = 'both' } = filter;

  const queryWords = extractKeywords(queryText).split(' ').filter(Boolean);
  if (!queryWords.length) return [];

  try {
    // Query episodes
    if (collection === 'episodes' || collection === 'both') {
      const n = Math.ceil(limit * (collection === 'both' ? 0.6 : 1));
      let sql = 'SELECT * FROM brain_rag_episodes WHERE 1=1';
      const params = [];
      if (product) { sql += ' AND product = ?'; params.push(product); }
      if (market)  { sql += ' AND market LIKE ?'; params.push(`%${market}%`); }
      if (outcome_score_min != null) { sql += ' AND outcome_score >= ?'; params.push(outcome_score_min); }
      sql += ' ORDER BY added_at DESC LIMIT 200';

      const rows = _db.all(sql, params) || [];
      for (const r of rows) {
        const score = keywordScore(r.keywords, queryWords);
        if (score === 0) continue;
        results.push({
          id: r.doc_id, content: r.content, score,
          metadata: { product: r.product, market: r.market, erp: r.erp, outcome_type: r.outcome_type, outcome_score: r.outcome_score, days_to_outcome: r.days_to_outcome, agent_name: r.agent_name, added_at: r.added_at },
          collection: 'episodes',
        });
      }
    }

    // Query knowledge
    if (collection === 'knowledge' || collection === 'both') {
      const n = Math.floor(limit * (collection === 'both' ? 0.4 : 1)) || 1;
      let sql = 'SELECT * FROM brain_rag_knowledge WHERE 1=1';
      const params = [];
      if (product) { sql += ' AND product = ?'; params.push(product); }
      if (market)  { sql += ' AND market LIKE ?'; params.push(`%${market}%`); }
      sql += ' ORDER BY added_at DESC LIMIT 200';

      const rows = _db.all(sql, params) || [];
      for (const r of rows) {
        const score = keywordScore(r.keywords, queryWords);
        if (score === 0) continue;
        results.push({
          id: r.doc_id, content: r.content, score,
          metadata: { source_agent: r.source_agent, content_type: r.content_type, market: r.market, erp: r.erp, quality_score: r.quality_score, product: r.product, added_at: r.added_at },
          collection: 'knowledge',
        });
      }
    }
  } catch (err) {
    notifyChromaError(`queryRelevant("${queryText.slice(0, 60)}")`, err);
    return [];
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ── READ: Recent additions (for Brain Council) ────────────────────────────────

async function getRecentAdditions(since, limit = 10) {
  if (!_ready) return [];
  const results = [];
  try {
    const epRows = _db.all(
      'SELECT * FROM brain_rag_episodes WHERE added_at >= ? ORDER BY added_at DESC LIMIT ?',
      [since, Math.ceil(limit * 0.6)]
    ) || [];
    for (const r of epRows) {
      results.push({ id: r.doc_id, content: r.content, metadata: { product: r.product, market: r.market, erp: r.erp, outcome_type: r.outcome_type, outcome_score: r.outcome_score, days_to_outcome: r.days_to_outcome, agent_name: r.agent_name, added_at: r.added_at }, collection: 'episodes' });
    }
    const kbRows = _db.all(
      'SELECT * FROM brain_rag_knowledge WHERE added_at >= ? ORDER BY added_at DESC LIMIT ?',
      [since, Math.floor(limit * 0.4) || 1]
    ) || [];
    for (const r of kbRows) {
      results.push({ id: r.doc_id, content: r.content, metadata: { source_agent: r.source_agent, content_type: r.content_type, market: r.market, erp: r.erp, quality_score: r.quality_score, product: r.product, added_at: r.added_at }, collection: 'knowledge' });
    }
  } catch (err) {
    console.warn('[ChromaBrain] getRecentAdditions:', err.message);
  }

  return results.sort((a, b) => {
    const tA = a.metadata.added_at ? new Date(a.metadata.added_at).getTime() : 0;
    const tB = b.metadata.added_at ? new Date(b.metadata.added_at).getTime() : 0;
    return tB - tA;
  }).slice(0, limit);
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function getStats() {
  if (!_ready) return { ready: false, episodes: 0, knowledge: 0 };
  try {
    const epCount = _db.get('SELECT COUNT(*) AS c FROM brain_rag_episodes')?.c || 0;
    const kbCount = _db.get('SELECT COUNT(*) AS c FROM brain_rag_knowledge')?.c || 0;
    return { ready: true, episodes: epCount, knowledge: kbCount };
  } catch {
    return { ready: false, episodes: 0, knowledge: 0 };
  }
}

module.exports = { initCollections, addEpisode, addKnowledge, queryRelevant, getRecentAdditions, getStats, isReady };
