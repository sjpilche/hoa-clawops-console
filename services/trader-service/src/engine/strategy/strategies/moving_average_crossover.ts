import { v4 as uuidv4 } from 'uuid';
import { IStrategy, Signal, StrategyConfig, MarketData } from '../types';
import { OrderIntent } from '../../execution/order_router';

/**
 * Moving Average Crossover Strategy
 *
 * Generates buy signal when fast MA crosses above slow MA
 * Generates sell signal when fast MA crosses below slow MA
 *
 * Parameters:
 * - fastPeriod: Period for fast moving average (default: 10)
 * - slowPeriod: Period for slow moving average (default: 30)
 * - symbols: Array of symbols to trade
 * - positionSize: Position size in USD (default: 1000)
 */
export class MovingAverageCrossoverStrategy implements IStrategy {
  private readonly id = 'c3f8b8e0-4d1c-4c9f-8f3a-1e5b7a9c6d2e'; // UUID for MA Crossover V1
  private readonly name = 'Moving Average Crossover';
  private readonly version = '1.0.0';

  private config: StrategyConfig;
  private lastSignals: Map<string, 'buy' | 'sell' | null> = new Map();

  constructor(params?: Partial<StrategyConfig['params']>) {
    this.config = {
      strategyId: this.id,
      name: this.name,
      version: this.version,
      enabled: false,
      params: {
        fastPeriod: params?.fastPeriod || 10,
        slowPeriod: params?.slowPeriod || 30,
        positionSize: params?.positionSize || 1000,
        symbols: params?.symbols || ['AAPL', 'MSFT', 'GOOGL'],
      },
      symbols: params?.symbols || ['AAPL', 'MSFT', 'GOOGL'],
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
    console.log(`  Fast Period: ${this.config.params.fastPeriod}`);
    console.log(`  Slow Period: ${this.config.params.slowPeriod}`);
    console.log(`  Symbols: ${this.config.symbols.join(', ')}`);
  }

  async generateSignals(marketData: Map<string, MarketData[]>): Promise<Signal[]> {
    const signals: Signal[] = [];

    for (const symbol of this.config.symbols) {
      const data = marketData.get(symbol);

      if (!data || data.length < this.config.params.slowPeriod) {
        // Not enough data to calculate
        continue;
      }

      // Calculate current moving averages (using all available data up to now)
      const fastMA = this.calculateSMA(data, this.config.params.fastPeriod);
      const slowMA = this.calculateSMA(data, this.config.params.slowPeriod);

      // Get previous values (one bar ago) - exclude the current bar
      const prevData = data.slice(0, -1);
      const prevFastMA = this.calculateSMA(prevData, this.config.params.fastPeriod);
      const prevSlowMA = this.calculateSMA(prevData, this.config.params.slowPeriod);

      // Detect crossovers
      const bullishCross = prevFastMA <= prevSlowMA && fastMA > slowMA;
      const bearishCross = prevFastMA >= prevSlowMA && fastMA < slowMA;

      const lastSignal = this.lastSignals.get(symbol);
      const currentPrice = data[data.length - 1].close;

      // Generate buy signal on bullish crossover (only if we haven't already signaled buy)
      if (bullishCross && lastSignal !== 'buy') {
        signals.push({
          signalId: uuidv4(),
          strategyId: this.id,
          symbol,
          side: 'buy',
          strength: this.calculateStrength(fastMA, slowMA),
          price: currentPrice,
          reason: `Fast MA (${fastMA.toFixed(2)}) crossed above Slow MA (${slowMA.toFixed(2)})`,
          features: {
            fastMA,
            slowMA,
            prevFastMA,
            prevSlowMA,
            price: currentPrice,
          },
          timestamp: new Date(),
        });

        this.lastSignals.set(symbol, 'buy');
        console.log(`📈 BUY SIGNAL: ${symbol} @ $${currentPrice.toFixed(2)}`);
        console.log(`   Fast MA: ${fastMA.toFixed(2)} | Slow MA: ${slowMA.toFixed(2)}`);
      }

      // Generate sell signal on bearish crossover (only if we haven't already signaled sell)
      if (bearishCross && lastSignal !== 'sell') {
        signals.push({
          signalId: uuidv4(),
          strategyId: this.id,
          symbol,
          side: 'sell',
          strength: this.calculateStrength(slowMA, fastMA),
          price: currentPrice,
          reason: `Fast MA (${fastMA.toFixed(2)}) crossed below Slow MA (${slowMA.toFixed(2)})`,
          features: {
            fastMA,
            slowMA,
            prevFastMA,
            prevSlowMA,
            price: currentPrice,
          },
          timestamp: new Date(),
        });

        this.lastSignals.set(symbol, 'sell');
        console.log(`📉 SELL SIGNAL: ${symbol} @ $${currentPrice.toFixed(2)}`);
        console.log(`   Fast MA: ${fastMA.toFixed(2)} | Slow MA: ${slowMA.toFixed(2)}`);
      }
    }

    return signals;
  }

  async signalToIntent(signal: Signal): Promise<OrderIntent> {
    const positionSize = this.config.params.positionSize;
    const qty = Math.floor(positionSize / signal.price);

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
  }

  /**
   * Calculate Simple Moving Average
   */
  private calculateSMA(data: MarketData[], period: number): number {
    if (data.length < period) {
      return 0;
    }

    const recentData = data.slice(-period);
    const sum = recentData.reduce((acc, d) => acc + d.close, 0);
    return sum / period;
  }

  /**
   * Calculate signal strength (0-1) based on MA separation
   */
  private calculateStrength(ma1: number, ma2: number): number {
    const separation = Math.abs(ma1 - ma2);
    const avgPrice = (ma1 + ma2) / 2;
    const separationPct = (separation / avgPrice) * 100;

    // Map separation percentage to 0-1 scale
    // 0.5% separation = 0.5 strength
    // 1% separation = 0.75 strength
    // 2%+ separation = 1.0 strength
    return Math.min(separationPct / 2, 1.0);
  }
}
