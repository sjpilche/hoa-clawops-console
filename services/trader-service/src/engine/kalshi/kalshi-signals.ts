/**
 * Kalshi Quantitative Signal Generator
 * Three strategies, zero LLM cost:
 *   1. Momentum — buy oversold dips, sell overbought rips
 *   2. Orderbook — detect hidden demand/supply imbalance
 *   3. Range Bucket Snipe — daily index range markets mispriced vs current level
 */

import { v4 as uuidv4 } from 'uuid';
import { KalshiAdapter } from '../execution/broker/kalshi';
import {
  KalshiAutoTraderConfig,
  KalshiSignal,
  PriceSnapshot,
  loadKalshiConfig,
} from './types';

export class KalshiSignalGenerator {
  // Ring buffer: ticker → snapshots (most recent last)
  private priceHistory: Map<string, PriceSnapshot[]> = new Map();
  private trackedMarkets: Map<string, any> = new Map(); // raw Kalshi market objects
  private config: KalshiAutoTraderConfig;
  private lastSignals: KalshiSignal[] = [];

  constructor(config?: KalshiAutoTraderConfig) {
    this.config = config || loadKalshiConfig();
  }

  // ==========================================================================
  // MARKET DISCOVERY
  // ==========================================================================

  /**
   * Scan Kalshi for liquid, tradeable markets in our target series.
   * Returns markets that pass liquidity filters.
   */
  async discoverMarkets(adapter: KalshiAdapter): Promise<any[]> {
    const discovered: any[] = [];

    for (const series of this.config.targetSeriesTickers) {
      try {
        const result = await adapter.getMarkets({ series_ticker: series, limit: 50 }) as any;
        const markets = result.markets || [];

        for (const m of markets) {
          // Only active/open markets
          if (!['active', 'open'].includes(m.status)) continue;

          // Parse dollar-denominated fields to cents
          const yesBid = Math.round(parseFloat(m.yes_bid_dollars || '0') * 100);
          const yesAsk = Math.round(parseFloat(m.yes_ask_dollars || '0') * 100);
          const vol24h = parseFloat(m.volume_24h_fp || '0');
          const oi = parseFloat(m.open_interest_fp || '0');
          const spread = yesAsk - yesBid;
          const mid = (yesBid + yesAsk) / 2;

          // Skip markets with no meaningful price
          if (yesBid <= 0 || yesAsk <= 0) continue;

          // === TIME-TO-EXPIRY FILTER ===
          // Same-day contracts (daily range buckets) die within hours — skip if close to expiry
          const closeTime = m.close_time ? new Date(m.close_time).getTime() : null;
          const hoursToClose = closeTime ? (closeTime - Date.now()) / 3_600_000 : 999;
          const isSameDayContract = hoursToClose < 24; // daily bucket
          if (isSameDayContract && hoursToClose < 3) {
            // Skip daily contracts within 3 hours of close — time decay kills the edge
            continue;
          }

          // === MINIMUM PRICE FILTER ===
          // Sub-10¢ contracts have proportionally massive spreads — avoid
          if (yesAsk < 10) continue;

          // === SPREAD QUALITY FILTER ===
          // Absolute cap AND relative cap — prevents buying into 60%+ spread traps
          const spreadPct = mid > 0 ? spread / mid : 1;
          if (spread > this.config.maxSpreadCents) continue;
          if (spreadPct > 0.30) continue; // Skip if spread > 30% of mid price

          // Liquidity filter
          if (vol24h < this.config.minVolume24h && oi < this.config.minOpenInterest) continue;

          // Attach computed cents values for convenience
          m._yesBidCents = yesBid;
          m._yesAskCents = yesAsk;
          m._noBidCents = Math.round(parseFloat(m.no_bid_dollars || '0') * 100);
          m._noAskCents = Math.round(parseFloat(m.no_ask_dollars || '0') * 100);
          m._lastPriceCents = Math.round(parseFloat(m.last_price_dollars || '0') * 100);
          m._vol24h = vol24h;
          m._oi = oi;
          m._spread = spread;

          discovered.push(m);
          this.trackedMarkets.set(m.ticker, m);
        }
      } catch (err: any) {
        // Series may not exist — skip
        console.warn(`[KalshiSignals] Series ${series} fetch failed:`, err.message);
      }
    }

    return discovered;
  }

  // ==========================================================================
  // PRICE HISTORY
  // ==========================================================================

