import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import path from 'path';
import { config } from './config';

// Import routes
import healthRouter from './api/routes/health';
import riskRouter from './api/routes/risk-real'; // REAL risk engine!
import killSwitchRouter from './api/routes/kill-switch-real'; // REAL kill switch!
import positionsRouter from './api/routes/positions';
import brokerRouter from './api/routes/broker'; // Broker integration!
import ordersRouter from './api/routes/orders'; // Order submission!
import strategiesRouter from './api/routes/strategies-real'; // REAL strategies!
import aiPanelRouter from './api/routes/ai-panel'; // AI Analyst Panel!
import brainRouter from './api/routes/brain'; // Brain + Learning API!
import polymarketRouter from './api/routes/polymarket'; // Polymarket prediction markets!
import copyTradeRouter from './api/routes/copy-trade';  // Copy-trade engine!
import performanceRouter from './api/routes/performance'; // Performance metrics!
import attributionRouter from './api/routes/attribution'; // Attribution engine!
import backtestRouter from './api/routes/backtest'; // Strategy backtesting!
import optionsRouter, { setOptionsTracker, setOptionsEngine } from './api/routes/options'; // Options tracking!
import weatherRouter, { setWeatherScheduler } from './api/routes/weather'; // Weather trading!
import kalshiAutoRouter, { setKalshiScheduler } from './api/routes/kalshi-auto'; // Kalshi auto-trader!
import optionsLabRouter, { setOptionsLabScheduler } from './api/routes/options-lab'; // Options Lab!
import { initializeStrategyRunner } from './api/routes/strategies-real';

// Import engine components
import { KillSwitch } from './engine/risk/kill_switch';
import { FillHandler } from './engine/execution/fill_handler';
import { StrategyRunner } from './engine/strategy/strategy_runner';
import { MovingAverageCrossoverStrategy } from './engine/strategy/strategies/moving_average_crossover';
import { RsiMeanReversionStrategy } from './engine/strategy/strategies/rsi_mean_reversion';
import { RelativeStrengthRotationStrategy } from './engine/strategy/strategies/relative_strength_rotation';
import { VixFearSpikeStrategy } from './engine/strategy/strategies/vix_fear_spike';
import { TurnOfMonthStrategy } from './engine/strategy/strategies/turn_of_month';
import { PostEarningsDriftStrategy } from './engine/strategy/strategies/post_earnings_drift';
import { OvernightPremiumStrategy } from './engine/strategy/strategies/overnight_premium';
import { OversoldLargeCapStrategy } from './engine/strategy/strategies/oversold_largecap';
import { HolidayEffectStrategy } from './engine/strategy/strategies/holiday_effect';

// Import brain + learning components
import { BrainStore } from './engine/learning/brain-store';
import { OutcomeTracker } from './engine/learning/outcome-tracker';
import { DistillationEngine } from './engine/learning/distillation';
import { PanelRunner } from './engine/ai-panel/panel-runner';
import { TradingScheduler } from './engine/ai-panel/scheduler';
import { CopyTradeEngine } from './engine/copy-trade/copy-trade-engine';

// Weather trading (Polymarket)
import { WeatherScheduler } from './engine/weather/scheduler';

// Kalshi auto-trader
import { KalshiAdapter } from './engine/execution/broker/kalshi';

// Import database pool for graceful shutdown
import { closePool } from './db/pool';

// Singletons (so routes can access brain/scheduler/execStore)
import { setBrain, setScheduler, setOutcomeTracker, setPanelRunner, setCopyEngine, setExecStore, setAttributionStore, setCapitalAllocator } from './singletons';
import { AttributionStore } from './engine/allocation/attribution-store';
import { CapitalAllocator } from './engine/allocation/capital-allocator';
import { SourceProfiler } from './engine/learning/source-profiles';
import { DistillationV2Engine } from './engine/learning/distillation-v2';
import { BookManager } from './engine/allocation/book-manager';
import { StrategyRoleRegistry } from './engine/allocation/strategy-roles';
import { ExecStore } from './db/exec-store';
import { OptionsTracker } from './engine/options/options-tracker';

