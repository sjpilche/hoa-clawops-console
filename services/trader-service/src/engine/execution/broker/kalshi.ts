/**
 * Kalshi Broker Adapter
 * CFTC-regulated event contracts — prediction market trading
 *
 * Authentication: RSA-PSS signing (SHA-256) on every request.
 * All monetary values are in CENTS (integer).
 *
 * Rate limit: 20 orders/second — adapter enforces 10/s for safety margin.
 */

import crypto from 'crypto';
import {
  KalshiConfig,
  KalshiMarket,
  KalshiEvent,
  KalshiOrder,
  KalshiOrderParams,
  KalshiPosition,
  KalshiBalance,
  KalshiOrderbook,
  KalshiFill,
  KalshiExchangeStatus,
  KalshiError,
  KalshiAuthError,
  KalshiOrderError,
  KalshiRateLimitError,
} from './kalshi-types';

// Weather keyword patterns for market filtering
const WEATHER_KEYWORDS = /\b(temperature|temp|weather|rain|rainfall|precipitation|snow|snowfall|wind|hurricane|tornado|heat|cold|freeze|frost|storm|thunder|hail|drought|flood|blizzard|celsius|fahrenheit|°[FC])\b/i;

export class KalshiAdapter {
  private config: KalshiConfig;
  private connected: boolean = false;

  // Rate limiting — 10 orders/second (conservative; Kalshi allows 20)
  private orderTimestamps: number[] = [];
  private readonly MAX_ORDERS_PER_SECOND = 10;

  // Request-level rate limiting — 60/minute for non-order endpoints
  private requestCount: number = 0;
  private requestWindow: number = Date.now();
  private readonly MAX_REQUESTS_PER_MINUTE = 120;

  constructor() {
    this.config = {
      apiKey: process.env.KALSHI_API_KEY || '',
      privateKey: (process.env.KALSHI_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      baseUrl: process.env.KALSHI_BASE_URL || 'https://api.elections.kalshi.com/trade-api/v2',
    };
  }

  // ==========================================================================
  // AUTH — RSA-PSS Signing
  // ==========================================================================

  /**
   * Sign a request using RSA-PSS SHA-256.
   * Message format: {timestamp}{METHOD}{path}
   * Path must NOT include query parameters.
   */
  private sign(timestamp: string, method: string, path: string): string {
    const message = timestamp + method.toUpperCase() + path;
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(message);
    const signature = sign.sign({
      key: this.config.privateKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    });
    return signature.toString('base64');
  }

  private getHeaders(method: string, path: string): Record<string, string> {
    const timestamp = Date.now().toString();
    return {
      'KALSHI-ACCESS-KEY': this.config.apiKey,
      'KALSHI-ACCESS-TIMESTAMP': timestamp,
      'KALSHI-ACCESS-SIGNATURE': this.sign(timestamp, method.toUpperCase(), path),
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }

  // ==========================================================================
  // HTTP — Request handler with rate limiting and retry
  // ==========================================================================

  private async request<T = any>(method: string, path: string, body?: any): Promise<T> {
    await this.checkRequestRateLimit();

    // Full path includes the /trade-api/v2 prefix — Kalshi signs the FULL path
    const fullPath = '/trade-api/v2' + path;
    // Strip query params from path for signing (Kalshi signs path only)
    const signPath = fullPath.split('?')[0];
    const headers = this.getHeaders(method, signPath);
    const url = this.config.baseUrl + path;

    const fetchOpts: RequestInit = {
      method: method.toUpperCase(),
      headers,
    };
    if (body && method.toUpperCase() !== 'GET') {
      fetchOpts.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOpts);

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      if (response.status === 401 || response.status === 403) {
        throw new KalshiAuthError(`Kalshi auth failed: ${response.status} ${text}`);
      }
      if (response.status === 429) {
        throw new KalshiRateLimitError(`Kalshi rate limited: ${text}`);
      }
      if (response.status === 400) {
        throw new KalshiOrderError(`Kalshi bad request: ${text}`);
      }
      throw new KalshiError(
        `Kalshi ${method.toUpperCase()} ${path}: ${response.status} ${text}`,
        'API_ERROR',
        response.status,
        text,
      );
    }

    // Some DELETE endpoints return 204 with no body
    if (response.status === 204) return {} as T;

    return response.json() as Promise<T>;
  }

  private async checkRequestRateLimit(): Promise<void> {
    const now = Date.now();
    if (now - this.requestWindow > 60_000) {
      this.requestCount = 0;
      this.requestWindow = now;
    }
    if (this.requestCount >= this.MAX_REQUESTS_PER_MINUTE) {
      const waitMs = 60_000 - (now - this.requestWindow);
      console.warn(`[Kalshi] Request rate limit — waiting ${Math.ceil(waitMs / 1000)}s`);
      await new Promise((r) => setTimeout(r, waitMs));
      this.requestCount = 0;
      this.requestWindow = Date.now();
    }
    this.requestCount++;
  }

  /**
   * Enforce order-level rate limit (20/second, we use 10 for safety).
   */
  private async checkOrderRateLimit(): Promise<void> {
    const now = Date.now();
    // Prune timestamps older than 1 second
    this.orderTimestamps = this.orderTimestamps.filter((ts) => now - ts < 1000);

    if (this.orderTimestamps.length >= this.MAX_ORDERS_PER_SECOND) {
      const oldestInWindow = this.orderTimestamps[0];
      const waitMs = 1000 - (now - oldestInWindow) + 10; // +10ms buffer
      await new Promise((r) => setTimeout(r, waitMs));
    }
    this.orderTimestamps.push(Date.now());
  }

  private async retryWithBackoff<T>(fn: () => Promise<T>, attempts: number = 3): Promise<T> {
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (error: any) {
        if (i === attempts - 1) throw error;
        if (error instanceof KalshiRateLimitError) {
          const delay = Math.pow(2, i) * 1000;
          console.warn(`[Kalshi] Rate limited — retrying in ${delay}ms (attempt ${i + 1}/${attempts})`);
          await new Promise((r) => setTimeout(r, delay));
        } else {
          throw error; // Non-retryable errors fail immediately
        }
      }
    }
    throw new Error('Retry failed');
  }

