/**
 * @file blitz.js
 * @description Blitz Mode API - Run all agents sequentially and capture outputs
 */

const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const openclawBridge = require('../services/openclawBridge');

// Test prompts for each agent
const AGENT_PROMPTS = {
  'HOA Content Writer': `Write a 300-word blog post about why HOAs should build reserve funds gradually rather than using special assessments. Include:
- Benefits of steady contributions
- Risks of delaying maintenance
- Impact on property values
- Real example scenario
Target audience: HOA board members. Tone: Educational, professional.`,

  'HOA Social Media': `Create 3 LinkedIn posts (each 150 words max) about HOA reserve funding best practices:

Post 1: Why reserve studies matter
Post 2: How to increase reserves without shocking owners
Post 3: Common reserve fund mistakes to avoid

Format: Each post should have a hook, body, and CTA. Tone: Professional but conversational. Include 3 relevant hashtags per post.`,

  'HOA Social Engagement': `You found this Reddit post in r/HOA:

Title: "Board wants to drain our reserves to avoid raising fees"
Content: "Our 80-unit condo has $150K in reserves. The board proposed using $100K for pool renovation to avoid a $1,200/unit assessment. Is this legal? Feels wrong."

Task: Draft a helpful, informative response (200 words max). Be empathetic, provide factual guidance about reserve fund best practices, and mention HOA Project Funding only if highly relevant. Focus on helping first.`,

  'HOA Email Campaigns': `Create a 3-email drip campaign for HOA boards considering financing options:

Email 1 (Day 1): Subject + Body - Introduction to HOA financing vs assessments
Email 2 (Day 3): Subject + Body - How HOA loans work (rates, terms, qualification)
Email 3 (Day 7): Subject + Body - Case study + CTA to schedule consultation

Requirements:
- Each email 200-250 words
- Professional tone
- Clear value proposition
- Soft CTAs (not pushy)`,

  'HOA CMS Publisher': `Generate metadata and SEO tags for a blog post titled "HOA Reserve Study Guide 2026"

Required fields:
- Meta description (155 characters max)
- Focus keyword
- 5 secondary keywords
- URL slug
- 3 internal link suggestions (to other HOA topics)
- Featured image description for alt text
- Category and 5 tags

Format as JSON for easy parsing.`,

  'HOA Networker': `Review the current Lead Gen queue and provide:

1. Total opportunities in queue
2. Summary of top 3 by relevance score (platform, topic, score)
3. Recommendation on which to prioritize today
4. Any patterns noticed (common pain points, platforms with most activity)

Keep response under 250 words.`
};

/**
 * POST /api/blitz/run
 * Start a new blitz run - executes all agents sequentially
 */
