/**
 * Options Engine — Orchestrates ALL options strategies (conservative + aggressive)
 *
 * Conservative (Tier 1):
 *   - VIX Calls: buy SPY calls on fear spikes
 *   - Oversold Puts: sell CSPs on mega-cap dips
 *   - TOM Calls: buy weekly SPY calls end of month
 *
 * Aggressive (Tier 2 — "Dance with the Devil"):
 *   - 0DTE Scalper: same-day expiring momentum plays
 *   - Event Straddles: straddles before FOMC/CPI/Jobs
 *   - Earnings YOLO: OTM calls on AI panel bullish picks
 *
 * Runs alongside the equity panel on each scheduler tick.
 */

import { AlpacaOptionsClient } from './alpaca-options';
import { VixCallsStrategy } from './strategies/vix_calls';
import { OversoldPutSeller } from './strategies/oversold_puts';
import { TomCallsStrategy } from './strategies/tom_calls';
import { ZeroDteScalper } from './strategies/zero_dte_scalper';
import { EventStraddleStrategy } from './strategies/event_straddle';
import { EarningsYoloStrategy } from './strategies/earnings_yolo';
import { KalshiSignalCallsStrategy } from './strategies/kalshi_signal_calls';

export class OptionsEngine {
  private client: AlpacaOptionsClient;

  // Tier 1 — Conservative
  private vixCalls: VixCallsStrategy;
  private oversoldPuts: OversoldPutSeller;
  private tomCalls: TomCallsStrategy;

  // Tier 2 — Aggressive
  private zeroDte: ZeroDteScalper;
  private eventStraddle: EventStraddleStrategy;
  private earningsYolo: EarningsYoloStrategy;

  // Tier 3 — Prediction Market Bridge
  kalshiSignalCalls: KalshiSignalCallsStrategy;

  private enabled: boolean;
  private aggressiveEnabled: boolean;
  private priceCache: Map<string, number[]> = new Map();
  private volumeCache: Map<string, { currentVolume: number; avgVolume: number; price: number }> = new Map();

  constructor() {
    this.client = new AlpacaOptionsClient();

    // Tier 1
    this.vixCalls = new VixCallsStrategy();
    this.oversoldPuts = new OversoldPutSeller();
    this.tomCalls = new TomCallsStrategy();

    // Tier 2
    this.zeroDte = new ZeroDteScalper();
    this.eventStraddle = new EventStraddleStrategy();
    this.earningsYolo = new EarningsYoloStrategy();

    // Tier 3 — Kalshi prediction market bridge
    this.kalshiSignalCalls = new KalshiSignalCallsStrategy();

    this.enabled = process.env.OPTIONS_ENABLED !== 'false';
    this.aggressiveEnabled = process.env.OPTIONS_AGGRESSIVE !== 'false';
  }

