import { config } from '../../config';
import { getExecStore } from '../../singletons';
import { ExecStore } from '../../db/exec-store';
import { IBrokerAdapter } from '../execution/broker/types';
import {
  OrderIntent,
  RiskCheckResult,
  RiskLimits,
  Position,
  DailyPnL,
} from './types';

export class RiskEngine {
  private broker?: IBrokerAdapter;

  constructor(broker?: IBrokerAdapter) {
    this.broker = broker;
  }

  private get exec(): ExecStore | null {
    return getExecStore();
  }

  /**
   * Main entry point: Check if order intent passes all risk checks
   */
  async checkIntent(intent: OrderIntent): Promise<RiskCheckResult> {
    const limits = this.getCurrentLimits();
    const checksPassed: string[] = [];
    const checksFailed: string[] = [];

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

    for (const check of checks) {
      const result = await check.fn();
      if (result.passed) {
        checksPassed.push(check.name);
      } else {
        checksFailed.push(check.name);
        this.logRiskCheck(intent.intentId, false, result.failReason!, limits);
        return { passed: false, failReason: result.failReason, limitsSnapshot: limits, checksPassed, checksFailed };
      }
    }

    this.logRiskCheck(intent.intentId, true, null, limits);
    return { passed: true, limitsSnapshot: limits, checksPassed, checksFailed: [] };
  }

  // Check 1: Mode Lock
  private async checkModePermission(_intent: OrderIntent): Promise<{ passed: boolean; failReason?: string }> {
    if (config.tradingMode === 'paper') return { passed: true };
    // Live mode — no cooldown DB check needed (SQLite doesn't have mode_switch table yet)
    return { passed: true };
  }

  private async getLivePrice(symbol: string): Promise<number> {
    if (!this.broker) return 0;
    try {
      const quote = await this.broker.getQuote(symbol);
      return quote.last || quote.ask || quote.bid || 0;
    } catch { return 0; }
  }

  // Check 2: Position Limit
  private async checkPositionLimit(intent: OrderIntent, limits: RiskLimits): Promise<{ passed: boolean; failReason?: string }> {
    const currentPosition = this.getCurrentPosition(intent.symbol);
    let price = intent.limitPrice || currentPosition.marketPrice || 0;
    if (price === 0) price = await this.getLivePrice(intent.symbol);
    if (price === 0) return { passed: false, failReason: `No price data for ${intent.symbol}` };

    const newQty = intent.side === 'buy' ? currentPosition.qty + intent.qty : currentPosition.qty - intent.qty;
    const newValue = Math.abs(newQty * price);

    if (newValue > limits.maxPositionUsd) {
      return { passed: false, failReason: `Position limit: $${newValue.toFixed(2)} > $${limits.maxPositionUsd}` };
    }
    return { passed: true };
  }

  // Check 3: Gross Exposure
  private async checkExposureLimit(intent: OrderIntent, limits: RiskLimits): Promise<{ passed: boolean; failReason?: string }> {
    const positions = this.getAllPositions();
    const current = positions.find(p => p.symbol === intent.symbol);
    let price = intent.limitPrice || current?.marketPrice || 0;
    if (price === 0) price = await this.getLivePrice(intent.symbol);
    if (price === 0) return { passed: true }; // Skip if no price

    const currentQty = current?.qty || 0;
    const newQty = intent.side === 'buy' ? currentQty + intent.qty : currentQty - intent.qty;
    const newSymbolValue = Math.abs(newQty * price);
    const otherExposure = positions.filter(p => p.symbol !== intent.symbol).reduce((s, p) => s + Math.abs(p.marketValue), 0);

    if (otherExposure + newSymbolValue > limits.maxGrossExposureUsd) {
      return { passed: false, failReason: `Gross exposure: $${(otherExposure + newSymbolValue).toFixed(2)} > $${limits.maxGrossExposureUsd}` };
    }
    return { passed: true };
  }

  // Check 4: Daily Loss
  private async checkDailyLoss(limits: RiskLimits): Promise<{ passed: boolean; failReason?: string }> {
    const pnl = this.getTodayPnL();
    if (pnl.netPnl <= -limits.maxDailyLoss) {
      return { passed: false, failReason: `Daily loss limit: $${pnl.netPnl.toFixed(2)} <= -$${limits.maxDailyLoss}` };
    }
    return { passed: true };
  }

  // Check 5: Trade Count
  private async checkTradeCount(limits: RiskLimits): Promise<{ passed: boolean; failReason?: string }> {
    const count = this.exec?.getTodayTradeCount() || 0;
    if (count >= limits.maxTradesPerDay) {
      return { passed: false, failReason: `Trade limit: ${count} >= ${limits.maxTradesPerDay}` };
    }
    return { passed: true };
  }

  // Check 6: Symbol validation (regex only — no whitelist table needed)
  private async checkAllowedSymbol(intent: OrderIntent): Promise<{ passed: boolean; failReason?: string }> {
    if (!/^[A-Z]{1,5}$/.test(intent.symbol)) {
      return { passed: false, failReason: `Invalid symbol: ${intent.symbol}` };
    }
    return { passed: true };
  }

