/**
 * Kalshi Position Tracker
 * Tracks open positions, calculates P&L, enforces exit rules.
 * Persists state to JSON for crash recovery.
 */

import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { KalshiAdapter } from '../execution/broker/kalshi';
import {
  KalshiAutoTraderConfig,
  KalshiSignal,
  KalshiTrackedPosition,
  ClosedTrade,
  DailyPnlRecord,
  PerformanceStats,
} from './types';

const STATE_FILE = path.join(process.cwd(), 'data', 'kalshi-positions.json');

export class KalshiPositionTracker {
  private positions: Map<string, KalshiTrackedPosition> = new Map();
  private closedTrades: ClosedTrade[] = [];
  private dailyPnl: Map<string, DailyPnlRecord> = new Map();

  constructor() {
    this.loadState();
  }

  // ==========================================================================
  // POSITION MANAGEMENT
  // ==========================================================================

  addPosition(
    signal: KalshiSignal,
    contracts: number,
    fillPriceCents: number,
  ): KalshiTrackedPosition {
    const id = uuidv4();
    const costBasis = fillPriceCents * contracts;
    const market = signal.features?.market;

    const position: KalshiTrackedPosition = {
      id,
      ticker: signal.ticker,
      title: signal.title,
      side: signal.side,
      contracts,
      entryPriceCents: fillPriceCents,
      currentPriceCents: fillPriceCents,
      costBasisCents: costBasis,
      currentValueCents: costBasis,
      unrealizedPnlCents: 0,
      unrealizedPnlPct: 0,
      enteredAt: new Date(),
      lastUpdated: new Date(),
      signalType: signal.type,
      expirationTime: market?.expiration_time || market?.close_time || '',
      hoursUntilExpiration: 0,
    };

    // Calculate hours until expiration
    if (position.expirationTime) {
      const expMs = new Date(position.expirationTime).getTime();
      position.hoursUntilExpiration = Math.max(0, (expMs - Date.now()) / 3600000);
    }

    this.positions.set(id, position);
    this.saveState();

    console.log(`[KalshiBot] POSITION OPENED: ${signal.side.toUpperCase()} ${contracts}x ${signal.ticker}`);
    console.log(`  Entry: ${fillPriceCents}¢ × ${contracts} = $${(costBasis / 100).toFixed(2)}`);
    console.log(`  Signal: ${signal.type} (strength: ${signal.strength.toFixed(2)})`);
    console.log(`  Reason: ${signal.reason}`);

    return position;
  }

  /**
   * Update current prices for all open positions from Kalshi.
   */
  async updatePrices(adapter: KalshiAdapter): Promise<void> {
    for (const [id, pos] of this.positions) {
      try {
        const market = await adapter.getMarket(pos.ticker) as any;
        if (!market) continue;

        // For YES positions, current value = what we can sell at (yes bid)
        // For NO positions, current value = what we can sell at (no bid)
        if (pos.side === 'yes') {
          pos.currentPriceCents = Math.round(parseFloat(market.yes_bid_dollars || '0') * 100);
        } else {
          pos.currentPriceCents = Math.round(parseFloat(market.no_bid_dollars || '0') * 100);
        }

        // Recalculate P&L
        pos.currentValueCents = pos.currentPriceCents * pos.contracts;
        pos.unrealizedPnlCents = pos.currentValueCents - pos.costBasisCents;
        pos.unrealizedPnlPct = pos.costBasisCents > 0
          ? pos.unrealizedPnlCents / pos.costBasisCents
          : 0;

        // Update expiration countdown
        if (pos.expirationTime) {
          const expMs = new Date(pos.expirationTime).getTime();
          pos.hoursUntilExpiration = Math.max(0, (expMs - Date.now()) / 3600000);
        }

        // Check if market has settled
        if (market.status === 'settled' || market.status === 'finalized') {
          // Market resolved — determine payout
          const result = market.result;
          let payout = 0;
          if ((pos.side === 'yes' && result === 'yes') || (pos.side === 'no' && result === 'no')) {
            payout = 100 * pos.contracts; // $1.00 per contract in cents
          }
          pos.currentPriceCents = payout > 0 ? 100 : 0;
          pos.currentValueCents = payout;
          pos.unrealizedPnlCents = payout - pos.costBasisCents;
          pos.unrealizedPnlPct = pos.costBasisCents > 0
            ? pos.unrealizedPnlCents / pos.costBasisCents
            : 0;
        }

        pos.lastUpdated = new Date();
      } catch (err: any) {
        // Market may have been removed — skip
      }
    }

    this.saveState();
  }