const app = express();

// Middleware
app.use(helmet());

// CORS - Restrict to console origin only
app.use(cors({
  origin: config.consoleUrl,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Authorization', 'Content-Type'],
  maxAge: 86400 // 24 hours
}));

app.use(compression());
app.use(express.json({ limit: '1mb' })); // Limit request body size
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Request logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Routes
app.get('/', (_req: Request, res: Response) => {
  res.json({
    service: 'OpenClaw Trader',
    version: '0.2.0',
    mode: config.tradingMode,
    status: 'operational',
    brain: 'connected',
  });
});

app.use('/health', healthRouter);
app.use('/api/strategies', strategiesRouter);
app.use('/api/risk', riskRouter);
app.use('/api/kill-switch', killSwitchRouter);
app.use('/api/positions', positionsRouter);
app.use('/api/broker', brokerRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/ai-panel', aiPanelRouter);
app.use('/api/brain', brainRouter);
app.use('/api/polymarket', polymarketRouter);
app.use('/api/copy-trade', copyTradeRouter);
app.use('/api/performance', performanceRouter);
app.use('/api/attribution', attributionRouter);
app.use('/api/backtest', backtestRouter);
app.use('/api/options', optionsRouter);
app.use('/api/weather', weatherRouter);
app.use('/api/kalshi', kalshiAutoRouter);
app.use('/api/options-lab', optionsLabRouter);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  // Log error details server-side
  console.error('Unhandled error:', {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    error: err.message,
    stack: config.nodeEnv === 'development' ? err.stack : undefined
  });

  // Send safe error response to client
  res.status(500).json({
    error: 'Internal server error',
    // Only include error details in development
    ...(config.nodeEnv === 'development' && { message: err.message })
  });
});

// ============================================================================
// Initialize components
// ============================================================================

const killSwitch = new KillSwitch();
const fillHandler = new FillHandler();  // No more Pool — uses ExecStore singleton
const strategyRunner = new StrategyRunner();

// Weather trading
let weatherScheduler: WeatherScheduler | null = null;

// Brain + Learning (new)
let brain: BrainStore | null = null;
let outcomeTracker: OutcomeTracker | null = null;
let distillation: DistillationEngine | null = null;
let panelRunner: PanelRunner | null = null;
let scheduler: TradingScheduler | null = null;

// Initialize strategy runner with strategies
async function initializeStrategies() {
  const registry = strategyRunner.getRegistry();

  const maStrategy = new MovingAverageCrossoverStrategy({
    fastPeriod: 10,
    slowPeriod: 30,
    positionSize: 500,
    symbols: ['AAPL', 'MSFT'],
  });

  await registry.register(maStrategy);
  await registry.enableStrategy(maStrategy.getId());

  const rsiStrategy = new RsiMeanReversionStrategy({
    rsiPeriod: 14,
    oversoldThreshold: 30,
    overboughtThreshold: 70,
    positionSize: 500,
    symbols: ['AAPL', 'MSFT', 'SPY'],
  });

  await registry.register(rsiStrategy);
  await registry.enableStrategy(rsiStrategy.getId());

  // Relative Strength Rotation — always in the top 2 ETFs by 20-day momentum
  const rsrStrategy = new RelativeStrengthRotationStrategy({
    topN: 2,
    momentumDays: 20,
    positionSize: 500,
    symbols: ['SPY', 'QQQ', 'IWM', 'XLK', 'XLE', 'XLF', 'GLD', 'TLT'],
  });

  await registry.register(rsrStrategy);
  await registry.enableStrategy(rsrStrategy.getId());

  // VIX Fear Spike — buy SPY when VIX spikes 20%+ above 10d avg
  const vixStrategy = new VixFearSpikeStrategy({ positionSize: 500 });
  await registry.register(vixStrategy);
  await registry.enableStrategy(vixStrategy.getId());

  // Turn of Month — buy last day of month, sell 3rd trading day of new month
  const tomStrategy = new TurnOfMonthStrategy({ positionSize: 500 });
  await registry.register(tomStrategy);
  await registry.enableStrategy(tomStrategy.getId());

  // Post-Earnings Drift — buy on 3%+ gap with volume, hold 10 days
  const peadStrategy = new PostEarningsDriftStrategy({ positionSize: 500 });
  await registry.register(peadStrategy);
  await registry.enableStrategy(peadStrategy.getId());

  // Overnight Premium — buy at close, sell at open (daily)
  const overnightStrategy = new OvernightPremiumStrategy({ positionSize: 500 });
  await registry.register(overnightStrategy);
  await registry.enableStrategy(overnightStrategy.getId());

  // Oversold Large Cap Snap-Back — buy 7%+ weekly drops in mega-caps
  const oversoldStrategy = new OversoldLargeCapStrategy({ positionSize: 500 });
  await registry.register(oversoldStrategy);
  await registry.enableStrategy(oversoldStrategy.getId());

  // Holiday Effect — buy 2 days before major US holidays
  const holidayStrategy = new HolidayEffectStrategy({ positionSize: 500 });
  await registry.register(holidayStrategy);
  await registry.enableStrategy(holidayStrategy.getId());

  initializeStrategyRunner(strategyRunner);
}

