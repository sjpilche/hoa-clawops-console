import { v4 as uuidv4 } from 'uuid';
import { IStrategy, Signal, StrategyConfig, MarketData } from '../types';
import { OrderIntent } from '../../execution/order_router';

/**
 * Oversold Large Cap Snap-Back Strategy
 *
 * When a mega-cap drops 7%+ over 5 trading days WITHOUT an earnings gap,
 * buy it and hold for up to 10 days. Large caps almost always revert —
 * they have too much institutional ownership and index weight to stay
 * dislocated.
 *
 * Entry: 5-day return ≤ -7%, no single-day gap > 5% (filters out earnings)
 * Exit:  Price recovers to 5-day SMA, OR 10 days max hold, OR -5% stop
 * Edge:  Institutional rebalancing, index reconstitution flows, and
 *        mean reversion in liquid names. Works best during broad selloffs.
 */
export class OversoldLargeCapStrategy implements IStrategy {
  private readonly id = 'a1b2c3d4-0002-4567-abcd-oversold00002';
  private readonly name = 'Oversold Large Cap';
  private readonly version = '1.0.0';
  private config: StrategyConfig;
  private entries: Map<string, { entryPrice: number; dayCount: number }> = new Map();

  constructor(params?: Partial<StrategyConfig['params']>) {
    const symbols: string[] = (params?.symbols as string[]) || [
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA',
      'JPM', 'UNH', 'V', 'HD', 'MA', 'JNJ', 'PG', 'XOM',
    ];
    this.config = {
      strategyId: this.id,
      name: this.name,
      version: this.version,
      enabled: false,
      params: {
        dropThreshold: params?.dropThreshold ?? -0.07,    // -7% over lookback
        lookbackDays: params?.lookbackDays ?? 5,           // 5-day window
        gapFilter: params?.gapFilter ?? 0.05,              // ignore if any day gapped 5%+ (earnings)
        maxHoldDays: params?.maxHoldDays ?? 10,
        stopLossPct: params?.stopLossPct ?? 0.05,          // -5% stop
        recoverySmaPeriod: params?.recoverySmaPeriod ?? 5,  // exit when price > 5d SMA
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
    const { dropThreshold, lookbackDays, maxHoldDays } = this.config.params;
    console.log(`Initializing Oversold Large Cap...`);
    console.log(`  Symbols:    ${this.config.symbols.length} mega-caps`);
    console.log(`  Trigger:    ${(dropThreshold * 100).toFixed(0)}% over ${lookbackDays} days`);
    console.log(`  Max hold:   ${maxHoldDays} days`);
  }

  async generateSignals(snapshot: Map<string, MarketData[]>): Promise<Signal[]> {
    const { dropThreshold, lookbackDays, gapFilter, maxHoldDays, stopLossPct, recoverySmaPeriod } = this.config.params;
    const signals: Signal[] = [];

    for (const symbol of this.config.symbols) {
      const bars = snapshot.get(symbol);
      if (!bars || bars.length < lookbackDays + recoverySmaPeriod + 2) continue;

      const today = bars[bars.length - 1];

      // Handle open positions first
      const entry = this.entries.get(symbol);
      if (entry) {
        entry.dayCount++;
        const currentReturn = (today.close - entry.entryPrice) / entry.entryPrice;

        // Calculate 5-day SMA for recovery exit
        const smaSlice = bars.slice(-recoverySmaPeriod);
        const sma = smaSlice.reduce((s, b) => s + b.close, 0) / smaSlice.length;

        // EXIT: stop loss
        if (currentReturn <= -stopLossPct) {
          console.log(`[SNAP] 🛑 STOP ${symbol}: ${(currentReturn * 100).toFixed(1)}% after ${entry.dayCount}d`);
          signals.push(this.sellSignal(symbol, today.close, `Stop loss: ${(currentReturn * 100).toFixed(1)}%`, entry.dayCount));
          this.entries.delete(symbol);
          continue;
        }

        // EXIT: recovered above SMA
        if (today.close > sma && entry.dayCount >= 2) {
          console.log(`[SNAP] ✅ RECOVERED ${symbol}: +${(currentReturn * 100).toFixed(1)}% in ${entry.dayCount}d (above ${recoverySmaPeriod}d SMA)`);
          signals.push(this.sellSignal(symbol, today.close, `Recovered above ${recoverySmaPeriod}d SMA: +${(currentReturn * 100).toFixed(1)}%`, entry.dayCount));
          this.entries.delete(symbol);
          continue;
        }

        // EXIT: max hold
        if (entry.dayCount >= maxHoldDays) {
          console.log(`[SNAP] ⏰ MAX HOLD ${symbol}: ${(currentReturn * 100).toFixed(1)}% after ${entry.dayCount}d`);
          signals.push(this.sellSignal(symbol, today.close, `Max hold ${maxHoldDays}d: ${(currentReturn * 100).toFixed(1)}%`, entry.dayCount));
          this.entries.delete(symbol);
          continue;
        }

        continue; // still holding
      }

      // ENTRY: check for oversold condition
      const lookbackBars = bars.slice(-(lookbackDays + 1));
      if (lookbackBars.length < lookbackDays + 1) continue;

      const startPrice = lookbackBars[0].close;
      const fiveDayReturn = (today.close - startPrice) / startPrice;

      // Check for earnings-like gap (any single day with 5%+ gap)
      let hasEarningsGap = false;
      for (let i = 1; i < lookbackBars.length; i++) {
        const dayGap = Math.abs((lookbackBars[i].open - lookbackBars[i - 1].close) / lookbackBars[i - 1].close);
        if (dayGap >= gapFilter) {
          hasEarningsGap = true;
          break;
        }
      }

      if (fiveDayReturn <= dropThreshold && !hasEarningsGap) {
        console.log(`[SNAP] 📉 OVERSOLD ${symbol}: ${(fiveDayReturn * 100).toFixed(1)}% over ${lookbackDays}d — BUY @ $${today.close.toFixed(2)}`);

        const strength = Math.min(1, Math.abs(fiveDayReturn) * 5); // bigger drop = higher conviction

        signals.push({
          signalId: uuidv4(),
          strategyId: this.id,
          symbol,
          side: 'buy',
          price: today.close,
          strength,
          reason: `Oversold snap-back: ${(fiveDayReturn * 100).toFixed(1)}% over ${lookbackDays}d (no earnings gap)`,
          features: { fiveDayReturn, startPrice, hasEarningsGap },
          timestamp: new Date(),
        });

        this.entries.set(symbol, { entryPrice: today.close, dayCount: 0 });
      }
    }

    return signals;
  }

  private sellSignal(symbol: string, price: number, reason: string, holdDays: number): Signal {
    return {
      signalId: uuidv4(),
      strategyId: this.id,
      symbol,
      side: 'sell',
      price,
      strength: 0.7,
      reason,
      features: { holdDays },
      timestamp: new Date(),
    };
  }

  async signalToIntent(signal: Signal): Promise<OrderIntent> {
    const { positionSize } = this.config.params;
    const shares = Math.floor(positionSize / signal.price);
    return {
      intentId: uuidv4(),
      strategyId: this.id,
      symbol: signal.symbol,
      side: signal.side,
      qty: Math.max(1, shares),
      orderType: 'market',
      timeInForce: 'day',
    };
  }

  async cleanup(): Promise<void> {
    this.entries.clear();
  }
}
