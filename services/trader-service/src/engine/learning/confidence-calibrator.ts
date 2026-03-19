// =============================================================================
// Confidence Calibrator — Measures conviction vs outcome alignment
// =============================================================================
// If an analyst gives 5/5 conviction but results are mediocre, penalize them.
// If conviction 2/5 trades win as often as conviction 5/5, calibration is bad.
//
// Returns a calibration report with per-bucket breakdown.
// =============================================================================

import Database from 'better-sqlite3';

export interface CalibrationBucket {
  convictionRange: [number, number];
  label: string;
  expectedWinRate: number;
  actualWinRate: number;
  tradeCount: number;
  calibrationError: number;
}

export interface CalibrationReport {
  analystId: string;
  score: number;              // 0–1 (1 = perfectly calibrated)
  buckets: CalibrationBucket[];
  recommendation: string;     // Human-readable guidance
  totalTrades: number;
}

// Expected win rates by conviction level (what SHOULD happen)
const EXPECTED_RATES: { range: [number, number]; label: string; expected: number }[] = [
  { range: [1, 2], label: 'Low (1-2)',    expected: 0.35 },
  { range: [3, 3], label: 'Medium (3)',    expected: 0.50 },
  { range: [4, 5], label: 'High (4-5)',    expected: 0.65 },
];

export class ConfidenceCalibrator {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Compute calibration report for a specific analyst.
   */
  calibrate(analystId: string): CalibrationReport {
    const buckets: CalibrationBucket[] = [];
    let totalTrades = 0;

    for (const { range, label, expected } of EXPECTED_RATES) {
      const episodes = this.db.prepare(`
        SELECT pnl_dollars FROM brain_episodes
        WHERE analyst_id = ? AND conviction >= ? AND conviction <= ?
        ORDER BY created_at DESC
        LIMIT 50
      `).all(analystId, range[0], range[1]) as any[];

      const count = episodes.length;
      totalTrades += count;

      if (count < 3) {
        buckets.push({
          convictionRange: range,
          label,
          expectedWinRate: expected,
          actualWinRate: 0,
          tradeCount: count,
          calibrationError: 0,
        });
        continue;
      }

      const wins = episodes.filter((e: any) => (e.pnl_dollars || 0) > 0).length;
      const actualWinRate = wins / count;
      const error = Math.abs(expected - actualWinRate);

      buckets.push({
        convictionRange: range,
        label,
        expectedWinRate: expected,
        actualWinRate,
        tradeCount: count,
        calibrationError: error,
      });
    }

    // Score: 1 - weighted average error (buckets with more trades matter more)
    const eligibleBuckets = buckets.filter(b => b.tradeCount >= 3);
    let score = 0.5; // neutral default

    if (eligibleBuckets.length > 0) {
      const totalWeight = eligibleBuckets.reduce((s, b) => s + b.tradeCount, 0);
      const weightedError = eligibleBuckets.reduce(
        (s, b) => s + b.calibrationError * b.tradeCount, 0
      ) / totalWeight;
      score = Math.max(0, Math.min(1, 1 - weightedError * 2));
    }

    // Recommendation
    let recommendation: string;
    if (totalTrades < 10) {
      recommendation = 'Insufficient data for calibration assessment. Need 10+ trades.';
    } else if (score >= 0.8) {
      recommendation = 'Well calibrated — conviction levels align with outcomes. Trust this analyst\'s confidence levels.';
    } else if (score >= 0.6) {
      recommendation = 'Moderately calibrated — some conviction drift. High-conviction calls may be overstated.';
    } else if (score >= 0.4) {
      recommendation = 'Poorly calibrated — conviction does not predict outcome. Downweight this analyst\'s conviction scores.';
    } else {
      recommendation = 'Inversely calibrated — high conviction UNDERPERFORMS low conviction. Consider inverting conviction weighting for this analyst.';
    }

    return { analystId, score, buckets, recommendation, totalTrades };
  }

  /**
   * Calibrate all analysts at once.
   */
  calibrateAll(): CalibrationReport[] {
    const analysts = this.db.prepare(
      'SELECT DISTINCT analyst_id FROM brain_episodes WHERE conviction IS NOT NULL'
    ).all() as any[];

    return analysts.map((a: any) => this.calibrate(a.analyst_id));
  }
}