  /**
   * Record a price snapshot for momentum calculation.
   */
  recordSnapshot(market: any): void {
    const snapshot: PriceSnapshot = {
      ticker: market.ticker,
      timestamp: Date.now(),
      yesBidCents: market._yesBidCents,
      yesAskCents: market._yesAskCents,
      yesLastCents: market._lastPriceCents,
      noBidCents: market._noBidCents,
      noAskCents: market._noAskCents,
      volume24h: market._vol24h,
      openInterest: market._oi,
    };

    const history = this.priceHistory.get(market.ticker) || [];
    history.push(snapshot);

    // Trim snapshots older than the window
    const cutoff = Date.now() - this.config.priceHistoryWindowMs;
    const trimmed = history.filter((s) => s.timestamp > cutoff);

    this.priceHistory.set(market.ticker, trimmed);
  }

  // ==========================================================================
  // SIGNAL 1: MOMENTUM
  // ==========================================================================

  /**
   * Detect price drops/rises that indicate retail overreaction.
   * Buy oversold, flag overbought for existing positions.
   */
  generateMomentumSignals(): KalshiSignal[] {
    const signals: KalshiSignal[] = [];

    for (const [ticker, history] of this.priceHistory) {
      if (history.length < 3) continue; // Need enough data points

      const oldest = history[0];
      const current = history[history.length - 1];
      const market = this.trackedMarkets.get(ticker);
      if (!market) continue;

      const deltaCents = current.yesLastCents - oldest.yesLastCents;
      const minutesElapsed = (current.timestamp - oldest.timestamp) / 60000;

      // Oversold: YES price dropped significantly → BUY YES
      if (deltaCents <= -this.config.momentumThresholdCents) {
        const strength = Math.min(1, Math.abs(deltaCents) / 6); // caps at 6c drop
        signals.push({
          signalId: uuidv4(),
          type: 'momentum_oversold',
          ticker,
          title: market.title || ticker,
          side: 'yes',
          action: 'buy',
          strength,
          priceCents: current.yesAskCents, // Buy at the ask
          reason: `Momentum oversold: YES dropped ${Math.abs(deltaCents)}¢ in ${Math.round(minutesElapsed)}min`,
          features: {
            deltaCents,
            minutesElapsed: Math.round(minutesElapsed),
            historyPoints: history.length,
            yesBid: current.yesBidCents,
            yesAsk: current.yesAskCents,
          },
          timestamp: new Date(),
        });
      }

      // Overbought: YES price rose significantly → signal for position exit
      if (deltaCents >= this.config.momentumThresholdCents) {
        signals.push({
          signalId: uuidv4(),
          type: 'momentum_overbought',
          ticker,
          title: market.title || ticker,
          side: 'yes',
          action: 'sell',
          strength: Math.min(1, deltaCents / 6),
          priceCents: current.yesBidCents, // Sell at the bid
          reason: `Momentum overbought: YES rose ${deltaCents}¢ in ${Math.round(minutesElapsed)}min`,
          features: { deltaCents, minutesElapsed: Math.round(minutesElapsed) },
          timestamp: new Date(),
        });
      }
    }

    return signals;
  }

  // ==========================================================================
  // SIGNAL 2: ORDERBOOK IMBALANCE
  // ==========================================================================

  /**
   * Check orderbook depth for hidden demand/supply.
   */
  async generateOrderbookSignals(adapter: KalshiAdapter): Promise<KalshiSignal[]> {
    const signals: KalshiSignal[] = [];

    for (const [ticker, market] of this.trackedMarkets) {
      try {
        const orderbook = await adapter.getOrderbook(ticker);
        if (!orderbook) continue;

        // Sum YES side depth (bids to buy YES)
        const yesBidDepth = (orderbook.yes || []).reduce((sum, [_price, qty]) => sum + qty, 0);
        // Sum NO side depth (effectively, asks for YES)
        const noAskDepth = (orderbook.no || []).reduce((sum, [_price, qty]) => sum + qty, 0);

        if (yesBidDepth === 0 && noAskDepth === 0) continue;

        // YES demand outweighs supply → price likely to rise
        if (noAskDepth > 0 && yesBidDepth / noAskDepth >= this.config.orderbookImbalanceRatio) {
          const ratio = yesBidDepth / noAskDepth;
          signals.push({
            signalId: uuidv4(),
            type: 'orderbook_buy',
            ticker,
            title: market.title || ticker,
            side: 'yes',
            action: 'buy',
            strength: Math.min(1, (ratio - 1) / 3), // Normalized: 2:1 = 0.33, 4:1 = 1.0
            priceCents: market._yesAskCents,
            reason: `Orderbook imbalance: YES bid depth ${yesBidDepth} vs ask ${noAskDepth} (${ratio.toFixed(1)}:1)`,
            features: { yesBidDepth, noAskDepth, ratio },
            timestamp: new Date(),
          });
        }

        // Supply outweighs demand → price likely to fall (sell signal for exits)
        if (yesBidDepth > 0 && noAskDepth / yesBidDepth >= this.config.orderbookImbalanceRatio) {
          const ratio = noAskDepth / yesBidDepth;
          signals.push({
            signalId: uuidv4(),
            type: 'orderbook_sell',
            ticker,
            title: market.title || ticker,
            side: 'yes',
            action: 'sell',
            strength: Math.min(1, (ratio - 1) / 3),
            priceCents: market._yesBidCents,
            reason: `Orderbook sell pressure: ask depth ${noAskDepth} vs bid ${yesBidDepth} (${ratio.toFixed(1)}:1)`,
            features: { yesBidDepth, noAskDepth, ratio },
            timestamp: new Date(),
          });
        }
      } catch (err: any) {
        // Orderbook may be unavailable for some markets
      }
    }

    return signals;
  }

