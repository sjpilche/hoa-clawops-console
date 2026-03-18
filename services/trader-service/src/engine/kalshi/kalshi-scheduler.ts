/**
 * Kalshi Auto-Trader Scheduler
 * Runs every 5 minutes:
 *   1. Check risk limits (daily loss, cash reserve)
 *   2. Discover liquid markets + record price snapshots
 *   3. Generate signals (momentum, orderbook, range buckets)
 *   4. Execute BUY signals (limit orders — cancel if no fill)
 *   5. Update prices + check exit conditions
 *   6. Execute SELL exits
 *   7. Reconcile with Kalshi account
 *   8. Log summary
 */

import { KalshiAdapter } from '../execution/broker/kalshi';
import { KalshiSignalGenerator } from './kalshi-signals';
import { KalshiPositionTracker } from './kalshi-position-tracker';
import type { BrainStore } from '../learning/brain-store';
import {
  KalshiAutoTraderConfig,
  KalshiSchedulerStatus,
  KalshiSignal,
  loadKalshiConfig,
} from './types';
import { OptionsEngine } from '../options/options-engine';

export class KalshiScheduler {
  private adapter: KalshiAdapter;
  private signals: KalshiSignalGenerator;
  private positions: KalshiPositionTracker;
  private brain: BrainStore | null;
  private config: KalshiAutoTraderConfig;
  private optionsEngine: OptionsEngine;

  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private scanLock = false;
  private scanCount = 0;
  private lastScan: Date | null = null;
  private lastBalanceCents = 0;
  private lastSignalCount = 0;

  constructor(
    adapter: KalshiAdapter,
    signals: KalshiSignalGenerator,
    positions: KalshiPositionTracker,
    brain?: BrainStore | null,
  ) {
    this.adapter = adapter;
    this.signals = signals;
    this.positions = positions;
    this.brain = brain || null;
    this.config = loadKalshiConfig();
    this.optionsEngine = new OptionsEngine();
  }

  /** Expose options engine for API routes */
  getOptionsEngine(): OptionsEngine {
    return this.optionsEngine;
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[KalshiBot] Already running');
      return;
    }

    this.isRunning = true;
    this.config = loadKalshiConfig(); // Reload in case env changed

    console.log('[KalshiBot] ====================================');
    console.log('[KalshiBot] Autonomous Trader Starting');
    console.log(`[KalshiBot]   Scan interval: ${this.config.scanIntervalMs / 1000}s`);
    console.log(`[KalshiBot]   Max position: $${(this.config.maxPositionCents / 100).toFixed(2)}`);
    console.log(`[KalshiBot]   Max exposure: $${(this.config.maxExposureCents / 100).toFixed(2)}`);
    console.log(`[KalshiBot]   Cash reserve: $${(this.config.cashReserveCents / 100).toFixed(2)}`);
    console.log(`[KalshiBot]   Daily loss limit: $${(this.config.maxDailyLossCents / 100).toFixed(2)}`);
    console.log(`[KalshiBot]   Take profit: ${(this.config.takeProfitPct * 100).toFixed(0)}%`);
    console.log(`[KalshiBot]   Stop loss: ${(this.config.stopLossPct * 100).toFixed(0)}%`);
    console.log(`[KalshiBot]   Target series: ${this.config.targetSeriesTickers.join(', ')}`);
    console.log('[KalshiBot] ====================================');

    // Connect to Kalshi
    try {
      await this.adapter.connect();
    } catch (err: any) {
      console.error('[KalshiBot] Failed to connect:', err.message);
      this.isRunning = false;
      return;
    }

    // Run first scan immediately
    this.scan().catch((err) => {
      console.error('[KalshiBot] Initial scan failed:', err.message);
    });

    // Schedule recurring scans
    this.intervalId = setInterval(async () => {
      try {
        await this.scan();
      } catch (err: any) {
        console.error('[KalshiBot] Scan error:', err.message);
      }
    }, this.config.scanIntervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('[KalshiBot] Stopped');
  }

