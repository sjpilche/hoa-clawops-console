import { Router, Request, Response } from 'express';

const router = Router();

interface Strategy {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  lastSignalAt: string | null;
}

// Mock strategies for testing console integration
const mockStrategies: Strategy[] = [
  {
    id: 'ma-crossover',
    name: 'Moving Average Crossover',
    version: '1.0.0',
    enabled: false,
    lastSignalAt: null,
  },
  {
    id: 'mean-reversion',
    name: 'Mean Reversion',
    version: '1.0.0',
    enabled: false,
    lastSignalAt: null,
  },
];

// GET /api/strategies - List all strategies
router.get('/', (_req: Request, res: Response) => {
  res.json({
    strategies: mockStrategies,
    total: mockStrategies.length,
  });
});

// POST /api/strategies/:id/enable - Enable strategy
router.post('/:id/enable', (req: Request, res: Response) => {
  const { id } = req.params;
  const strategy = mockStrategies.find((s) => s.id === id);

  if (!strategy) {
    return res.status(404).json({ error: 'Strategy not found' });
  }

  strategy.enabled = true;

  res.json({
    message: `Strategy ${strategy.name} enabled`,
    strategy,
  });
});

// POST /api/strategies/:id/disable - Disable strategy
router.post('/:id/disable', (req: Request, res: Response) => {
  const { id } = req.params;
  const strategy = mockStrategies.find((s) => s.id === id);

  if (!strategy) {
    return res.status(404).json({ error: 'Strategy not found' });
  }

  strategy.enabled = false;

  res.json({
    message: `Strategy ${strategy.name} disabled`,
    strategy,
  });
});

export default router;
