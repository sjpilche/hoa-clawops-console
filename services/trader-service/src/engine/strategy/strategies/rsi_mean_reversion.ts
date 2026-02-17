import { v4 as uuidv4 } from 'uuid';
import { IStrategy, Signal, StrategyConfig, MarketData } from '../types';
import { OrderIntent } from '../../execution/order_router';

/**
 * RSI Mean Reversion Strategy
 *
 * Buys when RSI falls below the oversold threshold (price likely to bounce up).
 * Sells when RSI rises above the overbought threshold (price likely to pull back).
 *
 * Parameters:
 * - rsiPeriod: Lookback period for RSI (default: 14)
 * - oversoldThreshold: RSI level to trigger BUY signal (default: 30)
 * - overboughtThreshold: RSI level to trigger SELL signal (default: 70)
 * - positionSize: Position size in USD (default: 500)
 * - symbols: Array of symbols to trade
 */
export class RsiMeanReversionStrategy implements IStrategy {
  private readonly id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'; // UUID for RSI Mean Reversion V1
  private readonly name = 'RSI Mean Reversion';
  private readonly version = '1.0.0';

  private config: StrategyConfig;
  private lastSignals: Map<string, 'buy' | 'sell' | null> = new Map();

  constructor(params?: Partial<StrategyConfig['params']>) {
    const symbols = params?.symbols || ['AAPL', 'MSFT', 'SPY'];
    this.config = {
      strategyId: this.id,
      name: this.name,
      version: this.version,
      enabled: false,
      params: {
        rsiPeriod: params?.rsiPeriod ?? 14,
        oversoldThreshold: params?.oversoldThreshold ?? 30,
        overboughtThreshold: params?.overboughtThreshold ?? 70,
        positionSize: params?.positionSize ?? 500,
        symbols,
      },
      symbols,
    };
  }

  getId(): string {
    return this.id;
  }

  getName(): string {
    return this.name;
  }

  getVersion(): string {
    return this.version;
  }

  getConfig(): StrategyConfig {
    return this.config;
  }

  async initialize(): Promise<void> {
    console.log(`Initializing ${this.name}...`);
    console.log(`  RSI Period:          ${this.config.params.rsiPeriod}`);
    console.log(`  Oversold Threshold:  ${this.config.params.oversoldThreshold}`);
    console.log(`  Overbought Threshold:${this.config.params.overboughtThreshold}`);
    console.log(`  Position Size:       $${this.config.params.positionSize}`);
    console.log(`  Symbols:             ${this.config.symbols.join(', ')}`);
  }

