#!/usr/bin/env ts-node
// =============================================================================
// AI Analyst Panel — Daily Runner
// =============================================================================
// This is the main entry point. Run it once daily (or on a schedule).
// It orchestrates: fetch data → run analysts → aggregate → decide → execute.
//
// Usage:
//   npx ts-node run-panel.ts                    # Full run (paper trading)
//   npx ts-node run-panel.ts --dry-run          # Analyze only, don't trade
//   npx ts-node run-panel.ts --analysts=2       # Run only first N analysts
//   npx ts-node run-panel.ts --min-score=70     # Override minimum score
// =============================================================================

import { ALL_ANALYSTS, DEFAULT_PANEL_CONFIG } from './prompts/analyst-prompts';
import { getPortfolioSnapshot, buildMarketContext, getDefaultWatchlist } from './core/market-data';
import { runAllAnalysts } from './core/analyst-runner';
import { aggregatePanel } from './core/panel-aggregator';
import { executeTrades, executeTradesDirectAlpaca } from './core/trade-executor';
import { generateRunId, saveRunLog, printRunSummary } from './core/audit-logger';
import { PanelConfig, PanelRunLog } from './types';

// =============================================================================
// Configuration
// =============================================================================

function parseArgs(): {
  dryRun: boolean;
  maxAnalysts: number;
  minScore: number;
  directAlpaca: boolean;
} {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    maxAnalysts: parseInt(args.find(a => a.startsWith('--analysts='))?.split('=')[1] || '99'),
    minScore: parseInt(args.find(a => a.startsWith('--min-score='))?.split('=')[1] || '0'),
    directAlpaca: args.includes('--direct-alpaca'),
  };
}

// =============================================================================
// Main Execution Flow
// =============================================================================

