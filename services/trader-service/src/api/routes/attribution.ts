// =============================================================================
// Attribution API — Regime, candidates, decisions, and performance attribution
// =============================================================================

import { Router, Request, Response } from 'express';
import { getAttributionStore, getBrain, getCapitalAllocator } from '../../singletons';
import { SourceProfiler } from '../../engine/learning/source-profiles';
import { ConfidenceCalibrator } from '../../engine/learning/confidence-calibrator';
import { BookManager } from '../../engine/allocation/book-manager';
import { StrategyRoleRegistry, StrategyRole } from '../../engine/allocation/strategy-roles';

const router = Router();

// ── Regime ──────────────────────────────────────────────────────────────────

router.get('/regime/current', (req: Request, res: Response) => {
  const store = getAttributionStore();
  if (!store) return res.status(503).json({ error: 'Attribution store not available' });

  const regime = store.getLatestRegime();
  res.json(regime || { label: 'unknown', message: 'No regime data yet' });
});

router.get('/regime/history', (req: Request, res: Response) => {
  const store = getAttributionStore();
  if (!store) return res.status(503).json({ error: 'Attribution store not available' });

  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  res.json(store.getRegimeHistory(limit));
});

// ── Candidates ──────────────────────────────────────────────────────────────

router.get('/candidates/recent', (req: Request, res: Response) => {
  const store = getAttributionStore();
  if (!store) return res.status(503).json({ error: 'Attribution store not available' });

  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  res.json(store.getRecentCandidates(limit));
});

// ── Decisions ───────────────────────────────────────────────────────────────

router.get('/decisions/recent', (req: Request, res: Response) => {
  const store = getAttributionStore();
  if (!store) return res.status(503).json({ error: 'Attribution store not available' });

  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const action = req.query.action as string | undefined;
  res.json(store.getRecentDecisions(limit, action));
});

// ── Performance Attribution by Dimension ────────────────────────────────────

router.get('/by-strategy', (req: Request, res: Response) => {
  const store = getAttributionStore();
  if (!store) return res.status(503).json({ error: 'Attribution store not available' });

  const days = Math.min(parseInt(req.query.days as string) || 30, 365);
  res.json(store.getAttributionSummary('strategy', days));
});

router.get('/by-analyst', (req: Request, res: Response) => {
  const store = getAttributionStore();
  if (!store) return res.status(503).json({ error: 'Attribution store not available' });

  const days = Math.min(parseInt(req.query.days as string) || 30, 365);
  res.json(store.getAttributionSummary('analyst', days));
});

router.get('/by-symbol', (req: Request, res: Response) => {
  const store = getAttributionStore();
  if (!store) return res.status(503).json({ error: 'Attribution store not available' });

  const days = Math.min(parseInt(req.query.days as string) || 30, 365);
  res.json(store.getAttributionSummary('symbol', days));
});

router.get('/by-setup', (req: Request, res: Response) => {
  const store = getAttributionStore();
  if (!store) return res.status(503).json({ error: 'Attribution store not available' });

  const days = Math.min(parseInt(req.query.days as string) || 30, 365);
  res.json(store.getAttributionSummary('setup', days));
});

router.get('/by-regime', (req: Request, res: Response) => {
  const store = getAttributionStore();
  if (!store) return res.status(503).json({ error: 'Attribution store not available' });

  const days = Math.min(parseInt(req.query.days as string) || 30, 365);
  res.json(store.getAttributionSummary('regime', days));
});

// ── Detailed attribution for a specific dimension value ─────────────────────

router.get('/detail/:dimension/:value', (req: Request, res: Response) => {
  const store = getAttributionStore();
  if (!store) return res.status(503).json({ error: 'Attribution store not available' });

  const { dimension, value } = req.params;
  const days = Math.min(parseInt(req.query.days as string) || 30, 365);
  res.json(store.getAttributionForValue(dimension, value, days));
});

// ── Source Profiles (Sprint 3) ───────────────────────────────────────────────

router.get('/source-profiles', (req: Request, res: Response) => {
  const store = getAttributionStore();
  const brain = getBrain();
  if (!store || !brain) return res.status(503).json({ error: 'Not available' });

  try {
    const profiler = new SourceProfiler(brain.getDatabase(), store);
    res.json(profiler.getAllProfiles());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/source-profiles/:sourceId', (req: Request, res: Response) => {
  const store = getAttributionStore();
  const brain = getBrain();
  if (!store || !brain) return res.status(503).json({ error: 'Not available' });

  try {
    const profiler = new SourceProfiler(brain.getDatabase(), store);
    const profile = profiler.getProfile(req.params.sourceId);
    res.json(profile);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/calibration/:analystId', (req: Request, res: Response) => {
  const brain = getBrain();
  if (!brain) return res.status(503).json({ error: 'Brain not available' });

  try {
    const calibrator = new ConfidenceCalibrator(brain.getDatabase());
    const report = calibrator.calibrate(req.params.analystId);
    res.json(report);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Trading Books (Sprint 4) ────────────────────────────────────────────────

router.get('/books', (req: Request, res: Response) => {
  const brain = getBrain();
  const store = getAttributionStore();
  if (!brain || !store) return res.status(503).json({ error: 'Not available' });

  try {
    const bookManager = new BookManager(brain.getDatabase());
    // Estimate account value from last portfolio snapshot
    const snapshot = brain.getDatabase().prepare(
      'SELECT portfolio_value FROM portfolio_snapshots ORDER BY created_at DESC LIMIT 1'
    ).get() as any;
    const accountValue = snapshot?.portfolio_value || 500;
    res.json(bookManager.getBookSummaries(accountValue));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/books/:bookId', (req: Request, res: Response) => {
  const brain = getBrain();
  if (!brain) return res.status(503).json({ error: 'Not available' });

  try {
    const bookManager = new BookManager(brain.getDatabase());
    const positions = brain.getDatabase().prepare(
      'SELECT * FROM book_positions WHERE book_id = ? ORDER BY status, opened_at DESC'
    ).all(req.params.bookId);
    const config = bookManager.getBook(req.params.bookId as any);
    res.json({ config, positions });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Strategy Roles (Sprint 4) ───────────────────────────────────────────────

router.get('/strategy-roles', (req: Request, res: Response) => {
  const brain = getBrain();
  if (!brain) return res.status(503).json({ error: 'Not available' });

  try {
    const registry = new StrategyRoleRegistry(brain.getDatabase());
    res.json(registry.getAllRoles());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/strategy-roles/:sourceId', (req: Request, res: Response) => {
  const brain = getBrain();
  if (!brain) return res.status(503).json({ error: 'Not available' });

  const { role } = req.body;
  const validRoles: StrategyRole[] = ['primary_alpha', 'filter', 'research', 'disabled'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
  }

  try {
    const registry = new StrategyRoleRegistry(brain.getDatabase());
    registry.setRole(req.params.sourceId, role);
    res.json({ sourceId: req.params.sourceId, role, updated: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
