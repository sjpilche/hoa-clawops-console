import { Router, Request, Response } from 'express';

const router = Router();

interface KillSwitchEvent {
  eventId: string;
  trigger: 'manual' | 'breach' | 'heartbeat_miss';
  reason: string;
  actor: string;
  timestamp: string;
}

let killSwitchStatus: 'armed' | 'triggered' = 'armed';
const killSwitchEvents: KillSwitchEvent[] = [];

// POST /api/kill-switch/trigger - Trigger kill switch manually
router.post('/trigger', (req: Request, res: Response) => {
  const { mode, reason } = req.body;

  if (!mode || !['soft', 'hard'].includes(mode)) {
    return res.status(400).json({ error: 'Invalid mode. Must be "soft" or "hard"' });
  }

  if (!reason) {
    return res.status(400).json({ error: 'Reason is required' });
  }

  killSwitchStatus = 'triggered';

  const event: KillSwitchEvent = {
    eventId: `ks-${Date.now()}`,
    trigger: 'manual',
    reason,
    actor: req.headers['x-user-id'] as string || 'unknown',
    timestamp: new Date().toISOString(),
  };

  killSwitchEvents.unshift(event);

  res.json({
    message: `Kill switch triggered (${mode} mode)`,
    status: killSwitchStatus,
    event,
  });
});

// GET /api/kill-switch/events - Get kill switch event log
router.get('/events', (_req: Request, res: Response) => {
  res.json({
    events: killSwitchEvents,
    total: killSwitchEvents.length,
  });
});

// GET /api/kill-switch/status - Get current kill switch status
router.get('/status', (_req: Request, res: Response) => {
  res.json({
    status: killSwitchStatus,
    lastChecked: new Date().toISOString(),
  });
});

// POST /api/kill-switch/reset - Reset kill switch (re-arm)
router.post('/reset', (_req: Request, res: Response) => {
  killSwitchStatus = 'armed';

  res.json({
    message: 'Kill switch reset (re-armed)',
    status: killSwitchStatus,
  });
});

export default router;
