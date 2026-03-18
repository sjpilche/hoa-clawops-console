/**
 * Options Performance Tracker — Separate P&L tracking for all options strategies
 *
 * Stores every options trade with strategy attribution so you can see:
 *   - P&L per strategy (0DTE vs Straddles vs YOLO vs conservative)
 *   - Win rate per strategy
 *   - Total premium spent vs collected
 *   - Best/worst trades
 *   - Daily/weekly/monthly rollups
 *
 * Uses the same brain SQLite database (separate tables).
 */

import Database from 'better-sqlite3';

export interface OptionsTradeRecord {
  tradeId: string;
  strategy: string;              // 'zero_dte' | 'event_straddle' | 'earnings_yolo' | 'vix_calls' | 'oversold_puts' | 'tom_calls'
  contractSymbol: string;
  underlyingSymbol: string;
  optionType: 'call' | 'put';
  side: 'buy' | 'sell';         // buy_to_open / sell_to_open simplified
  strike: number;
  expiration: string;
  qty: number;
  entryPrice: number;           // per contract
  exitPrice: number | null;
  entryTime: string;
  exitTime: string | null;
  premiumPaid: number;          // total $ spent (for buys)
  premiumCollected: number;     // total $ received (for sells)
  pnlDollars: number | null;
  pnlPercent: number | null;
  status: 'open' | 'closed' | 'expired';
  exitReason: string | null;    // 'take_profit' | 'stop_loss' | 'expiry' | 'reversal' | etc.
  catalyst: string | null;      // what triggered the trade
}

export interface StrategyPerformance {
  strategy: string;
  totalTrades: number;
  openTrades: number;
  closedTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  bestTrade: number;
  worstTrade: number;
  totalPremiumSpent: number;
  totalPremiumCollected: number;
}

