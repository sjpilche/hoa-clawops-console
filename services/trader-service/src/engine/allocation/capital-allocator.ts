// =============================================================================
// Capital Allocator — The Decision Engine
// =============================================================================
// Sits between signal generation and execution in BOTH paths.
// For every TradeCandidate:
//   1. Score (5 component scores → composite)
//   2. Rank (sort by composite score)
//   3. Size (score → R-bucket → dollar value)
//   4. Approve or reject (threshold + portfolio constraints)
//   5. Log the decision (full audit trail)
//
// Core principle: Signals suggest. The allocator decides.
// =============================================================================

import { v4 as uuidv4 } from 'uuid';
import { TradeCandidate, TradeDecision, DecisionAction } from './types';
import { ComponentScores, scoreCandidate, ScoringWeights, DEFAULT_WEIGHTS } from './scoring';
import { calculatePositionSize, calculateSellSize, SizingConfig, SizingResult, DEFAULT_SIZING_CONFIG } from './position-sizing';
import { AttributionStore } from './attribution-store';
import { SourceProfiler } from '../learning/source-profiles';
import { BookManager } from './book-manager';
import { StrategyRoleRegistry, StrategyRole } from './strategy-roles';

export interface AllocatorConfig {
  /** Minimum composite score to execute (below = reject) */
  minScoreToExecute: number;
  /** Scoring dimension weights */
  scoringWeights: ScoringWeights;
  /** Position sizing parameters */
  sizing: Omit<SizingConfig, 'accountValue'>;
  /** Max simultaneous open positions */
  maxOpenPositions: number;
  /** Max new positions per day */
  maxDailyNewPositions: number;
}

export const DEFAULT_ALLOCATOR_CONFIG: AllocatorConfig = {
  minScoreToExecute: 40,
  scoringWeights: DEFAULT_WEIGHTS,
  sizing: DEFAULT_SIZING_CONFIG,
  maxOpenPositions: 8,
  maxDailyNewPositions: 5,
};

export class CapitalAllocator {
  private attrStore: AttributionStore;
  private profiler: SourceProfiler | null;
  private bookManager: BookManager | null;
  private roleRegistry: StrategyRoleRegistry | null;
  private config: AllocatorConfig;
  private dailyNewPositions: number = 0;
  private dailyDate: string = '';

