/**
 * Kalshi Auto-Trader API Routes
 * Monitoring, control, and status endpoints.
 */

import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../middleware/auth';
import type { KalshiScheduler } from '../../engine/kalshi/kalshi-scheduler';

const router = Router();
router.use(authenticateJWT);

let kalshiScheduler: KalshiScheduler | null = null;

export function setKalshiScheduler(scheduler: KalshiScheduler): void {
  kalshiScheduler = scheduler;
}

// ============================================================================
// STATUS
// ============================================================================

router.get('/status', (_req: Request, res: Response) => {
  if (!kalshiScheduler) {
    return res.json({ configured: false, running: false, message: 'Kalshi auto-trader not initialized' });
  }

  const status = kalshiScheduler.getStatus();
  return res.json({
    configured: true,
    ...status,
    balanceDollars: (status.balanceCents / 100).toFixed(2),
    totalPnlDollars: (status.totalPnlCents / 100).toFixed(2),
    dailyPnlDollars: (status.dailyPnlCents / 100).toFixed(2),
  });
});

// ============================================================================
// POSITIONS
// ============================================================================

router.get('/positions', (_req: Request, res: Response) => {
  if (!kalshiScheduler) {
    return res.json({ positions: [] });
  }

  const tracker = kalshiScheduler.getPositionTracker();
  const positions = tracker.getPositions().map((p) => ({
    ...p,
    entryPriceDollars: (p.entryPriceCents / 100).toFixed(2),
    currentPriceDollars: (p.currentPriceCents / 100).toFixed(2),
    costBasisDollars: (p.costBasisCents / 100).toFixed(2),
    currentValueDollars: (p.currentValueCents / 100).toFixed(2),
    unrealizedPnlDollars: (p.unrealizedPnlCents / 100).toFixed(2),
    unrealizedPnlPctStr: (p.unrealizedPnlPct * 100).toFixed(1) + '%',
  }));

  return res.json({ positions, count: positions.length });
});

// ============================================================================
// PERFORMANCE
// ============================================================================

router.get('/performance', (_req: Request, res: Response) => {
  if (!kalshiScheduler) {
    return res.json({ error: 'Not initialized' });
  }

  const tracker = kalshiScheduler.getPositionTracker();
  const perf = tracker.getPerformance();

  return res.json({
    ...perf,
    totalPnlDollars: (perf.totalPnlCents / 100).toFixed(2),
    realizedPnlDollars: (perf.realizedPnlCents / 100).toFixed(2),
    unrealizedPnlDollars: (perf.unrealizedPnlCents / 100).toFixed(2),
    bestTradeDollars: (perf.bestTradeCents / 100).toFixed(2),
    worstTradeDollars: (perf.worstTradeCents / 100).toFixed(2),
    winRateStr: perf.winRate.toFixed(1) + '%',
  });
});

// ============================================================================
// SIGNALS (from last scan)
// ============================================================================

router.get('/signals', (_req: Request, res: Response) => {
  if (!kalshiScheduler) {
    return res.json({ signals: [] });
  }

  const signalGen = kalshiScheduler.getSignalGenerator();
  const signals = signalGen.getLastSignals().map((s) => ({
    ...s,
    priceDollars: (s.priceCents / 100).toFixed(2),
  }));

  return res.json({ signals, count: signals.length });
});

// ============================================================================
// TRACKED MARKETS
// ============================================================================

router.get('/markets', (_req: Request, res: Response) => {
  if (!kalshiScheduler) {
    return res.json({ markets: [] });
  }

  const signalGen = kalshiScheduler.getSignalGenerator();
  const markets = signalGen.getTrackedMarkets().map((m: any) => ({
    ticker: m.ticker,
    title: m.title,
    status: m.status,
    yesBidCents: m._yesBidCents,
    yesAskCents: m._yesAskCents,
    spreadCents: m._spread,
    volume24h: m._vol24h,
    openInterest: m._oi,
    expirationTime: m.expiration_time,
  }));

  return res.json({ markets, count: markets.length });
});

// ============================================================================
// BALANCE
// ============================================================================

router.get('/balance', async (_req: Request, res: Response) => {
  const status = kalshiScheduler?.getStatus();
  if (!status) {
    return res.json({ error: 'Not initialized' });
  }
  return res.json({
    balanceCents: status.balanceCents,
    balanceDollars: (status.balanceCents / 100).toFixed(2),
  });
});

// ============================================================================
// TRADE HISTORY
// ============================================================================

router.get('/history', (_req: Request, res: Response) => {
  if (!kalshiScheduler) {
    return res.json({ trades: [] });
  }

  const tracker = kalshiScheduler.getPositionTracker();
  const trades = tracker.getClosedTrades().map((t) => ({
    ...t,
    entryPriceDollars: (t.entryPriceCents / 100).toFixed(2),
    exitPriceDollars: (t.exitPriceCents / 100).toFixed(2),
    pnlDollars: (t.pnlCents / 100).toFixed(2),
    returnPctStr: (t.returnPct * 100).toFixed(1) + '%',
  }));

  return res.json({ trades: trades.reverse(), count: trades.length });
});

// ============================================================================
// CONFIG
// ============================================================================

router.get('/config', (_req: Request, res: Response) => {
  if (!kalshiScheduler) {
    return res.json({ error: 'Not initialized' });
  }
  return res.json(kalshiScheduler.getConfig());
});

// ============================================================================
// CONTROL: START / STOP
// ============================================================================

router.post('/start', async (_req: Request, res: Response) => {
  if (!kalshiScheduler) {
    return res.status(503).json({ error: 'Kalshi auto-trader not configured' });
  }
  if (kalshiScheduler.isActive()) {
    return res.json({ message: 'Already running' });
  }
  await kalshiScheduler.start();
  return res.json({ message: 'Kalshi auto-trader started', status: kalshiScheduler.getStatus() });
});

router.post('/stop', (_req: Request, res: Response) => {
  if (!kalshiScheduler) {
    return res.status(503).json({ error: 'Kalshi auto-trader not configured' });
  }
  kalshiScheduler.stop();
  return res.json({ message: 'Kalshi auto-trader stopped', status: kalshiScheduler.getStatus() });
});

export default router;
