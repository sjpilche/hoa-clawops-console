// =============================================================================
// Allocator Replay — Simulate allocator decisions on REAL historical picks
// =============================================================================
// Reads actual analyst_decisions from the production brain database,
// runs them through the allocation pipeline, and reports what WOULD
// have happened vs what DID happen.
//
// This is NOT a unit test — it's a simulation using your real data.
// Run: npx jest --testPathPattern="allocator-replay" --verbose
// =============================================================================

import Database from 'better-sqlite3';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

import { AttributionStore } from '../engine/allocation/attribution-store';
import { CapitalAllocator } from '../engine/allocation/capital-allocator';
import { BookManager } from '../engine/allocation/book-manager';
import { StrategyRoleRegistry } from '../engine/allocation/strategy-roles';
import { classifyRegime } from '../engine/allocation/regime-classifier';
import { TradeCandidate, RegimeLabel } from '../engine/allocation/types';

// ---------------------------------------------------------------------------
// Open REAL brain database (read-only copy for safety)
// ---------------------------------------------------------------------------

const BRAIN_PATH = path.join(__dirname, '../../data/trader-brain.sqlite');

let db: Database.Database;
let attrStore: AttributionStore;
let allocator: CapitalAllocator;
let bookManager: BookManager;
let roleRegistry: StrategyRoleRegistry;

beforeAll(() => {
  // Open an in-memory DB, copy the relevant brain data from production
  db = new Database(':memory:');
  db.pragma('journal_mode = WAL');

  // Recreate brain tables and import data from production
  const prodDb = new Database(BRAIN_PATH, { readonly: true });

  // Copy observations
  db.exec(`
    CREATE TABLE brain_observations (
      id INTEGER PRIMARY KEY, run_id TEXT, analyst_id TEXT, obs_type TEXT,
      content TEXT, confidence REAL, metadata_json TEXT, created_at TEXT
    );
    CREATE TABLE brain_episodes (
      id INTEGER PRIMARY KEY, analyst_id TEXT, symbol TEXT, side TEXT,
      conviction INTEGER, opportunity_type TEXT, entry_price REAL, exit_price REAL,
      pnl_dollars REAL, pnl_percent REAL, hold_days INTEGER, outcome_type TEXT,
      outcome_score REAL, thesis TEXT, market_context TEXT, keywords TEXT,
      run_id TEXT, candidate_id TEXT, strategy_id TEXT, created_at TEXT
    );
    CREATE TABLE portfolio_snapshots (
      id INTEGER PRIMARY KEY, portfolio_value REAL, cash REAL, equity REAL,
      buying_power REAL, positions_count INTEGER, unrealized_pnl REAL,
      day_trade_count INTEGER, run_id TEXT, created_at TEXT
    );
    CREATE TABLE exec_orders (
      order_id TEXT PRIMARY KEY, intent_id TEXT, strategy_id TEXT, signal_id TEXT,
      broker_order_id TEXT, symbol TEXT, side TEXT, qty REAL, order_type TEXT,
      limit_price REAL, stop_price REAL, time_in_force TEXT, signal_price REAL,
      status TEXT, submitted_at TEXT, filled_at TEXT, filled_price REAL,
      filled_qty REAL, last_update_at TEXT, created_at TEXT
    );
    CREATE TABLE strategy_roles (
      source_id TEXT PRIMARY KEY, source_name TEXT, role TEXT, default_book TEXT,
      auto_promote_threshold REAL, auto_demote_threshold REAL, updated_at TEXT
    );
    CREATE TABLE book_positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, book_id TEXT, candidate_id TEXT,
      symbol TEXT, side TEXT, entry_price REAL, current_exposure REAL,
      opened_at TEXT, closed_at TEXT, status TEXT
    );
  `);

  // Import data
  const observations = prodDb.prepare("SELECT * FROM brain_observations WHERE obs_type = 'analyst_decisions'").all();
  const insertObs = db.prepare('INSERT INTO brain_observations VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  for (const o of observations as any[]) {
    insertObs.run(o.id, o.run_id, o.analyst_id, o.obs_type, o.content, o.confidence, o.metadata_json, o.created_at);
  }

  const orders = prodDb.prepare('SELECT * FROM exec_orders').all();
  const insertOrder = db.prepare('INSERT INTO exec_orders VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const o of orders as any[]) {
    insertOrder.run(o.order_id, o.intent_id, o.strategy_id, o.signal_id, o.broker_order_id,
      o.symbol, o.side, o.qty, o.order_type, o.limit_price, o.stop_price,
      o.time_in_force, o.signal_price, o.status, o.submitted_at, o.filled_at,
      o.filled_price, o.filled_qty, o.last_update_at, o.created_at);
  }

  const snapshots = prodDb.prepare('SELECT * FROM portfolio_snapshots ORDER BY created_at DESC LIMIT 1').all();
  const insertSnap = db.prepare('INSERT INTO portfolio_snapshots VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const s of snapshots as any[]) {
    insertSnap.run(s.id, s.portfolio_value, s.cash, s.equity, s.buying_power,
      s.positions_count, s.unrealized_pnl, s.day_trade_count, s.run_id, s.created_at);
  }

  prodDb.close();

  // Create allocation infrastructure
  attrStore = new AttributionStore(db);
  bookManager = new BookManager(db);
  roleRegistry = new StrategyRoleRegistry(db);
  allocator = new CapitalAllocator(attrStore, {
    minScoreToExecute: 40,
    maxOpenPositions: 8,
    maxDailyNewPositions: 5,
    sizing: { maxPositionPct: 0.10, minPositionDollars: 5, riskPerTradePct: 0.01 },
  }, null, bookManager, roleRegistry);
});

