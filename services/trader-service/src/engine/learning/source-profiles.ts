// =============================================================================
// Source Profiler — Rolling reliability metrics for each signal source
// =============================================================================
// Computes per-source (strategy or analyst) reliability profiles:
//   - Trailing expectancy (avg $ per trade, last 30 trades)
//   - Rolling win rate
//   - Rolling Sharpe proxy
//   - Calibration score (conviction vs outcome alignment)
//   - Regime-conditioned performance stats
//   - Composite reliability score (0–1)
//
// Used by:
//   - scoring.ts (calcStrategyEdgeScore, calcAnalystQualityScore)
//   - panel-aggregator (weight analysts by reliability)
//   - brain-context.ts (inject profile into analyst prompts)
//   - distillation-v2 (daily weight updates)
// =============================================================================

import Database from 'better-sqlite3';
import { AttributionStore } from '../allocation/attribution-store';

export interface SourceProfile {
  sourceId: string;
  sourceName: string;
  sourceType: 'strategy' | 'ai_panel';

  // Rolling stats
  trailingExpectancy: number;    // avg $ per trade (last 30 trades)
  trailingWinRate: number;       // 0–1
  rollingSharpe: number;         // simplified: mean PnL% / stddev PnL%

  // Calibration (for AI analysts)
  calibrationScore: number;      // 0–1 (1 = conviction predicts outcome well)

  // Regime-conditioned
  regimeStats: Record<string, {
    expectancy: number;
    winRate: number;
    tradeCount: number;
  }>;

  // Composite
  reliabilityScore: number;      // 0–1, used as source weight
  tradeCount: number;

  lastUpdated: Date;
}

export class SourceProfiler {
  private db: Database.Database;
  private attrStore: AttributionStore;
  private cache: Map<string, SourceProfile> = new Map();

