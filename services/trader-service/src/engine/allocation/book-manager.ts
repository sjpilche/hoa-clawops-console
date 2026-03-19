// =============================================================================
// Book Manager — Separate trading books by time horizon
// =============================================================================
// Three books with distinct evaluation frameworks and exposure caps:
//   - Intraday: event-driven, volume spikes, fast reaction (hold < 1 day)
//   - Swing: mean reversion, RSI, Bollinger, gap fades (hold 2–14 days)
//   - Trend: MA crossover, breakout continuation, rotation (hold 14+ days)
//
// Each book has:
//   - Separate allocator score thresholds
//   - Separate exposure caps
//   - Separate max position counts
//   - Separate performance evaluation
// =============================================================================

import Database from 'better-sqlite3';
import { BookId, TradeCandidate } from './types';
import { Horizon } from '../ai-panel/index';

export interface BookConfig {
  id: BookId;
  name: string;
  maxExposurePct: number;         // % of total account
  maxPositions: number;
  minAllocatorScore: number;
  allowedHorizons: string[];      // which horizons route here
  description: string;
}

export const DEFAULT_BOOKS: Record<BookId, BookConfig> = {
  intraday: {
    id: 'intraday',
    name: 'Intraday Book',
    maxExposurePct: 0.20,
    maxPositions: 3,
    minAllocatorScore: 60,
    allowedHorizons: ['intraday'],
    description: 'Event-driven, volume spikes, fast reactions. Hold < 1 day.',
  },
  swing: {
    id: 'swing',
    name: 'Swing Book',
    maxExposurePct: 0.50,
    maxPositions: 5,
    minAllocatorScore: 50,
    allowedHorizons: ['1_week', '2_weeks'],
    description: 'Mean reversion, RSI, Bollinger, gap fades. Hold 2–14 days.',
  },
  trend: {
    id: 'trend',
    name: 'Trend Book',
    maxExposurePct: 0.30,
    maxPositions: 4,
    minAllocatorScore: 40,
    allowedHorizons: ['1_month', '3_months'],
    description: 'MA crossover, breakout continuation, sector rotation. Hold 14+ days.',
  },
};

// Map strategy IDs / opportunity types to default books
const STRATEGY_BOOK_MAP: Record<string, BookId> = {
  // By opportunity type
  'momentum_breakout': 'intraday',
  'special_situation': 'intraday',
  'event_catalyst': 'intraday',
  'mean_reversion': 'swing',
  'earnings_drift': 'swing',
  'deep_value': 'trend',
  'macro_rotation': 'trend',
};

export interface BookPosition {
  bookId: BookId;
  candidateId: string;
  symbol: string;
  side: string;
  entryPrice: number | null;
  currentExposure: number;
  status: 'open' | 'closed';
}

export class BookManager {
  private books: Map<BookId, BookConfig>;
  private db: Database.Database;

  constructor(db: Database.Database, configs?: Partial<Record<BookId, Partial<BookConfig>>>) {
    this.db = db;
    this.books = new Map();

    // Initialize with defaults, then apply any overrides
    for (const [id, defaultConfig] of Object.entries(DEFAULT_BOOKS)) {
      const override = configs?.[id as BookId];
      this.books.set(id as BookId, { ...defaultConfig, ...override } as BookConfig);
    }

    this.ensureTable();
    console.log(`📚 Book Manager: ${this.books.size} books (${[...this.books.keys()].join(', ')})`);
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS book_positions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id TEXT NOT NULL,
        candidate_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        side TEXT NOT NULL,
        entry_price REAL,
        current_exposure REAL DEFAULT 0,
        opened_at TEXT NOT NULL DEFAULT (datetime('now')),
        closed_at TEXT,
        status TEXT NOT NULL DEFAULT 'open'
      );