export class OptionsTracker {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.ensureTables();
    console.log(`📊 Options Tracker initialized`);
  }

  private ensureTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS options_trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trade_id TEXT UNIQUE NOT NULL,
        strategy TEXT NOT NULL,
        contract_symbol TEXT NOT NULL,
        underlying_symbol TEXT NOT NULL,
        option_type TEXT NOT NULL,
        side TEXT NOT NULL,
        strike REAL NOT NULL,
        expiration TEXT NOT NULL,
        qty INTEGER NOT NULL,
        entry_price REAL NOT NULL,
        exit_price REAL,
        entry_time TEXT NOT NULL,
        exit_time TEXT,
        premium_paid REAL DEFAULT 0,
        premium_collected REAL DEFAULT 0,
        pnl_dollars REAL,
        pnl_percent REAL,
        status TEXT DEFAULT 'open',
        exit_reason TEXT,
        catalyst TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS options_daily_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        strategy TEXT NOT NULL,
        trades INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        pnl_dollars REAL DEFAULT 0,
        premium_spent REAL DEFAULT 0,
        premium_collected REAL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(date, strategy)
      )
    `);

    // Index for fast lookups
    try {
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_options_trades_strategy ON options_trades(strategy)`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_options_trades_status ON options_trades(status)`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_options_daily_date ON options_daily_summary(date)`);
    } catch {}
  }

  // ---------------------------------------------------------------------------
  // Record trades
  // ---------------------------------------------------------------------------

  recordEntry(trade: Omit<OptionsTradeRecord, 'exitPrice' | 'exitTime' | 'pnlDollars' | 'pnlPercent' | 'status' | 'exitReason'>): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO options_trades
        (trade_id, strategy, contract_symbol, underlying_symbol, option_type, side,
         strike, expiration, qty, entry_price, entry_time, premium_paid, premium_collected, status, catalyst)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
    `).run(
      trade.tradeId, trade.strategy, trade.contractSymbol, trade.underlyingSymbol,
      trade.optionType, trade.side, trade.strike, trade.expiration, trade.qty,
      trade.entryPrice, trade.entryTime, trade.premiumPaid, trade.premiumCollected,
      trade.catalyst,
    );
  }

  recordExit(tradeId: string, exitPrice: number, exitReason: string): void {
    const trade = this.db.prepare(`SELECT * FROM options_trades WHERE trade_id = ?`).get(tradeId) as any;
    if (!trade) return;

    const pnlPerContract = trade.side === 'buy'
      ? (exitPrice - trade.entry_price) * 100  // bought: profit if exit > entry
      : (trade.entry_price - exitPrice) * 100;  // sold: profit if exit < entry

    const pnlDollars = pnlPerContract * trade.qty;
    const pnlPercent = trade.entry_price > 0
      ? ((exitPrice - trade.entry_price) / trade.entry_price) * (trade.side === 'buy' ? 100 : -100)
      : 0;

    const exitTime = new Date().toISOString();

    this.db.prepare(`
      UPDATE options_trades
      SET exit_price = ?, exit_time = ?, pnl_dollars = ?, pnl_percent = ?,
          status = 'closed', exit_reason = ?
      WHERE trade_id = ?
    `).run(exitPrice, exitTime, pnlDollars, pnlPercent, exitReason, tradeId);

    // Update daily summary
    const date = exitTime.slice(0, 10);
    const isWin = pnlDollars > 0;

    this.db.prepare(`
      INSERT INTO options_daily_summary (date, strategy, trades, wins, losses, pnl_dollars, premium_spent, premium_collected)
      VALUES (?, ?, 1, ?, ?, ?, ?, ?)
      ON CONFLICT(date, strategy) DO UPDATE SET
        trades = trades + 1,
        wins = wins + ?,
        losses = losses + ?,
        pnl_dollars = pnl_dollars + ?,
        premium_spent = premium_spent + ?,
        premium_collected = premium_collected + ?
    `).run(
      date, trade.strategy, isWin ? 1 : 0, isWin ? 0 : 1, pnlDollars, trade.premium_paid, trade.premium_collected,
      isWin ? 1 : 0, isWin ? 0 : 1, pnlDollars, trade.premium_paid, trade.premium_collected,
    );
  }

  markExpired(tradeId: string): void {
    this.recordExit(tradeId, 0, 'expired');
  }

  // ---------------------------------------------------------------------------
  // Performance queries
  // ---------------------------------------------------------------------------

  getStrategyPerformance(strategy?: string): StrategyPerformance[] {
    const where = strategy ? `WHERE strategy = '${strategy}'` : '';
    const rows = this.db.prepare(`
      SELECT
        strategy,
        COUNT(*) as total_trades,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_trades,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed_trades,
        SUM(CASE WHEN pnl_dollars > 0 THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN pnl_dollars <= 0 AND status = 'closed' THEN 1 ELSE 0 END) as losses,
        COALESCE(SUM(pnl_dollars), 0) as total_pnl,
        COALESCE(AVG(CASE WHEN pnl_dollars > 0 THEN pnl_dollars END), 0) as avg_win,
        COALESCE(AVG(CASE WHEN pnl_dollars <= 0 AND status = 'closed' THEN pnl_dollars END), 0) as avg_loss,
        COALESCE(MAX(pnl_dollars), 0) as best_trade,
        COALESCE(MIN(pnl_dollars), 0) as worst_trade,
        COALESCE(SUM(premium_paid), 0) as total_premium_spent,
        COALESCE(SUM(premium_collected), 0) as total_premium_collected
      FROM options_trades
      ${where}
      GROUP BY strategy
      ORDER BY total_pnl DESC
    `).all() as any[];

    return rows.map(r => {
      const grossWins = r.avg_win * r.wins;
      const grossLosses = Math.abs(r.avg_loss * r.losses);
      return {
        strategy: r.strategy,
        totalTrades: r.total_trades,
        openTrades: r.open_trades,
        closedTrades: r.closed_trades,
        wins: r.wins,
        losses: r.losses,
        winRate: r.closed_trades > 0 ? (r.wins / r.closed_trades) * 100 : 0,
        totalPnl: r.total_pnl,
        avgWin: r.avg_win,
        avgLoss: r.avg_loss,
        profitFactor: grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Infinity : 0,
        bestTrade: r.best_trade,
        worstTrade: r.worst_trade,
        totalPremiumSpent: r.total_premium_spent,
        totalPremiumCollected: r.total_premium_collected,
      };
    });
  }

  getRecentTrades(limit: number = 20): any[] {
    return this.db.prepare(`
      SELECT * FROM options_trades
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);
  }

  getOpenPositions(): any[] {
    return this.db.prepare(`
      SELECT * FROM options_trades WHERE status = 'open'
      ORDER BY entry_time DESC
    `).all();
  }

  getDailySummary(days: number = 30): any[] {
    return this.db.prepare(`
      SELECT date, strategy,
        SUM(trades) as trades,
        SUM(wins) as wins,
        SUM(losses) as losses,
        SUM(pnl_dollars) as pnl,
        SUM(premium_spent) as spent,
        SUM(premium_collected) as collected
      FROM options_daily_summary
      GROUP BY date, strategy
      ORDER BY date DESC
      LIMIT ?
    `).all(days * 10); // multiple strategies per day
  }

  getTotalPnl(): { totalPnl: number; totalTrades: number; openTrades: number } {
    const row = this.db.prepare(`
      SELECT
        COALESCE(SUM(pnl_dollars), 0) as total_pnl,
        COUNT(*) as total_trades,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_trades
      FROM options_trades
    `).get() as any;

    return {
      totalPnl: row.total_pnl,
      totalTrades: row.total_trades,
      openTrades: row.open_trades,
    };
  }
}
