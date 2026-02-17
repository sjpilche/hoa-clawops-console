// =============================================================================
// AI Analyst Panel — Type Definitions
// =============================================================================
// These types define the contract between analysts, the panel aggregator,
// the rebalancer, and OpenClaw's risk engine.
// =============================================================================

/** Which LLM provider to use for a given analyst */
export type LLMProvider = 'claude' | 'openai' | 'grok';

/** Analyst conviction level — maps to position sizing */
export type Conviction = 1 | 2 | 3 | 4 | 5;

/** What kind of opportunity the analyst found */
export type OpportunityType =
  | 'deep_value'        // Trading far below intrinsic value
  | 'momentum_breakout' // Technical breakout with volume
  | 'special_situation'  // Merger arb, spinoff, insider buying, etc.
  | 'mean_reversion'    // Oversold bounce candidate
  | 'macro_rotation'    // Sector rotation play
  | 'earnings_drift'    // Post-earnings drift opportunity
  | 'event_catalyst';   // Known upcoming catalyst

/** Time horizon for the trade */
export type Horizon = 'intraday' | '1_week' | '2_weeks' | '1_month' | '3_months';

/** A single analyst's recommendation on one ticker */
export interface AnalystPick {
  symbol: string;
  side: 'buy' | 'sell';
  conviction: Conviction;             // 1=speculative, 5=highest conviction
  opportunityType: OpportunityType;
  horizon: Horizon;
  targetPrice?: number;               // Analyst's price target (optional)
  stopLoss?: number;                   // Suggested stop (optional)
  thesis: string;                      // 1-3 sentence explanation
  risks: string;                       // Key risk to the thesis
  catalysts: string[];                 // What would make this move
  dataPoints: Record<string, any>;     // Supporting metrics the LLM cited
}

/** Full output from one analyst's scan */
export interface AnalystReport {
  analystId: string;
  analystName: string;
  provider: LLMProvider;
  timestamp: Date;
  scanFocus: string;                   // What this analyst was looking for
  picks: AnalystPick[];                // 0-5 picks per scan
  marketCommentary: string;            // General market view
  rawResponse: string;                 // Full LLM response (for audit)
  promptTokens: number;
  completionTokens: number;
  costEstimateUSD: number;
  latencyMs: number;
}

/** Aggregated view after all analysts report */
export interface PanelConsensus {
  timestamp: Date;
  reports: AnalystReport[];
  aggregatedPicks: AggregatedPick[];   // Merged + scored
  portfolioAction: PortfolioAction;    // What to actually do
}

/** A pick after merging across analysts */
export interface AggregatedPick {
  symbol: string;
  side: 'buy' | 'sell';
  analystCount: number;                // How many analysts flagged this
  avgConviction: number;               // Average conviction across analysts
  maxConviction: Conviction;
  opportunityTypes: OpportunityType[]; // All types flagged
  theses: string[];                    // All analyst theses
  compositeScore: number;              // 0-100 final score
  targetWeight: number;                // Suggested portfolio weight (0-1)
}

/** The actual trades to execute */
export interface PortfolioAction {
  rebalanceTrades: RebalanceTrade[];
  totalTurnover: number;               // Sum of |trade values| / portfolio value
  estimatedCost: number;               // Estimated friction cost
  reasoning: string;                   // Why these trades
}

export interface RebalanceTrade {
  symbol: string;
  side: 'buy' | 'sell';
  targetWeight: number;                // Target % of portfolio
  currentWeight: number;               // Current % of portfolio
  deltaWeight: number;                 // Change needed
  estimatedShares: number;
  estimatedValue: number;
  sourceAnalysts: string[];            // Which analysts drove this
  compositeScore: number;
}

/** Current portfolio state (fetched from Alpaca via OpenClaw) */
export interface PortfolioSnapshot {
  timestamp: Date;
  totalValue: number;
  cash: number;
  positions: PositionInfo[];
}

export interface PositionInfo {
  symbol: string;
  qty: number;
  marketValue: number;
  weight: number;                      // marketValue / totalValue
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
}

/** Configuration for the whole panel */
export interface PanelConfig {
  /** Maximum number of positions in portfolio */
  maxPositions: number;
  /** Minimum composite score to act on a pick (0-100) */
  minScoreToAct: number;
  /** Minimum weight change to bother trading (avoids churn) */
  minTradeThreshold: number;
  /** Maximum weight for any single position */
  maxSinglePositionWeight: number;
  /** Maximum cash target (keep some dry powder) */
  targetCashWeight: number;
  /** How much daily turnover is acceptable (0-1) */
  maxDailyTurnover: number;
  /** Universe of allowed symbols (null = any) */
  allowedUniverse: string[] | null;
  /** Transaction cost estimate per trade (fraction) */
  estimatedCostPerTrade: number;
}

/** Configuration for a single analyst */
export interface AnalystConfig {
  id: string;
  name: string;
  provider: LLMProvider;
  model: string;                       // e.g. 'claude-sonnet-4-20250514'
  focusArea: string;
  maxPicks: number;
  temperature: number;                 // LLM temperature
  systemPrompt: string;
  userPromptTemplate: string;          // Has {portfolio} and {market_data} placeholders
}

/** What we send to the LLM */
export interface LLMRequest {
  provider: LLMProvider;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
  responseFormat?: 'json';
}

/** What comes back */
export interface LLMResponse {
  content: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
}

/** Audit log entry for every panel run */
export interface PanelRunLog {
  runId: string;
  timestamp: Date;
  config: PanelConfig;
  portfolioBefore: PortfolioSnapshot;
  reports: AnalystReport[];
  consensus: PanelConsensus;
  tradesExecuted: RebalanceTrade[];
  portfolioAfter?: PortfolioSnapshot;
  totalLLMCost: number;
  errors: string[];
}
