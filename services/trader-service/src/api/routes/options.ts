/**
 * Options API — Performance tracking and status for all options strategies
 *
 * GET /api/options/status              → engine status + active positions
 * GET /api/options/performance         → P&L per strategy (the scoreboard)
 * GET /api/options/trades/recent       → last 20 trades with details
 * GET /api/options/trades/open         → all open positions
 * GET /api/options/daily               → daily P&L summary
 * GET /api/options/total               → total P&L across everything
 */

import { Router, Request, Response } from 'express';

const router = Router();

// These get set by server.ts after initialization
let _tracker: any = null;
let _engine: any = null;

export function setOptionsTracker(tracker: any) { _tracker = tracker; }
export function setOptionsEngine(engine: any) { _engine = engine; }

// GET /api/options/status
router.get('/status', (_req: Request, res: Response) => {
  if (!_engine) return res.json({ enabled: false, message: 'Options engine not initialized' });

  res.json({
    ...(_engine.getStatus()),
    timestamp: new Date().toISOString(),
  });
});

// GET /api/options/performance — THE SCOREBOARD
router.get('/performance', (_req: Request, res: Response) => {
  if (!_tracker) return res.json({ error: 'Options tracker not initialized' });

  const performance = _tracker.getStrategyPerformance();
  const total = _tracker.getTotalPnl();

  res.json({
    total,
    byStrategy: performance,
    timestamp: new Date().toISOString(),
  });
});

// GET /api/options/performance/:strategy
router.get('/performance/:strategy', (req: Request, res: Response) => {
  if (!_tracker) return res.json({ error: 'Options tracker not initialized' });

  const performance = _tracker.getStrategyPerformance(req.params.strategy);
  res.json(performance[0] || { error: 'Strategy not found' });
});

// GET /api/options/trades/recent
router.get('/trades/recent', (req: Request, res: Response) => {
  if (!_tracker) return res.json({ error: 'Options tracker not initialized' });

  const limit = parseInt(req.query.limit as string) || 20;
  res.json(_tracker.getRecentTrades(limit));
});

// GET /api/options/trades/open
router.get('/trades/open', (_req: Request, res: Response) => {
  if (!_tracker) return res.json({ error: 'Options tracker not initialized' });

  res.json(_tracker.getOpenPositions());
});

// GET /api/options/daily
router.get('/daily', (req: Request, res: Response) => {
  if (!_tracker) return res.json({ error: 'Options tracker not initialized' });

  const days = parseInt(req.query.days as string) || 30;
  res.json(_tracker.getDailySummary(days));
});

// GET /api/options/total
router.get('/total', (_req: Request, res: Response) => {
  if (!_tracker) return res.json({ error: 'Options tracker not initialized' });

  res.json(_tracker.getTotalPnl());
});

export default router;
