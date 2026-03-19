// =============================================================================
// Position Sizing — R-based bucketed sizing from allocator scores
// =============================================================================
// Replaces all flat $25/$100 sizing with score-driven allocation.
//
// Bucketing:
//   Score 0–39:   REJECT (no trade)
//   Score 40–59:  micro     = 0.5R
//   Score 60–74:  small     = 1.0R
//   Score 75–89:  standard  = 1.5R
//   Score 90–100: conviction = 2.0R
//
// Where R = riskPerTradePct × accountValue.
// All sizes hard-capped by maxPositionPct × accountValue.
// =============================================================================

import { TradeCandidate } from './types';

export interface SizingConfig {
  /** Total account/portfolio value */
  accountValue: number;
  /** Max position as fraction of account (e.g. 0.10 = 10%) */
  maxPositionPct: number;
  /** Don't bother below this dollar amount */
  minPositionDollars: number;
  /** Risk per trade as fraction of account (e.g. 0.01 = 1% = "1R") */
  riskPerTradePct: number;
}

export const DEFAULT_SIZING_CONFIG: Omit<SizingConfig, 'accountValue'> = {
  maxPositionPct: 0.10,
  minPositionDollars: 5,
  riskPerTradePct: 0.01,
};

export type SizeBucket = 'reject' | 'micro' | 'small' | 'standard' | 'conviction';

export interface SizingResult {
  shares: number;
  dollarValue: number;
  pctOfAccount: number;
  rMultiple: number;
  bucket: SizeBucket;
  reason: string;
}

/** Score → bucket → R-multiple mapping */
const BUCKET_MAP: { min: number; max: number; bucket: SizeBucket; rMultiple: number }[] = [
  { min: 0,  max: 39,  bucket: 'reject',     rMultiple: 0 },
  { min: 40, max: 59,  bucket: 'micro',      rMultiple: 0.5 },
  { min: 60, max: 74,  bucket: 'small',      rMultiple: 1.0 },
  { min: 75, max: 89,  bucket: 'standard',   rMultiple: 1.5 },
  { min: 90, max: 100, bucket: 'conviction',  rMultiple: 2.0 },
];

/**
 * Calculate position size from an allocator score.
 * Returns null if the score is below the rejection threshold.
 */
export function calculatePositionSize(
  allocatorScore: number,
  candidate: TradeCandidate,
  currentPrice: number,
  config: SizingConfig,
): SizingResult | null {
  // Find the right bucket
  const bucket = BUCKET_MAP.find(b => allocatorScore >= b.min && allocatorScore <= b.max)
    || BUCKET_MAP[0]; // default to reject

  if (bucket.bucket === 'reject') {
    return null;
  }

  // R = riskPerTradePct × accountValue
  const rDollars = config.riskPerTradePct * config.accountValue;

  // Base dollar value = R × multiplier
  let dollarValue = rDollars * bucket.rMultiple;

  // Hard cap: maxPositionPct × accountValue
  const maxDollars = config.maxPositionPct * config.accountValue;
  dollarValue = Math.min(dollarValue, maxDollars);

  // Floor: don't trade if below minimum
  if (dollarValue < config.minPositionDollars) {
    return null;
  }

  // Calculate shares
  if (currentPrice <= 0) return null;
  const shares = Math.floor(dollarValue / currentPrice);
  if (shares === 0) return null;

  // Recalculate actual dollar value from whole shares
  const actualDollarValue = shares * currentPrice;

  return {
    shares,
    dollarValue: actualDollarValue,
    pctOfAccount: config.accountValue > 0 ? actualDollarValue / config.accountValue : 0,
    rMultiple: bucket.rMultiple,
    bucket: bucket.bucket,
    reason: `Score ${allocatorScore} → ${bucket.bucket} (${bucket.rMultiple}R = $${actualDollarValue.toFixed(2)})`,
  };
}

/**
 * For sells (closing positions), return the full position qty — no R-sizing needed.
 */
export function calculateSellSize(
  positionQty: number,
  currentPrice: number,
): SizingResult {
  return {
    shares: positionQty,
    dollarValue: positionQty * currentPrice,
    pctOfAccount: 0, // Sells reduce exposure, not increase it
    rMultiple: 0,
    bucket: 'standard',
    reason: `Full position close: ${positionQty} shares`,
  };
}
