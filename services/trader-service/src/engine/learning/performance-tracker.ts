// =============================================================================
// Performance Tracker — Paper Trading Scorecard
// =============================================================================
// Daily: P&L, win rate, avg win/loss ratio, max drawdown, Sharpe ratio
// Weekly: compare to SPY benchmark — are we beating buy-and-hold?
// Stores history in brain DB, surfaces in Dream Team morning report.
//
// Fund gate: only go live when paper Sharpe > 0.5 over 14+ trading days.
// =============================================================================

import Database from 'better-sqlite3';
import path from 'path';
import { config } from '../../config';

const ALPACA_BASE = config.brokerBaseUrl || 'https://paper-api.alpaca.markets';
const ALPACA_KEY = config.brokerApiKey || '';
const ALPACA_SECRET = config.brokerApiSecret || '';
const RISK_FREE_RATE = 0.05; // ~5% annual (T-bill proxy)

interface DailyRecord {
  date: string;
  portfolioValue: number;
  cash: number;
  dailyReturn: number;      // percentage
  dailyPnl: number;         // dollar
  tradesExecuted: number;
  tradesWon: number;
  tradesLost: number;
  spyReturn: number;         // SPY daily return for benchmark
  cumulativeReturn: number;
  maxDrawdown: number;
}

interface Scorecard {
  tradingDays: number;
  totalReturn: number;          // %
  annualizedReturn: number;     // %
  sharpeRatio: number;
  winRate: number;              // %
  avgWin: number;               // $
  avgLoss: number;              // $
  winLossRatio: number;
  maxDrawdown: number;          // %
  spyReturn: number;            // % over same period
  alpha: number;                // our return - SPY return
  fundReady: boolean;           // Sharpe > 0.5 for 14+ days
  dailyReturns: number[];
}

export class PerformanceTracker {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath || path.join(__dirname, '../../../data/trader-brain.sqlite');
    this.db = new Database(resolvedPath);
    this.ensureTable();
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS performance_daily (
        date TEXT PRIMARY KEY,
        portfolio_value REAL NOT NULL,
        cash REAL DEFAULT 0,
        daily_return REAL DEFAULT 0,
        daily_pnl REAL DEFAULT 0,
        trades_executed INTEGER DEFAULT 0,
        trades_won INTEGER DEFAULT 0,
        trades_lost INTEGER DEFAULT 0,
        spy_return REAL DEFAULT 0,
        cumulative_return REAL DEFAULT 0,
        max_drawdown REAL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }

  /**
   * Record today's performance snapshot. Called at end of trading day.
   */
  async recordDaily(): Promise<DailyRecord> {
    const today = new Date().toISOString().split('T')[0];

    // Get account state from Alpaca
    const account = await this.fetchAlpacaAccount();
    const portfolioValue = parseFloat(account.equity || '0');
    const cash = parseFloat(account.cash || '0');

    // Get yesterday's value for return calc
    const yesterday = this.db.prepare(
      'SELECT portfolio_value FROM performance_daily ORDER BY date DESC LIMIT 1'
    ).get() as { portfolio_value: number } | undefined;

    const prevValue = yesterday?.portfolio_value || portfolioValue; // First day = 0% return
    const dailyReturn = prevValue > 0 ? ((portfolioValue - prevValue) / prevValue) * 100 : 0;
    const dailyPnl = portfolioValue - prevValue;

    // Get today's order fills for win/loss tracking
    const { executed, won, lost } = await this.fetchDailyTradeStats();

    // Get SPY return for benchmark
    const spyReturn = await this.fetchSpyDailyReturn();

    // Calculate cumulative return from first day
    const firstDay = this.db.prepare(
      'SELECT portfolio_value FROM performance_daily ORDER BY date ASC LIMIT 1'
    ).get() as { portfolio_value: number } | undefined;
    const startValue = firstDay?.portfolio_value || portfolioValue;
    const cumulativeReturn = startValue > 0 ? ((portfolioValue - startValue) / startValue) * 100 : 0;

    // Max drawdown
    const allValues = this.db.prepare(
      'SELECT portfolio_value FROM performance_daily ORDER BY date ASC'
    ).all() as { portfolio_value: number }[];
    allValues.push({ portfolio_value: portfolioValue });
    const maxDrawdown = this.calculateMaxDrawdown(allValues.map(v => v.portfolio_value));

    const record: DailyRecord = {
      date: today,
      portfolioValue,
      cash,
      dailyReturn,
      dailyPnl,
      tradesExecuted: executed,
      tradesWon: won,
      tradesLost: lost,
      spyReturn,
      cumulativeReturn,
      maxDrawdown,
    };

    // Upsert
    this.db.prepare(`
      INSERT INTO performance_daily (date, portfolio_value, cash, daily_return, daily_pnl, trades_executed, trades_won, trades_lost, spy_return, cumulative_return, max_drawdown)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        portfolio_value = excluded.portfolio_value,
        cash = excluded.cash,
        daily_return = excluded.daily_return,
        daily_pnl = excluded.daily_pnl,
        trades_executed = excluded.trades_executed,
        trades_won = excluded.trades_won,
        trades_lost = excluded.trades_lost,
        spy_return = excluded.spy_return,
        cumulative_return = excluded.cumulative_return,
        max_drawdown = excluded.max_drawdown
    `).run(today, portfolioValue, cash, dailyReturn, dailyPnl, executed, won, lost, spyReturn, cumulativeReturn, maxDrawdown);

    console.log(`[PerformanceTracker] Recorded ${today}: $${portfolioValue.toFixed(2)} (${dailyReturn >= 0 ? '+' : ''}${dailyReturn.toFixed(2)}%) trades: ${executed} (${won}W/${lost}L)`);

    return record;
  }

