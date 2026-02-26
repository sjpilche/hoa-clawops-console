/**
 * @file blitz.js
 * @description Blitz Mode API - Run agents by domain and capture outputs
 */

const express = require('express');
const router = express.Router();
const { all, get, run } = require('../db/connection');
const openclawBridge = require('../services/openclawBridge');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// Domain filters — maps domain key to SQL LIKE pattern(s)
const DOMAIN_FILTERS = {
  jake: ['jake-%', 'cfo-%'],  // Unified Jake Marketing — includes Steve-voice (cfo-*) agents
  hoa: 'hoa-%',
  mgmt: 'mgmt-%',
};

// Jake Lead Scout region rotation — cycles through key construction markets each Blitz run
const JAKE_REGIONS = [
  { region: 'Tampa Bay, FL', trade: 'GC' },
  { region: 'Denver, CO', trade: 'GC' },
  { region: 'Charlotte, NC', trade: 'GC' },
  { region: 'Austin, TX', trade: 'GC' },
  { region: 'Phoenix, AZ', trade: 'GC' },
  { region: 'Nashville, TN', trade: 'GC' },
  { region: 'Chicago, IL', trade: 'GC' },
  { region: 'Raleigh, NC', trade: 'GC' },
  { region: 'Salt Lake City, UT', trade: 'GC' },
  { region: 'Jacksonville, FL', trade: 'GC' },
  { region: 'San Antonio, TX', trade: 'GC' },
  { region: 'Atlanta, GA', trade: 'GC' },
];
let _jakeRegionIdx = 0;

function getJakeLeadScoutPrompt() {
  const r = JAKE_REGIONS[_jakeRegionIdx % JAKE_REGIONS.length];
  _jakeRegionIdx++;
  return JSON.stringify({ search_region: r.region, target_trade: r.trade, target_revenue: '$5M-$25M', limit: 15 });
}

// Test prompts for each agent (keyed by slug name)
const AGENT_PROMPTS = {
  // ── HOA Marketing ──
  'hoa-content-writer': `Write a 300-word blog post about why HOAs should build reserve funds gradually rather than using special assessments. Include benefits of steady contributions, risks of delaying maintenance, impact on property values, and a real example scenario. Tone: Educational, professional.`,
  'hoa-social-media': `Create 3 LinkedIn posts (each 150 words max) about HOA reserve funding best practices: 1) Why reserve studies matter, 2) How to increase reserves without shocking owners, 3) Common reserve fund mistakes to avoid. Each post: hook, body, CTA, 3 hashtags.`,
  'hoa-social-engagement': `You found this Reddit post in r/HOA:\n\nTitle: "Board wants to drain our reserves to avoid raising fees"\nContent: "Our 80-unit condo has $150K in reserves. The board proposed using $100K for pool renovation to avoid a $1,200/unit assessment. Is this legal?"\n\nDraft a helpful, informative response (200 words max). Be empathetic, provide factual guidance.`,
  'hoa-email-campaigns': `Create a 3-email drip campaign for HOA boards considering financing options. Email 1 (Day 1): Intro to HOA financing vs assessments. Email 2 (Day 3): How HOA loans work. Email 3 (Day 7): Case study + CTA. Each 200-250 words, professional tone, soft CTAs.`,
  'hoa-cms-publisher': `Generate metadata and SEO tags for a blog post titled "HOA Reserve Study Guide 2026". Include: meta description (155 chars), focus keyword, 5 secondary keywords, URL slug, 3 internal link suggestions, alt text, category and 5 tags. Format as JSON.`,
  'hoa-networker': `Review the current Lead Gen queue and provide: 1) Total opportunities, 2) Top 3 by relevance score, 3) Recommendation on which to prioritize today, 4) Patterns noticed. Keep under 250 words.`,
  'hoa-facebook-poster': `Write a Facebook post about HOA reserve funding best practices. Casual, community-oriented tone. 250-400 words. Ask a question to drive engagement. Include a CTA to learn more about HOA Project Funding.`,
  'hoa-website-publisher': `Generate a website update for the HOA Project Funding site. Include a new testimonial section, updated stats, and a refreshed hero section CTA. Format as structured content blocks.`,

  // ── HOA Pipeline ──
  'hoa-discovery': `{}`,
  'hoa-contact-finder': `Find contact information for recently discovered HOA management companies in South Florida. Focus on board members, property managers, and treasurers.`,
  'hoa-contact-enricher': `Enrich the most recent batch of HOA contacts with LinkedIn profiles, email verification, and company size estimates.`,
  'hoa-outreach-drafter': `Draft personalized outreach emails for the top 5 highest-scored HOA leads. Use the HOA Project Funding value proposition.`,

  // ── HOA Intel ──
  'hoa-minutes-monitor': `Scan recent HOA board meeting minutes for mentions of: reserve fund shortfalls, special assessments, deferred maintenance, or financing discussions. Report findings.`,
  'google-reviews-monitor': `Check recent Google reviews for HOA management companies in our target markets. Flag negative reviews mentioning financial mismanagement, assessment increases, or maintenance delays.`,

  // ── Mgmt Research ──
  'mgmt-portfolio-scraper': `Scrape portfolio data for HOA management companies in Florida. Focus on company size, number of communities managed, and service areas.`,
  'mgmt-contact-puller': `Pull contact information for decision-makers at the top 10 HOA management companies by portfolio size.`,
  'mgmt-portfolio-mapper': `Map the HOA management company landscape in South Florida. Identify market leaders, emerging players, and gaps.`,
  'mgmt-review-scanner': `Scan online reviews for HOA management companies. Identify companies with poor financial management reviews — potential leads for our services.`,
  'mgmt-cai-scraper': `Search CAI (Community Associations Institute) chapter events and member directories for HOA industry contacts in Florida.`,

  // ── Jake Marketing — Steve-voice agents ──
  'cfo-content-engine': `{"pillar":"spend_leak","channel":"linkedin","tone":"Trust Envelope"}`,
  'cfo-outreach-agent': `{"company_name":"Test Construction Inc","contact_name":"Mike Johnson","contact_title":"Controller","trade":"GC","location":"Sarasota, FL","pain_signals":["legacy QB data","manual reconciliation","slow close"]}`,
  'cfo-lead-scout': `{"county":"Sarasota","lic_type":"0605","limit":10}`,
  'cfo-social-scheduler': `{"content":"We just helped a $15M GC cut their close time from 38 to 11 days. No new hires. Just clean data and smart automation.","platform":"linkedin"}`,
  'cfo-analytics-monitor': `{"report_type":"daily"}`,
  'cfo-offer-proof-builder': `{"document_type":"case_study","target_trade":"GC","target_company_size":"$10M-$25M"}`,
  'cfo-pilot-deliverer': `{"phase":"kickoff","company_name":"Test Construction","contact_name":"Mike","pilot_type":"data_cleanup_only"}`,

  // ── Jake Marketing ──
  'jake-content-engine': `{"pillar":"cash_flow","channel":"linkedin"}`,
  'jake-outreach-agent': `{"company_name":"Sunshine Builders","contact_name":"Mike","contact_title":"Owner","trade":"GC","location":"Tampa, FL","company_size":"35 employees / $12M revenue","pain_signals":["legacy data","AR chaos","2am spreadsheet nights"]}`,
  'jake-lead-scout': getJakeLeadScoutPrompt(),
  'jake-social-scheduler': `{"content":"Jake just saved a GC $40K in unbilled retainage sitting on completed jobs. Took 10 minutes. Their controller had been manually tracking it in Excel for 3 years.","platform":"linkedin"}`,
  'jake-analytics-monitor': `{"report_type":"daily"}`,
  'jake-offer-proof-builder': `{"document_type":"case_study","target_trade":"GC","target_company_size":"$10M-$25M"}`,
  'jake-pilot-deliverer': `{"phase":"kickoff","company_name":"Gulf Coast Contractors","contact_name":"Mike","pilot_type":"data_cleanup_only"}`,

  // ── Core ──
  'daily-debrief': `Generate the daily war room debrief. Summarize all agent activity, key metrics, wins, and items needing attention.`,
};

