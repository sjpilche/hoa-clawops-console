// =============================================================================
// Audit Logger
// =============================================================================
// Every panel run is logged in full: config, analyst reports, consensus,
// trades executed, and portfolio before/after. This is your debugging
// lifeline and your backtest data source.
// =============================================================================

import * as fs from 'fs';
import * as path from 'path';
import { PanelRunLog } from '../types';

const LOG_DIR = process.env.PANEL_LOG_DIR || './logs/panel-runs';

/** Ensure log directory exists */
function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

/** Generate a unique run ID */
export function generateRunId(): string {
  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const random = Math.random().toString(36).slice(2, 8);
  return `panel-${dateStr}-${random}`;
}

/** Save a complete panel run log to disk */
export function saveRunLog(log: PanelRunLog): string {
  ensureLogDir();

  const filename = `${log.runId}.json`;
  const filepath = path.join(LOG_DIR, filename);

  const serializable = {
    ...log,
    timestamp: log.timestamp.toISOString(),
    portfolioBefore: {
      ...log.portfolioBefore,
      timestamp: log.portfolioBefore.timestamp.toISOString(),
    },
    portfolioAfter: log.portfolioAfter ? {
      ...log.portfolioAfter,
      timestamp: log.portfolioAfter.timestamp.toISOString(),
    } : null,
    reports: log.reports.map(r => ({
      ...r,
      timestamp: r.timestamp.toISOString(),
      // Truncate raw LLM response to save space
      rawResponse: r.rawResponse.length > 5000
        ? r.rawResponse.slice(0, 5000) + '...[truncated]'
        : r.rawResponse,
    })),
    consensus: {
      ...log.consensus,
      timestamp: log.consensus.timestamp.toISOString(),
    },
  };

  fs.writeFileSync(filepath, JSON.stringify(serializable, null, 2));
  console.log(`📝 Run log saved: ${filepath}`);

  return filepath;
}

/** Print a human-readable summary of a panel run */
export function printRunSummary(log: PanelRunLog): void {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📋 PANEL RUN SUMMARY — ${log.runId}`);
  console.log(`${'═'.repeat(60)}`);

  // Portfolio before
  console.log(`\n💰 Portfolio: $${log.portfolioBefore.totalValue.toFixed(2)}`);
  console.log(`   Cash: $${log.portfolioBefore.cash.toFixed(2)}`);
  console.log(`   Positions: ${log.portfolioBefore.positions.length}`);

  // Analyst reports
  console.log(`\n🔍 Analyst Reports:`);
  for (const report of log.reports) {
    const status = report.picks.length > 0 ? '📊' : '💤';
    console.log(
      `   ${status} ${report.analystName} (${report.provider}): ` +
      `${report.picks.length} picks, ${report.latencyMs}ms, ~$${report.costEstimateUSD.toFixed(4)}`
    );
    for (const pick of report.picks) {
      const emoji = pick.side === 'buy' ? '🟢' : '🔴';
      console.log(
        `      ${emoji} ${pick.symbol} ${pick.side} c=${pick.conviction} — ${pick.thesis.slice(0, 60)}...`
      );
    }
  }

  // Consensus
  const consensus = log.consensus;
  console.log(`\n🤝 Consensus: ${consensus.aggregatedPicks.length} aggregated picks`);
  for (const pick of consensus.aggregatedPicks) {
    const emoji = pick.side === 'buy' ? '🟢' : '🔴';
    console.log(
      `   ${emoji} ${pick.symbol} score=${pick.compositeScore} analysts=${pick.analystCount} ` +
      `weight=${(pick.targetWeight * 100).toFixed(1)}%`
    );
  }

  // Actions
  const action = consensus.portfolioAction;
  console.log(`\n⚡ Portfolio Action: ${action.rebalanceTrades.length} trades`);
  console.log(`   Reasoning: ${action.reasoning}`);
  console.log(`   Turnover: ${(action.totalTurnover * 100).toFixed(1)}%`);
  console.log(`   Est. Cost: $${action.estimatedCost.toFixed(4)}`);

  // Execution results
  console.log(`\n📊 Trades Executed: ${log.tradesExecuted.length}`);
  for (const trade of log.tradesExecuted) {
    console.log(
      `   ${trade.side === 'buy' ? '🟢' : '🔴'} ${trade.symbol}: ` +
      `${trade.estimatedShares} shares ($${trade.estimatedValue.toFixed(2)})`
    );
  }

  // Costs
  console.log(`\n💵 Total LLM Cost: $${log.totalLLMCost.toFixed(4)}`);

  if (log.errors.length > 0) {
    console.log(`\n⚠️  Errors: ${log.errors.length}`);
    for (const err of log.errors) {
      console.log(`   - ${err}`);
    }
  }

  console.log(`${'═'.repeat(60)}\n`);
}

/** Load a past run log */
export function loadRunLog(runId: string): PanelRunLog | null {
  const filepath = path.join(LOG_DIR, `${runId}.json`);
  if (!fs.existsSync(filepath)) return null;

  const raw = fs.readFileSync(filepath, 'utf-8');
  return JSON.parse(raw);
}

/** List all past run logs */
export function listRunLogs(): string[] {
  ensureLogDir();
  return fs.readdirSync(LOG_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''))
    .sort()
    .reverse();
}
