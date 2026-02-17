import { Pool } from 'pg';
import { IStrategy, StrategyConfig, StrategyMetadata } from './types';
import { config } from '../../config';

export class StrategyRegistry {
  private pool: Pool;
  private strategies: Map<string, IStrategy> = new Map();

  constructor(pool?: Pool) {
    this.pool = pool || new Pool({ connectionString: config.dbUrl });
  }

  /**
   * Register a strategy
   */
  async register(strategy: IStrategy): Promise<void> {
    const id = strategy.getId();

    if (this.strategies.has(id)) {
      throw new Error(`Strategy ${id} is already registered`);
    }

    this.strategies.set(id, strategy);

    // Initialize strategy
    await strategy.initialize();

    // Save to database if not exists (non-fatal — DB may not be available in dev)
    try {
      await this.saveToDatabase(strategy);
    } catch (err: any) {
      console.warn(`⚠️  Strategy DB save skipped (${err.message}) — running in-memory only`);
    }

    console.log(`✓ Strategy registered: ${strategy.getName()} (${id})`);
  }

  /**
   * Get strategy by ID
   */
  getStrategy(strategyId: string): IStrategy | undefined {
    return this.strategies.get(strategyId);
  }

  /**
   * Get all registered strategies
   */
  getAllStrategies(): IStrategy[] {
    return Array.from(this.strategies.values());
  }

  /**
   * Get enabled strategies
   */
  async getEnabledStrategies(): Promise<IStrategy[]> {
    const configs = await this.getStrategyConfigs();
    const enabled = configs.filter((c) => c.enabled);

    return enabled
      .map((c) => this.strategies.get(c.strategyId))
      .filter((s): s is IStrategy => s !== undefined);
  }

  /**
   * Enable strategy
   */
  async enableStrategy(strategyId: string): Promise<void> {
    const strategy = this.strategies.get(strategyId);
    if (!strategy) {
      throw new Error(`Strategy ${strategyId} not found`);
    }

    // Update in-memory state immediately
    const cfg = strategy.getConfig();
    cfg.enabled = true;

    // Persist to DB (non-fatal)
    try {
      await this.pool.query(
        `UPDATE trd_strategy SET enabled = true WHERE strategy_id = $1`,
        [strategyId]
      );
    } catch (_err) {
      console.warn(`⚠️  Strategy enable not persisted to DB (running in-memory only)`);
    }

    console.log(`✓ Strategy enabled: ${strategy.getName()}`);
  }

  /**
   * Disable strategy
   */
  async disableStrategy(strategyId: string): Promise<void> {
    const strategy = this.strategies.get(strategyId);
    if (!strategy) {
      throw new Error(`Strategy ${strategyId} not found`);
    }

    // Update in-memory state immediately
    const cfg = strategy.getConfig();
    cfg.enabled = false;

    // Persist to DB (non-fatal)
    try {
      await this.pool.query(
        `UPDATE trd_strategy SET enabled = false WHERE strategy_id = $1`,
        [strategyId]
      );
    } catch (_err) {
      console.warn(`⚠️  Strategy disable not persisted to DB (running in-memory only)`);
    }

    console.log(`✓ Strategy disabled: ${strategy.getName()}`);
  }

  /**
   * Update strategy parameters
   */
  async updateParams(strategyId: string, params: Record<string, any>): Promise<void> {
    const strategy = this.strategies.get(strategyId);
    if (!strategy) {
      throw new Error(`Strategy ${strategyId} not found`);
    }

    // Update in-memory state immediately
    const cfg = strategy.getConfig();
    Object.assign(cfg.params, params);

    // Keep cfg.symbols in sync when symbols param is updated
    if (Array.isArray(params.symbols)) {
      cfg.symbols = params.symbols;
    }

    // Persist to DB (non-fatal)
    try {
      await this.pool.query(
        `UPDATE trd_strategy SET params_json = $1, updated_at = now() WHERE strategy_id = $2`,
        [JSON.stringify(cfg.params), strategyId]
      );
    } catch (_err) {
      console.warn(`⚠️  Strategy params update not persisted to DB (running in-memory only)`);
    }

    console.log(`✓ Strategy params updated: ${strategy.getName()}`);
  }

  /**
   * Get strategy configurations from database
   */
  async getStrategyConfigs(): Promise<StrategyConfig[]> {
    // Fall back to in-memory strategies if DB is unavailable
    try {
      const result = await this.pool.query(`
        SELECT strategy_id, name, version, enabled, params_json
        FROM trd_strategy
        ORDER BY name ASC
      `);

      return result.rows.map((row) => ({
        strategyId: row.strategy_id,
        name: row.name,
        version: row.version,
        enabled: row.enabled,
        params: row.params_json,
        symbols: row.params_json.symbols || [],
        schedule: row.params_json.schedule,
      }));
    } catch (_err) {
      // DB unavailable — return in-memory strategies
      return Array.from(this.strategies.values()).map((s) => {
        const cfg = s.getConfig();
        return {
          strategyId: s.getId(),
          name: s.getName(),
          version: s.getVersion(),
          enabled: cfg.enabled,
          params: cfg.params,
          symbols: cfg.symbols || [],
          schedule: cfg.schedule,
        };
      });
    }
  }

  /**
   * Get strategy metadata (for UI/docs)
   */
  getStrategyMetadata(strategyId: string): StrategyMetadata | undefined {
    const strategy = this.strategies.get(strategyId);
    if (!strategy) {
      return undefined;
    }

    // This should be implemented by each strategy
    // For now, return basic info
    return {
      id: strategy.getId(),
      name: strategy.getName(),
      version: strategy.getVersion(),
      description: 'Strategy description', // TODO: Add description method to IStrategy
      author: 'OpenClaw',
      params: [], // TODO: Add params metadata to IStrategy
    };
  }

  /**
   * Save strategy to database
   */
  private async saveToDatabase(strategy: IStrategy): Promise<void> {
    const strategyConfig = strategy.getConfig();

    // Check if strategy already exists
    const existingResult = await this.pool.query(
      `SELECT strategy_id FROM trd_strategy WHERE strategy_id = $1`,
      [strategy.getId()]
    );

    if (existingResult.rows.length > 0) {
      // Update existing
      await this.pool.query(
        `UPDATE trd_strategy
         SET name = $1, version = $2, params_json = $3, updated_at = now()
         WHERE strategy_id = $4`,
        [strategyConfig.name, strategyConfig.version, JSON.stringify(strategyConfig.params), strategy.getId()]
      );
    } else {
      // Insert new
      await this.pool.query(
        `INSERT INTO trd_strategy (strategy_id, name, version, enabled, params_json)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          strategy.getId(),
          strategyConfig.name,
          strategyConfig.version,
          strategyConfig.enabled,
          JSON.stringify(strategyConfig.params),
        ]
      );
    }
  }

  /**
   * Cleanup all strategies
   */
  async cleanup(): Promise<void> {
    for (const strategy of this.strategies.values()) {
      await strategy.cleanup();
    }
  }
}
