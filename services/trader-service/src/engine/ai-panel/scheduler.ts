// =============================================================================
// Trading Scheduler — 3-minute loop with run lock
// =============================================================================
// Replaces cron-based child-process spawner with inline PanelRunner execution.
//
// Features:
//   - 3-minute interval (configurable via PANEL_INTERVAL_MS)
//   - Boolean run lock (Node.js is single-threaded, no mutex needed)
//   - Market hours guard (9:30 AM - 4:00 PM ET, Mon-Fri)
//   - triggerNow() for event-driven runs (skip interval wait)
//   - Daily distillation at 4:15 PM ET
//
// Usage:
//   const scheduler = new TradingScheduler(panelRunner, distillation);
//   scheduler.start();
// =============================================================================

import { PanelRunner, PanelRunOptions, PanelRunResult } from './panel-runner';
import { DistillationEngine } from '../learning/distillation';
import { DistillationV2Engine } from '../learning/distillation-v2';
import { OptionsEngine } from '../options/options-engine';

// ---------------------------------------------------------------------------
// Timezone helper — ET extraction without toLocaleString parse bug
// ---------------------------------------------------------------------------

/**
 * Returns Eastern Time components derived via Intl.DateTimeFormat.
 * Safe on any host timezone (avoids `new Date(toLocaleString(...))` which
 * parses the locale string in the *host* timezone, not ET).
 */
function getEasternTime(): { day: number; hours: number; minutes: number; timeInMinutes: number; dateKey: string } {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]));
  const hours = parseInt(parts.hour, 10) % 24;  // Intl may return "24" for midnight
  const minutes = parseInt(parts.minute, 10);
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = dayMap[parts.weekday] ?? new Date().getDay();
  const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
  return { day, hours, minutes, timeInMinutes: hours * 60 + minutes, dateKey };
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_INTERVAL_MS = 180_000;  // 3 minutes
const DISTILLATION_HOUR = 16;         // 4 PM ET
const DISTILLATION_MINUTE = 15;       // 4:15 PM ET

// ---------------------------------------------------------------------------
// TradingScheduler
// ---------------------------------------------------------------------------

export class TradingScheduler {
  private panelRunner: PanelRunner;
  private distillation: DistillationEngine | null;
  private optionsEngine: OptionsEngine | null;
  private intervalMs: number;
  private dryRun: boolean;

  // Run lock
  private runLock: boolean = false;
  private lastRunStarted: Date | null = null;
  private lastRunResult: PanelRunResult | null = null;

  // Timers
  private panelTimer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  // Stats
  private totalRuns: number = 0;
  private totalErrors: number = 0;
  private startedAt: Date | null = null;

  // Distillation tracking
  private lastDistillationDate: string | null = null;

  constructor(
    panelRunner: PanelRunner,
    distillation?: DistillationEngine | null,
    intervalMs?: number,
  ) {
    this.panelRunner = panelRunner;
    this.distillation = distillation || null;
    this.optionsEngine = process.env.OPTIONS_ENABLED !== 'false' ? new OptionsEngine() : null;
    this.intervalMs = intervalMs || parseInt(process.env.PANEL_INTERVAL_MS || '') || DEFAULT_INTERVAL_MS;
    this.dryRun = process.env.PANEL_DRY_RUN === 'true';
  }

  // -------------------------------------------------------------------------
  // Start / Stop
  // -------------------------------------------------------------------------

  start(): void {
    if (this.isRunning) {
      console.log('⚠️  Scheduler already running');
      return;
    }

    this.isRunning = true;
    this.startedAt = new Date();

    console.log(`\n${'🦞'.repeat(20)}`);
    console.log(`🦞 Trading Scheduler Started`);
    console.log(`🦞 Interval: ${this.intervalMs / 1000}s (${(this.intervalMs / 60000).toFixed(1)} min)`);
    console.log(`🦞 Dry Run: ${this.dryRun}`);
    console.log(`🦞 Distillation: ${this.distillation ? 'enabled (4:15 PM ET)' : 'disabled'}`);
    console.log(`🦞 Options: ${this.optionsEngine ? 'enabled (VIX calls + CSPs + TOM calls)' : 'disabled'}`);
    console.log(`🦞 Market hours: 9:30 AM - 4:00 PM ET, Mon-Fri`);
    console.log(`${'🦞'.repeat(20)}\n`);

    // Run immediately on start (if market hours)
    this.tick();

    // Then set interval
    this.panelTimer = setInterval(() => this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.panelTimer) {
      clearInterval(this.panelTimer);
      this.panelTimer = null;
    }
    this.isRunning = false;
    console.log(`🛑 Scheduler stopped. Total runs: ${this.totalRuns}, errors: ${this.totalErrors}`);
  }

  // -------------------------------------------------------------------------
  // Trigger now (skip interval wait)
  // -------------------------------------------------------------------------

