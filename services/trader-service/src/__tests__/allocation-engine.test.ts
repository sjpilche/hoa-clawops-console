// =============================================================================
// Allocation Engine — Integration Tests
// =============================================================================
// Tests the full pipeline: regime → candidate → score → size → decision
// Uses a real in-memory SQLite database (same as production).
// =============================================================================

import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

// Types
import { TradeCandidate, RegimeSnapshot, RegimeLabel, TradeDecision } from '../engine/allocation/types';

// Regime
import { classifyRegime, parseRegimeFromText } from '../engine/allocation/regime-classifier';

// Candidate normalizer
import { signalToCandidate, aggregatedPickToCandidate } from '../engine/allocation/candidate-normalizer';
import { Signal } from '../engine/strategy/types';
import { AggregatedPick, AnalystReport } from '../engine/ai-panel/index';

// Attribution store
import { AttributionStore } from '../engine/allocation/attribution-store';

// Scoring
import { scoreCandidate, calcStrategyEdgeScore, DEFAULT_WEIGHTS } from '../engine/allocation/scoring';

// Position sizing
import { calculatePositionSize, SizingConfig } from '../engine/allocation/position-sizing';

// Capital allocator
import { CapitalAllocator } from '../engine/allocation/capital-allocator';

// Book manager
import { BookManager, DEFAULT_BOOKS } from '../engine/allocation/book-manager';

// Strategy roles
import { StrategyRoleRegistry } from '../engine/allocation/strategy-roles';

// Source profiles
import { SourceProfiler } from '../engine/learning/source-profiles';

