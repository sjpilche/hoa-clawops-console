/**
 * NOAA Weather × Polymarket / Kalshi Strategy
 * Trades weather prediction markets by comparing NOAA forecast probabilities
 * against market YES token prices, buying when NOAA data implies the
 * market is significantly mispriced.
 *
 * Supports both Polymarket (crypto) and Kalshi (CFTC-regulated) as brokers.
 * When Kalshi is configured, its weather markets are scanned alongside Polymarket.
 */

import { Pool } from 'pg';
import { IStrategy, StrategyConfig, Signal } from '../types';
import { PolymarketAdapter } from '../../execution/broker/polymarket';
import { PolymarketMarket } from '../../execution/broker/polymarket-types';
import { KalshiAdapter } from '../../execution/broker/kalshi';
import { KalshiMarket } from '../../execution/broker/kalshi-types';
import { v4 as uuidv4 } from 'uuid';
import { parseWeatherMarket, isWeatherMarket, ParsedWeatherMarket } from '../../weather/market-parser';
import { WeatherStrategyConfig, DEFAULT_CITIES, CityConfig, WeatherMarketMatch } from '../../weather/types';

// Weather data service — being built by another agent
import type { NOAAWeatherService } from '../../weather/weather-data';

// ---------------------------------------------------------------------------
// Strategy params interface
// ---------------------------------------------------------------------------

interface WeatherStrategyParams extends WeatherStrategyConfig {
  // All fields come from WeatherStrategyConfig in types.ts
}

// ---------------------------------------------------------------------------
// Strategy implementation
// ---------------------------------------------------------------------------

export class WeatherPolymarketStrategy implements IStrategy {
  private id: string;
  private name: string = 'NOAA Weather × Polymarket';
  private version: string = '1.0.0';
  private config: StrategyConfig;
  private pool: Pool;
  private broker: PolymarketAdapter;
  private kalshiBroker: KalshiAdapter | null = null;
  private params: WeatherStrategyParams;
  private weatherService: NOAAWeatherService | null = null;
  private cityMap: Map<string, CityConfig>;

  constructor(
    strategyId: string,
    config: StrategyConfig,
    pool: Pool,
    broker: PolymarketAdapter,
  ) {
    this.id = strategyId;
    this.config = config;
    this.pool = pool;
    this.broker = broker;

    // Initialize Kalshi adapter if configured
    try {
      const kalshi = new KalshiAdapter();
      if (kalshi.isConfigured()) {
        this.kalshiBroker = kalshi;
      }
    } catch (err: any) {
      console.warn(`  [Weather] Kalshi adapter not available: ${err.message}`);
    }

    // Parse parameters with defaults
    this.params = {
      entryThreshold: config.params.entryThreshold ?? 0.15,
      exitThreshold: config.params.exitThreshold ?? 0.45,
      maxPositionSize: config.params.maxPositionSize ?? 2.00,
      maxTradesPerScan: config.params.maxTradesPerScan ?? 5,
      scanFrequencyMs: config.params.scanFrequencyMs ?? 120_000,
      cities: config.params.cities || ['nyc', 'chicago', 'seattle', 'atlanta', 'dallas', 'miami'],
      minLiquidity: config.params.minLiquidity ?? 100,
      minEdge: config.params.minEdge ?? 0.20,
      maxHoursUntilResolution: config.params.maxHoursUntilResolution ?? 48,
      stopLossThreshold: config.params.stopLossThreshold ?? 0.03,
    };

    // Build city slug → config lookup for configured cities
    this.cityMap = new Map();
    for (const city of DEFAULT_CITIES) {
      if (this.params.cities.includes(city.slug)) {
        this.cityMap.set(city.slug, city);
      }
    }
  }

  // -------------------------------------------------------------------------
  // IStrategy interface
  // -------------------------------------------------------------------------

  getId(): string { return this.id; }
  getName(): string { return this.name; }
  getVersion(): string { return this.version; }
  getConfig(): StrategyConfig { return this.config; }

