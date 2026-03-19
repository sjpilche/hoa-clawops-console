import { v4 as uuidv4 } from 'uuid';
import { IStrategy, Signal, StrategyConfig, MarketData } from '../types';
import { OrderIntent } from '../../execution/order_router';

/**
 * VIX Fear Spike Strategy
 *
 * When VIX spikes 20%+ above its 10-day average, buy SPY.
 * VIX is the most mean-reverting asset in finance — panic is temporary.
 * You're buying other people's fear.
 *
 * Entry:  VIX closes > 1.2× its 10-day SMA (20%+ spike)
 * Exit:   VIX drops back below its 10-day SMA, OR 10 days max hold
 * Edge:   VIX mean-reverts within 5–15 days ~75% of the time.
 *         SPY recovers as fear subsides.
 *
 * Requires: VIX data in the symbol list (^VIX or VIXY as proxy)
 */
export class VixFearSpikeStrategy implements IStrategy {
  private readonly id = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
  private readonly name = 'VIX Fear Spike';
  private readonly version = '1.0.0';
  private config: StrategyConfig;
  private entryDay: Map<string, number> = new Map(); // track hold duration

  constructor(params?: Partial<StrategyConfig['params']>) {
    const symbols: string[] = (params?.symbols as string[]) || ['SPY', 'VIXY'];
    this.config = {
      strategyId: this.id,
      name: this.name,
      version: this.version,
      enabled: false,
      params: {
        spikeThreshold: params?.spikeThreshold ?? 1.10,   // VIXY must be 10% above 10d avg (VIXY smoother than VIX)
        vixSmaPeriod: params?.vixSmaPeriod ?? 10,          // 10-day average of VIX/VIXY
        maxHoldDays: params?.maxHoldDays ?? 10,            // exit after 10 days regardless
        buySymbol: params?.buySymbol ?? 'SPY',             // what to buy on fear spikes
        vixProxy: params?.vixProxy ?? 'VIXY',              // tradeable VIX proxy ETF
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
    const { spikeThreshold, vixSmaPeriod, buySymbol, vixProxy } = this.config.params;
    console.log(`Initializing VIX Fear Spike...`);
    console.log(`  VIX proxy:    ${vixProxy}`);
    console.log(`  Buy target:   ${buySymbol}`);
    console.log(`  Spike thresh: ${((spikeThreshold - 1) * 100).toFixed(0)}% above ${vixSmaPeriod}-day avg`);
    console.log(`  Max hold:     ${this.config.params.maxHoldDays} days`);
  }

  async generateSignals(snapshot: Map<string, MarketData[]>): Promise<Signal[]> {
    const { spikeThreshold, vixSmaPeriod, maxHoldDays, buySymbol, vixProxy } = this.config.params;
    const signals: Signal[] = [];

    const vixBars = snapshot.get(vixProxy);
    const buyBars = snapshot.get(buySymbol);

    if (!vixBars || vixBars.length < vixSmaPeriod + 2) return signals;
    if (!buyBars || buyBars.length < 2) return signals;

    const currentVix = vixBars[vixBars.length - 1].close;
    const buyPrice = buyBars[buyBars.length - 1].close;

    // Calculate VIX SMA
    const vixSlice = vixBars.slice(-vixSmaPeriod);
    const vixSma = vixSlice.reduce((sum, b) => sum + b.close, 0) / vixSlice.length;
    const spikeRatio = currentVix / vixSma;

    // Track hold days for exit
    const currentDate = vixBars[vixBars.length - 1].timestamp.getTime();

    if (spikeRatio >= spikeThreshold) {
      // FEAR SPIKE — buy the dip
      console.log(`[VIX] 🔥 SPIKE: ${vixProxy}=${currentVix.toFixed(2)}, ${vixSmaPeriod}d avg=${vixSma.toFixed(2)}, ratio=${spikeRatio.toFixed(2)}x — BUY ${buySymbol}`);

      // Strength scales with spike magnitude (1.2x = 0.5, 1.5x = 0.8, 2x = 1.0)
      const strength = Math.min(1, (spikeRatio - 1) * 2.5);

      signals.push({
        signalId: uuidv4(),
        strategyId: this.id,
        symbol: buySymbol,
        side: 'buy',
        price: buyPrice,
        strength,
        reason: `VIX spike: ${vixProxy} at ${currentVix.toFixed(1)} (${((spikeRatio - 1) * 100).toFixed(0)}% above ${vixSmaPeriod}d avg ${vixSma.toFixed(1)})`,
        features: { vixPrice: currentVix, vixSma, spikeRatio },
        timestamp: new Date(),
      });

      this.entryDay.set(buySymbol, currentDate);
    } else if (spikeRatio < 1.0 || this.shouldExit(buySymbol, currentDate, maxHoldDays)) {
      // VIX back below average OR max hold exceeded — exit
      const entryTime = this.entryDay.get(buySymbol);
      if (entryTime) {
        const holdDays = Math.ceil((currentDate - entryTime) / 86400000);
        const exitReason = spikeRatio < 1.0
          ? `VIX normalized: ${currentVix.toFixed(1)} below avg ${vixSma.toFixed(1)}`
          : `Max hold ${maxHoldDays}d reached (held ${holdDays}d)`;

        console.log(`[VIX] ✅ EXIT: ${exitReason}`);

        signals.push({
          signalId: uuidv4(),
          strategyId: this.id,
          symbol: buySymbol,
          side: 'sell',
          price: buyPrice,
          strength: 0.7,
          reason: exitReason,
          features: { vixPrice: currentVix, vixSma, spikeRatio, holdDays },
          timestamp: new Date(),
        });

        this.entryDay.delete(buySymbol);
      }
    }

    return signals;
  }

  private shouldExit(symbol: string, currentDate: number, maxHoldDays: number): boolean {
    const entryTime = this.entryDay.get(symbol);
    if (!entryTime) return false;
    return (currentDate - entryTime) / 86400000 >= maxHoldDays;
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
    this.entryDay.clear();
  }
}
