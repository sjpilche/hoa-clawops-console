import { Router, Request, Response } from 'express';
import { config } from '../../config';

const router = Router();

interface RiskLimit {
  limitType: string;
  value: number;
  unit: string;
  updatedAt: string;
}

// GET /api/risk/limits - Get current risk limits
router.get('/limits', (_req: Request, res: Response) => {
  const limits: RiskLimit[] = [
    {
      limitType: 'max_daily_loss',
      value: config.riskMaxDailyLoss,
      unit: 'USD',
      updatedAt: new Date().toISOString(),
    },
    {
      limitType: 'max_position_usd',
      value: config.riskMaxPositionUsd,
      unit: 'USD',
      updatedAt: new Date().toISOString(),
    },
    {
      limitType: 'max_gross_exposure_usd',
      value: config.riskMaxGrossExposureUsd,
      unit: 'USD',
      updatedAt: new Date().toISOString(),
    },
    {
      limitType: 'max_trades_per_day',
      value: config.riskMaxTradesPerDay,
      unit: 'count',
      updatedAt: new Date().toISOString(),
    },
  ];

  res.json({ limits });
});

// GET /api/risk/breaches - Get breach history
router.get('/breaches', (_req: Request, res: Response) => {
  // Mock breaches for testing
  res.json({
    breaches: [],
    total: 0,
  });
});

export default router;
