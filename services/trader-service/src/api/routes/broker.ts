import { Router, Request, Response } from 'express';
import { AlpacaAdapter } from '../../engine/execution/broker/alpaca';
import { config } from '../../config';

const router = Router();

// GET /api/broker/test - Test Alpaca connection
router.get('/test', async (_req: Request, res: Response) => {
  try {
    if (!config.brokerApiKey || !config.brokerApiSecret) {
      return res.status(400).json({
        error: 'Broker credentials not configured',
        message: 'BROKER_API_KEY and BROKER_API_SECRET must be set in .env.trader',
      });
    }

    const adapter = new AlpacaAdapter({
      apiKey: config.brokerApiKey,
      apiSecret: config.brokerApiSecret,
      baseUrl: config.brokerBaseUrl,
    });

    console.log('→ Testing Alpaca connection...');
    await adapter.connect();

    res.json({
      status: 'connected',
      broker: 'Alpaca',
      mode: config.brokerBaseUrl.includes('paper') ? 'paper' : 'live',
      baseUrl: config.brokerBaseUrl,
      message: '✓ Successfully connected to Alpaca',
    });
  } catch (error: any) {
    console.error('✗ Failed to connect to Alpaca:', error);
    res.status(500).json({
      error: 'Connection failed',
      message: error.message,
      details: error.response?.data || error.toString(),
    });
  }
});

// GET /api/broker/account - Get account info
router.get('/account', async (_req: Request, res: Response) => {
  try {
    if (!config.brokerApiKey || !config.brokerApiSecret) {
      return res.status(400).json({
        error: 'Broker credentials not configured',
      });
    }

    const adapter = new AlpacaAdapter({
      apiKey: config.brokerApiKey,
      apiSecret: config.brokerApiSecret,
      baseUrl: config.brokerBaseUrl,
    });

    await adapter.connect();
    const account = await adapter.getAccount();

    res.json({
      account,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Failed to get account:', error);
    res.status(500).json({
      error: 'Failed to get account info',
      message: error.message,
    });
  }
});

// GET /api/broker/positions - Get current positions
router.get('/positions', async (_req: Request, res: Response) => {
  try {
    if (!config.brokerApiKey || !config.brokerApiSecret) {
      return res.status(400).json({
        error: 'Broker credentials not configured',
      });
    }

    const adapter = new AlpacaAdapter({
      apiKey: config.brokerApiKey,
      apiSecret: config.brokerApiSecret,
      baseUrl: config.brokerBaseUrl,
    });

    await adapter.connect();
    const positions = await adapter.getPositions();

    res.json({
      positions,
      count: positions.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Failed to get positions:', error);
    res.status(500).json({
      error: 'Failed to get positions',
      message: error.message,
    });
  }
});

// GET /api/broker/quote/:symbol - Get quote for symbol
router.get('/quote/:symbol', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    if (!config.brokerApiKey || !config.brokerApiSecret) {
      return res.status(400).json({
        error: 'Broker credentials not configured',
      });
    }

    const adapter = new AlpacaAdapter({
      apiKey: config.brokerApiKey,
      apiSecret: config.brokerApiSecret,
      baseUrl: config.brokerBaseUrl,
    });

    await adapter.connect();
    const quote = await adapter.getQuote(symbol.toUpperCase());

    res.json({
      symbol: symbol.toUpperCase(),
      quote,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error(`Failed to get quote for ${req.params.symbol}:`, error);
    res.status(500).json({
      error: 'Failed to get quote',
      message: error.message,
    });
  }
});

export default router;