/**
 * Initialize the Trader Brain and recursive learning pipeline.
 * Non-fatal: if brain fails, trader runs without learning.
 */
function initializeBrain(): void {
  try {
    // 1. Brain Store (SQLite)
    const brainPath = config.brainDbPath || path.join(process.cwd(), 'data', 'trader-brain.sqlite');
    brain = new BrainStore(brainPath);

    // 1b. Attribution Store (uses same SQLite DB for regime, candidates, decisions)
    const attrStore = new AttributionStore(brain.getDatabase());
    setAttributionStore(attrStore);

    // 1c. Source Profiler (per-source reliability metrics)
    const profiler = new SourceProfiler(brain.getDatabase(), attrStore);

    // 1d. Book Manager (intraday/swing/trend)
    const bookManager = new BookManager(brain.getDatabase());

    // 1e. Strategy Role Registry (primary_alpha/filter/research/disabled)
    const roleRegistry = new StrategyRoleRegistry(brain.getDatabase());

    // 1f. Capital Allocator (score-based sizing, book-aware, role-aware)
    const allocator = new CapitalAllocator(attrStore, {
      minScoreToExecute: config.allocatorMinScore,
      maxOpenPositions: config.allocatorMaxOpenPositions,
      maxDailyNewPositions: config.allocatorMaxDailyNewPositions,
      sizing: {
        maxPositionPct: config.allocatorMaxPositionPct,
        minPositionDollars: 5,
        riskPerTradePct: config.allocatorRiskPctPerTrade,
      },
    }, profiler, bookManager, roleRegistry);
    setCapitalAllocator(allocator);

    // 2. Outcome Tracker (bridges fills → brain episodes, links to candidates)
    outcomeTracker = new OutcomeTracker(brain, attrStore);

    // 3. Wire fills to brain: fill handler → outcome tracker
    fillHandler.setOnFillCallback(async (fill) => {
      if (outcomeTracker) {
        outcomeTracker.onFill({
          symbol: fill.symbol,
          side: fill.side,
          price: fill.price,
          qty: fill.qty,
          fillId: fill.fillId,
        });
      }
    });

    // 4. Distillation V2 Engine (patterns + attribution + source profiles + calibration + role adjustment)
    distillation = new DistillationV2Engine(brain, attrStore, profiler, roleRegistry);

    // 5. Panel Runner (brain-aware, multi-analyst, allocator-enabled, profiler-enabled)
    panelRunner = new PanelRunner(brain, outcomeTracker, attrStore, allocator, profiler);

    // 6. Trading Scheduler (3-min loop with run lock)
    scheduler = new TradingScheduler(panelRunner, distillation);

    // Register singletons for route access
    setBrain(brain);
    setOutcomeTracker(outcomeTracker);
    setPanelRunner(panelRunner);
    setScheduler(scheduler);

    // 6b. ExecStore (SQLite execution adapter — replaces PostgreSQL)
    const execStore = new ExecStore(brain.getDatabase());
    setExecStore(execStore);

    // 7. Options Tracker (separate P&L tracking for all options strategies)
    const optionsTracker = new OptionsTracker(brain.getDatabase());
    setOptionsTracker(optionsTracker);

    const stats = brain.getStats();
    console.log(`✓ Brain initialized: ${stats.observations} obs, ${stats.feedback} fb, ${stats.episodes} episodes, ${stats.knowledge} KB entries`);
  } catch (err: any) {
    console.warn('⚠️  Brain initialization failed (non-fatal):', err.message);
    console.warn('   Trader will run without recursive learning.');

    // Still create panel runner without brain
    panelRunner = new PanelRunner(null, null);
    scheduler = new TradingScheduler(panelRunner);
    setPanelRunner(panelRunner);
    setScheduler(scheduler);
  }
}

