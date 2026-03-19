import { WeatherMarketMatch, WeatherStrategyConfig, HourlyForecast } from './types';
import { v4 as uuidv4 } from 'uuid';

export interface WeatherPosition {
  id: string;
  marketId: string;          // Polymarket conditionId
  tokenId: string;           // YES or NO token
  question: string;
  city: string;
  side: 'buy' | 'sell';
  entryPrice: number;        // Price we bought at
  currentPrice: number;      // Current market price
  quantity: number;           // Shares held
  costBasis: number;         // Total USD spent
  currentValue: number;      // Current USD value
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  noaaProbAtEntry: number;   // NOAA probability when we entered
  noaaProbNow: number;       // Latest NOAA probability
  targetDate: string;        // When market resolves
  hoursUntilResolution: number;
  enteredAt: Date;
  lastUpdated: Date;
}

interface PerformanceStats {
  totalPnl: number;
  winRate: number;
  tradesCompleted: number;
  avgReturn: number;
  openPositions: number;
}

interface ClosedTrade {
  pnl: number;
  returnPct: number;
}

export class WeatherPositionTracker {
  private positions: Map<string, WeatherPosition>;
  private closedTrades: ClosedTrade[];

  constructor() {
    this.positions = new Map();
    this.closedTrades = [];
  }

  /**
   * Track a new position after a buy is executed
   */
  addPosition(
    match: WeatherMarketMatch,
    entryPrice: number,
    quantity: number,
    tokenId: string,
  ): WeatherPosition {
    const id = uuidv4();
    const costBasis = entryPrice * quantity;
    const now = new Date();
    const targetMs = new Date(match.targetDate).getTime();
    const hoursUntil = Math.max(0, (targetMs - now.getTime()) / (1000 * 60 * 60));

    const position: WeatherPosition = {
      id,
      marketId: match.marketId,
      tokenId,
      question: match.question,
      city: match.city,
      side: 'buy',
      entryPrice,
      currentPrice: entryPrice,
      quantity,
      costBasis,
      currentValue: costBasis,
      unrealizedPnl: 0,
      unrealizedPnlPercent: 0,
      noaaProbAtEntry: match.noaaProbability,
      noaaProbNow: match.noaaProbability,
      targetDate: match.targetDate,
      hoursUntilResolution: hoursUntil,
      enteredAt: now,
      lastUpdated: now,
    };

    this.positions.set(id, position);
    console.log(`[WeatherBot] Position opened: ${match.city} — ${match.question}`);
    console.log(`  Entry: $${entryPrice.toFixed(4)} × ${quantity} shares = $${costBasis.toFixed(2)}`);
    console.log(`  NOAA prob: ${(match.noaaProbability * 100).toFixed(1)}% | Market: ${(entryPrice * 100).toFixed(1)}% | Edge: ${(match.edge * 100).toFixed(1)}%`);

    return position;
  }

  /**
   * Update current prices from Polymarket for all open positions
   */
  async updatePrices(broker: any): Promise<void> {
    for (const [id, pos] of this.positions) {
      try {
        // Fetch current market price via broker/API
        const marketData = await broker.getMarketPrice?.(pos.marketId);
        if (marketData && typeof marketData.yesPrice === 'number') {
          pos.currentPrice = marketData.yesPrice;
        } else if (marketData && typeof marketData.price === 'number') {
          pos.currentPrice = marketData.price;
        }

        // Recalculate P&L
        pos.currentValue = pos.currentPrice * pos.quantity;
        pos.unrealizedPnl = pos.currentValue - pos.costBasis;
        pos.unrealizedPnlPercent = pos.costBasis > 0
          ? (pos.unrealizedPnl / pos.costBasis) * 100
          : 0;

        // Update hours until resolution
        const targetMs = new Date(pos.targetDate).getTime();
        pos.hoursUntilResolution = Math.max(0, (targetMs - Date.now()) / (1000 * 60 * 60));
        pos.lastUpdated = new Date();
      } catch (err: any) {
        console.warn(`[WeatherBot] Failed to update price for position ${id}:`, err.message);
      }
    }
  }

  /**
   * Update NOAA probabilities for each open position based on latest forecasts
   */
  updateNoaaProbabilities(forecasts: Map<string, HourlyForecast[]>): void {
    for (const [_id, pos] of this.positions) {
      const cityForecasts = forecasts.get(pos.city);
      if (!cityForecasts || cityForecasts.length === 0) continue;

      // Find the forecast closest to the target date
      const targetMs = new Date(pos.targetDate).getTime();
      let closestForecast: HourlyForecast | null = null;
      let closestDelta = Infinity;

      for (const f of cityForecasts) {
        const delta = Math.abs(new Date(f.time).getTime() - targetMs);
        if (delta < closestDelta) {
          closestDelta = delta;
          closestForecast = f;
        }
      }

      if (closestForecast) {
        // Use precipitation probability as the NOAA signal
        // This is a simplification — real implementation would match
        // the specific metric (temp bucket, precip, wind) from the market question
        pos.noaaProbNow = closestForecast.precipitation / 100;
        pos.lastUpdated = new Date();
      }
    }
  }

