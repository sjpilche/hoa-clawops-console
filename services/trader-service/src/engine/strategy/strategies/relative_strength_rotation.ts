import { v4 as uuidv4 } from 'uuid';
import { IStrategy, Signal, StrategyConfig, MarketData } from '../types';
import { OrderIntent } from '../../execution/order_router';

/**
 * Relative Strength Rotation Strategy
 *
 * Ranks a basket of ETFs by 20-day momentum. Holds the top N.
 * Rotates out of anything that falls below rank N. Always deployed.
 *
 * Why it works: sector/asset-class momentum persists 1–3 months.
 * You're always in what's working right now, never in what's lagging.
 *
 * Parameters:
 * - symbols:      ETF watchlist (default: 8 broad ETFs)
 * - topN:         How many to hold at once (default: 2)
 * - momentumDays: Lookback for ranking (default: 20)
 * - minMomentum:  Don't buy if best momentum is negative (default: 0 = off)
 * - positionSize: USD per position (default: 500)
 */
export class RelativeStrengthRotationStrategy implements IStrategy {
  private readonly id = 'e7f8a9b0-c1d2-3456-efab-cd7890123456';
  private readonly name = 'Relative Strength Rotation';
  private readonly version = '1.0.0';
  private config: StrategyConfig;

  constructor(params?: Partial<StrategyConfig['params']>) {
    const symbols: string[] = (params?.symbols as string[]) || [
      'SPY', 'QQQ', 'IWM',  // broad market
      'XLK', 'XLE', 'XLF',  // tech, energy, financials
      'GLD', 'TLT',          // gold, bonds — defensive rotation
    ];
    this.config = {
      strategyId: this.id,
      name: this.name,
      version: this.version,
      enabled: false,
      params: {
        topN: params?.topN ?? 2,
        momentumDays: params?.momentumDays ?? 20,
        minMomentum: params?.minMomentum ?? 0,   // 0 = allow even negative momentum
        positionSize: params?.positionSize ?? 500,
        symbols,
      },
      symbols,
    };
  }

  getId(): string { return this.id; }
  getName(): string { return this.name; }
  getVersion(): string { return this.version; }
  getConfig(): StrategyConfig { return this.config; }

  async initialize(): Promise<void> {
    const { topN, momentumDays, symbols } = this.config.params;
    console.log(`Initializing Relative Strength Rotation...`);
    console.log(`  Basket:       ${symbols.join(', ')}`);
    console.log(`  Hold top:     ${topN}`);
    console.log(`  Momentum:     ${momentumDays}-day return`);
  }

  async generateSignals(snapshot: Map<string, MarketData[]>): Promise<Signal[]> {
    const { topN, momentumDays, minMomentum } = this.config.params;

    // Score each symbol by momentum
    const ranked: { symbol: string; momentum: number; price: number }[] = [];

    for (const symbol of this.config.symbols) {
      const bars = snapshot.get(symbol);
      if (!bars || bars.length < momentumDays + 2) continue;

      const currentPrice = bars[bars.length - 1].close;
      const pastPrice = bars[bars.length - 1 - momentumDays].close;
      const momentum = (currentPrice - pastPrice) / pastPrice; // e.g. 0.04 = +4%

      ranked.push({ symbol, momentum, price: currentPrice });
    }

    if (ranked.length === 0) return [];

    ranked.sort((a, b) => b.momentum - a.momentum);

    const top = ranked.slice(0, topN);
    const topSymbols = new Set(top.map(r => r.symbol));

    console.log(
      `[RSR] Rankings: ${ranked.map((r, i) => `${i + 1}.${r.symbol}(${(r.momentum * 100).toFixed(1)}%)`).join(' ')}`
    );
    console.log(`[RSR] Buy: ${top.map(r => r.symbol).join(', ')}`);

    const signals: Signal[] = [];

    // BUY signals for top N (only if momentum positive, if minMomentum set)
    for (const r of top) {
      if (r.momentum < minMomentum) continue;

      // Strength = how far ahead of rank N+1 (more separation = higher conviction)
      const nextRank = ranked[topN] ?? null;
      const separation = nextRank ? (r.momentum - nextRank.momentum) * 100 : 5;
      const strength = Math.min(1, Math.max(0, 0.5 + separation / 20));

      signals.push({
        signalId: uuidv4(),
        strategyId: this.id,
        symbol: r.symbol,
        side: 'buy',
        price: r.price,
        strength,
        reason: `Rank ${ranked.indexOf(r) + 1}/${ranked.length}: ${(r.momentum * 100).toFixed(1)}% ${momentumDays}d momentum`,
        features: {
          momentum: r.momentum,
          rank: ranked.indexOf(r) + 1,
          separation: nextRank ? r.momentum - nextRank.momentum : null,
        },
        timestamp: new Date(),
      });
    }

    // SELL signals for everything outside top N
    for (const r of ranked.slice(topN)) {
      signals.push({
        signalId: uuidv4(),
        strategyId: this.id,
        symbol: r.symbol,
        side: 'sell',
        price: r.price,
        strength: 0.7,
        reason: `Rank ${ranked.indexOf(r) + 1}/${ranked.length}: ${(r.momentum * 100).toFixed(1)}% — outside top ${topN}`,
        features: { momentum: r.momentum, rank: ranked.indexOf(r) + 1 },
        timestamp: new Date(),
      });
    }

    return signals;
  }

  async signalToIntent(signal: Signal): Promise<OrderIntent> {
    const { positionSize } = this.config.params;
    const shares = Math.floor(positionSize / signal.price);
    return {
      strategyId: this.id,
      symbol: signal.symbol,
      side: signal.side,
      qty: Math.max(1, shares),
      orderType: 'market',
      timeInForce: 'day',
      reason: signal.reason,
    };
  }

  async cleanup(): Promise<void> {}
}
