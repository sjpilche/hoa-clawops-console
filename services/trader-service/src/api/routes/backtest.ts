/**
 * Backtest API — Run strategies against historical Alpaca data
 *
 * GET  /api/backtest/strategies           → list backtestable strategies
 * POST /api/backtest/run                  → run one strategy
 * POST /api/backtest/run-all              → run all 5 equity strategies in parallel
 *
 * All strategies run against Alpaca free-tier historical bars.
 * Polymarket / weather strategies are excluded (no OHLCV signal path).
 */

import { Router, Request, Response } from 'express';
import { runBacktest, BacktestConfig, BacktestResult } from '../../engine/strategy/backtester';
import { MovingAverageCrossoverStrategy } from '../../engine/strategy/strategies/moving_average_crossover';
import { RsiMeanReversionStrategy } from '../../engine/strategy/strategies/rsi_mean_reversion';
import { BollingerReversionStrategy } from '../../engine/strategy/strategies/bollinger_reversion';
import { VolumeSpikeStrategy } from '../../engine/strategy/strategies/volume_spike_momentum';
import { GapReversalStrategy } from '../../engine/strategy/strategies/gap_reversal';
import { RelativeStrengthRotationStrategy } from '../../engine/strategy/strategies/relative_strength_rotation';
import { VixFearSpikeStrategy } from '../../engine/strategy/strategies/vix_fear_spike';
import { TurnOfMonthStrategy } from '../../engine/strategy/strategies/turn_of_month';
import { PostEarningsDriftStrategy } from '../../engine/strategy/strategies/post_earnings_drift';
import { OvernightPremiumStrategy } from '../../engine/strategy/strategies/overnight_premium';
import { OversoldLargeCapStrategy } from '../../engine/strategy/strategies/oversold_largecap';
import { HolidayEffectStrategy } from '../../engine/strategy/strategies/holiday_effect';

const router = Router();

// ---------------------------------------------------------------------------
// Strategy factory — builds a fresh instance by ID
// ---------------------------------------------------------------------------

const EQUITY_STRATEGIES: Record<string, { label: string; factory: () => any }> = {
  moving_average_crossover: {
    label: 'Moving Average Crossover',
    factory: () => new MovingAverageCrossoverStrategy(),
  },
  rsi_mean_reversion: {
    label: 'RSI Mean Reversion',
    factory: () => new RsiMeanReversionStrategy(),
  },
  bollinger_reversion: {
    label: 'Bollinger Reversion',
    factory: () => new BollingerReversionStrategy(),
  },
  volume_spike_momentum: {
    label: 'Volume Spike Momentum',
    factory: () => new VolumeSpikeStrategy(),
  },
  gap_reversal: {
    label: 'Gap Reversal',
    factory: () => new GapReversalStrategy(),
  },
  relative_strength_rotation: {
    label: 'Relative Strength Rotation',
    factory: () => new RelativeStrengthRotationStrategy(),
  },
  vix_fear_spike: {
    label: 'VIX Fear Spike',
    factory: () => new VixFearSpikeStrategy(),
  },
  turn_of_month: {
    label: 'Turn of Month',
    factory: () => new TurnOfMonthStrategy(),
  },
  post_earnings_drift: {
    label: 'Post-Earnings Drift',
    factory: () => new PostEarningsDriftStrategy(),
  },
  overnight_premium: {
    label: 'Overnight Premium',
    factory: () => new OvernightPremiumStrategy(),
  },
  oversold_largecap: {
    label: 'Oversold Large Cap',
    factory: () => new OversoldLargeCapStrategy(),
  },
  holiday_effect: {
    label: 'Holiday Effect',
    factory: () => new HolidayEffectStrategy(),
  },
};

// ---------------------------------------------------------------------------
// GET /api/backtest/strategies
// ---------------------------------------------------------------------------

router.get('/strategies', (_req: Request, res: Response) => {
  res.json({
    strategies: Object.entries(EQUITY_STRATEGIES).map(([id, s]) => ({
      id,
      label: s.label,
    })),
    note: 'Polymarket and weather strategies excluded — no OHLCV signal path.',
  });
});

// ---------------------------------------------------------------------------
// POST /api/backtest/run
// Body: { strategyId: string, days?: number, startingCapital?: number, positionSize?: number, slippageBps?: number }
// ---------------------------------------------------------------------------

router.post('/run', async (req: Request, res: Response) => {
  const { strategyId, days, startingCapital, positionSize, slippageBps } = req.body || {};

  if (!strategyId || !EQUITY_STRATEGIES[strategyId]) {
    return res.status(400).json({
      error: 'Invalid strategyId',
      valid: Object.keys(EQUITY_STRATEGIES),
    });
  }

  const cfg: Partial<BacktestConfig> = {
    days: Math.min(Number(days) || 90, 365),
    startingCapital: Number(startingCapital) || 10000,
    positionSize: Number(positionSize) || 500,
    slippageBps: Number(slippageBps) || 10,
  };

  try {
    const strategy = EQUITY_STRATEGIES[strategyId].factory();
    await strategy.initialize();
    const result = await runBacktest(strategy, cfg);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/backtest/run-all
// Body: { days?: number, startingCapital?: number, positionSize?: number, slippageBps?: number }
// Runs all 5 equity strategies in parallel, returns comparison table.
// ---------------------------------------------------------------------------

router.post('/run-all', async (req: Request, res: Response) => {
  const { days, startingCapital, positionSize, slippageBps } = req.body || {};

  const cfg: Partial<BacktestConfig> = {
    days: Math.min(Number(days) || 90, 365),
    startingCapital: Number(startingCapital) || 10000,
    positionSize: Number(positionSize) || 500,
    slippageBps: Number(slippageBps) || 10,
  };

  const startedAt = new Date().toISOString();

  try {
    const entries = Object.entries(EQUITY_STRATEGIES);

    const results = await Promise.allSettled(
      entries.map(async ([id, s]) => {
        const strategy = s.factory();
        await strategy.initialize();
        const result = await runBacktest(strategy, cfg);
        return { id, ...result };
      })
    );

    const successful: BacktestResult[] = [];
    const failed: { id: string; error: string }[] = [];

    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        successful.push(r.value);
      } else {
        failed.push({ id: entries[i][0], error: r.reason?.message || 'Unknown error' });
      }
    });

    // Comparison table — sorted by Sharpe ratio
    const comparison = successful
      .map(r => ({
        strategyId: r.strategyId,
        strategyName: r.strategyName,
        verdict: r.verdict,
        verdictText: r.verdictText,
        trades: r.summary.totalTrades,
        winRate: r.summary.winRate,
        profitFactor: r.summary.profitFactor,
        sharpeRatio: r.summary.sharpeRatio,
        totalPnlDollars: r.summary.totalPnlDollars,
        totalPnlPercent: r.summary.totalPnlPercent,
        maxDrawdownPercent: r.summary.maxDrawdownPercent,
        avgHoldDays: r.summary.avgHoldDays,
        spyReturn: r.benchmark.spyReturn,
        alpha: r.benchmark.strategyVsSpy,
      }))
      .sort((a, b) => b.sharpeRatio - a.sharpeRatio);

    res.json({
      config: cfg,
      startedAt,
      completedAt: new Date().toISOString(),
      comparison,
      details: successful,
      failed,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
