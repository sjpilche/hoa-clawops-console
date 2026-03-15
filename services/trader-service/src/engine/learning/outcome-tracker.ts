// =============================================================================
// Outcome Tracker — Bridge between execution events and brain episodes
// =============================================================================
// Maps fills, position closes, and daily P&L to brain learning layers.
// This is THE feedback loop that makes the trader learn from its decisions.
//
// Events:
//   registerPicks(runId, reports, trades)   → tracks who recommended what
//   onFill(fill)                            → Layer 1 observation, updates entry price
//   onPositionClose(symbol, exitPrice, reason) → Layer 2 feedback + Layer 3 episode
//   onDailyPnL(positions)                   → Layer 1 interim observations
// =============================================================================

import { BrainStore, TradeEpisode, FeedbackSignal } from './brain-store';
import { AnalystReport, AnalystPick, RebalanceTrade } from '../ai-panel/index';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrackedPick {
  runId: string;
  analystId: string;
  analystName: string;
  symbol: string;
  side: 'buy' | 'sell';
  conviction: number;
  opportunityType: string;
  thesis: string;
  targetPrice?: number;
  stopLoss?: number;
  entryPrice?: number;          // Filled in when fill arrives
  entryTimestamp?: Date;
  fillId?: string;
}

export interface PositionCloseEvent {
  symbol: string;
  exitPrice: number;
  exitTimestamp: Date;
  reason: 'target_hit' | 'stop_hit' | 'time_exit' | 'manual' | 'rebalance';
}

// ---------------------------------------------------------------------------
// OutcomeTracker
// ---------------------------------------------------------------------------

export class OutcomeTracker {
  private brain: BrainStore;
  private trackedPicks: Map<string, TrackedPick[]>;  // symbol → picks from analysts

  constructor(brain: BrainStore) {
    this.brain = brain;
    this.trackedPicks = new Map();
    console.log('📊 Outcome Tracker: Initialized');
  }

  // -------------------------------------------------------------------------
  // Step 1: Register picks from panel run
  // -------------------------------------------------------------------------

  /**
   * After panel run, register which analysts recommended which trades.
   * Called immediately after aggregation, before execution.
   */
  registerPicks(runId: string, reports: AnalystReport[], trades: RebalanceTrade[]): void {
    const tradeSymbols = new Set(trades.map(t => t.symbol));

    for (const report of reports) {
      for (const pick of report.picks) {
        // Only track picks that resulted in actual trades
        if (!tradeSymbols.has(pick.symbol)) continue;

        const tracked: TrackedPick = {
          runId,
          analystId: report.analystId,
          analystName: report.analystName,
          symbol: pick.symbol,
          side: pick.side,
          conviction: pick.conviction,
          opportunityType: pick.opportunityType,
          thesis: pick.thesis,
          targetPrice: pick.targetPrice,
          stopLoss: pick.stopLoss,
        };

        const existing = this.trackedPicks.get(pick.symbol) || [];
        existing.push(tracked);
        this.trackedPicks.set(pick.symbol, existing);

        // Layer 1: record that this analyst made this pick
        this.brain.observe(runId, report.analystId, 'pick_registered',
          `${pick.side.toUpperCase()} ${pick.symbol} conviction=${pick.conviction} type=${pick.opportunityType}`,
          { symbol: pick.symbol, conviction: pick.conviction, thesis: pick.thesis }
        );
      }
    }

    console.log(`📊 Outcome Tracker: Registered ${this.trackedPicks.size} symbols from ${reports.length} analyst(s)`);
  }

  // -------------------------------------------------------------------------
  // Step 2: On fill — record entry
  // -------------------------------------------------------------------------