async function main() {
  const startTime = Date.now();
  const runId = generateRunId();
  const args = parseArgs();
  const errors: string[] = [];

  console.log(`\n${'🦞'.repeat(30)}`);
  console.log(`🦞  OpenClaw AI Analyst Panel`);
  console.log(`🦞  Run ID: ${runId}`);
  console.log(`🦞  Time:   ${new Date().toISOString()}`);
  console.log(`🦞  Mode:   ${args.dryRun ? 'DRY RUN (no trades)' : 'LIVE (paper trading)'}`);
  console.log(`${'🦞'.repeat(30)}\n`);

  // -------------------------------------------------------------------------
  // Step 1: Fetch current portfolio
  // -------------------------------------------------------------------------
  console.log('📊 Step 1: Fetching portfolio from Alpaca...');
  let portfolio;
  try {
    portfolio = await getPortfolioSnapshot();
    console.log(`   Portfolio value: $${portfolio.totalValue.toFixed(2)}`);
    console.log(`   Cash: $${portfolio.cash.toFixed(2)}`);
    console.log(`   Positions: ${portfolio.positions.length}`);

    if (portfolio.positions.length > 0) {
      for (const pos of portfolio.positions) {
        const pnlEmoji = pos.unrealizedPnl >= 0 ? '📈' : '📉';
        console.log(
          `   ${pnlEmoji} ${pos.symbol}: ${pos.qty} shares @ $${pos.currentPrice.toFixed(2)} ` +
          `(${pos.unrealizedPnlPercent >= 0 ? '+' : ''}${pos.unrealizedPnlPercent.toFixed(1)}%)`
        );
      }
    }
  } catch (err) {
    console.error('❌ Failed to fetch portfolio:', err);
    console.log('   Using mock portfolio for testing...');
    portfolio = {
      timestamp: new Date(),
      totalValue: 100,
      cash: 100,
      positions: [],
    };
    errors.push(`Portfolio fetch failed: ${err}`);
  }

  // -------------------------------------------------------------------------
  // Step 2: Build market context
  // -------------------------------------------------------------------------
  console.log('\n📈 Step 2: Building market context...');
  let marketContext: string;
  try {
    const watchlist = getDefaultWatchlist();
    marketContext = await buildMarketContext(portfolio, watchlist);
    console.log(`   Market data assembled (${marketContext.length} chars)`);
  } catch (err) {
    console.warn('⚠️  Market context fetch failed, using minimal:', err);
    marketContext = `Date: ${new Date().toISOString().split('T')[0]}\nMarket data unavailable.`;
    errors.push(`Market context failed: ${err}`);
  }

  // -------------------------------------------------------------------------
  // Step 3: Run analyst panel
  // -------------------------------------------------------------------------
  console.log('\n🔍 Step 3: Running AI analysts...');
  const analysts = ALL_ANALYSTS.slice(0, args.maxAnalysts);
  const universe = getDefaultWatchlist().join(', ');

  const reports = await runAllAnalysts(analysts, portfolio, marketContext, universe);

  // -------------------------------------------------------------------------
  // Step 4: Aggregate into consensus
  // -------------------------------------------------------------------------
  console.log('\n🤝 Step 4: Aggregating analyst consensus...');
  const panelConfig: PanelConfig = {
    ...DEFAULT_PANEL_CONFIG,
    minScoreToAct: args.minScore || DEFAULT_PANEL_CONFIG.minScoreToAct,
  };

  const consensus = aggregatePanel(reports, portfolio, panelConfig);

  console.log(`   Aggregated picks: ${consensus.aggregatedPicks.length}`);
  console.log(`   Trades proposed: ${consensus.portfolioAction.rebalanceTrades.length}`);
  console.log(`   Reasoning: ${consensus.portfolioAction.reasoning}`);

  // -------------------------------------------------------------------------
  // Step 5: Execute trades (or dry run)
  // -------------------------------------------------------------------------
  console.log('\n⚡ Step 5: Executing trades...');
  let executedTrades = consensus.portfolioAction.rebalanceTrades;

  if (consensus.portfolioAction.rebalanceTrades.length > 0) {
    if (args.directAlpaca) {
      // Phase 1: Direct to Alpaca (bypasses OpenClaw risk engine)
      const results = await executeTradesDirectAlpaca(
        consensus.portfolioAction.rebalanceTrades,
        args.dryRun,
      );
      executedTrades = results.filter(r => r.success).map(r => r.trade);
    } else {
      // Production: Through OpenClaw risk engine
      const results = await executeTrades(
        consensus.portfolioAction.rebalanceTrades,
        portfolio,
        args.dryRun,
      );
      executedTrades = results.filter(r => r.success).map(r => r.trade);
    }
  }

  // -------------------------------------------------------------------------
  // Step 6: Log everything
  // -------------------------------------------------------------------------
  console.log('\n📝 Step 6: Saving audit log...');
  const totalLLMCost = reports.reduce((sum, r) => sum + r.costEstimateUSD, 0);

  const runLog: PanelRunLog = {
    runId,
    timestamp: new Date(),
    config: panelConfig,
    portfolioBefore: portfolio,
    reports,
    consensus,
    tradesExecuted: executedTrades,
    portfolioAfter: undefined, // Could fetch again after trades settle
    totalLLMCost,
    errors,
  };

  const logPath = saveRunLog(runLog);
  printRunSummary(runLog);

  // -------------------------------------------------------------------------
  // Done
  // -------------------------------------------------------------------------
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ Panel run complete in ${duration}s`);
  console.log(`   Run ID: ${runId}`);
  console.log(`   Log: ${logPath}`);
  console.log(`   LLM cost: $${totalLLMCost.toFixed(4)}`);
  console.log(`   Trades: ${executedTrades.length} executed`);

  if (errors.length > 0) {
    console.log(`\n⚠️  ${errors.length} errors occurred (see log for details)`);
  }
}

// =============================================================================
// Entry point
// =============================================================================
main().catch(err => {
  console.error('\n💥 FATAL ERROR:', err);
  process.exit(1);
});
