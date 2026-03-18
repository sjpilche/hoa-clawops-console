/**
 * 0DTE SPY Scalper — Same-Day Expiring Options Momentum Trading
 *
 * THE DEGEN PLAY. Buy 0DTE SPY options when intraday momentum confirms
 * direction. A $1 contract can 10-20x in minutes on a 0.5% SPY move.
 *
 * ENTRY LOGIC:
 *   1. SPY moves 0.3%+ from open in one direction (momentum confirmed)
 *   2. Buy OTM call (if up) or OTM put (if down) expiring TODAY
 *   3. Strike: 0.3-0.5% OTM (cheap but close enough to go ITM)
 *
 * EXIT LOGIC:
 *   - Take profit at 100% gain (2x your money)
 *   - Stop loss at 50% of premium
 *   - Hard exit 30 min before close (avoid pin risk)
 *   - If momentum reverses (SPY crosses back through open), exit immediately
 *
 * RISK: Max loss = premium. Expect 40-50% of trades to go to zero.
 *       The 10-20x winners pay for all the losers.
 *
 * FREQUENCY: Can fire multiple times per day. Max 3 trades/day.
 */

import { v4 as uuidv4 } from 'uuid';
import { AlpacaOptionsClient } from '../alpaca-options';
import { OptionType } from '../types';

export interface ZeroDteConfig {
  momentumThreshold: number;    // 0.003 = 0.3% move from open
  targetMoneyness: number;      // 0.004 = 0.4% OTM
  maxPremiumPerTrade: number;   // max $ per contract
  maxContractsPerTrade: number; // max contracts per entry
  takeProfitPct: number;        // 1.0 = 100% gain (2x)
  stopLossPct: number;          // 0.50 = cut at 50% loss
  maxTradesPerDay: number;      // circuit breaker
  maxDailyLoss: number;         // stop trading if down this much
  exitMinutesBeforeClose: number; // hard exit before close
}

const DEFAULT_CONFIG: ZeroDteConfig = {
  momentumThreshold: 0.003,
  targetMoneyness: 0.004,
  maxPremiumPerTrade: 500,
  maxContractsPerTrade: 5,
  takeProfitPct: 1.0,
  stopLossPct: 0.50,
  maxTradesPerDay: 3,
  maxDailyLoss: 1000,
  exitMinutesBeforeClose: 30,
};

interface ActiveScalp {
  contractSymbol: string;
  type: OptionType;
  entryPrice: number;
  qty: number;
  entryTime: Date;
  spyAtEntry: number;
}

interface DayStats {
  date: string;
  trades: number;
  pnl: number;
}

export class ZeroDteScalper {
  private client: AlpacaOptionsClient;
  private config: ZeroDteConfig;
  private activePosition: ActiveScalp | null = null;
  private dayStats: DayStats = { date: '', trades: 0, pnl: 0 };
  private spyOpen: number = 0;

  constructor(cfg?: Partial<ZeroDteConfig>) {
    this.client = new AlpacaOptionsClient();
    this.config = { ...DEFAULT_CONFIG, ...cfg };
  }

  /**
   * Called frequently (every panel tick). Needs current SPY price + time.
   */
  async evaluate(spyPrice: number, currentTime: Date): Promise<{ action: string; details: string } | null> {
    const today = currentTime.toISOString().slice(0, 10);
    const hours = currentTime.getHours();
    const minutes = currentTime.getMinutes();
    const timeInMinutes = hours * 60 + minutes;

    // Reset day stats
    if (this.dayStats.date !== today) {
      this.dayStats = { date: today, trades: 0, pnl: 0 };
      this.spyOpen = spyPrice; // first price of the day = open proxy
    }

    // Set open price if not set
    if (this.spyOpen === 0) this.spyOpen = spyPrice;

    // Circuit breakers
    if (this.dayStats.trades >= this.config.maxTradesPerDay) return null;
    if (this.dayStats.pnl <= -this.config.maxDailyLoss) {
      console.log(`[0DTE] 🛑 Daily loss limit hit: $${this.dayStats.pnl.toFixed(0)}`);
      return null;
    }

    // Don't trade in first 15 min (too chaotic) or last 30 min
    if (timeInMinutes < 9 * 60 + 45) return null;  // before 9:45 AM ET
    if (timeInMinutes > 16 * 60 - this.config.exitMinutesBeforeClose) {
      // Hard exit time
      if (this.activePosition) return this.closePosition('hard_exit', 'Market closing');
      return null;
    }

    // Manage active position
    if (this.activePosition) {
      return this.managePosition(spyPrice, currentTime);
    }

    // ENTRY: check momentum from open
    const moveFromOpen = (spyPrice - this.spyOpen) / this.spyOpen;
    const absMoveFromOpen = Math.abs(moveFromOpen);

    if (absMoveFromOpen < this.config.momentumThreshold) return null;

    // Momentum confirmed — pick direction
    const direction: OptionType = moveFromOpen > 0 ? 'call' : 'put';
    const dirLabel = direction === 'call' ? '📈 BULL' : '📉 BEAR';

    console.log(`[0DTE] ${dirLabel} momentum: SPY ${moveFromOpen > 0 ? '+' : ''}${(moveFromOpen * 100).toFixed(2)}% from open ($${this.spyOpen.toFixed(2)} → $${spyPrice.toFixed(2)})`);

    // Find today's expiry contracts
    const contract = await this.client.findContract('SPY', spyPrice, direction, {
      moneyness: this.config.targetMoneyness,
      daysToExpiry: 0,  // TODAY
      minOpenInterest: 100,
      maxSpreadPct: 0.20, // 0DTE spreads are wider
    });

    if (!contract) {
      // Try 1DTE if 0DTE not available
      const contract1d = await this.client.findContract('SPY', spyPrice, direction, {
        moneyness: this.config.targetMoneyness,
        daysToExpiry: 1,
        minOpenInterest: 100,
        maxSpreadPct: 0.20,
      });
      if (!contract1d) {
        console.log(`[0DTE] ⚠️ No suitable 0DTE/1DTE contract found`);
        return null;
      }
      return this.enterTrade(contract1d, direction, spyPrice, currentTime);
    }

    return this.enterTrade(contract, direction, spyPrice, currentTime);
  }

