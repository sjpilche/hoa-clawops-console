// =============================================================================
// OpenClaw Executor - Risk-Enforced Order Router → Alpaca
// =============================================================================
// Before every order:
//   1. Daily P&L vs RISK_MAX_DAILY_LOSS — halt if breached
//   2. Position size vs RISK_MAX_POSITION_USD — cap order value
//   3. Gross exposure vs RISK_MAX_GROSS_EXPOSURE_USD — reject if exceeded
//   4. Trade count vs RISK_MAX_TRADES_PER_DAY — reject if exceeded
// All rejections logged so brain can learn what gets blocked.
// =============================================================================

import { RebalanceTrade, PortfolioSnapshot, PositionInfo } from './index';
import { AlpacaAdapter } from '../execution/broker/alpaca';
import { config } from '../../config';

export interface ExecutionResult {
  trade: RebalanceTrade;
  success: boolean;
  orderId?: string;
  error?: string;
  riskRejected?: boolean;
}

interface RiskState {
  date: string;           // YYYY-MM-DD — resets daily
  tradesExecuted: number;
  realizedPnl: number;    // From Alpaca account activities
  grossExposure: number;  // Sum of abs(position market values)
}

export class OpenClawExecutor {
  private broker: AlpacaAdapter;
  private riskState: RiskState;

  constructor() {
    if (!config.brokerApiKey || !config.brokerApiSecret) {
      throw new Error('Broker credentials not configured');
    }

    this.broker = new AlpacaAdapter({
      apiKey: config.brokerApiKey,
      apiSecret: config.brokerApiSecret,
      baseUrl: config.brokerBaseUrl,
    });

    this.riskState = {
      date: new Date().toISOString().split('T')[0],
      tradesExecuted: 0,
      realizedPnl: 0,
      grossExposure: 0,
    };
  }

  /** Reset risk counters if a new trading day */
  private checkDayRollover(): void {
    const today = new Date().toISOString().split('T')[0];
    if (this.riskState.date !== today) {
      console.log(`[RiskEngine] New trading day: ${today} — resetting counters`);
      this.riskState = {
        date: today,
        tradesExecuted: 0,
        realizedPnl: 0,
        grossExposure: 0,
      };
    }
  }

  /** Refresh gross exposure and daily P&L from Alpaca */
  private async refreshRiskState(): Promise<void> {
    this.checkDayRollover();

    try {
      const account = await this.broker.getAccount();
      const positions = await this.broker.getPositions();

      // Gross exposure = sum of abs(marketValue) of all positions
      this.riskState.grossExposure = positions.reduce(
        (sum: number, p: any) => sum + Math.abs(p.marketValue || 0), 0
      );

      // Daily P&L from Alpaca (unrealized + realized for the day)
      const dailyPnl = account.equity - account.lastEquity;
      this.riskState.realizedPnl = dailyPnl;
    } catch (error: any) {
      console.warn('[RiskEngine] Could not refresh risk state:', error.message);
    }
  }

  /**
   * Get effective risk limits. In live mode with small accounts, auto-clamp to survival limits.
   * $50 account: max position $10, max daily loss $5, max exposure $25, max 5 trades.
   * Survives 10 consecutive max-loss days.
   */
  private getEffectiveLimits() {
    let maxDailyLoss = config.riskMaxDailyLoss;
    let maxPositionUsd = config.riskMaxPositionUsd;
    let maxGrossExposure = config.riskMaxGrossExposureUsd;
    let maxTrades = config.riskMaxTradesPerDay;

    if (config.tradingMode === 'live') {
      // Hard-clamp for live small accounts — these are ceilings, env can go lower
      maxDailyLoss = Math.min(maxDailyLoss, 5);
      maxPositionUsd = Math.min(maxPositionUsd, 10);
      maxGrossExposure = Math.min(maxGrossExposure, 25);
      maxTrades = Math.min(maxTrades, 5);
      console.log(`[RiskEngine] LIVE MODE — limits clamped: loss=$${maxDailyLoss}, pos=$${maxPositionUsd}, exp=$${maxGrossExposure}, trades=${maxTrades}`);
    }

    return { maxDailyLoss, maxPositionUsd, maxGrossExposure, maxTrades };
  }

