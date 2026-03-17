/**
 * Backtester — Run strategies against historical data
 *
 * Takes a strategy, feeds it historical bars, simulates fills,
 * and returns performance metrics. No broker connection needed.
 *
 * Usage:
 *   GET /api/backtest?strategy=rsi_mean_reversion&days=90&positionSize=25
 *   POST /api/backtest/run { strategyId, days, positionSize, params }
 */

import { IStrategy, MarketData, Signal } from './types';
import { config } from '../../config';
import { AlpacaAdapter } from '../execution/broker/alpaca';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BacktestConfig {
  days: number;            // How many days of history to test
  positionSize: number;    // USD per trade
  startingCapital: number; // Starting portfolio value
  slippageBps: number;     // Simulated slippage (basis points)
}

export interface BacktestTrade {
  symbol: string;
  side: 'buy' | 'sell';
  entryDate: string;
  entryPrice: number;
  exitDate?: string;
  exitPrice?: number;
  shares: number;
  pnlDollars: number;
  pnlPercent: number;
  holdDays: number;
  reason: string;
  signalStrength: number;
}

export interface BacktestResult {
  strategyName: string;
  strategyId: string;
  params: Record<string, any>;
  period: { start: string; end: string; days: number };
  summary: {
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    totalPnlDollars: number;
    totalPnlPercent: number;
    avgWinDollars: number;
    avgLossDollars: number;
    profitFactor: number;
    maxDrawdownPercent: number;
    sharpeRatio: number;
    avgHoldDays: number;
    tradesPerDay: number;
  };
  trades: BacktestTrade[];
  equityCurve: { date: string; equity: number }[];
  benchmark: {
    spyReturn: number;       // S&P 500 return over same period
    strategyVsSpy: number;   // Alpha: strategy return minus SPY return
    spyStartPrice: number;
    spyEndPrice: number;
  };
  verdict: 'green' | 'yellow' | 'red';
  verdictText: string;
}

// ---------------------------------------------------------------------------
// Backtester
// ---------------------------------------------------------------------------

