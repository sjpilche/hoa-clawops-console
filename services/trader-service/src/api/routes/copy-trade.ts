import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../middleware/auth';
import { getCopyEngine } from '../../singletons';
import { CopyTradeEngine } from '../../engine/copy-trade/copy-trade-engine';

const router = Router();
router.use(authenticateJWT);

// ─── Status ───────────────────────────────────────────────────────────────────

router.get('/status', (_req: Request, res: Response) => {
  const engine = getCopyEngine();
  if (!engine) return res.json({ available: false, message: 'Copy engine not initialized' });
  res.json({ available: true, ...engine.getStatus() });
});

// ─── Leaderboard (find wallets to copy) ──────────────────────────────────────

router.get('/leaderboard', async (_req: Request, res: Response) => {
  try {
    const profiles = await CopyTradeEngine.fetchLeaderboard(30);
    res.json({ profiles, total: profiles.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Wallet Preview (see recent trades before adding) ────────────────────────

router.get('/preview/:address', async (req: Request, res: Response) => {
  try {
    const activity = await CopyTradeEngine.fetchWalletActivity(req.params.address, 20);
    res.json({ activity, address: req.params.address, total: activity.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Add Target ───────────────────────────────────────────────────────────────

router.post('/targets', (req: Request, res: Response) => {
  const engine = getCopyEngine();
  if (!engine) return res.status(503).json({ error: 'Copy engine not initialized' });

  const { address, label, scalePct, maxUsdPerTrade, active } = req.body;

  if (!address || !address.startsWith('0x')) {
    return res.status(400).json({ error: 'Invalid wallet address (must start with 0x)' });
  }

  engine.addTarget({
    address: address.toLowerCase(),
    label: label || `wallet_${address.slice(2, 8)}`,
    scalePct: Math.min(Math.max(parseFloat(scalePct) || 10, 1), 100),
    maxUsdPerTrade: Math.min(parseFloat(maxUsdPerTrade) || 50, 500),
    active: active !== false,
  });

  res.json({ added: true, targets: engine.getTargets() });
});

// ─── Update Target ────────────────────────────────────────────────────────────

router.put('/targets/:address', (req: Request, res: Response) => {
  const engine = getCopyEngine();
  if (!engine) return res.status(503).json({ error: 'Copy engine not initialized' });

  const { label, scalePct, maxUsdPerTrade, active } = req.body;
  const address = req.params.address.toLowerCase();

  const existing = engine.getTargets().find(t => t.address.toLowerCase() === address);
  if (!existing) return res.status(404).json({ error: 'Target not found' });

  engine.addTarget({
    address,
    label: label ?? existing.label,
    scalePct: scalePct !== undefined ? Math.min(Math.max(parseFloat(scalePct), 1), 100) : existing.scalePct,
    maxUsdPerTrade: maxUsdPerTrade !== undefined ? Math.min(parseFloat(maxUsdPerTrade), 500) : existing.maxUsdPerTrade,
    active: active !== undefined ? active : existing.active,
  });

  res.json({ updated: true, targets: engine.getTargets() });
});

// ─── Remove Target ────────────────────────────────────────────────────────────

router.delete('/targets/:address', (req: Request, res: Response) => {
  const engine = getCopyEngine();
  if (!engine) return res.status(503).json({ error: 'Copy engine not initialized' });

  const removed = engine.removeTarget(req.params.address);
  res.json({ removed, targets: engine.getTargets() });
});

// ─── Recent Actions ───────────────────────────────────────────────────────────

router.get('/actions', (req: Request, res: Response) => {
  const engine = getCopyEngine();
  if (!engine) return res.json({ actions: [] });

  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const actions = engine.getActions(limit);
  res.json({ actions, total: actions.length });
});

// ─── Start / Stop ─────────────────────────────────────────────────────────────

router.post('/start', (_req: Request, res: Response) => {
  const engine = getCopyEngine();
  if (!engine) return res.status(503).json({ error: 'Copy engine not initialized' });
  engine.start();
  res.json({ started: true, status: engine.getStatus() });
});

router.post('/stop', (_req: Request, res: Response) => {
  const engine = getCopyEngine();
  if (!engine) return res.status(503).json({ error: 'Copy engine not initialized' });
  engine.stop();
  res.json({ stopped: true });
});

export default router;
