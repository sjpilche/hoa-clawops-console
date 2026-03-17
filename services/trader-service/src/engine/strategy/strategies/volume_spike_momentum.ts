import { v4 as uuidv4 } from 'uuid';
import { IStrategy, Signal, StrategyConfig, MarketData } from '../types';
import { OrderIntent } from '../../execution/order_router';

/**
 * Volume Spike Momentum Strategy
 *
 * Detects unusual volume (2x+ average) combined with price direction.
 * High volume + price up = momentum buy. High volume + price down = momentum sell.
 *
 * This catches breakouts, earnings reactions, and institutional moves.
 * Fires frequently because volume spikes happen daily across a broad watchlist.
 *
 * Parameters:
 * - volumeMultiplier: How much above avg volume to trigger (default: 2.0)
 * - minPriceChange: Minimum % price move to confirm direction (default: 1.0)
 * - lookbackDays: Days to average volume over (default: 20)
 * - positionSize: USD per trade (default: 100)
 * - symbols: Array of symbols to trade
 */
export class VolumeSpikeStrategy implements IStrategy {
  private readonly id = 'e5f6a7b8-c9d0-1234-5678-9abcdef01234';
  private readonly name = 'Volume Spike Momentum';
  private readonly version = '1.0.0';

  private config: StrategyConfig;
  private recentSignals: Map<string, number> = new Map(); // symbol -> timestamp to avoid duplicate signals same day

  constructor(params?: Partial<StrategyConfig['params']>) {
    const symbols = params?.symbols || ['SPY', 'QQQ', 'IWM', 'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA'];
    this.config = {
      strategyId: this.id,
      name: this.name,
      version: this.version,
      enabled: false,
      params: {
        volumeMultiplier: params?.volumeMultiplier ?? 2.0,
        minPriceChange: params?.minPriceChange ?? 1.0,
        lookbackDays: params?.lookbackDays ?? 20,
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
    console.log(`  Volume Mult:  ${this.config.params.volumeMultiplier}x`);
    console.log(`  Min Price Δ:  ${this.config.params.minPriceChange}%`);
    console.log(`  Lookback:     ${this.config.params.lookbackDays}d`);
    console.log(`  Position:     $${this.config.params.positionSize}`);
    console.log(`  Symbols:      ${this.config.symbols.join(', ')}`);
  }

  async generateSignals(marketData: Map<string, MarketData[]>): Promise<Signal[]> {
    const signals: Signal[] = [];
    const { volumeMultiplier, minPriceChange, lookbackDays } = this.config.params;
    const now = Date.now();
    const ONE_DAY = 86400000;

    for (const symbol of this.config.symbols) {
      const data = marketData.get(symbol);
      if (!data || data.length < lookbackDays + 1) continue;

      // Skip if we already signaled this symbol today
      const lastSignalTime = this.recentSignals.get(symbol) ?? 0;
      if (now - lastSignalTime < ONE_DAY) continue;

      const current = data[data.length - 1];
      const prev = data[data.length - 2];

      // Average volume over lookback (excluding today)
      const volumeSlice = data.slice(-(lookbackDays + 1), -1);
      const avgVolume = volumeSlice.reduce((sum, d) => sum + d.volume, 0) / volumeSlice.length;

      if (avgVolume === 0) continue;

      const volumeRatio = current.volume / avgVolume;
      const priceChange = ((current.close - prev.close) / prev.close) * 100;

      console.log(`  ${symbol}: Vol=${this.formatNumber(current.volume)} (${volumeRatio.toFixed(1)}x avg), Δ=${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%`);

      // Volume spike + significant price move
      if (volumeRatio >= volumeMultiplier && Math.abs(priceChange) >= minPriceChange) {
        const side: 'buy' | 'sell' = priceChange > 0 ? 'buy' : 'sell';
        const strength = Math.min((volumeRatio - volumeMultiplier) / 3 + 0.4, 1.0);

        signals.push({
          signalId: uuidv4(),
          strategyId: this.id,
          symbol,
          side,
          strength,
          price: current.close,
          reason: `Volume spike ${volumeRatio.toFixed(1)}x avg with ${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}% move`,
          features: {
            volumeRatio,
            avgVolume,
            currentVolume: current.volume,
            priceChange,
            price: current.close,
          },
          timestamp: new Date(),
        });

        this.recentSignals.set(symbol, now);
        const emoji = side === 'buy' ? '📈' : '📉';
        console.log(`  ${emoji} ${side.toUpperCase()} SIGNAL: ${symbol} @ $${current.close.toFixed(2)} (${volumeRatio.toFixed(1)}x vol, ${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(1)}%)`);
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
      orderType: 'market', // Market orders for momentum — speed matters
      timeInForce: 'day',
      signalPrice: signal.price,
    };
  }

  async cleanup(): Promise<void> {
    this.recentSignals.clear();
  }

  private formatNumber(n: number): string {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(n);
  }
}
