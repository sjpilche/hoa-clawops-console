import { v4 as uuidv4 } from 'uuid';
import { IStrategy, Signal, StrategyConfig, MarketData } from '../types';
import { OrderIntent } from '../../execution/order_router';

/**
 * Gap Reversal Strategy (The "ADBE Catcher")
 *
 * Catches large intraday drops and bets on mean reversion.
 * When a stock drops 5%+ from previous close on high volume, buy the dip.
 * When a stock gaps up 5%+ on high volume, short/sell the rip.
 *
 * This is the strategy that would have caught ADBE dropping 10.37% today.
 * It fires on earnings misses, analyst downgrades, sector rotations —
 * any event that causes an overreaction.
 *
 * Parameters:
 * - dropThreshold: Minimum % drop to trigger buy (default: 5.0)
 * - gapUpThreshold: Minimum % gap up to trigger sell (default: 5.0)
 * - minVolumeRatio: Minimum volume vs avg to confirm move is real (default: 1.5)
 * - positionSize: USD per trade (default: 25)
 * - symbols: Array of symbols to scan
 */
export class GapReversalStrategy implements IStrategy {
  private readonly id = 'f6a7b8c9-d0e1-2345-6789-abcdef012345';
  private readonly name = 'Gap Reversal';
  private readonly version = '1.0.0';

  private config: StrategyConfig;
  private signalsToday: Set<string> = new Set(); // Prevent duplicate signals same day
  private lastResetDate: string = '';

  constructor(params?: Partial<StrategyConfig['params']>) {
    const symbols = params?.symbols || [];
    this.config = {
      strategyId: this.id,
      name: this.name,
      version: this.version,
      enabled: false,
      params: {
        dropThreshold: params?.dropThreshold ?? 5.0,
        gapUpThreshold: params?.gapUpThreshold ?? 5.0,
        minVolumeRatio: params?.minVolumeRatio ?? 1.5,
        positionSize: params?.positionSize ?? 25,
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
    console.log(`  Drop threshold:  ${this.config.params.dropThreshold}%`);
    console.log(`  Gap up threshold:${this.config.params.gapUpThreshold}%`);
    console.log(`  Min vol ratio:   ${this.config.params.minVolumeRatio}x`);
    console.log(`  Position:        $${this.config.params.positionSize}`);
    console.log(`  Symbols:         ${this.config.symbols.length} symbols`);
  }

  async generateSignals(marketData: Map<string, MarketData[]>): Promise<Signal[]> {
    const signals: Signal[] = [];
    const { dropThreshold, gapUpThreshold, minVolumeRatio } = this.config.params;

    // Reset daily signal tracker
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.lastResetDate) {
      this.signalsToday.clear();
      this.lastResetDate = today;
    }

    for (const symbol of this.config.symbols) {
      if (this.signalsToday.has(symbol)) continue;

      const data = marketData.get(symbol);
      if (!data || data.length < 21) continue; // Need 20 days + today

      const current = data[data.length - 1];
      const prevClose = data[data.length - 2].close;
      const change = ((current.close - prevClose) / prevClose) * 100;

      // Average volume over last 20 days
      const avgVolume = data.slice(-21, -1).reduce((sum, d) => sum + d.volume, 0) / 20;
      const volumeRatio = avgVolume > 0 ? current.volume / avgVolume : 0;

      // Only log significant moves
      if (Math.abs(change) >= dropThreshold * 0.5) {
        console.log(`  ${symbol}: ${change >= 0 ? '+' : ''}${change.toFixed(2)}% (vol: ${volumeRatio.toFixed(1)}x avg)`);
      }

      // BIG DROP + volume confirmation = buy the dip
      if (change <= -dropThreshold && volumeRatio >= minVolumeRatio) {
        const strength = Math.min(Math.abs(change) / 15 + 0.3, 1.0);
        signals.push({
          signalId: uuidv4(),
          strategyId: this.id,
          symbol,
          side: 'buy',
          strength,
          price: current.close,
          reason: `Gap down ${change.toFixed(1)}% on ${volumeRatio.toFixed(1)}x volume — mean reversion play`,
          features: {
            priceChange: change,
            volumeRatio,
            prevClose,
            currentPrice: current.close,
            avgVolume,
          },
          timestamp: new Date(),
        });
        this.signalsToday.add(symbol);
        console.log(`  🔥 BUY THE DIP: ${symbol} @ $${current.close.toFixed(2)} (down ${Math.abs(change).toFixed(1)}%, ${volumeRatio.toFixed(1)}x vol)`);
      }

      // BIG GAP UP + volume = sell the rip (if we hold it)
      if (change >= gapUpThreshold && volumeRatio >= minVolumeRatio) {
        const strength = Math.min(change / 15 + 0.3, 1.0);
        signals.push({
          signalId: uuidv4(),
          strategyId: this.id,
          symbol,
          side: 'sell',
          strength,
          price: current.close,
          reason: `Gap up ${change.toFixed(1)}% on ${volumeRatio.toFixed(1)}x volume — take profit / fade the rip`,
          features: {
            priceChange: change,
            volumeRatio,
            prevClose,
            currentPrice: current.close,
            avgVolume,
          },
          timestamp: new Date(),
        });
        this.signalsToday.add(symbol);
        console.log(`  📉 SELL THE RIP: ${symbol} @ $${current.close.toFixed(2)} (up ${change.toFixed(1)}%, ${volumeRatio.toFixed(1)}x vol)`);
      }
    }

    return signals;
  }

  async signalToIntent(signal: Signal): Promise<OrderIntent> {
    const positionSize = this.config.params.positionSize;
    return {
      intentId: uuidv4(),
      strategyId: this.id,
      signalId: signal.signalId,
      symbol: signal.symbol,
      side: signal.side,
      qty: 1, // Will be overridden by notional in executor
      orderType: 'market',
      timeInForce: 'day',
      signalPrice: signal.price,
    };
  }

  async cleanup(): Promise<void> {
    this.signalsToday.clear();
  }
}