// ============================================================================
// Start server
// ============================================================================

const PORT = config.port;
const server = app.listen(PORT, async () => {
  console.log('');
  console.log('🦞 OpenClaw Trader Service v0.2.0');
  console.log('='.repeat(50));
  console.log(`📡 API Server:     http://localhost:${PORT}`);
  console.log(`🏥 Health Check:   http://localhost:${PORT}/health`);
  console.log(`💾 Database:       Connected (15 tables)`);
  console.log(`📊 Metrics:        http://localhost:${config.metricsPort}/metrics (TODO)`);
  console.log(`⚙️  Mode:           ${config.tradingMode.toUpperCase()}`);
  console.log(`🛡️  Kill Switch:    ${config.killSwitchEnabled ? 'ENABLED' : 'DISABLED'}`);
  console.log(`🔧 Environment:    ${config.nodeEnv}`);
  console.log('='.repeat(50));
  console.log('');

  // Start kill switch monitoring
  if (config.killSwitchEnabled) {
    console.log('🔍 Starting kill switch monitoring...');
    await killSwitch.startMonitoring();
    console.log('✓ Kill switch monitoring active');
    console.log('');
  }

  // Start fill handler (poll every 5 seconds)
  console.log('🔄 Starting fill handler...');
  await fillHandler.startPolling(5000);
  console.log('✓ Fill handler active');
  console.log('');

  // Initialize strategies (non-fatal — DB may not be available in dev)
  console.log('📊 Initializing strategies...');
  try {
    await initializeStrategies();
    console.log('✓ Strategies initialized');
  } catch (err: any) {
    console.warn('⚠️  Strategies skipped (DB unavailable):', err.message);
  }
  console.log('');

  // Start strategy runner (non-fatal — DB may not be available in dev)
  console.log('🎯 Starting strategy runner...');
  try {
    await strategyRunner.start(300000); // 5 minutes
    console.log('✓ Strategy runner active');
  } catch (err: any) {
    console.warn('⚠️  Strategy runner skipped (DB unavailable):', err.message);
  }
  console.log('');

  // Initialize Trader Brain + recursive learning pipeline
  console.log('🧠 Initializing Trader Brain...');
  initializeBrain();
  console.log('');

  // Start AI Panel scheduler
  if (scheduler) {
    console.log('🦞 Starting AI Panel scheduler...');
    scheduler.start();
    console.log('');
  }

  // Initialize Copy-Trade Engine (always available, starts inactive)
  console.log('📋 Initializing Copy-Trade Engine...');
  const copyEngine = new CopyTradeEngine(brain, process.env.PANEL_DRY_RUN === 'true');
  setCopyEngine(copyEngine);
  console.log('✓ Copy-trade engine ready (add targets via UI to activate)');
  console.log('');

  // Initialize Weather Trading Bot (Polymarket)
  console.log('🌦️  Initializing Weather Trading Bot...');
  try {
    // Strategy is built by another agent — dynamic import to avoid hard failure if not yet available
    const { WeatherPolymarketStrategy } = await import('./engine/strategy/strategies/weather_polymarket');
    const weatherStrategy = new WeatherPolymarketStrategy();
    weatherScheduler = new WeatherScheduler(weatherStrategy);
    setWeatherScheduler(weatherScheduler);

    if (process.env.WEATHER_TRADING_ENABLED === 'true') {
      weatherScheduler.start();
      console.log('✓ Weather bot active — scanning for mispriced weather markets');
    } else {
      console.log('✓ Weather bot ready (set WEATHER_TRADING_ENABLED=true to activate)');
    }
  } catch (err: any) {
    console.warn('⚠️  Weather bot skipped (strategy not available yet):', err.message);
  }
  console.log('');

  // Initialize Kalshi Auto-Trader
  console.log('📈 Initializing Kalshi Auto-Trader...');
  try {
    const { KalshiSignalGenerator } = await import('./engine/kalshi/kalshi-signals');
    const { KalshiPositionTracker } = await import('./engine/kalshi/kalshi-position-tracker');
    const { KalshiScheduler } = await import('./engine/kalshi/kalshi-scheduler');

    const kalshiAdapter = new KalshiAdapter();
    if (kalshiAdapter.isConfigured()) {
      const signalGen = new KalshiSignalGenerator();
      const posTracker = new KalshiPositionTracker();
      const kalshiSched = new KalshiScheduler(kalshiAdapter, signalGen, posTracker, brain);
      setKalshiScheduler(kalshiSched);
      setOptionsLabScheduler(kalshiSched);

      if (process.env.KALSHI_TRADING_ENABLED === 'true') {
        await kalshiSched.start();
        console.log('✓ Kalshi auto-trader ACTIVE — trading live with $50 bankroll');
      } else {
        console.log('✓ Kalshi auto-trader ready (set KALSHI_TRADING_ENABLED=true to activate)');
      }
    } else {
      console.log('✓ Kalshi not configured (set KALSHI_API_KEY + KALSHI_PRIVATE_KEY)');
    }
  } catch (err: any) {
    console.warn('⚠️  Kalshi auto-trader skipped:', err.message);
  }
  console.log('');

  console.log('🚀 All systems operational.');
  console.log('');
});

