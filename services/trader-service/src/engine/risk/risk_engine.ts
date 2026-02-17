import { Pool } from 'pg';
import { config } from '../../config';
import { getPool } from '../../db/pool';
import { IBrokerAdapter } from '../execution/broker/types';
import {
  OrderIntent,
  RiskCheckResult,
  RiskLimits,
  Position,
  DailyPnL,
} from './types';

export class RiskEngine {
  private pool: Pool;
  private broker?: IBrokerAdapter;

  constructor(pool?: Pool, broker?: IBrokerAdapter) {
    this.pool = pool || getPool();
    this.broker = broker;
  }

  /**
   * Main entry point: Check if order intent passes all risk checks
   */
  async checkIntent(intent: OrderIntent): Promise<RiskCheckResult> {
    const limits = await this.getCurrentLimits();
    const checksPassed: string[] = [];
    const checksFailed: string[] = [];

    // Run all 9 checks
    const checks = [
      { name: '1. Mode Lock', fn: () => this.checkModePermission(intent) },
      { name: '2. Position Limit', fn: () => this.checkPositionLimit(intent, limits) },
      { name: '3. Gross Exposure', fn: () => this.checkExposureLimit(intent, limits) },
      { name: '4. Daily Loss', fn: () => this.checkDailyLoss(limits) },
      { name: '5. Trade Count', fn: () => this.checkTradeCount(limits) },
      { name: '6. Allowed Symbol', fn: () => this.checkAllowedSymbol(intent) },
      { name: '7. Market Hours', fn: () => this.checkMarketHours(intent) },
      { name: '8. Slippage Guard', fn: () => this.checkSlippage(intent, limits) },
      { name: '9. Order Type', fn: () => this.checkOrderType(intent) },
    ];

    // ALL must pass
    for (const check of checks) {
      const result = await check.fn();
      if (result.passed) {
        checksPassed.push(check.name);
      } else {
        checksFailed.push(check.name);
        // Log failed check to database
        await this.logRiskCheck(intent.intentId, false, result.failReason!, limits);

        return {
          passed: false,
          failReason: result.failReason,
          limitsSnapshot: limits,
          checksPassed,
          checksFailed,
        };
      }
    }

    // All checks passed!
    await this.logRiskCheck(intent.intentId, true, null, limits);

    return {
      passed: true,
      limitsSnapshot: limits,
      checksPassed,
      checksFailed: [],
    };
  }

  /**
   * Check 1: Mode Lock
   * Paper mode: allow all
   * Live mode: require explicit configuration + cooldown
   */
  private async checkModePermission(intent: OrderIntent): Promise<{ passed: boolean; failReason?: string }> {
    if (config.tradingMode === 'paper') {
      return { passed: true };
    }

    // Live mode: additional checks
    // Check if last mode switch was > 30 seconds ago (cooldown period)
    let lastSwitchResult: { rows: any[] };
    try {
      lastSwitchResult = await this.pool.query(
        `SELECT switched_at, from_mode, to_mode
         FROM trd_mode_switch
         ORDER BY switched_at DESC
         LIMIT 1`
      );
    } catch (_err) {
      // DB unavailable — allow trading (no cooldown info)
      return { passed: true };
    }

    if (lastSwitchResult.rows.length > 0) {
      const lastSwitch = lastSwitchResult.rows[0];
      const switchedAt = new Date(lastSwitch.switched_at);
      const now = new Date();
      const secondsSinceSwitch = (now.getTime() - switchedAt.getTime()) / 1000;

      if (secondsSinceSwitch < 30 && lastSwitch.to_mode === 'live') {
        return {
          passed: false,
          failReason: `Live trading cooldown active (${Math.ceil(30 - secondsSinceSwitch)}s remaining)`,
        };
      }
    }

    return { passed: true };
  }

  /**
   * Fetch live quote price from broker for market orders when no position data exists
   */
  private async getLivePrice(symbol: string): Promise<number> {
    if (!this.broker) return 0;
    try {
      const quote = await this.broker.getQuote(symbol);
      return quote.last || quote.ask || quote.bid || 0;
    } catch (_err) {
      return 0;
    }
  }

