/**
 * Kalshi Broker Types
 * CFTC-regulated event contracts — RSA-PSS authenticated API
 *
 * All monetary values are in CENTS (integer).
 * Probability prices range 1-99 cents.
 */

// ============================================================================
// CONFIG
// ============================================================================

export interface KalshiConfig {
  apiKey: string;
  privateKey: string;
  baseUrl: string;
}

// ============================================================================
// MARKET TYPES
// ============================================================================

export interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  title: string;
  subtitle: string;
  status: 'unopened' | 'open' | 'closed' | 'settled';
  yes_bid: number;       // Cents (0-100)
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  last_price: number;    // Cents
  volume: number;
  open_interest: number;
  result: string | null; // 'yes' | 'no' | null
  close_time: string;    // ISO date
  expiration_time: string;
  category: string;
  yes_sub_title: string;
  no_sub_title: string;
}

export interface KalshiEvent {
  event_ticker: string;
  title: string;
  category: string;
  sub_title: string;
  markets: KalshiMarket[];
  mutually_exclusive: boolean;
}

// ============================================================================
// ORDER TYPES
// ============================================================================

export interface KalshiOrderParams {
  ticker: string;
  side: 'yes' | 'no';
  type: 'limit' | 'market';
  count: number;         // Number of contracts
  price?: number;        // Price in cents (1-99), required for limit orders
  action?: 'buy' | 'sell'; // Default: 'buy'. Use 'sell' to close positions.
  client_order_id?: string;
  expiration_ts?: number; // Unix epoch seconds
}

export interface KalshiOrder {
  order_id: string;
  ticker: string;
  client_order_id: string;
  side: 'yes' | 'no';
  type: 'limit' | 'market';
  action: 'buy' | 'sell';
  count: number;
  yes_price: number;     // Cents
  no_price: number;      // Cents
  status: 'resting' | 'canceled' | 'executed' | 'pending';
  remaining_count: number;
  created_time: string;
  updated_time: string;
  expiration_time: string;
}

// ============================================================================
// PORTFOLIO TYPES
// ============================================================================

export interface KalshiPosition {
  ticker: string;
  market_ticker: string;
  position: number;       // Net contracts (positive = yes, negative = no)
  total_traded: number;
  resting_orders_count: number;
  market_exposure: number; // Cents
}

export interface KalshiBalance {
  balance: number;         // Cents
  portfolio_value: number; // Cents
}

export interface KalshiFill {
  trade_id: string;
  order_id: string;
  ticker: string;
  side: 'yes' | 'no';
  action: 'buy' | 'sell';
  count: number;
  yes_price: number;      // Cents
  no_price: number;       // Cents
  created_time: string;
}

// ============================================================================
// ORDERBOOK
// ============================================================================

export interface KalshiOrderbook {
  yes: Array<[number, number]>;  // [price_cents, quantity]
  no: Array<[number, number]>;
}

// ============================================================================
// EXCHANGE STATUS
// ============================================================================

export interface KalshiExchangeStatus {
  exchange_active: boolean;
  trading_active: boolean;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export class KalshiError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public details?: any,
  ) {
    super(message);
    this.name = 'KalshiError';
  }
}

export class KalshiAuthError extends KalshiError {
  constructor(message: string, details?: any) {
    super(message, 'AUTH_ERROR', 401, details);
    this.name = 'KalshiAuthError';
  }
}

export class KalshiOrderError extends KalshiError {
  constructor(message: string, details?: any) {
    super(message, 'ORDER_ERROR', 400, details);
    this.name = 'KalshiOrderError';
  }
}

export class KalshiRateLimitError extends KalshiError {
  constructor(message: string, details?: any) {
    super(message, 'RATE_LIMIT', 429, details);
    this.name = 'KalshiRateLimitError';
  }
}

export class KalshiInsufficientFundsError extends KalshiError {
  constructor(message: string, details?: any) {
    super(message, 'INSUFFICIENT_FUNDS', 400, details);
    this.name = 'KalshiInsufficientFundsError';
  }
}
