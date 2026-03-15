// =============================================================================
// Performance API — "Is This Working?" metrics
// =============================================================================
// GET /api/performance/summary   — verdict banner (green/yellow/red)
// GET /api/performance/trades    — full trade history from brain episodes
// GET /api/performance/drawdown  — drawdown series for charting
// GET /api/performance/daily     — daily returns for Sharpe calculation
// =============================================================================

import { Router, Request, Response } from 'express';
import { getBrain, getExecStore } from '../../singletons';

const router = Router();

// ─── Summary (Verdict Banner) ───────────────────────────────────────────────

router.get('/summary', (_req: Request, res: Response) => {
  try {
    const brain = getBrain();
    const exec = getExecStore();

    // Get episodes (closed trades)
    const episodes = brain?.getAllEpisodes?.() ||
      (brain as any)?.db?.prepare?.('SELECT * FROM brain_episodes ORDER BY created_at DESC')?.all() || [];

    // Get portfolio snapshots for equity curve
    const snapshots = (brain as any)?.db?.prepare?.(
      "SELECT portfolio_value, created_at FROM portfolio_snapshots ORDER BY created_at ASC"
    )?.all() || [];

    // Calculate trade metrics
    const totalTrades = episodes.length;
    const wins = episodes.filter((e: any) => (e.outcome_score || 0) > 0).length;
    const losses = totalTrades - wins;
    const winRate = totalTrades > 0 ? wins / totalTrades : 0;

    const totalPnl = episodes.reduce((sum: number, e: any) => sum + (e.pnl_dollars || 0), 0);
    const winningTrades = episodes.filter((e: any) => (e.pnl_dollars || 0) > 0);
    const losingTrades = episodes.filter((e: any) => (e.pnl_dollars || 0) < 0);

    const avgWin = winningTrades.length > 0
      ? winningTrades.reduce((s: number, e: any) => s + e.pnl_dollars, 0) / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0
      ? losingTrades.reduce((s: number, e: any) => s + e.pnl_dollars, 0) / losingTrades.length : 0;

    const profitFactor = Math.abs(avgLoss) > 0
      ? winningTrades.reduce((s: number, e: any) => s + e.pnl_dollars, 0) / Math.abs(losingTrades.reduce((s: number, e: any) => s + e.pnl_dollars, 0))
      : winningTrades.length > 0 ? Infinity : 0;

    const avgHoldDays = totalTrades > 0
      ? episodes.reduce((s: number, e: any) => s + (e.hold_days || 0), 0) / totalTrades : 0;

    // Best and worst trades
    const sorted = [...episodes].sort((a: any, b: any) => (b.pnl_dollars || 0) - (a.pnl_dollars || 0));
    const bestTrade = sorted.length > 0 ? { symbol: sorted[0].symbol, pnl: sorted[0].pnl_dollars || 0 } : null;
    const worstTrade = sorted.length > 0 ? { symbol: sorted[sorted.length - 1].symbol, pnl: sorted[sorted.length - 1].pnl_dollars || 0 } : null;

    // Calculate daily returns from snapshots for Sharpe
    const dailyReturns = calculateDailyReturns(snapshots);
    const sharpeRatio = calculateSharpe(dailyReturns);
    const sortinoRatio = calculateSortino(dailyReturns);

    // Max drawdown from snapshots
    const { maxDrawdownPercent, maxDrawdownDollars } = calculateMaxDrawdown(snapshots);

    // Starting/current balance
    const startingBalance = snapshots.length > 0 ? snapshots[0].portfolio_value : 0;
    const currentBalance = snapshots.length > 0 ? snapshots[snapshots.length - 1].portfolio_value : 0;
    const totalPnlPercent = startingBalance > 0 ? ((currentBalance - startingBalance) / startingBalance) * 100 : 0;

    // Verdict logic
    let verdict: 'green' | 'yellow' | 'red' = 'yellow';
    let verdictText = '';

    if (totalTrades < 5) {
      verdict = 'yellow';
      verdictText = `Warming up — ${totalTrades} trade${totalTrades !== 1 ? 's' : ''} so far. Need 20+ for a real signal.`;
    } else if (totalTrades < 20) {
      verdict = 'yellow';
      verdictText = `Learning phase — ${totalTrades} trades, ${(winRate * 100).toFixed(0)}% win rate. Early data.`;
    } else if (sharpeRatio > 1.0 && maxDrawdownPercent > -5 && winRate > 0.5) {
      verdict = 'green';
      verdictText = `Profitable edge detected — Sharpe ${sharpeRatio.toFixed(2)}, ${(winRate * 100).toFixed(0)}% wins, ${maxDrawdownPercent.toFixed(1)}% max DD.`;
    } else if (sharpeRatio < 0 || maxDrawdownPercent < -15 || winRate < 0.3) {
      verdict = 'red';
      verdictText = `Underperforming — ${sharpeRatio < 0 ? 'negative Sharpe' : maxDrawdownPercent < -15 ? 'deep drawdown' : 'low win rate'}. Review strategies.`;
    } else {
      verdict = 'yellow';
      verdictText = `Mixed signals — Sharpe ${sharpeRatio.toFixed(2)}, ${(winRate * 100).toFixed(0)}% wins. Needs more data.`;
    }

    // Order counts from ExecStore
    const orderCount = exec?.getOrderHistory(1000)?.length || 0;

    res.json({
      totalPnl,
      totalPnlPercent,
      startingBalance,
      currentBalance,
      winRate,
      totalTrades,
      wins,
      losses,
      sharpeRatio,
      sortinoRatio,
      maxDrawdownPercent,
      maxDrawdownDollars,
      profitFactor,
      avgWin,
      avgLoss,
      avgHoldDays,
      bestTrade,
      worstTrade,
      verdict,
      verdictText,
      ordersPlaced: orderCount,
      snapshotCount: snapshots.length,
      daysTracked: dailyReturns.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Trade History ──────────────────────────────────────────────────────────

router.get('/trades', (req: Request, res: Response) => {
  try {
    const brain = getBrain();
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);

    const episodes = (brain as any)?.db?.prepare?.(
      'SELECT * FROM brain_episodes ORDER BY created_at DESC LIMIT ?'
    )?.all(limit) || [];

    const trades = episodes.map((e: any) => ({
      id: e.id,
      symbol: e.symbol,
      side: e.side,
      analyst: e.analyst_id,
      strategyId: e.strategy_id,
      conviction: e.conviction,
      entryPrice: e.entry_price,
      exitPrice: e.exit_price,
      pnlDollars: e.pnl_dollars,
      pnlPercent: e.pnl_percent,
      holdDays: e.hold_days,
      outcomeType: e.outcome_type,
      outcomeScore: e.outcome_score,
      thesis: e.thesis,
      marketContext: e.market_context,
      opportunityType: e.opportunity_type,
      date: e.created_at,
    }));

    res.json({ trades, count: trades.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Drawdown Series ────────────────────────────────────────────────────────

router.get('/drawdown', (_req: Request, res: Response) => {
  try {
    const brain = getBrain();
    const snapshots = (brain as any)?.db?.prepare?.(
      "SELECT portfolio_value, created_at FROM portfolio_snapshots ORDER BY created_at ASC"
    )?.all() || [];

    let peak = 0;
    const series = snapshots.map((s: any) => {
      if (s.portfolio_value > peak) peak = s.portfolio_value;
      const drawdown = peak > 0 ? ((s.portfolio_value - peak) / peak) * 100 : 0;
      return { date: s.created_at, value: s.portfolio_value, peak, drawdownPercent: drawdown };
    });

    // Thin out to daily (take last snapshot per day)
    const daily = new Map<string, any>();
    for (const s of series) {
      const day = s.date.slice(0, 10);
      daily.set(day, s);
    }

    res.json({ series: Array.from(daily.values()) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Daily Returns ──────────────────────────────────────────────────────────

router.get('/daily', (_req: Request, res: Response) => {
  try {
    const brain = getBrain();
    const snapshots = (brain as any)?.db?.prepare?.(
      "SELECT portfolio_value, created_at FROM portfolio_snapshots ORDER BY created_at ASC"
    )?.all() || [];

    const returns = calculateDailyReturns(snapshots);
    res.json({ returns });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Helper Functions ───────────────────────────────────────────────────────

function calculateDailyReturns(snapshots: any[]): { day: string; returnPct: number; value: number }[] {
  // Group by day, take last value
  const daily = new Map<string, number>();
  for (const s of snapshots) {
    const day = s.created_at.slice(0, 10);
    daily.set(day, s.portfolio_value);
  }

  const days = Array.from(daily.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const returns: { day: string; returnPct: number; value: number }[] = [];

  for (let i = 1; i < days.length; i++) {
    const prevValue = days[i - 1][1];
    const currValue = days[i][1];
    const returnPct = prevValue > 0 ? ((currValue - prevValue) / prevValue) * 100 : 0;
    returns.push({ day: days[i][0], returnPct, value: currValue });
  }

  return returns;
}

function calculateSharpe(dailyReturns: { returnPct: number }[]): number {
  if (dailyReturns.length < 2) return 0;

  const returns = dailyReturns.map(r => r.returnPct / 100);
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (returns.length - 1);
  const stddev = Math.sqrt(variance);

  if (stddev === 0) return 0;
  return (mean / stddev) * Math.sqrt(252); // Annualized
}

function calculateSortino(dailyReturns: { returnPct: number }[]): number {
  if (dailyReturns.length < 2) return 0;

  const returns = dailyReturns.map(r => r.returnPct / 100);
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const downsideReturns = returns.filter(r => r < 0);

  if (downsideReturns.length === 0) return mean > 0 ? Infinity : 0;

  const downsideVariance = downsideReturns.reduce((s, r) => s + Math.pow(r, 2), 0) / downsideReturns.length;
  const downsideStddev = Math.sqrt(downsideVariance);

  if (downsideStddev === 0) return 0;
  return (mean / downsideStddev) * Math.sqrt(252);
}

function calculateMaxDrawdown(snapshots: any[]): { maxDrawdownPercent: number; maxDrawdownDollars: number } {
  if (snapshots.length < 2) return { maxDrawdownPercent: 0, maxDrawdownDollars: 0 };

  let peak = 0;
  let maxDDPct = 0;
  let maxDDDollar = 0;

  for (const s of snapshots) {
    const value = s.portfolio_value;
    if (value > peak) peak = value;
    const ddPct = peak > 0 ? ((value - peak) / peak) * 100 : 0;
    const ddDollar = value - peak;
    if (ddPct < maxDDPct) {
      maxDDPct = ddPct;
      maxDDDollar = ddDollar;
    }
  }

  return { maxDrawdownPercent: maxDDPct, maxDrawdownDollars: maxDDDollar };
}

export default router;
