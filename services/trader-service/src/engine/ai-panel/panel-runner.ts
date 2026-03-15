// =============================================================================
// AI Panel Runner — Multi-Analyst Orchestration with Recursive Learning
// =============================================================================
// Runs the full panel: skills → brain context → analysts → aggregator → executor
//
// New flow (v2):
//   1. Get portfolio from Alpaca
//   2. Fetch all 7 skills in parallel (30s timeout each)
//   3. For each analyst: build brain context with personal feedback + episodes
//   4. Run Tier 0 analysts SEQUENTIALLY on Ollama (RAM-safe)
//   5. Run Tier 1+2 analysts IN PARALLEL via API
//   6. Aggregate picks (existing scoring + multi-analyst consensus)
//   7. Risk Engine (unchanged)
//   8. Execute trades
//   9. Register picks with OutcomeTracker (closes the loop)
// =============================================================================

import { LLMClient } from './llm-client';
import {
  TieredAnalystConfig,
  getAnalystsByExecutionGroup,
  getFallbackConfig,
  ALL_TIERED_ANALYSTS,
  TIERED_PANEL_CONFIG,
} from './cost-tier-config';
import { OpenClawExecutor } from './openclaw-executor';
import { AnalystReport, AnalystPick, AggregatedPick, RebalanceTrade } from './index';
import { fetchAllSkillsContext, formatSkillsContext } from './skills-fetcher';
import { BrainStore } from '../learning/brain-store';
import { BrainContextBuilder } from '../learning/brain-context';
import { OutcomeTracker } from '../learning/outcome-tracker';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PanelRunOptions {
  dryRun?: boolean;
  watchlist?: string[];
}

export interface PanelRunResult {
  runId: string;
  timestamp: Date;
  reports: AnalystReport[];
  aggregatedPicks: AggregatedPick[];
  trades: RebalanceTrade[];
  executed: boolean;
  executionResults?: any[];
  totalLLMCost: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// PanelRunner
// ---------------------------------------------------------------------------

export class PanelRunner {
  private llmClient: LLMClient;
  private executor: OpenClawExecutor;
  private brain: BrainStore | null;
  private brainContext: BrainContextBuilder | null;
  private outcomeTracker: OutcomeTracker | null;

  constructor(
    brain?: BrainStore | null,
    outcomeTracker?: OutcomeTracker | null,
  ) {
    this.llmClient = new LLMClient();
    this.executor = new OpenClawExecutor();
    this.brain = brain || null;
    this.brainContext = brain ? new BrainContextBuilder(brain) : null;
    this.outcomeTracker = outcomeTracker || null;
  }

  // -------------------------------------------------------------------------
  // Main run
  // -------------------------------------------------------------------------