  // ==========================================================================
  // CONNECTION
  // ==========================================================================

  async connect(): Promise<void> {
    if (!this.isConfigured()) {
      throw new KalshiAuthError('Kalshi not configured — set KALSHI_API_KEY and KALSHI_PRIVATE_KEY');
    }

    try {
      const status = await this.getExchangeStatus();
      console.log(`[Kalshi] Connected to ${this.config.baseUrl}`);
      console.log(`[Kalshi] Exchange active: ${status.exchange_active}, Trading active: ${status.trading_active}`);

      // Verify auth by fetching balance
      const balance = await this.getBalance();
      console.log(`[Kalshi] Balance: $${(balance.balance / 100).toFixed(2)}, Portfolio: $${(balance.portfolio_value / 100).toFixed(2)}`);

      this.connected = true;
    } catch (error: any) {
      this.connected = false;
      throw new KalshiAuthError(`Failed to connect to Kalshi: ${error.message}`, error);
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    console.log('[Kalshi] Disconnected');
  }

  isConnected(): boolean {
    return this.connected;
  }

  isConfigured(): boolean {
    return !!(this.config.apiKey && this.config.privateKey && this.config.privateKey.includes('BEGIN'));
  }

  getStatus(): { configured: boolean; connected: boolean; baseUrl: string } {
    return {
      configured: this.isConfigured(),
      connected: this.connected,
      baseUrl: this.config.baseUrl,
    };
  }

  // ==========================================================================
  // EXCHANGE
  // ==========================================================================

  async getExchangeStatus(): Promise<KalshiExchangeStatus> {
    const data = await this.request<{ status: KalshiExchangeStatus }>('GET', '/exchange/status');
    return data.status ?? data as any;
  }

  // ==========================================================================
  // MARKETS
  // ==========================================================================

  async getMarkets(params?: {
    status?: string;
    cursor?: string;
    limit?: number;
    event_ticker?: string;
    series_ticker?: string;
  }): Promise<{ markets: KalshiMarket[]; cursor: string }> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.event_ticker) query.set('event_ticker', params.event_ticker);
    if (params?.series_ticker) query.set('series_ticker', params.series_ticker);

