/**
 * Polymarket-Specific Types
 * Prediction market trading interface
 */

// ============================================================================
// POLYMARKET MARKET TYPES
// ============================================================================

export interface PolymarketMarket {
  conditionId: string;
  questionId: string;
  question: string;
  description: string;
  outcomes: string[];  // e.g., ["Yes", "No"]
  outcomePrices: number[];  // Current prices for each outcome
  active: boolean;
  closed: boolean;
  category: string;
  endDate: Date;
  volume: number;
  liquidity: number;
  tags: string[];
  // Market metadata
  createdAt: Date;
  updatedAt: Date;
  resolutionSource?: string;
}

export interface PolymarketToken {
  tokenId: string;
  conditionId: string;
  outcome: string;  // "Yes" or "No"
  currentPrice: number;  // Price in USDC (0-1)
  volume24h: number;
  spread: number;  // bid-ask spread
}

// ============================================================================
// POLYMARKET ORDER TYPES
// ============================================================================

export interface PolymarketOrder {
  // Market info
  tokenId: string;
  conditionId: string;
  outcome: 'YES' | 'NO';

  // Order details
  side: 'BUY' | 'SELL';
  size: number;  // Number of shares
  price: number;  // Price per share in USDC (0-1)

  // Order type
  type: 'MARKET' | 'LIMIT' | 'GTC';  // GTC = Good Till Cancelled

  // Optional
  clientOrderId?: string;
  expiration?: number;  // Unix timestamp
  slippage?: number;  // Max acceptable slippage (e.g., 0.01 = 1%)
}

export interface PolymarketOrderResponse {
  orderId: string;
  clientOrderId?: string;
  status: 'OPEN' | 'MATCHED' | 'PARTIALLY_MATCHED' | 'CANCELLED' | 'EXPIRED';

  // Market
  tokenId: string;
  conditionId: string;
  outcome: 'YES' | 'NO';

  // Order details
  side: 'BUY' | 'SELL';
  originalSize: number;
  filledSize: number;
  remainingSize: number;
  price: number;
  avgFillPrice?: number;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  matchedAt?: Date;
  cancelledAt?: Date;

  // Financials
  totalCost: number;  // USDC spent/received
  fees: number;  // Trading fees in USDC
}

// ============================================================================
// POLYMARKET POSITION TYPES
// ============================================================================

export interface PolymarketPosition {
  tokenId: string;
  conditionId: string;
  question: string;
  outcome: 'YES' | 'NO';

  // Position details
  size: number;  // Number of shares held
  avgEntryPrice: number;  // Average price paid per share
  currentPrice: number;  // Current market price

  // Financials
  costBasis: number;  // Total USDC spent
  marketValue: number;  // Current value in USDC
  unrealizedPnL: number;  // Profit/loss in USDC
  unrealizedPnLPercent: number;

  // Metadata
  lastUpdate: Date;
}

// ============================================================================
// POLYMARKET ACCOUNT TYPES
// ============================================================================

export interface PolymarketAccount {
  address: string;  // Ethereum wallet address

  // Balances
  usdcBalance: number;  // Available USDC
  usdcInOrders: number;  // USDC locked in open orders
  usdcTotal: number;  // Total USDC (available + locked)

  // Positions
  totalPositionValue: number;  // Market value of all positions
  totalUnrealizedPnL: number;  // Total unrealized profit/loss

  // Portfolio
  portfolioValue: number;  // Total account value (USDC + positions)

  // Trading stats
  totalVolume: number;  // Lifetime trading volume
  totalFees: number;  // Lifetime fees paid
  openOrders: number;  // Number of active orders
  openPositions: number;  // Number of active positions

  // Account status
  isVerified: boolean;
  createdAt: Date;
  lastTradeAt?: Date;
}

// ============================================================================
// POLYMARKET TRADE/FILL TYPES
// ============================================================================

export interface PolymarketTrade {
  tradeId: string;
  orderId: string;

  // Market
  tokenId: string;
  conditionId: string;
  outcome: 'YES' | 'NO';

  // Trade details
  side: 'BUY' | 'SELL';
  size: number;
  price: number;

  // Financials
  value: number;  // Total USDC value
  fee: number;  // Trading fee

  // Timestamp
  timestamp: Date;
}

// ============================================================================
// POLYMARKET MARKET DATA TYPES
// ============================================================================

export interface PolymarketOrderBook {
  tokenId: string;
  bids: Array<{ price: number; size: number }>;  // Buy orders
  asks: Array<{ price: number; size: number }>;  // Sell orders
  spread: number;
  midPrice: number;
  lastUpdateTime: Date;
}

