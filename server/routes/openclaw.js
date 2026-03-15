/**
 * @file openclaw.js (routes)
 * @description OpenClaw system management — backup, approvals, memory search.
 *
 * ENDPOINTS:
 *   POST /api/openclaw/backup            — Create a new openclaw backup
 *   GET  /api/openclaw/backup/status     — Last backup info + file list
 *   GET  /api/openclaw/approvals         — Pending approvals queue from OpenClaw
 *   GET  /api/openclaw/memory/search     — Search openclaw memory index
 *   GET  /api/openclaw/memory/status     — Memory index stats
 */

'use strict';

const { Router } = require('express');
const { execSync, exec } = require('child_process');
const { authenticate } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');

const router = Router();
router.use(authenticate);

// ── Helpers ──────────────────────────────────────────────────────────────────

function runCli(cmd, timeoutMs = 15000) {
  try {
    return {
      ok: true,
      output: execSync(cmd, { timeout: timeoutMs, encoding: 'utf-8', shell: true }).trim(),
    };
  } catch (err) {
    return {
      ok: false,
      error: err.message,
      output: (err.stdout || '').trim(),
    };
  }
}

function getBackupDir() {
  return path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'backups');
}

function listBackupFiles() {
  const dir = getBackupDir();
  try {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.tar.gz') || f.endsWith('.zip') || f.endsWith('.bak'))
      .map(f => {
        const fullPath = path.join(dir, f);
        const stat = fs.statSync(fullPath);
        return {
          name: f,
          path: fullPath,
          size_kb: Math.round(stat.size / 1024),
          created_at: stat.birthtime.toISOString(),
          modified_at: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.modified_at) - new Date(a.modified_at));
  } catch {
    return [];
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /api/openclaw/backup
 * Triggers `openclaw backup create` and returns result.
 */
router.post('/backup', async (req, res, next) => {
  try {
    const label = req.body?.label || `console-${new Date().toISOString().slice(0, 10)}`;
    const result = runCli(`openclaw backup create --label "${label}"`, 30000);

    const files = listBackupFiles();
    const newest = files[0] || null;

    res.json({
      success: result.ok,
      label,
      output: result.output || result.error || '',
      latest_backup: newest,
      backup_count: files.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/openclaw/backup/status
 * Returns last backup timestamp, file list, and verification status.
 */
router.get('/backup/status', (req, res, next) => {
  try {
    const files = listBackupFiles();
    const newest = files[0] || null;

    // Check config file directly for last-modified time as a secondary indicator
    const configPath = path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'openclaw.json');
    let configModified = null;
    try {
      configModified = fs.statSync(configPath).mtime.toISOString();
    } catch {}

    // Try openclaw backup list (best effort — not all versions support it)
    let cliList = null;
    const listResult = runCli('openclaw backup list --json', 5000);
    if (listResult.ok && listResult.output) {
      try { cliList = JSON.parse(listResult.output); } catch {}
    }

    const daysSinceBackup = newest
      ? Math.floor((Date.now() - new Date(newest.modified_at).getTime()) / 86400000)
      : null;

    res.json({
      status: newest
        ? (daysSinceBackup <= 1 ? 'recent' : daysSinceBackup <= 7 ? 'ok' : 'stale')
        : 'never',
      latest_backup: newest,
      backup_count: files.length,
      days_since_backup: daysSinceBackup,
      all_backups: files.slice(0, 10),
      config_last_modified: configModified,
      cli_list: cliList,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/openclaw/approvals
 * Returns pending approvals from the OpenClaw exec approval queue.
 */
router.get('/approvals', (req, res, next) => {
  try {
    const result = runCli('openclaw approvals list --json', 8000);

    let approvals = [];
    if (result.ok && result.output) {
      try {
        const parsed = JSON.parse(result.output);
        approvals = Array.isArray(parsed) ? parsed : (parsed.approvals || parsed.items || []);
      } catch {
        // CLI output is text — extract count from it
        const countMatch = result.output.match(/(\d+)\s+pending/i);
        approvals = countMatch ? Array(parseInt(countMatch[1])).fill({ status: 'pending', parsed: false }) : [];
      }
    }

    res.json({
      pending_count: approvals.length,
      approvals,
      cli_available: result.ok || !result.error?.includes('not found'),
      raw_output: result.ok ? null : (result.output || result.error),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/openclaw/memory/search?q=<query>&limit=20
 * Searches the openclaw memory index.
 */
router.get('/memory/search', (req, res, next) => {
  try {
    const { q, limit = 20 } = req.query;
    if (!q || !q.trim()) {
      return res.status(400).json({ error: 'Query parameter q is required' });
    }

    const safeQ = q.replace(/["`\\]/g, '').slice(0, 200);
    const result = runCli(`openclaw memory search "${safeQ}" --limit ${parseInt(limit) || 20} --json`, 10000);

    let results = [];
    let total = 0;
    if (result.ok && result.output) {
      try {
        const parsed = JSON.parse(result.output);
        results = Array.isArray(parsed) ? parsed : (parsed.results || parsed.items || []);
        total = parsed.total || results.length;
      } catch {
        // Plain text output — wrap each line
        results = result.output.split('\n').filter(Boolean).map((line, i) => ({
          id: i,
          content: line,
          score: null,
        }));
        total = results.length;
      }
    }

    res.json({
      query: q,
      results,
      total,
      limit: parseInt(limit) || 20,
      cli_ok: result.ok,
      raw_error: result.ok ? null : (result.error || result.output),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/openclaw/memory/status
 * Memory index stats — total entries, last indexed, etc.
 */
router.get('/memory/status', (req, res, next) => {
  try {
    const result = runCli('openclaw memory status --json', 8000);

    let stats = null;
    if (result.ok && result.output) {
      try { stats = JSON.parse(result.output); } catch {}
    }

    // Fallback: check memory directory
    const memDir = path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'memory');
    let dirStats = null;
    try {
      if (fs.existsSync(memDir)) {
        const files = fs.readdirSync(memDir);
        dirStats = { file_count: files.length, path: memDir };
      }
    } catch {}

    res.json({
      status: result.ok ? 'available' : 'unavailable',
      stats: stats || dirStats || {},
      cli_output: result.ok ? result.output : null,
      cli_error: result.ok ? null : result.error,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/openclaw/ollama/status
 * Check if local Ollama is reachable and list loaded models.
 */
router.get('/ollama/status', async (req, res, next) => {
  try {
    const { ping } = require('../services/ollamaBridge');
    const result = await ping();
    res.json({
      available: result.ok,
      models: result.models || [],
      host: process.env.OLLAMA_HOST || 'localhost',
      port: process.env.OLLAMA_PORT || 11434,
    });
  } catch (err) {
    res.json({ available: false, models: [], error: err.message });
  }
});

module.exports = router;
