// =============================================================================
// AI Panel Runner - Main Orchestration
// =============================================================================
// Runs the full panel: analysts → aggregator → executor
// =============================================================================

import { LLMClient } from './llm-client';
import { GROK_MARKET_ANALYST, GROK_PANEL_CONFIG } from './grok-config';
import { OpenClawExecutor } from './openclaw-executor';
import { AnalystReport, AnalystPick, AggregatedPick, RebalanceTrade, PanelRunLog } from './index';
import { v4 as uuidv4 } from 'uuid';

export interface PanelRunOptions {
  dryRun?: boolean;  // If true, don't execute trades
  watchlist?: string[];  // Override default watchlist
}

export interface PanelRunResult {
  runId: string;
  timestamp: Date;
  report: AnalystReport;
  aggregatedPicks: AggregatedPick[];
  trades: RebalanceTrade[];
  executed: boolean;
  executionResults?: any[];
  error?: string;
}

export class PanelRunner {
  private llmClient: LLMClient;
  private executor: OpenClawExecutor;

  constructor() {
    this.llmClient = new LLMClient();
    this.executor = new OpenClawExecutor();
  }

  /**
   * Run the full AI panel
   */
  async run(options: PanelRunOptions = {}): Promise<PanelRunResult> {
    const runId = uuidv4();
    const timestamp = new Date();

    console.log(`\n${'='.repeat(80)}`);
    console.log(`🦞 AI ANALYST PANEL RUN - ${timestamp.toLocaleString()}`);
    console.log(`Run ID: ${runId}`);
    console.log(`Mode: ${options.dryRun ? 'DRY RUN (no trades)' : 'LIVE EXECUTION'}`);
    console.log(`${'='.repeat(80)}\n`);

    try {
      // Step 1: Get current portfolio
      console.log('📊 Fetching portfolio from Alpaca...');
      const portfolio = await this.executor.getPortfolioSnapshot();
      console.log(`   Total value: $${portfolio.totalValue.toFixed(2)}`);
      console.log(`   Cash: $${portfolio.cash.toFixed(2)}`);
      console.log(`   Positions: ${portfolio.positions.length}`);
      console.log(`   DEBUG: portfolio object =`, JSON.stringify(portfolio, null, 2));

      // Step 2: Build market context
      const portfolioContext = this.buildPortfolioContext(portfolio);
      const marketContext = this.buildMarketContext();
      const watchlist = options.watchlist || this.getDefaultWatchlist();

      // Step 3: Run Grok analyst
      console.log('🤖 Calling Grok Market Analyst...');
      const report = await this.runAnalyst(portfolioContext, marketContext, watchlist.join(', '));

      console.log(`\n📈 Market Commentary: ${report.marketCommentary}`);
      console.log(`🎯 Picks: ${report.picks.length}`);
      console.log(`💰 LLM Cost: $${report.costEstimateUSD.toFixed(4)}\n`);

      if (report.picks.length > 0) {
        console.log('📋 Grok Recommendations:\n');
        report.picks.forEach((pick, i) => {
          console.log(`${i + 1}. ${pick.side.toUpperCase()} ${pick.symbol} (conviction: ${pick.conviction}/5)`);
          console.log(`   Type: ${pick.opportunityType}`);
          console.log(`   Thesis: ${pick.thesis}`);
          console.log(`   Risks: ${pick.risks}\n`);
        });
      }

      // Step 4: Aggregate picks and calculate rebalance trades
      const aggregatedPicks = this.aggregatePicks([report]);
      const trades = this.calculateRebalanceTrades(portfolio, aggregatedPicks);

      console.log(`💼 Portfolio Actions: ${trades.length} trade(s)`);

      if (trades.length > 0) {
        trades.forEach(trade => {
          console.log(`   ${trade.side.toUpperCase()} ${trade.symbol}: ${trade.estimatedShares} shares ($${trade.estimatedValue.toFixed(2)})`);
        });
      } else {
        console.log('   No rebalancing needed\n');
      }

      // Step 5: Execute trades (if not dry run)
      let executionResults;
      if (!options.dryRun && trades.length > 0) {
        console.log('\n🚀 Executing trades through Alpaca...\n');
        executionResults = await this.executor.executePortfolioRebalance(trades);
      } else if (options.dryRun && trades.length > 0) {
        console.log('\n🏃 DRY RUN - Trades NOT executed\n');
      }

      console.log(`${'='.repeat(80)}`);
      console.log('✅ Panel run complete');
      console.log(`DEBUG: About to return trades:`, JSON.stringify(trades, null, 2));
      console.log(`${'='.repeat(80)}\n`);

      return {
        runId,
        timestamp,
        report,
        aggregatedPicks,
        trades,
        executed: !options.dryRun && trades.length > 0,
        executionResults,
      };

    } catch (error: any) {
      console.error('❌ Panel run failed:', error.message);
      return {
        runId,
        timestamp,
        report: {} as any,
        aggregatedPicks: [],
        trades: [],
        executed: false,
        error: error.message,
      };
    }
  }