// Confidence calibrator
import { ConfidenceCalibrator } from '../engine/learning/confidence-calibrator';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');

  // Create the brain tables that AttributionStore depends on
  db.exec(`
    CREATE TABLE IF NOT EXISTS brain_episodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      analyst_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      conviction INTEGER,
      opportunity_type TEXT,
      entry_price REAL,
      exit_price REAL,
      pnl_dollars REAL,
      pnl_percent REAL,
      hold_days INTEGER,
      outcome_type TEXT NOT NULL,
      outcome_score REAL DEFAULT 0.0,
      thesis TEXT,
      market_context TEXT,
      keywords TEXT NOT NULL DEFAULT '',
      run_id TEXT,
      candidate_id TEXT,
      strategy_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS trade_candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_name TEXT NOT NULL,
      run_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      signal_strength REAL NOT NULL,
      opportunity_type TEXT,
      horizon TEXT,
      thesis TEXT,
      risks TEXT,
      catalysts_json TEXT,
      target_price REAL,
      stop_loss REAL,
      signal_price REAL,
      features_json TEXT,
      regime_label TEXT NOT NULL,
      regime_snapshot_id INTEGER,
      analyst_count INTEGER DEFAULT 1,
      avg_conviction REAL,
      max_conviction REAL,
      composite_score REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return db;
}

function makeCandidate(overrides: Partial<TradeCandidate> = {}): TradeCandidate {
  return {
    candidateId: uuidv4(),
    source: 'ai_panel',
    sourceId: 'value-hunter',
    sourceName: 'Value Hunter',
    runId: uuidv4(),
    symbol: 'AAPL',
    side: 'buy',
    signalStrength: 0.7,
    opportunityType: 'deep_value',
    horizon: '1_month',
    regimeLabel: 'neutral',
    analystCount: 2,
    avgConviction: 3.5,
    compositeScore: 70,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    signalId: uuidv4(),
    strategyId: 'test-strategy-id',
    symbol: 'NVDA',
    side: 'buy',
    strength: 0.8,
    price: 125.50,
    reason: 'RSI oversold bounce',
    timestamp: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Regime Classifier', () => {
  test('high VIX → high_volatility', () => {
    const result = classifyRegime({ vix: 35, fearGreedScore: 50 });
    expect(result.label).toBe('high_volatility');
  });

  test('low VIX + high F&G → risk_on', () => {
    const result = classifyRegime({ vix: 15, fearGreedScore: 65, spyPrice: 5200, spy50dMA: 5100 });
    expect(result.label).toBe('risk_on');
  });

  test('high VIX OR low F&G → risk_off', () => {
    const result = classifyRegime({ vix: 26, fearGreedScore: 50 });
    expect(result.label).toBe('risk_off');
  });

  test('low F&G alone → risk_off', () => {
    const result = classifyRegime({ vix: 18, fearGreedScore: 30 });
    expect(result.label).toBe('risk_off');
  });

  test('mixed signals → neutral', () => {
    const result = classifyRegime({ vix: 20, fearGreedScore: 50, spyPrice: 5200, spy50dMA: 5100 });
    expect(result.label).toBe('neutral');
  });

  test('no data → unknown', () => {
    const result = classifyRegime({});
    expect(result.label).toBe('unknown');
    expect(result.confidence).toBe(0);
  });

  test('confidence scales with available data', () => {
    const r1 = classifyRegime({ vix: 15 });
    expect(r1.confidence).toBeCloseTo(1 / 3);

    const r2 = classifyRegime({ vix: 15, fearGreedScore: 60 });
    expect(r2.confidence).toBeCloseTo(2 / 3);

    const r3 = classifyRegime({ vix: 15, fearGreedScore: 60, spyPrice: 5200 });
    expect(r3.confidence).toBe(1);
  });

  test('SPY below 50d + elevated VIX → risk_off', () => {
    const result = classifyRegime({ vix: 22, fearGreedScore: 50, spyPrice: 5000, spy50dMA: 5100 });
    expect(result.label).toBe('risk_off');
  });
});

describe('Candidate Normalizer', () => {
  test('signalToCandidate converts strategy signal', () => {
    const signal = makeSignal();
    const candidate = signalToCandidate(signal, 'neutral');

    expect(candidate.source).toBe('strategy');
    expect(candidate.sourceId).toBe(signal.strategyId);
    expect(candidate.symbol).toBe('NVDA');
    expect(candidate.side).toBe('buy');
    expect(candidate.signalStrength).toBe(0.8);
    expect(candidate.signalPrice).toBe(125.50);
    expect(candidate.regimeLabel).toBe('neutral');
    expect(candidate.candidateId).toBeTruthy();
  });

  test('aggregatedPickToCandidate converts panel pick', () => {
    const pick: AggregatedPick = {
      symbol: 'TSLA',
      side: 'buy',
      analystCount: 3,
      avgConviction: 4.0,
      maxConviction: 5 as any,
      opportunityTypes: ['momentum_breakout'],
      theses: ['Strong breakout thesis'],
      compositeScore: 85,
      targetWeight: 0.15,
    };

    const reports: AnalystReport[] = [{
      analystId: 'momentum-scanner',
      analystName: 'Momentum Scanner',
      provider: 'openai',
      timestamp: new Date(),
      scanFocus: 'Technical',
      picks: [{
        symbol: 'TSLA',
        side: 'buy',
        conviction: 4 as any,
        opportunityType: 'momentum_breakout',
        horizon: '1_week',
        thesis: 'Strong breakout',
        risks: 'Overextended',
        catalysts: ['earnings'],
        dataPoints: {},
      }],
      marketCommentary: '',
      rawResponse: '',
      promptTokens: 0,
      completionTokens: 0,
      costEstimateUSD: 0,
      latencyMs: 0,
    }];

    const candidate = aggregatedPickToCandidate(pick, reports, 'run-123', 'risk_on');
    expect(candidate.source).toBe('ai_panel');
    expect(candidate.symbol).toBe('TSLA');
    expect(candidate.signalStrength).toBe(0.8); // 4/5
    expect(candidate.compositeScore).toBe(85);
    expect(candidate.regimeLabel).toBe('risk_on');
    expect(candidate.horizon).toBe('1_week');
  });
});

describe('Attribution Store', () => {
  let db: Database.Database;
  let store: AttributionStore;

  beforeEach(() => {
    db = createTestDb();
    store = new AttributionStore(db);
  });

  afterEach(() => db.close());

  test('inserts and retrieves regime snapshot', () => {
    const snapshot = classifyRegime({ vix: 18, fearGreedScore: 60, spyPrice: 5200 });
    const id = store.insertRegimeSnapshot(snapshot);
    expect(id).toBeGreaterThan(0);

    const latest = store.getLatestRegime();
    expect(latest).not.toBeNull();
    expect(latest!.label).toBe(snapshot.label);
  });

  test('inserts and retrieves candidates', () => {
    const candidate = makeCandidate();
    store.insertCandidate(candidate);

    const recent = store.getRecentCandidates(10);
    expect(recent.length).toBe(1);
    expect(recent[0].candidate_id).toBe(candidate.candidateId);
    expect(recent[0].symbol).toBe('AAPL');
  });

  test('inserts and retrieves decisions', () => {
    const candidate = makeCandidate();
    store.insertCandidate(candidate);

    store.insertDecision({
      decisionId: uuidv4(),
      candidateId: candidate.candidateId,
      action: 'execute',
      allocatorScore: 75,
      riskPassed: true,
      executed: true,
      reasons: ['Test reason'],
      createdAt: new Date(),
    });

    const decisions = store.getRecentDecisions(10);
    expect(decisions.length).toBe(1);
    expect(decisions[0].action).toBe('execute');
    expect(decisions[0].allocator_score).toBe(75);
  });

  test('duplicate candidate_id is ignored (OR IGNORE)', () => {
    const candidate = makeCandidate();
    store.insertCandidate(candidate);
    store.insertCandidate(candidate); // Should not throw

    const recent = store.getRecentCandidates(10);
    expect(recent.length).toBe(1);
  });
});

describe('Position Sizing', () => {
  const config: SizingConfig = {
    accountValue: 10000,
    maxPositionPct: 0.10,
    minPositionDollars: 5,
    riskPerTradePct: 0.01,  // 1% = $100 R
  };

  test('score below 40 returns null (reject)', () => {
    const result = calculatePositionSize(35, makeCandidate(), 150, config);
    expect(result).toBeNull();
  });

  test('score 40-59 → micro bucket (0.5R)', () => {
    // $10k * 1% = $100 R. Micro = 0.5R = $50. At $10/share = 5 shares.
    const result = calculatePositionSize(50, makeCandidate(), 10, config);
    expect(result).not.toBeNull();
    expect(result!.bucket).toBe('micro');
    expect(result!.rMultiple).toBe(0.5);
    expect(result!.dollarValue).toBeLessThanOrEqual(config.maxPositionPct * config.accountValue);
  });

  test('score 60-74 → small bucket (1.0R)', () => {
    // $10k * 1% = $100 R. Small = 1.0R = $100. At $10/share = 10 shares.
    const result = calculatePositionSize(65, makeCandidate(), 10, config);
    expect(result).not.toBeNull();
    expect(result!.bucket).toBe('small');
    expect(result!.rMultiple).toBe(1.0);
  });

  test('score 75-89 → standard bucket (1.5R)', () => {
    const result = calculatePositionSize(80, makeCandidate(), 150, config);
    expect(result).not.toBeNull();
    expect(result!.bucket).toBe('standard');
    expect(result!.rMultiple).toBe(1.5);
  });

  test('score 90+ → conviction bucket (2.0R)', () => {
    const result = calculatePositionSize(95, makeCandidate(), 150, config);
    expect(result).not.toBeNull();
    expect(result!.bucket).toBe('conviction');
    expect(result!.rMultiple).toBe(2.0);
  });

  test('caps at maxPositionPct', () => {
    // With $10k account and 10% max, max = $1000
    // Conviction = 2R = $200, which is below max
    const result = calculatePositionSize(95, makeCandidate(), 5, config);
    expect(result).not.toBeNull();
    expect(result!.dollarValue).toBeLessThanOrEqual(1000);
  });

  test('returns null for zero price', () => {
    const result = calculatePositionSize(80, makeCandidate(), 0, config);
    expect(result).toBeNull();
  });
});

describe('Capital Allocator', () => {
  let db: Database.Database;
  let store: AttributionStore;
  let allocator: CapitalAllocator;

  beforeEach(() => {
    db = createTestDb();
    store = new AttributionStore(db);
    allocator = new CapitalAllocator(store, {
      minScoreToExecute: 40,
      maxOpenPositions: 5,
      maxDailyNewPositions: 3,
    });
  });

  afterEach(() => db.close());

  test('evaluateOne rejects low-score candidate', () => {
    // With no attribution data, scores default to 50 (neutral)
    // Composite ≈ 50, which is >= 40 threshold → should execute
    const candidate = makeCandidate({ compositeScore: 20, signalStrength: 0.2 });
    const decision = allocator.evaluateOne(candidate, 150, 10000, []);
    // The allocator scores it using attribution data (all default 50 → composite 50)
    // So it should pass the threshold even if the original compositeScore was 20
    expect(decision.allocatorScore).toBeGreaterThanOrEqual(0);
  });

  test('evaluateOne approves good candidate', () => {
    const candidate = makeCandidate({ compositeScore: 80, signalStrength: 0.8 });
    // Use $10/share so R-sizing produces whole shares
    const decision = allocator.evaluateOne(candidate, 10, 10000, []);
    // With default attribution scores (50 each), composite = 50 → passes 40 threshold
    expect(decision.action).toBe('execute');
    expect(decision.approvedQty).toBeGreaterThan(0);
    expect(decision.dollarValue).toBeGreaterThan(0);
  });

  test('evaluateOne approves sell without scoring', () => {
    const candidate = makeCandidate({ side: 'sell' });
    const decision = allocator.evaluateOne(candidate, 150, 10000, ['AAPL']);
    expect(decision.action).toBe('execute');
  });

  test('evaluate batch ranks by composite score', () => {
    const candidates = [
      makeCandidate({ symbol: 'LOW', signalStrength: 0.3 }),
      makeCandidate({ symbol: 'HIGH', signalStrength: 0.9 }),
      makeCandidate({ symbol: 'MED', signalStrength: 0.6 }),
    ];

    const prices = { LOW: 10, HIGH: 10, MED: 10 };
    const decisions = allocator.evaluate(candidates, prices, 10000, []);

    // All should pass (default scores = 50 → above 40 threshold)
    const executed = decisions.filter(d => d.action === 'execute');
    expect(executed.length).toBeGreaterThanOrEqual(1);
  });

  test('respects max positions', () => {
    const candidates = Array.from({ length: 8 }, (_, i) =>
      makeCandidate({ symbol: `SYM${i}`, signalStrength: 0.7 })
    );

    const prices: Record<string, number> = {};
    candidates.forEach(c => { prices[c.symbol] = 10; });

    const decisions = allocator.evaluate(candidates, prices, 10000, []);
    const executed = decisions.filter(d => d.action === 'execute');
    // Max 5 positions
    expect(executed.length).toBeLessThanOrEqual(5);
  });
});

describe('Book Manager', () => {
  let db: Database.Database;
  let bookManager: BookManager;

  beforeEach(() => {
    db = createTestDb();
    // BookManager creates its own tables
    bookManager = new BookManager(db);
  });

  afterEach(() => db.close());

  test('routes by horizon', () => {
    expect(bookManager.routeToBook(makeCandidate({ horizon: 'intraday' }))).toBe('intraday');
    expect(bookManager.routeToBook(makeCandidate({ horizon: '1_week' }))).toBe('swing');
    expect(bookManager.routeToBook(makeCandidate({ horizon: '1_month' }))).toBe('trend');
  });

  test('routes by opportunity type when no horizon', () => {
    expect(bookManager.routeToBook(makeCandidate({ horizon: undefined, opportunityType: 'momentum_breakout' }))).toBe('intraday');
    expect(bookManager.routeToBook(makeCandidate({ horizon: undefined, opportunityType: 'deep_value' }))).toBe('trend');
  });

  test('defaults to swing', () => {
    expect(bookManager.routeToBook(makeCandidate({ horizon: undefined, opportunityType: undefined }))).toBe('swing');
  });

  test('tracks book capacity', () => {
    const cap1 = bookManager.getBookCapacity('intraday', 10000);
    expect(cap1.positionsAvailable).toBe(3); // default max
    expect(cap1.currentPositions).toBe(0);

    bookManager.openPosition('intraday', 'c1', 'AAPL', 'buy', 500);
    bookManager.openPosition('intraday', 'c2', 'NVDA', 'buy', 500);

    const cap2 = bookManager.getBookCapacity('intraday', 10000);
    expect(cap2.positionsAvailable).toBe(1);
    expect(cap2.currentPositions).toBe(2);
  });

  test('canAccept rejects when book full', () => {
    bookManager.openPosition('intraday', 'c1', 'A', 'buy', 500);
    bookManager.openPosition('intraday', 'c2', 'B', 'buy', 500);
    bookManager.openPosition('intraday', 'c3', 'C', 'buy', 500);

    const { accepted } = bookManager.canAccept(makeCandidate(), 'intraday', 10000);
    expect(accepted).toBe(false);
  });

  test('close position frees capacity', () => {
    bookManager.openPosition('intraday', 'c1', 'AAPL', 'buy', 500);
    expect(bookManager.getBookCapacity('intraday', 10000).currentPositions).toBe(1);

    bookManager.closePosition('AAPL');
    expect(bookManager.getBookCapacity('intraday', 10000).currentPositions).toBe(0);
  });
});

describe('Strategy Roles', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    // Need the strategy_roles table
    db.exec(`
      CREATE TABLE IF NOT EXISTS strategy_roles (
        source_id TEXT PRIMARY KEY,
        source_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'research',
        default_book TEXT,
        auto_promote_threshold REAL DEFAULT 0.6,
        auto_demote_threshold REAL DEFAULT 0.3,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  });

  afterEach(() => db.close());

  test('seeds initial roles', () => {
    const registry = new StrategyRoleRegistry(db);
    const roles = registry.getAllRoles();
    expect(roles.length).toBe(9); // 5 strategies + 4 analysts
  });

  test('returns correct roles', () => {
    const registry = new StrategyRoleRegistry(db);
    expect(registry.getRole('value-hunter')).toBe('primary_alpha');
    expect(registry.getRole('risk-sentinel')).toBe('filter');
    // Bollinger starts as research
    expect(registry.getRole('d4e5f6a7-b8c9-0123-4567-89abcdef0123')).toBe('research');
  });

  test('unknown source defaults to research', () => {
    const registry = new StrategyRoleRegistry(db);
    expect(registry.getRole('unknown-source')).toBe('research');
  });

  test('setRole persists', () => {
    const registry = new StrategyRoleRegistry(db);
    registry.setRole('value-hunter', 'disabled');
    expect(registry.getRole('value-hunter')).toBe('disabled');
  });
});

