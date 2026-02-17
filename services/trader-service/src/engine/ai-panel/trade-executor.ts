// =============================================================================
// Trade Executor
// =============================================================================
// Takes the portfolio action from the aggregator and submits orders through
// OpenClaw's API (which applies the 9 pre-trade risk checks).
// We NEVER hit Alpaca directly — always go through the risk engine.
// =============================================================================

import { RebalanceTrade, PortfolioSnapshot } from '../types';

const OPENCLAW_BASE = process.env.OPENCLAW_TRADER_URL || 'http://localhost:3002';

interface ExecutionResult {
  trade: RebalanceTrade;
  success: boolean;
  orderId?: string;
  error?: string;
  riskCheckPassed: boolean;
}

/**
 * Execute trades through OpenClaw's risk engine.
 *
 * Important: This submits to OpenClaw's /api/orders endpoint, NOT directly
 * to Alpaca. OpenClaw applies all 9 pre-trade checks before forwarding.
 */
export async function executeTrades(
  trades: RebalanceTrade[],
  portfolio: PortfolioSnapshot,
  dryRun: boolean = false,
): Promise<ExecutionResult[]> {
  if (trades.length === 0) {
    console.log('\n💤 No trades to execute.');
    return [];
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`⚡ EXECUTING ${trades.length} TRADES ${dryRun ? '(DRY RUN)' : ''}`);
  console.log(`${'='.repeat(60)}`);

  // Pre-flight: check kill switch
  const killSwitchOk = await checkKillSwitch();
  if (!killSwitchOk) {
    console.log('🚨 Kill switch is triggered — aborting all trades.');
    return trades.map(t => ({
      trade: t,
      success: false,
      error: 'Kill switch triggered',
      riskCheckPassed: false,
    }));
  }

  const results: ExecutionResult[] = [];

  // Execute sells first (free up buying power)
  const sells = trades.filter(t => t.side === 'sell');
  const buys = trades.filter(t => t.side === 'buy');

  for (const trade of [...sells, ...buys]) {
    const result = await executeSingleTrade(trade, portfolio, dryRun);
    results.push(result);

    // Small delay between orders to be respectful to broker API
    await sleep(500);
  }

  // Summary
  const successes = results.filter(r => r.success).length;
  const failures = results.filter(r => !r.success).length;
  const riskRejects = results.filter(r => !r.riskCheckPassed).length;

  console.log(`\n📊 Execution Summary:`);
  console.log(`   ✅ Successful: ${successes}`);
  console.log(`   ❌ Failed: ${failures}`);
  console.log(`   🛡️  Risk-rejected: ${riskRejects}`);

  return results;
}