  /**
   * Trigger an immediate panel run, bypassing the interval.
   * Useful for event-driven runs (e.g., major news alert).
   */
  async triggerNow(reason?: string, options?: PanelRunOptions): Promise<PanelRunResult | null> {
    console.log(`⚡ Manual trigger: ${reason || 'user request'}`);
    return this.executeRun(options);
  }

  // -------------------------------------------------------------------------
  // Main tick
  // -------------------------------------------------------------------------

  private async tick(): Promise<void> {
    // Check market hours
    if (!this.isMarketHours()) {
      // Check for distillation time (4:15 PM ET)
      this.checkDistillation();
      return;
    }

    await this.executeRun();
  }

  private async executeRun(options?: PanelRunOptions): Promise<PanelRunResult | null> {
    // Run lock check
    if (this.runLock) {
      const elapsed = this.lastRunStarted
        ? ((Date.now() - this.lastRunStarted.getTime()) / 1000).toFixed(0)
        : '?';
      console.log(`🔒 Run lock active (running for ${elapsed}s) — skipping tick`);
      return null;
    }

    // Acquire lock
    this.runLock = true;
    this.lastRunStarted = new Date();
    this.totalRuns++;

    try {
      const result = await this.panelRunner.run({
        dryRun: this.dryRun,
        ...options,
      });

      this.lastRunResult = result;

      if (result.error) {
        this.totalErrors++;
        console.error(`❌ Panel run #${this.totalRuns} failed: ${result.error}`);
      } else {
        console.log(`✅ Panel run #${this.totalRuns} complete: ${result.trades.length} trade(s), executed=${result.executed}`);
      }

      // Run options strategies after equity panel
      if (this.optionsEngine && !this.dryRun) {
        try {
          await this.optionsEngine.run();
        } catch (err: any) {
          console.error(`⚠️ Options engine error (non-fatal): ${err.message}`);
        }
      }

      return result;
    } catch (err: any) {
      this.totalErrors++;
      console.error(`❌ Panel run #${this.totalRuns} threw: ${err.message}`);
      return null;
    } finally {
      this.runLock = false;
    }
  }

  // -------------------------------------------------------------------------
  // Market hours check
  // -------------------------------------------------------------------------

  /**
   * Check if current time is within market hours.
   * 9:30 AM - 4:00 PM ET, Monday through Friday.
   */
  private isMarketHours(): boolean {
    // Allow override for testing
    if (process.env.FORCE_MARKET_HOURS === 'true') return true;

    const { day, timeInMinutes } = getEasternTime();

    // Monday (1) through Friday (5)
    if (day < 1 || day > 5) return false;

    // 9:30 AM (570 min) to 4:00 PM (960 min)
    if (timeInMinutes < 570 || timeInMinutes >= 960) return false;

    return true;
  }

  // -------------------------------------------------------------------------
  // Distillation (daily after market close)
  // -------------------------------------------------------------------------

  private checkDistillation(): void {
    if (!this.distillation) return;

    const { day, hours, minutes, dateKey } = getEasternTime();

    if (day < 1 || day > 5) return;  // Weekdays only

    if (this.lastDistillationDate === dateKey) return;  // Already ran today

    if (hours === DISTILLATION_HOUR && minutes >= DISTILLATION_MINUTE && minutes < DISTILLATION_MINUTE + 30) {
      console.log('🧪 Running daily distillation (4:15 PM ET)...');
      this.lastDistillationDate = dateKey;

      try {
        // Use V2 distillation if available (source profiles + calibration + attribution)
        if (this.distillation instanceof DistillationV2Engine) {
          const result = this.distillation.runDistillationV2();
          console.log(`🧪 Distillation V2: ${result.promoted} promoted, ${result.avoidPatterns} avoid, ${result.profilesUpdated} profiles, ${result.calibrationReports} calibrations`);
        } else {
          const result = this.distillation.runDistillation();
          console.log(`🧪 Distillation: ${result.promoted} promoted, ${result.avoidPatterns} avoid patterns`);
        }
      } catch (err: any) {
        console.error('🧪 Distillation error:', err.message);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Status
  // -------------------------------------------------------------------------

  getStatus(): {
    running: boolean;
    locked: boolean;
    totalRuns: number;
    totalErrors: number;
    intervalMs: number;
    dryRun: boolean;
    startedAt: Date | null;
    lastRunStarted: Date | null;
    marketHours: boolean;
  } {
    return {
      running: this.isRunning,
      locked: this.runLock,
      totalRuns: this.totalRuns,
      totalErrors: this.totalErrors,
      intervalMs: this.intervalMs,
      dryRun: this.dryRun,
      startedAt: this.startedAt,
      lastRunStarted: this.lastRunStarted,
      marketHours: this.isMarketHours(),
    };
  }
}