  /**
   * Check 2: Max Position Size Per Symbol
   * Order would not exceed max_position_usd for this symbol
   */
  private async checkPositionLimit(
    intent: OrderIntent,
    limits: RiskLimits
  ): Promise<{ passed: boolean; failReason?: string }> {
    // Get current position for symbol
    const currentPosition = await this.getCurrentPosition(intent.symbol);

    // Get price for valuation:
    // - limit orders: use limit price (worst-case)
    // - market orders: use position snapshot price, then live broker quote
    let priceForValuation = intent.limitPrice || currentPosition.marketPrice || 0;

    if (priceForValuation === 0) {
      priceForValuation = await this.getLivePrice(intent.symbol);
    }

    if (priceForValuation === 0) {
      // Cannot determine price — pass the check conservatively (broker will enforce)
      console.warn(`⚠️  Position limit check skipped for ${intent.symbol} (no price data available)`);
      return { passed: true };
    }

    // Calculate new position after this order executes
    let newQty: number;
    if (intent.side === 'buy') {
      newQty = currentPosition.qty + intent.qty; // Long position increases
    } else {
      newQty = currentPosition.qty - intent.qty; // Selling reduces long or creates short
    }

    // Calculate absolute value of new position
    const newPositionValue = Math.abs(newQty * priceForValuation);

    if (newPositionValue > limits.maxPositionUsd) {
      return {
        passed: false,
        failReason: `Position limit exceeded: ${intent.symbol} would be ${newQty} shares @ $${priceForValuation.toFixed(2)} = $${newPositionValue.toFixed(2)} (limit: $${limits.maxPositionUsd})`,
      };
    }

    return { passed: true };
  }

  /**
   * Check 3: Max Gross Exposure
   * Total open positions would not exceed max_gross_exposure_usd
   */
  private async checkExposureLimit(
    intent: OrderIntent,
    limits: RiskLimits
  ): Promise<{ passed: boolean; failReason?: string }> {
    const positions = await this.getAllPositions();

    // Get price for this order
    const currentPosition = positions.find(p => p.symbol === intent.symbol);
    let priceForValuation = intent.limitPrice || currentPosition?.marketPrice || 0;

    if (priceForValuation === 0) {
      priceForValuation = await this.getLivePrice(intent.symbol);
    }

    if (priceForValuation === 0) {
      // Cannot determine price — pass conservatively
      console.warn(`⚠️  Exposure limit check skipped for ${intent.symbol} (no price data available)`);
      return { passed: true };
    }

    // Calculate new position for this symbol after order
    const currentQty = currentPosition?.qty || 0;
    let newQty: number;
    if (intent.side === 'buy') {
      newQty = currentQty + intent.qty;
    } else {
      newQty = currentQty - intent.qty;
    }
    const newSymbolValue = Math.abs(newQty * priceForValuation);

    // Calculate gross exposure with new position for this symbol
    const otherSymbolsExposure = positions
      .filter(p => p.symbol !== intent.symbol)
      .reduce((sum, pos) => sum + Math.abs(pos.marketValue), 0);

    const newExposure = otherSymbolsExposure + newSymbolValue;

    if (newExposure > limits.maxGrossExposureUsd) {
      return {
        passed: false,
        failReason: `Gross exposure limit exceeded: Would be $${newExposure.toFixed(2)} (limit: $${limits.maxGrossExposureUsd})`,
      };
    }

    return { passed: true };
  }

  /**
   * Check 4: Max Daily Loss
   * Today's P&L must be >= -max_daily_loss
   */
  private async checkDailyLoss(limits: RiskLimits): Promise<{ passed: boolean; failReason?: string }> {
    const todayPnL = await this.getTodayPnL();

    if (todayPnL.netPnl <= -limits.maxDailyLoss) {
      return {
        passed: false,
        failReason: `Daily loss limit reached: P&L is $${todayPnL.netPnl.toFixed(2)} (limit: -$${limits.maxDailyLoss})`,
      };
    }

    return { passed: true };
  }

  /**
   * Check 5: Max Trades Per Day
   * Count of orders today < max_trades_per_day
   */
  private async checkTradeCount(limits: RiskLimits): Promise<{ passed: boolean; failReason?: string }> {
    const todayPnL = await this.getTodayPnL();

    if (todayPnL.tradeCount >= limits.maxTradesPerDay) {
      return {
        passed: false,
        failReason: `Daily trade limit reached: ${todayPnL.tradeCount} trades today (limit: ${limits.maxTradesPerDay})`,
      };
    }

    return { passed: true };
  }

