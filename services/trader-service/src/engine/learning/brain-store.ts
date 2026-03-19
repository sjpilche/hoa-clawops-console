// =============================================================================
// Trader Brain — 4-Layer SQLite Learning Store
// =============================================================================
// Ported from ClawOps collectiveBrain.js (Azure SQL) into TypeScript + SQLite.
// Learns from trade outcomes to improve future AI Panel decisions.
//
// Layer 1: Observations — per-run context snapshots (skills data, market regime)
// Layer 2: Feedback — analyst accuracy signals (profitable/loss/stopped_out)
// Layer 3: Episodes — full trade outcome memory (symbol, P&L, hold days)
// Layer 4: Knowledge Base — distilled winning/losing patterns
// =============================================================================

import Database from 'better-sqlite3';
import path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Observation {
  id?: number;
  runId: string;
  analystId: string;
  obsType: string;
  content: string;
  confidence: number;
  metadata?: Record<string, any>;
  createdAt?: string;
}

export interface FeedbackSignal {
  id?: number;
  analystId: string;
  outputType: string;
  outputId?: string;
  signal: string;  // profitable | loss | stopped_out | missed | correct_sell | flat
  beforeText?: string;
  afterText?: string;
  symbol?: string;
  notes?: string;
  metadata?: Record<string, any>;
  createdAt?: string;
}

export interface TradeEpisode {
  id?: number;
  analystId: string;
  symbol: string;
  side: string;
  conviction?: number;
  opportunityType?: string;
  entryPrice?: number;
  exitPrice?: number;
  pnlDollars?: number;
  pnlPercent?: number;
  holdDays?: number;
  outcomeType: string;  // profit | loss | stop_hit | time_exit | target_hit | flat
  outcomeScore: number; // -1.0 to 1.0
  thesis?: string;
  marketContext?: string;
  runId?: string;
  candidateId?: string;  // Links to trade_candidates for attribution
  createdAt?: string;
}

export interface KBEntry {
  id?: number;
  sourceAnalyst?: string;
  contentType: string;  // winning_pattern | losing_pattern | market_regime | best_thesis
  title?: string;
  content: string;
  qualityScore: number;
  symbol?: string;
  opportunityType?: string;
  sourceEpisodeIds?: number[];
  useCount?: number;
  createdAt?: string;
}

export interface EpisodeQuery {
  symbol?: string;
  analystId?: string;
  opportunityType?: string;
  minScore?: number;
  limit?: number;
}

export interface DistillationResult {
  promoted: number;
  avoidPatterns: number;
  totalEpisodesScanned: number;
}

// ---------------------------------------------------------------------------
// Stopwords for keyword extraction (ported from chromaBrain.js)
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'each',
  'few', 'more', 'most', 'other', 'some', 'such', 'no', 'only', 'own',
  'same', 'than', 'too', 'very', 'just', 'because', 'if', 'when', 'where',
  'how', 'all', 'any', 'both', 'each', 'every', 'this', 'that', 'these',
  'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him',
  'his', 'she', 'her', 'it', 'its', 'they', 'them', 'their', 'what',
  'which', 'who', 'whom', 'up', 'about', 'stock', 'trading', 'trade',
  'market', 'price', 'value',
]);

function extractKeywords(text: string, maxKeywords = 40): string {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
  const unique = [...new Set(words)];
  return unique.slice(0, maxKeywords).join(' ');
}

function keywordScore(keywords: string, query: string): number {
  const kwSet = new Set(keywords.split(/\s+/));
  const queryWords = query.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
  if (queryWords.length === 0) return 0;
  const matches = queryWords.filter(w => kwSet.has(w)).length;
  return matches / queryWords.length;
}

// ---------------------------------------------------------------------------
// BrainStore
// ---------------------------------------------------------------------------

export class BrainStore {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath || path.join(process.cwd(), 'data', 'trader-brain.sqlite');
    console.log(`🧠 Trader Brain: Opening SQLite at ${resolvedPath}`);
    this.db = new Database(resolvedPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.ensureTables();
    console.log('✓ Trader Brain: Ready');
  }

  // -------------------------------------------------------------------------
  // Schema
  // -------------------------------------------------------------------------