  private async enterTrade(
    contract: any,
    direction: OptionType,
    spyPrice: number,
    currentTime: Date,
  ): Promise<{ action: string; details: string } | null> {
    const premiumPerContract = contract.lastPrice * (contract.multiplier || 100);
    const maxContracts = Math.min(
      this.config.maxContractsPerTrade,
      Math.floor(this.config.maxPremiumPerTrade / premiumPerContract),
    );

    if (maxContracts < 1) {
      console.log(`[0DTE] ⚠️ Contract too expensive: $${premiumPerContract.toFixed(0)}/contract > max $${this.config.maxPremiumPerTrade}`);
      return null;
    }

    try {
      await this.client.submitOrder({
        contractSymbol: contract.symbol,
        qty: maxContracts,
        side: 'buy',
        orderType: 'market',
      });

      this.activePosition = {
        contractSymbol: contract.symbol,
        type: direction,
        entryPrice: contract.lastPrice,
        qty: maxContracts,
        entryTime: currentTime,
        spyAtEntry: spyPrice,
      };

      this.dayStats.trades++;

      const totalPremium = premiumPerContract * maxContracts;
      const detail = `🔥 BUY ${maxContracts}x ${contract.name} @ $${contract.lastPrice.toFixed(2)} ($${totalPremium.toFixed(0)} at risk)`;
      console.log(`[0DTE] ${detail}`);
      return { action: `buy_${direction}_0dte`, details: detail };
    } catch (err: any) {
      console.error(`[0DTE] ❌ Order failed: ${err.message}`);
      return null;
    }
  }

  private async managePosition(spyPrice: number, currentTime: Date): Promise<{ action: string; details: string } | null> {
    if (!this.activePosition) return null;

    const positions = await this.client.getOptionsPositions();
    const pos = positions.find(p => p.contractSymbol === this.activePosition!.contractSymbol);

    if (!pos) {
      // Position gone
      this.activePosition = null;
      return { action: 'position_expired', details: '0DTE position expired or closed' };
    }

    const currentReturn = pos.currentPrice > 0
      ? (pos.currentPrice - this.activePosition.entryPrice) / this.activePosition.entryPrice
      : -1;

    const pnlDollars = (pos.currentPrice - this.activePosition.entryPrice) * this.activePosition.qty * 100;

    // TAKE PROFIT: 100% gain = 2x
    if (currentReturn >= this.config.takeProfitPct) {
      const detail = `💰 +${(currentReturn * 100).toFixed(0)}% ($${pnlDollars.toFixed(0)}) — TAKING PROFIT`;
      this.dayStats.pnl += pnlDollars;
      return this.closePosition('take_profit', detail);
    }

    // STOP LOSS: 50% of premium
    if (currentReturn <= -this.config.stopLossPct) {
      const detail = `🛑 ${(currentReturn * 100).toFixed(0)}% ($${pnlDollars.toFixed(0)}) — STOP LOSS`;
      this.dayStats.pnl += pnlDollars;
      return this.closePosition('stop_loss', detail);
    }

    // MOMENTUM REVERSAL: SPY crossed back through open price
    const spyMoveFromEntry = (spyPrice - this.activePosition.spyAtEntry) / this.activePosition.spyAtEntry;
    const wrongWay = this.activePosition.type === 'call' ? spyMoveFromEntry < -0.001 : spyMoveFromEntry > 0.001;
    if (wrongWay && currentReturn < 0) {
      const detail = `↩️ Momentum reversed, SPY ${spyMoveFromEntry > 0 ? '+' : ''}${(spyMoveFromEntry * 100).toFixed(2)}% — EXIT ($${pnlDollars.toFixed(0)})`;
      this.dayStats.pnl += pnlDollars;
      return this.closePosition('reversal_exit', detail);
    }

    return null; // hold
  }

  private async closePosition(action: string, details: string): Promise<{ action: string; details: string }> {
    if (this.activePosition) {
      try {
        await this.client.submitOrder({
          contractSymbol: this.activePosition.contractSymbol,
          qty: this.activePosition.qty,
          side: 'sell',
          orderType: 'market',
        });
      } catch (err: any) {
        console.error(`[0DTE] Close failed: ${err.message}`);
      }
      this.activePosition = null;
    }
    console.log(`[0DTE] ${details}`);
    return { action, details };
  }

  hasPosition(): boolean { return this.activePosition !== null; }
  getDayStats(): DayStats { return { ...this.dayStats }; }
}
