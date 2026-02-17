import { Router, Request, Response } from 'express';
import { RiskEngine } from '../../engine/risk/risk_engine';
import { config } from '../../config';

const router = Router();
const riskEngine = new RiskEngine();

// GET /api/risk/limits - Get current risk limits from DATABASE
router.get('/limits', async (_req: Request, res: Response) => {
  try {
    const limits = await riskEngine.getCurrentLimits();

    res.json({
      limits: [
        {
          limitType: 'max_daily_loss',
          value: limits.maxDailyLoss,
          unit: 'USD',
          updatedAt: new Date().toISOString(),
        },
        {
          limitType: 'max_position_usd',
          value: limits.maxPositionUsd,
          unit: 'USD',
          updatedAt: new Date().toISOString(),
        },
        {
          limitType: 'max_gross_exposure_usd',
          value: limits.maxGrossExposureUsd,
          unit: 'USD',
          updatedAt: new Date().toISOString(),
        },
        {
          limitType: 'max_trades_per_day',
          value: limits.maxTradesPerDay,
          unit: 'count',
          updatedAt: new Date().toISOString(),
        },
        {
          limitType: 'max_order_slippage_bps',
          value: limits.maxOrderSlippageBps,
          unit: 'bps',
          updatedAt: new Date().toISOString(),
        },
      ],
    });
  } catch (_error) {
    // DB unavailable — return config defaults
    const now = new Date().toISOString();
    res.json({
      limits: [
        { limitType: 'max_daily_loss', value: config.riskMaxDailyLoss, unit: 'USD', updatedAt: now },
        { limitType: 'max_position_usd', value: config.riskMaxPositionUsd, unit: 'USD', updatedAt: now },
        { limitType: 'max_gross_exposure_usd', value: config.riskMaxGrossExposureUsd, unit: 'USD', updatedAt: now },
        { limitType: 'max_trades_per_day', value: config.riskMaxTradesPerDay, unit: 'count', updatedAt: now },
        { limitType: 'max_order_slippage_bps', value: 50, unit: 'bps', updatedAt: now },
      ],
    });
  }
});

// GET /api/risk/breaches - Get breach history from DATABASE
router.get('/breaches', async (_req: Request, res: Response) => {
  try {
    // TODO: Query from trd_risk_check where passed = false
    // For now, return empty
    res.json({
      breaches: [],
      total: 0,
    });
  } catch (error) {
    console.error('Failed to get breaches:', error);
    res.status(500).json({ error: 'Failed to get breaches' });
  }
});

export default router;