  /**
   * Check exit conditions — returns positions that should be sold
   */
  checkExits(config: WeatherStrategyConfig): WeatherPosition[] {
    const exits: WeatherPosition[] = [];

    for (const [_id, pos] of this.positions) {
      // 1. Take profit: price reached exit threshold (3x+ return territory)
      if (pos.currentPrice >= config.exitThreshold) {
        console.log(`[WeatherBot] EXIT — Take profit: ${pos.city} price ${pos.currentPrice.toFixed(4)} >= ${config.exitThreshold}`);
        exits.push(pos);
        continue;
      }

      // 2. Forecast reversal: NOAA probability dropped significantly from entry
      if (pos.noaaProbNow < 0.30 && pos.noaaProbAtEntry > 0.70) {
        console.log(`[WeatherBot] EXIT — Forecast reversal: ${pos.city} NOAA dropped from ${(pos.noaaProbAtEntry * 100).toFixed(0)}% to ${(pos.noaaProbNow * 100).toFixed(0)}%`);
        exits.push(pos);
        continue;
      }

      // 3. Near resolution with strong NOAA — hold to resolution (skip exit)
      if (pos.hoursUntilResolution < 2 && pos.noaaProbNow > 0.70) {
        // Don't exit — let it resolve for maximum payout
        continue;
      }

      // 4. Stop loss: cut loss if price drops below threshold
      if (pos.currentPrice <= config.stopLossThreshold) {
        console.log(`[WeatherBot] EXIT — Stop loss: ${pos.city} price ${pos.currentPrice.toFixed(4)} <= ${config.stopLossThreshold}`);
        exits.push(pos);
        continue;
      }
    }

    return exits;
  }

  /**
   * Remove a position after sell is executed, record as closed trade
   */
  removePosition(id: string): void {
    const pos = this.positions.get(id);
    if (pos) {
      this.closedTrades.push({
        pnl: pos.unrealizedPnl,
        returnPct: pos.unrealizedPnlPercent,
      });
      this.positions.delete(id);
      console.log(`[WeatherBot] Position closed: ${pos.city} — P&L: $${pos.unrealizedPnl.toFixed(2)} (${pos.unrealizedPnlPercent.toFixed(1)}%)`);
    }
  }

  /**
   * Get all open positions
   */
  getPositions(): WeatherPosition[] {
    return Array.from(this.positions.values());
  }

  /**
   * Get performance statistics
   */
  getPerformance(): PerformanceStats {
    const openPositions = this.positions.size;
    const tradesCompleted = this.closedTrades.length;

    let totalPnl = 0;
    let wins = 0;
    let totalReturn = 0;

    // Include closed trades
    for (const trade of this.closedTrades) {
      totalPnl += trade.pnl;
      totalReturn += trade.returnPct;
      if (trade.pnl > 0) wins++;
    }

    // Include unrealized P&L from open positions
    for (const [_id, pos] of this.positions) {
      totalPnl += pos.unrealizedPnl;
    }

    const winRate = tradesCompleted > 0 ? (wins / tradesCompleted) * 100 : 0;
    const avgReturn = tradesCompleted > 0 ? totalReturn / tradesCompleted : 0;

    return {
      totalPnl,
      winRate,
      tradesCompleted,
      avgReturn,
      openPositions,
    };
  }

  /**
   * Serialize tracker state to JSON for persistence
   */
  toJSON(): string {
    return JSON.stringify({
      positions: Array.from(this.positions.entries()),
      closedTrades: this.closedTrades,
    });
  }

  /**
   * Deserialize tracker state from JSON
   */
  static fromJSON(json: string): WeatherPositionTracker {
    const tracker = new WeatherPositionTracker();
    try {
      const data = JSON.parse(json);

      if (data.positions && Array.isArray(data.positions)) {
        for (const [id, pos] of data.positions) {
          // Restore Date objects
          pos.enteredAt = new Date(pos.enteredAt);
          pos.lastUpdated = new Date(pos.lastUpdated);
          tracker.positions.set(id, pos);
        }
      }

      if (data.closedTrades && Array.isArray(data.closedTrades)) {
        tracker.closedTrades = data.closedTrades;
      }
    } catch (err: any) {
      console.warn('[WeatherBot] Failed to restore position tracker state:', err.message);
    }

    return tracker;
  }
}
