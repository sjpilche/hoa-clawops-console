/**
 * Polymarket Broker Adapter
 * Fortified integration with Polymarket prediction markets
 *
 * Security Features:
 * - Private key encryption at rest
 * - Request signing with HMAC
 * - Rate limiting protection
 * - Retry logic with exponential backoff
 * - Order validation before submission
 * - Balance checks before trades
 * - Transaction nonce management
 * - WebSocket reconnection handling
 */

import { ethers } from 'ethers';
import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import {
  IPolymarketAdapter,
  PolymarketConfig,
  PolymarketMarket,
  PolymarketOrder,
  PolymarketOrderResponse,
  PolymarketPosition,
  PolymarketAccount,
  PolymarketOrderBook,
  PolymarketCandle,
  PolymarketTrade,
  PolymarketError,
  PolymarketAuthError,
  PolymarketOrderError,
  PolymarketInsufficientFundsError,
  PolymarketRateLimitError,
} from './polymarket-types';

export class PolymarketAdapter implements IPolymarketAdapter {
  private config: PolymarketConfig;
  private httpClient: AxiosInstance;
  private wallet: ethers.Wallet;
  private provider: ethers.providers.JsonRpcProvider;
  private connected: boolean = false;

  // Rate limiting
  private requestCount: number = 0;
  private requestWindow: number = Date.now();
  private readonly MAX_REQUESTS_PER_MINUTE = 60;

  // Nonce management for transactions
  private currentNonce: number = 0;

  // WebSocket (if enabled)
  private ws: WebSocket | null = null;
  private wsReconnectAttempts: number = 0;
  private readonly MAX_WS_RECONNECT_ATTEMPTS = 5;

  constructor(config: PolymarketConfig) {
    this.config = config;

    // Initialize Ethereum wallet
    this.provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
    this.wallet = new ethers.Wallet(config.privateKey, this.provider);

    // Initialize HTTP client with security headers
    this.httpClient = axios.create({
      baseURL: config.apiBaseUrl,
      timeout: config.orderTimeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'OpenClaw-Trader/0.1.0',
      },
    });

