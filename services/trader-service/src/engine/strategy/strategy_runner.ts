import { Pool } from 'pg';
import { StrategyRegistry } from './strategy_registry';
import { Signal, MarketData } from './types';
import { OrderRouter } from '../execution/order_router';
import { IBrokerAdapter } from '../execution/broker/types';
import { AlpacaAdapter } from '../execution/broker/alpaca';
import { config } from '../../config';
import { v4 as uuidv4 } from 'uuid';

export class StrategyRunner {
  private pool: Pool;
  private registry: StrategyRegistry;
  private orderRouter: OrderRouter;
  private broker: IBrokerAdapter;
  private isRunning: boolean = false;
  private runInterval: NodeJS.Timeout | null = null;

  constructor(
    pool?: Pool,
    registry?: StrategyRegistry,
    broker?: IBrokerAdapter
  ) {
    this.pool = pool || new Pool({ connectionString: config.dbUrl });
    this.registry = registry || new StrategyRegistry(this.pool);

    if (broker) {
      this.broker = broker;
    } else if (config.brokerApiKey && config.brokerApiSecret) {
      this.broker = new AlpacaAdapter({
        apiKey: config.brokerApiKey,
        apiSecret: config.brokerApiSecret,
        baseUrl: config.brokerBaseUrl,
      });
    } else {
      // No broker credentials — paper/dev mode (no live connection)
      this.broker = null as unknown as IBrokerAdapter;
    }

    this.orderRouter = new OrderRouter(this.pool, this.broker);
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

    // Convert signal to order intent
    const intent = await strategy.signalToIntent(signal);

    console.log(`\n→ Converting signal to order intent...`);
    console.log(`   ${intent.side.toUpperCase()} ${intent.qty} ${intent.symbol} @ $${intent.limitPrice}`);

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
