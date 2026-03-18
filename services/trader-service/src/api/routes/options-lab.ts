/**
 * Options Lab API — Paper options positions driven by Kalshi prediction market signals.
 * These are real Alpaca paper trades (not simulated) — proving the strategy before going live.
 */

import { Router } from 'express';
import type { KalshiScheduler } from '../../engine/kalshi/kalshi-scheduler';

const router = Router();
let scheduler: KalshiScheduler | null = null;

export function setOptionsLabScheduler(s: KalshiScheduler) {
  scheduler = s;
}

// GET /api/options-lab/status
router.get('/status', (_req, res) => {
  if (!scheduler) {
    return res.json({ enabled: false, message: 'Options lab not initialized' });
  }
  const engine = scheduler.getOptionsEngine();
  const strat = engine.kalshiSignalCalls;
  const stats = strat.getStats();
  res.json({
    enabled: true,
    mode: 'paper',
    description: 'Kalshi prediction market signals → SPY/QQQ call options (paper)',
    openPositions: stats.openPositions,
    totalTrades: stats.totalTrades,
    totalPnlDollars: stats.totalPnlDollars,
    winRate: stats.winRate,
    avgReturn: stats.avgReturn,
    bestTrade: stats.bestTrade,
    worstTrade: stats.worstTrade,
  });
});

// GET /api/options-lab/positions
router.get('/positions', (_req, res) => {
  if (!scheduler) return res.json({ positions: [], count: 0 });
  const strat = scheduler.getOptionsEngine().kalshiSignalCalls;
  const positions = strat.getOpenPositions().map(p => ({
    ...p,
    entryPriceDollars: `$${(p.entryPrice).toFixed(2)}`,
    premiumPaid: `$${(p.entryPrice * p.qty * 100).toFixed(0)}`,
    entryDate: p.entryDate,
    daysToExpiry: p.daysToExpiry,
  }));
  res.json({ positions, count: positions.length });
});

// GET /api/options-lab/history
router.get('/history', (_req, res) => {
  if (!scheduler) return res.json({ trades: [], count: 0 });
  const strat = scheduler.getOptionsEngine().kalshiSignalCalls;
  const trades = strat.getClosedTrades().map(t => ({
    ...t,
    pnlFormatted: t.pnlDollars != null
      ? `${t.pnlDollars >= 0 ? '+' : ''}$${t.pnlDollars.toFixed(2)}`
      : '--',
    returnFormatted: t.pnlPct != null
      ? `${t.pnlPct >= 0 ? '+' : ''}${(t.pnlPct * 100).toFixed(1)}%`
      : '--',
  }));
  res.json({ trades, count: trades.length });
});

export default router;
