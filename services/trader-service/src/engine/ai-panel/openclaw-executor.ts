// =============================================================================
// OpenClaw Executor - Connects AI Panel to OpenClaw Risk Engine & Alpaca
// =============================================================================
// Takes panel recommendations and executes through OpenClaw's order router
// =============================================================================

import { RebalanceTrade, PortfolioSnapshot, PositionInfo } from './index';
import { AlpacaAdapter } from '../execution/broker/alpaca';
import { config } from '../../config';

export interface ExecutionResult {
  trade: RebalanceTrade;
  success: boolean;
  orderId?: string;
  error?: string;
}

export class OpenClawExecutor {
  private broker: AlpacaAdapter;

  constructor() {
    if (!config.brokerApiKey || !config.brokerApiSecret) {
      throw new Error('Broker credentials not configured');
    }

    this.broker = new AlpacaAdapter({
      apiKey: config.brokerApiKey,
      apiSecret: config.brokerApiSecret,
      baseUrl: config.brokerBaseUrl,
    });
  }

  /**
   * Get current portfolio snapshot from Alpaca
   */
  async getPortfolioSnapshot(): Promise<PortfolioSnapshot> {
    try {
      // Get account info
      const account = await this.broker.getAccount();
      const positions = await this.broker.getPositions();

      const totalValue = parseFloat(account.portfolio_value);
      const cash = parseFloat(account.cash);

      const positionInfos: PositionInfo[] = positions.map((p: any) => {
        const marketValue = parseFloat(p.market_value);
        const qty = parseFloat(p.qty);
        const avgEntryPrice = parseFloat(p.avg_entry_price);
        const currentPrice = parseFloat(p.current_price);
        const unrealizedPnl = parseFloat(p.unrealized_pl);

        return {
          symbol: p.symbol,
          qty,
          marketValue,
          weight: totalValue > 0 ? marketValue / totalValue : 0,
          avgEntryPrice,
          currentPrice,
          unrealizedPnl,
          unrealizedPnlPercent: avgEntryPrice > 0 ? (unrealizedPnl / (qty * avgEntryPrice)) * 100 : 0,
        };
      });

      return {
        timestamp: new Date(),
        totalValue,
        cash,
        positions: positionInfos,
      };
    } catch (error: any) {
      console.error('[OpenClawExecutor] Failed to get portfolio:', error);
      // Return empty portfolio as fallback
      return {
        timestamp: new Date(),
        totalValue: 500, // Default for new account
        cash: 500,
        positions: [],
      };
    }
  }

  /**
   * Execute a rebalance trade through Alpaca
   */
  async executeTrade(trade: RebalanceTrade): Promise<ExecutionResult> {
    try {
      // Get current price for accurate share calculation
      const quote = await this.broker.getQuote(trade.symbol);
      const currentPrice = quote.price || 0;

      if (currentPrice === 0) {
        return {
          trade,
          success: false,
          error: `Unable to get price for ${trade.symbol}`,
        };
      }

      // Calculate shares based on dollar value and current price
      const dollarValue = Math.abs(trade.estimatedValue);
      const shares = Math.floor(dollarValue / currentPrice);

      console.log(`[OpenClawExecutor] Executing ${trade.side.toUpperCase()} ${shares} ${trade.symbol} @ $${currentPrice.toFixed(2)} (${dollarValue.toFixed(2)} value)`);

      if (shares === 0) {
        return {
          trade,
          success: false,
          error: 'Zero shares calculated - position too small',
        };
      }

      // Submit market order to Alpaca
      const order = await this.broker.submitOrder({
        symbol: trade.symbol,
        qty: shares,
        side: trade.side as 'buy' | 'sell',
        type: 'market',
        time_in_force: 'day',
      });

      console.log(`[OpenClawExecutor] ✅ Order submitted: ${order.id} for ${shares} ${trade.symbol}`);

      return {
        trade,
        success: true,
        orderId: order.id,
      };
    } catch (error: any) {
      console.error(`[OpenClawExecutor] ❌ Failed to execute trade for ${trade.symbol}:`, error.message);
      return {
        trade,
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Execute all rebalance trades
   */
  async executePortfolioRebalance(trades: RebalanceTrade[]): Promise<ExecutionResult[]> {
    console.log(`\n[OpenClawExecutor] Executing ${trades.length} rebalance trades...\n`);

    const results: ExecutionResult[] = [];

    // Execute sells first to free up cash
    const sells = trades.filter(t => t.side === 'sell');
    const buys = trades.filter(t => t.side === 'buy');

    for (const trade of sells) {
      const result = await this.executeTrade(trade);
      results.push(result);
      // Small delay between orders
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    for (const trade of buys) {
      const result = await this.executeTrade(trade);
      results.push(result);
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`\n[OpenClawExecutor] Execution complete: ${successful} success, ${failed} failed\n`);

    return results;
  }

  /**
   * Get current market prices for symbols
   */
  async getMarketPrices(symbols: string[]): Promise<Record<string, number>> {
    try {
      const prices: Record<string, number> = {};

      for (const symbol of symbols) {
        try {
          const quote = await this.broker.getQuote(symbol);
          prices[symbol] = quote.price || 0;
        } catch (error) {
          console.warn(`[OpenClawExecutor] Failed to get price for ${symbol}`);
          prices[symbol] = 0;
        }
      }

      return prices;
    } catch (error) {
      console.error('[OpenClawExecutor] Failed to get market prices:', error);
      return {};
    }
  }
}