  /**
   * Generate the full scorecard over the last N trading days.
   */
  getScorecard(days: number = 14): Scorecard {
    const rows = this.db.prepare(
      'SELECT * FROM performance_daily ORDER BY date DESC LIMIT ?'
    ).all(days) as any[];

    if (rows.length === 0) {
      return {
        tradingDays: 0, totalReturn: 0, annualizedReturn: 0, sharpeRatio: 0,
        winRate: 0, avgWin: 0, avgLoss: 0, winLossRatio: 0, maxDrawdown: 0,
        spyReturn: 0, alpha: 0, fundReady: false, dailyReturns: [],
      };
    }

    // Reverse to chronological order
    rows.reverse();

    const dailyReturns = rows.map((r: any) => r.daily_return);
    const spyReturns = rows.map((r: any) => r.spy_return);
    const tradingDays = rows.length;

    // Total return
    const first = rows[0].portfolio_value;
    const last = rows[rows.length - 1].portfolio_value;
    const totalReturn = first > 0 ? ((last - first) / first) * 100 : 0;

    // Annualized return (252 trading days)
    const annualizedReturn = tradingDays > 0
      ? (Math.pow(1 + totalReturn / 100, 252 / tradingDays) - 1) * 100
      : 0;

    // Sharpe ratio
    const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / tradingDays;
    const dailyRfRate = RISK_FREE_RATE / 252 * 100; // Convert to daily %
    const excessReturns = dailyReturns.map(r => r - dailyRfRate);
    const avgExcess = excessReturns.reduce((a, b) => a + b, 0) / tradingDays;
    const stdDev = Math.sqrt(
      excessReturns.reduce((sum, r) => sum + Math.pow(r - avgExcess, 2), 0) / Math.max(tradingDays - 1, 1)
    );
    const sharpeRatio = stdDev > 0 ? (avgExcess / stdDev) * Math.sqrt(252) : 0;

    // Win/loss stats
    const totalTrades = rows.reduce((s: number, r: any) => s + r.trades_executed, 0);
    const totalWon = rows.reduce((s: number, r: any) => s + r.trades_won, 0);
    const totalLost = rows.reduce((s: number, r: any) => s + r.trades_lost, 0);
    const winRate = totalTrades > 0 ? (totalWon / totalTrades) * 100 : 0;

    // Avg win/loss from daily P&L
    const winDays = rows.filter((r: any) => r.daily_pnl > 0);
    const lossDays = rows.filter((r: any) => r.daily_pnl < 0);
    const avgWin = winDays.length > 0 ? winDays.reduce((s: number, r: any) => s + r.daily_pnl, 0) / winDays.length : 0;
    const avgLoss = lossDays.length > 0 ? Math.abs(lossDays.reduce((s: number, r: any) => s + r.daily_pnl, 0) / lossDays.length) : 0;
    const winLossRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;

    // Max drawdown
    const maxDrawdown = this.calculateMaxDrawdown(rows.map((r: any) => r.portfolio_value));

    // SPY comparison
    const spyTotal = spyReturns.reduce((a, b) => a + b, 0);
    const alpha = totalReturn - spyTotal;

    // Fund gate
    const fundReady = tradingDays >= 14 && sharpeRatio > 0.5;

    return {
      tradingDays, totalReturn, annualizedReturn, sharpeRatio,
      winRate, avgWin, avgLoss, winLossRatio, maxDrawdown,
      spyReturn: spyTotal, alpha, fundReady, dailyReturns,
    };
  }

