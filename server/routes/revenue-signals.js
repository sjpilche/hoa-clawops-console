/**
 * @file revenue-signals.js (routes)
 * @description Revenue Signal Engine API — sources, transcripts, signals, specs, campaigns, expert library.
 *
 * ENDPOINTS:
 *   GET  /api/rse/stats                  — Dashboard summary
 *   GET  /api/rse/sources                — All curated sources with trust scores
 *   POST /api/rse/sources                — Add a new source
 *   PATCH /api/rse/sources/:id           — Update source (enable/disable, notes)
 *   GET  /api/rse/transcripts            — Recent transcripts with status filter
 *   GET  /api/rse/signals                — Scored signals (accepted/rejected)
 *   GET  /api/rse/signals/:id            — Signal detail with transcript context
 *   GET  /api/rse/build-specs            — Build specs with status filter
 *   PATCH /api/rse/build-specs/:id       — Update spec status (approve/kill)
 *   GET  /api/rse/campaigns              — Campaigns with performance data
 *   GET  /api/rse/expert-library         — Expert library with search
 *   POST /api/rse/expert-library/:id/verify — Mark pattern as verified
 */

const { Router } = require('express');
const { all, get, run } = require('../db/connection');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

// ── Stats ───────────────────────────────────────────────────────────────────

router.get('/stats', (req, res, next) => {
  try {
    const sourcesTotal = get('SELECT COUNT(*) AS c FROM rse_sources')?.c || 0;
    const sourcesEnabled = get('SELECT COUNT(*) AS c FROM rse_sources WHERE enabled = 1')?.c || 0;
    const transcriptsTotal = get('SELECT COUNT(*) AS c FROM rse_transcripts')?.c || 0;
    const transcriptsPending = get("SELECT COUNT(*) AS c FROM rse_transcripts WHERE status = 'pending'")?.c || 0;
    const transcriptsTranscribed = get("SELECT COUNT(*) AS c FROM rse_transcripts WHERE status = 'transcribed'")?.c || 0;
    const signalsAccepted = get("SELECT COUNT(*) AS c FROM rse_signals")?.c || 0;
    const specsTotal = get('SELECT COUNT(*) AS c FROM rse_build_specs')?.c || 0;
    const specsDraft = get("SELECT COUNT(*) AS c FROM rse_build_specs WHERE status = 'draft'")?.c || 0;
    const campaignsTotal = get('SELECT COUNT(*) AS c FROM rse_campaigns')?.c || 0;
    const libraryTotal = get('SELECT COUNT(*) AS c FROM rse_expert_library')?.c || 0;
    const libraryVerified = get('SELECT COUNT(*) AS c FROM rse_expert_library WHERE verified = 1')?.c || 0;

    const avgScore = get('SELECT AVG(composite_score) AS avg FROM rse_signals')?.avg || 0;
    const topSource = get(`
      SELECT name, trust_score, total_signals_accepted
      FROM rse_sources WHERE enabled = 1
      ORDER BY total_signals_accepted DESC LIMIT 1
    `);

    const recentSignals = all(`
      SELECT sig.title, sig.composite_score, sig.signal_type, s.name AS source_name, sig.created_at
      FROM rse_signals sig JOIN rse_sources s ON s.id = sig.source_id
      ORDER BY sig.created_at DESC LIMIT 5
    `);

    res.json({
      sources: { total: sourcesTotal, enabled: sourcesEnabled },
      transcripts: { total: transcriptsTotal, pending: transcriptsPending, transcribed: transcriptsTranscribed },
      signals: { accepted: signalsAccepted, avg_score: Math.round(avgScore * 100) / 100 },
      build_specs: { total: specsTotal, draft: specsDraft },
      campaigns: { total: campaignsTotal },
      expert_library: { total: libraryTotal, verified: libraryVerified },
      top_source: topSource || null,
      recent_signals: recentSignals,
    });
  } catch (err) { next(err); }
});

// ── Sources ─────────────────────────────────────────────────────────────────

router.get('/sources', (req, res, next) => {
  try {
    const sources = all('SELECT * FROM rse_sources ORDER BY trust_score DESC');
    res.json(sources);
  } catch (err) { next(err); }
});

router.post('/sources', (req, res, next) => {
  try {
    const { name, platform, channel_url, focus_areas, notes } = req.body;
    if (!name || !channel_url) {
      return res.status(400).json({ error: 'name and channel_url are required' });
    }
    run(`INSERT INTO rse_sources (name, platform, channel_url, focus_areas, notes)
         VALUES (?, ?, ?, ?, ?)`, [
      name, platform || 'youtube', channel_url,
      JSON.stringify(focus_areas || []), notes || '',
    ]);
    res.json({ ok: true, message: `Source "${name}" added` });
  } catch (err) { next(err); }
});