  constructor(db: Database.Database, attrStore: AttributionStore) {
    this.db = db;
    this.attrStore = attrStore;
    this.ensureTable();
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS source_profiles (
        source_id TEXT PRIMARY KEY,
        source_name TEXT NOT NULL,
        source_type TEXT NOT NULL,
        trailing_expectancy REAL DEFAULT 0,
        trailing_win_rate REAL DEFAULT 0,
        rolling_sharpe REAL DEFAULT 0,
        calibration_score REAL DEFAULT 0.5,
        regime_stats_json TEXT,
        reliability_score REAL DEFAULT 0.5,
        trade_count INTEGER DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Get a source's profile (from cache or DB). Falls back to default if not yet computed.
   */
  getProfile(sourceId: string): SourceProfile {
    // Check cache
    const cached = this.cache.get(sourceId);
    if (cached && (Date.now() - cached.lastUpdated.getTime()) < 3600_000) {
      return cached;
    }

    // Check DB
    const row = this.db.prepare(
      'SELECT * FROM source_profiles WHERE source_id = ?'
    ).get(sourceId) as any;

    if (row) {
      const profile = this.rowToProfile(row);
      this.cache.set(sourceId, profile);
      return profile;
    }

    // Default profile for unknown source
    return {
      sourceId,
      sourceName: sourceId,
      sourceType: 'strategy',
      trailingExpectancy: 0,
      trailingWinRate: 0.5,
      rollingSharpe: 0,
      calibrationScore: 0.5,
      regimeStats: {},
      reliabilityScore: 0.5,
      tradeCount: 0,
      lastUpdated: new Date(),
    };
  }

  /**
   * Get all source profiles.
   */
  getAllProfiles(): SourceProfile[] {
    const rows = this.db.prepare(
      'SELECT * FROM source_profiles ORDER BY reliability_score DESC'
    ).all() as any[];
    return rows.map(r => this.rowToProfile(r));
  }

  /**
   * Recompute and persist profiles for ALL sources.
   * Called daily during distillation.
   */
  updateAllProfiles(): number {
    let updated = 0;

    // Find all unique sources from brain_episodes
    const sources = this.db.prepare(`
      SELECT DISTINCT analyst_id as source_id FROM brain_episodes
      UNION
      SELECT DISTINCT source_id FROM trade_candidates
    `).all() as any[];

    for (const { source_id } of sources) {
      if (!source_id) continue;
      try {
        this.computeAndPersist(source_id);
        updated++;
      } catch (e: any) {
        console.warn(`Source profile update failed for ${source_id}:`, e.message);
      }
    }

    // Clear cache so next reads get fresh data
    this.cache.clear();

    return updated;
  }

  /**
   * Get the regime-conditioned expectancy for a source.
   */
  getRegimeExpectancy(sourceId: string, regimeLabel: string): number | null {
    const profile = this.getProfile(sourceId);
    return profile.regimeStats[regimeLabel]?.expectancy ?? null;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Compute
  // ───────────────────────────────────────────────────────────────────────────

  private computeAndPersist(sourceId: string): void {
    // Get recent episodes for this source (last 50 trades)
    const episodes = this.db.prepare(`
      SELECT be.*, tc.regime_label, tc.source as tc_source
      FROM brain_episodes be
      LEFT JOIN trade_candidates tc ON tc.candidate_id = be.candidate_id
      WHERE be.analyst_id = ? OR tc.source_id = ?
      ORDER BY be.created_at DESC
      LIMIT 50
    `).all(sourceId, sourceId) as any[];

    if (episodes.length === 0) return;

    // Determine source type
    const sourceType = episodes.some((e: any) => e.tc_source === 'strategy') ? 'strategy' : 'ai_panel';
    const sourceName = sourceId; // Could be looked up from a registry

    // Trailing expectancy
    const pnls = episodes.map((e: any) => e.pnl_dollars || 0);
    const trailingExpectancy = pnls.reduce((s: number, v: number) => s + v, 0) / pnls.length;

    // Win rate
    const wins = episodes.filter((e: any) => (e.pnl_dollars || 0) > 0).length;
    const trailingWinRate = episodes.length > 0 ? wins / episodes.length : 0.5;

    // Rolling Sharpe (simplified: mean PnL% / stddev PnL%)
    const pnlPcts = episodes.map((e: any) => e.pnl_percent || 0);
    const mean = pnlPcts.reduce((a: number, b: number) => a + b, 0) / (pnlPcts.length || 1);
    const variance = pnlPcts.reduce((s: number, v: number) => s + (v - mean) ** 2, 0) / (pnlPcts.length || 1);
    const stddev = Math.sqrt(variance);
    const rollingSharpe = stddev > 0 ? mean / stddev : 0;

    // Calibration score (conviction vs outcome)
    const calibrationScore = this.computeCalibration(episodes);

    // Regime stats
    const regimeStats: Record<string, { expectancy: number; winRate: number; tradeCount: number }> = {};
    const byRegime = new Map<string, any[]>();
    for (const ep of episodes) {
      const regime = ep.regime_label || 'unknown';
      const existing = byRegime.get(regime) || [];
      existing.push(ep);
      byRegime.set(regime, existing);
    }
    for (const [regime, eps] of byRegime) {
      const regimeWins = eps.filter((e: any) => (e.pnl_dollars || 0) > 0).length;
      const regimeExpectancy = eps.reduce((s: number, e: any) => s + (e.pnl_dollars || 0), 0) / eps.length;
      regimeStats[regime] = {
        expectancy: regimeExpectancy,
        winRate: eps.length > 0 ? regimeWins / eps.length : 0.5,
        tradeCount: eps.length,
      };
    }

    // Composite reliability: weighted blend
    // 40% win rate + 25% Sharpe direction + 20% calibration + 15% trade count confidence
    const winComponent = Math.min(1.0, Math.max(0, trailingWinRate));
    const sharpeComponent = rollingSharpe > 0 ? Math.min(1.0, rollingSharpe / 2) : Math.max(0, 0.5 + rollingSharpe / 4);
    const calibComponent = calibrationScore;
    const countConfidence = Math.min(1.0, episodes.length / 30);

    const reliabilityScore = Math.max(0.1, Math.min(1.0,
      0.40 * winComponent +
      0.25 * sharpeComponent +
      0.20 * calibComponent +
      0.15 * countConfidence
    ));

    // Persist
    this.db.prepare(`
      INSERT INTO source_profiles (source_id, source_name, source_type,
        trailing_expectancy, trailing_win_rate, rolling_sharpe, calibration_score,
        regime_stats_json, reliability_score, trade_count, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(source_id) DO UPDATE SET
        source_name = excluded.source_name,
        source_type = excluded.source_type,
        trailing_expectancy = excluded.trailing_expectancy,
        trailing_win_rate = excluded.trailing_win_rate,
        rolling_sharpe = excluded.rolling_sharpe,
        calibration_score = excluded.calibration_score,
        regime_stats_json = excluded.regime_stats_json,
        reliability_score = excluded.reliability_score,
        trade_count = excluded.trade_count,
        updated_at = excluded.updated_at
    `).run(
      sourceId, sourceName, sourceType,
      trailingExpectancy, trailingWinRate, rollingSharpe, calibrationScore,
      JSON.stringify(regimeStats), reliabilityScore, episodes.length,
    );
  }

  /**
   * Calibration: does conviction predict outcome?
   * Buckets: low conviction (1–2) should have ~35% win rate,
   *          medium (3) ~50%, high (4–5) ~65%.
   * Score = 1 - avg |expected - actual| across buckets.
   */
  private computeCalibration(episodes: any[]): number {
    const buckets: { expected: number; actual: number[] }[] = [
      { expected: 0.35, actual: [] }, // conviction 1-2
      { expected: 0.50, actual: [] }, // conviction 3
      { expected: 0.65, actual: [] }, // conviction 4-5
    ];

    for (const ep of episodes) {
      const conv = ep.conviction || 3;
      const won = (ep.pnl_dollars || 0) > 0 ? 1 : 0;

      if (conv <= 2) buckets[0].actual.push(won);
      else if (conv === 3) buckets[1].actual.push(won);
      else buckets[2].actual.push(won);
    }

    let totalError = 0;
    let bucketCount = 0;
    for (const bucket of buckets) {
      if (bucket.actual.length < 3) continue; // Skip buckets with too few trades
      const actualRate = bucket.actual.reduce((s, v) => s + v, 0) / bucket.actual.length;
      totalError += Math.abs(bucket.expected - actualRate);
      bucketCount++;
    }

    if (bucketCount === 0) return 0.5; // No data → neutral
    const avgError = totalError / bucketCount;
    return Math.max(0, 1 - avgError * 2); // Scale: 0% error → 1.0, 50% error → 0.0
  }

  private rowToProfile(row: any): SourceProfile {
    return {
      sourceId: row.source_id,
      sourceName: row.source_name,
      sourceType: row.source_type,
      trailingExpectancy: row.trailing_expectancy,
      trailingWinRate: row.trailing_win_rate,
      rollingSharpe: row.rolling_sharpe,
      calibrationScore: row.calibration_score,
      regimeStats: row.regime_stats_json ? JSON.parse(row.regime_stats_json) : {},
      reliabilityScore: row.reliability_score,
      tradeCount: row.trade_count,
      lastUpdated: new Date(row.updated_at),
    };
  }
}