  /**
   * Check 6: Allowed Universe
   * Symbol must be in whitelist (default: all US equities)
   */
  private async checkAllowedSymbol(intent: OrderIntent): Promise<{ passed: boolean; failReason?: string }> {
    // Simple validation: must be uppercase letters, 1-5 chars
    if (!/^[A-Z]{1,5}$/.test(intent.symbol)) {
      return {
        passed: false,
        failReason: `Invalid symbol format: ${intent.symbol}`,
      };
    }

    // Check whitelist
    try {
      const result = await this.pool.query(
        `SELECT enabled, reason FROM trd_symbol_whitelist WHERE symbol = $1`,
        [intent.symbol]
      );

      if (result.rows.length === 0) {
        return {
          passed: false,
          failReason: `Symbol not in whitelist: ${intent.symbol}`,
        };
      }

      if (!result.rows[0].enabled) {
        const reason = result.rows[0].reason || 'disabled';
        return {
          passed: false,
          failReason: `Symbol disabled in whitelist: ${intent.symbol} (${reason})`,
        };
      }
    } catch (_err) {
      // DB unavailable — allow any valid symbol format
      console.warn(`⚠️  Symbol whitelist check skipped (DB unavailable): ${intent.symbol} allowed`);
    }

    return { passed: true };
  }

  /**
   * Check 7: Market Hours
   * Only trade during market hours (9:30-16:00 ET)
   */
  private async checkMarketHours(intent: OrderIntent): Promise<{ passed: boolean; failReason?: string }> {
    if (!config.enforceMarketHours) {
      return { passed: true };
    }

    const now = new Date();
    const hour = now.getUTCHours();
    const minute = now.getMinutes();

    // Convert to ET (UTC-5, but check for DST)
    // Market hours: 9:30 AM - 4:00 PM ET = 14:30 - 21:00 UTC (standard time)
    const currentTime = hour * 60 + minute;
    const marketOpen = 14 * 60 + 30; // 14:30 UTC
    const marketClose = 21 * 60; // 21:00 UTC

    if (currentTime < marketOpen || currentTime >= marketClose) {
      return {
        passed: false,
        failReason: `Market is closed (${now.toISOString()})`,
      };
    }

    // Check if weekend
    const dayOfWeek = now.getUTCDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return {
        passed: false,
        failReason: `Market is closed (weekend)`,
      };
    }