export interface PolymarketCandle {
  tokenId: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap: number;  // Volume-weighted average price
}

// ============================================================================
// POLYMARKET WEBSOCKET TYPES
// ============================================================================

export interface PolymarketWebSocketMessage {
  type: 'MARKET' | 'ORDER' | 'TRADE' | 'ORDERBOOK';
  data: any;
  timestamp: Date;
}

export interface PolymarketMarketUpdate {
  type: 'MARKET';
  tokenId: string;
  price: number;
  volume: number;
  timestamp: Date;
}

export interface PolymarketOrderUpdate {
  type: 'ORDER';
  orderId: string;
  status: string;
  filledSize: number;
  timestamp: Date;
}

// ============================================================================
// POLYMARKET CONFIG TYPES
// ============================================================================

export interface PolymarketConfig {
  // API Configuration
  apiKey: string;
  apiSecret: string;
  privateKey: string;  // Ethereum private key for signing
  chainId: number;  // 137 for Polygon mainnet, 80001 for Mumbai testnet

  // Endpoints
  apiBaseUrl: string;  // https://api.polymarket.com
  wsBaseUrl: string;   // wss://ws.polymarket.com

  // Network
  rpcUrl: string;  // Polygon RPC endpoint

  // Contract Addresses (Polygon)
  ctfExchangeAddress: string;  // Conditional Token Framework Exchange
  collateralTokenAddress: string;  // USDC contract

  // Trading Configuration
  defaultSlippage: number;  // e.g., 0.02 = 2%
  maxOrderSize: number;  // Max USDC per order
  minOrderSize: number;  // Min USDC per order (usually 1 USDC)

  // Safety
  enableLiveTrading: boolean;
  enableWebSocket: boolean;
  orderTimeout: number;  // Milliseconds
  retryAttempts: number;
  retryDelay: number;  // Milliseconds
}

// ============================================================================
// POLYMARKET ERROR TYPES
// ============================================================================

export class PolymarketError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public details?: any
  ) {
    super(message);
    this.name = 'PolymarketError';
  }
}

export class PolymarketAuthError extends PolymarketError {
  constructor(message: string, details?: any) {
    super(message, 'AUTH_ERROR', 401, details);
    this.name = 'PolymarketAuthError';
  }
}

export class PolymarketOrderError extends PolymarketError {
  constructor(message: string, details?: any) {
    super(message, 'ORDER_ERROR', 400, details);
    this.name = 'PolymarketOrderError';
  }
}

export class PolymarketInsufficientFundsError extends PolymarketError {
  constructor(message: string, details?: any) {
    super(message, 'INSUFFICIENT_FUNDS', 400, details);
    this.name = 'PolymarketInsufficientFundsError';
  }
}

export class PolymarketRateLimitError extends PolymarketError {
  constructor(message: string, details?: any) {
    super(message, 'RATE_LIMIT', 429, details);
    this.name = 'PolymarketRateLimitError';
  }
}

// ============================================================================
// POLYMARKET ADAPTER INTERFACE
// ============================================================================

export interface IPolymarketAdapter {
  // Connection
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Account
  getAccount(): Promise<PolymarketAccount>;
  getBalance(): Promise<number>;  // USDC balance

  // Markets
  getMarket(conditionId: string): Promise<PolymarketMarket>;
  getMarkets(filters?: { category?: string; active?: boolean }): Promise<PolymarketMarket[]>;
  searchMarkets(query: string): Promise<PolymarketMarket[]>;

  // Orders
  submitOrder(order: PolymarketOrder): Promise<PolymarketOrderResponse>;
  getOrder(orderId: string): Promise<PolymarketOrderResponse>;
  cancelOrder(orderId: string): Promise<void>;
  getOpenOrders(): Promise<PolymarketOrderResponse[]>;
  cancelAllOrders(): Promise<void>;

  // Positions
  getPositions(): Promise<PolymarketPosition[]>;
  getPosition(tokenId: string): Promise<PolymarketPosition | null>;
  closePosition(tokenId: string, slippage?: number): Promise<PolymarketOrderResponse>;
  closeAllPositions(): Promise<void>;

  // Market Data
  getOrderBook(tokenId: string): Promise<PolymarketOrderBook>;
  getCurrentPrice(tokenId: string, outcome: 'YES' | 'NO'): Promise<number>;
  getCandles(tokenId: string, params: {
    start: Date;
    end?: Date;
    interval: '1m' | '5m' | '1h' | '1d';
  }): Promise<PolymarketCandle[]>;

  // Trades
  getTrades(filters?: {
    conditionId?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<PolymarketTrade[]>;
}
