import { v4 as uuidv4 } from 'uuid';
import { IStrategy, Signal, StrategyConfig, MarketData } from '../types';
import { OrderIntent } from '../../execution/order_router';

/**
 * Turn of Month Strategy
 *
 * Buy on the last trading day of the month, sell on the 3rd trading day
 * of the next month. One of the most robust calendar anomalies ever
 * documented — driven by institutional fund flows (pension rebalancing,
 * 401k contributions, window dressing).
 *
 * Entry: Last trading day of the month (detected by checking if next
 *        bar's date is in a different month)
 * Exit:  3rd trading day of the new month
 * Edge:  SPY averages +0.5% during this 4-day window vs ~0% the rest
 *        of the month. Consistent across decades and markets.
 */
export class TurnOfMonthStrategy implements IStrategy {
  private readonly id = 'c3d4e5f6-a7b8-9012-cdef-234567890123';
  private readonly name = 'Turn of Month';
  private readonly version = '1.0.0';
  private config: StrategyConfig;
  private tradingDayInMonth: number = 0; // count trading days in current month

  constructor(params?: Partial<StrategyConfig['params']>) {
    const symbols: string[] = (params?.symbols as string[]) || ['SPY'];
    this.config = {
      strategyId: this.id,
      name: this.name,
      version: this.version,
      enabled: false,
      params: {
        exitDay: params?.exitDay ?? 3,         // sell on Nth trading day of new month
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
    console.log(`Initializing Turn of Month...`);
    console.log(`  Symbols:   ${this.config.symbols.join(', ')}`);
    console.log(`  Exit day:  Trading day ${this.config.params.exitDay} of new month`);
  }

  async generateSignals(snapshot: Map<string, MarketData[]>): Promise<Signal[]> {
    const { exitDay } = this.config.params;
    const signals: Signal[] = [];

    for (const symbol of this.config.symbols) {
      const bars = snapshot.get(symbol);
      if (!bars || bars.length < 3) continue;

      const today = bars[bars.length - 1];
      const yesterday = bars[bars.length - 2];
      const todayDate = today.timestamp;
      const yesterdayDate = yesterday.timestamp;

      const todayMonth = todayDate.getMonth();
      const yesterdayMonth = yesterdayDate.getMonth();

      // Detect last trading day of month: today is in month X, we need to check
      // if tomorrow would be in month X+1. Since we only have bars up to today,
      // we check if today is late in the month (day >= 25) and look ahead.
      const todayDay = todayDate.getDate();
      const daysInMonth = new Date(todayDate.getFullYear(), todayMonth + 1, 0).getDate();
      const isLastFewDays = todayDay >= daysInMonth - 3;

      // New month just started: yesterday was a different month
      const isNewMonth = todayMonth !== yesterdayMonth;

      if (isNewMonth) {
        this.tradingDayInMonth = 1;
      } else {
        this.tradingDayInMonth++;
      }

      // ENTRY: Last trading day of the month
      // Detect by checking if the NEXT bar would be a new month.
      // Since we can't look forward, use heuristic: last 2 calendar days of the month
      if (todayDay >= daysInMonth - 1) {
        console.log(`[TOM] 📅 LAST DAY of month ${todayMonth + 1} — BUY ${symbol} @ $${today.close.toFixed(2)}`);

        signals.push({
          signalId: uuidv4(),
          strategyId: this.id,
          symbol,
          side: 'buy',
          price: today.close,
          strength: 0.75,
          reason: `Turn of month: last trading day of month ${todayMonth + 1}`,
          features: { dayOfMonth: todayDay, month: todayMonth + 1 },
          timestamp: new Date(),
        });
      }

      // EXIT: Nth trading day of new month (check every day, not just isNewMonth)
      if (isNewMonth && this.tradingDayInMonth === 1) {
        // Mark that we entered a new month — counter starts at 1
      }
      if (this.tradingDayInMonth >= exitDay && this.tradingDayInMonth <= exitDay + 1 && todayDay <= 7) {
        // We're in the first week and hit our target trading day
        console.log(`[TOM] 📅 Day ${this.tradingDayInMonth} of month ${todayMonth + 1} — SELL ${symbol} @ $${today.close.toFixed(2)}`);

        signals.push({
          signalId: uuidv4(),
          strategyId: this.id,
          symbol,
          side: 'sell',
          price: today.close,
          strength: 0.7,
          reason: `Turn of month exit: trading day ${this.tradingDayInMonth} of month ${todayMonth + 1}`,
          features: { tradingDay: this.tradingDayInMonth, month: todayMonth + 1 },
          timestamp: new Date(),
        });
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
    this.tradingDayInMonth = 0;
  }
}