  async run(options: PanelRunOptions = {}): Promise<PanelRunResult> {
    const runId = uuidv4();
    const timestamp = new Date();

    console.log(`\n${'='.repeat(80)}`);
    console.log(`🦞 AI ANALYST PANEL RUN — ${timestamp.toLocaleString()}`);
    console.log(`Run ID: ${runId}`);
    console.log(`Mode: ${options.dryRun ? 'DRY RUN (no trades)' : 'LIVE EXECUTION'}`);
    console.log(`Analysts: ${ALL_TIERED_ANALYSTS.length} (${ALL_TIERED_ANALYSTS.map(a => a.name).join(', ')})`);
    console.log(`Brain: ${this.brain ? 'connected' : 'none'}`);
    console.log(`${'='.repeat(80)}\n`);

    try {
      // Step 1: Get current portfolio
      console.log('📊 Fetching portfolio from Alpaca...');
      const portfolio = await this.executor.getPortfolioSnapshot();
      console.log(`   Total value: $${portfolio.totalValue.toFixed(2)}`);
      console.log(`   Cash: $${portfolio.cash.toFixed(2)}`);
      console.log(`   Positions: ${portfolio.positions.length}`);

      // Step 2: Build context
      const portfolioContext = this.buildPortfolioContext(portfolio);
      const watchlist = options.watchlist || this.getDefaultWatchlist();
      const allSymbols = [...new Set([...portfolio.positions.map((p: any) => p.symbol), ...watchlist])];

      // Step 2b: Fetch all 7 skills in parallel
      const skillsCtx = await fetchAllSkillsContext(allSymbols);
      const skillsBlock = formatSkillsContext(skillsCtx);
      const marketContext = this.buildMarketContext(skillsBlock);

      // Record observation
      if (this.brain) {
        this.brain.observe(runId, 'panel', 'run_started', `Portfolio: $${portfolio.totalValue.toFixed(2)}, ${portfolio.positions.length} positions`, {
          totalValue: portfolio.totalValue,
          cash: portfolio.cash,
          positionCount: portfolio.positions.length,
          skillErrors: skillsCtx.errors.length,
        });
      }

      // Update daily P&L observations for tracked positions
      if (this.outcomeTracker && portfolio.positions.length > 0) {
        this.outcomeTracker.onDailyPnL(portfolio.positions);
      }

      // Step 3+4+5: Run all analysts with brain context
      console.log('\n🤖 Running analyst panel...');
      const reports = await this.runAllAnalysts(runId, portfolioContext, marketContext, watchlist);

      let totalLLMCost = 0;
      for (const report of reports) {
        console.log(`\n📈 ${report.analystName} (${report.provider}):`);
        console.log(`   Commentary: ${report.marketCommentary}`);
        console.log(`   Picks: ${report.picks.length}`);
        console.log(`   Cost: $${report.costEstimateUSD.toFixed(4)}`);
        console.log(`   Latency: ${report.latencyMs}ms`);
        totalLLMCost += report.costEstimateUSD;

        if (report.picks.length > 0) {
          report.picks.forEach((pick, i) => {
            console.log(`   ${i + 1}. ${pick.side.toUpperCase()} ${pick.symbol} (conviction: ${pick.conviction}/5, ${pick.opportunityType})`);
            console.log(`      Thesis: ${pick.thesis}`);
          });
        }
      }

      console.log(`\n💰 Total LLM cost this run: $${totalLLMCost.toFixed(4)}`);

      // Record analyst decisions to brain (for UI "why" display)
      if (this.brain) {
        for (const report of reports) {
          if (report.picks.length > 0) {
            const decisions = report.picks.map(p => ({
              symbol: p.symbol,
              side: p.side,
              conviction: p.conviction,
              opportunityType: p.opportunityType,
              thesis: p.thesis,
              risks: p.risks,
              catalysts: p.catalysts,
              horizon: p.horizon,
              targetPrice: p.targetPrice,
              stopLoss: p.stopLoss,
            }));
            this.brain.observe(runId, report.analystId || report.analystName, 'analyst_decisions', report.marketCommentary, {
              analyst: report.analystName,
              provider: report.provider,
              picks: decisions,
              costUsd: report.costEstimateUSD,
              latencyMs: report.latencyMs,
            });
          }
        }
      }

      // Step 6: Aggregate picks across all analysts
      const aggregatedPicks = this.aggregatePicks(reports);
      console.log(`\n📊 Aggregated: ${aggregatedPicks.length} actionable picks`);

      // Step 7: Calculate rebalance trades
      const trades = this.calculateRebalanceTrades(portfolio, aggregatedPicks);
      console.log(`💼 Portfolio Actions: ${trades.length} trade(s)`);

      if (trades.length > 0) {
        trades.forEach(trade => {
          console.log(`   ${trade.side.toUpperCase()} ${trade.symbol}: ${trade.estimatedShares} shares ($${trade.estimatedValue.toFixed(2)}) [score: ${trade.compositeScore}]`);
        });
      }

      // Step 8: Execute trades
      let executionResults;
      if (!options.dryRun && trades.length > 0) {
        console.log('\n🚀 Executing trades through Alpaca...');
        executionResults = await this.executor.executePortfolioRebalance(trades);
      } else if (options.dryRun && trades.length > 0) {
        console.log('\n🏃 DRY RUN — Trades NOT executed');
      }

      // Step 9: Register picks with outcome tracker (THE LOOP)
      if (this.outcomeTracker && trades.length > 0) {
        this.outcomeTracker.registerPicks(runId, reports, trades);
        console.log(`📊 Outcome Tracker: ${trades.length} trade(s) registered for learning`);
      }

      // Step 10: Record portfolio snapshot for balance tracking
      if (this.brain && portfolio.totalValue != null && !isNaN(portfolio.totalValue)) {
        try {
          this.brain.recordSnapshot({
            portfolioValue: portfolio.totalValue || 0,
            cash: portfolio.cash || 0,
            equity: portfolio.totalValue || 0, // equity ≈ totalValue for paper
            buyingPower: (portfolio.cash || 0) * 2, // 2:1 margin estimate
            positionsCount: portfolio.positions.length,
            unrealizedPnl: portfolio.positions.reduce((sum: number, p: any) => sum + (p.unrealizedPnl || 0), 0),
            runId,
          });
        } catch (e: any) {
          console.warn('Snapshot recording failed (non-fatal):', e.message);
        }
      }

      console.log(`\n${'='.repeat(80)}`);
      console.log(`✅ Panel run complete — ${reports.length} analysts, ${trades.length} trades, $${totalLLMCost.toFixed(4)} LLM cost`);
      console.log(`${'='.repeat(80)}\n`);

      return {
        runId,
        timestamp,
        reports,
        aggregatedPicks,
        trades,
        executed: !options.dryRun && trades.length > 0,
        executionResults,
        totalLLMCost,
      };

    } catch (error: any) {
      console.error('❌ Panel run failed:', error.message);
      if (this.brain) {
        this.brain.observe(runId, 'panel', 'run_error', error.message);
      }
      return {
        runId,
        timestamp,
        reports: [],
        aggregatedPicks: [],
        trades: [],
        executed: false,
        totalLLMCost: 0,
        error: error.message,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Run all analysts (tiered execution)
  // -------------------------------------------------------------------------

  private async runAllAnalysts(
    runId: string,
    portfolio: string,
    market: string,
    watchlist: string[],
  ): Promise<AnalystReport[]> {
    const { sequential, parallel } = getAnalystsByExecutionGroup();
    const reports: AnalystReport[] = [];

    // Tier 0: Run sequentially on Ollama (RAM-safe, same model loaded)
    if (sequential.length > 0) {
      console.log(`\n  🏠 Tier 0 (Ollama, $0): ${sequential.map(a => a.name).join(', ')}`);
      for (const analyst of sequential) {
        const report = await this.runSingleAnalyst(runId, analyst, portfolio, market, watchlist);
        if (report) reports.push(report);
      }
    }

    // Tier 1+2: Run in parallel (API calls, zero RAM impact)
    if (parallel.length > 0) {
      console.log(`\n  ☁️  Tier 1+2 (API): ${parallel.map(a => a.name).join(', ')}`);
      const parallelResults = await Promise.allSettled(
        parallel.map(analyst => this.runSingleAnalyst(runId, analyst, portfolio, market, watchlist))
      );

      for (const result of parallelResults) {
        if (result.status === 'fulfilled' && result.value) {
          reports.push(result.value);
        }
      }
    }

    return reports;
  }

  // -------------------------------------------------------------------------
  // Run single analyst with brain context + fallback
  // -------------------------------------------------------------------------

  private async runSingleAnalyst(
    runId: string,
    analyst: TieredAnalystConfig,
    portfolio: string,
    market: string,
    watchlist: string[],
  ): Promise<AnalystReport | null> {
    // Build brain learning context for this specific analyst
    let learningBlock = '';
    if (this.brainContext) {
      learningBlock = this.brainContext.buildContext(analyst.id, watchlist);
      if (learningBlock) {
        console.log(`    🧠 ${analyst.name}: Brain context injected`);
      }
    }

    // Build user prompt with learning context
    const userPrompt = analyst.userPromptTemplate
      .replace('{portfolio}', portfolio)
      .replace('{market_data}', market + learningBlock)
      .replace('{universe}', watchlist.join(', '));

    // Try primary provider
    try {
      const report = await this.callAnalyst(runId, analyst, userPrompt);
      return report;
    } catch (primaryErr: any) {
      console.warn(`    ⚠️  ${analyst.name} primary (${analyst.provider}) failed: ${primaryErr.message}`);

      // Fallback to secondary provider
      try {
        const fallbackConfig = getFallbackConfig(analyst);
        console.log(`    🔄 Falling back to ${fallbackConfig.provider}/${fallbackConfig.model}...`);
        const report = await this.callAnalyst(runId, fallbackConfig, userPrompt);
        return report;
      } catch (fallbackErr: any) {
        console.error(`    ❌ ${analyst.name} fallback also failed: ${fallbackErr.message}`);

        if (this.brain) {
          this.brain.observe(runId, analyst.id, 'analyst_failed',
            `Both ${analyst.provider} and ${analyst.fallbackProvider} failed`,
            { primary: primaryErr.message, fallback: fallbackErr.message }
          );
        }

        return null;
      }
    }
  }

  private async callAnalyst(runId: string, analyst: TieredAnalystConfig, userPrompt: string): Promise<AnalystReport> {
    const response = await this.llmClient.call({
      provider: analyst.provider,
      model: analyst.model,
      systemPrompt: analyst.systemPrompt,
      userPrompt,
      temperature: analyst.temperature,
      maxTokens: 4096,
      responseFormat: 'json',
    });

    const parsed = JSON.parse(response.content);

    // Validate and sanitize picks from LLM
    const VALID_SIDES = new Set(['buy', 'sell']);
    const SYMBOL_RE = /^[A-Z]{1,10}$/;
    const rawPicks: AnalystPick[] = (parsed.picks || []);
    const validPicks = rawPicks.filter((p: any) => {
      if (!p || typeof p !== 'object') return false;
      if (!p.symbol || !SYMBOL_RE.test(String(p.symbol).trim().toUpperCase())) return false;
      if (!VALID_SIDES.has(String(p.side).toLowerCase())) return false;
      const conviction = parseFloat(p.conviction);
      if (isNaN(conviction) || conviction < 1 || conviction > 5) return false;
      if (p.targetPrice != null && (isNaN(parseFloat(p.targetPrice)) || parseFloat(p.targetPrice) <= 0)) return false;
      if (p.stopLoss != null && (isNaN(parseFloat(p.stopLoss)) || parseFloat(p.stopLoss) <= 0)) return false;
      return true;
    }).map((p: any) => ({
      ...p,
      symbol: String(p.symbol).trim().toUpperCase(),
      side: String(p.side).toLowerCase() as 'buy' | 'sell',
      conviction: Math.round(Math.min(5, Math.max(1, parseFloat(p.conviction)))),
      targetPrice: p.targetPrice != null ? parseFloat(p.targetPrice) : undefined,
      stopLoss: p.stopLoss != null ? parseFloat(p.stopLoss) : undefined,
    })).slice(0, analyst.maxPicks);

    const rejectedCount = rawPicks.length - validPicks.length;
    if (rejectedCount > 0) {
      console.warn(`⚠️  ${analyst.name}: rejected ${rejectedCount}/${rawPicks.length} invalid picks from LLM`);
    }

    return {
      analystId: analyst.id,
      analystName: analyst.name,
      provider: analyst.provider,
      timestamp: new Date(),
      scanFocus: analyst.focusArea,
      picks: validPicks,
      marketCommentary: parsed.marketCommentary || '',
      rawResponse: response.content,
      promptTokens: response.promptTokens,
      completionTokens: response.completionTokens,
      costEstimateUSD: this.llmClient.estimateCost(analyst.provider, analyst.model, response.promptTokens, response.completionTokens),
      latencyMs: response.latencyMs,
    };
  }

  // -------------------------------------------------------------------------
  // Aggregation (multi-analyst consensus scoring)
  // -------------------------------------------------------------------------

  private aggregatePicks(reports: AnalystReport[]): AggregatedPick[] {
    const picksBySymbol = new Map<string, { pick: AnalystPick; analystId: string }[]>();

    for (const report of reports) {
      for (const pick of report.picks) {
        const existing = picksBySymbol.get(pick.symbol) || [];
        existing.push({ pick, analystId: report.analystId });
        picksBySymbol.set(pick.symbol, existing);
      }
    }

    const aggregated: AggregatedPick[] = [];

    for (const [symbol, entries] of picksBySymbol) {
      const buyEntries = entries.filter(e => e.pick.side === 'buy');
      const sellEntries = entries.filter(e => e.pick.side === 'sell');

      // Skip conflicted signals
      if (buyEntries.length > 0 && sellEntries.length > 0) {
        console.log(`⚠️  Skipping ${symbol} — conflicting buy/sell signals`);
        continue;
      }

      const relevant = buyEntries.length > 0 ? buyEntries : sellEntries;
      const side = buyEntries.length > 0 ? 'buy' : 'sell';
      const picks = relevant.map(e => e.pick);

      const avgConviction = picks.reduce((sum, p) => sum + p.conviction, 0) / picks.length;
      const maxConviction = Math.max(...picks.map(p => p.conviction));
      const analystCount = relevant.length;

      // Multi-analyst composite scoring:
      //   Base = avgConviction / 5 * 100
      //   Consensus bonus: +10 per additional analyst agreeing
      //   Max 100
      const baseScore = (avgConviction / 5) * 100;
      const consensusBonus = (analystCount - 1) * 10;
      const compositeScore = Math.min(100, baseScore + consensusBonus);

      if (compositeScore >= TIERED_PANEL_CONFIG.minScoreToAct) {
        aggregated.push({
          symbol,
          side,
          analystCount,
          avgConviction,
          maxConviction: maxConviction as any,
          opportunityTypes: picks.map(p => p.opportunityType),
          theses: picks.map(p => p.thesis),
          compositeScore,
          targetWeight: this.calculateTargetWeight(avgConviction, analystCount),
        });
      }
    }

    return aggregated.sort((a, b) => b.compositeScore - a.compositeScore);
  }

  private calculateTargetWeight(conviction: number, analystCount: number): number {
    const baseWeight = (conviction / 5) * TIERED_PANEL_CONFIG.maxSinglePositionWeight;
    // Multi-analyst agreement increases weight slightly
    const consensusMultiplier = Math.min(1.2, 1.0 + (analystCount - 1) * 0.1);
    return Math.min(baseWeight * consensusMultiplier, TIERED_PANEL_CONFIG.maxSinglePositionWeight);
  }

  // -------------------------------------------------------------------------
  // Rebalance trade calculation
  // -------------------------------------------------------------------------

  private calculateRebalanceTrades(portfolio: any, picks: AggregatedPick[]): RebalanceTrade[] {
    const trades: RebalanceTrade[] = [];
    const targetPortfolio = new Map<string, number>();

    // Build target portfolio from top picks
    picks.slice(0, TIERED_PANEL_CONFIG.maxPositions).forEach(pick => {
      if (pick.side === 'buy') {
        targetPortfolio.set(pick.symbol, pick.targetWeight);
      }
    });

    // Calculate buys
    targetPortfolio.forEach((targetWeight, symbol) => {
      const currentPosition = portfolio.positions.find((p: any) => p.symbol === symbol);
      const currentWeight = currentPosition ? currentPosition.weight : 0;
      const deltaWeight = targetWeight - currentWeight;

      if (Math.abs(deltaWeight) >= TIERED_PANEL_CONFIG.minTradeThreshold) {
        const estimatedValue = deltaWeight * portfolio.totalValue;
        const pick = picks.find(p => p.symbol === symbol)!;

        trades.push({
          symbol,
          side: deltaWeight > 0 ? 'buy' : 'sell',
          targetWeight,
          currentWeight,
          deltaWeight,
          estimatedShares: Math.abs(estimatedValue / 100),  // Rough, refined by executor
          estimatedValue,
          sourceAnalysts: pick.theses.length > 0 ? [`${pick.analystCount} analyst(s)`] : [],
          compositeScore: pick.compositeScore,
        });
      }
    });

    // Calculate sells for positions not in target
    portfolio.positions.forEach((pos: any) => {
      // Only sell if this position is flagged by sell-side analysts
      const sellPick = picks.find(p => p.symbol === pos.symbol && p.side === 'sell');

      if (sellPick && pos.weight >= TIERED_PANEL_CONFIG.minTradeThreshold) {
        trades.push({
          symbol: pos.symbol,
          side: 'sell',
          targetWeight: 0,
          currentWeight: pos.weight,
          deltaWeight: -pos.weight,
          estimatedShares: pos.qty,
          estimatedValue: -pos.marketValue,
          sourceAnalysts: ['Risk Sentinel'],
          compositeScore: sellPick.compositeScore,
        });
      }
    });

    return trades;
  }

  // -------------------------------------------------------------------------
  // Context builders
  // -------------------------------------------------------------------------

  private buildPortfolioContext(portfolio: any): string {
    if (portfolio.positions.length === 0) {
      return `CURRENT PORTFOLIO: Empty (starting fresh)\nACCOUNT VALUE: $${portfolio.totalValue.toFixed(2)}\nCASH: $${portfolio.cash.toFixed(2)}`;
    }

    let context = `ACCOUNT VALUE: $${portfolio.totalValue.toFixed(2)}\nCASH: $${portfolio.cash.toFixed(2)}\n\nCURRENT HOLDINGS:\n`;
    portfolio.positions.forEach((pos: any) => {
      context += `- ${pos.symbol}: ${pos.qty} shares @ $${pos.currentPrice.toFixed(2)} (${(pos.weight * 100).toFixed(1)}% of portfolio, P&L: ${pos.unrealizedPnlPercent.toFixed(1)}%)\n`;
    });
    return context;
  }

  private buildMarketContext(skillsBlock: string): string {
    return [
      `DATE: ${new Date().toLocaleDateString()}`,
      `TIME: ${new Date().toLocaleTimeString()} ET`,
      '',
      skillsBlock,
      '',
      'INSTRUCTIONS: The skill data above was fetched live before this run. Use it as primary input.',
      'Cross-reference technicals (tradingview-claw) with news (ai-news-oracle) and fundamentals (dexter).',
      'Use prediction data (polyclaw + minara) to gauge event certainty on catalyst plays.',
      'Use stock-analysis scores for additional conviction calibration.',
      'Do NOT generate order intent without considering all data sources.',
      'All picks still route through the Risk Engine as normal.',
    ].join('\n');
  }

  private getDefaultWatchlist(): string[] {
    return ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'SPY', 'QQQ'];
  }
}
