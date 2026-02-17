import { Router, Request, Response } from 'express';
import { PanelRunner } from '../../engine/ai-panel/panel-runner';
import { authenticateJWT } from '../middleware/auth';

const router = Router();
const panelRunner = new PanelRunner();

// Apply auth to all routes
router.use(authenticateJWT);

/**
 * POST /api/ai-panel/run
 * Run the AI analyst panel
 */
router.post('/run', async (req: Request, res: Response) => {
  try {
    const { dryRun = false, watchlist } = req.body;

    console.log(`[AI Panel API] Starting ${dryRun ? 'DRY RUN' : 'LIVE'} panel run`);

    const result = await panelRunner.run({
      dryRun,
      watchlist,
    });

    if (result.error) {
      return res.status(500).json({
        error: 'Panel run failed',
        message: result.error,
        runId: result.runId,
      });
    }

    res.json({
      success: true,
      runId: result.runId,
      timestamp: result.timestamp,
      summary: {
        marketCommentary: result.report.marketCommentary,
        picksCount: result.report.picks?.length || 0,
        tradesCount: result.trades.length,
        executed: result.executed,
        llmCost: result.report.costEstimateUSD,
      },
      picks: result.report.picks,
      trades: result.trades,
      executionResults: result.executionResults,
    });
  } catch (error: any) {
    console.error('[AI Panel API] Error:', error);
    res.status(500).json({
      error: 'Panel run failed',
      message: error.message,
    });
  }
});

/**
 * GET /api/ai-panel/status
 * Get panel configuration and status
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const enabled = process.env.PANEL_ENABLED === 'true';
    const hasGrokKey = !!process.env.GROK_API_KEY;

    res.json({
      enabled,
      configured: hasGrokKey,
      model: process.env.PANEL_MODEL || 'grok-4-1-fast-non-reasoning',
      schedule: process.env.PANEL_CRON || '45 9 * * 1-5',
      provider: 'grok',
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to get status',
      message: error.message,
    });
  }
});

export default router;