export async function runBacktest(
  strategy: IStrategy,
  backtestConfig: Partial<BacktestConfig> = {}
): Promise<BacktestResult> {
  const cfg: BacktestConfig = {
    days: backtestConfig.days || 90,
    positionSize: backtestConfig.positionSize || 25,
    startingCapital: backtestConfig.startingCapital || 100,
    slippageBps: backtestConfig.slippageBps || 10, // 0.1% default slippage
  };

  const strategyConfig = strategy.getConfig();
  const symbols = strategyConfig.symbols;

  console.log(`[Backtest] Starting: ${strategy.getName()}`);
  console.log(`  Period: ${cfg.days} days, ${symbols.length} symbols`);
  console.log(`  Position: $${cfg.positionSize}, Capital: $${cfg.startingCapital}`);

  // Fetch historical data from Alpaca
  const broker = new AlpacaAdapter({
    apiKey: config.brokerApiKey,
    apiSecret: config.brokerApiSecret,
    baseUrl: config.brokerBaseUrl,
  });
  await broker.connect();

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - cfg.days - 10); // Extra buffer for indicator warmup

  const allBars: Map<string, MarketData[]> = new Map();

  // Always include SPY for benchmark, then strategy symbols
  const fetchSymbols = [...new Set(['SPY', ...symbols])].slice(0, 50);
  console.log(`[Backtest] Fetching ${fetchSymbols.length} symbols...`);

  // Fetch bars with rate-limit-friendly delays
  for (const symbol of fetchSymbols) {
    try {
      const bars = await broker.getBars(symbol, {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        timeframe: '1Day',
        limit: cfg.days + 30,
        adjustment: 'split',
      });
      if (bars.length >= 20) { // Need minimum data
        allBars.set(symbol, bars);
      }
      // Small delay to avoid Alpaca rate limits
      await new Promise(r => setTimeout(r, 100));
    } catch {}
  }

  console.log(`[Backtest] Fetched data for ${allBars.size} symbols`);

  // Simulate day-by-day
  const trades: BacktestTrade[] = [];
  const openPositions: Map<string, { entryPrice: number; entryDate: string; shares: number; side: 'buy' | 'sell'; reason: string; strength: number }> = new Map();
  let equity = cfg.startingCapital;
  let peakEquity = equity;
  let maxDrawdown = 0;
  const equityCurve: { date: string; equity: number }[] = [];
  const dailyReturns: number[] = [];

  // Find the common date range
  const allDates = new Set<string>();
  allBars.forEach(bars => {
    bars.forEach(b => allDates.add(b.timestamp.toISOString().slice(0, 10)));
  });
  const sortedDates = Array.from(allDates).sort();
  const testDates = sortedDates.slice(-cfg.days);

  for (let dayIdx = 0; dayIdx < testDates.length; dayIdx++) {
    const date = testDates[dayIdx];
    const prevEquity = equity;

    // Build market data snapshot up to this date
    const snapshot: Map<string, MarketData[]> = new Map();
    allBars.forEach((bars, symbol) => {
      const barsUpToDate = bars.filter(b => b.timestamp.toISOString().slice(0, 10) <= date);
      if (barsUpToDate.length >= 15) { // Need enough for indicators
        snapshot.set(symbol, barsUpToDate);
      }
    });

    // Run strategy
    try {
      const signals = await strategy.generateSignals(snapshot);

      for (const signal of signals) {
        const slippage = signal.price * (cfg.slippageBps / 10000);
        const fillPrice = signal.side === 'buy'
          ? signal.price + slippage
          : signal.price - slippage;

        if (signal.side === 'buy') {
          // Open position
          if (!openPositions.has(signal.symbol) && equity > cfg.positionSize) {
            const shares = cfg.positionSize / fillPrice;
            openPositions.set(signal.symbol, {
              entryPrice: fillPrice,
              entryDate: date,
              shares,
              side: 'buy',
              reason: signal.reason,
              strength: signal.strength,
            });
            equity -= cfg.positionSize;
          }
        } else if (signal.side === 'sell') {
          // Close position if we have one
          const pos = openPositions.get(signal.symbol);
          if (pos && pos.side === 'buy') {
            const pnlDollars = (fillPrice - pos.entryPrice) * pos.shares;
            const pnlPercent = ((fillPrice - pos.entryPrice) / pos.entryPrice) * 100;
            const holdDays = Math.ceil(
              (new Date(date).getTime() - new Date(pos.entryDate).getTime()) / 86400000
            );

            trades.push({
              symbol: signal.symbol,
              side: 'buy',
              entryDate: pos.entryDate,
              entryPrice: pos.entryPrice,
              exitDate: date,
              exitPrice: fillPrice,
              shares: pos.shares,
              pnlDollars,
              pnlPercent,
              holdDays,
              reason: pos.reason,
              signalStrength: pos.strength,
            });

            equity += cfg.positionSize + pnlDollars;
            openPositions.delete(signal.symbol);
          }
        }
      }
    } catch {}

    // Update equity with unrealized P&L
    let unrealized = 0;
    openPositions.forEach((pos, symbol) => {
      const bars = snapshot.get(symbol);
      if (bars && bars.length > 0) {
        const currentPrice = bars[bars.length - 1].close;
        unrealized += (currentPrice - pos.entryPrice) * pos.shares;
      }
    });

    const totalEquity = equity + unrealized + openPositions.size * cfg.positionSize;
    equityCurve.push({ date, equity: totalEquity });

    // Track drawdown
    if (totalEquity > peakEquity) peakEquity = totalEquity;
    const drawdown = peakEquity > 0 ? ((peakEquity - totalEquity) / peakEquity) * 100 : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;

    // Daily return
    if (prevEquity > 0) {
      dailyReturns.push((totalEquity - prevEquity) / prevEquity);
    }
  }

  // Close all remaining positions at last available price
  openPositions.forEach((pos, symbol) => {
    const bars = allBars.get(symbol);
    if (bars && bars.length > 0) {
      const lastPrice = bars[bars.length - 1].close;
      const pnlDollars = (lastPrice - pos.entryPrice) * pos.shares;
      const pnlPercent = ((lastPrice - pos.entryPrice) / pos.entryPrice) * 100;
      const holdDays = Math.ceil(
        (Date.now() - new Date(pos.entryDate).getTime()) / 86400000
      );
      trades.push({
        symbol,
        side: 'buy',
        entryDate: pos.entryDate,
        entryPrice: pos.entryPrice,
        exitDate: testDates[testDates.length - 1],
        exitPrice: lastPrice,
        shares: pos.shares,
        pnlDollars,
        pnlPercent,
        holdDays,
        reason: pos.reason + ' (still open)',
        signalStrength: pos.strength,
      });
    }
  });

  // Calculate summary
  const wins = trades.filter(t => t.pnlDollars > 0);
  const losses = trades.filter(t => t.pnlDollars <= 0);
  const totalPnl = trades.reduce((sum, t) => sum + t.pnlDollars, 0);
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnlDollars, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.pnlDollars, 0) / losses.length : 0;
  const grossProfit = wins.reduce((s, t) => s + t.pnlDollars, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlDollars, 0));

  // Sharpe ratio (annualized)
  const avgReturn = dailyReturns.length > 0 ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length : 0;
  const stdReturn = dailyReturns.length > 1
    ? Math.sqrt(dailyReturns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / (dailyReturns.length - 1))
    : 1;
  const sharpe = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0;

  const summary = {
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
    totalPnlDollars: totalPnl,
    totalPnlPercent: (totalPnl / cfg.startingCapital) * 100,
    avgWinDollars: avgWin,
    avgLossDollars: avgLoss,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    maxDrawdownPercent: maxDrawdown,
    sharpeRatio: sharpe,
    avgHoldDays: trades.length > 0 ? trades.reduce((s, t) => s + t.holdDays, 0) / trades.length : 0,
    tradesPerDay: cfg.days > 0 ? trades.length / cfg.days : 0,
  };

  // Verdict
  let verdict: 'green' | 'yellow' | 'red';
  let verdictText: string;
  if (summary.totalTrades < 5) {
    verdict = 'yellow';
    verdictText = `Only ${summary.totalTrades} trades in ${cfg.days} days — not enough data to judge.`;
  } else if (summary.winRate >= 55 && summary.profitFactor >= 1.5 && summary.sharpeRatio >= 0.5) {
    verdict = 'green';
    verdictText = `Strong: ${summary.winRate.toFixed(0)}% win rate, ${summary.profitFactor.toFixed(1)}x profit factor, ${summary.sharpeRatio.toFixed(2)} Sharpe.`;
  } else if (summary.winRate >= 45 && summary.profitFactor >= 1.0) {
    verdict = 'yellow';
    verdictText = `Marginal: ${summary.winRate.toFixed(0)}% win rate, ${summary.profitFactor.toFixed(1)}x profit factor. Needs tuning.`;
  } else {
    verdict = 'red';
    verdictText = `Weak: ${summary.winRate.toFixed(0)}% win rate, ${summary.profitFactor.toFixed(1)}x profit factor. Consider disabling.`;
  }

  // Benchmark against SPY
  const spyBars = allBars.get('SPY') || [];
  let spyReturn = 0, spyStartPrice = 0, spyEndPrice = 0;
  if (spyBars.length >= 2) {
    const spyStart = spyBars.find(b => b.timestamp.toISOString().slice(0, 10) >= testDates[0]);
    const spyEnd = spyBars[spyBars.length - 1];
    if (spyStart && spyEnd) {
      spyStartPrice = spyStart.close;
      spyEndPrice = spyEnd.close;
      spyReturn = ((spyEndPrice - spyStartPrice) / spyStartPrice) * 100;
    }
  }
  // If SPY wasn't in the symbol list, fetch it
  if (spyBars.length === 0) {
    try {
      const spyData = await broker.getBars('SPY', {
        start: startDate.toISOString(), end: endDate.toISOString(),
        timeframe: '1Day', limit: cfg.days + 30, adjustment: 'split',
      });
      if (spyData.length >= 2) {
        const s = spyData.find(b => b.timestamp.toISOString().slice(0, 10) >= testDates[0]);
        const e = spyData[spyData.length - 1];
        if (s && e) {
          spyStartPrice = s.close; spyEndPrice = e.close;
          spyReturn = ((spyEndPrice - spyStartPrice) / spyStartPrice) * 100;
        }
      }
    } catch {}
  }

  const alpha = summary.totalPnlPercent - spyReturn;
  console.log(`[Backtest] Complete: ${trades.length} trades, ${summary.winRate.toFixed(0)}% win rate, $${totalPnl.toFixed(2)} P&L`);
  console.log(`[Backtest] SPY: ${spyReturn >= 0 ? '+' : ''}${spyReturn.toFixed(1)}% | Strategy alpha: ${alpha >= 0 ? '+' : ''}${alpha.toFixed(1)}%`);
  console.log(`[Backtest] Verdict: ${verdict} — ${verdictText}`);

  return {
    strategyName: strategy.getName(),
    strategyId: strategy.getId(),
    params: strategyConfig.params,
    period: {
      start: testDates[0] || startDate.toISOString().slice(0, 10),
      end: testDates[testDates.length - 1] || endDate.toISOString().slice(0, 10),
      days: cfg.days,
    },
    summary,
    trades,
    equityCurve,
    benchmark: {
      spyReturn,
      strategyVsSpy: alpha,
      spyStartPrice,
      spyEndPrice,
    },
    verdict,
    verdictText,
  };
}