  // ==========================================================================
  // EXIT LOGIC
  // ==========================================================================

  /**
   * Check all positions against exit rules. Returns positions that should be sold.
   */
  checkExits(config: KalshiAutoTraderConfig): Array<KalshiTrackedPosition & { exitReason: string }> {
    const exits: Array<KalshiTrackedPosition & { exitReason: string }> = [];

    for (const [_id, pos] of this.positions) {
      // 1. TAKE PROFIT: position gained >= takeProfitPct
      if (pos.unrealizedPnlPct >= config.takeProfitPct) {
        console.log(`[KalshiBot] EXIT — Take profit: ${pos.ticker} +${(pos.unrealizedPnlPct * 100).toFixed(1)}% (target: ${(config.takeProfitPct * 100).toFixed(0)}%)`);
        exits.push({ ...pos, exitReason: 'take_profit' });
        continue;
      }

      // 2. STOP LOSS: position lost >= stopLossPct
      // Grace period: don't fire within 10 min of entry — the bid/ask spread
      // temporarily shows a paper loss the moment you buy at ask. Give it one
      // full scan cycle to breathe before treating the spread gap as a real loss.
      const minsHeld = (Date.now() - new Date(pos.enteredAt).getTime()) / 60000;
      if (pos.unrealizedPnlPct <= -config.stopLossPct && minsHeld >= 10) {
        console.log(`[KalshiBot] EXIT — Stop loss: ${pos.ticker} ${(pos.unrealizedPnlPct * 100).toFixed(1)}% (limit: -${(config.stopLossPct * 100).toFixed(0)}%)`);
        exits.push({ ...pos, exitReason: 'stop_loss' });
        continue;
      }

      // 3. NEAR RESOLUTION + PROFITABLE: hold to resolution for $1 payout
      if (pos.hoursUntilExpiration < 2 && pos.unrealizedPnlCents > 0) {
        // Hold — don't exit. The $1 payout is better than selling now.
        continue;
      }

      // 4. NEAR RESOLUTION + LOSING: cut before max loss at settlement
      if (pos.hoursUntilExpiration < 0.5 && pos.unrealizedPnlCents < 0) {
        console.log(`[KalshiBot] EXIT — Near resolution with loss: ${pos.ticker} ${(pos.unrealizedPnlPct * 100).toFixed(1)}% (${pos.hoursUntilExpiration.toFixed(1)}h left)`);
        exits.push({ ...pos, exitReason: 'near_resolution_loss' });
        continue;
      }

      // 5. STALE POSITION: held too long with minimal movement
      const hoursHeld = (Date.now() - new Date(pos.enteredAt).getTime()) / 3600000;
      if (hoursHeld >= config.stalePosHours && Math.abs(pos.unrealizedPnlPct) < 0.05) {
        console.log(`[KalshiBot] EXIT — Stale: ${pos.ticker} held ${hoursHeld.toFixed(1)}h with only ${(pos.unrealizedPnlPct * 100).toFixed(1)}% movement`);
        exits.push({ ...pos, exitReason: 'stale_position' });
        continue;
      }

      // 6. MARKET SETTLED: resolved, payout determined
      if (pos.hoursUntilExpiration <= 0) {
        console.log(`[KalshiBot] EXIT — Market settled: ${pos.ticker} P&L: ${pos.unrealizedPnlCents}¢`);
        exits.push({ ...pos, exitReason: 'settled' });
        continue;
      }
    }

    return exits;
  }

  // ==========================================================================
  // CLOSE POSITION
  // ==========================================================================

  removePosition(id: string, exitReason: string): ClosedTrade | null {
    const pos = this.positions.get(id);
    if (!pos) return null;

    const trade: ClosedTrade = {
      ticker: pos.ticker,
      side: pos.side,
      contracts: pos.contracts,
      entryPriceCents: pos.entryPriceCents,
      exitPriceCents: pos.currentPriceCents,
      pnlCents: pos.unrealizedPnlCents,
      returnPct: pos.unrealizedPnlPct,
      signalType: pos.signalType,
      entryTime: new Date(pos.enteredAt),
      exitTime: new Date(),
      exitReason,
    };

    this.closedTrades.push(trade);

    // Update daily P&L
    const today = new Date().toISOString().split('T')[0];
    const daily = this.dailyPnl.get(today) || { date: today, realizedPnlCents: 0, tradesExecuted: 0 };
    daily.realizedPnlCents += trade.pnlCents;
    daily.tradesExecuted++;
    this.dailyPnl.set(today, daily);

    this.positions.delete(id);
    this.saveState();

    const pnlSign = trade.pnlCents >= 0 ? '+' : '';
    console.log(`[KalshiBot] POSITION CLOSED: ${pos.ticker} — ${exitReason}`);
    console.log(`  P&L: ${pnlSign}${trade.pnlCents}¢ (${pnlSign}${(trade.returnPct * 100).toFixed(1)}%)`);
    console.log(`  Entry: ${trade.entryPriceCents}¢ → Exit: ${trade.exitPriceCents}¢ × ${trade.contracts} contracts`);

    return trade;
  }