/**
 * POST /api/blitz/run
 * Start a new blitz run - optionally filtered by domain
 * Body: { domain?: 'jake'|'cfo'|'hoa'|'mgmt'|'all' }
 */
router.post('/run', async (req, res) => {
  try {
    const domain = req.body.domain || 'all';
    console.log(`[Blitz] Starting new blitz run (domain: ${domain})...`);

    // Build query — agents are 'idle' when not running
    let query = `SELECT id, name, config FROM agents WHERE status IN ('idle', 'active')`;
    const params = [];

    if (domain !== 'all' && DOMAIN_FILTERS[domain]) {
      const filters = DOMAIN_FILTERS[domain];
      if (Array.isArray(filters)) {
        query += ` AND (${filters.map(() => 'name LIKE ?').join(' OR ')})`;
        params.push(...filters);
      } else {
        query += ` AND name LIKE ?`;
        params.push(filters);
      }
    }

    // Exclude the 'main' chat router agent from batch runs
    query += ` AND name != 'main' ORDER BY name`;

    const agents = all(query, params);

    if (agents.length === 0) {
      return res.status(400).json({
        success: false,
        error: `No agents found for domain "${domain}"`
      });
    }

    // Create blitz run record
    run(
      `INSERT INTO blitz_runs (status, total_agents, domain) VALUES ('running', ?, ?)`,
      [agents.length, domain]
    );

    const blitzRun = get(`SELECT id FROM blitz_runs ORDER BY rowid DESC LIMIT 1`);
    const runId = blitzRun.id;
    console.log(`[Blitz] Created run ${runId} with ${agents.length} agents (domain: ${domain})`);

    // Create pending result records for each agent
    for (const agent of agents) {
      const prompt = AGENT_PROMPTS[agent.name] || `Introduce yourself and demonstrate your capabilities. What would you do if given a typical task?`;

      run(
        `INSERT INTO blitz_results (blitz_run_id, agent_id, agent_name, prompt, status)
         VALUES (?, ?, ?, ?, 'pending')`,
        [runId, agent.id, agent.name, prompt]
      );
    }

    // Start async execution (don't await - let it run in background)
    executeBlitzRun(runId, agents).catch(err => {
      console.error('[Blitz] Run failed:', err);
    });

    // Return run ID immediately
    res.json({
      success: true,
      runId,
      domain,
      message: `Blitz run started with ${agents.length} agents (${domain})`,
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
// Delay between agents to avoid OpenAI RPM rate limits
const INTER_AGENT_DELAY_MS = 15000;

async function executeBlitzRun(runId, agents) {
  const runStartTime = Date.now();

  console.log(`[Blitz] Executing run ${runId} (${agents.length} agents, ${INTER_AGENT_DELAY_MS / 1000}s stagger)...`);

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    // Stagger all agents after the first to avoid rate limits
    if (i > 0) {
      console.log(`[Blitz] Waiting ${INTER_AGENT_DELAY_MS / 1000}s before next agent...`);
      await new Promise(r => setTimeout(r, INTER_AGENT_DELAY_MS));
    }

    const prompt = AGENT_PROMPTS[agent.name] || `Introduce yourself and demonstrate your capabilities. What would you do if given a typical task?`;

    console.log(`[Blitz] Running agent: ${agent.name}`);

    // Update status to running
    run(
      `UPDATE blitz_results
       SET status = 'running', started_at = datetime('now')
       WHERE blitz_run_id = ? AND agent_id = ?`,
      [runId, agent.id]
    );

    try {
      const startTime = Date.now();

      // Run agent via OpenClaw Bridge
      const agentConfig = agent.config ? JSON.parse(agent.config) : {};
      const openclawId = agentConfig.openclaw_id || agent.name.toLowerCase().replace(/\s+/g, '-');

      // Use daily session ID for continuity — agents remember context across Blitz runs on same day
      const today = new Date().toISOString().slice(0, 10);
      const sessionId = `blitz-${agent.name}-${today}`;

      const result = await openclawBridge.runAgent(agent.id, {
        openclawId,
        message: prompt,
        sessionId,
        json: false // Get full text output
      });

      const duration = Date.now() - startTime;

      // Extract clean text output via shared parseOutput (handles empty payloads gracefully)
      const parsed = openclawBridge.constructor.parseOutput(result.output || '');
      const outputText = parsed.text || result.output || 'No output';

      console.log(`[Blitz] ${agent.name} completed in ${duration}ms`);

      // Post-process LLM output into unified marketing pipeline
      const { postProcessLLMOutput } = require('../services/postProcessor');
      postProcessLLMOutput(agent, outputText, prompt);

      // Update result with output
      run(
        `UPDATE blitz_results
         SET output = ?, status = 'completed', duration_ms = ?, completed_at = datetime('now')
         WHERE blitz_run_id = ? AND agent_id = ?`,
        [outputText, duration, runId, agent.id]
      );

      // Increment completed count
      run(
        `UPDATE blitz_runs SET completed_agents = completed_agents + 1 WHERE id = ?`,
        [runId]
      );

    } catch (error) {
      console.error(`[Blitz] ${agent.name} failed:`, error.message);

      // Update result with error
      run(
        `UPDATE blitz_results
         SET status = 'failed', error = ?, completed_at = datetime('now')
         WHERE blitz_run_id = ? AND agent_id = ?`,
        [error.message, runId, agent.id]
      );

      // Increment failed count
      run(
        `UPDATE blitz_runs SET failed_agents = failed_agents + 1, completed_agents = completed_agents + 1 WHERE id = ?`,
        [runId]
      );
    }
  }

  // Mark run as completed
  const totalDuration = Date.now() - runStartTime;

  run(
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

    const blitzRun = get(
      `SELECT * FROM blitz_runs WHERE id = ?`,
      [runId]
    );

    if (!blitzRun) {
      return res.status(404).json({
        success: false,
        error: 'Blitz run not found'
      });
    }

    const results = all(
      `SELECT id, agent_name, status, duration_ms, error
       FROM blitz_results
       WHERE blitz_run_id = ?
       ORDER BY id`,
      [runId]
    );

    res.json({
      success: true,
      run: blitzRun,
      results,
      progress: {
        total: blitzRun.total_agents,
        completed: blitzRun.completed_agents,
        failed: blitzRun.failed_agents,
        percentage: Math.round((blitzRun.completed_agents / blitzRun.total_agents) * 100)
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

    const blitzRun = get(
      `SELECT * FROM blitz_runs WHERE id = ?`,
      [runId]
    );

    if (!blitzRun) {
      return res.status(404).json({
        success: false,
        error: 'Blitz run not found'
      });
    }

    const results = all(
      `SELECT * FROM blitz_results WHERE blitz_run_id = ? ORDER BY id`,
      [runId]
    );

    res.json({
      success: true,
      run: blitzRun,
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
    const runs = all(
      `SELECT id, status, started_at, completed_at, total_agents, completed_agents, failed_agents, total_duration_ms, domain
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
