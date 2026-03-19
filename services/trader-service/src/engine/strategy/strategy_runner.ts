import { StrategyRegistry } from './strategy_registry';
import { Signal, MarketData } from './types';
import { OrderRouter } from '../execution/order_router';
import { IBrokerAdapter } from '../execution/broker/types';
import { AlpacaAdapter } from '../execution/broker/alpaca';
import { AttributionStore } from '../allocation/attribution-store';
import { CapitalAllocator } from '../allocation/capital-allocator';
import { signalToCandidate } from '../allocation/candidate-normalizer';
import { TradeDecision, RegimeLabel } from '../allocation/types';
import { config } from '../../config';
import { v4 as uuidv4 } from 'uuid';

export class StrategyRunner {
  private registry: StrategyRegistry;
  private orderRouter: OrderRouter;
  private broker: IBrokerAdapter;
  private isRunning: boolean = false;
  private runInterval: NodeJS.Timeout | null = null;
  private attrStore: AttributionStore | null = null;
  private allocator: CapitalAllocator | null = null;

  constructor(
    registry?: StrategyRegistry,
    broker?: IBrokerAdapter,
    attrStore?: AttributionStore | null,
    allocator?: CapitalAllocator | null,
  ) {
    this.registry = registry || new StrategyRegistry();

    if (broker) {
      this.broker = broker;
    } else if (config.brokerApiKey && config.brokerApiSecret) {
      this.broker = new AlpacaAdapter({
        apiKey: config.brokerApiKey,
        apiSecret: config.brokerApiSecret,
        baseUrl: config.brokerBaseUrl,
      });
    } else {
      this.broker = null as unknown as IBrokerAdapter;
    }

    this.orderRouter = new OrderRouter(this.broker);
    this.attrStore = attrStore || null;
    this.allocator = allocator || null;
  }

  /**
   * Start running strategies on interval
   */
  async start(intervalMs: number = 60000): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️  Strategy runner already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Strategy Runner: Starting (running every ' + intervalMs + 'ms)');

    // Run immediately, then on interval
    await this.runStrategies();

