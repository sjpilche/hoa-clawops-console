import { Router, Request, Response } from 'express';
import { config } from '../../config';

const router = Router();

interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  mode: 'paper' | 'live';
  killSwitch: 'armed' | 'triggered';
  timestamp: string;
  version: string;
  uptime: number;
}

router.get('/', (_req: Request, res: Response) => {
  const health: HealthResponse = {
    status: 'healthy',
    mode: config.tradingMode,
    killSwitch: 'armed', // TODO: Read from actual kill switch state
    timestamp: new Date().toISOString(),
    version: '0.1.0',
    uptime: process.uptime(),
  };

  res.status(200).json(health);
});

export default router;