  async initialize(): Promise<void> {
    // Lazy-import weather data service so strategy loads even if module isn't ready yet
    try {
      const weatherMod = await import('../../weather/weather-data');
      this.weatherService = new weatherMod.NOAAWeatherService();
    } catch (err: any) {
      console.warn(`⚠ Weather data service not available yet: ${err.message}`);
      console.warn('  Strategy will skip NOAA lookups until service is ready.');
    }

    // Connect Kalshi if configured
    if (this.kalshiBroker) {
      try {
        await this.kalshiBroker.connect();
        console.log(`✓ Kalshi broker connected for weather trading`);
      } catch (err: any) {
        console.warn(`  ⚠ Kalshi connection failed: ${err.message}`);
        console.warn('  Weather strategy will use Polymarket only.');
        this.kalshiBroker = null;
      }
    }

    console.log(`✓ ${this.name} v${this.version} initialized`);
    console.log(`  Cities: ${this.params.cities.join(', ')}`);
    console.log(`  Min Edge: ${(this.params.minEdge * 100).toFixed(0)}%`);
    console.log(`  Entry Threshold: ${(this.params.entryThreshold * 100).toFixed(0)}%`);
    console.log(`  Max Position: $${this.params.maxPositionSize}`);
    console.log(`  Max Trades/Scan: ${this.params.maxTradesPerScan}`);
    console.log(`  Kalshi: ${this.kalshiBroker ? 'enabled' : 'not configured'}`);
  }

  async cleanup(): Promise<void> {
    console.log(`✓ ${this.name} cleaned up`);
  }

  // -------------------------------------------------------------------------
  // Signal generation — the core loop
  // -------------------------------------------------------------------------

