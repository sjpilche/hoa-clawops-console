/**
 * Turn of Month — Options Version
 *
 * Buy cheap weekly SPY calls on the last trading day of the month,
 * sell on the 3rd trading day of the new month.
 *
 * The TOM effect averages +0.5% on SPY over 4 days. With options:
 *   - A slightly OTM weekly call gives 3-5x leverage on that move
 *   - $200 call premium → SPY +0.5% → call might gain 15-25%
 *   - Max loss = premium paid (defined risk)
 *
 * Contract: ~1% OTM call, 5-8 days to expiry (weekly)
 * Entry: Last trading day of month
 * Exit: 3rd trading day of new month, OR 50% profit, OR -80% stop
 */

import { v4 as uuidv4 } from 'uuid';
import { AlpacaOptionsClient } from '../alpaca-options';

export interface TomCallsConfig {
  maxPremium: number;          // max $ per contract
  targetDTE: number;           // 5-8 days (weekly)
  targetMoneyness: number;     // 0.01 = 1% OTM
  profitTargetPct: number;     // 0.50 = sell at 50% profit
  stopLossPct: number;         // 0.80 = close at 80% loss
  exitTradingDay: number;      // sell on Nth trading day of new month
}

const DEFAULT_CONFIG: TomCallsConfig = {
  maxPremium: 1500,
  targetDTE: 7,
  targetMoneyness: 0.01,
  profitTargetPct: 0.50,
  stopLossPct: 0.80,
  exitTradingDay: 3,
};

export class TomCallsStrategy {
  private client: AlpacaOptionsClient;
  private config: TomCallsConfig;
  private activePosition: {
    contract: string;
    entryPrice: number;
    entryDate: Date;
  } | null = null;
  private tradingDayInMonth: number = 0;
  private lastMonth: number = -1;

  constructor(cfg?: Partial<TomCallsConfig>) {
    this.client = new AlpacaOptionsClient();
    this.config = { ...DEFAULT_CONFIG, ...cfg };
  }

  /**
   * Called each panel run with current date and SPY price.
   */
  async evaluate(currentDate: Date, spyPrice: number): Promise<{ action: string; details: string } | null> {
    const month = currentDate.getMonth();
    const day = currentDate.getDate();
    const daysInMonth = new Date(currentDate.getFullYear(), month + 1, 0).getDate();

    // Track trading day in month
    if (month !== this.lastMonth) {
      this.tradingDayInMonth = 1;
      this.lastMonth = month;
    } else {
      this.tradingDayInMonth++;
    }

    // Manage existing position
    if (this.activePosition) {
      return this.managePosition(spyPrice);
    }

    // ENTRY: last 2 calendar days of month
    if (day >= daysInMonth - 1) {
      console.log(`[TOM-CALLS] 📅 Last day of month ${month + 1} — looking for SPY weekly calls`);

      const contract = await this.client.findContract('SPY', spyPrice, 'call', {
        moneyness: this.config.targetMoneyness,
        daysToExpiry: this.config.targetDTE,
        minOpenInterest: 100,
        maxSpreadPct: 0.08,
      });

      if (!contract) {
        console.log(`[TOM-CALLS] ⚠️ No suitable weekly call found`);
        return null;
      }

      const premium = contract.lastPrice * contract.multiplier;
      if (premium > this.config.maxPremium) {
        console.log(`[TOM-CALLS] ⚠️ Too expensive: $${premium.toFixed(0)} > max $${this.config.maxPremium}`);
        return null;
      }

      try {
        await this.client.submitOrder({
          contractSymbol: contract.symbol,
          qty: 1,
          side: 'buy',
          orderType: 'market',
        });

        this.activePosition = {
          contract: contract.symbol,
          entryPrice: contract.lastPrice,
          entryDate: currentDate,
        };

        const detail = `BUY 1x ${contract.name} @ ~$${contract.lastPrice.toFixed(2)} ($${premium.toFixed(0)} premium)`;
        console.log(`[TOM-CALLS] ✅ ${detail}`);
        return { action: 'buy_call', details: detail };
      } catch (err: any) {
        console.error(`[TOM-CALLS] ❌ Order failed: ${err.message}`);
        return null;
      }
    }

    return null;
  }

  private async managePosition(spyPrice: number): Promise<{ action: string; details: string } | null> {
    if (!this.activePosition) return null;

    const positions = await this.client.getOptionsPositions();
    const pos = positions.find(p => p.contractSymbol === this.activePosition!.contract);

    if (!pos) {
      this.activePosition = null;
      return { action: 'position_closed', details: 'TOM call position closed externally' };
    }

    const currentReturn = pos.currentPrice > 0
      ? (pos.currentPrice - this.activePosition.entryPrice) / this.activePosition.entryPrice
      : -1;

    // EXIT: profit target
    if (currentReturn >= this.config.profitTargetPct) {
      const detail = `SELL ${this.activePosition.contract}: +${(currentReturn * 100).toFixed(0)}% profit`;
      console.log(`[TOM-CALLS] 💰 ${detail}`);
      await this.closePosition();
      return { action: 'take_profit', details: detail };
    }

    // EXIT: stop loss
    if (currentReturn <= -this.config.stopLossPct) {
      const detail = `SELL ${this.activePosition.contract}: ${(currentReturn * 100).toFixed(0)}% loss (stop hit)`;
      console.log(`[TOM-CALLS] 🛑 ${detail}`);
      await this.closePosition();
      return { action: 'stop_loss', details: detail };
    }

    // EXIT: 3rd trading day of new month (the TOM exit)
    const entryMonth = this.activePosition.entryDate.getMonth();
    const currentMonth = new Date().getMonth();
    if (currentMonth !== entryMonth && this.tradingDayInMonth >= this.config.exitTradingDay) {
      const detail = `SELL ${this.activePosition.contract}: TOM exit (day ${this.tradingDayInMonth}), P&L: ${(currentReturn * 100).toFixed(0)}%`;
      console.log(`[TOM-CALLS] 📅 ${detail}`);
      await this.closePosition();
      return { action: 'tom_exit', details: detail };
    }

    // EXIT: approaching expiry
    if (pos.daysToExpiry <= 1) {
      const detail = `SELL ${this.activePosition.contract}: 1d to expiry, P&L: ${(currentReturn * 100).toFixed(0)}%`;
      console.log(`[TOM-CALLS] ⏰ ${detail}`);
      await this.closePosition();
      return { action: 'expiry_exit', details: detail };
    }

    return null; // hold
  }

  private async closePosition(): Promise<void> {
    if (!this.activePosition) return;
    try {
      await this.client.submitOrder({
        contractSymbol: this.activePosition.contract,
        qty: 1,
        side: 'sell',
        orderType: 'market',
      });
    } catch (err: any) {
      console.error(`[TOM-CALLS] Close failed: ${err.message}`);
    }
    this.activePosition = null;
  }

  hasPosition(): boolean {
    return this.activePosition !== null;
  }
}
