import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../middleware/auth';
import type { WeatherScheduler } from '../../engine/weather/scheduler';
import { KalshiAdapter } from '../../engine/execution/broker/kalshi';

const router = Router();
router.use(authenticateJWT);

// Scheduler reference — set at startup via setWeatherScheduler()
let weatherScheduler: WeatherScheduler | null = null;

// Kalshi adapter singleton for monitoring routes
let kalshiAdapter: KalshiAdapter | null = null;

function getKalshiAdapter(): KalshiAdapter | null {
  if (kalshiAdapter) return kalshiAdapter;
  try {
    const adapter = new KalshiAdapter();
    if (adapter.isConfigured()) {
      kalshiAdapter = adapter;
      return kalshiAdapter;
    }
  } catch (_) { /* not configured */ }
  return null;
}

export function setWeatherScheduler(scheduler: WeatherScheduler): void {
  weatherScheduler = scheduler;
}

// ─── Bot Status ──────────────────────────────────────────────────────────────

router.get('/status', (_req: Request, res: Response) => {
  if (!weatherScheduler) {
    return res.json({
      enabled: false,
      message: 'Weather trading not initialized. Set WEATHER_TRADING_ENABLED=true in env.trader.',
    });
  }

  const status = weatherScheduler.getStatus();
  res.json({
    enabled: true,
    ...status,
  });
});

// ─── Current NOAA Forecasts ──────────────────────────────────────────────────

router.get('/forecasts', async (_req: Request, res: Response) => {
  if (!weatherScheduler) {
    return res.status(503).json({ error: 'Weather trading not initialized' });
  }

  try {
    const strategy = weatherScheduler.getStrategy();
    const forecasts = await (strategy as any).getForecasts?.();
    res.json({ forecasts: forecasts || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Current Mispriced Markets (Opportunities) ───────────────────────────────

router.get('/opportunities', async (_req: Request, res: Response) => {
  if (!weatherScheduler) {
    return res.status(503).json({ error: 'Weather trading not initialized' });
  }

  try {
    const strategy = weatherScheduler.getStrategy();
    const signals = await strategy.generateSignals();
    res.json({
      opportunities: signals,
      count: signals.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Open Positions ──────────────────────────────────────────────────────────

router.get('/positions', (_req: Request, res: Response) => {
  if (!weatherScheduler) {
    return res.status(503).json({ error: 'Weather trading not initialized' });
  }

  const tracker = weatherScheduler.getPositionTracker();
  const positions = tracker.getPositions();
  const performance = tracker.getPerformance();

  res.json({
    positions,
    count: positions.length,
    totalUnrealizedPnl: positions.reduce((sum, p) => sum + p.unrealizedPnl, 0),
    performance,
  });
});

// ─── Performance Stats ───────────────────────────────────────────────────────

router.get('/performance', (_req: Request, res: Response) => {
  if (!weatherScheduler) {
    return res.status(503).json({ error: 'Weather trading not initialized' });
  }

  const tracker = weatherScheduler.getPositionTracker();
  const performance = tracker.getPerformance();
  const status = weatherScheduler.getStatus();

  res.json({
    ...performance,
    scanCount: status.scanCount,
    lastScan: status.lastScan,
    running: status.running,
  });
});

// ─── Update Strategy Config ──────────────────────────────────────────────────

router.post('/config', (req: Request, res: Response) => {
  try {
    const allowed = [
      'WEATHER_ENTRY_THRESHOLD',
      'WEATHER_EXIT_THRESHOLD',
      'WEATHER_MAX_POSITION_USD',
      'WEATHER_MAX_EXPOSURE_USD',
      'WEATHER_SCAN_INTERVAL_MS',
      'WEATHER_CITIES',
      'WEATHER_STOP_LOSS',
      'WEATHER_MAX_TRADES_PER_SCAN',
      'WEATHER_MIN_LIQUIDITY',
      'WEATHER_MIN_EDGE',
    ];

    const updates: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.body)) {
      if (allowed.includes(key) && value !== undefined) {
        process.env[key] = String(value);
        updates[key] = String(value);
      }
    }

    res.json({
      message: 'Weather config updated',
      updates,
      note: 'Changes take effect on next scan cycle. Restart scheduler for interval changes.',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Start Scanner ───────────────────────────────────────────────────────────

router.post('/start', (_req: Request, res: Response) => {
  if (!weatherScheduler) {
    return res.status(503).json({ error: 'Weather trading not initialized. Set WEATHER_TRADING_ENABLED=true and restart.' });
  }

  weatherScheduler.start();
  res.json({
    message: 'Weather scanner started',
    status: weatherScheduler.getStatus(),
  });
});

// ─── Stop Scanner ────────────────────────────────────────────────────────────

router.post('/stop', (_req: Request, res: Response) => {
  if (!weatherScheduler) {
    return res.status(503).json({ error: 'Weather trading not initialized' });
  }

  weatherScheduler.stop();
  res.json({
    message: 'Weather scanner stopped',
    status: weatherScheduler.getStatus(),
  });
});

// ─── Kalshi Weather Markets ─────────────────────────────────────────────────

router.get('/kalshi/status', (_req: Request, res: Response) => {
  const adapter = getKalshiAdapter();
  if (!adapter) {
    return res.json({
      configured: false,
      message: 'Kalshi not configured. Set KALSHI_API_KEY and KALSHI_PRIVATE_KEY in env.trader.',
    });
  }
  res.json(adapter.getStatus());
});

router.get('/kalshi/markets', async (_req: Request, res: Response) => {
  const adapter = getKalshiAdapter();
  if (!adapter) {
    return res.status(503).json({ error: 'Kalshi not configured' });
  }

  try {
    // Connect if needed (lazy connect for monitoring routes)
    if (!adapter.isConnected()) {
      await adapter.connect();
    }

    const markets = await adapter.searchWeatherMarkets();
    res.json({
      markets: markets.map((m) => ({
        ticker: m.ticker,
        event_ticker: m.event_ticker,
        title: m.title,
        status: m.status,
        yes_bid: m.yes_bid,
        yes_ask: m.yes_ask,
        no_bid: m.no_bid,
        no_ask: m.no_ask,
        last_price: m.last_price,
        volume: m.volume,
        open_interest: m.open_interest,
        close_time: m.close_time,
        expiration_time: m.expiration_time,
        // Convenience: price as probability (0-1)
        yes_probability: m.yes_ask ? m.yes_ask / 100 : null,
      })),
      count: markets.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/kalshi/positions', async (_req: Request, res: Response) => {
  const adapter = getKalshiAdapter();
  if (!adapter) {
    return res.status(503).json({ error: 'Kalshi not configured' });
  }

  try {
    if (!adapter.isConnected()) {
      await adapter.connect();
    }

    const positions = await adapter.getPositions();
    res.json({
      positions,
      count: positions.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/kalshi/balance', async (_req: Request, res: Response) => {
  const adapter = getKalshiAdapter();
  if (!adapter) {
    return res.status(503).json({ error: 'Kalshi not configured' });
  }

  try {
    if (!adapter.isConnected()) {
      await adapter.connect();
    }

    const balance = await adapter.getBalance();
    res.json({
      balance_cents: balance.balance,
      balance_dollars: (balance.balance / 100).toFixed(2),
      portfolio_value_cents: balance.portfolio_value,
      portfolio_value_dollars: (balance.portfolio_value / 100).toFixed(2),
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