  async generateSignals(): Promise<Signal[]> {
    const signals: Signal[] = [];

    try {
      // 1. Pre-fetch NOAA forecasts for all configured cities
      const forecasts = await this.fetchForecasts();

      // 2. Search Polymarket for weather markets
      const weatherMarkets = await this.findWeatherMarkets();

      if (weatherMarkets.length === 0) {
        console.log(`🌤 ${this.name}: No weather markets found`);
        return [];
      }

      // 3. Evaluate each Polymarket weather market
      for (const market of weatherMarkets) {
        const signal = await this.evaluateMarket(market, forecasts);
        if (signal) {
          signals.push(signal);
        }
      }

      // 3b. Evaluate Kalshi weather markets (if configured)
      if (this.kalshiBroker?.isConfigured()) {
        try {
          const kalshiMarkets = await this.kalshiBroker.searchWeatherMarkets();
          for (const km of kalshiMarkets) {
            const signal = await this.evaluateKalshiMarket(km, forecasts);
            if (signal) {
              signals.push(signal);
            }
          }
          if (kalshiMarkets.length > 0) {
            console.log(`  Kalshi: ${kalshiMarkets.length} weather markets found`);
          }
        } catch (err: any) {
          console.warn(`  ⚠ Kalshi weather scan failed: ${err.message}`);
        }
      }

      // 4. Check existing positions for exit signals
      const exitSignals = await this.checkExits();
      signals.push(...exitSignals);

      // 5. Sort by edge (strongest signal first) and cap
      signals.sort((a, b) => {
        const edgeA = (a.featuresJson as any)?.edge ?? a.confidence ?? 0;
        const edgeB = (b.featuresJson as any)?.edge ?? b.confidence ?? 0;
        return edgeB - edgeA;
      });

      const capped = signals.slice(0, this.params.maxTradesPerScan);

      console.log(`🌤 ${this.name}: ${weatherMarkets.length} weather markets → ${capped.length} signals`);
      return capped;
    } catch (error: any) {
      console.error(`${this.name} error: ${error.message}`);
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // Convert signal → order intent
  // -------------------------------------------------------------------------

  async signalToIntent(signal: Signal): Promise<any> {
    const features = signal.featuresJson as any;
    const isKalshi = features.broker === 'kalshi';
    const price = features.yesPrice ?? signal.price ?? 0.10;
    const qty = Math.floor(this.params.maxPositionSize / price);

    if (isKalshi) {
      // Kalshi order intent — prices in cents, count = number of contracts
      const priceCents = KalshiAdapter.probabilityToCents(price);
      const count = Math.max(1, Math.floor((this.params.maxPositionSize * 100) / priceCents));

      return {
        intentId: uuidv4(),
        signalId: signal.signalId,
        strategyId: this.id,
        symbol: signal.symbol,  // Kalshi ticker
        side: signal.side,
        qty: count,
        orderType: 'limit',
        limitPrice: priceCents,  // Cents for Kalshi
        timeInForce: 'day',
        signalPrice: price,
        broker: 'kalshi',
        metadata: {
          strategy: this.name,
          city: features.city,
          metric: features.metric,
          targetDate: features.targetDate,
          noaaProbability: features.noaaProbability,
          edge: features.edge,
          question: features.question,
          outcome: features.outcome || 'YES',
          confidence: signal.confidence,
          kalshiTicker: features.kalshiTicker,
          kalshiEventTicker: features.kalshiEventTicker,
          priceCents,
        },
      };
    }

    return {
      intentId: uuidv4(),
      signalId: signal.signalId,
      strategyId: this.id,
      symbol: signal.symbol,  // conditionId
      side: signal.side,
      qty,
      orderType: 'limit',
      limitPrice: price,
      timeInForce: 'day',
      signalPrice: price,
      broker: 'polymarket',
      metadata: {
        strategy: this.name,
        city: features.city,
        metric: features.metric,
        targetDate: features.targetDate,
        noaaProbability: features.noaaProbability,
        edge: features.edge,
        question: features.question,
        outcome: features.outcome || 'YES',
        confidence: signal.confidence,
        tokenId: features.tokenId,
      },
    };
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

  /**
   * Fetch NOAA forecasts for all configured cities.
   * Returns a map of citySlug → hourly forecast array.
   */
  private async fetchForecasts(): Promise<Map<string, any[]>> {
    const forecasts = new Map<string, any[]>();

    if (!this.weatherService) {
      // Weather service not loaded — return empty so we skip NOAA matching
      return forecasts;
    }

    for (const [slug, city] of this.cityMap) {
      try {
        const data = await this.weatherService.getHourlyForecast(city.lat, city.lon);
        forecasts.set(slug, data);
      } catch (err: any) {
        console.warn(`  ⚠ Failed to fetch forecast for ${city.name}: ${err.message}`);
      }
    }

    return forecasts;
  }

  /**
   * Search Polymarket for active weather markets.
   */
  private async findWeatherMarkets(): Promise<PolymarketMarket[]> {
    const weatherMarkets: PolymarketMarket[] = [];

    // Search with weather-related queries
    const queries = ['weather', 'temperature', 'rain', 'snow'];
    const seen = new Set<string>();

    for (const query of queries) {
      try {
        const markets = await this.broker.searchMarkets(query);
        for (const market of markets) {
          if (seen.has(market.conditionId)) continue;
          if (!market.active || market.closed) continue;
          if (!isWeatherMarket(market.question)) continue;
          if (market.liquidity < this.params.minLiquidity) continue;

          // Check time to resolution
          const hoursToClose = this.getHoursUntilClose(market.endDate);
          if (hoursToClose <= 0 || hoursToClose > this.params.maxHoursUntilResolution) continue;

          seen.add(market.conditionId);
          weatherMarkets.push(market);
        }
      } catch (err: any) {
        console.warn(`  ⚠ Market search "${query}" failed: ${err.message}`);
      }
    }

    return weatherMarkets;
  }

  /**
   * Evaluate a single weather market against NOAA data.
   */
  private async evaluateMarket(
    market: PolymarketMarket,
    forecasts: Map<string, any[]>,
  ): Promise<Signal | null> {
    const parsed = parseWeatherMarket(market.question);

    // Must have a city we can match to forecasts
    if (!parsed.citySlug || !this.cityMap.has(parsed.citySlug)) return null;

    // Must have a date
    if (!parsed.targetDate) return null;

    // Parser confidence gate
    if (parsed.confidence < 0.4) return null;

    const yesPrice = market.outcomePrices[0];

    // Calculate NOAA probability for this market's bucket/threshold
    const noaaProbability = this.calculateNOAAProbability(parsed, forecasts);
    if (noaaProbability === null) return null;

    // Edge = what NOAA says minus what market prices
    const edge = noaaProbability - yesPrice;

    // Only trade if edge exceeds minimum
    if (edge < this.params.minEdge) return null;

    // Only buy cheap YES tokens (high edge, low price)
    if (yesPrice >= this.params.entryThreshold + 0.30) return null;

    return {
      signalId: uuidv4(),
      strategyId: this.id,
      symbol: market.conditionId,
      side: 'buy',
      confidence: Math.min(parsed.confidence + (edge * 0.5), 1.0),
      signalTs: new Date(),
      reason: `Weather edge: NOAA ${(noaaProbability * 100).toFixed(1)}% vs market ${(yesPrice * 100).toFixed(1)}% (edge ${(edge * 100).toFixed(1)}%) — ${parsed.city} ${parsed.metric} ${parsed.targetDate}`,
      featuresJson: {
        question: market.question,
        city: parsed.city,
        citySlug: parsed.citySlug,
        metric: parsed.metric,
        targetDate: parsed.targetDate,
        bucketLow: parsed.bucketLow,
        bucketHigh: parsed.bucketHigh,
        threshold: parsed.threshold,
        direction: parsed.direction,
        unit: parsed.unit,
        noaaProbability,
        yesPrice,
        noPrice: market.outcomePrices[1],
        edge,
        liquidity: market.liquidity,
        volume: market.volume,
        parseConfidence: parsed.confidence,
        outcome: 'YES',
        tokenId: market.conditionId + '-YES',
      },
    } as any;
  }

  /**
   * Calculate probability from NOAA forecast data for a parsed market.
   * Returns 0-1 probability, or null if we can't compute.
   */
  private calculateNOAAProbability(
    parsed: ParsedWeatherMarket,
    forecasts: Map<string, any[]>,
  ): number | null {
    if (!parsed.citySlug || !parsed.targetDate) return null;

    const cityForecasts = forecasts.get(parsed.citySlug);
    if (!cityForecasts || cityForecasts.length === 0) return null;

    // Filter forecast hours matching the target date
    const targetDateStr = parsed.targetDate;
    const dayForecasts = cityForecasts.filter((f: any) => {
      const forecastDate = new Date(f.time);
      const fDateStr = forecastDate.toISOString().slice(0, 10);
      return fDateStr === targetDateStr;
    });

    if (dayForecasts.length === 0) return null;

    if (parsed.metric === 'high_temp' || parsed.metric === 'low_temp') {
      return this.calculateTempProbability(parsed, dayForecasts);
    }

    if (parsed.metric === 'precipitation' || parsed.metric === 'snow') {
      return this.calculatePrecipProbability(parsed, dayForecasts);
    }

    return null;
  }

  /**
   * Temperature probability — estimate from NOAA hourly forecast.
   *
   * NOAA point forecasts have some inherent uncertainty. We model
   * the forecast high/low with a Gaussian uncertainty of ~3°F stddev
   * to get a probability the actual reading falls in the bucket.
   */
  private calculateTempProbability(
    parsed: ParsedWeatherMarket,
    dayForecasts: any[],
  ): number | null {
    // Get forecast high or low for the day
    const temps: number[] = dayForecasts.map((f: any) => f.temperature);
    if (temps.length === 0) return null;

    const forecastValue = parsed.metric === 'high_temp'
      ? Math.max(...temps)
      : Math.min(...temps);

    // Gaussian uncertainty — NOAA point forecasts ±3°F stddev
    const stddev = 3.0;

    if (parsed.direction === 'between' && parsed.bucketLow !== null && parsed.bucketHigh !== null) {
      // P(bucketLow <= T <= bucketHigh)
      const zLow = (parsed.bucketLow - forecastValue) / stddev;
      const zHigh = (parsed.bucketHigh - forecastValue) / stddev;
      return normalCDF(zHigh) - normalCDF(zLow);
    }

    if (parsed.direction === 'above' && parsed.threshold !== null) {
      // P(T > threshold)
      const z = (parsed.threshold - forecastValue) / stddev;
      return 1 - normalCDF(z);
    }

    if (parsed.direction === 'below' && parsed.threshold !== null) {
      // P(T < threshold)
      const z = (parsed.threshold - forecastValue) / stddev;
      return normalCDF(z);
    }

    return null;
  }

  /**
   * Precipitation probability from NOAA data.
   */
  private calculatePrecipProbability(
    parsed: ParsedWeatherMarket,
    dayForecasts: any[],
  ): number | null {
    // NOAA provides precipitation probability per hour (0-100)
    const precipProbs: number[] = dayForecasts
      .map((f: any) => f.precipitation ?? 0)
      .filter((p: number) => p >= 0);

    if (precipProbs.length === 0) return null;

    // For "will it snow/rain" boolean questions, use max hourly probability
    if (parsed.threshold === 0 || parsed.threshold === null) {
      const maxProb = Math.max(...precipProbs) / 100;
      return maxProb;
    }

    // For "more than X inches" — harder to estimate from hourly probabilities.
    // Use average probability as rough proxy, discounted for higher thresholds.
    const avgProb = precipProbs.reduce((a, b) => a + b, 0) / precipProbs.length / 100;
    const thresholdDiscount = Math.max(0, 1 - (parsed.threshold ?? 0) * 0.5);
    return avgProb * thresholdDiscount;
  }

  /**
   * Evaluate a single Kalshi weather market against NOAA data.
   * Kalshi prices are in cents (1-99), converted to 0-1 for signal generation.
   */
  private async evaluateKalshiMarket(
    market: KalshiMarket,
    forecasts: Map<string, any[]>,
  ): Promise<Signal | null> {
    // Only evaluate open markets
    if (market.status !== 'open') return null;

    const parsed = parseWeatherMarket(market.title);

    // Must have a city we can match to forecasts
    if (!parsed.citySlug || !this.cityMap.has(parsed.citySlug)) return null;

    // Must have a date
    if (!parsed.targetDate) return null;

    // Parser confidence gate
    if (parsed.confidence < 0.4) return null;

    // Kalshi prices are in cents — convert to 0-1 probability
    const yesPrice = KalshiAdapter.centsToProbability(market.yes_ask || market.last_price || 50);

    // Check time to resolution
    const closeDate = new Date(market.close_time || market.expiration_time);
    const hoursToClose = (closeDate.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursToClose <= 0 || hoursToClose > this.params.maxHoursUntilResolution) return null;

    // Calculate NOAA probability for this market's bucket/threshold
    const noaaProbability = this.calculateNOAAProbability(parsed, forecasts);
    if (noaaProbability === null) return null;

    // Edge = what NOAA says minus what market prices
    const edge = noaaProbability - yesPrice;

    // Only trade if edge exceeds minimum
    if (edge < this.params.minEdge) return null;

    // Only buy cheap YES tokens (high edge, low price)
    if (yesPrice >= this.params.entryThreshold + 0.30) return null;

    return {
      signalId: uuidv4(),
      strategyId: this.id,
      symbol: market.ticker,  // Kalshi uses ticker as market identifier
      side: 'buy',
      confidence: Math.min(parsed.confidence + (edge * 0.5), 1.0),
      signalTs: new Date(),
      reason: `Kalshi weather edge: NOAA ${(noaaProbability * 100).toFixed(1)}% vs market ${(yesPrice * 100).toFixed(1)}% (edge ${(edge * 100).toFixed(1)}%) — ${parsed.city} ${parsed.metric} ${parsed.targetDate}`,
      featuresJson: {
        question: market.title,
        city: parsed.city,
        citySlug: parsed.citySlug,
        metric: parsed.metric,
        targetDate: parsed.targetDate,
        bucketLow: parsed.bucketLow,
        bucketHigh: parsed.bucketHigh,
        threshold: parsed.threshold,
        direction: parsed.direction,
        unit: parsed.unit,
        noaaProbability,
        yesPrice,
        noPrice: KalshiAdapter.centsToProbability(market.no_ask || (100 - (market.yes_ask || 50))),
        edge,
        volume: market.volume,
        openInterest: market.open_interest,
        parseConfidence: parsed.confidence,
        outcome: 'YES',
        broker: 'kalshi',
        kalshiTicker: market.ticker,
        kalshiEventTicker: market.event_ticker,
        kalshiYesBid: market.yes_bid,
        kalshiYesAsk: market.yes_ask,
        kalshiLastPrice: market.last_price,
      },
    } as any;
  }

  /**
   * Check existing positions for exit signals.
   */
  private async checkExits(): Promise<Signal[]> {
    const exits: Signal[] = [];

    try {
      const positions = await this.broker.getPositions();

      for (const pos of positions) {
        // Only manage positions from this strategy
        // (In a full system we'd tag positions with strategyId in the DB)

        if (!isWeatherMarket(pos.question || '')) continue;

        // Exit if price has risen to our exit threshold (take profit)
        if (pos.currentPrice >= this.params.exitThreshold) {
          exits.push({
            signalId: uuidv4(),
            strategyId: this.id,
            symbol: pos.conditionId,
            side: 'sell',
            confidence: 0.8,
            signalTs: new Date(),
            reason: `Take profit: price ${(pos.currentPrice * 100).toFixed(1)}% >= exit ${(this.params.exitThreshold * 100).toFixed(0)}%`,
            featuresJson: {
              question: pos.question,
              outcome: pos.outcome,
              currentPrice: pos.currentPrice,
              avgEntryPrice: pos.avgEntryPrice,
              unrealizedPnL: pos.unrealizedPnL,
              tokenId: pos.tokenId,
              exitReason: 'take_profit',
            },
          } as any);
          continue;
        }

        // Stop loss — exit if price dropped to stop-loss level
        if (pos.currentPrice <= this.params.stopLossThreshold) {
          exits.push({
            signalId: uuidv4(),
            strategyId: this.id,
            symbol: pos.conditionId,
            side: 'sell',
            confidence: 0.9,
            signalTs: new Date(),
            reason: `Stop loss: price ${(pos.currentPrice * 100).toFixed(1)}% <= stop ${(this.params.stopLossThreshold * 100).toFixed(0)}%`,
            featuresJson: {
              question: pos.question,
              outcome: pos.outcome,
              currentPrice: pos.currentPrice,
              avgEntryPrice: pos.avgEntryPrice,
              unrealizedPnL: pos.unrealizedPnL,
              tokenId: pos.tokenId,
              exitReason: 'stop_loss',
            },
          } as any);
        }
      }
    } catch (err: any) {
      console.warn(`  ⚠ Exit check failed: ${err.message}`);
    }

    return exits;
  }

  /**
   * Hours until market closes.
   */
  private getHoursUntilClose(endDate: Date): number {
    const now = new Date();
    const diff = new Date(endDate).getTime() - now.getTime();
    return diff / (1000 * 60 * 60);
  }
}

// ---------------------------------------------------------------------------
// Gaussian CDF approximation (Abramowitz & Stegun)
// ---------------------------------------------------------------------------

function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);

  return 0.5 * (1.0 + sign * y);
}

// ---------------------------------------------------------------------------
// Default config factory
// ---------------------------------------------------------------------------

export function createWeatherPolymarketConfig(): StrategyConfig {
  return {
    strategyId: 'weather-polymarket-v1',
    name: 'NOAA Weather × Polymarket',
    version: '1.0.0',
    enabled: true,
    params: {
      entryThreshold: 0.15,
      exitThreshold: 0.45,
      maxPositionSize: 2.00,
      maxTradesPerScan: 5,
      scanFrequencyMs: 120_000,
      cities: ['nyc', 'chicago', 'seattle', 'atlanta', 'dallas', 'miami'],
      minLiquidity: 100,
      minEdge: 0.20,
      maxHoursUntilResolution: 48,
      stopLossThreshold: 0.03,
    },
    symbols: [],  // Populated dynamically from market search
  };
}