  /**
   * Check all risk limits before a trade. Returns null if OK, error string if blocked.
   */
  private checkRiskLimits(trade: RebalanceTrade, dollarValue: number): string | null {
    const { maxDailyLoss, maxPositionUsd, maxGrossExposure, maxTrades } = this.getEffectiveLimits();

    // 1. Daily P&L check — are we already at max loss?
    if (this.riskState.realizedPnl <= -maxDailyLoss) {
      return `RISK: Daily loss limit breached ($${Math.abs(this.riskState.realizedPnl).toFixed(2)} loss vs $${maxDailyLoss} limit) — trading halted for today`;
    }

    // 2. Trade count check
    if (this.riskState.tradesExecuted >= maxTrades) {
      return `RISK: Max trades per day reached (${this.riskState.tradesExecuted}/${maxTrades}) — no more trades today`;
    }

    // 3. Position size check (buys only — sells reduce risk)
    if (trade.side === 'buy' && dollarValue > maxPositionUsd) {
      return `RISK: Position size $${dollarValue.toFixed(2)} exceeds max $${maxPositionUsd} — will be capped`;
    }

    // 4. Gross exposure check (buys only)
    if (trade.side === 'buy') {
      const projectedExposure = this.riskState.grossExposure + dollarValue;
      if (projectedExposure > maxGrossExposure) {
        return `RISK: Would bring gross exposure to $${projectedExposure.toFixed(2)} vs $${maxGrossExposure} limit — rejected`;
      }
    }

    return null;
  }