  private ensureTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS brain_observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        analyst_id TEXT NOT NULL,
        obs_type TEXT NOT NULL,
        content TEXT NOT NULL,
        confidence REAL DEFAULT 1.0,
        metadata_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS brain_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        analyst_id TEXT NOT NULL,
        output_type TEXT NOT NULL,
        output_id TEXT,
        signal TEXT NOT NULL,
        before_text TEXT,
        after_text TEXT,
        symbol TEXT,
        notes TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

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
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS brain_knowledge (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_analyst TEXT,
        content_type TEXT NOT NULL,
        title TEXT,
        content TEXT NOT NULL,
        quality_score REAL DEFAULT 0.0,
        symbol TEXT,
        opportunity_type TEXT,
        keywords TEXT NOT NULL DEFAULT '',
        use_count INTEGER DEFAULT 0,
        source_episode_ids TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS portfolio_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        portfolio_value REAL NOT NULL,
        cash REAL NOT NULL,
        equity REAL NOT NULL,
        buying_power REAL NOT NULL,
        positions_count INTEGER DEFAULT 0,
        unrealized_pnl REAL DEFAULT 0,
        day_trade_count INTEGER DEFAULT 0,
        run_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_obs_run ON brain_observations(run_id);
      CREATE INDEX IF NOT EXISTS idx_fb_analyst ON brain_feedback(analyst_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_ep_symbol ON brain_episodes(symbol, created_at);
      CREATE INDEX IF NOT EXISTS idx_ep_analyst ON brain_episodes(analyst_id, outcome_score);
      CREATE INDEX IF NOT EXISTS idx_ep_outcome ON brain_episodes(outcome_type, outcome_score);
      CREATE INDEX IF NOT EXISTS idx_kb_type ON brain_knowledge(content_type, quality_score);
      CREATE INDEX IF NOT EXISTS idx_snap_time ON portfolio_snapshots(created_at);

      -- =======================================================================
      -- Execution Tables (replaces PostgreSQL dependency)
      -- =======================================================================

      CREATE TABLE IF NOT EXISTS exec_orders (
        order_id TEXT PRIMARY KEY,
        intent_id TEXT NOT NULL,
        strategy_id TEXT,
        signal_id TEXT,
        broker_order_id TEXT,
        symbol TEXT NOT NULL,
        side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
        qty REAL NOT NULL,
        order_type TEXT NOT NULL DEFAULT 'market',
        limit_price REAL,
        stop_price REAL,
        time_in_force TEXT NOT NULL DEFAULT 'day',
        signal_price REAL,
        status TEXT NOT NULL DEFAULT 'new',
        submitted_at TEXT,
        filled_at TEXT,
        filled_price REAL,
        filled_qty REAL,
        last_update_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS exec_fills (
        fill_id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        side TEXT NOT NULL,
        price REAL NOT NULL,
        qty REAL NOT NULL,
        fee REAL NOT NULL DEFAULT 0,
        fill_ts TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS exec_positions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        qty REAL NOT NULL,
        avg_price REAL NOT NULL,
        market_price REAL NOT NULL,
        unrealized_pnl REAL NOT NULL DEFAULT 0,
        ts TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS exec_risk_checks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        intent_id TEXT NOT NULL,
        passed INTEGER NOT NULL,
        fail_reason TEXT,
        limits_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS exec_daily_pnl (
        date TEXT PRIMARY KEY,
        realized_pnl REAL NOT NULL DEFAULT 0,
        unrealized_pnl REAL NOT NULL DEFAULT 0,
        fees REAL NOT NULL DEFAULT 0,
        trade_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS exec_risk_limits (
        limit_type TEXT PRIMARY KEY,
        value REAL NOT NULL,
        unit TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS exec_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        resource TEXT NOT NULL,
        diff_json TEXT,
        ts TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS exec_kill_switch (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        status TEXT NOT NULL DEFAULT 'armed',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_exec_orders_status ON exec_orders(status);
      CREATE INDEX IF NOT EXISTS idx_exec_orders_broker ON exec_orders(broker_order_id);
      CREATE INDEX IF NOT EXISTS idx_exec_fills_order ON exec_fills(order_id);
      CREATE INDEX IF NOT EXISTS idx_exec_positions_symbol ON exec_positions(symbol, ts DESC);
      CREATE INDEX IF NOT EXISTS idx_exec_audit_ts ON exec_audit_log(ts DESC);

      INSERT OR IGNORE INTO exec_risk_limits (limit_type, value, unit) VALUES ('max_daily_loss', 500.0, 'USD');
      INSERT OR IGNORE INTO exec_risk_limits (limit_type, value, unit) VALUES ('max_position_usd', 2000.0, 'USD');
      INSERT OR IGNORE INTO exec_risk_limits (limit_type, value, unit) VALUES ('max_gross_exposure_usd', 5000.0, 'USD');
      INSERT OR IGNORE INTO exec_risk_limits (limit_type, value, unit) VALUES ('max_trades_per_day', 10, 'count');
      INSERT OR IGNORE INTO exec_risk_limits (limit_type, value, unit) VALUES ('max_order_slippage_bps', 50, 'bps');
      INSERT OR IGNORE INTO exec_kill_switch (id, status) VALUES (1, 'armed');
    `);

    // Add strategy_id to brain_episodes if missing
    try { this.db.exec('ALTER TABLE brain_episodes ADD COLUMN strategy_id TEXT'); } catch {}
    // Add candidate_id to brain_episodes for attribution linkage
    try { this.db.exec('ALTER TABLE brain_episodes ADD COLUMN candidate_id TEXT'); } catch {}
  }

  /** Expose raw DB for ExecStore */
  getDatabase(): Database.Database { return this.db; }

  // -------------------------------------------------------------------------
  // Layer 1: Observations
  // -------------------------------------------------------------------------

  observe(runId: string, analystId: string, obsType: string, content: string, metadata?: Record<string, any>): void {
    try {
      this.db.prepare(`
        INSERT INTO brain_observations (run_id, analyst_id, obs_type, content, metadata_json)
        VALUES (?, ?, ?, ?, ?)
      `).run(runId, analystId, obsType, content, metadata ? JSON.stringify(metadata) : null);
    } catch (err: any) {
      console.warn('Brain observe error (non-fatal):', err.message);
    }
  }

  getObservations(runId: string, types?: string[]): Observation[] {
    let sql = 'SELECT * FROM brain_observations WHERE run_id = ?';
    const params: any[] = [runId];

    if (types && types.length > 0) {
      sql += ` AND obs_type IN (${types.map(() => '?').join(',')})`;
      params.push(...types);
    }

    sql += ' ORDER BY created_at DESC LIMIT 50';

    return this.db.prepare(sql).all(...params) as any[];
  }

  // -------------------------------------------------------------------------
  // Layer 2: Feedback
  // -------------------------------------------------------------------------

  recordFeedback(
    analystId: string,
    outputType: string,
    signal: string,
    opts?: { outputId?: string; symbol?: string; notes?: string; beforeText?: string; afterText?: string; metadata?: Record<string, any> }
  ): void {
    try {
      this.db.prepare(`
        INSERT INTO brain_feedback (analyst_id, output_type, output_id, signal, before_text, after_text, symbol, notes, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        analystId,
        outputType,
        opts?.outputId || null,
        signal,
        opts?.beforeText || null,
        opts?.afterText || null,
        opts?.symbol || null,
        opts?.notes || null,
        opts?.metadata ? JSON.stringify(opts.metadata) : null
      );
    } catch (err: any) {
      console.warn('Brain recordFeedback error (non-fatal):', err.message);
    }
  }

  getFeedbackPromptBlock(analystId: string, limit = 8): string {
    const rows = this.db.prepare(`
      SELECT signal, symbol, notes, created_at
      FROM brain_feedback
      WHERE analyst_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(analystId, limit) as any[];

    if (rows.length === 0) return '';

    const lines = rows.map(r => {
      const sym = r.symbol ? ` ${r.symbol}` : '';
      const note = r.notes ? ` — ${r.notes}` : '';
      return `- [${r.signal.toUpperCase()}]${sym}${note} (${r.created_at})`;
    });

    return [
      '--- YOUR RECENT PERFORMANCE ---',
      `Last ${rows.length} outcomes for this analyst:`,
      ...lines,
      'Use this to calibrate your confidence. If your recent calls on a sector were wrong, be more cautious there.',
      '--- END PERFORMANCE ---',
    ].join('\n');
  }

  // -------------------------------------------------------------------------
  // Layer 3: Episodes
  // -------------------------------------------------------------------------

  recordEpisode(episode: TradeEpisode): void {
    try {
      const keywordSource = [
        episode.symbol,
        episode.side,
        episode.opportunityType || '',
        episode.outcomeType,
        episode.thesis || '',
        episode.marketContext || '',
      ].join(' ');

      const keywords = extractKeywords(keywordSource);

      this.db.prepare(`
        INSERT INTO brain_episodes (
          analyst_id, symbol, side, conviction, opportunity_type,
          entry_price, exit_price, pnl_dollars, pnl_percent, hold_days,
          outcome_type, outcome_score, thesis, market_context, keywords, run_id, candidate_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        episode.analystId, episode.symbol, episode.side,
        episode.conviction || null, episode.opportunityType || null,
        episode.entryPrice || null, episode.exitPrice || null,
        episode.pnlDollars || null, episode.pnlPercent || null,
        episode.holdDays || null, episode.outcomeType, episode.outcomeScore,
        episode.thesis || null, episode.marketContext || null,
        keywords, episode.runId || null, episode.candidateId || null
      );
    } catch (err: any) {
      console.warn('Brain recordEpisode error (non-fatal):', err.message);
    }
  }

  getSimilarEpisodes(query: EpisodeQuery): TradeEpisode[] {
    let sql = 'SELECT * FROM brain_episodes WHERE 1=1';
    const params: any[] = [];

    if (query.symbol) {
      sql += ' AND symbol = ?';
      params.push(query.symbol);
    }
    if (query.analystId) {
      sql += ' AND analyst_id = ?';
      params.push(query.analystId);
    }
    if (query.opportunityType) {
      sql += ' AND opportunity_type = ?';
      params.push(query.opportunityType);
    }
    if (query.minScore !== undefined) {
      sql += ' AND outcome_score >= ?';
      params.push(query.minScore);
    }

    sql += ' ORDER BY outcome_score DESC, created_at DESC';
    sql += ` LIMIT ${query.limit || 10}`;

    return this.db.prepare(sql).all(...params) as any[];
  }

  getEpisodesPromptBlock(query: EpisodeQuery): string {
    const episodes = this.getSimilarEpisodes(query);
    if (episodes.length === 0) return '';

    const label = query.symbol ? `for ${query.symbol}` : 'from past trades';

    const lines = episodes.map((e: any) => {
      const pnl = e.pnl_percent != null ? `${e.pnl_percent > 0 ? '+' : ''}${e.pnl_percent.toFixed(1)}%` : 'n/a';
      const days = e.hold_days != null ? `${e.hold_days}d` : '?d';
      const opp = e.opportunity_type || 'unknown';
      return `- ${e.symbol} ${e.side.toUpperCase()} (${opp}, conviction ${e.conviction || '?'}): ${e.outcome_type} ${pnl} in ${days}${e.thesis ? ` — "${e.thesis.substring(0, 80)}"` : ''}`;
    });

    return [
      `--- PAST TRADE EPISODES ${label} ---`,
      ...lines,
      'Learn from these outcomes. Repeat what worked, avoid what failed.',
      '--- END EPISODES ---',
    ].join('\n');
  }

  // -------------------------------------------------------------------------
  // Layer 4: Knowledge Base
  // -------------------------------------------------------------------------

  addToKnowledgeBase(entry: KBEntry): void {
    try {
      const keywordSource = [
        entry.contentType,
        entry.symbol || '',
        entry.opportunityType || '',
        entry.content,
      ].join(' ');

      const keywords = extractKeywords(keywordSource);

      this.db.prepare(`
        INSERT INTO brain_knowledge (
          source_analyst, content_type, title, content, quality_score,
          symbol, opportunity_type, keywords, source_episode_ids
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        entry.sourceAnalyst || null,
        entry.contentType,
        entry.title || null,
        entry.content,
        entry.qualityScore,
        entry.symbol || null,
        entry.opportunityType || null,
        keywords,
        entry.sourceEpisodeIds ? JSON.stringify(entry.sourceEpisodeIds) : null
      );
    } catch (err: any) {
      console.warn('Brain addToKnowledgeBase error (non-fatal):', err.message);
    }
  }

  getKnowledgeExamples(contentType: string, opts?: { symbol?: string; opportunityType?: string; limit?: number }): KBEntry[] {
    let sql = 'SELECT * FROM brain_knowledge WHERE content_type = ?';
    const params: any[] = [contentType];

    if (opts?.symbol) {
      sql += ' AND (symbol = ? OR symbol IS NULL)';
      params.push(opts.symbol);
    }
    if (opts?.opportunityType) {
      sql += ' AND (opportunity_type = ? OR opportunity_type IS NULL)';
      params.push(opts.opportunityType);
    }

    sql += ' ORDER BY quality_score DESC, use_count ASC';
    sql += ` LIMIT ${opts?.limit || 5}`;

    const rows = this.db.prepare(sql).all(...params) as any[];

    // Increment use_count for retrieved entries
    for (const row of rows) {
      this.db.prepare('UPDATE brain_knowledge SET use_count = use_count + 1 WHERE id = ?').run(row.id);
    }

    return rows;
  }

  getKnowledgePromptBlock(contentType: string, opts?: { symbol?: string; limit?: number }): string {
    const entries = this.getKnowledgeExamples(contentType, { ...opts, limit: opts?.limit || 3 });
    if (entries.length === 0) return '';

    const lines = entries.map((e: any) => {
      const title = e.title ? `**${e.title}**: ` : '';
      const sym = e.symbol ? ` [${e.symbol}]` : '';
      return `- ${title}${e.content.substring(0, 200)}${sym} (score: ${e.quality_score.toFixed(1)})`;
    });

    const label = contentType === 'winning_pattern' ? 'WINNING PATTERNS' :
                  contentType === 'losing_pattern' ? 'PATTERNS TO AVOID' :
                  contentType.toUpperCase().replace(/_/g, ' ');

    return [
      `--- ${label} (distilled from past trades) ---`,
      ...lines,
      '--- END PATTERNS ---',
    ].join('\n');
  }

  // -------------------------------------------------------------------------
  // Portfolio Snapshots — track balance over time
  // -------------------------------------------------------------------------

  recordSnapshot(data: {
    portfolioValue: number;
    cash: number;
    equity: number;
    buyingPower: number;
    positionsCount?: number;
    unrealizedPnl?: number;
    dayTradeCount?: number;
    runId?: string;
  }): void {
    try {
      this.db.prepare(`
        INSERT INTO portfolio_snapshots (portfolio_value, cash, equity, buying_power, positions_count, unrealized_pnl, day_trade_count, run_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.portfolioValue, data.cash, data.equity, data.buyingPower,
        data.positionsCount || 0, data.unrealizedPnl || 0,
        data.dayTradeCount || 0, data.runId || null
      );
    } catch (err: any) {
      console.warn('Brain recordSnapshot error (non-fatal):', err.message);
    }
  }

  getSnapshots(limit = 500): any[] {
    return this.db.prepare(`
      SELECT * FROM portfolio_snapshots
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);
  }

  getStartingBalance(): any {
    return this.db.prepare(`
      SELECT * FROM portfolio_snapshots
      ORDER BY created_at ASC
      LIMIT 1
    `).get() || null;
  }

  getLatestSnapshot(): any {
    return this.db.prepare(`
      SELECT * FROM portfolio_snapshots
      ORDER BY created_at DESC
      LIMIT 1
    `).get() || null;
  }

  getDailySnapshots(days = 30): any[] {
    return this.db.prepare(`
      SELECT
        date(created_at) as day,
        MIN(portfolio_value) as open_value,
        MAX(portfolio_value) as high_value,
        MIN(portfolio_value) as low_value,
        (SELECT portfolio_value FROM portfolio_snapshots p2
         WHERE date(p2.created_at) = date(p1.created_at)
         ORDER BY p2.created_at DESC LIMIT 1) as close_value,
        AVG(cash) as avg_cash,
        AVG(equity) as avg_equity,
        COUNT(*) as snapshots
      FROM portfolio_snapshots p1
      WHERE created_at >= datetime('now', '-' || ? || ' days')
      GROUP BY date(created_at)
      ORDER BY day ASC
    `).all(days);
  }

  // -------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------

  getStats(): { observations: number; feedback: number; episodes: number; knowledge: number; snapshots: number } {
    const obs = (this.db.prepare('SELECT COUNT(*) as c FROM brain_observations').get() as any).c;
    const fb = (this.db.prepare('SELECT COUNT(*) as c FROM brain_feedback').get() as any).c;
    const ep = (this.db.prepare('SELECT COUNT(*) as c FROM brain_episodes').get() as any).c;
    const kb = (this.db.prepare('SELECT COUNT(*) as c FROM brain_knowledge').get() as any).c;
    const snaps = (this.db.prepare('SELECT COUNT(*) as c FROM portfolio_snapshots').get() as any).c;
    return { observations: obs, feedback: fb, episodes: ep, knowledge: kb, snapshots: snaps };
  }

  // -------------------------------------------------------------------------
  // Cleanup / Close
  // -------------------------------------------------------------------------

  close(): void {
    this.db.close();
  }
}
