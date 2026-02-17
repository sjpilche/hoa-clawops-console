import { Router, Request, Response } from 'express';
import { StrategyRunner } from '../../engine/strategy/strategy_runner';
import { MovingAverageCrossoverStrategy } from '../../engine/strategy/strategies/moving_average_crossover';
import { authenticateJWT, requireRole } from '../middleware/auth';
import { validate, strategyParamsSchema } from '../middleware/validate';

const router = Router();

// Global strategy runner (will be initialized in server.ts)
let strategyRunner: StrategyRunner;

export function initializeStrategyRunner(runner: StrategyRunner) {
  strategyRunner = runner;
}

// GET /api/strategies - List all strategies
router.get('/',
  authenticateJWT,
  async (_req: Request, res: Response) => {
  try {
    const registry = strategyRunner.getRegistry();
    const configs = await registry.getStrategyConfigs();

    res.json({
      strategies: configs.map((c) => ({
        id: c.strategyId,
        name: c.name,
        version: c.version,
        enabled: c.enabled,
        params: c.params,
        symbols: c.symbols,
      })),
      count: configs.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Failed to get strategies:', error);
    res.status(500).json({
      error: 'Failed to get strategies',
      message: error.message,
    });
  }
});

// GET /api/strategies/:id - Get strategy details
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const registry = strategyRunner.getRegistry();
    const strategy = registry.getStrategy(id);

    if (!strategy) {
      return res.status(404).json({
        error: 'Strategy not found',
        strategyId: id,
      });
    }

    const config = strategy.getConfig();

    res.json({
      strategy: {
        id: strategy.getId(),
        name: strategy.getName(),
        version: strategy.getVersion(),
        enabled: config.enabled,
        params: config.params,
        symbols: config.symbols,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Failed to get strategy:', error);
    res.status(500).json({
      error: 'Failed to get strategy',
      message: error.message,
    });
  }
});

// POST /api/strategies/:id/enable - Enable a strategy (PROTECTED)
router.post('/:id/enable',
  authenticateJWT,
  requireRole('trd_admin'),
  async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const registry = strategyRunner.getRegistry();

    await registry.enableStrategy(id);

    res.json({
      success: true,
      message: `Strategy ${id} enabled`,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Failed to enable strategy:', error);
    res.status(500).json({
      error: 'Failed to enable strategy',
      message: error.message,
    });
  }
});

// POST /api/strategies/:id/disable - Disable a strategy (PROTECTED)
router.post('/:id/disable',
  authenticateJWT,
  requireRole('trd_admin'),
  async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const registry = strategyRunner.getRegistry();

    await registry.disableStrategy(id);

    res.json({
      success: true,
      message: `Strategy ${id} disabled`,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Failed to disable strategy:', error);
    res.status(500).json({
      error: 'Failed to disable strategy',
      message: error.message,
    });
  }
});

// PUT /api/strategies/:id/params - Update strategy parameters (PROTECTED)
router.put('/:id/params',
  authenticateJWT,
  requireRole('trd_admin'),
  validate(strategyParamsSchema),
  async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const params = req.body; // Already validated by middleware

    const registry = strategyRunner.getRegistry();
    await registry.updateParams(id, params);

    res.json({
      success: true,
      message: `Strategy ${id} parameters updated`,
      params,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Failed to update strategy params:', error);
    res.status(500).json({
      error: 'Failed to update strategy params',
      message: error.message,
    });
  }
});

// POST /api/strategies/run - Manually trigger strategy run
router.post('/run', async (_req: Request, res: Response) => {
  try {
    console.log('\n🎯 Manual strategy run triggered');

    // Run strategies immediately
    await strategyRunner.runStrategies();

    res.json({
      success: true,
      message: 'Strategies executed',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Failed to run strategies:', error);
    res.status(500).json({
      error: 'Failed to run strategies',
      message: error.message,
    });
  }
});

export default router;