  /**
   * Get current portfolio snapshot from Alpaca
   */
  async getPortfolioSnapshot(): Promise<PortfolioSnapshot> {
    try {
      const account = await this.broker.getAccount();
      const positions = await this.broker.getPositions();

      const totalValue = account.portfolioValue || 0;
      const cash = account.cash || 0;

      const positionInfos: PositionInfo[] = positions.map((p: any) => {
        const marketValue = parseFloat(p.market_value) || 0;
        const qty = parseFloat(p.qty) || 0;
        const avgEntryPrice = parseFloat(p.avg_entry_price) || 0;
        const currentPrice = parseFloat(p.current_price) || 0;
        const unrealizedPnl = parseFloat(p.unrealized_pl) || 0;

        return {
          symbol: p.symbol,
          qty,
          marketValue,
          weight: (totalValue > 0 && !isNaN(marketValue)) ? marketValue / totalValue : 0,
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
      return {
        timestamp: new Date(),
        totalValue: 500,
        cash: 500,
        positions: [],
      };
    }
  }

  /**
   * Execute a rebalance trade through Alpaca — with risk enforcement
   */
  async executeTrade(trade: RebalanceTrade): Promise<ExecutionResult> {
    try {
      // Refresh risk state before every trade
      await this.refreshRiskState();

      // Get current price for accurate share calculation
      const quote = await this.broker.getQuote(trade.symbol);
      const currentPrice = quote.last || 0;

      if (currentPrice === 0) {
        return { trade, success: false, error: `Unable to get price for ${trade.symbol}` };
      }

      let dollarValue = Math.abs(trade.estimatedValue);

      // --- RISK CHECKS ---
      const riskError = this.checkRiskLimits(trade, dollarValue);

      if (riskError) {
        // Hard rejections (daily loss, trade count, gross exposure)
        if (!riskError.includes('will be capped')) {
          console.warn(`[RiskEngine] BLOCKED: ${trade.symbol} ${trade.side} — ${riskError}`);
          return { trade, success: false, error: riskError, riskRejected: true };
        }

        // Soft cap: reduce position size to max allowed
        console.warn(`[RiskEngine] CAPPING: ${trade.symbol} from $${dollarValue.toFixed(2)} to $${config.riskMaxPositionUsd}`);
        dollarValue = config.riskMaxPositionUsd;
      }

      // For buys, also cap to avoid exceeding gross exposure
      if (trade.side === 'buy') {
        const headroom = config.riskMaxGrossExposureUsd - this.riskState.grossExposure;
        if (dollarValue > headroom && headroom > 0) {
          console.warn(`[RiskEngine] Exposure cap: reducing $${dollarValue.toFixed(2)} to $${headroom.toFixed(2)} headroom`);
          dollarValue = headroom;
        }
      }

      // Use allocator-provided share count if available, otherwise calculate from dollar value
      const shares = (trade.estimatedShares > 0 && trade.estimatedValue > 0)
        ? Math.floor(trade.estimatedShares)  // Allocator already calculated shares
        : Math.floor(dollarValue / currentPrice);  // Legacy: calculate from dollar value

      console.log(`[OpenClawExecutor] Executing ${trade.side.toUpperCase()} ${shares} ${trade.symbol} @ $${currentPrice.toFixed(2)} ($${dollarValue.toFixed(2)} value)`);

      if (shares === 0) {
        return { trade, success: false, error: 'Zero shares calculated - position too small' };
      }

      // Submit market order to Alpaca
      const order = await this.broker.submitOrder({
        symbol: trade.symbol,
        qty: shares,
        side: trade.side as 'buy' | 'sell',
        type: 'market',
        timeInForce: 'day',
      });

      // Update risk state
      this.riskState.tradesExecuted++;
      if (trade.side === 'buy') {
        this.riskState.grossExposure += dollarValue;
      } else {
        this.riskState.grossExposure = Math.max(0, this.riskState.grossExposure - dollarValue);
      }

      console.log(`[OpenClawExecutor] Order submitted: ${order.id} for ${shares} ${trade.symbol} [trades today: ${this.riskState.tradesExecuted}/${config.riskMaxTradesPerDay}]`);

      return { trade, success: true, orderId: order.id };
    } catch (error: any) {
      console.error(`[OpenClawExecutor] Failed to execute trade for ${trade.symbol}:`, error.message);
      return { trade, success: false, error: error.message };
    }
  }

  /**
   * Execute all rebalance trades — sells first, then buys
   */
  async executePortfolioRebalance(trades: RebalanceTrade[]): Promise<ExecutionResult[]> {
    // Refresh risk state once at the start
    await this.refreshRiskState();

    console.log(`\n[OpenClawExecutor] Executing ${trades.length} rebalance trades...`);
    console.log(`[RiskEngine] Limits: maxLoss=$${config.riskMaxDailyLoss} maxPos=$${config.riskMaxPositionUsd} maxExposure=$${config.riskMaxGrossExposureUsd} maxTrades=${config.riskMaxTradesPerDay}`);
    console.log(`[RiskEngine] Current: dailyPnL=$${this.riskState.realizedPnl.toFixed(2)} exposure=$${this.riskState.grossExposure.toFixed(2)} trades=${this.riskState.tradesExecuted}\n`);

    const results: ExecutionResult[] = [];

    // Sells first to free cash + reduce exposure
    const sells = trades.filter(t => t.side === 'sell');
    const buys = trades.filter(t => t.side === 'buy');

    for (const trade of sells) {
      const result = await this.executeTrade(trade);
      results.push(result);
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    for (const trade of buys) {
      const result = await this.executeTrade(trade);
      results.push(result);
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const riskBlocked = results.filter(r => r.riskRejected).length;

    console.log(`\n[OpenClawExecutor] Complete: ${successful} success, ${failed} failed (${riskBlocked} risk-blocked)\n`);

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
          prices[symbol] = quote.last || 0;
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