  /**
   * Run all options strategies. Called by the TradingScheduler after each panel run.
   * panelPicks: optional — from the AI panel's latest run (for Earnings YOLO)
   */
  async run(panelPicks?: { symbol: string; conviction: number; side: string }[]): Promise<{ strategy: string; action: string; details: string }[]> {
    if (!this.enabled) return [];

    const results: { strategy: string; action: string; details: string }[] = [];
    const now = new Date();

    try {
      // Fetch current prices
      const spyPrice = await this.client.getUnderlyingPrice('SPY');
      let vixyPrice = 0;
      try { vixyPrice = await this.client.getUnderlyingPrice('VIXY'); } catch {}

      // Update price + volume caches
      await this.updateCaches();

      console.log(`\n${'💀'.repeat(10)}`);
      console.log(`💀 Options Engine: SPY=$${spyPrice.toFixed(2)}, VIXY=$${vixyPrice.toFixed(2)}`);
      console.log(`💀 Mode: ${this.aggressiveEnabled ? 'AGGRESSIVE (0DTE + Straddles + YOLO)' : 'Conservative'}`);
      console.log(`${'💀'.repeat(10)}`);

      // =====================================================================
      // TIER 1 — Conservative
      // =====================================================================

      // 1. VIX Fear Spike Calls
      if (vixyPrice > 0) {
        const vixyHistory = this.priceCache.get('VIXY') || [];
        const vixySma = vixyHistory.length >= 10
          ? vixyHistory.slice(-10).reduce((s, p) => s + p, 0) / 10
          : vixyPrice;

        const vixResult = await this.vixCalls.evaluate(vixyPrice, vixySma, spyPrice);
        if (vixResult) results.push({ strategy: 'VIX Calls', ...vixResult });
      }

      // 2. Oversold Put Seller
      const putResults = await this.oversoldPuts.evaluate(this.priceCache);
      for (const r of putResults) {
        results.push({ strategy: 'Oversold Puts', ...r });
      }

      // 3. Turn of Month Calls
      const tomResult = await this.tomCalls.evaluate(now, spyPrice);
      if (tomResult) results.push({ strategy: 'TOM Calls', ...tomResult });

      // =====================================================================
      // TIER 2 — Aggressive ("Dance with the Devil")
      // =====================================================================

      if (this.aggressiveEnabled) {
        // 4. 0DTE Scalper — fires multiple times/day
        const scalperResult = await this.zeroDte.evaluate(spyPrice, now);
        if (scalperResult) results.push({ strategy: '0DTE Scalper', ...scalperResult });
        const dayStats = this.zeroDte.getDayStats();
        if (dayStats.trades > 0) {
          console.log(`   [0DTE] Day stats: ${dayStats.trades} trades, $${dayStats.pnl.toFixed(0)} P&L`);
        }

        // 5. Event Straddles — checks for upcoming FOMC/CPI/Jobs
        const straddleResult = await this.eventStraddle.evaluate(spyPrice, now);
        if (straddleResult) results.push({ strategy: 'Event Straddle', ...straddleResult });

        // 6. Earnings YOLO — needs panel picks
        if (panelPicks && panelPicks.length > 0) {
          const yoloResults = await this.earningsYolo.evaluate(panelPicks, this.volumeCache);
          for (const r of yoloResults) {
            results.push({ strategy: 'Earnings YOLO', ...r });
          }
        }
      }

      if (results.length > 0) {
        console.log(`\n🎯 Options Engine: ${results.length} action(s)`);
        results.forEach(r => console.log(`   [${r.strategy}] ${r.action}: ${r.details}`));
      }

    } catch (err: any) {
      console.error(`⚠️ Options Engine error (non-fatal): ${err.message}`);
    }

    return results;
  }

  /**
   * Tier 3 — called by Kalshi scheduler when oversold signals fire.
   * Bridges prediction market signals to leveraged options plays.
   */
  async runWithKalshiSignals(
    signals: Array<{ type: string; ticker: string; strength: number; priceCents: number }>,
  ): Promise<Array<{ strategy: string; action: string; details: string }>> {
    if (!this.enabled) return [];
    try {
      const results = await this.kalshiSignalCalls.evaluate(signals);
      return results.map(r => ({ strategy: 'Kalshi→Options', ...r }));
    } catch (err: any) {
      console.error(`⚠️ Kalshi options bridge error: ${err.message}`);
      return [];
    }
  }

  private async updateCaches(): Promise<void> {
    const symbols = [
      'VIXY', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA',
      'JPM', 'UNH', 'V', 'NFLX', 'CRM', 'ADBE', 'AMD', 'UBER', 'PLTR',
    ];

    for (const symbol of symbols) {
      try {
        const price = await this.client.getUnderlyingPrice(symbol);
        if (price > 0) {
          // Price cache
          const history = this.priceCache.get(symbol) || [];
          history.push(price);
          if (history.length > 30) history.shift();
          this.priceCache.set(symbol, history);

          // Volume cache (approximate from price change volatility as proxy)
          const avg = history.length >= 20
            ? history.slice(-20).reduce((s, p) => s + p, 0) / 20
            : price;
          const vol = Math.abs(price - avg) / avg; // pseudo-volume from volatility
          this.volumeCache.set(symbol, {
            currentVolume: vol > 0.02 ? 400 : 100, // high vol = likely high volume
            avgVolume: 100,
            price,
          });
        }
      } catch {}
    }
  }

  getStatus(): {
    enabled: boolean;
    aggressive: boolean;
    vixCalls: boolean;
    oversoldPuts: number;
    tomCalls: boolean;
    zeroDte: boolean;
    zeroDteDayStats: { trades: number; pnl: number };
    eventStraddle: boolean;
    earningsYolo: number;
  } {
    return {
      enabled: this.enabled,
      aggressive: this.aggressiveEnabled,
      vixCalls: this.vixCalls.hasPosition(),
      oversoldPuts: this.oversoldPuts.getActivePositions().length,
      tomCalls: this.tomCalls.hasPosition(),
      zeroDte: this.zeroDte.hasPosition(),
      zeroDteDayStats: this.zeroDte.getDayStats(),
      eventStraddle: this.eventStraddle.hasPosition(),
      earningsYolo: this.earningsYolo.getActiveCount(),
    };
  }
}
