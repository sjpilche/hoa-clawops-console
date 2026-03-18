/**
 * Event Straddle — Buy Straddles Before Major Macro Events
 *
 * Before FOMC, CPI, Jobs Report: buy a straddle (call + put at same strike).
 * You don't care which direction. You just need the move to be BIGGER
 * than what implied volatility already priced in.
 *
 * The edge: markets consistently underestimate tail moves on event days.
 * A 1% SPY move on FOMC day can make a straddle worth 2-3x.
 *
 * EVENTS (2026 calendar):
 *   - FOMC: 8 meetings/year, statement at 2:00 PM ET
 *   - CPI: monthly, released 8:30 AM ET
 *   - Jobs (NFP): first Friday of each month, 8:30 AM ET
 *
 * ENTRY: Buy straddle the day BEFORE the event (afternoon)
 * EXIT:  Sell straddle the day OF the event (after the move)
 * RISK:  If market doesn't move, IV crush kills both legs. Max loss = premium.
 */

import { v4 as uuidv4 } from 'uuid';
import { AlpacaOptionsClient } from '../alpaca-options';

export interface EventStraddleConfig {
  maxPremium: number;         // max total $ for both legs
  targetDTE: number;          // 2-5 days (short-dated for gamma)
  maxContracts: number;       // per leg
  takeProfitPct: number;      // 0.50 = take profit at 50% gain on straddle
  stopLossPct: number;        // 0.60 = cut at 60% loss
}

const DEFAULT_CONFIG: EventStraddleConfig = {
  maxPremium: 2000,
  targetDTE: 3,
  maxContracts: 2,
  takeProfitPct: 0.50,
  stopLossPct: 0.60,
};

// 2026 FOMC dates (announcement at 2 PM ET)
const FOMC_DATES_2026 = [
  '2026-01-28', '2026-03-18', '2026-05-06', '2026-06-17',
  '2026-07-29', '2026-09-16', '2026-11-04', '2026-12-16',
];

// CPI release dates 2026 (8:30 AM ET, ~12th-15th of each month)
const CPI_DATES_2026 = [
  '2026-01-14', '2026-02-12', '2026-03-11', '2026-04-10',
  '2026-05-12', '2026-06-10', '2026-07-14', '2026-08-12',
  '2026-09-11', '2026-10-13', '2026-11-12', '2026-12-10',
];

// Jobs report dates 2026 (first Friday, 8:30 AM ET)
const NFP_DATES_2026 = [
  '2026-01-09', '2026-02-06', '2026-03-06', '2026-04-03',
  '2026-05-01', '2026-06-05', '2026-07-02', '2026-08-07',
  '2026-09-04', '2026-10-02', '2026-11-06', '2026-12-04',
];

const ALL_EVENTS = [
  ...FOMC_DATES_2026.map(d => ({ date: d, name: 'FOMC', weight: 1.0 })),
  ...CPI_DATES_2026.map(d => ({ date: d, name: 'CPI', weight: 0.8 })),
  ...NFP_DATES_2026.map(d => ({ date: d, name: 'Jobs Report', weight: 0.7 })),
].sort((a, b) => a.date.localeCompare(b.date));

interface ActiveStraddle {
  callSymbol: string;
  putSymbol: string;
  callEntryPrice: number;
  putEntryPrice: number;
  qty: number;
  totalPremium: number;
  eventName: string;
  eventDate: string;
  entryDate: Date;
}

export class EventStraddleStrategy {
  private client: AlpacaOptionsClient;
  private config: EventStraddleConfig;
  private activeStraddle: ActiveStraddle | null = null;

  constructor(cfg?: Partial<EventStraddleConfig>) {
    this.client = new AlpacaOptionsClient();
    this.config = { ...DEFAULT_CONFIG, ...cfg };
  }

