import { IStrategy, StrategyConfig, StrategyMetadata } from './types';
import { getExecStore } from '../../singletons';

export class StrategyRegistry {
  private strategies: Map<string, IStrategy> = new Map();

  async register(strategy: IStrategy): Promise<void> {
    const id = strategy.getId();
    if (this.strategies.has(id)) throw new Error(`Strategy ${id} already registered`);

    this.strategies.set(id, strategy);
    await strategy.initialize();

    // Save to SQLite
    try {
      const exec = getExecStore();
      if (exec) {
        const cfg = strategy.getConfig();
        exec.upsertStrategy(id, cfg.name, cfg.version, cfg.enabled, cfg.params);
      }
    } catch (err: any) {
      console.warn(`⚠️  Strategy DB save skipped: ${err.message}`);
    }

    console.log(`✓ Strategy registered: ${strategy.getName()} (${id})`);
  }

  getStrategy(strategyId: string): IStrategy | undefined {
    return this.strategies.get(strategyId);
  }

  getAllStrategies(): IStrategy[] {
    return Array.from(this.strategies.values());
  }

  async getEnabledStrategies(): Promise<IStrategy[]> {
    const configs = await this.getStrategyConfigs();
    return configs.filter(c => c.enabled).map(c => this.strategies.get(c.strategyId)).filter((s): s is IStrategy => !!s);
  }

  async enableStrategy(strategyId: string): Promise<void> {
    const strategy = this.strategies.get(strategyId);
    if (!strategy) throw new Error(`Strategy ${strategyId} not found`);
    strategy.getConfig().enabled = true;
    try { getExecStore()?.setStrategyEnabled(strategyId, true); } catch {}
    console.log(`✓ Strategy enabled: ${strategy.getName()}`);
  }

  async disableStrategy(strategyId: string): Promise<void> {
    const strategy = this.strategies.get(strategyId);
    if (!strategy) throw new Error(`Strategy ${strategyId} not found`);
    strategy.getConfig().enabled = false;
    try { getExecStore()?.setStrategyEnabled(strategyId, false); } catch {}
    console.log(`✓ Strategy disabled: ${strategy.getName()}`);
  }

  async updateParams(strategyId: string, params: Record<string, any>): Promise<void> {
    const strategy = this.strategies.get(strategyId);
    if (!strategy) throw new Error(`Strategy ${strategyId} not found`);
    const cfg = strategy.getConfig();
    Object.assign(cfg.params, params);
    if (Array.isArray(params.symbols)) cfg.symbols = params.symbols;
    try {
      const exec = getExecStore();
      if (exec) exec.upsertStrategy(strategyId, cfg.name, cfg.version, cfg.enabled, cfg.params);
    } catch {}
    console.log(`✓ Strategy params updated: ${strategy.getName()}`);
  }

  async getStrategyConfigs(): Promise<StrategyConfig[]> {
    // Always use in-memory strategies (source of truth)
    return Array.from(this.strategies.values()).map(s => {
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

  getStrategyMetadata(strategyId: string): StrategyMetadata | undefined {
    const s = this.strategies.get(strategyId);
    if (!s) return undefined;
    return { id: s.getId(), name: s.getName(), version: s.getVersion(), description: '', author: 'OpenClaw', params: [] };
  }

  async cleanup(): Promise<void> {
    for (const s of this.strategies.values()) await s.cleanup();
  }
}