  // ==========================================================================
  // MAIN SCAN LOOP
  // ==========================================================================

  private async scan(): Promise<void> {
    // Prevent overlapping scans
    if (this.scanLock) {
      console.log('[KalshiBot] Scan skipped — previous scan still running');
      return;
    }

    this.scanLock = true;
    this.scanCount++;
    const scanStart = Date.now();
    let buyCount = 0;
    let sellCount = 0;

    try {
      // ---- 0. PRE-FLIGHT: Daily loss limit ----
      const dailyPnl = this.positions.getDailyPnlCents();
      if (dailyPnl <= -this.config.maxDailyLossCents) {
        console.log(
          `[KalshiBot] DAILY LOSS LIMIT HIT: $${(Math.abs(dailyPnl) / 100).toFixed(2)} ` +
          `(limit: $${(this.config.maxDailyLossCents / 100).toFixed(2)}). No new trades today.`,
        );
        // Still check exits — we want to stop bleeding
        await this.processExits();
        return;
      }

      // ---- 1. BALANCE CHECK ----
      const balance = await this.adapter.getBalance();
      this.lastBalanceCents = balance.balance;
      const availableCents = balance.balance;

      if (availableCents < this.config.cashReserveCents) {
        console.log(
          `[KalshiBot] Cash reserve: $${(availableCents / 100).toFixed(2)} ` +
          `< $${(this.config.cashReserveCents / 100).toFixed(2)} reserve. Exits only.`,
        );
        await this.processExits();
        return;
      }

      // ---- 2. DISCOVER MARKETS ----
      const markets = await this.signals.discoverMarkets(this.adapter);
      for (const market of markets) {
        this.signals.recordSnapshot(market);
      }

      // ---- 3. GENERATE SIGNALS ----
      const allSignals = await this.signals.generateAllSignals(this.adapter);
      this.lastSignalCount = allSignals.length;

      // ---- 3b. BRAIN: Record scan observation ----
      const runId = `kalshi-scan-${this.scanCount}`;
      if (this.brain) {
        try {
          const buySignals_ = allSignals.filter(s => s.action === 'buy');
          const sellSignals_ = allSignals.filter(s => s.action === 'sell');
          const signalSummary = allSignals.map(s =>
            `${s.action.toUpperCase()} ${s.side} ${s.ticker} @ ${s.priceCents}¢ (${s.type}, str=${s.strength.toFixed(2)})`
          ).join('; ');

          this.brain.observe(runId, 'kalshi-bot', 'scan_result', [
            `Scan #${this.scanCount}: ${markets.length} markets, ${allSignals.length} signals`,
            `Buy signals: ${buySignals_.length}, Sell signals: ${sellSignals_.length}`,
            `Balance: $${(this.lastBalanceCents / 100).toFixed(2)}`,
            `Open positions: ${this.positions.getPositions().length}`,
            `Daily P&L: ${dailyPnl}¢`,
            signalSummary ? `Signals: ${signalSummary}` : 'No actionable signals',
          ].join('\n'), {
            scanCount: this.scanCount,
            marketCount: markets.length,
            signalCount: allSignals.length,
            balanceCents: this.lastBalanceCents,
            dailyPnlCents: dailyPnl,
          });
        } catch (err: any) {
          // Brain logging is non-fatal
        }
      }

      // ---- 3c. OPTIONS BRIDGE — leverage Kalshi signals into paper options ----
      if (allSignals.length > 0) {
        try {
          const optResults = await this.optionsEngine.runWithKalshiSignals(allSignals);
          if (optResults.length > 0) {
            console.log(`[KalshiBot] Options bridge: ${optResults.length} action(s)`);
          }
        } catch (err: any) {
          // Non-fatal — options bridge failure never stops Kalshi trading
        }
      }

      // ---- 4. EXECUTE BUY SIGNALS ----
      const buySignals = allSignals.filter((s) => s.action === 'buy');
      let openCount = this.positions.getPositions().length;
      let exposure = this.positions.getCurrentExposureCents();

      for (const signal of buySignals) {
        // Risk gate: max positions
        if (openCount >= this.config.maxOpenPositions) {
          console.log(`[KalshiBot] Max positions (${this.config.maxOpenPositions}) reached`);
          break;
        }

        // Risk gate: max exposure
        if (exposure + this.config.maxPositionCents > this.config.maxExposureCents) {
          console.log(`[KalshiBot] Max exposure ($${(this.config.maxExposureCents / 100).toFixed(2)}) would be exceeded`);
          break;
        }

        // Skip if already holding this ticker
        if (this.positions.hasPositionForTicker(signal.ticker)) continue;

        // Calculate contract count from position size
        if (signal.priceCents <= 0 || signal.priceCents >= 100) continue;
        const contracts = Math.floor(this.config.maxPositionCents / signal.priceCents);
        if (contracts <= 0) continue;

        // Check we can afford it
        const orderCost = contracts * signal.priceCents;
        if (orderCost > availableCents - this.config.cashReserveCents) continue;

        try {
          console.log(`[KalshiBot] Placing BUY: ${contracts}x ${signal.ticker} @ ${signal.priceCents}¢ (${signal.type})`);

          const order = await this.adapter.createOrder({
            ticker: signal.ticker,
            side: signal.side,
            type: 'limit',
            count: contracts,
            price: signal.priceCents,
            action: 'buy',
            client_order_id: signal.signalId,
          });

          // Check if it filled
          if (order.status === 'executed' || order.status === 'pending') {
            // Assume fill at our limit price
            const filled = contracts - (order.remaining_count || 0);
            if (filled > 0) {
              // Attach market data to signal for position tracker
              const market = this.signals.getTrackedMarkets().find((m: any) => m.ticker === signal.ticker);
              signal.features.market = market;

              this.positions.addPosition(signal, filled, signal.priceCents);
              openCount++;
              exposure += filled * signal.priceCents;
              buyCount++;

              // Brain: record entry observation
              if (this.brain) {
                try {
                  this.brain.observe(runId, 'kalshi-bot', 'trade_entry', [
                    `BUY ${filled}x ${signal.side} ${signal.ticker} @ ${signal.priceCents}¢`,
                    `Signal: ${signal.type} (strength: ${signal.strength.toFixed(2)})`,
                    `Reason: ${signal.reason}`,
                    `Cost: $${(filled * signal.priceCents / 100).toFixed(2)}`,
                  ].join('\n'), {
                    ticker: signal.ticker,
                    side: signal.side,
                    signalType: signal.type,
                    strength: signal.strength,
                    priceCents: signal.priceCents,
                    contracts: filled,
                  });
                } catch (_) {}
              }
            }
          } else if (order.status === 'resting') {
            // Didn't fill immediately — cancel to avoid stale resting orders
            console.log(`[KalshiBot] Order for ${signal.ticker} resting (no fill) — cancelling`);
            try {
              await this.adapter.cancelOrder(order.order_id);
            } catch (_) {
              // May have filled between check and cancel — that's fine
            }
          }
        } catch (err: any) {
          console.warn(`[KalshiBot] BUY failed for ${signal.ticker}:`, err.message);
        }
      }

      // ---- 5 & 6. EXITS ----
      sellCount = await this.processExits();

      // ---- 7. RECONCILE ----
      await this.reconcilePositions();

      // ---- 8. SUMMARY ----
      this.lastScan = new Date();
      const elapsed = Date.now() - scanStart;
      const perf = this.positions.getPerformance();

      console.log(
        `[KalshiBot] Scan #${this.scanCount}: ` +
        `${allSignals.length} signals, ${buyCount} buys, ${sellCount} sells | ` +
        `${perf.openPositions} open, ` +
        `P&L: $${(perf.totalPnlCents / 100).toFixed(2)} ` +
        `(${perf.tradesCompleted} closed, ${perf.winRate.toFixed(0)}% win) | ` +
        `Balance: $${(this.lastBalanceCents / 100).toFixed(2)} | ` +
        `${elapsed}ms`,
      );
    } catch (err: any) {
      console.error(`[KalshiBot] Scan #${this.scanCount} FAILED:`, err.message);
    } finally {
      this.scanLock = false;
    }
  }

