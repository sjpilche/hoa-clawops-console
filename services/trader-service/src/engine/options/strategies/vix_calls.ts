/**
 * VIX Fear Spike — Options Version
 *
 * When VIXY spikes 10%+ above its 10-day avg, buy SPY CALLS instead of shares.
 * 5-10x leverage on the recovery. Defined risk = premium paid.
 *
 * Contract selection: ~2% OTM call, 10-14 days to expiry
 * Exit: Sell to close when VIX normalizes, OR at 50% profit, OR at expiry -2 days
 * Max risk: premium paid (no more than $500/trade)
 */

import { v4 as uuidv4 } from 'uuid';
import { AlpacaOptionsClient } from '../alpaca-options';
import { OptionContract } from '../types';

export interface VixCallsConfig {
  spikeThreshold: number;    // 1.10 = VIXY 10% above avg
  vixSmaPeriod: number;      // 10
  maxPremium: number;        // max $ per contract to pay
  targetDTE: number;         // target days to expiry
  targetMoneyness: number;   // 0.02 = 2% OTM
  profitTargetPct: number;   // 0.50 = sell at 50% profit
  daysBeforeExpiryExit: number; // close 2 days before expiry
}

const DEFAULT_CONFIG: VixCallsConfig = {
  spikeThreshold: 1.10,
  vixSmaPeriod: 10,
  maxPremium: 500,
  targetDTE: 12,
  targetMoneyness: 0.02,
  profitTargetPct: 0.50,
  daysBeforeExpiryExit: 2,
};

export class VixCallsStrategy {
  private client: AlpacaOptionsClient;
  private config: VixCallsConfig;
  private activePosition: { contract: string; entryPrice: number; entryDate: Date } | null = null;

  constructor(cfg?: Partial<VixCallsConfig>) {
    this.client = new AlpacaOptionsClient();
    this.config = { ...DEFAULT_CONFIG, ...cfg };
  }

  /**
   * Called on each panel run. Checks VIXY spike and manages position.
   * Returns true if an order was placed.
   */
  async evaluate(vixyPrice: number, vixySma: number, spyPrice: number): Promise<{ action: string; details: string } | null> {
    const spikeRatio = vixyPrice / vixySma;

    // Check existing position first
    if (this.activePosition) {
      return this.managePosition(vixyPrice, vixySma);
    }

    // No position — check for spike entry
    if (spikeRatio < this.config.spikeThreshold) return null;

    console.log(`[VIX-CALLS] 🔥 VIXY spike: ${vixyPrice.toFixed(2)} / ${vixySma.toFixed(2)} = ${spikeRatio.toFixed(2)}x — looking for SPY calls`);

    // Find optimal contract
    const contract = await this.client.findContract('SPY', spyPrice, 'call', {
      moneyness: this.config.targetMoneyness,
      daysToExpiry: this.config.targetDTE,
      minOpenInterest: 50,
      maxSpreadPct: 0.10,
    });

    if (!contract) {
      console.log(`[VIX-CALLS] ⚠️ No suitable contract found`);
      return null;
    }

    // Check premium fits budget
    const premium = contract.lastPrice * contract.multiplier;
    if (premium > this.config.maxPremium) {
      console.log(`[VIX-CALLS] ⚠️ Contract too expensive: $${premium.toFixed(0)} > max $${this.config.maxPremium}`);
      return null;
    }

    // Buy the call
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
        entryDate: new Date(),
      };

      const detail = `BUY 1x ${contract.name} @ ~$${contract.lastPrice.toFixed(2)} (premium: $${premium.toFixed(0)})`;
      console.log(`[VIX-CALLS] ✅ ${detail}`);
      return { action: 'buy_call', details: detail };
    } catch (err: any) {
      console.error(`[VIX-CALLS] ❌ Order failed: ${err.message}`);
      return null;
    }
  }

  private async managePosition(vixyPrice: number, vixySma: number): Promise<{ action: string; details: string } | null> {
    if (!this.activePosition) return null;

    const positions = await this.client.getOptionsPositions();
    const pos = positions.find(p => p.contractSymbol === this.activePosition!.contract);

    if (!pos) {
      // Position gone (expired, assigned, etc.)
      this.activePosition = null;
      return { action: 'position_closed', details: 'Position no longer exists' };
    }

    const currentReturn = pos.currentPrice > 0
      ? (pos.currentPrice - this.activePosition.entryPrice) / this.activePosition.entryPrice
      : 0;

    // EXIT: profit target hit
    if (currentReturn >= this.config.profitTargetPct) {
      const detail = `SELL ${this.activePosition.contract}: +${(currentReturn * 100).toFixed(0)}% profit (target: ${(this.config.profitTargetPct * 100).toFixed(0)}%)`;
      console.log(`[VIX-CALLS] 💰 ${detail}`);
      await this.closePosition();
      return { action: 'take_profit', details: detail };
    }

    // EXIT: VIX normalized (mean reversion complete)
    if (vixyPrice < vixySma) {
      const detail = `SELL ${this.activePosition.contract}: VIX normalized (${vixyPrice.toFixed(1)} < avg ${vixySma.toFixed(1)}), P&L: ${(currentReturn * 100).toFixed(0)}%`;
      console.log(`[VIX-CALLS] ✅ ${detail}`);
      await this.closePosition();
      return { action: 'vix_normalized', details: detail };
    }

    // EXIT: approaching expiry
    if (pos.daysToExpiry <= this.config.daysBeforeExpiryExit) {
      const detail = `SELL ${this.activePosition.contract}: ${pos.daysToExpiry}d to expiry, P&L: ${(currentReturn * 100).toFixed(0)}%`;
      console.log(`[VIX-CALLS] ⏰ ${detail}`);
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
      console.error(`[VIX-CALLS] Close failed: ${err.message}`);
    }
    this.activePosition = null;
  }

  hasPosition(): boolean {
    return this.activePosition !== null;
  }
}