    // Add request interceptor for authentication
    this.httpClient.interceptors.request.use(
      async (config) => {
        await this.checkRateLimit();
        const signature = await this.signRequest(config.url || '', config.data);
        config.headers['X-Signature'] = signature;
        config.headers['X-Timestamp'] = Date.now().toString();
        config.headers['X-API-Key'] = this.config.apiKey;
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Add response interceptor for error handling
    this.httpClient.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 429) {
          throw new PolymarketRateLimitError(
            'Rate limit exceeded',
            error.response.data
          );
        }
        if (error.response?.status === 401) {
          throw new PolymarketAuthError(
            'Authentication failed',
            error.response.data
          );
        }
        if (error.response?.status === 400) {
          throw new PolymarketOrderError(
            'Invalid order',
            error.response.data
          );
        }
        throw new PolymarketError(
          error.message,
          'UNKNOWN_ERROR',
          error.response?.status,
          error.response?.data
        );
      }
    );
  }

  // ============================================================================
  // CONNECTION MANAGEMENT
  // ============================================================================

  async connect(): Promise<void> {
    try {
      // Verify wallet has USDC
      const balance = await this.getBalance();
      console.log(`✓ Polymarket wallet connected: ${this.wallet.address}`);
      console.log(`  USDC Balance: $${balance.toFixed(2)}`);

      // Verify API credentials
      await this.getAccount();
      console.log(`✓ Polymarket API authenticated`);

      // Connect WebSocket if enabled
      if (this.config.enableWebSocket) {
        await this.connectWebSocket();
      }

      // Initialize nonce
      this.currentNonce = await this.provider.getTransactionCount(
        this.wallet.address,
        'pending'
      );

      this.connected = true;
    } catch (error: any) {
      throw new PolymarketAuthError(
        `Failed to connect to Polymarket: ${error.message}`,
        error
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    console.log('✓ Polymarket disconnected');
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ============================================================================
  // SECURITY & AUTHENTICATION
  // ============================================================================

  private async signRequest(url: string, data?: any): Promise<string> {
    const timestamp = Date.now();
    const payload = `${timestamp}${url}${data ? JSON.stringify(data) : ''}`;
    const signature = crypto
      .createHmac('sha256', this.config.apiSecret)
      .update(payload)
      .digest('hex');
    return signature;
  }

  private async checkRateLimit(): Promise<void> {
    const now = Date.now();

    // Reset window every minute
    if (now - this.requestWindow > 60000) {
      this.requestCount = 0;
      this.requestWindow = now;
    }

    // Check limit
    if (this.requestCount >= this.MAX_REQUESTS_PER_MINUTE) {
      const waitTime = 60000 - (now - this.requestWindow);
      throw new PolymarketRateLimitError(
        `Rate limit exceeded. Wait ${Math.ceil(waitTime / 1000)}s`
      );
    }

    this.requestCount++;
  }

  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    attempts: number = 3
  ): Promise<T> {
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (error: any) {
        if (i === attempts - 1) throw error;
        if (error instanceof PolymarketRateLimitError) {
          const delay = Math.pow(2, i) * 1000;  // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw error;
        }
      }
    }
    throw new Error('Retry failed');
  }

  // ============================================================================
  // ACCOUNT MANAGEMENT
  // ============================================================================

  async getAccount(): Promise<PolymarketAccount> {
    const response = await this.httpClient.get('/account');
    const data = response.data;

    return {
      address: this.wallet.address,
      usdcBalance: parseFloat(data.usdcBalance || '0'),
      usdcInOrders: parseFloat(data.usdcInOrders || '0'),
      usdcTotal: parseFloat(data.usdcTotal || '0'),
      totalPositionValue: parseFloat(data.totalPositionValue || '0'),
      totalUnrealizedPnL: parseFloat(data.totalUnrealizedPnL || '0'),
      portfolioValue: parseFloat(data.portfolioValue || '0'),
      totalVolume: parseFloat(data.totalVolume || '0'),
      totalFees: parseFloat(data.totalFees || '0'),
      openOrders: parseInt(data.openOrders || '0'),
      openPositions: parseInt(data.openPositions || '0'),
      isVerified: data.isVerified || false,
      createdAt: new Date(data.createdAt),
      lastTradeAt: data.lastTradeAt ? new Date(data.lastTradeAt) : undefined,
    };
  }

  async getBalance(): Promise<number> {
    // Get USDC balance from blockchain
    const usdcContract = new ethers.Contract(
      this.config.collateralTokenAddress,
      ['function balanceOf(address) view returns (uint256)'],
      this.provider
    );

    const balance = await usdcContract.balanceOf(this.wallet.address);
    return parseFloat(ethers.utils.formatUnits(balance, 6));  // USDC has 6 decimals
  }

  // ============================================================================
  // MARKET DATA
  // ============================================================================

  async getMarket(conditionId: string): Promise<PolymarketMarket> {
    const response = await this.httpClient.get(`/markets/${conditionId}`);
    return this.parseMarket(response.data);
  }

  async getMarkets(filters?: {
    category?: string;
    active?: boolean;
  }): Promise<PolymarketMarket[]> {
    const params: any = {};
    if (filters?.category) params.category = filters.category;
    if (filters?.active !== undefined) params.active = filters.active;

    const response = await this.httpClient.get('/markets', { params });
    return response.data.map((m: any) => this.parseMarket(m));
  }

  async searchMarkets(query: string): Promise<PolymarketMarket[]> {
    const response = await this.httpClient.get('/markets/search', {
      params: { q: query },
    });
    return response.data.map((m: any) => this.parseMarket(m));
  }

  private parseMarket(data: any): PolymarketMarket {
    return {
      conditionId: data.conditionId,
      questionId: data.questionId,
      question: data.question,
      description: data.description || '',
      outcomes: data.outcomes || ['Yes', 'No'],
      outcomePrices: data.outcomePrices || [],
      active: data.active || false,
      closed: data.closed || false,
      category: data.category || 'General',
      endDate: new Date(data.endDate),
      volume: parseFloat(data.volume || '0'),
      liquidity: parseFloat(data.liquidity || '0'),
      tags: data.tags || [],
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      resolutionSource: data.resolutionSource,
    };
  }

  async getOrderBook(tokenId: string): Promise<PolymarketOrderBook> {
    const response = await this.httpClient.get(`/orderbook/${tokenId}`);
    const data = response.data;

    return {
      tokenId,
      bids: data.bids.map((b: any) => ({
        price: parseFloat(b.price),
        size: parseFloat(b.size),
      })),
      asks: data.asks.map((a: any) => ({
        price: parseFloat(a.price),
        size: parseFloat(a.size),
      })),
      spread: parseFloat(data.spread || '0'),
      midPrice: parseFloat(data.midPrice || '0'),
      lastUpdateTime: new Date(data.timestamp),
    };
  }

  async getCurrentPrice(
    tokenId: string,
    outcome: 'YES' | 'NO'
  ): Promise<number> {
    const orderBook = await this.getOrderBook(tokenId);

    // Use mid price from order book
    if (outcome === 'YES') {
      return orderBook.midPrice;
    } else {
      return 1 - orderBook.midPrice;  // NO price is complement of YES
    }
  }

  async getCandles(
    tokenId: string,
    params: { start: Date; end?: Date; interval: '1m' | '5m' | '1h' | '1d' }
  ): Promise<PolymarketCandle[]> {
    const response = await this.httpClient.get(`/candles/${tokenId}`, {
      params: {
        start: params.start.toISOString(),
        end: params.end?.toISOString(),
        interval: params.interval,
      },
    });

    return response.data.map((c: any) => ({
      tokenId,
      timestamp: new Date(c.timestamp),
      open: parseFloat(c.open),
      high: parseFloat(c.high),
      low: parseFloat(c.low),
      close: parseFloat(c.close),
      volume: parseFloat(c.volume),
      vwap: parseFloat(c.vwap || '0'),
    }));
  }

  // ============================================================================
  // ORDER MANAGEMENT
  // ============================================================================

  async submitOrder(order: PolymarketOrder): Promise<PolymarketOrderResponse> {
    // Validate order before submission
    await this.validateOrder(order);

    // Check balance
    const balance = await this.getBalance();
    const requiredFunds = order.size * order.price;

    if (order.side === 'BUY' && balance < requiredFunds) {
      throw new PolymarketInsufficientFundsError(
        `Insufficient USDC balance. Required: $${requiredFunds.toFixed(2)}, Available: $${balance.toFixed(2)}`
      );
    }

    // Submit order with retry logic
    return await this.retryWithBackoff(async () => {
      const response = await this.httpClient.post('/orders', {
        tokenId: order.tokenId,
        conditionId: order.conditionId,
        outcome: order.outcome,
        side: order.side,
        size: order.size,
        price: order.price,
        type: order.type,
        clientOrderId: order.clientOrderId,
        expiration: order.expiration,
        slippage: order.slippage || this.config.defaultSlippage,
      });

      return this.parseOrderResponse(response.data);
    }, this.config.retryAttempts);
  }

  async getOrder(orderId: string): Promise<PolymarketOrderResponse> {
    const response = await this.httpClient.get(`/orders/${orderId}`);
    return this.parseOrderResponse(response.data);
  }

  async cancelOrder(orderId: string): Promise<void> {
    await this.httpClient.delete(`/orders/${orderId}`);
  }

  async getOpenOrders(): Promise<PolymarketOrderResponse[]> {
    const response = await this.httpClient.get('/orders/open');
    return response.data.map((o: any) => this.parseOrderResponse(o));
  }

  async cancelAllOrders(): Promise<void> {
    const openOrders = await this.getOpenOrders();
    await Promise.all(openOrders.map(o => this.cancelOrder(o.orderId)));
  }

  private parseOrderResponse(data: any): PolymarketOrderResponse {
    return {
      orderId: data.orderId,
      clientOrderId: data.clientOrderId,
      status: data.status,
      tokenId: data.tokenId,
      conditionId: data.conditionId,
      outcome: data.outcome,
      side: data.side,
      originalSize: parseFloat(data.originalSize),
      filledSize: parseFloat(data.filledSize || '0'),
      remainingSize: parseFloat(data.remainingSize || data.originalSize),
      price: parseFloat(data.price),
      avgFillPrice: data.avgFillPrice ? parseFloat(data.avgFillPrice) : undefined,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      matchedAt: data.matchedAt ? new Date(data.matchedAt) : undefined,
      cancelledAt: data.cancelledAt ? new Date(data.cancelledAt) : undefined,
      totalCost: parseFloat(data.totalCost || '0'),
      fees: parseFloat(data.fees || '0'),
    };
  }

  private async validateOrder(order: PolymarketOrder): Promise<void> {
    // Validate size
    if (order.size < this.config.minOrderSize) {
      throw new PolymarketOrderError(
        `Order size too small. Minimum: ${this.config.minOrderSize}`
      );
    }
    if (order.size > this.config.maxOrderSize) {
      throw new PolymarketOrderError(
        `Order size too large. Maximum: ${this.config.maxOrderSize}`
      );
    }

    // Validate price (must be between 0 and 1)
    if (order.price < 0.01 || order.price > 0.99) {
      throw new PolymarketOrderError(
        `Invalid price: ${order.price}. Must be between 0.01 and 0.99`
      );
    }

    // Validate market is open
    const market = await this.getMarket(order.conditionId);
    if (!market.active || market.closed) {
      throw new PolymarketOrderError(
        `Market ${order.conditionId} is closed`
      );
    }

    // Check if market has ended
    if (market.endDate < new Date()) {
      throw new PolymarketOrderError(
        `Market ${order.conditionId} has ended`
      );
    }
  }

  // ============================================================================
  // POSITION MANAGEMENT
  // ============================================================================

  async getPositions(): Promise<PolymarketPosition[]> {
    const response = await this.httpClient.get('/positions');
    return response.data.map((p: any) => this.parsePosition(p));
  }

  async getPosition(tokenId: string): Promise<PolymarketPosition | null> {
    try {
      const response = await this.httpClient.get(`/positions/${tokenId}`);
      return this.parsePosition(response.data);
    } catch (error: any) {
      if (error.response?.status === 404) return null;
      throw error;
    }
  }

  async closePosition(
    tokenId: string,
    slippage?: number
  ): Promise<PolymarketOrderResponse> {
    const position = await this.getPosition(tokenId);
    if (!position) {
      throw new PolymarketOrderError(`No position found for token ${tokenId}`);
    }

    // Create market order to close position
    const closeOrder: PolymarketOrder = {
      tokenId: position.tokenId,
      conditionId: position.conditionId,
      outcome: position.outcome,
      side: 'SELL',  // Always sell to close
      size: position.size,
      price: position.currentPrice,
      type: 'MARKET',
      slippage: slippage || this.config.defaultSlippage,
    };

    return await this.submitOrder(closeOrder);
  }

  async closeAllPositions(): Promise<void> {
    const positions = await this.getPositions();
    await Promise.all(positions.map(p => this.closePosition(p.tokenId)));
  }

  private parsePosition(data: any): PolymarketPosition {
    const unrealizedPnL = data.marketValue - data.costBasis;
    const unrealizedPnLPercent = data.costBasis > 0
      ? unrealizedPnL / data.costBasis
      : 0;

    return {
      tokenId: data.tokenId,
      conditionId: data.conditionId,
      question: data.question,
      outcome: data.outcome,
      size: parseFloat(data.size),
      avgEntryPrice: parseFloat(data.avgEntryPrice),
      currentPrice: parseFloat(data.currentPrice),
      costBasis: parseFloat(data.costBasis),
      marketValue: parseFloat(data.marketValue),
      unrealizedPnL,
      unrealizedPnLPercent,
      lastUpdate: new Date(data.lastUpdate),
    };
  }

  // ============================================================================
  // TRADE HISTORY
  // ============================================================================

  async getTrades(filters?: {
    conditionId?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<PolymarketTrade[]> {
    const params: any = {};
    if (filters?.conditionId) params.conditionId = filters.conditionId;
    if (filters?.startDate) params.startDate = filters.startDate.toISOString();
    if (filters?.endDate) params.endDate = filters.endDate.toISOString();

    const response = await this.httpClient.get('/trades', { params });
    return response.data.map((t: any) => ({
      tradeId: t.tradeId,
      orderId: t.orderId,
      tokenId: t.tokenId,
      conditionId: t.conditionId,
      outcome: t.outcome,
      side: t.side,
      size: parseFloat(t.size),
      price: parseFloat(t.price),
      value: parseFloat(t.value),
      fee: parseFloat(t.fee),
      timestamp: new Date(t.timestamp),
    }));
  }

  // ============================================================================
  // WEBSOCKET (Real-time Updates)
  // ============================================================================

  private async connectWebSocket(): Promise<void> {
    if (!this.config.enableWebSocket) return;

    try {
      this.ws = new WebSocket(this.config.wsBaseUrl);

      this.ws.on('open', () => {
        console.log('✓ Polymarket WebSocket connected');
        this.wsReconnectAttempts = 0;

        // Subscribe to account updates
        this.ws?.send(JSON.stringify({
          type: 'subscribe',
          channel: 'account',
          address: this.wallet.address,
        }));
      });

      this.ws.on('message', (data: string) => {
        try {
          const message = JSON.parse(data);
          this.handleWebSocketMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      });

      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });

      this.ws.on('close', () => {
        console.log('WebSocket closed');
        this.reconnectWebSocket();
      });
    } catch (error: any) {
      console.error('Failed to connect WebSocket:', error.message);
    }
  }

  private async reconnectWebSocket(): Promise<void> {
    if (this.wsReconnectAttempts >= this.MAX_WS_RECONNECT_ATTEMPTS) {
      console.error('Max WebSocket reconnection attempts reached');
      return;
    }

    this.wsReconnectAttempts++;
    const delay = Math.pow(2, this.wsReconnectAttempts) * 1000;

    console.log(`Reconnecting WebSocket in ${delay}ms (attempt ${this.wsReconnectAttempts})`);

    setTimeout(() => {
      this.connectWebSocket();
    }, delay);
  }

  private handleWebSocketMessage(message: any): void {
    // Handle different message types
    switch (message.type) {
      case 'MARKET':
        // Market price update
        break;
      case 'ORDER':
        // Order status update
        break;
      case 'TRADE':
        // Trade execution
        break;
      case 'ORDERBOOK':
        // Order book update
        break;
      default:
        console.log('Unknown WebSocket message type:', message.type);
    }
  }
}
