// =============================================================================
// Attribution Store — SQL tables + queries for regime, candidates, decisions,
// and daily performance attribution by dimension.
// =============================================================================
// Uses the same SQLite database as BrainStore (via brain.getDatabase()).
// All tables are created idempotently in ensureTables().
// =============================================================================

import Database from 'better-sqlite3';
import { RegimeSnapshot, TradeCandidate, TradeDecision, AttributionRecord } from './types';

export class AttributionStore {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.ensureTables();
    console.log('✓ Attribution Store: Ready');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Schema
  // ───────────────────────────────────────────────────────────────────────────

  private ensureTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS regime_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL,
        vix REAL,
        fear_greed_score REAL,
        spy_trend TEXT,
        spy_price REAL,
        spy_50d_ma REAL,
        spy_200d_ma REAL,
        ten_year_yield REAL,
        confidence REAL DEFAULT 0,
        raw_inputs_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS trade_candidates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        candidate_id TEXT NOT NULL UNIQUE,
        source TEXT NOT NULL,
        source_id TEXT NOT NULL,
        source_name TEXT NOT NULL,
        run_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
        signal_strength REAL NOT NULL,
        opportunity_type TEXT,
        horizon TEXT,
        thesis TEXT,
        risks TEXT,
        catalysts_json TEXT,
        target_price REAL,
        stop_loss REAL,
        signal_price REAL,
        features_json TEXT,
        regime_label TEXT NOT NULL,
        regime_snapshot_id INTEGER REFERENCES regime_snapshots(id),
        analyst_count INTEGER DEFAULT 1,
        avg_conviction REAL,
        max_conviction REAL,
        composite_score REAL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS trade_decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        decision_id TEXT NOT NULL UNIQUE,
        candidate_id TEXT NOT NULL,
        action TEXT NOT NULL,
        allocator_score REAL,
        strategy_edge_score REAL,
        setup_quality_score REAL,
        symbol_quality_score REAL,
        regime_fit_score REAL,
        analyst_quality_score REAL,
        requested_qty REAL,
        approved_qty REAL,
        dollar_value REAL,
        risk_passed INTEGER NOT NULL DEFAULT 1,
        risk_reason TEXT,
        executed INTEGER NOT NULL DEFAULT 0,
        order_id TEXT,
        broker_order_id TEXT,
        reasons_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS perf_attribution (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        dimension TEXT NOT NULL,
        dimension_value TEXT NOT NULL,
        trade_count INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        total_pnl_dollars REAL DEFAULT 0,
        total_pnl_percent REAL DEFAULT 0,
        avg_hold_days REAL DEFAULT 0,
        avg_conviction REAL DEFAULT 0,
        win_rate REAL DEFAULT 0,
        expectancy REAL DEFAULT 0,
        sharpe_approx REAL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(date, dimension, dimension_value)
      );

      CREATE INDEX IF NOT EXISTS idx_regime_created ON regime_snapshots(created_at);
      CREATE INDEX IF NOT EXISTS idx_cand_symbol ON trade_candidates(symbol, created_at);
      CREATE INDEX IF NOT EXISTS idx_cand_source ON trade_candidates(source, source_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_cand_run ON trade_candidates(run_id);
      CREATE INDEX IF NOT EXISTS idx_cand_regime ON trade_candidates(regime_label, created_at);
      CREATE INDEX IF NOT EXISTS idx_dec_candidate ON trade_decisions(candidate_id);
      CREATE INDEX IF NOT EXISTS idx_dec_action ON trade_decisions(action, created_at);
      CREATE INDEX IF NOT EXISTS idx_attr_dim ON perf_attribution(dimension, dimension_value, date);
      CREATE INDEX IF NOT EXISTS idx_attr_date ON perf_attribution(date);
    `);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Regime
  // ───────────────────────────────────────────────────────────────────────────

  insertRegimeSnapshot(snapshot: RegimeSnapshot): number {
    const stmt = this.db.prepare(`
      INSERT INTO regime_snapshots (label, vix, fear_greed_score, spy_trend, spy_price,
        spy_50d_ma, spy_200d_ma, ten_year_yield, confidence, raw_inputs_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      snapshot.label,
      snapshot.vix,
      snapshot.fearGreedScore,
      snapshot.spyTrend,
      snapshot.spyPrice,
      snapshot.spy50dMA,
      snapshot.spy200dMA,
      snapshot.tenYearYield,
      snapshot.confidence,
      JSON.stringify(snapshot.rawInputs),
    );
    return result.lastInsertRowid as number;
  }

