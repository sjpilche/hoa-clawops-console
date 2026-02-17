import { Router, Request, Response } from 'express';
import { PositionManager } from '../../engine/portfolio/position_manager';

const router = Router();
const positionManager = new PositionManager();

// GET /api/positions - Get current positions
router.get('/', async (_req: Request, res: Response) => {
  try {
    const positions = await positionManager.getCurrentPositions();
    const exposure = await positionManager.getExposure();
    const totalUnrealizedPnl = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
    res.json({
      positions: positions.map((p) => ({
        symbol: p.symbol, qty: p.qty, side: p.side,
        avgPrice: p.avgPrice, marketPrice: p.marketPrice,
        marketValue: p.marketValue, costBasis: p.costBasis,
        unrealizedPnl: p.unrealizedPnl, unrealizedPnlPct: p.unrealizedPnlPct,
        lastUpdated: p.lastUpdated,
      })),
      count: positions.length, exposure, totalUnrealizedPnl,
      timestamp: new Date().toISOString(),
    });
  } catch (_error: any) {
    // DB not available — return empty positions
    res.json({
      positions: [], count: 0,
      exposure: { grossExposure: 0, netExposure: 0, longExposure: 0, shortExposure: 0 },
      totalUnrealizedPnl: 0, timestamp: new Date().toISOString(),
    });
  }
});

// GET /api/positions/pnl - Today's P&L summary
router.get('/pnl', async (_req: Request, res: Response) => {
  try {
    const positions = await positionManager.getCurrentPositions();
    const unrealized = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
    res.json({
      today: { net: unrealized, realized: 0, unrealized },
      timestamp: new Date().toISOString(),
    });
  } catch (_error: any) {
    res.json({
      today: { net: 0, realized: 0, unrealized: 0 },
      timestamp: new Date().toISOString(),
    });
  }
});

// GET /api/positions/:symbol - Get position for specific symbol
router.get('/:symbol', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const position = await positionManager.getPosition(symbol.toUpperCase());

    if (!position) {
      return res.status(404).json({
        error: 'Position not found',
        symbol: symbol.toUpperCase(),
      });
    }

    res.json({
      position,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Failed to get position:', error);
    res.status(500).json({
      error: 'Failed to get position',
      message: error.message,
    });
  }
});

// GET /api/positions/:symbol/history - Get position history
router.get('/:symbol/history', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;

    const history = await positionManager.getPositionHistory(symbol.toUpperCase(), limit);

    res.json({
      symbol: symbol.toUpperCase(),
      history,
      count: history.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Failed to get position history:', error);
    res.status(500).json({
      error: 'Failed to get position history',
      message: error.message,
    });
  }
});

// GET /api/positions/portfolio/value - Get total portfolio value
router.get('/portfolio/value', async (_req: Request, res: Response) => {
  try {
    const portfolio = await positionManager.getPortfolioValue();

    res.json({
      portfolio,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Failed to get portfolio value:', error);
    res.status(500).json({
      error: 'Failed to get portfolio value',
      message: error.message,
    });
  }
});

// POST /api/positions/reconcile - Reconcile positions vs broker
router.post('/reconcile', async (_req: Request, res: Response) => {
  try {
    const reconciliation = await positionManager.reconcilePositions();

    if (!reconciliation.matched) {
      console.log('⚠️  Position reconciliation FAILED - mismatches detected');
    }

    res.json({
      reconciliation,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Failed to reconcile positions:', error);
    res.status(500).json({
      error: 'Failed to reconcile positions',
      message: error.message,
    });
  }
});

// POST /api/positions/sync - Sync positions from broker
router.post('/sync', async (_req: Request, res: Response) => {
  try {
    await positionManager.syncFromBroker();

    res.json({
      success: true,
      message: 'Positions synced from broker',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Failed to sync positions:', error);
    res.status(500).json({
      error: 'Failed to sync positions',
      message: error.message,
    });
  }
});

export default router;