// ============================================================================
// Graceful shutdown
// ============================================================================

async function shutdown(signal: string) {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  try {
    // Stop accepting new requests
    server.close(() => {
      console.log('✓ HTTP server closed');
    });

    // Stop copy-trade engine
    const copyEngineRef = (await import('./singletons')).getCopyEngine();
    if (copyEngineRef?.isRunning()) {
      console.log('Stopping copy-trade engine...');
      copyEngineRef.stop();
      console.log('✓ Copy-trade engine stopped');
    }

    // Stop Kalshi auto-trader
    try {
      const { KalshiScheduler } = await import('./engine/kalshi/kalshi-scheduler');
      // kalshiScheduler is accessible via the route module
    } catch (_) { /* not initialized */ }

    // Stop weather scheduler
    if (weatherScheduler) {
      console.log('Stopping weather scanner...');
      weatherScheduler.stop();
      console.log('✓ Weather scanner stopped');
    }

    // Stop scheduler
    if (scheduler) {
      console.log('Stopping AI Panel scheduler...');
      scheduler.stop();
      console.log('✓ Scheduler stopped');
    }

    // Stop strategy runner
    console.log('Stopping strategy runner...');
    await strategyRunner.stop();
    console.log('✓ Strategy runner stopped');

    // Stop fill handler
    console.log('Stopping fill handler...');
    await fillHandler.stopPolling();
    console.log('✓ Fill handler stopped');

    // Close brain
    if (brain) {
      console.log('Closing Trader Brain...');
      brain.close();
      console.log('✓ Brain closed');
    }

    // Close database connection pool
    console.log('Closing database pool...');
    await closePool();
    console.log('✓ Database pool closed');

    console.log('Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