  /**
   * Run single analyst
   */
  private async runAnalyst(portfolio: string, market: string, watchlist: string): Promise<AnalystReport> {
    const analyst = GROK_MARKET_ANALYST;

    const userPrompt = analyst.userPromptTemplate
      .replace('{portfolio}', portfolio)
      .replace('{market_data}', market)
      .replace('{universe}', watchlist);

    const response = await this.llmClient.call({
      provider: analyst.provider,
      model: analyst.model,
      systemPrompt: analyst.systemPrompt,
      userPrompt,
      temperature: analyst.temperature,
      maxTokens: 4096,
    });

    const parsed = JSON.parse(response.content);

    return {
      analystId: analyst.id,
      analystName: analyst.name,
      provider: analyst.provider,
      timestamp: new Date(),
      scanFocus: analyst.focusArea,
      picks: parsed.picks || [],
      marketCommentary: parsed.marketCommentary || '',
      rawResponse: response.content,
      promptTokens: response.promptTokens,
      completionTokens: response.completionTokens,
      costEstimateUSD: this.llmClient.estimateCost(analyst.provider, analyst.model, response.promptTokens, response.completionTokens),
      latencyMs: response.latencyMs,
    };
  }

  /**
   * Aggregate picks from all analysts
   */
  private aggregatePicks(reports: AnalystReport[]): AggregatedPick[] {
    const picksBySymbol = new Map<string, AnalystPick[]>();

    reports.forEach(report => {
      report.picks.forEach(pick => {
        const existing = picksBySymbol.get(pick.symbol) || [];
        existing.push(pick);
        picksBySymbol.set(pick.symbol, existing);
      });
    });

    const aggregated: AggregatedPick[] = [];

    picksBySymbol.forEach((picks, symbol) => {
      const buyPicks = picks.filter(p => p.side === 'buy');
      const sellPicks = picks.filter(p => p.side === 'sell');

      // If conflicted, skip
      if (buyPicks.length > 0 && sellPicks.length > 0) {
        console.log(`⚠️  Skipping ${symbol} - conflicting signals`);
        return;
      }

      const relevantPicks = buyPicks.length > 0 ? buyPicks : sellPicks;
      const side = buyPicks.length > 0 ? 'buy' : 'sell';

      const avgConviction = relevantPicks.reduce((sum, p) => sum + p.conviction, 0) / relevantPicks.length;
      const maxConviction = Math.max(...relevantPicks.map(p => p.conviction));

      // Simple scoring for single analyst
      const compositeScore = (avgConviction / 5) * 100;

      if (compositeScore >= GROK_PANEL_CONFIG.minScoreToAct) {
        aggregated.push({
          symbol,
          side,
          analystCount: relevantPicks.length,
          avgConviction,
          maxConviction: maxConviction as any,
          opportunityTypes: relevantPicks.map(p => p.opportunityType),
          theses: relevantPicks.map(p => p.thesis),
          compositeScore,
          targetWeight: this.calculateTargetWeight(avgConviction, relevantPicks.length),
        });
      }
    });

    return aggregated.sort((a, b) => b.compositeScore - a.compositeScore);
  }

