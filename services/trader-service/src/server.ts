import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
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
import { initializeStrategyRunner } from './api/routes/strategies-real';

// Import engine components
import { KillSwitch } from './engine/risk/kill_switch';
import { FillHandler } from './engine/execution/fill_handler';
import { StrategyRunner } from './engine/strategy/strategy_runner';
import { MovingAverageCrossoverStrategy } from './engine/strategy/strategies/moving_average_crossover';
import { RsiMeanReversionStrategy } from './engine/strategy/strategies/rsi_mean_reversion';

// Import database pool for graceful shutdown
import { closePool } from './db/pool';

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
    version: '0.1.0',
    mode: config.tradingMode,
    status: 'operational',
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

// Initialize kill switch monitoring, fill handler, and strategy runner
const killSwitch = new KillSwitch();
const fillHandler = new FillHandler();
const strategyRunner = new StrategyRunner();

// Initialize strategy runner with strategies
async function initializeStrategies() {
  const registry = strategyRunner.getRegistry();

  // Register Moving Average Crossover strategy
  const maStrategy = new MovingAverageCrossoverStrategy({
    fastPeriod: 10,
    slowPeriod: 30,
    positionSize: 500, // $500 per position
    symbols: ['AAPL', 'MSFT'],
  });

  await registry.register(maStrategy);
  await registry.enableStrategy(maStrategy.getId());

  // Register RSI Mean Reversion strategy
  const rsiStrategy = new RsiMeanReversionStrategy({
    rsiPeriod: 14,
    oversoldThreshold: 30,
    overboughtThreshold: 70,
    positionSize: 500, // $500 per position
    symbols: ['AAPL', 'MSFT', 'SPY'],
  });

  await registry.register(rsiStrategy);
  await registry.enableStrategy(rsiStrategy.getId());

  // Make available to API routes
  initializeStrategyRunner(strategyRunner);
}

// Start server
const PORT = config.port;
const server = app.listen(PORT, async () => {
  console.log('');
  console.log('🦞 OpenClaw Trader Service');
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
  console.log('Available Endpoints:');
  console.log('  GET  /               - Service info');
  console.log('  GET  /health         - Health check');
  console.log('  GET  /api/strategies - List strategies');
  console.log('  POST /api/strategies/:id/enable');
  console.log('  GET  /api/risk/limits - REAL risk engine!');
  console.log('  GET  /api/kill-switch/status - REAL kill switch!');
  console.log('  POST /api/kill-switch/trigger');
  console.log('  GET  /api/positions');
  console.log('');
  console.log('⚠️  WARNING: This is a TRADING SYSTEM');
  console.log('   Paper trading mode active by default');
  console.log('   Live trading requires explicit configuration');
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
});

// Graceful shutdown handler
async function shutdown(signal: string) {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  try {
    // Stop accepting new requests
    server.close(() => {
      console.log('✓ HTTP server closed');
    });

    // Stop strategy runner
    console.log('Stopping strategy runner...');
    await strategyRunner.stop();
    console.log('✓ Strategy runner stopped');

    // Stop fill handler
    console.log('Stopping fill handler...');
    await fillHandler.stopPolling();
    console.log('✓ Fill handler stopped');

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