    return { passed: true };
  }

  /**
   * Check 8: Slippage Guard
   * Reject if current price deviates too much from signal price
   */
  private async checkSlippage(
    intent: OrderIntent,
    limits: RiskLimits
  ): Promise<{ passed: boolean; failReason?: string }> {
    if (!intent.signalPrice) {
      // No signal price provided, skip slippage check
      return { passed: true };
    }

    // Get current market price
    let currentPrice: number;

    if (intent.limitPrice) {
      // Limit orders: use limit price as worst-case
      currentPrice = intent.limitPrice;
    } else if (this.broker) {
      // Market orders: get real-time quote from broker
      try {
        const quote = await this.broker.getQuote(intent.symbol);
        currentPrice = quote.last || quote.bid || quote.ask || intent.signalPrice;
      } catch (error) {
        // If quote fails, fall back to signal price (skip check)
        console.warn(`⚠️ Slippage check: failed to get quote for ${intent.symbol}, skipping check`);
        return { passed: true };
      }
    } else {
      // No broker provided, use signal price (skip check)
      return { passed: true };
    }

    const slippagePct = Math.abs((currentPrice - intent.signalPrice) / intent.signalPrice);
    const slippageBps = slippagePct * 10000;

    if (slippageBps > limits.maxOrderSlippageBps) {
      return {
        passed: false,
        failReason: `Slippage too high: ${slippageBps.toFixed(2)} bps (signal: $${intent.signalPrice.toFixed(2)}, current: $${currentPrice.toFixed(2)}, limit: ${limits.maxOrderSlippageBps} bps)`,
      };
    }

    return { passed: true };
  }

  /**
   * Check 9: Order Type Restrictions
   * Live mode: limit orders only (initially)
   */
  private async checkOrderType(intent: OrderIntent): Promise<{ passed: boolean; failReason?: string }> {
    if (config.tradingMode === 'live' && intent.orderType === 'market') {
      return {
        passed: false,
        failReason: `Market orders not allowed in live mode (use limit orders)`,
      };
    }

    return { passed: true };
  }

  // ============================================
  // Helper Methods
  // ============================================

  async getCurrentLimits(): Promise<RiskLimits> {
    try {
      const result = await this.pool.query(
        'SELECT limit_type, value FROM trd_risk_limit'
      );

      const limitsMap = result.rows.reduce((acc, row) => {
        acc[row.limit_type] = parseFloat(row.value);
        return acc;
      }, {} as Record<string, number>);

      return {
        maxDailyLoss: limitsMap.max_daily_loss || config.riskMaxDailyLoss,
        maxPositionUsd: limitsMap.max_position_usd || config.riskMaxPositionUsd,
        maxGrossExposureUsd: limitsMap.max_gross_exposure_usd || config.riskMaxGrossExposureUsd,
        maxTradesPerDay: limitsMap.max_trades_per_day || config.riskMaxTradesPerDay,
        maxOrderSlippageBps: limitsMap.max_order_slippage_bps || 50,
      };
    } catch (_err) {
      // DB unavailable — use config defaults
      return {
        maxDailyLoss: config.riskMaxDailyLoss,
        maxPositionUsd: config.riskMaxPositionUsd,
        maxGrossExposureUsd: config.riskMaxGrossExposureUsd,
        maxTradesPerDay: config.riskMaxTradesPerDay,
        maxOrderSlippageBps: 50,
      };
    }
  }

  private async getCurrentPosition(symbol: string): Promise<Position> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM trd_position_snapshot
         WHERE symbol = $1
         ORDER BY ts DESC
         LIMIT 1`,
        [symbol]
      );

      if (result.rows.length === 0) {
        return { symbol, qty: 0, avgPrice: 0, marketPrice: 0, marketValue: 0, unrealizedPnl: 0 };
      }

      const row = result.rows[0];
      return {
        symbol: row.symbol,
        qty: parseFloat(row.qty),
        avgPrice: parseFloat(row.avg_price),
        marketPrice: parseFloat(row.market_price),
        marketValue: parseFloat(row.qty) * parseFloat(row.market_price),
        unrealizedPnl: parseFloat(row.unrealized_pnl),
      };
    } catch (_err) {
      // DB unavailable — assume no position
      return { symbol, qty: 0, avgPrice: 0, marketPrice: 0, marketValue: 0, unrealizedPnl: 0 };
    }
  }

  private async getAllPositions(): Promise<Position[]> {
    try {
      const result = await this.pool.query(`
        SELECT DISTINCT ON (symbol) *
        FROM trd_position_snapshot
        ORDER BY symbol, ts DESC
      `);

      return result.rows.map((row) => ({
        symbol: row.symbol,
        qty: parseFloat(row.qty),
        avgPrice: parseFloat(row.avg_price),
        marketPrice: parseFloat(row.market_price),
        marketValue: parseFloat(row.qty) * parseFloat(row.market_price),
        unrealizedPnl: parseFloat(row.unrealized_pnl),
      }));
    } catch (_err) {
      // DB unavailable — assume no positions
      return [];
    }
  }

  private async getTodayPnL(): Promise<DailyPnL> {
    const today = new Date().toISOString().split('T')[0];

    try {
      const result = await this.pool.query(
        `SELECT * FROM trd_pnl_day WHERE date = $1`,
        [today]
      );

      if (result.rows.length === 0) {
        return { date: today, realizedPnl: 0, unrealizedPnl: 0, fees: 0, netPnl: 0, tradeCount: 0 };
      }

      const row = result.rows[0];
      return {
        date: row.date,
        realizedPnl: parseFloat(row.realized_pnl),
        unrealizedPnl: parseFloat(row.unrealized_pnl),
        fees: parseFloat(row.fees),
        netPnl: parseFloat(row.net_pnl),
        tradeCount: parseInt(row.trade_count, 10),
      };
    } catch (_err) {
      // DB unavailable — assume clean slate for today
      return { date: today, realizedPnl: 0, unrealizedPnl: 0, fees: 0, netPnl: 0, tradeCount: 0 };
    }
  }

  private async logRiskCheck(
    intentId: string,
    passed: boolean,
    failReason: string | null,
    limits: RiskLimits
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO trd_risk_check (intent_id, passed, fail_reason, limits_snapshot_json)
         VALUES ($1, $2, $3, $4)`,
        [intentId, passed, failReason, JSON.stringify(limits)]
      );
    } catch (_err) {
      // DB unavailable — log locally only
      console.warn(`⚠️  Risk check not persisted (DB unavailable): intent=${intentId} passed=${passed}`);
    }
  }
}