  /**
   * Calculate target weight based on conviction
   */
  private calculateTargetWeight(conviction: number, analystCount: number): number {
    const baseWeight = (conviction / 5) * GROK_PANEL_CONFIG.maxSinglePositionWeight;
    return Math.min(baseWeight, GROK_PANEL_CONFIG.maxSinglePositionWeight);
  }

  /**
   * Calculate rebalance trades
   */
  private calculateRebalanceTrades(portfolio: any, picks: AggregatedPick[]): RebalanceTrade[] {
    const trades: RebalanceTrade[] = [];
    const targetPortfolio = new Map<string, number>();

    console.log(`[calculateRebalanceTrades] Portfolio total value: $${portfolio.totalValue}, cash: $${portfolio.cash}`);

    // Build target portfolio from picks
    picks.slice(0, GROK_PANEL_CONFIG.maxPositions).forEach(pick => {
      if (pick.side === 'buy') {
        targetPortfolio.set(pick.symbol, pick.targetWeight);
        console.log(`[calculateRebalanceTrades] Target: ${pick.symbol} = ${(pick.targetWeight * 100).toFixed(1)}%`);
      }
    });

    // Calculate buys
    targetPortfolio.forEach((targetWeight, symbol) => {
      const currentPosition = portfolio.positions.find((p: any) => p.symbol === symbol);
      const currentWeight = currentPosition ? currentPosition.weight : 0;
      const deltaWeight = targetWeight - currentWeight;

      console.log(`[calculateRebalanceTrades] ${symbol}: target=${(targetWeight*100).toFixed(1)}%, current=${(currentWeight*100).toFixed(1)}%, delta=${(deltaWeight*100).toFixed(1)}%`);

      if (Math.abs(deltaWeight) >= GROK_PANEL_CONFIG.minTradeThreshold) {
        const estimatedValue = deltaWeight * portfolio.totalValue;
        const pick = picks.find(p => p.symbol === symbol)!;

        console.log(`[calculateRebalanceTrades] Creating trade: ${deltaWeight > 0 ? 'BUY' : 'SELL'} ${symbol}, value=$${estimatedValue.toFixed(2)}`);

        const estShares = Math.abs(estimatedValue / 100);
        const estValue = estimatedValue;

        console.log(`[DEBUG] About to push trade: estShares=${estShares}, estValue=${estValue}`);

        trades.push({
          symbol,
          side: deltaWeight > 0 ? 'buy' : 'sell',
          targetWeight,
          currentWeight,
          deltaWeight,
          estimatedShares: estShares, // Rough estimate, will be refined by executor
          estimatedValue: estValue,
          sourceAnalysts: [GROK_MARKET_ANALYST.name],
          compositeScore: pick.compositeScore,
        });
      }
    });

    // Calculate sells for positions not in target
    portfolio.positions.forEach((pos: any) => {
      if (!targetPortfolio.has(pos.symbol) && pos.weight >= GROK_PANEL_CONFIG.minTradeThreshold) {
        trades.push({
          symbol: pos.symbol,
          side: 'sell',
          targetWeight: 0,
          currentWeight: pos.weight,
          deltaWeight: -pos.weight,
          estimatedShares: pos.qty,
          estimatedValue: -pos.marketValue,
          sourceAnalysts: [],
          compositeScore: 0,
        });
      }
    });

    return trades;
  }

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

  private buildMarketContext(): string {
    return `DATE: ${new Date().toLocaleDateString()}\nTIME: ${new Date().toLocaleTimeString()} ET\n\nUse your real-time X/Twitter access to detect trending tickers and sentiment.\nFocus on liquid names with clear catalysts.`;
  }

  private getDefaultWatchlist(): string[] {
    return ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'SPY', 'QQQ'];
  }
}
