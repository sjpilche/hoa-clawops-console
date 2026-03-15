// =============================================================================
// Distillation Engine — Promotes winning patterns to Knowledge Base
// =============================================================================
// Runs daily at 4:15 PM ET (after market close):
//   1. Scans episodes with outcome_score >= 0.7 and 2+ occurrences
//   2. Groups by (opportunity_type, analyst)
//   3. Promotes to Layer 4 KB: "momentum_breakout by Momentum Scanner: 4/5 profitable"
//   4. Identifies consistent losers (score <= -0.5, 3+ episodes) → "avoid" patterns
//   5. Increments use_count on KB entries that get re-confirmed
//
// Ported from collectiveBrain.runDistillation() with trader-specific logic.
// =============================================================================

import { BrainStore, TradeEpisode, KBEntry, DistillationResult } from './brain-store';

export class DistillationEngine {
  private brain: BrainStore;

  constructor(brain: BrainStore) {
    this.brain = brain;
  }

  /**
   * Run the full distillation cycle.
   * Call this daily after market close (4:15 PM ET).
   */
  runDistillation(): DistillationResult {
    console.log('🧪 Distillation: Starting daily knowledge promotion...');

    const result: DistillationResult = {
      promoted: 0,
      avoidPatterns: 0,
      totalEpisodesScanned: 0,
    };

    try {
      // Step 1: Promote winning patterns
      result.promoted = this.promoteWinningPatterns();

      // Step 2: Flag losing patterns
      result.avoidPatterns = this.flagLosingPatterns();

      // Step 3: Promote best theses
      result.promoted += this.promoteBestTheses();

      console.log(`🧪 Distillation complete: ${result.promoted} winning, ${result.avoidPatterns} avoid patterns`);
    } catch (err: any) {
      console.error('🧪 Distillation error (non-fatal):', err.message);
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // Winning Pattern Promotion
  // -------------------------------------------------------------------------

  /**
   * Find opportunity types that consistently win across analysts.
   * Groups episodes by (opportunity_type, analyst_id), requires:
   *   - 5+ episodes of same type
   *   - Average outcome_score >= 0.5
   *   - Win rate >= 60%
   */
  private promoteWinningPatterns(): number {
    const episodes = this.brain.getSimilarEpisodes({ minScore: 0.3, limit: 200 });
    if (episodes.length === 0) return 0;

    // Group by opportunity_type + analyst
    const groups = new Map<string, any[]>();
    for (const ep of episodes) {
      const key = `${(ep as any).opportunity_type || 'unknown'}|${(ep as any).analyst_id}`;
      const existing = groups.get(key) || [];
      existing.push(ep);
      groups.set(key, existing);
    }

    let promoted = 0;

    for (const [key, eps] of groups) {
      if (eps.length < 5) continue;  // Require 5+ episodes before promoting a pattern

      const [oppType, analystId] = key.split('|');
      const avgScore = eps.reduce((sum: number, e: any) => sum + (e.outcome_score || 0), 0) / eps.length;
      const winCount = eps.filter((e: any) => (e.outcome_score || 0) > 0).length;
      const winRate = winCount / eps.length;

      if (avgScore >= 0.5 && winRate >= 0.6) {
        const avgPnl = eps
          .filter((e: any) => e.pnl_percent != null)
          .reduce((sum: number, e: any) => sum + e.pnl_percent, 0) / eps.length;

        const content = `${oppType} by ${analystId}: ${winCount}/${eps.length} profitable (${(winRate * 100).toFixed(0)}% win rate), avg P&L ${avgPnl > 0 ? '+' : ''}${avgPnl.toFixed(1)}%. Avg conviction: ${(eps.reduce((s: number, e: any) => s + (e.conviction || 3), 0) / eps.length).toFixed(1)}.`;

        // Check if this pattern already exists
        const existing = this.brain.getKnowledgeExamples('winning_pattern', {
          opportunityType: oppType,
          limit: 1,
        });

        if (existing.length > 0) {
          // Pattern already known — it gets use_count incremented by getKnowledgeExamples
          continue;
        }

        const entry: KBEntry = {
          sourceAnalyst: analystId,
          contentType: 'winning_pattern',
          title: `${oppType} — ${analystId}`,
          content,
          qualityScore: avgScore,
          opportunityType: oppType,
          sourceEpisodeIds: eps.map((e: any) => e.id).filter(Boolean),
        };

        this.brain.addToKnowledgeBase(entry);
        promoted++;

        console.log(`  ✓ Promoted: ${content}`);
      }
    }

    return promoted;
  }

  // -------------------------------------------------------------------------
  // Losing Pattern Flagging
  // -------------------------------------------------------------------------

  /**
   * Find patterns that consistently lose. Requires:
   *   - 3+ episodes
   *   - Average outcome_score <= -0.5
   */
  private flagLosingPatterns(): number {
    const episodes = this.brain.getSimilarEpisodes({ limit: 200 });
    if (episodes.length === 0) return 0;

    // Group by opportunity_type + analyst
    const groups = new Map<string, any[]>();
    for (const ep of episodes) {
      const score = (ep as any).outcome_score || 0;
      if (score > 0) continue;  // Only look at losses

      const key = `${(ep as any).opportunity_type || 'unknown'}|${(ep as any).analyst_id}`;
      const existing = groups.get(key) || [];
      existing.push(ep);
      groups.set(key, existing);
    }

    let flagged = 0;

    for (const [key, eps] of groups) {
      if (eps.length < 3) continue;

      const [oppType, analystId] = key.split('|');
      const avgScore = eps.reduce((sum: number, e: any) => sum + (e.outcome_score || 0), 0) / eps.length;

      if (avgScore <= -0.5) {
        const avgPnl = eps
          .filter((e: any) => e.pnl_percent != null)
          .reduce((sum: number, e: any) => sum + e.pnl_percent, 0) / eps.length;

        const content = `AVOID: ${oppType} by ${analystId} has lost ${eps.length} times (avg ${avgPnl.toFixed(1)}%). Consider reducing conviction on this pattern or requiring additional confirmation before acting.`;

        // Check if already flagged
        const existing = this.brain.getKnowledgeExamples('losing_pattern', {
          opportunityType: oppType,
          limit: 1,
        });

        if (existing.length > 0) continue;

        const entry: KBEntry = {
          sourceAnalyst: analystId,
          contentType: 'losing_pattern',
          title: `AVOID: ${oppType} — ${analystId}`,
          content,
          qualityScore: avgScore,
          opportunityType: oppType,
          sourceEpisodeIds: eps.map((e: any) => e.id).filter(Boolean),
        };

        this.brain.addToKnowledgeBase(entry);
        flagged++;

        console.log(`  ⚠️  Flagged: ${content}`);
      }
    }

    return flagged;
  }

  // -------------------------------------------------------------------------
  // Best Thesis Promotion
  // -------------------------------------------------------------------------

  /**
   * Find individual trade theses that worked exceptionally well.
   * Promotes trades with outcome_score >= 0.7 as "best thesis" examples.
   */
  private promoteBestTheses(): number {
    const episodes = this.brain.getSimilarEpisodes({ minScore: 0.7, limit: 20 });
    if (episodes.length === 0) return 0;

    let promoted = 0;

    for (const ep of episodes) {
      const thesis = (ep as any).thesis;
      if (!thesis || thesis.length < 20) continue;  // Skip short/empty theses

      // Check if this thesis is already in KB
      const existing = this.brain.getKnowledgeExamples('best_thesis', {
        symbol: (ep as any).symbol,
        limit: 3,
      });

      // Don't promote if we already have 3 best theses for this symbol
      if (existing.length >= 3) continue;

      const pnl = (ep as any).pnl_percent;
      const content = `${(ep as any).side?.toUpperCase()} ${(ep as any).symbol} (${(ep as any).opportunity_type}): "${thesis}" → ${pnl > 0 ? '+' : ''}${pnl?.toFixed(1)}% P&L, conviction ${(ep as any).conviction || '?'}. This thesis was correct.`;

      const entry: KBEntry = {
        sourceAnalyst: (ep as any).analyst_id,
        contentType: 'best_thesis',
        title: `Best thesis: ${(ep as any).symbol} ${(ep as any).opportunity_type}`,
        content,
        qualityScore: (ep as any).outcome_score,
        symbol: (ep as any).symbol,
        opportunityType: (ep as any).opportunity_type,
        sourceEpisodeIds: [(ep as any).id],
      };

      this.brain.addToKnowledgeBase(entry);
      promoted++;
    }

    return promoted;
  }
}