  // ==========================================================================
  // EXIT PROCESSING
  // ==========================================================================

  private async processExits(): Promise<number> {
    let sellCount = 0;

    // Update prices first
    await this.positions.updatePrices(this.adapter);

    // Check exit conditions
    const exits = this.positions.checkExits(this.config);

    for (const pos of exits) {
      try {
        // For settled markets, just close tracking — no sell order needed
        if (pos.exitReason === 'settled' || pos.hoursUntilExpiration <= 0) {
          const closedTrade = this.positions.removePosition(pos.id, pos.exitReason);
          this.recordTradeEpisode(pos, closedTrade);
          sellCount++;
          continue;
        }

        // Place sell order
        console.log(`[KalshiBot] Placing SELL: ${pos.contracts}x ${pos.ticker} @ ${pos.currentPriceCents}¢ (${pos.exitReason})`);

        const order = await this.adapter.createOrder({
          ticker: pos.ticker,
          side: pos.side,
          type: 'limit',
          count: pos.contracts,
          price: pos.currentPriceCents,
          action: 'sell',
        });

        if (order.status === 'executed' || order.status === 'pending') {
          const closedTrade = this.positions.removePosition(pos.id, pos.exitReason);
          this.recordTradeEpisode(pos, closedTrade);
          sellCount++;
        } else if (order.status === 'resting') {
          // Sell didn't fill — try at 1 cent lower to ensure exit
          try {
            await this.adapter.cancelOrder(order.order_id);
            const aggressivePrice = Math.max(1, pos.currentPriceCents - 1);
            const retry = await this.adapter.createOrder({
              ticker: pos.ticker,
              side: pos.side,
              type: 'limit',
              count: pos.contracts,
              price: aggressivePrice,
              action: 'sell',
            });
            if (retry.status !== 'resting') {
              const closedTrade = this.positions.removePosition(pos.id, pos.exitReason);
              this.recordTradeEpisode(pos, closedTrade);
              sellCount++;
            } else {
              // Still resting — cancel and leave position open for next scan
              await this.adapter.cancelOrder(retry.order_id);
            }
          } catch (_) {
            // Best effort
          }
        }
      } catch (err: any) {
        console.warn(`[KalshiBot] SELL failed for ${pos.ticker}:`, err.message);
      }
    }

    return sellCount;
  }

