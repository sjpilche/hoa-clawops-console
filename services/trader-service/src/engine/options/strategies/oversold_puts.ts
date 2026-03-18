/**
 * Oversold Put Seller — Sell Cash-Secured Puts on Oversold Mega-Caps
 *
 * When a mega-cap drops 7%+ in 5 days (same trigger as Oversold Large Cap),
 * instead of buying shares, SELL a put option below current price.
 *
 * Two outcomes, both good:
 *   1. Stock recovers → put expires worthless → keep 100% of premium
 *   2. Stock drops further → assigned at lower price → own shares at a discount
 *
 * Contract selection: ~3% OTM put, 14-21 days to expiry
 * Collateral: strike × 100 (cash-secured)
 * Exit: Buy to close at 50% of premium collected, OR let expire
 *
 * LEVEL 3 OPTIONS REQUIRED
 */

import { v4 as uuidv4 } from 'uuid';
import { AlpacaOptionsClient } from '../alpaca-options';
import { OptionContract } from '../types';

export interface OversoldPutsConfig {
  dropThreshold: number;      // -0.07 = 7% drop over lookback
  lookbackDays: number;       // 5
  targetDTE: number;          // 14-21 days
  targetMoneyness: number;    // 0.03 = 3% below current price
  profitTargetPct: number;    // 0.50 = buy back at 50% of premium collected
  maxCollateral: number;      // max $ in collateral per position
  symbols: string[];
}

const DEFAULT_CONFIG: OversoldPutsConfig = {
  dropThreshold: -0.07,
  lookbackDays: 5,
  targetDTE: 18,
  targetMoneyness: 0.03,
  profitTargetPct: 0.50,
  maxCollateral: 5000,
  symbols: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'JPM', 'UNH', 'V'],
};

interface ActivePut {
  contractSymbol: string;
  underlyingSymbol: string;
  premiumCollected: number;  // per contract
  strikePrice: number;
  entryDate: Date;
}

export class OversoldPutSeller {
  private client: AlpacaOptionsClient;
  private config: OversoldPutsConfig;
  private activePositions: Map<string, ActivePut> = new Map(); // underlying → position

  constructor(cfg?: Partial<OversoldPutsConfig>) {
    this.client = new AlpacaOptionsClient();
    this.config = { ...DEFAULT_CONFIG, ...cfg };
  }

  /**
   * Evaluate all watched symbols. Call with recent price data.
   * priceHistory: Map of symbol → last N close prices
   */
  async evaluate(priceHistory: Map<string, number[]>): Promise<{ action: string; details: string }[]> {
    const results: { action: string; details: string }[] = [];

    // Manage existing positions first
    for (const [symbol, pos] of this.activePositions) {
      const result = await this.managePosition(pos);
      if (result) {
        results.push(result);
        if (result.action !== 'hold') this.activePositions.delete(symbol);
      }
    }

    // Look for new entries
    for (const symbol of this.config.symbols) {
      if (this.activePositions.has(symbol)) continue; // already have a position

      const prices = priceHistory.get(symbol);
      if (!prices || prices.length < this.config.lookbackDays + 1) continue;

      const currentPrice = prices[prices.length - 1];
      const pastPrice = prices[prices.length - 1 - this.config.lookbackDays];
      const fiveDayReturn = (currentPrice - pastPrice) / pastPrice;

      // Check for earnings gap filter (any single day with 5%+ gap)
      let hasEarningsGap = false;
      for (let i = prices.length - this.config.lookbackDays; i < prices.length; i++) {
        if (i > 0) {
          const dayReturn = Math.abs((prices[i] - prices[i - 1]) / prices[i - 1]);
          if (dayReturn >= 0.05) { hasEarningsGap = true; break; }
        }
      }

      if (fiveDayReturn > this.config.dropThreshold || hasEarningsGap) continue;

      console.log(`[CSP] 📉 ${symbol} oversold: ${(fiveDayReturn * 100).toFixed(1)}% — looking for puts to sell`);

      // Find optimal put contract
      const contract = await this.client.findContract(symbol, currentPrice, 'put', {
        moneyness: this.config.targetMoneyness,
        daysToExpiry: this.config.targetDTE,
        minOpenInterest: 20,
        maxSpreadPct: 0.15,
      });

      if (!contract) {
        console.log(`[CSP] ⚠️ No suitable put for ${symbol}`);
        continue;
      }

      // Check collateral requirement
      const collateral = contract.strikePrice * contract.multiplier;
      if (collateral > this.config.maxCollateral) {
        console.log(`[CSP] ⚠️ ${symbol}: collateral $${collateral.toFixed(0)} > max $${this.config.maxCollateral}`);
        continue;
      }

      const premium = contract.lastPrice * contract.multiplier;
      const returnOnCollateral = premium / collateral;

      // Sell the put
      try {
        await this.client.submitOrder({
          contractSymbol: contract.symbol,
          qty: 1,
          side: 'sell',
          orderType: 'market',
        });

        this.activePositions.set(symbol, {
          contractSymbol: contract.symbol,
          underlyingSymbol: symbol,
          premiumCollected: contract.lastPrice,
          strikePrice: contract.strikePrice,
          entryDate: new Date(),
        });

        const detail = `SELL 1x ${contract.name} for ~$${premium.toFixed(0)} premium (${(returnOnCollateral * 100).toFixed(1)}% return on $${collateral.toFixed(0)} collateral)`;
        console.log(`[CSP] ✅ ${detail}`);
        results.push({ action: 'sell_put', details: detail });
      } catch (err: any) {
        console.error(`[CSP] ❌ ${symbol} order failed: ${err.message}`);
      }
    }

    return results;
  }

  private async managePosition(pos: ActivePut): Promise<{ action: string; details: string } | null> {
    const positions = await this.client.getOptionsPositions();
    const optPos = positions.find(p => p.contractSymbol === pos.contractSymbol);

    if (!optPos) {
      // Position gone — expired worthless (best outcome) or assigned
      return { action: 'expired_or_assigned', details: `${pos.contractSymbol}: position closed — premium kept or shares assigned` };
    }

    // Check profit target: buy back at 50% of premium
    const currentCost = optPos.currentPrice; // what it'd cost to buy back
    if (currentCost > 0 && currentCost <= pos.premiumCollected * (1 - this.config.profitTargetPct)) {
      console.log(`[CSP] 💰 Buy to close ${pos.contractSymbol}: cost $${(currentCost * 100).toFixed(0)} vs collected $${(pos.premiumCollected * 100).toFixed(0)}`);
      try {
        await this.client.submitOrder({
          contractSymbol: pos.contractSymbol,
          qty: 1,
          side: 'buy',
          orderType: 'market',
        });
        return {
          action: 'take_profit',
          details: `BTC ${pos.contractSymbol}: captured ${(this.config.profitTargetPct * 100).toFixed(0)}%+ of premium`,
        };
      } catch (err: any) {
        console.error(`[CSP] Close failed: ${err.message}`);
      }
    }

    // Close if 2 days to expiry (avoid assignment risk)
    if (optPos.daysToExpiry <= 2) {
      try {
        await this.client.submitOrder({
          contractSymbol: pos.contractSymbol,
          qty: 1,
          side: 'buy',
          orderType: 'market',
        });
        return { action: 'expiry_exit', details: `BTC ${pos.contractSymbol}: ${optPos.daysToExpiry}d to expiry` };
      } catch (err: any) {
        console.error(`[CSP] Expiry close failed: ${err.message}`);
      }
    }

    return null; // hold
  }

  getActivePositions(): ActivePut[] {
    return Array.from(this.activePositions.values());
  }
}
