// Broker Adapter Types

export interface BrokerConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
}

export interface BrokerOrder {
  symbol: string;
  qty: number;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  timeInForce: 'day' | 'gtc' | 'ioc' | 'fok';
  limitPrice?: number;
  stopPrice?: number;
  clientOrderId?: string;
}

export interface BrokerOrderResponse {
  id: string;
  clientOrderId: string;
  status: 'new' | 'partially_filled' | 'filled' | 'canceled' | 'rejected';
  symbol: string;
  qty: number;
  filledQty: number;
  side: 'buy' | 'sell';
  type: string;
  timeInForce: string;
  limitPrice?: number;
  filledAvgPrice?: number;
  submittedAt: Date;
  filledAt?: Date;
}

export interface BrokerPosition {
  symbol: string;
  qty: number;
  side: 'long' | 'short';
  avgEntryPrice: number;
  marketValue: number;
  costBasis: number;
  unrealizedPl: number;
  unrealizedPlpc: number;
  currentPrice: number;
}

export interface BrokerAccount {
  id: string;
  accountNumber: string;
  status: string;
  currency: string;
  cash: number;
  portfolioValue: number;
  buyingPower: number;
  equity: number;
  lastEquity: number;
  daytradeCount: number;
  patternDayTrader: boolean;
}

export interface BrokerFill {
  orderId: string;
  price: number;
  qty: number;
  side: 'buy' | 'sell';
  timestamp: Date;
}

export interface IBrokerAdapter {
  // Connection
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Account
  getAccount(): Promise<BrokerAccount>;

  // Orders
  submitOrder(order: BrokerOrder): Promise<BrokerOrderResponse>;
  getOrder(orderId: string): Promise<BrokerOrderResponse>;
  cancelOrder(orderId: string): Promise<void>;
  getOpenOrders(): Promise<BrokerOrderResponse[]>;
  cancelAllOrders(): Promise<void>;

  // Positions
  getPositions(): Promise<BrokerPosition[]>;
  getPosition(symbol: string): Promise<BrokerPosition | null>;
  closePosition(symbol: string): Promise<BrokerOrderResponse>;
  closeAllPositions(): Promise<void>;

  // Market Data
  getLastPrice(symbol: string): Promise<number>;
  getQuote(symbol: string): Promise<{ bid: number; ask: number; last: number }>;
  getBars(symbol: string, params: {
    start: string;
    end?: string;
    timeframe: '1Min' | '5Min' | '1Hour' | '1Day';
    limit?: number;
    adjustment?: 'raw' | 'split' | 'dividend' | 'all';
  }): Promise<any[]>; // Returns MarketData[] but avoiding circular dependency
}