  // ==========================================================================
  // RECONCILIATION
  // ==========================================================================

  /**
   * Cross-reference our tracked positions with Kalshi's actual positions.
   * Close tracked positions for markets that have settled.
   */
  private async reconcilePositions(): Promise<void> {
    try {
      const kalshiPositions = await this.adapter.getPositions();
      const kalshiTickers = new Set(kalshiPositions.map((p) => p.ticker || p.market_ticker));

      for (const pos of this.positions.getPositions()) {
        // If Kalshi no longer shows this position and market has expired, it settled
        if (!kalshiTickers.has(pos.ticker) && pos.hoursUntilExpiration <= 0) {
          console.log(`[KalshiBot] Reconcile: ${pos.ticker} no longer on Kalshi — marking as settled`);
          const closedTrade = this.positions.removePosition(pos.id, 'settled');
          this.recordTradeEpisode(pos, closedTrade);
        }
      }
    } catch (err: any) {
      // Non-fatal — reconciliation is a safety net
    }
  }

  // ==========================================================================
  // BRAIN LEARNING
  // ==========================================================================

  /**
   * Record a completed trade as a Brain episode.
   * This is how the system learns which signal types, markets, and conditions lead to wins/losses.
   */
  private recordTradeEpisode(pos: any, closedTrade: any): void {
    if (!this.brain || !closedTrade) return;

    try {
      const pnlDollars = closedTrade.pnlCents / 100;
      const holdMs = new Date(closedTrade.exitTime).getTime() - new Date(closedTrade.entryTime).getTime();
      const holdDays = holdMs / 86400000;

      // Determine outcome type
      let outcomeType = 'flat';
      if (closedTrade.exitReason === 'take_profit') outcomeType = 'target_hit';
      else if (closedTrade.exitReason === 'stop_loss') outcomeType = 'stop_hit';
      else if (closedTrade.exitReason === 'stale_position') outcomeType = 'time_exit';
      else if (closedTrade.exitReason === 'settled') outcomeType = closedTrade.pnlCents > 0 ? 'profit' : 'loss';
      else if (closedTrade.pnlCents > 0) outcomeType = 'profit';
      else if (closedTrade.pnlCents < 0) outcomeType = 'loss';

      // Score: -1 to +1 scaled by return
      const outcomeScore = Math.max(-1, Math.min(1, closedTrade.returnPct));

      this.brain.recordEpisode({
        analystId: 'kalshi-bot',
        symbol: closedTrade.ticker,
        side: closedTrade.side,
        conviction: 0.7,
        opportunityType: `kalshi_${closedTrade.signalType}`,
        entryPrice: closedTrade.entryPriceCents / 100,
        exitPrice: closedTrade.exitPriceCents / 100,
        pnlDollars,
        pnlPercent: closedTrade.returnPct * 100,
        holdDays: Math.max(0.01, holdDays),
        outcomeType,
        outcomeScore,
        thesis: `Signal: ${closedTrade.signalType} | Exit: ${closedTrade.exitReason}`,
        marketContext: `Kalshi prediction market | ${closedTrade.contracts} contracts`,
        runId: `kalshi-scan-${this.scanCount}`,
      });

      // Also record feedback for the signal type
      this.brain.recordFeedback(
        'kalshi-bot',
        `signal_${closedTrade.signalType}`,
        closedTrade.pnlCents > 0 ? 'profitable' : closedTrade.pnlCents < 0 ? 'loss' : 'flat',
        {
          symbol: closedTrade.ticker,
          notes: `${closedTrade.exitReason}: ${pnlDollars >= 0 ? '+' : ''}$${pnlDollars.toFixed(2)} (${(closedTrade.returnPct * 100).toFixed(1)}%)`,
          metadata: {
            signalType: closedTrade.signalType,
            exitReason: closedTrade.exitReason,
            pnlCents: closedTrade.pnlCents,
            holdDays,
          },
        },
      );

      console.log(`[KalshiBot] Brain: recorded episode for ${closedTrade.ticker} — ${outcomeType} ($${pnlDollars.toFixed(2)})`);
    } catch (err: any) {
      // Brain recording is non-fatal
      console.warn('[KalshiBot] Brain episode recording failed (non-fatal):', err.message);
    }
  }

  // ==========================================================================
  // STATUS & ACCESSORS
  // ==========================================================================

  getStatus(): KalshiSchedulerStatus {
    const perf = this.positions.getPerformance();
    return {
      running: this.isRunning,
      scanCount: this.scanCount,
      lastScan: this.lastScan,
      nextScan: this.lastScan && this.isRunning
        ? new Date(this.lastScan.getTime() + this.config.scanIntervalMs)
        : null,
      openPositions: perf.openPositions,
      totalPnlCents: perf.totalPnlCents,
      balanceCents: this.lastBalanceCents,
      dailyPnlCents: this.positions.getDailyPnlCents(),
      signalsLastScan: this.lastSignalCount,
    };
  }

  getPositionTracker(): KalshiPositionTracker {
    return this.positions;
  }

  getSignalGenerator(): KalshiSignalGenerator {
    return this.signals;
  }

  getConfig(): KalshiAutoTraderConfig {
    return this.config;
  }

  isActive(): boolean {
    return this.isRunning;
  }
}
