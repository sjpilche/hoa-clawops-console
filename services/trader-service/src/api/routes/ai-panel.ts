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

    // Aggregate across all analyst reports
    const allPicks = result.reports.flatMap(r => r.picks || []);
    const commentary = result.reports.map(r => `[${r.analystName}] ${r.marketCommentary}`).join('\n');

    res.json({
      success: true,
      runId: result.runId,
      timestamp: result.timestamp,
      summary: {
        analystCount: result.reports.length,
        marketCommentary: commentary,
        picksCount: allPicks.length,
        tradesCount: result.trades.length,
        executed: result.executed,
        totalLLMCost: result.totalLLMCost,
      },
      reports: result.reports.map(r => ({
        analyst: r.analystName,
        provider: r.provider,
        picks: r.picks.length,
        cost: r.costEstimateUSD,
        latencyMs: r.latencyMs,
      })),
      aggregatedPicks: result.aggregatedPicks,
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
    const hasGrokKey = !!process.env.GROK_API_KEY;
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
    const hasClaudeKey = !!process.env.ANTHROPIC_API_KEY;

    res.json({
      version: '0.2.0',
      analysts: [
        { name: 'Value Hunter', tier: 0, provider: 'ollama', status: 'active' },
        { name: 'Momentum Scanner', tier: 1, provider: 'openai', status: hasOpenAIKey ? 'active' : 'no_key' },
        { name: 'Special Situations', tier: 2, provider: 'grok', status: hasGrokKey ? 'active' : 'no_key' },
        { name: 'Risk Sentinel', tier: 0, provider: 'ollama', status: 'active' },
      ],
      schedule: `${process.env.PANEL_INTERVAL_MS || 180000}ms interval`,
      dryRun: process.env.PANEL_DRY_RUN === 'true',
      keys: { grok: hasGrokKey, openai: hasOpenAIKey, claude: hasClaudeKey },
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to get status',
      message: error.message,
    });
  }
});

export default router;
