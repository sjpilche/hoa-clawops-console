import { v4 as uuidv4 } from 'uuid';
import { IStrategy, Signal, StrategyConfig, MarketData } from '../types';
import { OrderIntent } from '../../execution/order_router';

/**
 * Post-Earnings Drift Strategy
 *
 * After a stock gaps up 3%+ on high volume (earnings beat), buy and hold
 * for 10 trading days. Academic research shows stocks continue drifting
 * in the direction of the earnings surprise for 20–60 days.
 *
 * Entry: Price gaps up ≥3% from previous close AND volume ≥1.5× average
 *        (proxy for earnings reaction — real earnings calendar would be better)
 * Exit:  10 trading days after entry, OR price drops 5% from entry (stop loss)
 * Edge:  Post-earnings announcement drift (PEAD) is one of the most
 *        replicated anomalies in finance. Market under-reacts to earnings news.
 *
 * Also catches: positive guidance revisions, analyst upgrades, FDA approvals
 */
export class PostEarningsDriftStrategy implements IStrategy {
  private readonly id = 'd4e5f6a7-b8c9-0123-defa-345678901234';
  private readonly name = 'Post-Earnings Drift';
  private readonly version = '1.0.0';
  private config: StrategyConfig;
  private entries: Map<string, { entryDate: number; entryPrice: number }> = new Map();
  private dayCounters: Map<string, number> = new Map();

  constructor(params?: Partial<StrategyConfig['params']>) {
    const symbols: string[] = (params?.symbols as string[]) || [
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA',
      'JPM', 'UNH', 'V', 'MA', 'HD', 'CRM', 'NFLX', 'ADBE',
    ];
    this.config = {
      strategyId: this.id,
      name: this.name,
      version: this.version,
      enabled: false,
      params: {
        gapThreshold: params?.gapThreshold ?? 0.03,       // 3% gap up minimum
        volumeMultiplier: params?.volumeMultiplier ?? 1.5, // 1.5× avg volume confirms event
        volumeLookback: params?.volumeLookback ?? 20,      // 20-day average volume
        holdDays: params?.holdDays ?? 10,                  // hold for 10 trading days
        stopLossPct: params?.stopLossPct ?? 0.05,          // 5% stop loss
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
    const { gapThreshold, volumeMultiplier, holdDays, stopLossPct } = this.config.params;
    console.log(`Initializing Post-Earnings Drift...`);
    console.log(`  Symbols:     ${this.config.symbols.length} stocks`);
    console.log(`  Gap thresh:  ${(gapThreshold * 100).toFixed(0)}%+ gap on ${volumeMultiplier}x avg volume`);
    console.log(`  Hold:        ${holdDays} trading days`);
    console.log(`  Stop loss:   ${(stopLossPct * 100).toFixed(0)}%`);
  }

  async generateSignals(snapshot: Map<string, MarketData[]>): Promise<Signal[]> {
    const { gapThreshold, volumeMultiplier, volumeLookback, holdDays, stopLossPct } = this.config.params;
    const signals: Signal[] = [];

    for (const symbol of this.config.symbols) {
      const bars = snapshot.get(symbol);
      if (!bars || bars.length < volumeLookback + 2) continue;

      const today = bars[bars.length - 1];
      const yesterday = bars[bars.length - 2];
      const currentDate = today.timestamp.getTime();

      // Check for open positions — handle exits first
      const entry = this.entries.get(symbol);
      if (entry) {
        // Count trading days since entry
        const counter = (this.dayCounters.get(symbol) || 0) + 1;
        this.dayCounters.set(symbol, counter);

        const currentReturn = (today.close - entry.entryPrice) / entry.entryPrice;

        // EXIT: stop loss hit
        if (currentReturn <= -stopLossPct) {
          console.log(`[PEAD] 🛑 STOP LOSS ${symbol}: ${(currentReturn * 100).toFixed(1)}% after ${counter} days`);
          signals.push({
            signalId: uuidv4(),
            strategyId: this.id,
            symbol,
            side: 'sell',
            price: today.close,
            strength: 0.9,
            reason: `Stop loss: ${(currentReturn * 100).toFixed(1)}% drop after ${counter} trading days`,
            features: { holdDays: counter, returnPct: currentReturn },
            timestamp: new Date(),
          });
          this.entries.delete(symbol);
          this.dayCounters.delete(symbol);
          continue;
        }

        // EXIT: max hold reached
        if (counter >= holdDays) {
          console.log(`[PEAD] ✅ EXIT ${symbol}: ${(currentReturn * 100).toFixed(1)}% after ${counter} days`);
          signals.push({
            signalId: uuidv4(),
            strategyId: this.id,
            symbol,
            side: 'sell',
            price: today.close,
            strength: 0.7,
            reason: `Hold complete: ${(currentReturn * 100).toFixed(1)}% return over ${counter} trading days`,
            features: { holdDays: counter, returnPct: currentReturn },
            timestamp: new Date(),
          });
          this.entries.delete(symbol);
          this.dayCounters.delete(symbol);
          continue;
        }

        continue; // still holding, don't look for new entries on this symbol
      }

      // ENTRY: detect earnings-like gap + volume spike
      const gapPct = (today.open - yesterday.close) / yesterday.close;

      // Volume average
      const volSlice = bars.slice(-(volumeLookback + 1), -1); // exclude today
      const avgVolume = volSlice.reduce((sum, b) => sum + b.volume, 0) / volSlice.length;
      const volumeRatio = avgVolume > 0 ? today.volume / avgVolume : 0;

      if (gapPct >= gapThreshold && volumeRatio >= volumeMultiplier) {
        // Gap up on volume — likely earnings beat or major catalyst
        console.log(`[PEAD] 🚀 GAP UP ${symbol}: +${(gapPct * 100).toFixed(1)}% gap, ${volumeRatio.toFixed(1)}x volume — BUY @ $${today.close.toFixed(2)}`);

        // Strength scales with gap size and volume
        const strength = Math.min(1, 0.5 + gapPct * 5 + (volumeRatio - 1) * 0.1);

        signals.push({
          signalId: uuidv4(),
          strategyId: this.id,
          symbol,
          side: 'buy',
          price: today.close,
          strength,
          reason: `Post-earnings drift: +${(gapPct * 100).toFixed(1)}% gap on ${volumeRatio.toFixed(1)}x volume`,
          features: { gapPct, volumeRatio, avgVolume, todayVolume: today.volume },
          timestamp: new Date(),
        });

        this.entries.set(symbol, { entryDate: currentDate, entryPrice: today.close });
        this.dayCounters.set(symbol, 0);
      }
    }

    return signals;
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
    this.dayCounters.clear();
  }
}