router.post('/run', async (req, res) => {
  try {
    console.log('[Blitz] Starting new blitz run...');

    // 1. Get all active agents
    const agents = await db.all(
      `SELECT id, name, config FROM agents WHERE status = 'active' ORDER BY name`
    );

    if (agents.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No active agents found'
      });
    }

    // 2. Create blitz run record
    const runResult = await db.run(
      `INSERT INTO blitz_runs (status, total_agents) VALUES ('running', ?)`,
      [agents.length]
    );

    const runId = runResult.lastID;
    console.log(`[Blitz] Created run ${runId} with ${agents.length} agents`);

    // 3. Create pending result records for each agent
    for (const agent of agents) {
      const prompt = AGENT_PROMPTS[agent.name] || `Provide a brief introduction of your capabilities and role in the HOA Project Funding marketing system.`;

      await db.run(
        `INSERT INTO blitz_results (blitz_run_id, agent_id, agent_name, prompt, status)
         VALUES (?, ?, ?, ?, 'pending')`,
        [runId, agent.id, agent.name, prompt]
      );
    }

    // 4. Start async execution (don't await - let it run in background)
    executeBlitzRun(runId, agents).catch(err => {
      console.error('[Blitz] Run failed:', err);
    });

    // 5. Return run ID immediately
    res.json({
      success: true,
      runId,
      message: `Blitz run started with ${agents.length} agents`,
      totalAgents: agents.length
    });

  } catch (error) {
    console.error('[Blitz] Error starting run:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Execute blitz run (background process)
 * @private
 */
async function executeBlitzRun(runId, agents) {
  const runStartTime = Date.now();

  console.log(`[Blitz] Executing run ${runId}...`);

  for (const agent of agents) {
    const prompt = AGENT_PROMPTS[agent.name] || `Provide a brief introduction of your capabilities and role in the HOA Project Funding marketing system.`;

    console.log(`[Blitz] Running agent: ${agent.name}`);

    // Update status to running
    await db.run(
      `UPDATE blitz_results
       SET status = 'running', started_at = datetime('now')
       WHERE blitz_run_id = ? AND agent_id = ?`,
      [runId, agent.id]
    );

    try {
      const startTime = Date.now();

      // Run agent via OpenClaw Bridge
      const openclawId = agent.config?.openclaw_id || agent.name.toLowerCase().replace(/\s+/g, '-');

      const result = await openclawBridge.runAgent(agent.id, {
        openclawId,
        message: prompt,
        json: false // Get full text output
      });

      const duration = Date.now() - startTime;

      console.log(`[Blitz] ✅ ${agent.name} completed in ${duration}ms`);

      // Update result with output
      await db.run(
        `UPDATE blitz_results
         SET output = ?, status = 'completed', duration_ms = ?, completed_at = datetime('now')
         WHERE blitz_run_id = ? AND agent_id = ?`,
        [result.output || 'No output', duration, runId, agent.id]
      );

      // Increment completed count
      await db.run(
        `UPDATE blitz_runs SET completed_agents = completed_agents + 1 WHERE id = ?`,
        [runId]
      );

    } catch (error) {
      console.error(`[Blitz] ❌ ${agent.name} failed:`, error.message);

      // Update result with error
      await db.run(
        `UPDATE blitz_results
         SET status = 'failed', error = ?, completed_at = datetime('now')
         WHERE blitz_run_id = ? AND agent_id = ?`,
        [error.message, runId, agent.id]
      );

      // Increment failed count
      await db.run(
        `UPDATE blitz_runs SET failed_agents = failed_agents + 1, completed_agents = completed_agents + 1 WHERE id = ?`,
        [runId]
      );
    }
  }

  // Mark run as completed
  const totalDuration = Date.now() - runStartTime;

  await db.run(
    `UPDATE blitz_runs
     SET status = 'completed', completed_at = datetime('now'), total_duration_ms = ?
     WHERE id = ?`,
    [totalDuration, runId]
  );

  console.log(`[Blitz] Run ${runId} completed in ${totalDuration}ms`);
}

/**
 * GET /api/blitz/status/:runId
 * Get current status of a blitz run
 */
router.get('/status/:runId', async (req, res) => {
  try {
    const { runId } = req.params;

    const run = await db.get(
      `SELECT * FROM blitz_runs WHERE id = ?`,
      [runId]
    );

    if (!run) {
      return res.status(404).json({
        success: false,
        error: 'Blitz run not found'
      });
    }

    const results = await db.all(
      `SELECT id, agent_name, status, duration_ms, error
       FROM blitz_results
       WHERE blitz_run_id = ?
       ORDER BY id`,
      [runId]
    );

    res.json({
      success: true,
      run,
      results,
      progress: {
        total: run.total_agents,
        completed: run.completed_agents,
        failed: run.failed_agents,
        percentage: Math.round((run.completed_agents / run.total_agents) * 100)
      }
    });

  } catch (error) {
    console.error('[Blitz] Error getting status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/blitz/results/:runId
 * Get detailed results of a blitz run
 */
router.get('/results/:runId', async (req, res) => {
  try {
    const { runId } = req.params;

    const run = await db.get(
      `SELECT * FROM blitz_runs WHERE id = ?`,
      [runId]
    );

    if (!run) {
      return res.status(404).json({
        success: false,
        error: 'Blitz run not found'
      });
    }

    const results = await db.all(
      `SELECT * FROM blitz_results WHERE blitz_run_id = ? ORDER BY id`,
      [runId]
    );

    res.json({
      success: true,
      run,
      results
    });

  } catch (error) {
    console.error('[Blitz] Error getting results:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/blitz/history
 * Get list of all blitz runs
 */
router.get('/history', async (req, res) => {
  try {
    const runs = await db.all(
      `SELECT id, status, started_at, completed_at, total_agents, completed_agents, failed_agents, total_duration_ms
       FROM blitz_runs
       ORDER BY started_at DESC
       LIMIT 20`
    );

    res.json({
      success: true,
      runs
    });

  } catch (error) {
    console.error('[Blitz] Error getting history:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
