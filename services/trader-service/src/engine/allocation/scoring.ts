// =============================================================================
// Scoring Engine — Component score calculators for the Capital Allocator
// =============================================================================
// Each scorer returns 0–100. The allocator combines them with configurable weights.
// All scores read from perf_attribution table (built by Sprint 1).
//
// When attribution data is sparse (< 5 trades), scores default to 50 (neutral).
// =============================================================================

import { TradeCandidate } from './types';
import { AttributionStore } from './attribution-store';
import { SourceProfiler, SourceProfile } from '../learning/source-profiles';

const MIN_SAMPLE = 5;    // Minimum trades before we trust the data
const DEFAULT_SCORE = 50; // Neutral score when data is insufficient

export interface ComponentScores {
  strategyEdge: number;
  setupQuality: number;
  symbolQuality: number;
  regimeFit: number;
  analystQuality: number;
  composite: number;
  raw: Record<string, any>;
}

export interface ScoringWeights {
  strategyEdge: number;
  setupQuality: number;
  symbolQuality: number;
  regimeFit: number;
  analystQuality: number;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  strategyEdge: 0.30,
  setupQuality: 0.20,
  symbolQuality: 0.15,
  regimeFit: 0.20,
  analystQuality: 0.15,
};

/**
 * Score a candidate across all 5 dimensions, return composite + components.
 * When a SourceProfiler is provided, uses pre-computed profiles for more accurate scoring.
 */
export function scoreCandidate(
  candidate: TradeCandidate,
  attrStore: AttributionStore,
  weights: ScoringWeights = DEFAULT_WEIGHTS,
  profiler?: SourceProfiler | null,
): ComponentScores {
  // If profiler available, use pre-computed profiles for edge + analyst scores
  const profile = profiler ? profiler.getProfile(candidate.sourceId) : null;

  const strategyEdge = profile
    ? calcEdgeFromProfile(profile)
    : calcStrategyEdgeScore(candidate.sourceId, attrStore);
  const setupQuality = calcSetupQualityScore(candidate.opportunityType, attrStore);
  const symbolQuality = calcSymbolQualityScore(candidate.symbol, attrStore);
  const regimeFit = profile
    ? calcRegimeFitFromProfile(profile, candidate.regimeLabel)
    : calcRegimeFitScore(candidate.sourceId, candidate.regimeLabel, attrStore);
  const analystQuality = candidate.source === 'ai_panel'
    ? (profile ? calcAnalystFromProfile(profile) : calcAnalystQualityScore(candidate.sourceId, attrStore))
    : DEFAULT_SCORE;

  const composite = Math.round(
    weights.strategyEdge * strategyEdge +
    weights.setupQuality * setupQuality +
    weights.symbolQuality * symbolQuality +
    weights.regimeFit * regimeFit +
    weights.analystQuality * analystQuality
  );

  return {
    strategyEdge,
    setupQuality,
    symbolQuality,
    regimeFit,
    analystQuality,
    composite: Math.max(0, Math.min(100, composite)),
    raw: {
      sourceId: candidate.sourceId,
      symbol: candidate.symbol,
      opportunityType: candidate.opportunityType,
      regimeLabel: candidate.regimeLabel,
      signalStrength: candidate.signalStrength,
      compositeScore: candidate.compositeScore,
    },
  };
}

// ── Individual Scorers ────────────────────────────────────────────────────────

/**
 * Strategy/Source Edge Score (0–100)
 * Based on: trailing win rate + expectancy + trade count confidence.
 */
