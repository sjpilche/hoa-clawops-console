// =============================================================================
// Allocation Engine — Type Definitions
// =============================================================================
// Central types for the capital allocation subsystem:
//   - RegimeSnapshot: market regime classification
//   - TradeCandidate: unified signal format (from strategies + AI panel)
//   - TradeDecision: allocator audit log entry
//   - AttributionRecord: daily performance attribution by dimension
// =============================================================================

// ── Market Regime ─────────────────────────────────────────────────────────────

export type RegimeLabel =
  | 'risk_on'          // VIX < 18, F&G > 55, SPY above 50d MA
  | 'risk_off'         // VIX > 25 OR F&G < 35 OR (SPY below 50d AND VIX > 20)
  | 'high_volatility'  // VIX > 30
  | 'neutral'          // Everything else
  | 'unknown';         // Data unavailable

export interface RegimeInput {
  vix?: number;
  fearGreedScore?: number;
  spyPrice?: number;
  spy50dMA?: number;
  spy200dMA?: number;
  tenYearYield?: number;
}

export interface RegimeSnapshot {
  id?: number;
  timestamp: Date;
  label: RegimeLabel;
  vix: number | null;
  fearGreedScore: number | null;
  spyTrend: 'above_50d' | 'below_50d' | 'unknown';
  spyPrice: number | null;
  spy50dMA: number | null;
  spy200dMA: number | null;
  tenYearYield: number | null;
  confidence: number;           // 0-1, how many inputs were available
  rawInputs: Record<string, any>;
}

// ── Trade Candidate (unified signal format) ───────────────────────────────────

export type CandidateSource = 'strategy' | 'ai_panel';

export type BookId = 'intraday' | 'swing' | 'trend';

export interface TradeCandidate {
  candidateId: string;          // uuid
  source: CandidateSource;
  sourceId: string;             // strategyId or analystId
  sourceName: string;           // human-readable
  runId: string;                // links to panel run or strategy run

  symbol: string;
  side: 'buy' | 'sell';
  signalStrength: number;       // 0-1 normalized

  // From AI panel picks
  opportunityType?: string;
  horizon?: string;
  thesis?: string;
  risks?: string;
  catalysts?: string[];
  targetPrice?: number;
  stopLoss?: number;

  // From strategy signals
  strategyFeatures?: Record<string, any>;
  signalPrice?: number;

  // Regime at candidate creation time
  regimeLabel: RegimeLabel;
  regimeSnapshotId?: number;

  // Aggregation metadata (filled by panel aggregator)
  analystCount?: number;
  avgConviction?: number;
  maxConviction?: number;
  compositeScore?: number;      // 0-100

  // Book assignment (Sprint 4)
  bookId?: BookId;

  createdAt: Date;
}

// ── Trade Decision (allocator audit log) ──────────────────────────────────────

export type DecisionAction = 'execute' | 'reject' | 'defer' | 'resize';

export interface TradeDecision {
  decisionId: string;
  candidateId: string;
  action: DecisionAction;

  // Allocator scores (filled by Sprint 2, null in Sprint 1)
  allocatorScore?: number;
  strategyEdgeScore?: number;
  setupQualityScore?: number;
  symbolQualityScore?: number;
  regimeFitScore?: number;
  analystQualityScore?: number;

  // Sizing output
  requestedQty?: number;
  approvedQty?: number;
  dollarValue?: number;

  // Risk check result
  riskPassed: boolean;
  riskReason?: string;

  // Execution result
  executed: boolean;
  orderId?: string;
  brokerOrderId?: string;

  // Book assignment (Sprint 4)
  bookId?: BookId;

  reasons: string[];            // Human-readable decision audit trail
  createdAt: Date;
}

// ── Performance Attribution ───────────────────────────────────────────────────

export interface AttributionRecord {
  id?: number;
  date: string;                 // YYYY-MM-DD
  dimension: string;            // 'strategy' | 'analyst' | 'symbol' | 'setup' | 'regime'
  dimensionValue: string;       // e.g. 'value-hunter', 'AAPL', 'momentum_breakout', 'risk_on'
  tradeCount: number;
  wins: number;
  losses: number;
  totalPnlDollars: number;
  totalPnlPercent: number;
  avgHoldDays: number;
  avgConviction: number;
  winRate: number;
  expectancy: number;           // avg $ per trade
  sharpeApprox: number;
}