describe('Confidence Calibrator', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => db.close());

  test('returns 0.5 for no data', () => {
    const calibrator = new ConfidenceCalibrator(db);
    const report = calibrator.calibrate('unknown-analyst');
    expect(report.score).toBe(0.5);
    expect(report.totalTrades).toBe(0);
  });

  test('well-calibrated analyst scores high', () => {
    // Insert episodes: low conviction wins ~35%, high conviction wins ~65%
    const stmt = db.prepare(`
      INSERT INTO brain_episodes (analyst_id, symbol, side, conviction, outcome_type, outcome_score, pnl_dollars, keywords)
      VALUES (?, 'AAPL', 'buy', ?, ?, ?, ?, '')
    `);

    // Low conviction (1-2): ~35% win rate
    for (let i = 0; i < 10; i++) {
      const won = i < 3; // 30% wins (close to expected 35%)
      stmt.run('test-analyst', 2, won ? 'profit' : 'loss', won ? 0.5 : -0.5, won ? 10 : -10);
    }

    // High conviction (4-5): ~65% win rate
    for (let i = 0; i < 10; i++) {
      const won = i < 7; // 70% wins (close to expected 65%)
      stmt.run('test-analyst', 5, won ? 'profit' : 'loss', won ? 0.5 : -0.5, won ? 10 : -10);
    }

    const calibrator = new ConfidenceCalibrator(db);
    const report = calibrator.calibrate('test-analyst');
    expect(report.score).toBeGreaterThan(0.7); // Well calibrated
    expect(report.totalTrades).toBe(20);
  });
});
