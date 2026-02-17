import { Router, Request, Response } from 'express';
import { KillSwitch, KillSwitchMode } from '../../engine/risk/kill_switch';

const router = Router();
const killSwitch = new KillSwitch();

// POST /api/kill-switch/trigger - Trigger kill switch manually
router.post('/trigger', async (req: Request, res: Response) => {
  const { mode, reason } = req.body;

  if (!mode || !['soft', 'hard'].includes(mode)) {
    return res.status(400).json({ error: 'Invalid mode. Must be "soft" or "hard"' });
  }

  if (!reason) {
    return res.status(400).json({ error: 'Reason is required' });
  }

  try {
    const actor = req.headers['x-user-id'] as string || 'unknown';
    await killSwitch.triggerManual(mode as KillSwitchMode, reason, actor);

    const status = await killSwitch.getStatus();

    res.json({
      message: `Kill switch triggered (${mode} mode)`,
      status,
      mode,
      reason,
      actor,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to trigger kill switch:', error);
    res.status(500).json({ error: 'Failed to trigger kill switch' });
  }
});

// GET /api/kill-switch/events - Get kill switch event log from DATABASE
router.get('/events', async (_req: Request, res: Response) => {
  try {
    const events = await killSwitch.getEvents(100);
    res.json({
      events: events.map((e) => ({
        eventId: e.eventId, trigger: e.trigger, mode: e.mode,
        reason: e.reason, actor: e.actor, timestamp: e.timestamp.toISOString(),
      })),
      total: events.length,
    });
  } catch (_error) {
    // DB unavailable — return empty event log
    res.json({ events: [], total: 0 });
  }
});

// GET /api/kill-switch/status - Get current kill switch status from DATABASE
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const status = await killSwitch.getStatus();
    res.json({ status, lastChecked: new Date().toISOString() });
  } catch (_error) {
    // DB unavailable — return armed (safe default)
    res.json({ status: 'armed', lastChecked: new Date().toISOString() });
  }
});

// POST /api/kill-switch/reset - Reset kill switch (re-arm)
router.post('/reset', async (req: Request, res: Response) => {
  try {
    const actor = req.headers['x-user-id'] as string || 'unknown';
    await killSwitch.reset(actor);

    const status = await killSwitch.getStatus();

    res.json({
      message: 'Kill switch reset (re-armed)',
      status,
      actor,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to reset kill switch:', error);
    res.status(500).json({ error: 'Failed to reset kill switch' });
  }
});

export default router;