  async generateSignals(marketData: Map<string, MarketData[]>): Promise<Signal[]> {
    const signals: Signal[] = [];
    const { rsiPeriod, oversoldThreshold, overboughtThreshold } = this.config.params;
    // Need at least rsiPeriod + 1 bars to compute RSI (first RSI value requires rsiPeriod changes)
    const minBars = rsiPeriod + 1;

    for (const symbol of this.config.symbols) {
      const data = marketData.get(symbol);

      if (!data || data.length < minBars) {
        console.log(`  ⚠️  ${symbol}: Not enough data (${data?.length ?? 0} bars, need ${minBars})`);
        continue;
      }

      const rsi = this.calculateRSI(data, rsiPeriod);
      const currentPrice = data[data.length - 1].close;
      const lastSignal = this.lastSignals.get(symbol) ?? null;

      console.log(`  ${symbol}: RSI=${rsi.toFixed(2)}, Price=$${currentPrice.toFixed(2)}`);

      if (rsi < oversoldThreshold && lastSignal !== 'buy') {
        // Oversold — expect price to bounce up
        const strength = this.calculateStrength(rsi, oversoldThreshold, 'buy');
        signals.push({
          signalId: uuidv4(),
          strategyId: this.id,
          symbol,
          side: 'buy',
          strength,
          price: currentPrice,
          reason: `RSI(${rsiPeriod})=${rsi.toFixed(2)} is below oversold threshold of ${oversoldThreshold}`,
          features: {
            rsi,
            rsiPeriod,
            oversoldThreshold,
            overboughtThreshold,
            price: currentPrice,
          },
          timestamp: new Date(),
        });
        this.lastSignals.set(symbol, 'buy');
        console.log(`  📈 BUY SIGNAL: ${symbol} @ $${currentPrice.toFixed(2)} (RSI=${rsi.toFixed(2)})`);
      } else if (rsi > overboughtThreshold && lastSignal !== 'sell') {
        // Overbought — expect price to pull back
        const strength = this.calculateStrength(rsi, overboughtThreshold, 'sell');
        signals.push({
          signalId: uuidv4(),
          strategyId: this.id,
          symbol,
          side: 'sell',
          strength,
          price: currentPrice,
          reason: `RSI(${rsiPeriod})=${rsi.toFixed(2)} is above overbought threshold of ${overboughtThreshold}`,
          features: {
            rsi,
            rsiPeriod,
            oversoldThreshold,
            overboughtThreshold,
            price: currentPrice,
          },
          timestamp: new Date(),
        });
        this.lastSignals.set(symbol, 'sell');
        console.log(`  📉 SELL SIGNAL: ${symbol} @ $${currentPrice.toFixed(2)} (RSI=${rsi.toFixed(2)})`);
      } else {
        // RSI is neutral — reset last signal so we can signal again when it crosses next time
        if (rsi >= oversoldThreshold && rsi <= overboughtThreshold) {
          this.lastSignals.set(symbol, null);
        }
      }
    }

    return signals;
  }

  async signalToIntent(signal: Signal): Promise<OrderIntent> {
    const positionSize = this.config.params.positionSize;
    const qty = Math.max(1, Math.floor(positionSize / signal.price));

    return {
      intentId: uuidv4(),
      strategyId: this.id,
      signalId: signal.signalId,
      symbol: signal.symbol,
      side: signal.side,
      qty,
      orderType: 'limit',
      limitPrice: signal.price,
      timeInForce: 'day',
      signalPrice: signal.price,
    };
  }

  async cleanup(): Promise<void> {
    console.log(`Cleaning up ${this.name}...`);
    this.lastSignals.clear();
  }

  /**
   * Calculate RSI using Wilder's smoothing method.
   * Returns a value between 0 and 100.
   */
  private calculateRSI(data: MarketData[], period: number): number {
    if (data.length < period + 1) return 50; // Neutral fallback

    // Compute price changes
    const closes = data.map((d) => d.close);
    const changes: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      changes.push(closes[i] - closes[i - 1]);
    }

    // Seed: average gain and loss over the first `period` changes
    const seedChanges = changes.slice(0, period);
    let avgGain = seedChanges.filter((c) => c > 0).reduce((a, b) => a + b, 0) / period;
    let avgLoss = seedChanges.filter((c) => c < 0).reduce((a, b) => a + Math.abs(b), 0) / period;

    // Wilder's smoothing for the remaining changes
    for (let i = period; i < changes.length; i++) {
      const gain = changes[i] > 0 ? changes[i] : 0;
      const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    if (avgLoss === 0) return 100; // All gains — fully overbought
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  /**
   * Calculate signal strength (0–1) based on how extreme the RSI reading is.
   * - Buy: RSI=30 → 0.0, RSI=0 → 1.0
   * - Sell: RSI=70 → 0.0, RSI=100 → 1.0
   */
  private calculateStrength(rsi: number, threshold: number, side: 'buy' | 'sell'): number {
    if (side === 'buy') {
      // threshold=30: strength = (30 - rsi) / 30
      return Math.min(Math.max((threshold - rsi) / threshold, 0), 1);
    } else {
      // threshold=70: strength = (rsi - 70) / 30
      return Math.min(Math.max((rsi - threshold) / (100 - threshold), 0), 1);
    }
  }
}