  /**
   * Format scorecard as plain text for Dream Team report
   */
  formatScorecard(days: number = 14): string {
    const s = this.getScorecard(days);

    if (s.tradingDays === 0) {
      return '=== PAPER TRADING SCORECARD ===\nNo trading data recorded yet.\n';
    }

    const fundStatus = s.fundReady
      ? 'FUND-READY (Sharpe > 0.5 for 14+ days)'
      : `NOT READY (need Sharpe > 0.5 for 14+ days — currently ${s.sharpeRatio.toFixed(2)} over ${s.tradingDays} days)`;

    return [
      `=== PAPER TRADING SCORECARD (${s.tradingDays} days) ===`,
      '',
      `Total Return:     ${s.totalReturn >= 0 ? '+' : ''}${s.totalReturn.toFixed(2)}%`,
      `Annualized:       ${s.annualizedReturn >= 0 ? '+' : ''}${s.annualizedReturn.toFixed(2)}%`,
      `Sharpe Ratio:     ${s.sharpeRatio.toFixed(2)}`,
      `Max Drawdown:     -${s.maxDrawdown.toFixed(2)}%`,
      '',
      `Win Rate:         ${s.winRate.toFixed(1)}%`,
      `Avg Win:          $${s.avgWin.toFixed(2)}`,
      `Avg Loss:         $${s.avgLoss.toFixed(2)}`,
      `Win/Loss Ratio:   ${s.winLossRatio === Infinity ? '∞' : s.winLossRatio.toFixed(2)}`,
      '',
      `SPY Return:       ${s.spyReturn >= 0 ? '+' : ''}${s.spyReturn.toFixed(2)}%`,
      `Alpha:            ${s.alpha >= 0 ? '+' : ''}${s.alpha.toFixed(2)}%`,
      '',
      `Fund Status:      ${fundStatus}`,
      '=== END SCORECARD ===',
    ].join('\n');
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private calculateMaxDrawdown(values: number[]): number {
    if (values.length < 2) return 0;
    let peak = values[0];
    let maxDD = 0;

    for (const v of values) {
      if (v > peak) peak = v;
      const dd = peak > 0 ? ((peak - v) / peak) * 100 : 0;
      if (dd > maxDD) maxDD = dd;
    }

    return maxDD;
  }

  private async fetchAlpacaAccount(): Promise<any> {
    const resp = await fetch(`${ALPACA_BASE}/v2/account`, {
      headers: {
        'APCA-API-KEY-ID': ALPACA_KEY,
        'APCA-API-SECRET-KEY': ALPACA_SECRET,
      },
    });
    if (!resp.ok) throw new Error(`Alpaca account: ${resp.status}`);
    return resp.json();
  }

  private async fetchDailyTradeStats(): Promise<{ executed: number; won: number; lost: number }> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const resp = await fetch(
        `${ALPACA_BASE}/v2/orders?status=closed&after=${today}T00:00:00Z&limit=100`,
        {
          headers: {
            'APCA-API-KEY-ID': ALPACA_KEY,
            'APCA-API-SECRET-KEY': ALPACA_SECRET,
          },
        }
      );

      if (!resp.ok) return { executed: 0, won: 0, lost: 0 };
      const orders: any[] = await resp.json() as any[];

      const filled = orders.filter((o: any) => o.status === 'filled');
      // Simple heuristic: won if avg_fill_price > limit_price (for sells) or filled (for buys, TBD)
      // Since we use market orders, we count fills and defer win/loss to daily P&L
      return { executed: filled.length, won: 0, lost: 0 };
    } catch {
      return { executed: 0, won: 0, lost: 0 };
    }
  }

  private async fetchSpyDailyReturn(): Promise<number> {
    try {
      const resp = await fetch(
        'https://query1.finance.yahoo.com/v7/finance/quote?symbols=SPY&fields=regularMarketChangePercent',
        {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(5000),
        }
      );

      if (!resp.ok) return 0;
      const data: any = await resp.json();
      return data?.quoteResponse?.result?.[0]?.regularMarketChangePercent || 0;
    } catch {
      return 0;
    }
  }
}
