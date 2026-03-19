import { v4 as uuidv4 } from 'uuid';
import { IStrategy, Signal, StrategyConfig, MarketData } from '../types';
import { OrderIntent } from '../../execution/order_router';

/**
 * Holiday Effect Strategy
 *
 * Markets rally in the 2 trading days before major US holidays.
 * Driven by short covering, reduced selling pressure, and positive
 * sentiment heading into long weekends.
 *
 * Entry: 2 trading days before a major holiday
 * Exit:  Last trading day before the holiday (or first day after)
 *
 * Major US market holidays:
 *   - New Year's Day (Jan 1)
 *   - MLK Day (3rd Monday Jan)
 *   - Presidents' Day (3rd Monday Feb)
 *   - Memorial Day (last Monday May)
 *   - Juneteenth (Jun 19)
 *   - Independence Day (Jul 4)
 *   - Labor Day (1st Monday Sep)
 *   - Thanksgiving (4th Thursday Nov)
 *   - Christmas (Dec 25)
 *
 * ~18 entry signals per year (2 days × 9 holidays)
 */
export class HolidayEffectStrategy implements IStrategy {
  private readonly id = 'a1b2c3d4-0003-4567-abcd-holiday000003';
  private readonly name = 'Holiday Effect';
  private readonly version = '1.0.0';
  private config: StrategyConfig;

  constructor(params?: Partial<StrategyConfig['params']>) {
    const symbols: string[] = (params?.symbols as string[]) || ['SPY'];
    this.config = {
      strategyId: this.id,
      name: this.name,
      version: this.version,
      enabled: false,
      params: {
        entryDaysBefore: params?.entryDaysBefore ?? 2,  // buy N trading days before holiday
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
    console.log(`Initializing Holiday Effect...`);
    console.log(`  Symbols:     ${this.config.symbols.join(', ')}`);
    console.log(`  Entry:       ${this.config.params.entryDaysBefore} trading days before holiday`);
    console.log(`  Holidays:    9 major US market holidays`);
  }

  /**
   * Get all US market holiday dates for a given year.
   * Returns calendar dates (market is CLOSED on these dates).
   */
  private getHolidays(year: number): Date[] {
    const holidays: Date[] = [];

    // New Year's Day — Jan 1
    holidays.push(new Date(year, 0, 1));

    // MLK Day — 3rd Monday of January
    holidays.push(this.nthWeekday(year, 0, 1, 3));

    // Presidents' Day — 3rd Monday of February
    holidays.push(this.nthWeekday(year, 1, 1, 3));

    // Memorial Day — last Monday of May
    holidays.push(this.lastWeekday(year, 4, 1));

    // Juneteenth — June 19
    holidays.push(new Date(year, 5, 19));

    // Independence Day — July 4
    holidays.push(new Date(year, 6, 4));

    // Labor Day — 1st Monday of September
    holidays.push(this.nthWeekday(year, 8, 1, 1));

    // Thanksgiving — 4th Thursday of November
    holidays.push(this.nthWeekday(year, 10, 4, 4));

    // Christmas — December 25
    holidays.push(new Date(year, 11, 25));

    return holidays;
  }

  /** Get the Nth occurrence of a weekday in a month (1-indexed) */
  private nthWeekday(year: number, month: number, dayOfWeek: number, n: number): Date {
    const first = new Date(year, month, 1);
    let offset = (dayOfWeek - first.getDay() + 7) % 7;
    return new Date(year, month, 1 + offset + (n - 1) * 7);
  }

  /** Get the last occurrence of a weekday in a month */
  private lastWeekday(year: number, month: number, dayOfWeek: number): Date {
    const last = new Date(year, month + 1, 0); // last day of month
    let offset = (last.getDay() - dayOfWeek + 7) % 7;
    return new Date(year, month, last.getDate() - offset);
  }

  /**
   * Check how many calendar days until the next holiday.
   * Converts to approximate trading days (calendarDays * 5/7).
   */
  private calendarDaysUntilHoliday(currentDate: Date): { calendarDays: number; holidayName: string } | null {
    const year = currentDate.getFullYear();
    const holidays = [...this.getHolidays(year), ...this.getHolidays(year + 1)];

    const holidayNames = [
      "New Year's", 'MLK Day', "Presidents' Day", 'Memorial Day',
      'Juneteenth', 'July 4th', 'Labor Day', 'Thanksgiving', 'Christmas',
      "New Year's", 'MLK Day', "Presidents' Day", 'Memorial Day',
      'Juneteenth', 'July 4th', 'Labor Day', 'Thanksgiving', 'Christmas',
    ];

    const todayMs = currentDate.getTime();

    for (let i = 0; i < holidays.length; i++) {
      const holiday = holidays[i];
      const calendarDays = Math.round((holiday.getTime() - todayMs) / 86400000);

      if (calendarDays > 0 && calendarDays <= 6) {
        return { calendarDays, holidayName: holidayNames[i] };
      }
    }

    return null;
  }

  async generateSignals(snapshot: Map<string, MarketData[]>): Promise<Signal[]> {
    const { entryDaysBefore } = this.config.params;
    const signals: Signal[] = [];

    for (const symbol of this.config.symbols) {
      const bars = snapshot.get(symbol);
      if (!bars || bars.length < 5) continue;

      const today = bars[bars.length - 1];
      const todayDate = today.timestamp;

      const holidayInfo = this.calendarDaysUntilHoliday(todayDate);

      if (holidayInfo && holidayInfo.calendarDays >= 3 && holidayInfo.calendarDays <= 5) {
        // 3-5 calendar days out ≈ 2 trading days — BUY
        console.log(`[HOLIDAY] 🎉 ${holidayInfo.holidayName} in ${holidayInfo.calendarDays}d — BUY ${symbol} @ $${today.close.toFixed(2)}`);

        signals.push({
          signalId: uuidv4(),
          strategyId: this.id,
          symbol,
          side: 'buy',
          price: today.close,
          strength: 0.7,
          reason: `Holiday effect: ${holidayInfo.holidayName} in ${holidayInfo.calendarDays} calendar days`,
          features: { holiday: holidayInfo.holidayName, calendarDays: holidayInfo.calendarDays },
          timestamp: new Date(),
        });
      } else if (holidayInfo && holidayInfo.calendarDays <= 2) {
        // 1-2 calendar days = last trading day before holiday — SELL
        console.log(`[HOLIDAY] 📅 ${holidayInfo.holidayName} in ${holidayInfo.calendarDays}d — SELL ${symbol} @ $${today.close.toFixed(2)}`);

        signals.push({
          signalId: uuidv4(),
          strategyId: this.id,
          symbol,
          side: 'sell',
          price: today.close,
          strength: 0.7,
          reason: `Holiday exit: ${holidayInfo.holidayName} in ${holidayInfo.calendarDays} day(s)`,
          features: { holiday: holidayInfo.holidayName, calendarDays: holidayInfo.calendarDays },
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

  async cleanup(): Promise<void> {}
}