async function executeSingleTrade(
  trade: RebalanceTrade,
  portfolio: PortfolioSnapshot,
  dryRun: boolean,
): Promise<ExecutionResult> {
  const emoji = trade.side === 'buy' ? '🟢' : '🔴';
  console.log(
    `\n${emoji} ${trade.side.toUpperCase()} ${trade.symbol}: ` +
    `${trade.estimatedShares} shares (~$${trade.estimatedValue.toFixed(2)}) ` +
    `[score: ${trade.compositeScore}]`
  );

  if (dryRun) {
    console.log(`   📝 DRY RUN — would submit to OpenClaw`);
    return {
      trade,
      success: true,
      orderId: `dry-run-${Date.now()}`,
      riskCheckPassed: true,
    };
  }

  // Submit to OpenClaw's order endpoint
  // This is where the 9 pre-trade risk checks happen
  try {
    const orderPayload = {
      symbol: trade.symbol,
      side: trade.side,
      qty: trade.estimatedShares,
      type: 'market',        // For paper trading. Switch to 'limit' for live.
      time_in_force: 'day',
      source: 'ai-analyst-panel',
      metadata: {
        compositeScore: trade.compositeScore,
        sourceAnalysts: trade.sourceAnalysts,
        targetWeight: trade.targetWeight,
        deltaWeight: trade.deltaWeight,
      },
    };

    const response = await fetch(`${OPENCLAW_BASE}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload),
    });

    if (!response.ok) {
      const errorBody = await response.text();

      // Check if it was a risk check rejection
      if (response.status === 422 || response.status === 403) {
        console.log(`   🛡️  Risk check REJECTED: ${errorBody}`);
        return {
          trade,
          success: false,
          error: errorBody,
          riskCheckPassed: false,
        };
      }

      throw new Error(`Order API error ${response.status}: ${errorBody}`);
    }

    const order = await response.json();
    console.log(`   ✅ Order submitted: ${order.orderId || order.id}`);

    return {
      trade,
      success: true,
      orderId: order.orderId || order.id,
      riskCheckPassed: true,
    };

  } catch (error) {
    console.error(`   ❌ Execution error:`, error);
    return {
      trade,
      success: false,
      error: String(error),
      riskCheckPassed: true, // We don't know — assume risk wasn't the issue
    };
  }
}

// ---------------------------------------------------------------------------
// Fallback: Direct Alpaca submission (for when OpenClaw order endpoint
// isn't implemented yet — Phase 1 only)
// ---------------------------------------------------------------------------

const ALPACA_BASE = process.env.BROKER_BASE_URL || 'https://paper-api.alpaca.markets';
const ALPACA_KEY = process.env.BROKER_API_KEY || '';
const ALPACA_SECRET = process.env.BROKER_API_SECRET || '';

export async function executeTradesDirectAlpaca(
  trades: RebalanceTrade[],
  dryRun: boolean = false,
): Promise<ExecutionResult[]> {
  console.log('\n⚠️  Using DIRECT Alpaca execution (OpenClaw risk engine bypassed)');
  console.log('   This is for Phase 1 testing only. Use executeTrades() in production.');

  if (trades.length === 0) {
    console.log('💤 No trades to execute.');
    return [];
  }

  const results: ExecutionResult[] = [];

  for (const trade of trades) {
    if (trade.estimatedShares <= 0) continue;

    const emoji = trade.side === 'buy' ? '🟢' : '🔴';
    console.log(
      `${emoji} ${trade.side.toUpperCase()} ${trade.symbol}: ` +
      `${trade.estimatedShares} shares`
    );

    if (dryRun) {
      results.push({ trade, success: true, orderId: `dry-${Date.now()}`, riskCheckPassed: true });
      continue;
    }

    try {
      // Alpaca supports fractional shares — useful for small accounts
      const useNotional = trade.estimatedValue < 50; // Use dollar amount for tiny trades

      const orderBody: any = {
        symbol: trade.symbol,
        side: trade.side,
        type: 'market',
        time_in_force: 'day',
      };

      if (useNotional && trade.side === 'buy') {
        orderBody.notional = trade.estimatedValue.toFixed(2);
      } else {
        orderBody.qty = String(trade.estimatedShares);
      }

      const response = await fetch(`${ALPACA_BASE}/v2/orders`, {
        method: 'POST',
        headers: {
          'APCA-API-KEY-ID': ALPACA_KEY,
          'APCA-API-SECRET-KEY': ALPACA_SECRET,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderBody),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Alpaca error ${response.status}: ${err}`);
      }

      const order = await response.json();
      console.log(`   ✅ Alpaca order: ${order.id} (${order.status})`);

      results.push({
        trade,
        success: true,
        orderId: order.id,
        riskCheckPassed: true,
      });

    } catch (error) {
      console.error(`   ❌ Error:`, error);
      results.push({
        trade,
        success: false,
        error: String(error),
        riskCheckPassed: true,
      });
    }

    await sleep(300);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function checkKillSwitch(): Promise<boolean> {
  try {
    const res = await fetch(`${OPENCLAW_BASE}/api/kill-switch/status`);
    if (!res.ok) return true; // If we can't check, assume ok (fail open for paper)
    const data = await res.json();
    return data.status !== 'triggered';
  } catch {
    console.warn('⚠️  Could not check kill switch — proceeding (paper mode assumed)');
    return true;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