router.patch('/sources/:id', (req, res, next) => {
  try {
    const { enabled, notes, trust_score } = req.body;
    const updates = [];
    const params = [];

    if (enabled !== undefined) { updates.push('enabled = ?'); params.push(enabled ? 1 : 0); }
    if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }
    if (trust_score !== undefined) { updates.push('trust_score = ?'); params.push(trust_score); }

    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    params.push(req.params.id);
    run(`UPDATE rse_sources SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Transcripts ─────────────────────────────────────────────────────────────

router.get('/transcripts', (req, res, next) => {
  try {
    const status = req.query.status || null;
    const limit = parseInt(req.query.limit) || 1000;
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const where = status ? 'WHERE t.status = ?' : '';
    const params = status ? [status, limit, offset] : [limit, offset];

    const transcripts = all(`
      SELECT t.id, t.video_id, t.video_url, t.title, t.published_at, t.duration_secs,
             t.view_count, t.word_count, t.status, t.transcript_source, t.scored_at, t.created_at,
             s.name AS source_name, s.trust_score
      FROM rse_transcripts t
      JOIN rse_sources s ON s.id = t.source_id
      ${where}
      ORDER BY t.created_at DESC LIMIT ? OFFSET ?
    `, params);

    res.json(transcripts);
  } catch (err) { next(err); }
});

// ── Signals ─────────────────────────────────────────────────────────────────

router.get('/signals', (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 1000;
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const minScore = parseFloat(req.query.min_score) || 0;

    const signals = all(`
      SELECT sig.*, s.name AS source_name, t.title AS video_title, t.video_url
      FROM rse_signals sig
      JOIN rse_sources s ON s.id = sig.source_id
      JOIN rse_transcripts t ON t.id = sig.transcript_id
      WHERE sig.composite_score >= ?
      ORDER BY sig.composite_score DESC, sig.created_at DESC
      LIMIT ? OFFSET ?
    `, [minScore, limit, offset]);

    res.json(signals);
  } catch (err) { next(err); }
});

router.get('/signals/:id', (req, res, next) => {
  try {
    const signal = get(`
      SELECT sig.*, s.name AS source_name, s.channel_url,
             t.title AS video_title, t.video_url, t.word_count, t.transcript_text
      FROM rse_signals sig
      JOIN rse_sources s ON s.id = sig.source_id
      JOIN rse_transcripts t ON t.id = sig.transcript_id
      WHERE sig.id = ?
    `, [req.params.id]);

    if (!signal) return res.status(404).json({ error: 'Signal not found' });

    // Get related spec and campaign
    const spec = get('SELECT * FROM rse_build_specs WHERE signal_id = ?', [req.params.id]);
    const campaign = get('SELECT * FROM rse_campaigns WHERE signal_id = ?', [req.params.id]);
    const patterns = all('SELECT * FROM rse_expert_library WHERE signal_id = ?', [req.params.id]);

    res.json({ ...signal, build_spec: spec, campaign, patterns });
  } catch (err) { next(err); }
});

// ── Build Specs ─────────────────────────────────────────────────────────────

router.get('/build-specs', (req, res, next) => {
  try {
    const status = req.query.status || null;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);

    const where = status ? 'WHERE bs.status = ?' : '';
    const params = status ? [status, limit] : [limit];

    const specs = all(`
      SELECT bs.*, sig.title AS signal_title, sig.composite_score, s.name AS source_name
      FROM rse_build_specs bs
      JOIN rse_signals sig ON sig.id = bs.signal_id
      JOIN rse_sources s ON s.id = sig.source_id
      ${where}
      ORDER BY bs.created_at DESC LIMIT ?
    `, params);

    res.json(specs);
  } catch (err) { next(err); }
});

router.patch('/build-specs/:id', (req, res, next) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'status is required' });
    run('UPDATE rse_build_specs SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', [status, req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Prototypes ──────────────────────────────────────────────────────────────

router.get('/prototypes', (req, res, next) => {
  try {
    const prototypes = all(`
      SELECT p.*, bs.spec_title, bs.problem_statement, bs.revenue_model, bs.spec_type
      FROM opp_prototypes p
      LEFT JOIN rse_build_specs bs ON json_extract(p.code_summary, '$.spec_id') = bs.id
      WHERE p.description LIKE '[RSE]%'
      ORDER BY p.scaffolded_at DESC
    `);

    // Enrich with file listing from disk
    const path = require('path');
    const fs = require('fs');
    const baseDir = path.resolve(process.cwd(), 'data', 'prototypes');

    for (const p of prototypes) {
      const protoDir = path.join(baseDir, p.name);
      p.disk_path = protoDir;
      try {
        if (fs.existsSync(protoDir)) {
          p.files_on_disk = fs.readdirSync(protoDir).filter(f => !f.startsWith('_'));
          p.has_files = true;
        } else {
          p.files_on_disk = [];
          p.has_files = false;
        }
      } catch {
        p.files_on_disk = [];
        p.has_files = false;
      }

      // Parse code_summary for extra info
      try {
        const summary = JSON.parse(p.code_summary || '{}');
        p.qa_passed = summary.qa?.passed;
        p.qa_issues = summary.qa?.issues || [];
        p.file_names = summary.file_names || [];
      } catch {
        p.qa_passed = null;
        p.qa_issues = [];
        p.file_names = [];
      }
    }

    res.json(prototypes);
  } catch (err) { next(err); }
});

// ── Campaigns ───────────────────────────────────────────────────────────────

router.get('/campaigns', (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const campaigns = all(`
      SELECT c.*, sig.title AS signal_title, sig.composite_score, s.name AS source_name
      FROM rse_campaigns c
      LEFT JOIN rse_signals sig ON sig.id = c.signal_id
      LEFT JOIN rse_sources s ON s.id = sig.source_id
      ORDER BY c.created_at DESC LIMIT ?
    `, [limit]);

    res.json(campaigns);
  } catch (err) { next(err); }
});

// ── Expert Library ──────────────────────────────────────────────────────────

router.get('/expert-library', (req, res, next) => {
  try {
    const category = req.query.category || null;
    const search = req.query.search || null;
    const verifiedOnly = req.query.verified === '1';
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);

    let where = 'WHERE 1=1';
    const params = [];

    if (category) { where += ' AND category = ?'; params.push(category); }
    if (verifiedOnly) { where += ' AND verified = 1'; }
    if (search) { where += ' AND (pattern_name LIKE ? OR description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

    params.push(limit);

    const patterns = all(`
      SELECT * FROM rse_expert_library
      ${where}
      ORDER BY verified DESC, times_referenced DESC, created_at DESC
      LIMIT ?
    `, params);

    // Category breakdown
    const categories = all('SELECT category, COUNT(*) AS count FROM rse_expert_library GROUP BY category ORDER BY count DESC');

    res.json({ patterns, categories });
  } catch (err) { next(err); }
});

router.post('/expert-library/:id/verify', (req, res, next) => {
  try {
    const { notes } = req.body;
    const { markPatternVerified } = require('../services/rseExpertLibrary');
    markPatternVerified(req.params.id, notes || 'Manually verified');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Actions — Manual triggers for RSE pipeline ─────────────────────────────

router.post('/actions/scan', async (req, res, next) => {
  try {
    const { discoverNewVideos } = require('../services/rseTranscriptService');
    const result = await discoverNewVideos();
    res.json({ ok: true, ...result });
  } catch (err) { next(err); }
});

router.post('/actions/extract', async (req, res, next) => {
  try {
    const { extractPendingTranscripts } = require('../services/rseTranscriptService');
    const limit = parseInt(req.body.limit) || 10;
    const result = await extractPendingTranscripts(limit);
    res.json({ ok: true, ...result });
  } catch (err) { next(err); }
});

router.post('/actions/score', async (req, res, next) => {
  try {
    const { scoreBatch } = require('../services/rseSignalScorer');
    const limit = parseInt(req.body.limit) || 5;
    const result = await scoreBatch(limit);
    res.json({ ok: true, ...result });
  } catch (err) { next(err); }
});

router.post('/actions/build-code', async (req, res, next) => {
  try {
    const { buildFromSpec, buildBatch } = require('../services/rseCodeBuilder');
    if (req.body.spec_id) {
      const result = await buildFromSpec(parseInt(req.body.spec_id));
      res.json({ ok: true, ...result });
    } else {
      const limit = parseInt(req.body.limit) || 3;
      const result = await buildBatch(limit);
      res.json({ ok: true, ...result });
    }
  } catch (err) { next(err); }
});

router.post('/actions/generate-specs', async (req, res, next) => {
  try {
    const { generateBatch } = require('../services/rseBuildSpecGenerator');
    const limit = parseInt(req.body.limit) || 3;
    const result = await generateBatch(limit);
    res.json({ ok: true, ...result });
  } catch (err) { next(err); }
});

router.post('/actions/build-campaigns', async (req, res, next) => {
  try {
    const { buildBatch } = require('../services/rseCampaignBuilder');
    const limit = parseInt(req.body.limit) || 3;
    const result = await buildBatch(limit);
    res.json({ ok: true, ...result });
  } catch (err) { next(err); }
});

router.post('/actions/extract-patterns', async (req, res, next) => {
  try {
    const { extractBatch } = require('../services/rseExpertLibrary');
    const limit = parseInt(req.body.limit) || 10;
    const minScore = parseFloat(req.body.min_score) || 4.0;
    const result = await extractBatch(limit, minScore);
    res.json({ ok: true, ...result });
  } catch (err) { next(err); }
});

router.post('/actions/queue-campaign/:id', (req, res, next) => {
  try {
    const { queueCampaignExecution } = require('../services/rseCampaignBuilder');
    const result = queueCampaignExecution(parseInt(req.params.id));
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/actions/evaluate', async (req, res, next) => {
  try {
    const { evaluateBatch } = require('../services/rseEvaluator');
    const limit = parseInt(req.body.limit) || 10;
    const result = await evaluateBatch(limit);
    res.json({ ok: true, ...result });
  } catch (err) { next(err); }
});

// ── Evaluations / Ranked Ideas ──────────────────────────────────────────────

router.get('/evaluations', (req, res, next) => {
  try {
    const { getLeaderboard } = require('../services/rseEvaluator');
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const leaderboard = getLeaderboard(limit);
    res.json(leaderboard);
  } catch (err) { next(err); }
});

router.patch('/evaluations/:id', (req, res, next) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'status required' });
    const { updateStatus } = require('../services/rseEvaluator');
    updateStatus(parseInt(req.params.id), status);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Dream Team ──────────────────────────────────────────────────────────────

router.get('/dream-team/scorecards', (req, res, next) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 7, 30);
    const scorecards = all(`
      SELECT * FROM dt_scorecards
      WHERE score_date >= date('now', '-${days} days')
      ORDER BY score_date DESC, composite_score DESC
    `);
    res.json(scorecards);
  } catch (err) { next(err); }
});

router.get('/dream-team/patterns', (req, res, next) => {
  try {
    const status = req.query.status || null;
    const where = status ? `WHERE status = '${status}'` : '';
    const patterns = all(`SELECT * FROM dt_learned_patterns ${where} ORDER BY created_at DESC LIMIT 50`);
    res.json(patterns);
  } catch (err) { next(err); }
});

router.get('/dream-team/reports', (req, res, next) => {
  try {
    const reports = all('SELECT id, report_date, report_text, discord_posted FROM dt_morning_reports ORDER BY report_date DESC LIMIT 7');
    res.json(reports);
  } catch (err) { next(err); }
});

router.get('/dream-team/actions', (req, res, next) => {
  try {
    const actions = all('SELECT * FROM dt_overnight_actions ORDER BY created_at DESC LIMIT 30');
    res.json(actions);
  } catch (err) { next(err); }
});

router.post('/dream-team/run-cycle', async (req, res, next) => {
  try {
    const { runFullCycle } = require('../services/dreamTeamNightly');
    const result = await runFullCycle();
    res.json({ ok: true, ...result });
  } catch (err) { next(err); }
});

// ── Task Board ──────────────────────────────────────────────────────────────

router.post('/evaluations/:id/pick', async (req, res, next) => {
  try {
    const { breakdownIdea } = require('../services/rseTaskManager');
    const { updateStatus } = require('../services/rseEvaluator');
    const evalId = parseInt(req.params.id);
    updateStatus(evalId, 'picked');
    const result = await breakdownIdea(evalId);
    res.json({ ok: true, ...result });
  } catch (err) { next(err); }
});

router.get('/tasks', (req, res, next) => {
  try {
    const { getTaskBoard } = require('../services/rseTaskManager');
    res.json(getTaskBoard());
  } catch (err) { next(err); }
});

router.patch('/tasks/:id', (req, res, next) => {
  try {
    const { status, result_summary } = req.body;
    if (!status) return res.status(400).json({ error: 'status required' });
    const { updateTaskStatus } = require('../services/rseTaskManager');
    updateTaskStatus(parseInt(req.params.id), status, result_summary || null);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