      CREATE TABLE IF NOT EXISTS strategy_roles (
        source_id TEXT PRIMARY KEY,
        source_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'research',
        default_book TEXT,
        auto_promote_threshold REAL DEFAULT 0.6,
        auto_demote_threshold REAL DEFAULT 0.3,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_book_pos_book ON book_positions(book_id, status);
      CREATE INDEX IF NOT EXISTS idx_book_pos_symbol ON book_positions(symbol, status);
    `);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Routing
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Route a candidate to the appropriate book based on horizon and opportunity type.
   */
  routeToBook(candidate: TradeCandidate): BookId {
    // 1. If candidate has an explicit horizon, use that
    if (candidate.horizon) {
      for (const [id, config] of this.books) {
        if (config.allowedHorizons.includes(candidate.horizon)) {
          return id;
        }
      }
    }

    // 2. If opportunity type maps to a book, use that
    if (candidate.opportunityType) {
      const mapped = STRATEGY_BOOK_MAP[candidate.opportunityType];
      if (mapped) return mapped;
    }

    // 3. Default: swing (most general)
    return 'swing';
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Capacity
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Get remaining capacity in a book.
   */
  getBookCapacity(bookId: BookId, accountValue: number): {
    positionsAvailable: number;
    exposureAvailable: number;
    currentPositions: number;
    currentExposure: number;
  } {
    const config = this.books.get(bookId);
    if (!config) return { positionsAvailable: 0, exposureAvailable: 0, currentPositions: 0, currentExposure: 0 };

    const openPositions = this.db.prepare(
      'SELECT COUNT(*) as count, COALESCE(SUM(current_exposure), 0) as exposure FROM book_positions WHERE book_id = ? AND status = ?'
    ).get(bookId, 'open') as any;

    const currentPositions = openPositions?.count || 0;
    const currentExposure = openPositions?.exposure || 0;
    const maxExposure = config.maxExposurePct * accountValue;

    return {
      positionsAvailable: Math.max(0, config.maxPositions - currentPositions),
      exposureAvailable: Math.max(0, maxExposure - currentExposure),
      currentPositions,
      currentExposure,
    };
  }

  /**
   * Check if a candidate can be placed in its target book.
   */
  canAccept(candidate: TradeCandidate, bookId: BookId, accountValue: number): {
    accepted: boolean;
    reason?: string;
  } {
    const config = this.books.get(bookId);
    if (!config) return { accepted: false, reason: `Unknown book: ${bookId}` };

    const capacity = this.getBookCapacity(bookId, accountValue);

    if (capacity.positionsAvailable <= 0) {
      return { accepted: false, reason: `${config.name}: max positions (${config.maxPositions}) reached` };
    }

    return { accepted: true };
  }

  /**
   * Get the book-specific minimum score threshold.
   */
  getMinScore(bookId: BookId): number {
    return this.books.get(bookId)?.minAllocatorScore ?? 40;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Position tracking
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Record a position opening in a book.
   */
  openPosition(bookId: BookId, candidateId: string, symbol: string, side: string, exposure: number): void {
    this.db.prepare(`
      INSERT INTO book_positions (book_id, candidate_id, symbol, side, current_exposure, status)
      VALUES (?, ?, ?, ?, ?, 'open')
    `).run(bookId, candidateId, symbol, side, exposure);
  }

  /**
   * Close a position in a book.
   */
  closePosition(symbol: string): void {
    this.db.prepare(`
      UPDATE book_positions SET status = 'closed', closed_at = datetime('now')
      WHERE symbol = ? AND status = 'open'
    `).run(symbol);
  }

  /**
   * Get all open positions across all books.
   */
  getOpenPositions(): BookPosition[] {
    return this.db.prepare(
      'SELECT * FROM book_positions WHERE status = ? ORDER BY book_id, opened_at DESC'
    ).all('open') as any[];
  }

  /**
   * Get book summary with current state.
   */
  getBookSummaries(accountValue: number): Array<BookConfig & {
    currentPositions: number;
    currentExposure: number;
    positionsAvailable: number;
    exposureAvailable: number;
  }> {
    return [...this.books.values()].map(config => {
      const capacity = this.getBookCapacity(config.id, accountValue);
      return {
        ...config,
        ...capacity,
      };
    });
  }

  /**
   * Get book config by ID.
   */
  getBook(bookId: BookId): BookConfig | undefined {
    return this.books.get(bookId);
  }
}
