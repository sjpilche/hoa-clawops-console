import { WeatherPositionTracker } from './position-tracker';
import { WeatherStrategyConfig } from './types';

// Strategy is being built by another agent — import from expected path
import type { WeatherPolymarketStrategy } from '../strategy/strategies/weather_polymarket';

interface WeatherSchedulerStatus {
  running: boolean;
  scanCount: number;
  lastScan: Date | null;
  openPositions: number;
  totalPnl: number;
}

export class WeatherScheduler {
  private strategy: WeatherPolymarketStrategy;
  private positionTracker: WeatherPositionTracker;
  private intervalId: NodeJS.Timeout | null;
  private isRunning: boolean;
  private scanCount: number;
  private lastScan: Date | null;
  private scanIntervalMs: number;

  constructor(strategy: WeatherPolymarketStrategy) {
    this.strategy = strategy;
    this.positionTracker = new WeatherPositionTracker();
    this.intervalId = null;
    this.isRunning = false;
    this.scanCount = 0;
    this.lastScan = null;
    this.scanIntervalMs = parseInt(process.env.WEATHER_SCAN_INTERVAL_MS || '120000', 10);
  }

  /**
   * Start the weather scan loop
   */
  start(): void {
    if (this.isRunning) {
      console.log('[WeatherBot] Scanner already running');
      return;
    }

    this.isRunning = true;
    const cities = (process.env.WEATHER_CITIES || 'nyc,chicago,seattle,atlanta,dallas,miami').split(',');
    console.log(`[WeatherBot] Scanner started — scanning every ${this.scanIntervalMs}ms across ${cities.length} cities`);

    // Run immediately, then on interval
    this.scan().catch((err) => {
      console.error('[WeatherBot] Initial scan failed:', err.message);
    });

    this.intervalId = setInterval(async () => {
      try {
        await this.scan();
      } catch (err: any) {
        console.error('[WeatherBot] Scan error:', err.message);
      }
    }, this.scanIntervalMs);
  }

  /**
   * Stop the weather scanner
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('[WeatherBot] Scanner stopped');
  }

  /**
   * Execute a single scan cycle:
   * 1. Generate signals from strategy
   * 2. Execute BUY signals through broker
   * 3. Check and execute exits
   * 4. Log summary
   */
  private async scan(): Promise<void> {
    this.scanCount++;
    const scanStart = Date.now();
    let buyCount = 0;
    let sellCount = 0;

    try {
      // 1. Generate signals from the weather strategy
      const signals = await this.strategy.generateSignals();

      // 2. Process BUY signals
      const maxTrades = parseInt(process.env.WEATHER_MAX_TRADES_PER_SCAN || '5', 10);
      const maxPositionUsd = parseFloat(process.env.WEATHER_MAX_POSITION_USD || '2.00');
      const maxExposure = parseFloat(process.env.WEATHER_MAX_EXPOSURE_USD || '50');

      // Check total exposure before buying
      const currentExposure = this.positionTracker.getPositions()
        .reduce((sum, p) => sum + p.costBasis, 0);

      for (const signal of signals) {
        if (buyCount >= maxTrades) break;
        if (currentExposure + maxPositionUsd > maxExposure) {
          console.log(`[WeatherBot] Max exposure ($${maxExposure}) reached — skipping remaining signals`);
          break;
        }

        // Only process BUY signals (strategy determines direction)
        if (signal.side !== 'buy') continue;

        // Check if we already have a position in this market
        const existing = this.positionTracker.getPositions()
          .find((p) => p.marketId === signal.marketId);
        if (existing) continue;

        try {
          // Execute through broker
          const quantity = Math.floor(maxPositionUsd / signal.marketPrice);
          if (quantity <= 0) continue;

          const broker = (this.strategy as any).broker;
          if (broker?.placeOrder) {
            const order = await broker.placeOrder({
              marketId: signal.marketId,
              side: 'buy',
              price: signal.marketPrice,
              size: quantity,
            });

            if (order?.success !== false) {
              // Track the position
              this.positionTracker.addPosition(
                signal,
                signal.marketPrice,
                quantity,
                signal.tokenId || signal.marketId,
              );
              buyCount++;
            }
          } else {
            // No broker available — track as simulated position
            this.positionTracker.addPosition(
              signal,
              signal.marketPrice,
              quantity,
              signal.tokenId || signal.marketId,
            );
            buyCount++;
          }
        } catch (err: any) {
          console.warn(`[WeatherBot] Failed to execute buy for ${signal.city}:`, err.message);
        }
      }

      // 3. Update prices and check exits
      const broker = (this.strategy as any).broker;
      if (broker) {
        await this.positionTracker.updatePrices(broker);
      }

      // Build strategy config from env for exit checks
      const exitConfig: WeatherStrategyConfig = {
        entryThreshold: parseFloat(process.env.WEATHER_ENTRY_THRESHOLD || '0.15'),
        exitThreshold: parseFloat(process.env.WEATHER_EXIT_THRESHOLD || '0.45'),
        maxPositionSize: maxPositionUsd,
        maxTradesPerScan: maxTrades,
        scanFrequencyMs: this.scanIntervalMs,
        cities: (process.env.WEATHER_CITIES || 'nyc,chicago,seattle,atlanta,dallas,miami').split(','),
        minLiquidity: parseFloat(process.env.WEATHER_MIN_LIQUIDITY || '100'),
        minEdge: parseFloat(process.env.WEATHER_MIN_EDGE || '0.20'),
        maxHoursUntilResolution: 48,
        stopLossThreshold: parseFloat(process.env.WEATHER_STOP_LOSS || '0.03'),
      };

      const exits = this.positionTracker.checkExits(exitConfig);

      // 4. Execute sells for exit positions
      for (const pos of exits) {
        try {
          if (broker?.placeOrder) {
            await broker.placeOrder({
              marketId: pos.marketId,
              side: 'sell',
              price: pos.currentPrice,
              size: pos.quantity,
            });
          }
          this.positionTracker.removePosition(pos.id);
          sellCount++;
        } catch (err: any) {
          console.warn(`[WeatherBot] Failed to execute sell for ${pos.city}:`, err.message);
        }
      }

      this.lastScan = new Date();
      const elapsed = Date.now() - scanStart;
      const openCount = this.positionTracker.getPositions().length;
      const perf = this.positionTracker.getPerformance();

      console.log(
        `[WeatherBot] Scan #${this.scanCount}: ${signals.length} signals, ` +
        `${buyCount} buys, ${sellCount} sells, ${openCount} open positions ` +
        `(P&L: $${perf.totalPnl.toFixed(2)}) [${elapsed}ms]`
      );
    } catch (err: any) {
      console.error(`[WeatherBot] Scan #${this.scanCount} failed:`, err.message);
    }
  }

  /**
   * Get current scheduler status
   */
  getStatus(): WeatherSchedulerStatus {
    const perf = this.positionTracker.getPerformance();
    return {
      running: this.isRunning,
      scanCount: this.scanCount,
      lastScan: this.lastScan,
      openPositions: perf.openPositions,
      totalPnl: perf.totalPnl,
    };
  }

  /**
   * Get the position tracker (for API routes)
   */
  getPositionTracker(): WeatherPositionTracker {
    return this.positionTracker;
  }

  /**
   * Get the strategy instance (for API routes)
   */
  getStrategy(): WeatherPolymarketStrategy {
    return this.strategy;
  }
}
