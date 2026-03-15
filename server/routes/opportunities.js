/**
 * @file opportunities.js (routes)
 * @description Opportunity Engine API — signals, clusters, prototypes, stats.
 *
 * ENDPOINTS:
 *   GET  /api/opportunities/stats                    — Dashboard summary
 *   GET  /api/opportunities/signals                  — Paginated signal feed
 *   GET  /api/opportunities/clusters                 — Scored clusters
 *   GET  /api/opportunities/clusters/:id             — Cluster detail + signals
 *   POST /api/opportunities/clusters/:id/promote     — Promote cluster to factory
 *   POST /api/opportunities/clusters/:id/kill        — Kill a cluster
 *   GET  /api/opportunities/prototypes               — All prototypes
 *   GET  /api/opportunities/prototypes/:id/traction  — Traction time series
 *   POST /api/opportunities/prototypes/:id/kill      — Kill a prototype
 *   GET  /api/opportunities/scanners                 — Scanner status overview
 */

const { Router } = require('express');
const { all, get, run } = require('../db/connection');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

// ── Stats ───────────────────────────────────────────────────────────────────

router.get('/stats', (req, res, next) => {
  try {
    const ingest = require('../services/signalIngest');
    const stats = ingest.getStats();

    // Additional stats
    const today = new Date().toISOString().slice(0, 10);
    const signalsToday = get("SELECT COUNT(*) AS c FROM opp_signals WHERE DATE(scraped_at) = ?", [today]);
    const clustersToday = get("SELECT COUNT(*) AS c FROM opp_clusters WHERE DATE(created_at) = ?", [today]);

    // Top cluster
    const topCluster = get(`
      SELECT id, pain_summary, composite_score, signal_count, status
      FROM opp_clusters
      WHERE composite_score IS NOT NULL
      ORDER BY composite_score DESC LIMIT 1
    `);

    res.json({
      ...stats,
      signals_today: signalsToday?.c || 0,
      clusters_today: clustersToday?.c || 0,
      top_cluster: topCluster || null,
    });
  } catch (error) {
    next(error);
  }
});

// ── Signals ─────────────────────────────────────────────────────────────────

router.get('/signals', (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const source = req.query.source || null;
    const classification = req.query.classification || null;

    let query = `
      SELECT s.*, c.pain_summary AS cluster_summary, c.composite_score AS cluster_score
      FROM opp_signals s
      LEFT JOIN opp_clusters c ON s.cluster_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (source) { query += ' AND s.source = ?'; params.push(source); }
    if (classification) { query += ' AND s.classification = ?'; params.push(classification); }

    query += ' ORDER BY s.scraped_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const signals = all(query, params);
    const total = get(`SELECT COUNT(*) AS c FROM opp_signals WHERE 1=1${source ? " AND source='" + source + "'" : ''}${classification ? " AND classification='" + classification + "'" : ''}`);

    res.json({ signals, total: total?.c || 0, limit, offset });
  } catch (error) {
    next(error);
  }
});

// ── Clusters ────────────────────────────────────────────────────────────────

router.get('/clusters', (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const status = req.query.status || null;
    const minScore = parseInt(req.query.min_score) || 0;

    let query = 'SELECT * FROM opp_clusters WHERE 1=1';
    const params = [];

    if (status) { query += ' AND status = ?'; params.push(status); }
    if (minScore > 0) { query += ' AND composite_score >= ?'; params.push(minScore); }

    query += ' ORDER BY composite_score DESC NULLS LAST, signal_count DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    res.json({ clusters: all(query, params), limit, offset });
  } catch (error) {
    next(error);
  }
});

router.get('/clusters/:id', (req, res, next) => {
  try {
    const cluster = get('SELECT * FROM opp_clusters WHERE id = ?', [req.params.id]);
    if (!cluster) return res.status(404).json({ error: 'Cluster not found' });

    const signals = all(
      'SELECT * FROM opp_signals WHERE cluster_id = ? ORDER BY platform_score DESC, scraped_at DESC',
      [req.params.id]
    );

    const prototype = get('SELECT * FROM opp_prototypes WHERE cluster_id = ? ORDER BY created_at DESC LIMIT 1', [req.params.id]);

    res.json({ cluster, signals, prototype: prototype || null });
  } catch (error) {
    next(error);
  }
});

router.post('/clusters/:id/promote', (req, res, next) => {
  try {
    const cluster = get('SELECT * FROM opp_clusters WHERE id = ?', [req.params.id]);
    if (!cluster) return res.status(404).json({ error: 'Cluster not found' });
    if (cluster.status !== 'scored') {
      return res.status(400).json({ error: `Cluster status is "${cluster.status}" — must be "scored" to promote` });
    }

    run("UPDATE opp_clusters SET status = 'prototyping', updated_at = datetime('now') WHERE id = ?", [req.params.id]);
    res.json({ message: 'Cluster promoted to prototyping', id: req.params.id });
  } catch (error) {
    next(error);
  }
});

router.post('/clusters/:id/kill', (req, res, next) => {
  try {
    const cluster = get('SELECT * FROM opp_clusters WHERE id = ?', [req.params.id]);
    if (!cluster) return res.status(404).json({ error: 'Cluster not found' });

    run("UPDATE opp_clusters SET status = 'killed', updated_at = datetime('now') WHERE id = ?", [req.params.id]);
    res.json({ message: 'Cluster killed', id: req.params.id });
  } catch (error) {
    next(error);
  }
});

// ── Prototypes ──────────────────────────────────────────────────────────────

router.get('/prototypes', (req, res, next) => {
  try {
    const prototypes = all(`
      SELECT p.*, c.pain_summary, c.composite_score
      FROM opp_prototypes p
      JOIN opp_clusters c ON p.cluster_id = c.id
      ORDER BY p.created_at DESC
    `);
    res.json({ prototypes });
  } catch (error) {
    next(error);
  }
});

router.get('/prototypes/:id/traction', (req, res, next) => {
  try {
    const traction = all(
      'SELECT * FROM opp_traction WHERE prototype_id = ? ORDER BY date DESC LIMIT 30',
      [req.params.id]
    );
    res.json({ traction });
  } catch (error) {
    next(error);
  }
});

router.post('/prototypes/:id/kill', (req, res, next) => {
  try {
    const proto = get('SELECT * FROM opp_prototypes WHERE id = ?', [req.params.id]);
    if (!proto) return res.status(404).json({ error: 'Prototype not found' });

    run("UPDATE opp_prototypes SET status = 'killed', killed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", [req.params.id]);
    run("UPDATE opp_clusters SET status = 'killed', updated_at = datetime('now') WHERE id = ?", [proto.cluster_id]);

    res.json({ message: 'Prototype killed', id: req.params.id });
  } catch (error) {
    next(error);
  }
});

// ── Scanner Status ──────────────────────────────────────────────────────────

router.get('/scanners', (req, res, next) => {
  try {
    const scanners = all('SELECT * FROM opp_scanner_state ORDER BY scanner_name');
    res.json({ scanners });
  } catch (error) {
    next(error);
  }
});

router.post('/scanners/:name/toggle', (req, res, next) => {
  try {
    const scanner = get('SELECT * FROM opp_scanner_state WHERE scanner_name = ?', [req.params.name]);
    if (!scanner) return res.status(404).json({ error: 'Scanner not found' });

    const newEnabled = scanner.enabled ? 0 : 1;
    run('UPDATE opp_scanner_state SET enabled = ? WHERE scanner_name = ?', [newEnabled, req.params.name]);

    res.json({ scanner_name: req.params.name, enabled: !!newEnabled });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