    const qs = query.toString();
    const path = qs ? `/markets?${qs}` : '/markets';
    const data = await this.request<{ markets: KalshiMarket[]; cursor: string }>('GET', path);
    return {
      markets: data.markets || [],
      cursor: data.cursor || '',
    };
  }

  async getMarket(ticker: string): Promise<KalshiMarket> {
    const data = await this.request<{ market: KalshiMarket }>('GET', `/markets/${ticker}`);
    return data.market;
  }

  async getOrderbook(ticker: string): Promise<KalshiOrderbook> {
    const data = await this.request<{ orderbook: KalshiOrderbook }>('GET', `/markets/${ticker}/orderbook`);
    return data.orderbook;
  }

  /**
   * Search for weather-related markets on Kalshi.
   * Kalshi uses category-based filtering; we fetch open markets and
   * filter by weather keywords in the title.
   */
  async searchWeatherMarkets(): Promise<KalshiMarket[]> {
    const weatherMarkets: KalshiMarket[] = [];
    let cursor = '';
    let pages = 0;
    const MAX_PAGES = 5; // Safety cap on pagination

    try {
      do {
        const result = await this.retryWithBackoff(() =>
          this.getMarkets({
            status: 'open',
            limit: 200,
            cursor: cursor || undefined,
          }),
        );

        for (const market of result.markets) {
          if (WEATHER_KEYWORDS.test(market.title)) {
            weatherMarkets.push(market);
          }
        }

        cursor = result.cursor;
        pages++;
      } while (cursor && pages < MAX_PAGES);
    } catch (err: any) {
      console.warn(`[Kalshi] Weather market search failed: ${err.message}`);
    }

    return weatherMarkets;
  }

  // ==========================================================================
  // EVENTS
  // ==========================================================================

  async getEvents(params?: {
    cursor?: string;
    limit?: number;
    status?: string;
  }): Promise<{ events: KalshiEvent[]; cursor: string }> {
    const query = new URLSearchParams();
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.status) query.set('status', params.status);

    const qs = query.toString();
    const path = qs ? `/events?${qs}` : '/events';
    const data = await this.request<{ events: KalshiEvent[]; cursor: string }>('GET', path);
    return {
      events: data.events || [],
      cursor: data.cursor || '',
    };
  }

  async getEvent(ticker: string): Promise<KalshiEvent> {
    const data = await this.request<{ event: KalshiEvent }>('GET', `/events/${ticker}`);
    return data.event;
  }

  // ==========================================================================
  // ORDERS
  // ==========================================================================

  async createOrder(params: KalshiOrderParams): Promise<KalshiOrder> {
    await this.checkOrderRateLimit();

    // Validate price for limit orders
    if (params.type === 'limit') {
      if (!params.price || params.price < 1 || params.price > 99) {
        throw new KalshiOrderError(
          `Invalid limit price: ${params.price}. Must be 1-99 cents.`,
        );
      }
    }

    if (params.count < 1) {
      throw new KalshiOrderError(`Invalid count: ${params.count}. Must be >= 1.`);
    }

    const body: any = {
      ticker: params.ticker,
      side: params.side,
      type: params.type,
      count: params.count,
      action: params.action || 'buy',
    };

    if (params.type === 'limit' && params.price) {
      // Kalshi expects yes_price for 'yes' side, no_price for 'no' side
      if (params.side === 'yes') {
        body.yes_price = params.price;
      } else {
        body.no_price = params.price;
      }
    }

    if (params.client_order_id) body.client_order_id = params.client_order_id;
    if (params.expiration_ts) body.expiration_ts = params.expiration_ts;

    const data = await this.retryWithBackoff(() =>
      this.request<{ order: KalshiOrder }>('POST', '/portfolio/orders', body),
    );
    return data.order;
  }

  async getOrder(orderId: string): Promise<KalshiOrder> {
    const data = await this.request<{ order: KalshiOrder }>('GET', `/portfolio/orders/${orderId}`);
    return data.order;
  }

  async getOrders(params?: {
    status?: string;
    ticker?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ orders: KalshiOrder[]; cursor: string }> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.ticker) query.set('ticker', params.ticker);
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.limit) query.set('limit', params.limit.toString());

    const qs = query.toString();
    const path = qs ? `/portfolio/orders?${qs}` : '/portfolio/orders';
    const data = await this.request<{ orders: KalshiOrder[]; cursor: string }>('GET', path);
    return {
      orders: data.orders || [],
      cursor: data.cursor || '',
    };
  }

  async cancelOrder(orderId: string): Promise<void> {
    await this.checkOrderRateLimit();
    await this.request('DELETE', `/portfolio/orders/${orderId}`);
  }

  // ==========================================================================
  // PORTFOLIO
  // ==========================================================================

  async getBalance(): Promise<KalshiBalance> {
    const data = await this.request<KalshiBalance>('GET', '/portfolio/balance');
    return {
      balance: data.balance ?? 0,
      portfolio_value: data.portfolio_value ?? 0,
    };
  }

  async getPositions(): Promise<KalshiPosition[]> {
    const data = await this.request<{ market_positions: KalshiPosition[] }>('GET', '/portfolio/positions');
    return data.market_positions || [];
  }

  async getFills(params?: {
    ticker?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ fills: KalshiFill[]; cursor: string }> {
    const query = new URLSearchParams();
    if (params?.ticker) query.set('ticker', params.ticker);
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.limit) query.set('limit', params.limit.toString());

    const qs = query.toString();
    const path = qs ? `/portfolio/fills?${qs}` : '/portfolio/fills';
    const data = await this.request<{ fills: KalshiFill[]; cursor: string }>('GET', path);
    return {
      fills: data.fills || [],
      cursor: data.cursor || '',
    };
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Convert Kalshi cents price to 0-1 probability for compatibility
   * with the weather strategy (which thinks in probabilities).
   */
  static centsToProbability(cents: number): number {
    return cents / 100;
  }

  /**
   * Convert 0-1 probability to Kalshi cents price.
   */
  static probabilityToCents(prob: number): number {
    return Math.round(prob * 100);
  }
}