  // ==========================================================================
  // SIGNAL 3: RANGE BUCKET SNIPE
  // ==========================================================================

  /**
   * For daily range bucket markets (KXINX, KXNASDAQ100):
   * Find the bucket most likely to contain the closing price,
   * and check if it's mispriced (< 25¢ for a ~30-40% true probability).
   */
  generateRangeBucketSignals(): KalshiSignal[] {
    const signals: KalshiSignal[] = [];

    // Find range bucket markets — they have "between" in the title
    // and belong to KXINX or KXNASDAQ100 series
    const bucketMarkets = Array.from(this.trackedMarkets.values()).filter((m) => {
      const title = (m.title || '').toLowerCase();
      return title.includes('between') || title.includes('above') || title.includes('below');
    });

    if (bucketMarkets.length === 0) return signals;

    // Group by event (same-day buckets share event_ticker)
    const byEvent: Map<string, any[]> = new Map();
    for (const m of bucketMarkets) {
      const group = byEvent.get(m.event_ticker) || [];
      group.push(m);
      byEvent.set(m.event_ticker, group);
    }

    for (const [eventTicker, buckets] of byEvent) {
      // Find the bucket with the highest last price — that's the market's best guess
      // for where the index will close
      const sorted = [...buckets].sort(
        (a, b) => (b._lastPriceCents || 0) - (a._lastPriceCents || 0),
      );

      const likelyWinner = sorted[0];
      if (!likelyWinner) continue;

      const price = likelyWinner._yesAskCents || likelyWinner._lastPriceCents || 0;

      // Only snipe if the likely winner is cheap (< 25¢) — positive expected value
      if (price > 0 && price < 25) {
        signals.push({
          signalId: uuidv4(),
          type: 'range_bucket_snipe',
          ticker: likelyWinner.ticker,
          title: likelyWinner.title || likelyWinner.ticker,
          side: 'yes',
          action: 'buy',
          strength: price < 15 ? 0.9 : 0.6, // Cheaper = higher conviction
          priceCents: price,
          reason: `Range bucket snipe: "${likelyWinner.title}" at ${price}¢ (highest-prob bucket in ${eventTicker})`,
          features: {
            eventTicker,
            totalBuckets: buckets.length,
            lastPrice: likelyWinner._lastPriceCents,
          },
          timestamp: new Date(),
        });
      }
    }

    return signals;
  }

  // ==========================================================================
  // COMBINED SIGNALS
  // ==========================================================================

  /**
   * Generate all signals, deduplicate, sort by strength.
   */
  async generateAllSignals(adapter: KalshiAdapter): Promise<KalshiSignal[]> {
    const momentum = this.generateMomentumSignals();
    const orderbook = await this.generateOrderbookSignals(adapter);
    const rangeBuckets = this.generateRangeBucketSignals();

    const all = [...momentum, ...orderbook, ...rangeBuckets];

    // Deduplicate: if multiple signals for same ticker+action, keep strongest
    const best: Map<string, KalshiSignal> = new Map();
    for (const signal of all) {
      const key = `${signal.ticker}:${signal.action}`;
      const existing = best.get(key);
      if (!existing || signal.strength > existing.strength) {
        best.set(key, signal);
      }
    }

    // Sort by strength descending
    const signals = Array.from(best.values()).sort((a, b) => b.strength - a.strength);

    this.lastSignals = signals;
    return signals;
  }

  /**
   * Get the signals from the most recent scan (for API routes).
   */
  getLastSignals(): KalshiSignal[] {
    return this.lastSignals;
  }

  /**
   * Get tracked markets (for API routes).
   */
  getTrackedMarkets(): any[] {
    return Array.from(this.trackedMarkets.values());
  }

  /**
   * Get price history for a ticker (for debugging).
   */
  getPriceHistory(ticker: string): PriceSnapshot[] {
    return this.priceHistory.get(ticker) || [];
  }
}
