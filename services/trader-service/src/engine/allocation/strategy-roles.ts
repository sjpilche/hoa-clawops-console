// =============================================================================
// Strategy Role Registry — Assigns roles to signal sources
// =============================================================================
// Every source (strategy or analyst) has a role that determines what it can do:
//
//   primary_alpha  — can open new positions (full allocator path)
//   filter         — can only influence existing positions (no new opens)
//   research       — candidates logged but never executed (paper-only)
//   disabled       — completely off, no candidates created
//
// Roles are persisted in SQLite and auto-adjusted by distillation based on
// the source's reliability score.
// =============================================================================

import Database from 'better-sqlite3';
import { BookId } from './types';
import { SourceProfile } from '../learning/source-profiles';

export type StrategyRole = 'primary_alpha' | 'filter' | 'research' | 'disabled';

export interface StrategyRoleConfig {
  sourceId: string;
  sourceName: string;
  role: StrategyRole;
  defaultBook?: BookId;
  autoPromoteThreshold: number;   // reliability score to auto-promote from research → filter
  autoDemoteThreshold: number;    // reliability score to auto-demote to research
}

// Initial role assignments (seeded on first run)
const INITIAL_ROLES: StrategyRoleConfig[] = [
  // === Original strategies ===
  { sourceId: 'c3f8b8e0-4d1c-4c9f-8f3a-1e5b7a9c6d2e', sourceName: 'MA Crossover',        role: 'filter',        defaultBook: 'trend',    autoPromoteThreshold: 0.6, autoDemoteThreshold: 0.3 },
  { sourceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',  sourceName: 'RSI Mean Reversion',   role: 'research',      defaultBook: 'swing',    autoPromoteThreshold: 0.6, autoDemoteThreshold: 0.3 },
  { sourceId: 'd4e5f6a7-b8c9-0123-4567-89abcdef0123',  sourceName: 'Bollinger Reversion',  role: 'research',      defaultBook: 'swing',    autoPromoteThreshold: 0.6, autoDemoteThreshold: 0.3 },
  { sourceId: 'e5f6a7b8-c9d0-1234-5678-9abcdef01234',  sourceName: 'Volume Spike',         role: 'research',      defaultBook: 'intraday', autoPromoteThreshold: 0.6, autoDemoteThreshold: 0.3 },
  { sourceId: 'f6a7b8c9-d0e1-2345-6789-abcdef012345',  sourceName: 'Gap Reversal',         role: 'research',      defaultBook: 'intraday', autoPromoteThreshold: 0.6, autoDemoteThreshold: 0.3 },
  // === New strategies (backtest-proven) ===
  { sourceId: 'e7f8a9b0-c1d2-3456-efab-cd7890123456',  sourceName: 'RS Rotation',          role: 'primary_alpha', defaultBook: 'swing',    autoPromoteThreshold: 0.5, autoDemoteThreshold: 0.3 },
  { sourceId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',  sourceName: 'VIX Fear Spike',       role: 'primary_alpha', defaultBook: 'swing',    autoPromoteThreshold: 0.5, autoDemoteThreshold: 0.3 },
  { sourceId: 'c3d4e5f6-a7b8-9012-cdef-234567890123',  sourceName: 'Turn of Month',        role: 'primary_alpha', defaultBook: 'swing',    autoPromoteThreshold: 0.5, autoDemoteThreshold: 0.3 },
  { sourceId: 'd4e5f6a7-b8c9-0123-defa-345678901234',  sourceName: 'Post-Earnings Drift',  role: 'research',      defaultBook: 'swing',    autoPromoteThreshold: 0.6, autoDemoteThreshold: 0.3 },
  { sourceId: 'a1b2c3d4-0001-4567-abcd-overnight00001', sourceName: 'Overnight Premium',    role: 'research',      defaultBook: 'intraday', autoPromoteThreshold: 0.5, autoDemoteThreshold: 0.3 },
  { sourceId: 'a1b2c3d4-0002-4567-abcd-oversold00002',  sourceName: 'Oversold Large Cap',   role: 'primary_alpha', defaultBook: 'swing',    autoPromoteThreshold: 0.5, autoDemoteThreshold: 0.3 },
  { sourceId: 'a1b2c3d4-0003-4567-abcd-holiday000003',  sourceName: 'Holiday Effect',       role: 'primary_alpha', defaultBook: 'swing',    autoPromoteThreshold: 0.5, autoDemoteThreshold: 0.3 },
  // === AI Analysts ===
  { sourceId: 'value-hunter',      sourceName: 'Value Hunter',      role: 'primary_alpha', defaultBook: 'trend',    autoPromoteThreshold: 0.5, autoDemoteThreshold: 0.25 },
  { sourceId: 'risk-sentinel',     sourceName: 'Risk Sentinel',     role: 'filter',        defaultBook: undefined,  autoPromoteThreshold: 0.5, autoDemoteThreshold: 0.25 },
  { sourceId: 'momentum-scanner',  sourceName: 'Momentum Scanner',  role: 'primary_alpha', defaultBook: 'swing',    autoPromoteThreshold: 0.5, autoDemoteThreshold: 0.25 },
  { sourceId: 'special-situations', sourceName: 'Special Situations', role: 'primary_alpha', defaultBook: 'intraday', autoPromoteThreshold: 0.5, autoDemoteThreshold: 0.25 },
];

export class StrategyRoleRegistry {
  private db: Database.Database;
  private cache: Map<string, StrategyRoleConfig> = new Map();

  constructor(db: Database.Database) {
    this.db = db;
    this.seed();
    this.loadCache();
    console.log(`🏷️  Strategy Roles: ${this.cache.size} sources registered`);
  }

  private seed(): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO strategy_roles (source_id, source_name, role, default_book, auto_promote_threshold, auto_demote_threshold)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const r of INITIAL_ROLES) {
      stmt.run(r.sourceId, r.sourceName, r.role, r.defaultBook || null, r.autoPromoteThreshold, r.autoDemoteThreshold);
    }
  }

  private loadCache(): void {
    const rows = this.db.prepare('SELECT * FROM strategy_roles').all() as any[];
    this.cache.clear();
    for (const row of rows) {
      this.cache.set(row.source_id, {
        sourceId: row.source_id,
        sourceName: row.source_name,
        role: row.role,
        defaultBook: row.default_book || undefined,
        autoPromoteThreshold: row.auto_promote_threshold,
        autoDemoteThreshold: row.auto_demote_threshold,
      });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Get the role for a source. Returns 'research' for unknown sources (safe default).
   */
  getRole(sourceId: string): StrategyRole {
    // Source IDs from panel can be comma-separated (multiple analysts)
    // Check each analyst ID
    const ids = sourceId.split(',');
    for (const id of ids) {
      const config = this.cache.get(id.trim());
      if (config) return config.role;
    }
    return 'research';  // Unknown sources default to research (safe)
  }

  /**
   * Get the default book for a source.
   */
  getDefaultBook(sourceId: string): BookId | undefined {
    const ids = sourceId.split(',');
    for (const id of ids) {
      const config = this.cache.get(id.trim());
      if (config?.defaultBook) return config.defaultBook;
    }
    return undefined;
  }

  /**
   * Manually set a role for a source.
   */
  setRole(sourceId: string, role: StrategyRole): void {
    this.db.prepare(
      'UPDATE strategy_roles SET role = ?, updated_at = datetime(\'now\') WHERE source_id = ?'
    ).run(role, sourceId);

    const cached = this.cache.get(sourceId);
    if (cached) cached.role = role;
  }

  /**
   * Get all role assignments.
   */
  getAllRoles(): StrategyRoleConfig[] {
    return [...this.cache.values()];
  }

  /**
   * Auto-adjust roles based on source reliability profiles.
   * Called during distillation.
   *
   * Rules:
   *   - research → filter: when reliability >= autoPromoteThreshold
   *   - filter → research: when reliability < autoDemoteThreshold
   *   - primary_alpha → filter: when reliability < autoDemoteThreshold
   *   - Never auto-promote to primary_alpha (requires manual approval)
   *   - Never auto-disable (requires manual action)
   */
  autoAdjustRoles(profiles: SourceProfile[]): { promoted: string[]; demoted: string[] } {
    const promoted: string[] = [];
    const demoted: string[] = [];

    for (const profile of profiles) {
      const config = this.cache.get(profile.sourceId);
      if (!config) continue;
      if (profile.tradeCount < 10) continue;  // Not enough data

      const { reliabilityScore } = profile;

      // Promotion: research → filter (only direction allowed automatically)
      if (config.role === 'research' && reliabilityScore >= config.autoPromoteThreshold) {
        this.setRole(profile.sourceId, 'filter');
        promoted.push(`${config.sourceName}: research → filter (reliability ${(reliabilityScore * 100).toFixed(0)}%)`);
      }

      // Demotion: primary_alpha → filter (edge decay)
      else if (config.role === 'primary_alpha' && reliabilityScore < config.autoDemoteThreshold) {
        this.setRole(profile.sourceId, 'filter');
        demoted.push(`${config.sourceName}: primary_alpha → filter (reliability ${(reliabilityScore * 100).toFixed(0)}%)`);
      }

      // Demotion: filter → research (further edge decay)
      else if (config.role === 'filter' && reliabilityScore < config.autoDemoteThreshold * 0.7) {
        this.setRole(profile.sourceId, 'research');
        demoted.push(`${config.sourceName}: filter → research (reliability ${(reliabilityScore * 100).toFixed(0)}%)`);
      }
    }

    if (promoted.length > 0) console.log(`📈 Auto-promoted: ${promoted.join(', ')}`);
    if (demoted.length > 0) console.log(`📉 Auto-demoted: ${demoted.join(', ')}`);

    return { promoted, demoted };
  }
}