  /**
   * Called when a trade fill is confirmed from the broker.
   * Updates tracked picks with actual entry price.
   */
  onFill(fill: { symbol: string; side: string; price: number; qty: number; fillId?: string }): void {
    const picks = this.trackedPicks.get(fill.symbol);
    if (!picks || picks.length === 0) {
      console.log(`📊 Outcome Tracker: Fill for ${fill.symbol} — no tracked picks (external trade?)`);
      return;
    }

    // Update all tracked picks for this symbol with entry info
    for (const pick of picks) {
      if (!pick.entryPrice) {
        pick.entryPrice = fill.price;
        pick.entryTimestamp = new Date();
        pick.fillId = fill.fillId;

        // Layer 1: record the fill
        this.brain.observe(pick.runId, pick.analystId, 'fill_confirmed',
          `${fill.side.toUpperCase()} ${fill.qty} ${fill.symbol} @ $${fill.price.toFixed(2)} filled`,
          { symbol: fill.symbol, price: fill.price, qty: fill.qty }
        );
      }
    }

    console.log(`📊 Outcome Tracker: Fill recorded for ${fill.symbol} @ $${fill.price.toFixed(2)}`);
  }

  // -------------------------------------------------------------------------
  // Step 3: On position close — THE MAIN LEARNING EVENT
  // -------------------------------------------------------------------------

  /**
   * Called when a position is fully closed. This is where the brain learns.
   * Calculates P&L, scores the outcome, records episode + feedback.
   */
  onPositionClose(event: PositionCloseEvent): void {
    const picks = this.trackedPicks.get(event.symbol);
    if (!picks || picks.length === 0) {
      console.log(`📊 Outcome Tracker: Close for ${event.symbol} — no tracked picks`);
      return;
    }

    // Calculate total conviction weight for proportional credit/blame
    const totalConviction = picks
      .filter(p => p.entryPrice)
      .reduce((sum, p) => sum + p.conviction, 0) || 1;

    for (const pick of picks) {
      if (!pick.entryPrice) continue;  // Never filled

      // Calculate P&L
      const pnlPercent = pick.side === 'buy'
        ? ((event.exitPrice - pick.entryPrice) / pick.entryPrice) * 100
        : ((pick.entryPrice - event.exitPrice) / pick.entryPrice) * 100;

      const holdDays = pick.entryTimestamp
        ? Math.ceil((event.exitTimestamp.getTime() - pick.entryTimestamp.getTime()) / (1000 * 60 * 60 * 24))
        : undefined;

      // Score the outcome (-1.0 to 1.0), weighted by this analyst's conviction share
      const convictionWeight = pick.conviction / totalConviction;
      const outcomeScore = this.scoreOutcome(pnlPercent, event.reason) * convictionWeight;

      // Determine outcome type
      const outcomeType = event.reason === 'stop_hit' ? 'stop_hit'
        : event.reason === 'target_hit' ? 'target_hit'
        : event.reason === 'time_exit' ? 'time_exit'
        : pnlPercent > 0 ? 'profit' : 'loss';

      // Layer 3: Record full episode
      const episode: TradeEpisode = {
        analystId: pick.analystId,
        symbol: pick.symbol,
        side: pick.side,
        conviction: pick.conviction,
        opportunityType: pick.opportunityType,
        entryPrice: pick.entryPrice,
        exitPrice: event.exitPrice,
        pnlDollars: undefined,  // Needs position size, filled by caller if available
        pnlPercent,
        holdDays,
        outcomeType,
        outcomeScore,
        thesis: pick.thesis,
        runId: pick.runId,
      };

      this.brain.recordEpisode(episode);

      // Layer 2: Record analyst feedback
      const feedbackSignal = outcomeScore > 0.3 ? 'profitable'
        : outcomeScore < -0.3 ? 'loss'
        : event.reason === 'stop_hit' ? 'stopped_out'
        : 'flat';

      this.brain.recordFeedback(pick.analystId, 'trade_outcome', feedbackSignal, {
        symbol: pick.symbol,
        notes: `${pick.side.toUpperCase()} ${pick.symbol}: ${pnlPercent > 0 ? '+' : ''}${pnlPercent.toFixed(1)}% in ${holdDays || '?'}d (${event.reason})`,
      });

      console.log(`📊 Outcome Tracker: ${pick.analystName} → ${pick.symbol} ${outcomeType} ${pnlPercent > 0 ? '+' : ''}${pnlPercent.toFixed(1)}% (score: ${outcomeScore.toFixed(2)})`);
    }

    // Clean up tracked picks for this symbol
    this.trackedPicks.delete(event.symbol);
  }

