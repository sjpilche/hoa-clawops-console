import Alpaca from '@alpacahq/alpaca-trade-api';
import {
  IBrokerAdapter,
  BrokerConfig,
  BrokerOrder,
  BrokerOrderResponse,
  BrokerPosition,
  BrokerAccount,
} from './types';
import { MarketData } from '../../strategy/types';

export class AlpacaAdapter implements IBrokerAdapter {
  private alpaca: Alpaca;
  private connected: boolean = false;

  constructor(config: BrokerConfig) {
    this.alpaca = new Alpaca({
      keyId: config.apiKey,
      secretKey: config.apiSecret,
      paper: config.baseUrl.includes('paper'), // Auto-detect paper vs live
      baseUrl: config.baseUrl,
    });
  }

  async connect(): Promise<void> {
    try {
      // Test connection by fetching account
      await this.alpaca.getAccount();
      this.connected = true;
      console.log('✓ Connected to Alpaca');
    } catch (error) {
      console.error('✗ Failed to connect to Alpaca:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    console.log('✓ Disconnected from Alpaca');
  }

  isConnected(): boolean {
    return this.connected;
  }

  async getAccount(): Promise<BrokerAccount> {
    const account = await this.alpaca.getAccount();

    return {
      id: account.id,
      accountNumber: account.account_number,
      status: account.status,
      currency: account.currency,
      cash: parseFloat(account.cash),
      portfolioValue: parseFloat(account.portfolio_value),
      buyingPower: parseFloat(account.buying_power),
      equity: parseFloat(account.equity),
      lastEquity: parseFloat(account.last_equity),
      daytradeCount: account.daytrade_count,
      patternDayTrader: account.pattern_day_trader,
    };
  }

  async submitOrder(order: BrokerOrder): Promise<BrokerOrderResponse> {
    console.log(`→ Submitting order to Alpaca: ${order.side} ${order.qty} ${order.symbol} @ ${order.type}`);

    const alpacaOrder = await this.alpaca.createOrder({
      symbol: order.symbol,
      qty: order.qty,
      side: order.side,
      type: order.type,
      time_in_force: order.timeInForce,
      limit_price: order.limitPrice,
      stop_price: order.stopPrice,
      client_order_id: order.clientOrderId,
    });

    console.log(`✓ Order submitted: ${alpacaOrder.id} (status: ${alpacaOrder.status})`);

    return this.mapAlpacaOrder(alpacaOrder);
  }

  async getOrder(orderId: string): Promise<BrokerOrderResponse> {
    const alpacaOrder = await this.alpaca.getOrder(orderId);
    return this.mapAlpacaOrder(alpacaOrder);
  }

  async cancelOrder(orderId: string): Promise<void> {
    await this.alpaca.cancelOrder(orderId);
    console.log(`✓ Order cancelled: ${orderId}`);
  }

  async getOpenOrders(): Promise<BrokerOrderResponse[]> {
    const orders = await this.alpaca.getOrders({ status: 'open' });
    return orders.map((o: any) => this.mapAlpacaOrder(o));
  }

  async cancelAllOrders(): Promise<void> {
    await this.alpaca.cancelAllOrders();
    console.log('✓ All orders cancelled');
  }

  async getPositions(): Promise<BrokerPosition[]> {
    const positions = await this.alpaca.getPositions();

    return positions.map((p: any) => ({
      symbol: p.symbol,
      qty: parseFloat(p.qty),
      side: parseFloat(p.qty) > 0 ? 'long' : 'short',
      avgEntryPrice: parseFloat(p.avg_entry_price),
      marketValue: parseFloat(p.market_value),
      costBasis: parseFloat(p.cost_basis),
      unrealizedPl: parseFloat(p.unrealized_pl),
      unrealizedPlpc: parseFloat(p.unrealized_plpc),
      currentPrice: parseFloat(p.current_price),
    }));
  }

  async getPosition(symbol: string): Promise<BrokerPosition | null> {
    try {
      const p = await this.alpaca.getPosition(symbol);

      return {
        symbol: p.symbol,
        qty: parseFloat(p.qty),
        side: parseFloat(p.qty) > 0 ? 'long' : 'short',
        avgEntryPrice: parseFloat(p.avg_entry_price),
        marketValue: parseFloat(p.market_value),
        costBasis: parseFloat(p.cost_basis),
        unrealizedPl: parseFloat(p.unrealized_pl),
        unrealizedPlpc: parseFloat(p.unrealized_plpc),
        currentPrice: parseFloat(p.current_price),
      };
    } catch (error: any) {
      if (error.status === 404) {
        return null; // No position
      }
      throw error;
    }
  }

  async closePosition(symbol: string): Promise<BrokerOrderResponse> {
    console.log(`→ Closing position: ${symbol}`);
    const alpacaOrder = await this.alpaca.closePosition(symbol);
    console.log(`✓ Position close order submitted: ${alpacaOrder.id}`);
    return this.mapAlpacaOrder(alpacaOrder);
  }

  async closeAllPositions(): Promise<void> {
    console.log('→ Closing all positions');
    await this.alpaca.closeAllPositions();
    console.log('✓ All positions closed');
  }

  async getLastPrice(symbol: string): Promise<number> {
    const trade = await this.alpaca.getLatestTrade(symbol);
    return parseFloat(trade.p);
  }

  async getQuote(symbol: string): Promise<{ bid: number; ask: number; last: number }> {
    const quote = await this.alpaca.getLatestQuote(symbol);

    return {
      bid: parseFloat(quote.bp),
      ask: parseFloat(quote.ap),
      last: (parseFloat(quote.bp) + parseFloat(quote.ap)) / 2,
    };
  }

  /**
   * Get historical bars for a symbol
   * @param symbol Stock symbol
   * @param params Bar parameters (start, end, timeframe, limit, adjustment)
   * @returns Array of market data bars
   */
  async getBars(symbol: string, params: {
    start: string;
    end?: string;
    timeframe: '1Min' | '5Min' | '1Hour' | '1Day';
    limit?: number;
    adjustment?: 'raw' | 'split' | 'dividend' | 'all';
  }): Promise<MarketData[]> {
    await this.connect();

    const queryParams: any = {
      start: params.start,
      timeframe: params.timeframe,
      adjustment: params.adjustment || 'split',
      feed: 'iex' // Use IEX feed which is available for free paper trading accounts
    };

    if (params.end) {
      queryParams.end = params.end;
    }

    if (params.limit) {
      queryParams.limit = params.limit;
    }

    try {
      const bars = await this.alpaca.getBarsV2(symbol, queryParams);
      const barArray: MarketData[] = [];

      for await (const bar of bars) {
        barArray.push({
          symbol,
          timestamp: new Date(bar.Timestamp),
          open: bar.OpenPrice,
          high: bar.HighPrice,
          low: bar.LowPrice,
          close: bar.ClosePrice,
          volume: bar.Volume
        });
      }

      return barArray;

    } catch (error: any) {
      console.error(`Error fetching bars for ${symbol}:`, error.message);
      return [];
    }
  }

  // Helper method to map Alpaca order to our format
  private mapAlpacaOrder(alpacaOrder: any): BrokerOrderResponse {
    return {
      id: alpacaOrder.id,
      clientOrderId: alpacaOrder.client_order_id,
      status: this.mapOrderStatus(alpacaOrder.status),
      symbol: alpacaOrder.symbol,
      qty: parseFloat(alpacaOrder.qty),
      filledQty: parseFloat(alpacaOrder.filled_qty || 0),
      side: alpacaOrder.side,
      type: alpacaOrder.type,
      timeInForce: alpacaOrder.time_in_force,
      limitPrice: alpacaOrder.limit_price ? parseFloat(alpacaOrder.limit_price) : undefined,
      filledAvgPrice: alpacaOrder.filled_avg_price ? parseFloat(alpacaOrder.filled_avg_price) : undefined,
      submittedAt: new Date(alpacaOrder.submitted_at),
      filledAt: alpacaOrder.filled_at ? new Date(alpacaOrder.filled_at) : undefined,
    };
  }

  private mapOrderStatus(alpacaStatus: string): 'new' | 'partially_filled' | 'filled' | 'canceled' | 'rejected' {
    switch (alpacaStatus) {
      case 'new':
      case 'pending_new':
      case 'accepted':
        return 'new';
      case 'partially_filled':
        return 'partially_filled';
      case 'filled':
        return 'filled';
      case 'canceled':
      case 'pending_cancel':
        return 'canceled';
      case 'rejected':
      case 'expired':
        return 'rejected';
      default:
        return 'new';
    }
  }
}