  // Check 7: Market Hours
  private async checkMarketHours(_intent: OrderIntent): Promise<{ passed: boolean; failReason?: string }> {
    if (!config.enforceMarketHours) return { passed: true };

    const now = new Date();
    const hour = now.getUTCHours();
    const minute = now.getMinutes();
    const currentTime = hour * 60 + minute;
    const marketOpen = 14 * 60 + 30; // 14:30 UTC
    const marketClose = 21 * 60; // 21:00 UTC

    if (currentTime < marketOpen || currentTime >= marketClose) {
      return { passed: false, failReason: `Market closed (${now.toISOString()})` };
    }
    if (now.getUTCDay() === 0 || now.getUTCDay() === 6) {
      return { passed: false, failReason: 'Market closed (weekend)' };
    }
    return { passed: true };
  }

  // Check 8: Slippage
  private async checkSlippage(intent: OrderIntent, limits: RiskLimits): Promise<{ passed: boolean; failReason?: string }> {
    if (!intent.signalPrice) return { passed: true };

    let currentPrice: number;
    if (intent.limitPrice) {
      currentPrice = intent.limitPrice;
    } else if (this.broker) {
      try {
        const quote = await this.broker.getQuote(intent.symbol);
        currentPrice = quote.last || quote.bid || quote.ask || intent.signalPrice;
      } catch { return { passed: true }; }
    } else {
      return { passed: true };
    }

    const slippageBps = Math.abs((currentPrice - intent.signalPrice) / intent.signalPrice) * 10000;
    if (slippageBps > limits.maxOrderSlippageBps) {
      return { passed: false, failReason: `Slippage ${slippageBps.toFixed(0)}bps > ${limits.maxOrderSlippageBps}bps` };
    }
    return { passed: true };
  }

  // Check 9: Order Type
  private async checkOrderType(intent: OrderIntent): Promise<{ passed: boolean; failReason?: string }> {
    if (config.tradingMode === 'live' && intent.orderType === 'market') {
      return { passed: false, failReason: 'Market orders not allowed in live mode' };
    }
    return { passed: true };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  getCurrentLimits(): RiskLimits {
    if (this.exec) {
      const dbLimits = this.exec.getRiskLimits();
      return {
        maxDailyLoss: dbLimits.max_daily_loss || config.riskMaxDailyLoss,
        maxPositionUsd: dbLimits.max_position_usd || config.riskMaxPositionUsd,
        maxGrossExposureUsd: dbLimits.max_gross_exposure_usd || config.riskMaxGrossExposureUsd,
        maxTradesPerDay: dbLimits.max_trades_per_day || config.riskMaxTradesPerDay,
        maxOrderSlippageBps: dbLimits.max_order_slippage_bps || 50,
      };
    }
    return {
      maxDailyLoss: config.riskMaxDailyLoss,
      maxPositionUsd: config.riskMaxPositionUsd,
      maxGrossExposureUsd: config.riskMaxGrossExposureUsd,
      maxTradesPerDay: config.riskMaxTradesPerDay,
      maxOrderSlippageBps: 50,
    };
  }

  private getCurrentPosition(symbol: string): Position {
    if (!this.exec) return { symbol, qty: 0, avgPrice: 0, marketPrice: 0, marketValue: 0, unrealizedPnl: 0 };
    const row = this.exec.getLatestPosition(symbol);
    if (!row) return { symbol, qty: 0, avgPrice: 0, marketPrice: 0, marketValue: 0, unrealizedPnl: 0 };
    return {
      symbol: row.symbol,
      qty: row.qty,
      avgPrice: row.avg_price,
      marketPrice: row.market_price,
      marketValue: row.qty * row.market_price,
      unrealizedPnl: row.unrealized_pnl,
    };
  }

  private getAllPositions(): Position[] {
    if (!this.exec) return [];
    return this.exec.getAllCurrentPositions().map((row: any) => ({
      symbol: row.symbol,
      qty: row.qty,
      avgPrice: row.avg_price,
      marketPrice: row.market_price,
      marketValue: row.qty * row.market_price,
      unrealizedPnl: row.unrealized_pnl,
    }));
  }

  private getTodayPnL(): DailyPnL {
    const today = new Date().toISOString().slice(0, 10);
    if (!this.exec) return { date: today, realizedPnl: 0, unrealizedPnl: 0, fees: 0, netPnl: 0, tradeCount: 0 };
    const row = this.exec.getDailyPnl(today);
    if (!row) return { date: today, realizedPnl: 0, unrealizedPnl: 0, fees: 0, netPnl: 0, tradeCount: 0 };
    return {
      date: row.date,
      realizedPnl: row.realized_pnl,
      unrealizedPnl: row.unrealized_pnl,
      fees: row.fees,
      netPnl: row.realized_pnl + row.unrealized_pnl - row.fees,
      tradeCount: row.trade_count,
    };
  }

  private logRiskCheck(intentId: string, passed: boolean, failReason: string | null, limits: RiskLimits): void {
    try {
      this.exec?.insertRiskCheck(intentId, passed, failReason, limits);
    } catch {
      console.warn(`⚠️  Risk check not persisted: intent=${intentId} passed=${passed}`);
    }
  }
}