  getLatestRegime(): RegimeSnapshot | null {
    const row = this.db.prepare(
      'SELECT * FROM regime_snapshots ORDER BY created_at DESC LIMIT 1'
    ).get() as any;
    return row ? this.rowToRegime(row) : null;
  }

  getRegimeHistory(limit: number = 50): RegimeSnapshot[] {
    const rows = this.db.prepare(
      'SELECT * FROM regime_snapshots ORDER BY created_at DESC LIMIT ?'
    ).all(limit) as any[];
    return rows.map(r => this.rowToRegime(r));
  }

  private rowToRegime(row: any): RegimeSnapshot {
    return {
      id: row.id,
      timestamp: new Date(row.created_at),
      label: row.label,
      vix: row.vix,
      fearGreedScore: row.fear_greed_score,
      spyTrend: row.spy_trend,
      spyPrice: row.spy_price,
      spy50dMA: row.spy_50d_ma,
      spy200dMA: row.spy_200d_ma,
      tenYearYield: row.ten_year_yield,
      confidence: row.confidence,
      rawInputs: row.raw_inputs_json ? JSON.parse(row.raw_inputs_json) : {},
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Candidates
  // ───────────────────────────────────────────────────────────────────────────

  insertCandidate(c: TradeCandidate): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO trade_candidates (candidate_id, source, source_id, source_name, run_id,
        symbol, side, signal_strength, opportunity_type, horizon, thesis, risks,
        catalysts_json, target_price, stop_loss, signal_price, features_json,
        regime_label, regime_snapshot_id, analyst_count, avg_conviction, max_conviction,
        composite_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      c.candidateId, c.source, c.sourceId, c.sourceName, c.runId,
      c.symbol, c.side, c.signalStrength,
      c.opportunityType || null, c.horizon || null,
      c.thesis || null, c.risks || null,
      c.catalysts ? JSON.stringify(c.catalysts) : null,
      c.targetPrice ?? null, c.stopLoss ?? null,
      c.signalPrice ?? null,
      c.strategyFeatures ? JSON.stringify(c.strategyFeatures) : null,
      c.regimeLabel, c.regimeSnapshotId ?? null,
      c.analystCount ?? 1, c.avgConviction ?? null, c.maxConviction ?? null,
      c.compositeScore ?? null,
    );
  }

  getCandidateById(candidateId: string): TradeCandidate | null {
    const row = this.db.prepare(
      'SELECT * FROM trade_candidates WHERE candidate_id = ?'
    ).get(candidateId) as any;
    return row ? this.rowToCandidate(row) : null;
  }

  getRecentCandidates(limit: number = 50): any[] {
    return this.db.prepare(
      'SELECT * FROM trade_candidates ORDER BY created_at DESC LIMIT ?'
    ).all(limit);
  }

  getCandidatesByRun(runId: string): any[] {
    return this.db.prepare(
      'SELECT * FROM trade_candidates WHERE run_id = ? ORDER BY composite_score DESC'
    ).all(runId);
  }

  private rowToCandidate(row: any): TradeCandidate {
    return {
      candidateId: row.candidate_id,
      source: row.source,
      sourceId: row.source_id,
      sourceName: row.source_name,
      runId: row.run_id,
      symbol: row.symbol,
      side: row.side,
      signalStrength: row.signal_strength,
      opportunityType: row.opportunity_type,
      horizon: row.horizon,
      thesis: row.thesis,
      risks: row.risks,
      catalysts: row.catalysts_json ? JSON.parse(row.catalysts_json) : undefined,
      targetPrice: row.target_price,
      stopLoss: row.stop_loss,
      signalPrice: row.signal_price,
      strategyFeatures: row.features_json ? JSON.parse(row.features_json) : undefined,
      regimeLabel: row.regime_label,
      regimeSnapshotId: row.regime_snapshot_id,
      analystCount: row.analyst_count,
      avgConviction: row.avg_conviction,
      maxConviction: row.max_conviction,
      compositeScore: row.composite_score,
      createdAt: new Date(row.created_at),
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Decisions
  // ───────────────────────────────────────────────────────────────────────────

  insertDecision(d: TradeDecision): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO trade_decisions (decision_id, candidate_id, action,
        allocator_score, strategy_edge_score, setup_quality_score, symbol_quality_score,
        regime_fit_score, analyst_quality_score, requested_qty, approved_qty, dollar_value,
        risk_passed, risk_reason, executed, order_id, broker_order_id, reasons_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      d.decisionId, d.candidateId, d.action,
      d.allocatorScore ?? null, d.strategyEdgeScore ?? null,
      d.setupQualityScore ?? null, d.symbolQualityScore ?? null,
      d.regimeFitScore ?? null, d.analystQualityScore ?? null,
      d.requestedQty ?? null, d.approvedQty ?? null, d.dollarValue ?? null,
      d.riskPassed ? 1 : 0, d.riskReason || null,
      d.executed ? 1 : 0, d.orderId || null, d.brokerOrderId || null,
      JSON.stringify(d.reasons),
    );
  }

  getRecentDecisions(limit: number = 50, action?: string): any[] {
    if (action) {
      return this.db.prepare(
        'SELECT * FROM trade_decisions WHERE action = ? ORDER BY created_at DESC LIMIT ?'
      ).all(action, limit);
    }
    return this.db.prepare(
      'SELECT * FROM trade_decisions ORDER BY created_at DESC LIMIT ?'
    ).all(limit);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Attribution
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Rebuild attribution for a given date by scanning brain_episodes
   * joined to trade_candidates. Call daily after market close.
   */
  rebuildAttribution(date: string): void {
    // Build attribution across 5 dimensions from episodes with linked candidates
    const dimensions: { dim: string; sql: string }[] = [
      {
        dim: 'strategy',
        sql: `SELECT tc.source_id AS dim_val, be.*
              FROM brain_episodes be
              JOIN trade_candidates tc ON tc.candidate_id = be.candidate_id
              WHERE date(be.created_at) = ? AND tc.source = 'strategy'`,
      },
      {
        dim: 'analyst',
        sql: `SELECT be.analyst_id AS dim_val, be.*
              FROM brain_episodes be
              WHERE date(be.created_at) = ?`,
      },
      {
        dim: 'symbol',
        sql: `SELECT be.symbol AS dim_val, be.*
              FROM brain_episodes be
              WHERE date(be.created_at) = ?`,
      },
      {
        dim: 'setup',
        sql: `SELECT COALESCE(tc.opportunity_type, be.opportunity_type, 'unknown') AS dim_val, be.*
              FROM brain_episodes be
              LEFT JOIN trade_candidates tc ON tc.candidate_id = be.candidate_id
              WHERE date(be.created_at) = ?`,
      },
      {
        dim: 'regime',
        sql: `SELECT COALESCE(tc.regime_label, 'unknown') AS dim_val, be.*
              FROM brain_episodes be
              LEFT JOIN trade_candidates tc ON tc.candidate_id = be.candidate_id
              WHERE date(be.created_at) = ?`,
      },
    ];

    const upsert = this.db.prepare(`
      INSERT INTO perf_attribution (date, dimension, dimension_value,
        trade_count, wins, losses, total_pnl_dollars, total_pnl_percent,
        avg_hold_days, avg_conviction, win_rate, expectancy, sharpe_approx)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date, dimension, dimension_value) DO UPDATE SET
        trade_count = excluded.trade_count,
        wins = excluded.wins,
        losses = excluded.losses,
        total_pnl_dollars = excluded.total_pnl_dollars,
        total_pnl_percent = excluded.total_pnl_percent,
        avg_hold_days = excluded.avg_hold_days,
        avg_conviction = excluded.avg_conviction,
        win_rate = excluded.win_rate,
        expectancy = excluded.expectancy,
        sharpe_approx = excluded.sharpe_approx
    `);

    for (const { dim, sql } of dimensions) {
      try {
        const rows = this.db.prepare(sql).all(date) as any[];
        if (rows.length === 0) continue;

        // Group by dimension value
        const groups = new Map<string, any[]>();
        for (const row of rows) {
          const key = row.dim_val || 'unknown';
          const existing = groups.get(key) || [];
          existing.push(row);
          groups.set(key, existing);
        }

        for (const [dimVal, episodes] of groups) {
          const tradeCount = episodes.length;
          const wins = episodes.filter((e: any) => (e.pnl_dollars || 0) > 0).length;
          const losses = episodes.filter((e: any) => (e.pnl_dollars || 0) < 0).length;
          const totalPnl = episodes.reduce((s: number, e: any) => s + (e.pnl_dollars || 0), 0);
          const totalPnlPct = episodes.reduce((s: number, e: any) => s + (e.pnl_percent || 0), 0);
          const avgHold = tradeCount > 0
            ? episodes.reduce((s: number, e: any) => s + (e.hold_days || 0), 0) / tradeCount
            : 0;
          const avgConv = tradeCount > 0
            ? episodes.reduce((s: number, e: any) => s + (e.conviction || 0), 0) / tradeCount
            : 0;
          const winRate = tradeCount > 0 ? wins / tradeCount : 0;
          const expectancy = tradeCount > 0 ? totalPnl / tradeCount : 0;

          // Simplified Sharpe: mean PnL% / stddev PnL%
          const pnlPcts = episodes.map((e: any) => e.pnl_percent || 0);
          const meanPct = pnlPcts.reduce((a: number, b: number) => a + b, 0) / (pnlPcts.length || 1);
          const variance = pnlPcts.reduce((s: number, v: number) => s + (v - meanPct) ** 2, 0) / (pnlPcts.length || 1);
          const stddev = Math.sqrt(variance);
          const sharpe = stddev > 0 ? meanPct / stddev : 0;

          upsert.run(date, dim, dimVal, tradeCount, wins, losses, totalPnl, totalPnlPct,
            avgHold, avgConv, winRate, expectancy, sharpe);
        }
      } catch (e: any) {
        console.warn(`Attribution rebuild (${dim}) failed:`, e.message);
      }
    }
  }

  getAttributionByDimension(dimension: string, days: number = 30): AttributionRecord[] {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    return this.db.prepare(`
      SELECT * FROM perf_attribution
      WHERE dimension = ? AND date >= ?
      ORDER BY date DESC, expectancy DESC
    `).all(dimension, cutoffStr) as AttributionRecord[];
  }

  getAttributionForValue(dimension: string, value: string, days: number = 30): AttributionRecord[] {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    return this.db.prepare(`
      SELECT * FROM perf_attribution
      WHERE dimension = ? AND dimension_value = ? AND date >= ?
      ORDER BY date DESC
    `).all(dimension, value, cutoffStr) as AttributionRecord[];
  }

  /**
   * Get attribution summary: aggregate across all dates for each dimension value.
   */
  getAttributionSummary(dimension: string, days: number = 30): any[] {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    return this.db.prepare(`
      SELECT dimension_value,
        SUM(trade_count) as trade_count,
        SUM(wins) as wins,
        SUM(losses) as losses,
        SUM(total_pnl_dollars) as total_pnl_dollars,
        CASE WHEN SUM(trade_count) > 0 THEN CAST(SUM(wins) AS REAL) / SUM(trade_count) ELSE 0 END as win_rate,
        CASE WHEN SUM(trade_count) > 0 THEN SUM(total_pnl_dollars) / SUM(trade_count) ELSE 0 END as expectancy,
        AVG(avg_hold_days) as avg_hold_days,
        AVG(avg_conviction) as avg_conviction
      FROM perf_attribution
      WHERE dimension = ? AND date >= ?
      GROUP BY dimension_value
      ORDER BY total_pnl_dollars DESC
    `).all(dimension, cutoffStr);
  }
}