  // ==========================================================================
  // DAILY P&L
  // ==========================================================================

  getDailyPnlCents(): number {
    const today = new Date().toISOString().split('T')[0];
    return this.dailyPnl.get(today)?.realizedPnlCents || 0;
  }

  getDailyTradeCount(): number {
    const today = new Date().toISOString().split('T')[0];
    return this.dailyPnl.get(today)?.tradesExecuted || 0;
  }

  // ==========================================================================
  // ACCESSORS
  // ==========================================================================

  getPositions(): KalshiTrackedPosition[] {
    return Array.from(this.positions.values());
  }

  getPosition(id: string): KalshiTrackedPosition | undefined {
    return this.positions.get(id);
  }

  hasPositionForTicker(ticker: string): boolean {
    return Array.from(this.positions.values()).some((p) => p.ticker === ticker);
  }

  getClosedTrades(): ClosedTrade[] {
    return this.closedTrades;
  }

  getCurrentExposureCents(): number {
    let total = 0;
    for (const pos of this.positions.values()) {
      total += pos.costBasisCents;
    }
    return total;
  }

  // ==========================================================================
  // PERFORMANCE STATS
  // ==========================================================================

  getPerformance(): PerformanceStats {
    let realizedPnl = 0;
    let wins = 0;
    let totalReturn = 0;
    let best = 0;
    let worst = 0;

    for (const trade of this.closedTrades) {
      realizedPnl += trade.pnlCents;
      totalReturn += trade.returnPct;
      if (trade.pnlCents > 0) wins++;
      if (trade.pnlCents > best) best = trade.pnlCents;
      if (trade.pnlCents < worst) worst = trade.pnlCents;
    }

    let unrealizedPnl = 0;
    for (const pos of this.positions.values()) {
      unrealizedPnl += pos.unrealizedPnlCents;
    }

    const completed = this.closedTrades.length;
    return {
      totalPnlCents: realizedPnl + unrealizedPnl,
      realizedPnlCents: realizedPnl,
      unrealizedPnlCents: unrealizedPnl,
      winRate: completed > 0 ? (wins / completed) * 100 : 0,
      tradesCompleted: completed,
      openPositions: this.positions.size,
      avgReturnPct: completed > 0 ? totalReturn / completed : 0,
      bestTradeCents: best,
      worstTradeCents: worst,
    };
  }

  // ==========================================================================
  // PERSISTENCE
  // ==========================================================================

  private saveState(): void {
    try {
      const dir = path.dirname(STATE_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const state = {
        positions: Array.from(this.positions.entries()),
        closedTrades: this.closedTrades.slice(-100), // Keep last 100
        dailyPnl: Array.from(this.dailyPnl.entries()),
      };
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (err: any) {
      console.warn('[KalshiBot] Failed to save position state:', err.message);
    }
  }

  private loadState(): void {
    try {
      if (!fs.existsSync(STATE_FILE)) return;

      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const data = JSON.parse(raw);

      if (data.positions && Array.isArray(data.positions)) {
        for (const [id, pos] of data.positions) {
          pos.enteredAt = new Date(pos.enteredAt);
          pos.lastUpdated = new Date(pos.lastUpdated);
          this.positions.set(id, pos);
        }
        if (this.positions.size > 0) {
          console.log(`[KalshiBot] Restored ${this.positions.size} open positions from disk`);
        }
      }

      if (data.closedTrades && Array.isArray(data.closedTrades)) {
        this.closedTrades = data.closedTrades.map((t: any) => ({
          ...t,
          entryTime: new Date(t.entryTime),
          exitTime: new Date(t.exitTime),
        }));
      }

      if (data.dailyPnl && Array.isArray(data.dailyPnl)) {
        for (const [date, record] of data.dailyPnl) {
          this.dailyPnl.set(date, record);
        }
      }
    } catch (err: any) {
      console.warn('[KalshiBot] Failed to load position state:', err.message);
    }
  }
}
