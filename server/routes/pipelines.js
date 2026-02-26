/**
 * @file pipelines.js
 * @description API routes for agent pipeline management.
 *
 * ENDPOINTS:
 *   GET    /api/pipelines             — List all pipelines
 *   POST   /api/pipelines             — Create a pipeline
 *   GET    /api/pipelines/runs        — Pipeline run history
 *   GET    /api/pipelines/runs/active — List active pipeline runs
 *   GET    /api/pipelines/runs/:runId — Get pipeline run status & steps
 *   GET    /api/pipelines/:id         — Get pipeline details
 *   PUT    /api/pipelines/:id         — Update a pipeline
 *   DELETE /api/pipelines/:id         — Delete a pipeline
 *   POST   /api/pipelines/:id/run     — Start a pipeline run
 *
 * IMPORTANT: /runs/* routes MUST be defined BEFORE /:id routes
 * to prevent Express matching /:id = 'runs'.
 */

const express = require('express');
const router = express.Router();
const { all, get, run } = require('../db/connection');
const { authenticate } = require('../middleware/auth');
const { startPipeline } = require('../services/pipelineRunner');

router.use(authenticate);

// ════════════════════════════════════════════════════════════════════════════
// PIPELINE RUN ROUTES — must come BEFORE /:id to avoid conflicts
// ════════════════════════════════════════════════════════════════════════════

// ── Pipeline run history ────────────────────────────────────────────────────
router.get('/runs', (_req, res) => {
  try {
    const runs = all(
      `SELECT pr.*, p.name as pipeline_name, p.domain
       FROM pipeline_runs pr
       JOIN agent_pipelines p ON pr.pipeline_id = p.id
       ORDER BY pr.started_at DESC
       LIMIT 50`
    );
    res.json({ success: true, runs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── List active pipeline runs ───────────────────────────────────────────────
router.get('/runs/active', (_req, res) => {
  try {
    const runs = all(
      `SELECT pr.*, p.name as pipeline_name, p.domain
       FROM pipeline_runs pr
       JOIN agent_pipelines p ON pr.pipeline_id = p.id
       WHERE pr.status IN ('running', 'paused')
       ORDER BY pr.started_at DESC`
    );
    res.json({ success: true, runs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Get pipeline run details ────────────────────────────────────────────────
router.get('/runs/:runId', (req, res) => {
  try {
    const pipelineRun = get(
      `SELECT pr.*, p.name as pipeline_name, p.domain, p.steps as pipeline_steps
       FROM pipeline_runs pr
       JOIN agent_pipelines p ON pr.pipeline_id = p.id
       WHERE pr.id = ?`,
      [req.params.runId]
    );

    if (!pipelineRun) return res.status(404).json({ success: false, error: 'Pipeline run not found' });

    pipelineRun.pipeline_steps = JSON.parse(pipelineRun.pipeline_steps || '[]');

    const steps = all(
      `SELECT * FROM pipeline_run_steps WHERE pipeline_run_id = ? ORDER BY step_index`,
      [req.params.runId]
    );

    res.json({ success: true, run: pipelineRun, steps });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// PIPELINE CRUD ROUTES
// ════════════════════════════════════════════════════════════════════════════

// ── List all pipelines ──────────────────────────────────────────────────────
router.get('/', (_req, res) => {
  try {
    const pipelines = all(
      `SELECT p.*,
        (SELECT COUNT(*) FROM pipeline_runs pr WHERE pr.pipeline_id = p.id) as total_runs,
        (SELECT COUNT(*) FROM pipeline_runs pr WHERE pr.pipeline_id = p.id AND pr.status = 'completed') as successful_runs,
        (SELECT MAX(pr.started_at) FROM pipeline_runs pr WHERE pr.pipeline_id = p.id) as last_run_at
       FROM agent_pipelines p ORDER BY p.domain, p.name`
    );

    const result = pipelines.map(p => ({
      ...p,
      steps: JSON.parse(p.steps || '[]'),
    }));

    res.json({ success: true, pipelines: result });
  } catch (err) {
    console.error('[Pipelines] List error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Create pipeline ─────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  try {
    const { name, description, domain, steps } = req.body;
    if (!name || !steps || !Array.isArray(steps) || steps.length === 0) {
      return res.status(400).json({ success: false, error: 'name and steps[] are required' });
    }

    for (const step of steps) {
      if (!step.agent_name) {
        return res.status(400).json({ success: false, error: 'Each step must have agent_name' });
      }
    }

    run(
      `INSERT INTO agent_pipelines (name, description, domain, steps) VALUES (?, ?, ?, ?)`,
      [name, description || '', domain || null, JSON.stringify(steps)]
    );

    const pipeline = get('SELECT * FROM agent_pipelines WHERE name = ?', [name]);
    pipeline.steps = JSON.parse(pipeline.steps);

    res.json({ success: true, pipeline });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Get pipeline details ────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  try {
    const pipeline = get('SELECT * FROM agent_pipelines WHERE id = ?', [req.params.id]);
    if (!pipeline) return res.status(404).json({ success: false, error: 'Pipeline not found' });

    pipeline.steps = JSON.parse(pipeline.steps || '[]');

    const runs = all(
      `SELECT * FROM pipeline_runs WHERE pipeline_id = ? ORDER BY started_at DESC LIMIT 10`,
      [req.params.id]
    );

    res.json({ success: true, pipeline, runs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Update pipeline ─────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  try {
    const { name, description, domain, steps, is_active } = req.body;
    const existing = get('SELECT * FROM agent_pipelines WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, error: 'Pipeline not found' });

    run(
      `UPDATE agent_pipelines SET name = ?, description = ?, domain = ?, steps = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?`,
      [
        name || existing.name,
        description !== undefined ? description : existing.description,
        domain !== undefined ? domain : existing.domain,
        steps ? JSON.stringify(steps) : existing.steps,
        is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active,
        req.params.id,
      ]
    );

    const pipeline = get('SELECT * FROM agent_pipelines WHERE id = ?', [req.params.id]);
    pipeline.steps = JSON.parse(pipeline.steps);
    res.json({ success: true, pipeline });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Delete pipeline ─────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  try {
    const existing = get('SELECT * FROM agent_pipelines WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, error: 'Pipeline not found' });

    run('DELETE FROM agent_pipelines WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: `Pipeline "${existing.name}" deleted` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Start a pipeline run ────────────────────────────────────────────────────
router.post('/:id/run', (req, res) => {
  try {
    const { context } = req.body;
    const result = startPipeline(parseInt(req.params.id, 10), {
      triggerType: 'manual',
      initialContext: context || {},
    });

    if (!result) {
      return res.status(400).json({ success: false, error: 'Failed to start pipeline (not found or inactive)' });
    }

    res.json({
      success: true,
      pipelineRunId: result.pipelineRunId,
      firstRunId: result.firstRunId,
      message: 'Pipeline started',
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