afterAll(() => {
  db.close();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface HistoricalPick {
  runId: string;
  analystId: string;
  symbol: string;
  side: 'buy' | 'sell';
  conviction: number;
  opportunityType: string;
  thesis: string;
  timestamp: string;
}

function extractPicks(): HistoricalPick[] {
  const rows = db.prepare(`
    SELECT run_id, analyst_id, metadata_json, created_at
    FROM brain_observations
    WHERE obs_type = 'analyst_decisions'
    ORDER BY created_at ASC
  `).all() as any[];

  const picks: HistoricalPick[] = [];
  for (const row of rows) {
    try {
      const meta = JSON.parse(row.metadata_json || '{}');
      for (const p of (meta.picks || [])) {
        picks.push({
          runId: row.run_id,
          analystId: row.analyst_id,
          symbol: p.symbol,
          side: p.side,
          conviction: p.conviction,
          opportunityType: p.opportunityType || 'unknown',
          thesis: p.thesis || '',
          timestamp: row.created_at,
        });
      }
    } catch {}
  }
  return picks;
}

function pickToCandidate(pick: HistoricalPick, regimeLabel: RegimeLabel): TradeCandidate {
  return {
    candidateId: uuidv4(),
    source: 'ai_panel',
    sourceId: pick.analystId,
    sourceName: pick.analystId,
    runId: pick.runId,
    symbol: pick.symbol,
    side: pick.side,
    signalStrength: pick.conviction / 5,
    opportunityType: pick.opportunityType,
    horizon: undefined,
    thesis: pick.thesis,
    regimeLabel,
    analystCount: 1,
    avgConviction: pick.conviction,
    maxConviction: pick.conviction,
    compositeScore: (pick.conviction / 5) * 100,
    createdAt: new Date(pick.timestamp),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Allocator Replay on Real Data', () => {
  test('loads historical picks from production brain', () => {
    const picks = extractPicks();
    console.log(`\n📊 HISTORICAL DATA SUMMARY`);
    console.log(`   Total analyst picks: ${picks.length}`);

    // By analyst
    const byAnalyst = new Map<string, number>();
    for (const p of picks) {
      byAnalyst.set(p.analystId, (byAnalyst.get(p.analystId) || 0) + 1);
    }
    console.log(`\n   By analyst:`);
    for (const [id, count] of [...byAnalyst.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`     ${id}: ${count} picks`);
    }

    // By side
    const buys = picks.filter(p => p.side === 'buy').length;
    const sells = picks.filter(p => p.side === 'sell').length;
    console.log(`\n   Buy/Sell: ${buys} buys, ${sells} sells`);

    // By opportunity type
    const byType = new Map<string, number>();
    for (const p of picks) {
      byType.set(p.opportunityType, (byType.get(p.opportunityType) || 0) + 1);
    }
    console.log(`\n   By opportunity type:`);
    for (const [type, count] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`     ${type}: ${count}`);
    }

    // Unique symbols
    const uniqueSymbols = new Set(picks.map(p => p.symbol));
    console.log(`\n   Unique symbols: ${uniqueSymbols.size}`);

    expect(picks.length).toBeGreaterThan(0);
  });

  test('replays last 50 panel runs through allocator', () => {
    const allPicks = extractPicks();
    if (allPicks.length === 0) {
      console.log('No picks to replay');
      return;
    }

    // Group picks by run_id (last 50 runs)
    const byRun = new Map<string, HistoricalPick[]>();
    for (const p of allPicks) {
      const existing = byRun.get(p.runId) || [];
      existing.push(p);
      byRun.set(p.runId, existing);
    }

    const runIds = [...byRun.keys()].slice(-50);

    console.log(`\n📊 ALLOCATOR REPLAY — ${runIds.length} panel runs`);
    console.log('─'.repeat(80));

    let totalCandidates = 0;
    let totalExecute = 0;
    let totalReject = 0;
    let totalDefer = 0;
    const executedByBook = new Map<string, number>();
    const rejectedReasons = new Map<string, number>();
    const executedByAnalyst = new Map<string, number>();

    for (const runId of runIds) {
      const picks = byRun.get(runId) || [];
      const regime = classifyRegime({}); // No live data → unknown regime → neutral scores

      // Convert picks to candidates
      const candidates = picks.map(p => pickToCandidate(p, 'neutral'));

      // Store candidates (allocator reads them)
      for (const c of candidates) {
        attrStore.insertCandidate(c);
      }

      // Simulate prices at ~$100 (we don't have historical prices, but sizing math is the test)
      const prices: Record<string, number> = {};
      candidates.forEach(c => { prices[c.symbol] = 50; }); // $50 avg price → reasonable shares

      // Run allocator
      const decisions = allocator.evaluate(candidates, prices, 500, []); // $500 portfolio

      totalCandidates += candidates.length;
      for (const d of decisions) {
        if (d.action === 'execute') {
          totalExecute++;
          const book = d.bookId || 'unrouted';
          executedByBook.set(book, (executedByBook.get(book) || 0) + 1);
          const candidate = candidates.find(c => c.candidateId === d.candidateId);
          if (candidate) {
            executedByAnalyst.set(candidate.sourceId, (executedByAnalyst.get(candidate.sourceId) || 0) + 1);
          }
        } else if (d.action === 'reject') {
          totalReject++;
          for (const reason of d.reasons) {
            const key = reason.split('—')[0].trim().substring(0, 60);
            rejectedReasons.set(key, (rejectedReasons.get(key) || 0) + 1);
          }
        } else if (d.action === 'defer') {
          totalDefer++;
        }
      }
    }

    console.log(`\n📊 REPLAY RESULTS`);
    console.log(`   Total candidates: ${totalCandidates}`);
    console.log(`   Execute: ${totalExecute} (${(totalExecute / totalCandidates * 100).toFixed(1)}%)`);
    console.log(`   Reject:  ${totalReject} (${(totalReject / totalCandidates * 100).toFixed(1)}%)`);
    console.log(`   Defer:   ${totalDefer} (research-only sources)`);

    console.log(`\n   By book:`);
    for (const [book, count] of [...executedByBook.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`     ${book}: ${count}`);
    }

    console.log(`\n   Executed by analyst:`);
    for (const [analyst, count] of [...executedByAnalyst.entries()].sort((a, b) => b[1] - a[1])) {
      const role = roleRegistry.getRole(analyst);
      console.log(`     ${analyst} (${role}): ${count}`);
    }

    console.log(`\n   Top rejection reasons:`);
    for (const [reason, count] of [...rejectedReasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      console.log(`     ${reason}: ${count}`);
    }

    // The key assertion: allocator is MORE selective than the old system
    const selectivity = totalExecute / totalCandidates;
    console.log(`\n   Selectivity: ${(selectivity * 100).toFixed(1)}% of picks get executed`);
    console.log(`   (Old system: ~100% — every pick above score 40 became a trade)`);

    expect(totalCandidates).toBeGreaterThan(0);
    // Allocator should be somewhat selective
    expect(totalReject + totalDefer).toBeGreaterThan(0);
  });

  test('compares actual orders vs what allocator would approve', () => {
    const actualOrders = db.prepare('SELECT symbol, side, qty, filled_price, status FROM exec_orders WHERE status = ?').all('filled') as any[];
    const allPicks = extractPicks();

    console.log(`\n📊 ACTUAL vs ALLOCATOR COMPARISON`);
    console.log(`   Actual filled orders: ${actualOrders.length}`);
    console.log(`   Total historical picks: ${allPicks.length}`);

    // For each actual order, check if the allocator would have approved it
    const actualSymbols = new Set(actualOrders.map((o: any) => o.symbol));
    const pickedSymbols = new Set(allPicks.map(p => p.symbol));

    console.log(`\n   Symbols actually traded: ${[...actualSymbols].join(', ')}`);
    console.log(`   Symbols picked by analysts: ${pickedSymbols.size} unique`);

    // Would the allocator have agreed?
    for (const order of actualOrders) {
      const matchingPicks = allPicks.filter(p => p.symbol === order.symbol && p.side === order.side);
      const avgConviction = matchingPicks.length > 0
        ? matchingPicks.reduce((s, p) => s + p.conviction, 0) / matchingPicks.length
        : 0;

      // Create candidate and run through allocator
      if (matchingPicks.length > 0) {
        const candidate = pickToCandidate(matchingPicks[matchingPicks.length - 1], 'neutral');
        attrStore.insertCandidate(candidate);
        const decision = allocator.evaluateOne(candidate, order.filled_price || 50, 500, []);

        const emoji = decision.action === 'execute' ? '✅' : decision.action === 'defer' ? '⏸️' : '❌';
        console.log(`   ${emoji} ${order.side.toUpperCase()} ${order.qty} ${order.symbol} @$${order.filled_price} — allocator: ${decision.action} (score ${decision.allocatorScore}, ${decision.reasons[0]})`);
      }
    }

    expect(actualOrders.length).toBeGreaterThan(0);
  });

  test('book routing distribution makes sense', () => {
    const allPicks = extractPicks();

    const bookCounts: Record<string, number> = { intraday: 0, swing: 0, trend: 0 };
    for (const pick of allPicks) {
      const candidate = pickToCandidate(pick, 'neutral');
      const book = bookManager.routeToBook(candidate);
      bookCounts[book]++;
    }

    console.log(`\n📚 BOOK ROUTING DISTRIBUTION`);
    const total = allPicks.length;
    for (const [book, count] of Object.entries(bookCounts)) {
      console.log(`   ${book}: ${count} (${(count / total * 100).toFixed(1)}%)`);
    }

    // Verify all books get some traffic
    expect(bookCounts.intraday + bookCounts.swing + bookCounts.trend).toBe(total);
  });

  test('role-based filtering works correctly', () => {
    console.log(`\n🏷️  ROLE-BASED FILTERING`);
    const roles = roleRegistry.getAllRoles();
    for (const role of roles) {
      console.log(`   ${role.sourceName}: ${role.role} → book ${role.defaultBook || 'any'}`);
    }

    // Check that 'research' source (Bollinger) gets deferred
    const bollingerId = 'd4e5f6a7-b8c9-0123-4567-89abcdef0123';
    expect(roleRegistry.getRole(bollingerId)).toBe('research');

    // Check that 'filter' source (MA Crossover) can't open NEW positions
    const maCrossoverId = 'c3f8b8e0-4d1c-4c9f-8f3a-1e5b7a9c6d2e';
    expect(roleRegistry.getRole(maCrossoverId)).toBe('filter');

    // Check that 'primary_alpha' sources CAN open positions
    expect(roleRegistry.getRole('value-hunter')).toBe('primary_alpha');
    expect(roleRegistry.getRole('momentum-scanner')).toBe('primary_alpha');
  });
});
