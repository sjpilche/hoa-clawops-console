import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../middleware/auth';
import { getBrain, getScheduler, getOutcomeTracker, getPanelRunner } from '../../singletons';

const router = Router();
router.use(authenticateJWT);

// ─── Brain Stats ──────────────────────────────────────────────────────────────

router.get('/stats', (_req: Request, res: Response) => {
  try {
    const brain = getBrain();
    if (!brain) return res.json({ available: false, message: 'Brain not initialized' });

    const stats = brain.getStats();
    res.json({ available: true, ...stats });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Recent Episodes ──────────────────────────────────────────────────────────

router.get('/episodes', (req: Request, res: Response) => {
  try {
    const brain = getBrain();
    if (!brain) return res.json({ episodes: [] });

    const limit = parseInt(req.query.limit as string) || 50;
    const symbol = req.query.symbol as string || undefined;
    const analystId = req.query.analyst as string || undefined;

    const episodes = brain.getSimilarEpisodes({
      symbol,
      analystId,
      limit: Math.min(limit, 200),
    });

    res.json({ episodes, total: episodes.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Recent Feedback ──────────────────────────────────────────────────────────

router.get('/feedback', (req: Request, res: Response) => {
  try {
    const brain = getBrain();
    if (!brain) return res.json({ feedback: [] });

    const limit = parseInt(req.query.limit as string) || 50;
    // Direct SQLite query for recent feedback
    const db = (brain as any).db;
    const rows = db.prepare(`
      SELECT * FROM brain_feedback
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);

    res.json({ feedback: rows, total: rows.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Knowledge Base ───────────────────────────────────────────────────────────

router.get('/knowledge', (req: Request, res: Response) => {
  try {
    const brain = getBrain();
    if (!brain) return res.json({ entries: [] });

    const contentType = req.query.type as string || undefined;
    const limit = parseInt(req.query.limit as string) || 50;

    const db = (brain as any).db;
    let sql = 'SELECT * FROM brain_knowledge';
    const params: any[] = [];

    if (contentType) {
      sql += ' WHERE content_type = ?';
      params.push(contentType);
    }
    sql += ' ORDER BY quality_score DESC, created_at DESC';
    sql += ` LIMIT ${Math.min(limit, 200)}`;

    const entries = db.prepare(sql).all(...params);
    res.json({ entries, total: entries.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Analyst Performance ──────────────────────────────────────────────────────

router.get('/analyst-performance', (_req: Request, res: Response) => {
  try {
    const brain = getBrain();
    if (!brain) return res.json({ analysts: [] });

    const db = (brain as any).db;

    // Per-analyst episode stats
    const analysts = db.prepare(`
      SELECT
        analyst_id,
        COUNT(*) as total_trades,
        SUM(CASE WHEN outcome_score > 0 THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN outcome_score <= 0 THEN 1 ELSE 0 END) as losses,
        ROUND(AVG(outcome_score), 3) as avg_score,
        ROUND(SUM(pnl_dollars), 2) as total_pnl,
        ROUND(AVG(pnl_percent), 2) as avg_pnl_percent,
        ROUND(AVG(hold_days), 1) as avg_hold_days,
        MIN(created_at) as first_trade,
        MAX(created_at) as last_trade
      FROM brain_episodes
      GROUP BY analyst_id
      ORDER BY total_pnl DESC
    `).all();

    // Per-analyst by symbol breakdown
    const bySymbol = db.prepare(`
      SELECT
        analyst_id,
        symbol,
        COUNT(*) as trades,
        SUM(CASE WHEN outcome_score > 0 THEN 1 ELSE 0 END) as wins,
        ROUND(SUM(pnl_dollars), 2) as pnl,
        ROUND(AVG(outcome_score), 3) as avg_score
      FROM brain_episodes
      GROUP BY analyst_id, symbol
      ORDER BY analyst_id, pnl DESC
    `).all();

    // Per-analyst feedback signal breakdown
    const feedbackBreakdown = db.prepare(`
      SELECT
        analyst_id,
        signal,
        COUNT(*) as count
      FROM brain_feedback
      GROUP BY analyst_id, signal
      ORDER BY analyst_id, count DESC
    `).all();

    res.json({ analysts, bySymbol, feedbackBreakdown });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Scheduler Status ─────────────────────────────────────────────────────────

router.get('/scheduler', (_req: Request, res: Response) => {
  try {
    const scheduler = getScheduler();
    if (!scheduler) return res.json({ available: false, message: 'Scheduler not initialized' });

    res.json({ available: true, ...scheduler.getStatus() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Trigger Panel Run ────────────────────────────────────────────────────────

router.post('/trigger-run', async (req: Request, res: Response) => {
  try {
    const scheduler = getScheduler();
    if (!scheduler) return res.status(503).json({ error: 'Scheduler not available' });

    const { reason, dryRun, watchlist } = req.body;
    const result = await scheduler.triggerNow(
      reason || 'Console UI trigger',
      { dryRun, watchlist }
    );

    if (!result) {
      const status = scheduler.getStatus();
      const elapsed = status.lastRunStarted
        ? Math.round((Date.now() - new Date(status.lastRunStarted).getTime()) / 1000)
        : null;
      return res.json({
        triggered: false,
        message: elapsed
          ? `Panel is currently executing (${elapsed}s elapsed) — try again shortly`
          : 'Run lock active — try again shortly',
      });
    }

    // Aggregate picks from all reports
    const allPicks = result.reports.flatMap((r: any) => r.picks || []);

    res.json({
      triggered: true,
      runId: result.runId,
      timestamp: result.timestamp,
      analystCount: result.reports.length,
      picksCount: allPicks.length,
      tradesCount: result.trades.length,
      executed: result.executed,
      totalLLMCost: result.totalLLMCost,
      reports: result.reports.map((r: any) => ({
        analyst: r.analystName,
        provider: r.provider,
        picks: r.picks?.length || 0,
        cost: r.costEstimateUSD,
        latencyMs: r.latencyMs,
        commentary: r.marketCommentary,
      })),
      aggregatedPicks: result.aggregatedPicks,
      trades: result.trades,
      error: result.error,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Recent Panel Runs (from observations) ────────────────────────────────────

router.get('/panel-runs', (req: Request, res: Response) => {
  try {
    const brain = getBrain();
    if (!brain) return res.json({ runs: [] });

    const limit = parseInt(req.query.limit as string) || 20;
    const db = (brain as any).db;

    // Get unique run_ids with their timestamps and observation counts
    const runs = db.prepare(`
      SELECT
        run_id,
        MIN(created_at) as started_at,
        COUNT(*) as observation_count,
        GROUP_CONCAT(DISTINCT analyst_id) as analysts
      FROM brain_observations
      WHERE run_id IS NOT NULL
      GROUP BY run_id
      ORDER BY MIN(created_at) DESC
      LIMIT ?
    `).all(limit);

    res.json({ runs, total: runs.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Cost Tracking ────────────────────────────────────────────────────────────

router.get('/cost-summary', (_req: Request, res: Response) => {
  try {
    const brain = getBrain();
    if (!brain) return res.json({ available: false });

    const db = (brain as any).db;

    // Count observations per day as proxy for panel runs
    const dailyRuns = db.prepare(`
      SELECT
        date(created_at) as day,
        COUNT(DISTINCT run_id) as runs,
        COUNT(*) as total_observations
      FROM brain_observations
      WHERE created_at >= datetime('now', '-30 days')
      GROUP BY date(created_at)
      ORDER BY day DESC
    `).all();

    // Estimate cost: ~$0.018/run (2 Ollama $0 + 1 GPT-4o-mini $0.003 + 1 Grok $0.015)
    const COST_PER_RUN = 0.018;
    const totalRuns = dailyRuns.reduce((sum: number, d: any) => sum + d.runs, 0);

    res.json({
      available: true,
      costPerRun: COST_PER_RUN,
      totalRuns,
      estimatedTotalCost: Math.round(totalRuns * COST_PER_RUN * 100) / 100,
      dailyBreakdown: dailyRuns,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Trade Decisions (Why the AI traded) ──────────────────────────────────────

router.get('/decisions', (req: Request, res: Response) => {
  try {
    const brain = getBrain();
    if (!brain) return res.json({ decisions: [] });

    const limit = parseInt(req.query.limit as string) || 20;
    const db = (brain as any).db;

    const rows = db.prepare(`
      SELECT run_id, analyst_id, content, metadata_json, created_at
      FROM brain_observations
      WHERE obs_type = 'analyst_decisions'
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);

    const decisions = rows.map((r: any) => {
      let meta = {};
      try { meta = JSON.parse(r.metadata_json || '{}'); } catch {}
      return {
        runId: r.run_id,
        analyst: (meta as any).analyst || r.analyst_id,
        provider: (meta as any).provider,
        commentary: r.content,
        picks: (meta as any).picks || [],
        costUsd: (meta as any).costUsd,
        latencyMs: (meta as any).latencyMs,
        timestamp: r.created_at,
      };
    });

    res.json({ decisions, total: decisions.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Portfolio Snapshots (Balance Tracking) ───────────────────────────────────

router.get('/snapshots', (req: Request, res: Response) => {
  try {
    const brain = getBrain();
    if (!brain) return res.json({ snapshots: [], starting: null, latest: null });

    const limit = parseInt(req.query.limit as string) || 500;
    const snapshots = brain.getSnapshots(limit);
    const starting = brain.getStartingBalance();
    const latest = brain.getLatestSnapshot();

    res.json({ snapshots, starting, latest, total: snapshots.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/growth', (req: Request, res: Response) => {
  try {
    const brain = getBrain();
    if (!brain) return res.json({ available: false });

    const days = parseInt(req.query.days as string) || 30;
    const daily = brain.getDailySnapshots(days);
    const starting = brain.getStartingBalance();
    const latest = brain.getLatestSnapshot();

    if (!starting || !latest) {
      return res.json({ available: false, message: 'No snapshots yet' });
    }

    const startValue = starting.portfolio_value;
    const currentValue = latest.portfolio_value;
    const absoluteGrowth = currentValue - startValue;
    const percentGrowth = startValue > 0 ? ((currentValue - startValue) / startValue) * 100 : 0;

    res.json({
      available: true,
      startingBalance: startValue,
      currentBalance: currentValue,
      absoluteGrowth: Math.round(absoluteGrowth * 100) / 100,
      percentGrowth: Math.round(percentGrowth * 100) / 100,
      startDate: starting.created_at,
      latestDate: latest.created_at,
      snapshotCount: brain.getStats().snapshots,
      dailyHistory: daily,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Seed initial snapshot (one-time, from broker) ────────────────────────────

router.post('/seed-snapshot', async (req: Request, res: Response) => {
  try {
    const brain = getBrain();
    if (!brain) return res.status(503).json({ error: 'Brain not available' });

    const stats = brain.getStats();
    if (stats.snapshots > 0) {
      return res.json({ seeded: false, message: `Already have ${stats.snapshots} snapshots` });
    }

    // Fetch from broker
    const brokerRes = await fetch(`http://localhost:3002/api/broker/account`);
    const brokerData = await (brokerRes as any).json();
    const acct = brokerData.account;

    if (!acct) return res.status(500).json({ error: 'Could not fetch broker account' });

    brain.recordSnapshot({
      portfolioValue: parseFloat(acct.portfolioValue || acct.portfolio_value || 0),
      cash: parseFloat(acct.cash || 0),
      equity: parseFloat(acct.equity || 0),
      buyingPower: parseFloat(acct.buyingPower || acct.buying_power || 0),
      positionsCount: 0,
      unrealizedPnl: 0,
      dayTradeCount: parseInt(acct.daytradeCount || acct.daytrade_count || 0),
      runId: 'seed-initial',
    });

    res.json({ seeded: true, portfolioValue: acct.portfolioValue || acct.portfolio_value });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