  constructor(
    attrStore: AttributionStore,
    config?: Partial<AllocatorConfig>,
    profiler?: SourceProfiler | null,
    bookManager?: BookManager | null,
    roleRegistry?: StrategyRoleRegistry | null,
  ) {
    this.attrStore = attrStore;
    this.profiler = profiler || null;
    this.bookManager = bookManager || null;
    this.roleRegistry = roleRegistry || null;
    this.config = { ...DEFAULT_ALLOCATOR_CONFIG, ...config };
    console.log(`💰 Capital Allocator: Ready (minScore=${this.config.minScoreToExecute}, maxPositions=${this.config.maxOpenPositions}, books=${this.bookManager ? 'enabled' : 'disabled'}, roles=${this.roleRegistry ? 'enabled' : 'disabled'})`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Evaluate a batch of candidates (panel path).
   * Scores, ranks, sizes, and returns decisions for all.
   */
  evaluate(
    candidates: TradeCandidate[],
    currentPrices: Record<string, number>,
    portfolioValue: number,
    existingPositionSymbols: string[],
  ): TradeDecision[] {
    this.checkDayRollover();

    const sizingConfig: SizingConfig = {
      ...this.config.sizing,
      accountValue: portfolioValue,
    };

    // Step 1: Score all candidates (uses source profiles when available)
    const scored = candidates.map(c => ({
      candidate: c,
      scores: scoreCandidate(c, this.attrStore, this.config.scoringWeights, this.profiler),
    }));

    // Step 2: Rank by composite score (descending)
    scored.sort((a, b) => b.scores.composite - a.scores.composite);

    // Step 3: Process in rank order
    const decisions: TradeDecision[] = [];
    let newPositionsThisBatch = 0;

    for (const { candidate, scores } of scored) {
      const decision = this.processCandidate(
        candidate,
        scores,
        currentPrices[candidate.symbol] || 0,
        sizingConfig,
        existingPositionSymbols,
        newPositionsThisBatch,
      );

      if (decision.action === 'execute') {
        newPositionsThisBatch++;
        // Track if this opens a new position
        if (!existingPositionSymbols.includes(candidate.symbol)) {
          this.dailyNewPositions++;
        }
      }

      decisions.push(decision);

      // Log to attribution store
      this.attrStore.insertDecision(decision);
    }

    const executed = decisions.filter(d => d.action === 'execute').length;
    const rejected = decisions.filter(d => d.action === 'reject').length;
    console.log(`💰 Allocator: ${executed} execute, ${rejected} reject out of ${candidates.length} candidates`);

    return decisions;
  }

  /**
   * Evaluate a single candidate (strategy path).
   */
  evaluateOne(
    candidate: TradeCandidate,
    currentPrice: number,
    portfolioValue: number,
    existingPositionSymbols: string[],
  ): TradeDecision {
    this.checkDayRollover();

    const sizingConfig: SizingConfig = {
      ...this.config.sizing,
      accountValue: portfolioValue,
    };

    const scores = scoreCandidate(candidate, this.attrStore, this.config.scoringWeights, this.profiler);
    const decision = this.processCandidate(
      candidate,
      scores,
      currentPrice,
      sizingConfig,
      existingPositionSymbols,
      0,
    );

    if (decision.action === 'execute' && !existingPositionSymbols.includes(candidate.symbol)) {
      this.dailyNewPositions++;
    }

    // Log to attribution store
    this.attrStore.insertDecision(decision);

    return decision;
  }

  /**
   * Get current allocator configuration (for API/audit).
   */
  getConfig(): AllocatorConfig {
    return { ...this.config };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Internal
  // ───────────────────────────────────────────────────────────────────────────

  private processCandidate(
    candidate: TradeCandidate,
    scores: ComponentScores,
    currentPrice: number,
    sizingConfig: SizingConfig,
    existingPositionSymbols: string[],
    newPositionsThisBatch: number,
  ): TradeDecision {
    const reasons: string[] = [];
    const isNewPosition = !existingPositionSymbols.includes(candidate.symbol);

    // --- Strategy role check (Sprint 4) ---
    if (this.roleRegistry) {
      const role = this.roleRegistry.getRole(candidate.sourceId);

      if (role === 'disabled') {
        reasons.push(`Source ${candidate.sourceName} is disabled`);
        return this.buildDecision(candidate, scores, 'reject', reasons);
      }

      if (role === 'research') {
        reasons.push(`Source ${candidate.sourceName} is research-only — logged but not executed`);
        return this.buildDecision(candidate, scores, 'defer', reasons);
      }

      if (role === 'filter' && isNewPosition) {
        reasons.push(`Source ${candidate.sourceName} is a filter — cannot open new positions`);
        return this.buildDecision(candidate, scores, 'reject', reasons);
      }
    }

    // For sell candidates, just approve (closing existing positions is always OK)
    if (candidate.side === 'sell') {
      reasons.push(`Sell signal for ${candidate.symbol} — approved (reduces risk)`);
      return this.buildDecision(candidate, scores, 'execute', reasons, {
        approvedQty: undefined,
        dollarValue: undefined,
      });
    }

    // --- Book routing + capacity check (Sprint 4) ---
    let bookId = candidate.bookId;
    if (this.bookManager && !bookId) {
      bookId = this.bookManager.routeToBook(candidate);
      candidate.bookId = bookId;

      // Use book-specific min score threshold
      const bookMinScore = this.bookManager.getMinScore(bookId);
      if (scores.composite < bookMinScore) {
        reasons.push(`Score ${scores.composite} below ${bookId} book threshold ${bookMinScore}`);
        return this.buildDecision(candidate, scores, 'reject', reasons);
      }

      // Check book capacity
      const { accepted, reason } = this.bookManager.canAccept(candidate, bookId, sizingConfig.accountValue);
      if (!accepted) {
        reasons.push(reason || `Book ${bookId} full`);
        return this.buildDecision(candidate, scores, 'reject', reasons);
      }

      reasons.push(`Routed to ${bookId} book`);
    }

    // --- Score threshold check (global fallback) ---
    if (scores.composite < this.config.minScoreToExecute) {
      reasons.push(`Score ${scores.composite} below threshold ${this.config.minScoreToExecute}`);
      return this.buildDecision(candidate, scores, 'reject', reasons);
    }

    // --- Portfolio constraint checks ---
    const totalExisting = existingPositionSymbols.length + newPositionsThisBatch;
    if (isNewPosition && totalExisting >= this.config.maxOpenPositions) {
      reasons.push(`Max open positions (${this.config.maxOpenPositions}) reached`);
      return this.buildDecision(candidate, scores, 'reject', reasons);
    }

    if (isNewPosition && this.dailyNewPositions >= this.config.maxDailyNewPositions) {
      reasons.push(`Max daily new positions (${this.config.maxDailyNewPositions}) reached`);
      return this.buildDecision(candidate, scores, 'reject', reasons);
    }

    // --- Position sizing ---
    const sizing = calculatePositionSize(scores.composite, candidate, currentPrice, sizingConfig);
    if (!sizing) {
      reasons.push(`Position sizing returned null (price=${currentPrice}, score=${scores.composite})`);
      return this.buildDecision(candidate, scores, 'reject', reasons);
    }

    // Record position opening in book
    if (this.bookManager && bookId && isNewPosition) {
      try {
        this.bookManager.openPosition(bookId, candidate.candidateId, candidate.symbol, candidate.side, sizing.dollarValue);
      } catch {}
    }

    reasons.push(sizing.reason);
    reasons.push(`Components: edge=${scores.strategyEdge}, setup=${scores.setupQuality}, symbol=${scores.symbolQuality}, regime=${scores.regimeFit}, analyst=${scores.analystQuality}`);

    const decision = this.buildDecision(candidate, scores, 'execute', reasons, {
      approvedQty: sizing.shares,
      dollarValue: sizing.dollarValue,
    });
    decision.bookId = bookId;
    return decision;
  }

  private buildDecision(
    candidate: TradeCandidate,
    scores: ComponentScores,
    action: DecisionAction,
    reasons: string[],
    sizing?: { approvedQty?: number; dollarValue?: number },
  ): TradeDecision {
    return {
      decisionId: uuidv4(),
      candidateId: candidate.candidateId,
      action,
      allocatorScore: scores.composite,
      strategyEdgeScore: scores.strategyEdge,
      setupQualityScore: scores.setupQuality,
      symbolQualityScore: scores.symbolQuality,
      regimeFitScore: scores.regimeFit,
      analystQualityScore: scores.analystQuality,
      approvedQty: sizing?.approvedQty,
      dollarValue: sizing?.dollarValue,
      riskPassed: action === 'execute',
      executed: false, // Set to true after actual broker execution
      reasons,
      createdAt: new Date(),
    };
  }

  private checkDayRollover(): void {
    const today = new Date().toISOString().split('T')[0];
    if (this.dailyDate !== today) {
      this.dailyDate = today;
      this.dailyNewPositions = 0;
    }
  }
}
