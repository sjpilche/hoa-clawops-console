import { v4 as uuidv4 } from 'uuid';
import { IStrategy, Signal, StrategyConfig, MarketData } from '../types';
import { OrderIntent } from '../../execution/order_router';

/**
 * Overnight Premium Strategy
 *
 * Nearly all of SPY's historical returns come from overnight holds
 * (close → next open). Intraday returns are flat or negative on average.
 *
 * Entry: Buy at close every day (detected: last bar of the day)
 * Exit:  Sell at open next day (detected: first bar of new day, using previous close as proxy)
 *
 * Since we use daily bars, the backtester sees:
 *   Day N close → Day N+1 open = overnight return
 * We BUY on day N, SELL on day N+1 using the open price.
 *
 * Edge: Institutional after-hours activity, overnight news absorption,
 *       and futures market pricing create a persistent overnight premium.
 *       Documented across 20+ global equity markets since the 1990s.
 */
export class OvernightPremiumStrategy implements IStrategy {
  private readonly id = 'a1b2c3d4-0001-4567-abcd-overnight00001';
  private readonly name = 'Overnight Premium';
  private readonly version = '1.0.0';
  private config: StrategyConfig;
  private lastSignalDate: string = '';

  constructor(params?: Partial<StrategyConfig['params']>) {
    const symbols: string[] = (params?.symbols as string[]) || ['SPY'];
    this.config = {
      strategyId: this.id,
      name: this.name,
      version: this.version,
      enabled: false,
      params: {
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
    console.log(`Initializing Overnight Premium...`);
    console.log(`  Symbols: ${this.config.symbols.join(', ')}`);
    console.log(`  Logic:   Buy at close, sell at next open (daily bars)`);
  }

  async generateSignals(snapshot: Map<string, MarketData[]>): Promise<Signal[]> {
    const signals: Signal[] = [];

    for (const symbol of this.config.symbols) {
      const bars = snapshot.get(symbol);
      if (!bars || bars.length < 3) continue;

      const today = bars[bars.length - 1];
      const yesterday = bars[bars.length - 2];
      const todayDate = today.timestamp.toISOString().slice(0, 10);

      // Avoid duplicate signals on the same day
      if (todayDate === this.lastSignalDate) continue;

      // SELL first: close yesterday's overnight position at today's open
      // The backtester uses the close price for fills, but the signal represents
      // "we would sell at open." Using today's open as the signal price.
      const overnightReturn = (today.open - yesterday.close) / yesterday.close;

      signals.push({
        signalId: uuidv4(),
        strategyId: this.id,
        symbol,
        side: 'sell',
        price: today.open, // sell at open
        strength: 0.6,
        reason: `Overnight exit: ${(overnightReturn * 100).toFixed(2)}% overnight return`,
        features: { overnightReturn, yesterdayClose: yesterday.close, todayOpen: today.open },
        timestamp: new Date(),
      });

      // BUY: enter new overnight position at today's close
      signals.push({
        signalId: uuidv4(),
        strategyId: this.id,
        symbol,
        side: 'buy',
        price: today.close, // buy at close
        strength: 0.65,
        reason: `Overnight entry: buy ${symbol} at close for overnight hold`,
        features: { closePrice: today.close },
        timestamp: new Date(),
      });

      this.lastSignalDate = todayDate;
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

  async cleanup(): Promise<void> {}
}
