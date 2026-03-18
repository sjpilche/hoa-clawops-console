/**
 * Kalshi Auto-Trader Types
 * All type definitions for the autonomous prediction market trader.
 * Monetary values are in CENTS (integer) unless noted otherwise.
 */

// ============================================================================
// CONFIG
// ============================================================================

export interface KalshiAutoTraderConfig {
  // Risk management
  maxDailyLossCents: number;        // 500 = $5.00
  maxPositionCents: number;         // 500 = $5.00
  maxOpenPositions: number;         // 5
  maxExposureCents: number;         // 2500 = $25.00
  cashReserveCents: number;         // 2500 = $25.00

  // Signal thresholds
  momentumThresholdCents: number;   // 3 = 3-cent drop/rise triggers signal
  orderbookImbalanceRatio: number;  // 2.0 = 2:1 bid/ask depth ratio

  // Exit rules
  takeProfitPct: number;            // 0.30 = 30% gain
  stopLossPct: number;              // 0.50 = 50% loss
  stalePosHours: number;            // 6 = close after 6 hours with no movement

  // Scan timing
  scanIntervalMs: number;           // 300000 = 5 minutes
  priceHistoryWindowMs: number;     // 3600000 = 1 hour for momentum calc

  // Market selection
  targetSeriesTickers: string[];    // ['KXINXPOS', 'KXNASDAQ100POS', ...]
  minVolume24h: number;             // Minimum 24h volume to consider
  minOpenInterest: number;          // Minimum open interest
  maxSpreadCents: number;           // Max bid-ask spread in cents
}

// ============================================================================
// PRICE DATA
// ============================================================================

export interface PriceSnapshot {
  ticker: string;
  timestamp: number;          // Unix ms
  yesBidCents: number;
  yesAskCents: number;
  yesLastCents: number;
  noBidCents: number;
  noAskCents: number;
  volume24h: number;
  openInterest: number;
}

// ============================================================================
// SIGNALS
// ============================================================================

export type SignalType =
  | 'momentum_oversold'
  | 'momentum_overbought'
  | 'orderbook_buy'
  | 'orderbook_sell'
  | 'range_bucket_snipe';

export interface KalshiSignal {
  signalId: string;
  type: SignalType;
  ticker: string;
  title: string;
  side: 'yes' | 'no';
  action: 'buy' | 'sell';
  strength: number;           // 0-1 confidence
  priceCents: number;         // Suggested limit price in cents
  reason: string;
  features: Record<string, any>;
  timestamp: Date;
}

// ============================================================================
// POSITIONS
// ============================================================================

export interface KalshiTrackedPosition {
  id: string;
  ticker: string;
  title: string;
  side: 'yes' | 'no';
  contracts: number;
  entryPriceCents: number;
  currentPriceCents: number;
  costBasisCents: number;     // entryPrice × contracts
  currentValueCents: number;  // currentPrice × contracts
  unrealizedPnlCents: number;
  unrealizedPnlPct: number;
  enteredAt: Date;
  lastUpdated: Date;
  signalType: string;
  expirationTime: string;     // ISO date
  hoursUntilExpiration: number;
}

export interface ClosedTrade {
  ticker: string;
  side: 'yes' | 'no';
  contracts: number;
  entryPriceCents: number;
  exitPriceCents: number;
  pnlCents: number;
  returnPct: number;
  signalType: string;
  entryTime: Date;
  exitTime: Date;
  exitReason: string;
}

export interface DailyPnlRecord {
  date: string;               // YYYY-MM-DD
  realizedPnlCents: number;
  tradesExecuted: number;
}

// ============================================================================
// PERFORMANCE
// ============================================================================

export interface PerformanceStats {
  totalPnlCents: number;
  realizedPnlCents: number;
  unrealizedPnlCents: number;
  winRate: number;
  tradesCompleted: number;
  openPositions: number;
  avgReturnPct: number;
  bestTradeCents: number;
  worstTradeCents: number;
}

// ============================================================================
// SCHEDULER STATUS
// ============================================================================

export interface KalshiSchedulerStatus {
  running: boolean;
  scanCount: number;
  lastScan: Date | null;
  nextScan: Date | null;
  openPositions: number;
  totalPnlCents: number;
  balanceCents: number;
  dailyPnlCents: number;
  signalsLastScan: number;
}

// ============================================================================
// CONFIG LOADER
// ============================================================================

export function loadKalshiConfig(): KalshiAutoTraderConfig {
  return {
    maxDailyLossCents: parseInt(process.env.KALSHI_MAX_DAILY_LOSS_CENTS || '500', 10),
    maxPositionCents: parseInt(process.env.KALSHI_MAX_POSITION_CENTS || '500', 10),
    maxOpenPositions: parseInt(process.env.KALSHI_MAX_OPEN_POSITIONS || '5', 10),
    maxExposureCents: parseInt(process.env.KALSHI_MAX_EXPOSURE_CENTS || '2500', 10),
    cashReserveCents: parseInt(process.env.KALSHI_CASH_RESERVE_CENTS || '2500', 10),
    momentumThresholdCents: parseInt(process.env.KALSHI_MOMENTUM_THRESHOLD_CENTS || '3', 10),
    orderbookImbalanceRatio: parseFloat(process.env.KALSHI_ORDERBOOK_IMBALANCE_RATIO || '2.0'),
    takeProfitPct: parseFloat(process.env.KALSHI_TAKE_PROFIT_PCT || '0.30'),
    stopLossPct: parseFloat(process.env.KALSHI_STOP_LOSS_PCT || '0.50'),
    stalePosHours: parseFloat(process.env.KALSHI_STALE_POSITION_HOURS || '6'),
    scanIntervalMs: parseInt(process.env.KALSHI_SCAN_INTERVAL_MS || '300000', 10),
    priceHistoryWindowMs: parseInt(process.env.KALSHI_PRICE_HISTORY_WINDOW_MS || '3600000', 10),
    targetSeriesTickers: (process.env.KALSHI_TARGET_SERIES || 'KXINXPOS,KXNASDAQ100POS,KXINX,KXNASDAQ100').split(','),
    minVolume24h: parseInt(process.env.KALSHI_MIN_VOLUME || '50', 10),
    minOpenInterest: parseInt(process.env.KALSHI_MIN_OPEN_INTEREST || '500', 10),
    maxSpreadCents: parseInt(process.env.KALSHI_MAX_SPREAD_CENTS || '5', 10),
  };
}
