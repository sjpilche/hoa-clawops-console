// =============================================================================
// Brain Context Builder — Per-analyst learning injection
// =============================================================================
// Assembles personalized learning context for each analyst before their scan.
// This is what makes the recursive learning VISIBLE to the LLM — without it,
// the brain stores data but analysts never see their past performance.
//
// Injects 3 blocks into each analyst's prompt:
//   1. Layer 2 feedback: "Your last 8 outcomes: PROFITABLE NVDA, LOSS TSLA..."
//   2. Layer 3 episodes: "Past trades on symbols in watchlist"
//   3. Layer 4 knowledge: "Winning patterns distilled from all past trades"
// =============================================================================

import { BrainStore } from './brain-store';

export class BrainContextBuilder {
  private brain: BrainStore;

  constructor(brain: BrainStore) {
    this.brain = brain;
  }

  /**
   * Build the full learning context for a specific analyst.
   * Returns a string block to inject between skills data and user prompt.
   *
   * @param analystId - The analyst's ID (e.g., 'value-hunter')
   * @param watchlistSymbols - Symbols the analyst will be scanning
   * @returns Formatted context string (empty string if no learning data exists)
   */
  buildContext(analystId: string, watchlistSymbols: string[]): string {
    const blocks: string[] = [];

    // Layer 2: Analyst's own performance feedback
    const feedbackBlock = this.brain.getFeedbackPromptBlock(analystId, 8);
    if (feedbackBlock) {
      blocks.push(feedbackBlock);
    }

    // Layer 3: Relevant episodes for watchlist symbols
    const episodeBlocks = this.buildEpisodeBlocks(analystId, watchlistSymbols);
    if (episodeBlocks) {
      blocks.push(episodeBlocks);
    }

    // Layer 4: Winning + losing patterns from knowledge base
    const winningPatterns = this.brain.getKnowledgePromptBlock('winning_pattern', { limit: 3 });
    const losingPatterns = this.brain.getKnowledgePromptBlock('losing_pattern', { limit: 3 });
    if (winningPatterns) blocks.push(winningPatterns);
    if (losingPatterns) blocks.push(losingPatterns);

    if (blocks.length === 0) return '';

    return [
      '',
      '=== RECURSIVE LEARNING CONTEXT (from Trader Brain) ===',
      '',
      ...blocks,
      '',
      '=== END LEARNING CONTEXT ===',
      '',
    ].join('\n');
  }

  /**
   * Build episode blocks for relevant symbols.
   * Fetches top 3 episodes per symbol from the watchlist.
   */
  private buildEpisodeBlocks(analystId: string, symbols: string[]): string {
    const allLines: string[] = [];

    // Get episodes for this specific analyst first
    const analystEpisodes = this.brain.getEpisodesPromptBlock({
      analystId,
      limit: 5,
    });
    if (analystEpisodes) {
      allLines.push(analystEpisodes);
    }

    // Get episodes for watchlist symbols (from any analyst)
    for (const symbol of symbols.slice(0, 10)) {  // Cap at 10 to avoid prompt bloat
      const symbolEpisodes = this.brain.getEpisodesPromptBlock({
        symbol,
        limit: 3,
      });
      if (symbolEpisodes) {
        allLines.push(symbolEpisodes);
      }
    }

    return allLines.join('\n\n');
  }

  /**
   * Get a summary of how much learning data exists for an analyst.
   * Useful for logging/debugging.
   */
  getAnalystLearningStats(analystId: string): {
    feedbackCount: number;
    episodeCount: number;
    hasKnowledge: boolean;
  } {
    const feedback = this.brain.getSimilarEpisodes({ analystId, limit: 100 });
    const knowledge = this.brain.getKnowledgeExamples('winning_pattern', { limit: 1 });

    return {
      feedbackCount: feedback.length,  // Approximate — using episodes as proxy
      episodeCount: feedback.length,
      hasKnowledge: knowledge.length > 0,
    };
  }
}
