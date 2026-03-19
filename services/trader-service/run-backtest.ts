/**
 * Standalone backtest runner — run all 5 equity strategies against real Alpaca data
 *
 * Usage:
 *   npx tsx run-backtest.ts
 *   npx tsx run-backtest.ts --days=180
 *   npx tsx run-backtest.ts --strategy=rsi_mean_reversion --days=90
 *
 * Reads BROKER_API_KEY / BROKER_API_SECRET from .env.trader automatically.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env before any imports that depend on config
dotenv.config({ path: path.join(__dirname, '.env.trader') });

import { runBacktest, BacktestResult } from './src/engine/strategy/backtester';
import { MovingAverageCrossoverStrategy } from './src/engine/strategy/strategies/moving_average_crossover';
import { RsiMeanReversionStrategy } from './src/engine/strategy/strategies/rsi_mean_reversion';
import { BollingerReversionStrategy } from './src/engine/strategy/strategies/bollinger_reversion';
import { VolumeSpikeStrategy } from './src/engine/strategy/strategies/volume_spike_momentum';
import { GapReversalStrategy } from './src/engine/strategy/strategies/gap_reversal';
import { RelativeStrengthRotationStrategy } from './src/engine/strategy/strategies/relative_strength_rotation';
import { VixFearSpikeStrategy } from './src/engine/strategy/strategies/vix_fear_spike';
import { TurnOfMonthStrategy } from './src/engine/strategy/strategies/turn_of_month';
import { PostEarningsDriftStrategy } from './src/engine/strategy/strategies/post_earnings_drift';
import { OvernightPremiumStrategy } from './src/engine/strategy/strategies/overnight_premium';
import { OversoldLargeCapStrategy } from './src/engine/strategy/strategies/oversold_largecap';
import { HolidayEffectStrategy } from './src/engine/strategy/strategies/holiday_effect';

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const [k, v] = a.slice(2).split('=');
      return [k, v];
    })
);

const DAYS = parseInt(args.days || '90');
const CAPITAL = parseInt(args.capital || '10000');
const POSITION_SIZE = parseInt(args.positionSize || '500');
const TARGET_STRATEGY = args.strategy || null;

// ---------------------------------------------------------------------------
// Strategy definitions
// ---------------------------------------------------------------------------

const STRATEGIES: { id: string; label: string; factory: () => any }[] = [
  {
    id: 'moving_average_crossover',
    label: 'MA Crossover (AAPL/MSFT/GOOGL, 5/15)',
    factory: () => new MovingAverageCrossoverStrategy(),
  },
  {
    id: 'rsi_mean_reversion',
    label: 'RSI Reversion (AAPL/MSFT/SPY, RSI 35/65)',
    factory: () => new RsiMeanReversionStrategy(),
  },
  {
    id: 'bollinger_reversion',
    label: 'Bollinger Reversion (10 large caps, 2σ)',
    factory: () => new BollingerReversionStrategy(),
  },
  {
    id: 'volume_spike_momentum',
    label: 'Volume Spike (10 large caps, 2× vol)',
    factory: () => new VolumeSpikeStrategy(),
  },
  {
    id: 'gap_reversal',
    label: 'Gap Reversal (10 large caps, 5% gap)',
    // Give it the same 10-stock watchlist as Bollinger/Volume since default is empty
    factory: () => new GapReversalStrategy({
      symbols: ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'IWM'],
    }),
  },
  {
    id: 'relative_strength_rotation',
    label: 'Relative Strength Rotation (8 ETFs, top 2)',
    factory: () => new RelativeStrengthRotationStrategy(),
  },
  {
    id: 'vix_fear_spike',
    label: 'VIX Fear Spike (buy SPY on panic)',
    factory: () => new VixFearSpikeStrategy(),
  },
  {
    id: 'turn_of_month',
    label: 'Turn of Month (SPY, last day → 3rd day)',
    factory: () => new TurnOfMonthStrategy(),
  },
  {
    id: 'post_earnings_drift',
    label: 'Post-Earnings Drift (15 large caps, 3%+ gap)',
    factory: () => new PostEarningsDriftStrategy(),
  },
  {
    id: 'overnight_premium',
    label: 'Overnight Premium (SPY close→open)',
    factory: () => new OvernightPremiumStrategy(),
  },
  {
    id: 'oversold_largecap',
    label: 'Oversold Large Cap (15 mega-caps, -7%/5d)',
    factory: () => new OversoldLargeCapStrategy(),
  },
  {
    id: 'holiday_effect',
    label: 'Holiday Effect (SPY, 2d before holidays)',
    factory: () => new HolidayEffectStrategy(),
  },
];

const toRun = TARGET_STRATEGY
  ? STRATEGIES.filter(s => s.id === TARGET_STRATEGY)
  : STRATEGIES;

if (toRun.length === 0) {
  console.error(`Unknown strategy: ${TARGET_STRATEGY}`);
  console.error(`Valid: ${STRATEGIES.map(s => s.id).join(', ')}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function verdict(r: BacktestResult): string {
  const v = r.verdict === 'green' ? '🟢' : r.verdict === 'yellow' ? '🟡' : '🔴';
  return `${v} ${r.verdictText}`;
}

function bar(value: number, max: number, width = 20): string {
  const filled = Math.round((Math.min(value, max) / max) * width);
  return '█'.repeat(Math.max(0, filled)) + '░'.repeat(width - Math.max(0, filled));
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║          OpenClaw Strategy Backtest Runner                   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\nPeriod:   ${DAYS} days`);
  console.log(`Capital:  $${CAPITAL.toLocaleString()}`);
  console.log(`Per-trade: $${POSITION_SIZE}`);
  console.log(`Running:  ${toRun.length} strategy(ies)\n`);

  const results: BacktestResult[] = [];

  for (const s of toRun) {
    console.log(`\n${'─'.repeat(64)}`);
    console.log(`▶  ${s.label}`);
    console.log(`${'─'.repeat(64)}`);

    try {
      const strategy = s.factory();
      await strategy.initialize();
      const result = await runBacktest(strategy, {
        days: DAYS,
        startingCapital: CAPITAL,
        positionSize: POSITION_SIZE,
        slippageBps: 10,
      });
      results.push(result);

      // Per-strategy detail
      const { summary, benchmark } = result;
      console.log(`\n  Trades:      ${summary.totalTrades} (${summary.wins}W / ${summary.losses}L)`);
      console.log(`  Win Rate:    ${summary.winRate.toFixed(1)}%  ${bar(summary.winRate, 100)}`);
      console.log(`  Profit Fct:  ${summary.profitFactor === Infinity ? '∞' : summary.profitFactor.toFixed(2)}x`);
      console.log(`  Sharpe:      ${summary.sharpeRatio.toFixed(2)}`);
      console.log(`  Max DD:      ${summary.maxDrawdownPercent.toFixed(1)}%`);
      console.log(`  P&L:         $${summary.totalPnlDollars.toFixed(2)} (${summary.totalPnlPercent.toFixed(1)}%)`);
      console.log(`  vs SPY:      SPY ${benchmark.spyReturn >= 0 ? '+' : ''}${benchmark.spyReturn.toFixed(1)}% | Alpha ${benchmark.strategyVsSpy >= 0 ? '+' : ''}${benchmark.strategyVsSpy.toFixed(1)}%`);
      console.log(`  Avg hold:    ${summary.avgHoldDays.toFixed(1)} days`);
      console.log(`\n  ${verdict(result)}`);
    } catch (err: any) {
      console.error(`  ❌ FAILED: ${err.message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Summary comparison table
  // ---------------------------------------------------------------------------

  if (results.length > 1) {
    console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                  COMPARISON (sorted by Sharpe)              ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    const sorted = [...results].sort((a, b) => b.summary.sharpeRatio - a.summary.sharpeRatio);

    const col = (s: string, w: number) => s.padEnd(w).slice(0, w);
    const num = (n: number, w: number, decimals = 1) => (n >= 0 ? '+' : '') + n.toFixed(decimals).padStart(w);

    console.log(
      col('Strategy', 28) +
      col('Verdict', 8) +
      col('Trades', 8) +
      col('WinRate', 9) +
      col('PF', 6) +
      col('Sharpe', 8) +
      col('Alpha', 8) +
      col('MaxDD', 7)
    );
    console.log('─'.repeat(82));

    for (const r of sorted) {
      const v = r.verdict === 'green' ? '🟢' : r.verdict === 'yellow' ? '🟡' : '🔴';
      console.log(
        col(r.strategyName, 28) +
        col(v, 8) +
        col(String(r.summary.totalTrades), 8) +
        col(r.summary.winRate.toFixed(1) + '%', 9) +
        col(r.summary.profitFactor === Infinity ? '∞' : r.summary.profitFactor.toFixed(1) + 'x', 6) +
        col(r.summary.sharpeRatio.toFixed(2), 8) +
        col((r.benchmark.strategyVsSpy >= 0 ? '+' : '') + r.benchmark.strategyVsSpy.toFixed(1) + '%', 8) +
        col(r.summary.maxDrawdownPercent.toFixed(1) + '%', 7)
      );
    }

    // Best strategy recommendation
    const best = sorted[0];
    if (best) {
      console.log(`\n🏆 Best by Sharpe: ${best.strategyName} (${best.summary.sharpeRatio.toFixed(2)} Sharpe, ${best.summary.winRate.toFixed(0)}% win rate)`);
    }

    const greens = sorted.filter(r => r.verdict === 'green');
    const reds = sorted.filter(r => r.verdict === 'red');
    if (greens.length > 0) console.log(`✅ Deploy candidates: ${greens.map(r => r.strategyName).join(', ')}`);
    if (reds.length > 0) console.log(`⛔ Consider disabling: ${reds.map(r => r.strategyName).join(', ')}`);
  }

  console.log('\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
