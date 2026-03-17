import { v4 as uuidv4 } from 'uuid';
import { IStrategy, Signal, StrategyConfig, MarketData } from '../types';
import { OrderIntent } from '../../execution/order_router';

/**
 * Bollinger Band Mean Reversion Strategy
 *
 * Buys when price touches or pierces the lower Bollinger Band (oversold).
 * Sells when price touches or pierces the upper Bollinger Band (overbought).
 *
 * This fires much more frequently than RSI because Bollinger Bands adapt
 * to volatility — in a quiet market, the bands tighten and touches happen often.
 *
 * Parameters:
 * - bbPeriod: Lookback for SMA + std dev (default: 20)
 * - bbStdDev: Number of standard deviations (default: 2.0)
 * - positionSize: USD per trade (default: 100)
 * - symbols: Array of symbols to trade
 */
export class BollingerReversionStrategy implements IStrategy {
  private readonly id = 'd4e5f6a7-b8c9-0123-4567-89abcdef0123';
  private readonly name = 'Bollinger Band Reversion';
  private readonly version = '1.0.0';

  private config: StrategyConfig;
  private lastSignals: Map<string, 'buy' | 'sell' | null> = new Map();

  constructor(params?: Partial<StrategyConfig['params']>) {
    const symbols = params?.symbols || ['SPY', 'QQQ', 'IWM', 'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA'];
    this.config = {
      strategyId: this.id,
      name: this.name,
      version: this.version,
      enabled: false,
      params: {
        bbPeriod: params?.bbPeriod ?? 20,
        bbStdDev: params?.bbStdDev ?? 2.0,
        positionSize: params?.positionSize ?? 100,
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
    console.log(`Initializing ${this.name}...`);
    console.log(`  BB Period:    ${this.config.params.bbPeriod}`);
    console.log(`  BB StdDev:    ${this.config.params.bbStdDev}`);
    console.log(`  Position:     $${this.config.params.positionSize}`);
    console.log(`  Symbols:      ${this.config.symbols.join(', ')}`);
  }

  async generateSignals(marketData: Map<string, MarketData[]>): Promise<Signal[]> {
    const signals: Signal[] = [];
    const { bbPeriod, bbStdDev } = this.config.params;

    for (const symbol of this.config.symbols) {
      const data = marketData.get(symbol);
      if (!data || data.length < bbPeriod) {
        continue;
      }

      const closes = data.map(d => d.close);
      const { upper, lower, middle } = this.calculateBB(closes, bbPeriod, bbStdDev);
      const price = closes[closes.length - 1];
      const prevPrice = closes[closes.length - 2];
      const lastSignal = this.lastSignals.get(symbol) ?? null;

      const bandWidth = ((upper - lower) / middle * 100).toFixed(2);
      console.log(`  ${symbol}: $${price.toFixed(2)}  BB[${lower.toFixed(2)} | ${middle.toFixed(2)} | ${upper.toFixed(2)}]  BW=${bandWidth}%`);

      // Buy: price at or below lower band
      if (price <= lower && lastSignal !== 'buy') {
        const distBelow = (lower - price) / lower;
        const strength = Math.min(distBelow * 10 + 0.3, 1.0);
        signals.push({
          signalId: uuidv4(),
          strategyId: this.id,
          symbol,
          side: 'buy',
          strength,
          price,
          reason: `Price $${price.toFixed(2)} at/below lower BB $${lower.toFixed(2)} (${bbPeriod}p, ${bbStdDev}σ)`,
          features: { upper, middle, lower, bandWidth: parseFloat(bandWidth), price },
          timestamp: new Date(),
        });
        this.lastSignals.set(symbol, 'buy');
        console.log(`  📈 BUY SIGNAL: ${symbol} @ $${price.toFixed(2)} (below lower BB $${lower.toFixed(2)})`);
      }
      // Sell: price at or above upper band
      else if (price >= upper && lastSignal !== 'sell') {
        const distAbove = (price - upper) / upper;
        const strength = Math.min(distAbove * 10 + 0.3, 1.0);
        signals.push({
          signalId: uuidv4(),
          strategyId: this.id,
          symbol,
          side: 'sell',
          strength,
          price,
          reason: `Price $${price.toFixed(2)} at/above upper BB $${upper.toFixed(2)} (${bbPeriod}p, ${bbStdDev}σ)`,
          features: { upper, middle, lower, bandWidth: parseFloat(bandWidth), price },
          timestamp: new Date(),
        });
        this.lastSignals.set(symbol, 'sell');
        console.log(`  📉 SELL SIGNAL: ${symbol} @ $${price.toFixed(2)} (above upper BB $${upper.toFixed(2)})`);
      }
      // Reset when price returns to middle zone
      else if (price > lower && price < upper) {
        this.lastSignals.set(symbol, null);
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
      orderType: 'market',
      timeInForce: 'day',
      signalPrice: signal.price,
    };
  }

  async cleanup(): Promise<void> {
    this.lastSignals.clear();
  }

  private calculateBB(closes: number[], period: number, stdDevMultiplier: number) {
    const recent = closes.slice(-period);
    const sma = recent.reduce((a, b) => a + b, 0) / period;
    const variance = recent.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    return {
      upper: sma + stdDev * stdDevMultiplier,
      middle: sma,
      lower: sma - stdDev * stdDevMultiplier,
    };
  }
}