    this.runInterval = setInterval(async () => {
      try {
        await this.runStrategies();
      } catch (error: any) {
        console.error('Strategy execution error:', error.message);
      }
    }, intervalMs);
  }

  /**
   * Stop running strategies
   */
  async stop(): Promise<void> {
    if (this.runInterval) {
      clearInterval(this.runInterval);
      this.runInterval = null;
    }
    this.isRunning = false;
    console.log('🛑 Strategy Runner: Stopped');
  }

  /**
   * Run all enabled strategies
   */
  async runStrategies(): Promise<void> {
    const enabledStrategies = await this.registry.getEnabledStrategies();

    if (enabledStrategies.length === 0) {
      return; // No enabled strategies
    }

    console.log('\n🎯 Running strategies...');
    console.log(`   Enabled strategies: ${enabledStrategies.length}`);

    // Get all symbols from all strategies
    const allSymbols = new Set<string>();
    for (const strategy of enabledStrategies) {
      const strategyConfig = strategy.getConfig();
      strategyConfig.symbols.forEach((s) => allSymbols.add(s));
    }

    // Fetch market data for all symbols
    const marketData = await this.fetchMarketData(Array.from(allSymbols));

    // Run each strategy
    for (const strategy of enabledStrategies) {
      try {
        await this.runStrategy(strategy, marketData);
      } catch (error: any) {
        console.error(`Error running strategy ${strategy.getName()}:`, error.message);
      }
    }

    console.log('✓ Strategy run complete\n');
  }

  /**
   * Run a single strategy
   */
  private async runStrategy(
    strategy: any,
    marketData: Map<string, MarketData[]>
  ): Promise<void> {
    console.log(`\n→ Running strategy: ${strategy.getName()}`);

    // Generate signals
    const signals = await strategy.generateSignals(marketData);

    if (signals.length === 0) {
      console.log('  No signals generated');
      return;
    }

    console.log(`  Generated ${signals.length} signal(s)`);

    // Process each signal
    for (const signal of signals) {
      await this.processSignal(strategy, signal);
    }
  }

  /**
   * Process a signal (log + convert to order + submit)
   */
  private async processSignal(strategy: any, signal: Signal): Promise<void> {
    // Log signal to database
    await this.logSignal(signal);

    console.log(`\n📊 SIGNAL: ${signal.side.toUpperCase()} ${signal.symbol}`);
    console.log(`   Strategy: ${strategy.getName()}`);
    console.log(`   Price: $${signal.price.toFixed(2)}`);
    console.log(`   Strength: ${(signal.strength * 100).toFixed(0)}%`);
    console.log(`   Reason: ${signal.reason}`);

    // Create TradeCandidate for attribution (uses cached regime from last panel run)
    let candidateId: string | undefined;
    if (this.attrStore) {
      try {
        const latestRegime = this.attrStore.getLatestRegime();
        const regimeLabel: RegimeLabel = latestRegime?.label || 'unknown';
        const candidate = signalToCandidate(signal, regimeLabel, latestRegime?.id);
        // Use the strategy's human name
        candidate.sourceName = strategy.getName();
        this.attrStore.insertCandidate(candidate);
        candidateId = candidate.candidateId;
      } catch (e: any) {
        console.warn(`⚠️  Failed to store candidate for ${signal.symbol}:`, e.message);
      }
    }

    // Route through allocator if available, otherwise use legacy signalToIntent()
    let intent;

    if (this.allocator && this.attrStore && candidateId) {
      // NEW: Allocator-driven sizing
      try {
        const candidate = this.attrStore.getCandidateById(candidateId);
        if (candidate) {
          // Get current positions from broker for constraint checks
          const positions = await this.broker.getPositions();
          const existingSymbols = (positions || []).map((p: any) => p.symbol);
          const account = await this.broker.getAccount();
          const portfolioValue = account.portfolioValue || account.equity || 500;

          const decision = this.allocator.evaluateOne(
            candidate,
            signal.price,
            portfolioValue,
            existingSymbols,
          );

          if (decision.action === 'reject') {
            console.log(`💰 Allocator REJECTED: ${signal.symbol} — ${decision.reasons.join(', ')}`);
            return;
          }

          // Build intent from allocator decision
          intent = {
            intentId: uuidv4(),
            strategyId: signal.strategyId,
            signalId: signal.signalId,
            symbol: signal.symbol,
            side: signal.side,
            qty: decision.approvedQty || 1,
            orderType: 'market' as const,
            timeInForce: 'day' as const,
            signalPrice: signal.price,
          };

          console.log(`💰 Allocator: ${signal.symbol} → score ${decision.allocatorScore}, ${decision.approvedQty} shares ($${(decision.dollarValue || 0).toFixed(2)})`);
        } else {
          // Candidate not found — fall back to legacy
          intent = await strategy.signalToIntent(signal);
        }
      } catch (e: any) {
        console.warn(`⚠️  Allocator failed, falling back to legacy sizing:`, e.message);
        intent = await strategy.signalToIntent(signal);
      }
    } else {
      // LEGACY: Strategy determines its own sizing
      intent = await strategy.signalToIntent(signal);
    }

    console.log(`\n→ Order intent: ${intent.side.toUpperCase()} ${intent.qty} ${intent.symbol} @ $${intent.signalPrice || intent.limitPrice || '?'}`);

    // Submit order through order router (includes risk checks)
    const result = await this.orderRouter.submitOrder(intent);

    if (result.success) {
      console.log(`✅ Order submitted successfully`);
      console.log(`   Broker Order ID: ${result.brokerOrderId}`);
    } else {
      console.log(`❌ Order rejected: ${result.failReason}`);
    }
  }

  /**
   * Fetch market data from broker
   */
  private async fetchMarketData(symbols: string[]): Promise<Map<string, MarketData[]>> {
    const marketDataMap = new Map<string, MarketData[]>();

    await this.broker.connect();

    // Calculate date range: 90 days of history for MA calculations
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);

    for (const symbol of symbols) {
      try {
        // Fetch real historical bars from Alpaca
        const bars = await this.broker.getBars(symbol, {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          timeframe: '1Day',
          limit: 100,
          adjustment: 'split'
        });

        if (bars.length === 0) {
          console.log(`⚠️  No historical data available for ${symbol}`);
          continue;
        }

        marketDataMap.set(symbol, bars);

        // Log bar statistics for verification
        const firstBar = bars[0];
        const lastBar = bars[bars.length - 1];
        console.log(`✓ Fetched ${bars.length} bars for ${symbol}`);
        console.log(`  Range: ${firstBar.timestamp.toISOString().split('T')[0]} to ${lastBar.timestamp.toISOString().split('T')[0]}`);
        console.log(`  Latest close: $${lastBar.close.toFixed(2)}`);

      } catch (error: any) {
        console.error(`Error fetching bars for ${symbol}:`, error.message);
      }
    }

    return marketDataMap;
  }

  /**
   * Log signal to database
   */
  private async logSignal(signal: Signal): Promise<void> {
    await this.pool.query(
      `INSERT INTO trd_signal (signal_id, strategy_id, symbol, side, confidence, signal_ts, features_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        signal.signalId,
        signal.strategyId,
        signal.symbol,
        signal.side,
        signal.strength,
        signal.timestamp,
        JSON.stringify(signal.features || {}),
      ]
    );
  }

  /**
   * Get strategy registry
   */
  getRegistry(): StrategyRegistry {
    return this.registry;
  }
}