export function calcStrategyEdgeScore(sourceId: string, attrStore: AttributionStore): number {
  // Query by strategy OR analyst dimension (source could be either)
  const stratRows = attrStore.getAttributionSummary('strategy', 30);
  const analystRows = attrStore.getAttributionSummary('analyst', 30);

  // Find matching row — sourceId could be a strategy UUID or an analyst ID
  const match = [...stratRows, ...analystRows].find(
    (r: any) => r.dimension_value === sourceId
  ) as any;

  if (!match || match.trade_count < MIN_SAMPLE) return DEFAULT_SCORE;

  // Win rate component: 30% win → 0, 50% → 50, 70%+ → 100
  const winRateScore = Math.min(100, Math.max(0, (match.win_rate - 0.3) / 0.4 * 100));

  // Expectancy component: negative → 0-30, zero → 50, positive → 50-100
  const expectancyScore = match.expectancy > 0
    ? Math.min(100, 50 + match.expectancy * 10)
    : Math.max(0, 50 + match.expectancy * 10);

  // Confidence: more trades → more trust (asymptotic to 1.0 at 50 trades)
  const confidence = Math.min(1.0, match.trade_count / 50);

  // Blend: 60% win rate + 40% expectancy, scaled by confidence
  const raw = 0.6 * winRateScore + 0.4 * expectancyScore;
  return Math.round(DEFAULT_SCORE + (raw - DEFAULT_SCORE) * confidence);
}

/**
 * Setup/Opportunity Type Quality Score (0–100)
 * How well has this type of trade performed historically?
 */
export function calcSetupQualityScore(opportunityType: string | undefined, attrStore: AttributionStore): number {
  if (!opportunityType) return DEFAULT_SCORE;

  const rows = attrStore.getAttributionSummary('setup', 30);
  const match = rows.find((r: any) => r.dimension_value === opportunityType) as any;

  if (!match || match.trade_count < MIN_SAMPLE) return DEFAULT_SCORE;

  const winRateScore = Math.min(100, Math.max(0, (match.win_rate - 0.3) / 0.4 * 100));
  const confidence = Math.min(1.0, match.trade_count / 30);

  return Math.round(DEFAULT_SCORE + (winRateScore - DEFAULT_SCORE) * confidence);
}

/**
 * Symbol Quality Score (0–100)
 * Per-symbol historical performance.
 */
export function calcSymbolQualityScore(symbol: string, attrStore: AttributionStore): number {
  const rows = attrStore.getAttributionSummary('symbol', 30);
  const match = rows.find((r: any) => r.dimension_value === symbol) as any;

  if (!match || match.trade_count < MIN_SAMPLE) return DEFAULT_SCORE;

  const winRateScore = Math.min(100, Math.max(0, (match.win_rate - 0.25) / 0.5 * 100));
  const expectancyBonus = match.expectancy > 0 ? Math.min(20, match.expectancy * 5) : Math.max(-20, match.expectancy * 5);
  const confidence = Math.min(1.0, match.trade_count / 20);

  const raw = winRateScore + expectancyBonus;
  return Math.round(Math.max(0, Math.min(100, DEFAULT_SCORE + (raw - DEFAULT_SCORE) * confidence)));
}

/**
 * Regime Fit Score (0–100)
 * How well does this source perform in the CURRENT market regime?
 */
export function calcRegimeFitScore(sourceId: string, regimeLabel: string, attrStore: AttributionStore): number {
  if (regimeLabel === 'unknown') return DEFAULT_SCORE;

  // Get regime-specific attribution
  const rows = attrStore.getAttributionSummary('regime', 30);
  const match = rows.find((r: any) => r.dimension_value === regimeLabel) as any;

  if (!match || match.trade_count < MIN_SAMPLE) return DEFAULT_SCORE;

  // Simple: if this regime has been profitable, score higher
  const winRateScore = Math.min(100, Math.max(0, (match.win_rate - 0.3) / 0.4 * 100));
  const expectancyBonus = match.expectancy > 0 ? 15 : -15;
  const confidence = Math.min(1.0, match.trade_count / 20);

  const raw = winRateScore + expectancyBonus;
  return Math.round(Math.max(0, Math.min(100, DEFAULT_SCORE + (raw - DEFAULT_SCORE) * confidence)));
}

/**
 * Analyst Quality Score (0–100)
 * For AI panel picks: calibration, hit rate, cost efficiency.
 * For strategies: returns DEFAULT_SCORE.
 */