  async evaluate(spyPrice: number, currentDate: Date): Promise<{ action: string; details: string } | null> {
    const today = currentDate.toISOString().slice(0, 10);

    // Manage existing straddle
    if (this.activeStraddle) {
      return this.manageStraddle(spyPrice, today);
    }

    // Check if tomorrow is an event day (we enter the day BEFORE)
    const tomorrow = new Date(currentDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    // Also check 2 days out (for Friday events, enter Thursday)
    const dayAfter = new Date(currentDate);
    dayAfter.setDate(dayAfter.getDate() + 2);
    const dayAfterStr = dayAfter.toISOString().slice(0, 10);

    const event = ALL_EVENTS.find(e => e.date === tomorrowStr || e.date === dayAfterStr);
    if (!event) return null;

    const daysUntilEvent = event.date === tomorrowStr ? 1 : 2;
    console.log(`[STRADDLE] 🎯 ${event.name} in ${daysUntilEvent} day(s) — building straddle on SPY @ $${spyPrice.toFixed(2)}`);

    // Find ATM call and put
    const callContract = await this.client.findContract('SPY', spyPrice, 'call', {
      moneyness: 0,  // ATM
      daysToExpiry: this.config.targetDTE,
      minOpenInterest: 200,
      maxSpreadPct: 0.10,
    });

    const putContract = await this.client.findContract('SPY', spyPrice, 'put', {
      moneyness: 0,  // ATM
      daysToExpiry: this.config.targetDTE,
      minOpenInterest: 200,
      maxSpreadPct: 0.10,
    });

    if (!callContract || !putContract) {
      console.log(`[STRADDLE] ⚠️ Can't find both legs`);
      return null;
    }

    const callPremium = callContract.lastPrice * callContract.multiplier;
    const putPremium = putContract.lastPrice * putContract.multiplier;
    const totalPerSet = callPremium + putPremium;

    const qty = Math.min(
      this.config.maxContracts,
      Math.floor(this.config.maxPremium / totalPerSet),
    );

    if (qty < 1) {
      console.log(`[STRADDLE] ⚠️ Too expensive: $${totalPerSet.toFixed(0)}/straddle > max $${this.config.maxPremium}`);
      return null;
    }

    const totalPremium = totalPerSet * qty;

    try {
      // Buy call leg
      await this.client.submitOrder({
        contractSymbol: callContract.symbol,
        qty,
        side: 'buy',
        orderType: 'market',
      });

      // Buy put leg
      await this.client.submitOrder({
        contractSymbol: putContract.symbol,
        qty,
        side: 'buy',
        orderType: 'market',
      });

      this.activeStraddle = {
        callSymbol: callContract.symbol,
        putSymbol: putContract.symbol,
        callEntryPrice: callContract.lastPrice,
        putEntryPrice: putContract.lastPrice,
        qty,
        totalPremium,
        eventName: event.name,
        eventDate: event.date,
        entryDate: currentDate,
      };

      const detail = `🔥 STRADDLE before ${event.name}: ${qty}x ${callContract.name} + ${qty}x ${putContract.name} = $${totalPremium.toFixed(0)} at risk`;
      console.log(`[STRADDLE] ${detail}`);
      return { action: 'buy_straddle', details: detail };
    } catch (err: any) {
      console.error(`[STRADDLE] ❌ Order failed: ${err.message}`);
      return null;
    }
  }

  private async manageStraddle(spyPrice: number, today: string): Promise<{ action: string; details: string } | null> {
    if (!this.activeStraddle) return null;

    const positions = await this.client.getOptionsPositions();
    const callPos = positions.find(p => p.contractSymbol === this.activeStraddle!.callSymbol);
    const putPos = positions.find(p => p.contractSymbol === this.activeStraddle!.putSymbol);

    if (!callPos && !putPos) {
      this.activeStraddle = null;
      return { action: 'straddle_closed', details: 'Both legs expired or closed' };
    }

    const callValue = (callPos?.currentPrice || 0) * this.activeStraddle.qty * 100;
    const putValue = (putPos?.currentPrice || 0) * this.activeStraddle.qty * 100;
    const totalValue = callValue + putValue;
    const totalReturn = (totalValue - this.activeStraddle.totalPremium) / this.activeStraddle.totalPremium;

    // EXIT: event day or day after — take whatever we have
    if (today >= this.activeStraddle.eventDate) {
      const detail = `📊 ${this.activeStraddle.eventName} day: closing straddle at ${(totalReturn * 100).toFixed(0)}% ($${(totalValue - this.activeStraddle.totalPremium).toFixed(0)} P&L)`;
      console.log(`[STRADDLE] ${detail}`);
      await this.closeStraddle();
      return { action: 'event_exit', details: detail };
    }

    // EXIT: profit target
    if (totalReturn >= this.config.takeProfitPct) {
      const detail = `💰 Straddle +${(totalReturn * 100).toFixed(0)}% before event — TAKING PROFIT`;
      console.log(`[STRADDLE] ${detail}`);
      await this.closeStraddle();
      return { action: 'take_profit', details: detail };
    }

    // EXIT: stop loss
    if (totalReturn <= -this.config.stopLossPct) {
      const detail = `🛑 Straddle ${(totalReturn * 100).toFixed(0)}% — STOP LOSS`;
      console.log(`[STRADDLE] ${detail}`);
      await this.closeStraddle();
      return { action: 'stop_loss', details: detail };
    }

    return null; // hold through event
  }

  private async closeStraddle(): Promise<void> {
    if (!this.activeStraddle) return;

    const positions = await this.client.getOptionsPositions();

    for (const symbol of [this.activeStraddle.callSymbol, this.activeStraddle.putSymbol]) {
      const pos = positions.find(p => p.contractSymbol === symbol);
      if (pos && pos.qty > 0) {
        try {
          await this.client.submitOrder({
            contractSymbol: symbol,
            qty: this.activeStraddle.qty,
            side: 'sell',
            orderType: 'market',
          });
        } catch (err: any) {
          console.error(`[STRADDLE] Close ${symbol} failed: ${err.message}`);
        }
      }
    }

    this.activeStraddle = null;
  }

  hasPosition(): boolean { return this.activeStraddle !== null; }
}