  // -------------------------------------------------------------------------
  // Step 4: Daily P&L check — interim observations
  // -------------------------------------------------------------------------

  /**
   * Called daily (or on each panel run) to record interim observations
   * for all open positions. Analysts see "your NVDA pick is +3.2% after 2 days."
   */
  onDailyPnL(positions: Array<{ symbol: string; currentPrice: number; unrealizedPnlPercent: number }>): void {
    for (const pos of positions) {
      const picks = this.trackedPicks.get(pos.symbol);
      if (!picks) continue;

      for (const pick of picks) {
        if (!pick.entryPrice) continue;

        const holdDays = pick.entryTimestamp
          ? Math.ceil((Date.now() - pick.entryTimestamp.getTime()) / (1000 * 60 * 60 * 24))
          : undefined;

        this.brain.observe(pick.runId, pick.analystId, 'position_update',
          `${pick.symbol}: ${pos.unrealizedPnlPercent > 0 ? '+' : ''}${pos.unrealizedPnlPercent.toFixed(1)}% after ${holdDays || '?'}d (entry $${pick.entryPrice.toFixed(2)}, now $${pos.currentPrice.toFixed(2)})`,
          { symbol: pos.symbol, pnlPercent: pos.unrealizedPnlPercent, holdDays }
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // Scoring
  // -------------------------------------------------------------------------

  /**
   * Score an outcome from -1.0 (worst) to 1.0 (best).
   * Based on P&L% and exit reason.
   */
  private scoreOutcome(pnlPercent: number, reason: string): number {
    // Stop-loss hits: score by actual P&L but capped at -0.8 maximum penalty.
    // A tight -1% stop that triggers is NOT as bad as a -15% disaster.
    if (reason === 'stop_hit') {
      const basePnlScore = this.pnlScore(pnlPercent);
      return Math.max(-0.8, basePnlScore);
    }

    // Target hits are rewarded (thesis played out correctly)
    if (reason === 'target_hit') {
      return Math.min(1.0, 0.5 + (pnlPercent / 100) * 2);
    }

    return this.pnlScore(pnlPercent);
  }

  /** Raw P&L → score mapping (-1.0 to 1.0), used by scoreOutcome and stop-hit path. */
  private pnlScore(pnlPercent: number): number {
    if (pnlPercent > 10) return Math.min(1.0, 0.5 + (pnlPercent / 100));
    if (pnlPercent > 5) return 0.5 + (pnlPercent / 100);
    if (pnlPercent > 2) return 0.25 + (pnlPercent / 100);
    if (pnlPercent > 0) return 0.1 + (pnlPercent / 100);
    if (pnlPercent > -2) return -0.1 + (pnlPercent / 100);
    if (pnlPercent > -5) return -0.25 + (pnlPercent / 100);
    if (pnlPercent > -10) return -0.5 + (pnlPercent / 100);
    return Math.max(-1.0, -0.7 + (pnlPercent / 100));
  }

  // -------------------------------------------------------------------------
  // Utility
  // -------------------------------------------------------------------------

  /** Get all currently tracked symbols */
  getTrackedSymbols(): string[] {
    return Array.from(this.trackedPicks.keys());
  }

  /** Get tracked picks for a symbol */
  getTrackedPicks(symbol: string): TrackedPick[] {
    return this.trackedPicks.get(symbol) || [];
  }

  /** How many symbols are being tracked */
  get activeCount(): number {
    return this.trackedPicks.size;
  }
}
