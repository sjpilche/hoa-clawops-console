// Risk Engine Types

export interface OrderIntent {
  intentId: string;
  strategyId: string;
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  orderType: 'market' | 'limit' | 'stop' | 'stop_limit';
  limitPrice?: number;
  timeInForce: 'day' | 'gtc' | 'ioc' | 'fok';
  signalPrice?: number; // Price at signal generation (for slippage check)
}

export interface RiskCheckResult {
  passed: boolean;
  failReason?: string;
  limitsSnapshot: RiskLimits;
  checksPassed: string[];
  checksFailed: string[];
}

export interface RiskLimits {
  maxDailyLoss: number;          // USD
  maxPositionUsd: number;        // USD per symbol
  maxGrossExposureUsd: number;   // USD total
  maxTradesPerDay: number;       // Count
  maxOrderSlippageBps: number;   // Basis points
}

export interface Position {
  symbol: string;
  qty: number;
  avgPrice: number;
  marketPrice: number;
  marketValue: number;
  unrealizedPnl: number;
}

export interface DailyPnL {
  date: string;
  realizedPnl: number;
  unrealizedPnl: number;
  fees: number;
  netPnl: number;
  tradeCount: number;
}

export interface AllowedSymbol {
  symbol: string;
  enabled: boolean;
}