export function calcAnalystQualityScore(analystId: string, attrStore: AttributionStore): number {
  // sourceId for panel picks is "analyst1,analyst2" — check each
  const analystIds = analystId.split(',');

  const rows = attrStore.getAttributionSummary('analyst', 30);
  const matches = rows.filter((r: any) => analystIds.includes(r.dimension_value)) as any[];

  if (matches.length === 0) return DEFAULT_SCORE;

  // Average across contributing analysts
  const avgWinRate = matches.reduce((s: number, m: any) => s + (m.win_rate || 0), 0) / matches.length;
  const avgExpectancy = matches.reduce((s: number, m: any) => s + (m.expectancy || 0), 0) / matches.length;
  const totalTrades = matches.reduce((s: number, m: any) => s + (m.trade_count || 0), 0);

  if (totalTrades < MIN_SAMPLE) return DEFAULT_SCORE;

  const winRateScore = Math.min(100, Math.max(0, (avgWinRate - 0.3) / 0.4 * 100));
  const confidence = Math.min(1.0, totalTrades / 40);

  return Math.round(DEFAULT_SCORE + (winRateScore - DEFAULT_SCORE) * confidence);
}

// ── Profile-based scorers (Sprint 3: use pre-computed SourceProfile) ────────

/**
 * Strategy edge from SourceProfile (replaces calcStrategyEdgeScore when profile exists).
 */
export function calcEdgeFromProfile(profile: SourceProfile): number {
  if (profile.tradeCount < MIN_SAMPLE) return DEFAULT_SCORE;

  const reliabilityComponent = profile.reliabilityScore * 100;
  const winComponent = Math.min(100, Math.max(0, (profile.trailingWinRate - 0.3) / 0.4 * 100));
  const sharpeBonus = profile.rollingSharpe > 0 ? Math.min(15, profile.rollingSharpe * 15) : Math.max(-15, profile.rollingSharpe * 10);

  const confidence = Math.min(1.0, profile.tradeCount / 30);
  const raw = 0.5 * reliabilityComponent + 0.35 * winComponent + sharpeBonus;

  return Math.round(Math.max(0, Math.min(100, DEFAULT_SCORE + (raw - DEFAULT_SCORE) * confidence)));
}

/**
 * Regime fit from SourceProfile's regime_stats.
 */
export function calcRegimeFitFromProfile(profile: SourceProfile, regimeLabel: string): number {
  if (regimeLabel === 'unknown' || profile.tradeCount < MIN_SAMPLE) return DEFAULT_SCORE;

  const regimeStat = profile.regimeStats[regimeLabel];
  if (!regimeStat || regimeStat.tradeCount < 3) return DEFAULT_SCORE;

  const winScore = Math.min(100, Math.max(0, (regimeStat.winRate - 0.3) / 0.4 * 100));
  const expectancyBonus = regimeStat.expectancy > 0 ? 15 : -15;
  const confidence = Math.min(1.0, regimeStat.tradeCount / 10);

  const raw = winScore + expectancyBonus;
  return Math.round(Math.max(0, Math.min(100, DEFAULT_SCORE + (raw - DEFAULT_SCORE) * confidence)));
}

/**
 * Analyst quality from SourceProfile (uses calibration score).
 */
export function calcAnalystFromProfile(profile: SourceProfile): number {
  if (profile.tradeCount < MIN_SAMPLE) return DEFAULT_SCORE;

  const reliabilityComponent = profile.reliabilityScore * 100;
  const winComponent = Math.min(100, Math.max(0, (profile.trailingWinRate - 0.3) / 0.4 * 100));
  const calibComponent = profile.calibrationScore * 100;

  const confidence = Math.min(1.0, profile.tradeCount / 20);
  const raw = 0.40 * reliabilityComponent + 0.30 * winComponent + 0.30 * calibComponent;

  return Math.round(Math.max(0, Math.min(100, DEFAULT_SCORE + (raw - DEFAULT_SCORE) * confidence)));
}
