/**
 * @file runs.js (routes)
 * @description Agent run management — confirmation gate, special handlers, OpenClaw execution.
 *
 * ENDPOINTS:
 *   GET  /api/runs              — List recent runs
 *   GET  /api/runs/:id          — Get run details
 *   GET  /api/runs/:id/status   — Poll run status
 *   POST /api/runs/:id/confirm  — Confirm and execute pending run
 *   POST /api/runs/:id/cancel   — Cancel pending run
 */

const { Router } = require('express');
const { v4: uuidv4 } = require('uuid');
const { all, get, run } = require('../db/connection');
const { authenticate } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { validateParams, validateQuery } = require('../middleware/validator');
const { runIdParamSchema, listRunsQuerySchema } = require('../schemas');

const router = Router();
router.use(authenticate);

// ════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS — eliminates ~180 lines of duplication across 13 handlers
// ════════════════════════════════════════════════════════════════════════════

function markRunCompleted(runId, agentId, durationMs, resultData, costUsd = 0, tokensUsed = 0) {
  run(
    `UPDATE runs SET status='completed', completed_at=datetime('now'), duration_ms=?, tokens_used=?, cost_usd=?, result_data=?, updated_at=datetime('now') WHERE id=?`,
    [durationMs, tokensUsed, costUsd, typeof resultData === 'string' ? resultData : JSON.stringify(resultData), runId]
  );
  run(
    `UPDATE agents SET status='idle', total_runs=total_runs+1, last_run_at=datetime('now'), updated_at=datetime('now') WHERE id=?`,
    [agentId]
  );
}

function markRunFailed(runId, agentId, errorMsg) {
  run(
    `UPDATE runs SET status='failed', error_msg=?, completed_at=datetime('now'), updated_at=datetime('now') WHERE id=?`,
    [errorMsg, runId]
  );
  run(
    `UPDATE agents SET status='idle', updated_at=datetime('now') WHERE id=?`,
    [agentId]
  );
}

function buildResultData(runId, message, outputText, extra = {}) {
  return JSON.stringify({ sessionId: runId, message, output: null, outputText, ...extra });
}

function parseMessageParams(message) {
  try {
    return JSON.parse(message);
  } catch {
    return {};
  }
}

function parseTextParams(message, patterns) {
  const params = {};
  for (const [key, regex] of Object.entries(patterns)) {
    const match = message.match(regex);
    if (match) params[key] = match[1];
  }
  return params;
}

// ════════════════════════════════════════════════════════════════════════════
// SPECIAL HANDLER REGISTRY — each handler is a function, not an inline block
// ════════════════════════════════════════════════════════════════════════════

const SPECIAL_HANDLERS = {
  github_publisher: async ({ message, runId, agent }) => {
    const { publishPost } = require('../services/githubPublisher');
    const startTime = Date.now();
    const summary = await publishPost(message);
    return { outputText: summary, durationMs: Date.now() - startTime };
  },

  hoa_contact_scraper: async ({ message, runId, agent, agentConfig }) => {
    const { searchHOAContacts } = require('../services/hoaContactScraper');
    const startTime = Date.now();

    let searchParams = parseMessageParams(message);
    if (!searchParams.city) {
      const text = parseTextParams(message, {
        city: /city[:\s]+([a-zA-Z\s]+?)(?:\s*,|\s*$)/i,
        state: /state[:\s]+([A-Z]{2})/i,
        zip_code: /zip[:\s]+(\d{5})/i,
      });
      searchParams = { ...searchParams, ...text };
    }
    if (!searchParams.city) throw new Error('Search parameters must include a city. Example: {"city":"San Diego","state":"CA"}');

    const result = await searchHOAContacts(searchParams);
    const durationMs = Date.now() - startTime;
    const outputText = `HOA Contact Search: ${result.results.total_found} found, ${result.results.new_contacts} new (${searchParams.city}, ${searchParams.state || 'US'}) in ${(durationMs / 1000).toFixed(1)}s`;
    return { outputText, durationMs, extra: { searchResult: result } };
  },

  hoa_discovery: async ({ message, runId, agent, agentConfig }) => {
    const { processGeoTarget, processMultipleGeoTargets } = require('../services/googleMapsDiscovery');
    const startTime = Date.now();

    let params = parseMessageParams(message);
    if (!params.geoTargetId && !params.geo_target_id) {
      const text = parseTextParams(message, {
        geoTargetId: /geo[_-]?target[:\s]+([a-z-]+)/i,
        limit: /limit[:\s]+(\d+)/i,
      });
      params = { ...params, ...text };
    }

    const defaults = agentConfig.default_params || {};
    const geoTargetId = params.geoTargetId || params.geo_target_id || defaults.geo_target_id || null;
    const limit = parseInt(params.limit || defaults.limit || 1);

    const result = geoTargetId
      ? await processGeoTarget(geoTargetId)
      : await processMultipleGeoTargets({ limit });

    const durationMs = Date.now() - startTime;
    const topTarget = result.geo_target || (result.results && result.results[0]?.geo_target) || 'Unknown';
    const totalNew = result.new_communities || result.total_new_communities || 0;
    const outputText = `HOA Discovery: ${topTarget} — ${totalNew} new communities, ${result.queries_run || 0} queries in ${(durationMs / 1000).toFixed(1)}s`;
    return { outputText, durationMs, extra: { discoveryResult: result } };
  },

  hoa_minutes_monitor: async ({ message, runId, agent, agentConfig }) => {
    const { scanMultipleHOAs } = require('../services/hoaMinutesMonitor');
    const startTime = Date.now();

    let params = parseMessageParams(message);
    if (!params.limit) {
      const text = parseTextParams(message, {
        limit: /limit[:\s]+(\d+)/i,
        state: /state[:\s]+([A-Z]{2})/i,
        priority_min: /priority[:\s]+(\d+)/i,
      });
      params = { ...params, ...text };
    }

    const defaults = agentConfig.default_params || {};
    const scanParams = {
      limit: parseInt(params.limit || defaults.limit || 20),
      state: params.state || defaults.state || null,
      priority_min: parseInt(params.priority_min || defaults.priority_min || 5),
    };

    const result = await scanMultipleHOAs(scanParams);
    const durationMs = Date.now() - startTime;
    const outputText = `Minutes Scan: ${result.scanned_count} HOAs — ${result.hot_count} HOT, ${result.warm_count} WARM in ${(durationMs / 1000).toFixed(1)}s`;
    return { outputText, durationMs, extra: { scanResult: result } };
  },

  hoa_contact_enricher: async ({ message, runId, agent, agentConfig }) => {
    const { enrichMultipleLeads } = require('../services/hoaContactEnricher');
    const startTime = Date.now();

    let params = parseMessageParams(message);
    if (!params.limit) {
      const text = parseTextParams(message, {
        limit: /limit[:\s]+(\d+)/i,
        tier: /tier[:\s]+(HOT|WARM|WATCH)/i,
      });
      params = { ...params, ...text };
    }

    const defaults = agentConfig.default_params || {};
    const enrichParams = {
      limit: parseInt(params.limit || defaults.limit || 10),
      tier: params.tier || defaults.tier || null,
    };

    const result = await enrichMultipleLeads(enrichParams);
    const durationMs = Date.now() - startTime;
    const outputText = `Contact Enrichment: ${result.success_count}/${result.enriched_count} enriched (${enrichParams.tier || 'all tiers'}) in ${(durationMs / 1000).toFixed(1)}s`;
    return { outputText, durationMs, extra: { enrichResult: result } };
  },

  hoa_outreach_drafter: async ({ message, runId, agent, agentConfig }) => {
    const { draftMultipleOutreach } = require('../services/hoaOutreachDrafter');
    const startTime = Date.now();

    let params = parseMessageParams(message);
    if (!params.limit) {
      const text = parseTextParams(message, {
        limit: /limit[:\s]+(\d+)/i,
        tier: /tier[:\s]+(HOT|WARM|WATCH)/i,
      });
      params = { ...params, ...text };
    }

    const defaults = agentConfig.default_params || {};
    const draftParams = {
      limit: parseInt(params.limit || defaults.limit || 10),
      tier: params.tier || defaults.tier || null,
    };

    const result = await draftMultipleOutreach(draftParams);
    const durationMs = Date.now() - startTime;
    const outputText = `Outreach Drafting: ${result.success_count}/${result.drafted_count} drafted, ${result.success_count * 3} emails in ${(durationMs / 1000).toFixed(1)}s`;
    return { outputText, durationMs, extra: { draftResult: result } };
  },

  google_reviews_monitor: async ({ message, runId, agent, agentConfig }) => {
    const { monitorMultipleHOAs } = require('../services/googleReviewsMonitor');
    const startTime = Date.now();

    let params = parseMessageParams(message);
    if (!params.limit) {
      const text = parseTextParams(message, {
        limit: /limit[:\s]+(\d+)/i,
        tier: /tier[:\s]+(HOT|WARM|MONITOR|COLD)/i,
      });
      params = { ...params, ...text };
    }

    const defaults = agentConfig.default_params || {};
    const monitorParams = {
      limit: parseInt(params.limit || defaults.limit || 10),
      tier: params.tier || defaults.tier || null,
    };

    const result = await monitorMultipleHOAs(monitorParams);
    const durationMs = Date.now() - startTime;
    const outputText = `Reviews Monitor: ${result.monitored_count} monitored, ${result.tier_upgrades} upgrades in ${(durationMs / 1000).toFixed(1)}s`;
    return { outputText, durationMs, extra: { monitorResult: result } };
  },

  mgmt_cai_scraper: async ({ message, runId, agent }) => {
    const { runCaiScraper } = require('../services/mgmtCaiScraper');
    const startTime = Date.now();
    const params = parseMessageParams(message);
    const result = await runCaiScraper(params);
    const durationMs = Date.now() - startTime;
    const outputText = `CAI Scrape: ${result.chapters_scraped} chapters, ${result.new_companies} new companies in ${(durationMs / 1000).toFixed(1)}s`;
    return { outputText, durationMs, extra: { caiResult: result } };
  },

  mgmt_portfolio_scraper: async ({ message, runId, agent }) => {
    const { runPortfolioScraper } = require('../services/mgmtPortfolioScraper');
    const startTime = Date.now();
    const params = parseMessageParams(message);
    if (!params.company_name) throw new Error('Message must be JSON: {"company_name":"...","company_url":"..."}');
    const result = await runPortfolioScraper(params);
    const durationMs = Date.now() - startTime;
    const outputText = `Portfolio Scrape: ${result.company_name} — ${result.new_communities} new communities in ${(durationMs / 1000).toFixed(1)}s`;
    return { outputText, durationMs, extra: { scraperResult: result } };
  },

  mgmt_contact_puller: async ({ message, runId, agent }) => {
    const { runContactPuller } = require('../services/mgmtContactPuller');
    const startTime = Date.now();
    const params = parseMessageParams(message);
    if (!params.company_name) throw new Error('Message must be JSON: {"company_name":"...","company_url":"..."}');
    const result = await runContactPuller(params);
    const durationMs = Date.now() - startTime;
    const outputText = `Contact Pull: ${result.company_name} — ${result.contacts_found} contacts, ${result.decision_makers} decision makers`;
    return { outputText, durationMs, extra: { contactResult: result } };
  },

  mgmt_portfolio_mapper: async ({ message, runId, agent }) => {
    const { runPortfolioMapper } = require('../services/mgmtPortfolioMapper');
    const startTime = Date.now();
    const params = parseMessageParams(message);
    if (!params.company_name) throw new Error('Message must be JSON: {"company_name":"...","company_url":"..."}');
    const result = await runPortfolioMapper(params);
    const durationMs = Date.now() - startTime;
    const outputText = `Portfolio Map: ${result.company_name} — ${result.new_discoveries} discoveries from ${result.searches_run} searches`;
    return { outputText, durationMs, extra: { mapperResult: result } };
  },

  mgmt_review_scanner: async ({ message, runId, agent }) => {
    const { runReviewScanner } = require('../services/mgmtReviewScanner');
    const startTime = Date.now();
    const params = parseMessageParams(message);
    if (!params.company_name) throw new Error('Message must be JSON: {"company_name":"..."}');
    const result = await runReviewScanner(params);
    const durationMs = Date.now() - startTime;
    const outputText = `Review Scan: ${result.company_name} — ${result.google_rating} stars, ${result.hot_leads} hot leads, health: ${result.company_health}`;
    return { outputText, durationMs, extra: { reviewResult: result } };
  },

  cfo_lead_scout: async ({ message, runId, agent }) => {
    const { runLeadScout } = require('../services/cfoLeadScout');
    const startTime = Date.now();
    const params = parseMessageParams(message);
    const result = await runLeadScout(params);
    const durationMs = Date.now() - startTime;
    const outputText = [
      `CFO Lead Scout: ${result.stats.inserted} new, ${result.stats.skipped} dupes in ${(durationMs / 1000).toFixed(1)}s`,
      ...result.leads.slice(0, 5).map(l => `  ${l.company_name} (${l.erp_type}) — Score: ${l.pilot_fit_score}`),
    ].join('\n');
    return { outputText, durationMs, extra: { stats: result.stats } };
  },

  daily_debrief: async ({ message, runId, agent }) => {
    const { collectDebrief } = require('../services/debriefCollector');
    const startTime = Date.now();

    // Collect all operational data ($0, <200ms)
    const params = parseMessageParams(message);
    const data = await collectDebrief(params.date || undefined);

    // Send collected data to the LLM for assessment (~$0.01)
    const openclawBridge = require('../services/openclawBridge');
    const prompt = `Here is today's operational data. Write the Daily Debrief report following your SOUL.md format exactly.\n\n${JSON.stringify(data, null, 2)}`;

    const result = await openclawBridge.runAgent('daily-debrief', {
      openclawId: 'daily-debrief',
      message: prompt,
      sessionId: `debrief-${data.date}-${runId}`,
    });

    const parsed = openclawBridge.constructor.parseOutput(result.output);
    const durationMs = Date.now() - startTime;
    const outputText = parsed.text || result.output || 'Debrief generation failed';
    const costUsd = parsed.costUsd || 0;

    return { outputText, durationMs, costUsd, tokensUsed: parsed.tokensUsed || 0 };
  },
};

// ════════════════════════════════════════════════════════════════════════════
// ROUTES
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/runs?limit=50&agent_id=xxx&status=running
 */
router.get('/', validateQuery(listRunsQuerySchema), (req, res, next) => {
  try {
    const { limit, offset, agent_id, status, start_date, end_date } = req.validated.query;

    let query = 'SELECT runs.*, agents.name AS agent_name FROM runs LEFT JOIN agents ON runs.agent_id = agents.id WHERE 1=1';
    const params = [];

    if (agent_id) { query += ' AND runs.agent_id = ?'; params.push(agent_id); }
    if (status) { query += ' AND runs.status = ?'; params.push(status); }
    if (start_date) { query += ' AND runs.created_at >= ?'; params.push(start_date); }
    if (end_date) { query += ' AND runs.created_at <= ?'; params.push(end_date); }

    query += ' ORDER BY runs.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    res.json({ runs: all(query, params), limit, offset });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/runs/:id
 */
router.get('/:id', validateParams(runIdParamSchema), (req, res, next) => {
  try {
    const runData = get('SELECT * FROM runs WHERE id = ?', [req.validated.params.id]);
    if (!runData) throw new AppError(`Run not found.`, 'RUN_NOT_FOUND', 404);
    res.json({ run: runData });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/runs/:id/status
 */
router.get('/:id/status', validateParams(runIdParamSchema), (req, res, next) => {
  try {
    const runData = get(
      'SELECT id, status, started_at, completed_at, duration_ms, error_msg FROM runs WHERE id = ?',
      [req.validated.params.id]
    );
    if (!runData) throw new AppError(`Run not found.`, 'RUN_NOT_FOUND', 404);
    res.json(runData);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/runs/:id/confirm
 * Confirmation gate — executes a pending run via special handler OR OpenClaw.
 */
router.post('/:id/confirm', validateParams(runIdParamSchema), async (req, res, next) => {
  try {
    const runId = req.validated.params.id;
    const userId = req.user.id;

    // 1. Fetch pending run
    const runData = get('SELECT * FROM runs WHERE id = ?', [runId]);
    if (!runData) throw new AppError(`Run not found.`, 'RUN_NOT_FOUND', 404);
    if (runData.status !== 'pending') {
      throw new AppError(`Run is ${runData.status}, not pending.`, 'RUN_NOT_PENDING', 400);
    }

    // 2. Get agent
    const agent = get('SELECT * FROM agents WHERE id = ?', [runData.agent_id]);
    if (!agent) throw new AppError(`Agent not found.`, 'AGENT_NOT_FOUND', 404);

    // 3. Parse run params
    let message = 'Run agent';
    let sessionId = null;
    try {
      const rd = JSON.parse(runData.result_data || '{}');
      message = rd.message || message;
      sessionId = rd.sessionId;
    } catch { /* use defaults */ }

    const agentConfig = agent.config ? JSON.parse(agent.config) : {};

    // 4. Mark as running
    run(
      `UPDATE runs SET status='running', confirmed_by=?, confirmed_at=datetime('now'), started_at=datetime('now'), updated_at=datetime('now') WHERE id=?`,
      [userId, runId]
    );

    // 5. Socket.io helper
    const io = req.app.get('io');
    const emitLog = (line) => {
      try { if (io) io.emit('run:log', { runId, line, timestamp: new Date().toISOString() }); } catch {}
    };

    // ── SPECIAL HANDLERS ──────────────────────────────────────────────────
    const handler = SPECIAL_HANDLERS[agentConfig.special_handler];
    if (handler) {
      try {
        emitLog(`Starting ${agentConfig.special_handler} handler for "${agent.name}"...`);
        const result = await handler({ message, runId, agent, agentConfig });
        const resultData = buildResultData(runId, message, result.outputText, result.extra || {});
        const handlerCost = result.costUsd || 0;
        const handlerTokens = result.tokensUsed || 0;

        markRunCompleted(runId, agent.id, result.durationMs, resultData, handlerCost, handlerTokens);
        emitLog(`${agentConfig.special_handler} completed.`);

        if (io) {
          try { io.emit('run:completed', { runId, agentId: agent.id, status: 'completed', cost: handlerCost, duration: result.durationMs }); } catch {}
        }

        return res.json({
          success: true,
          run: { id: runId, status: 'completed', outputText: result.outputText, cost_usd: handlerCost, duration_ms: result.durationMs, ...(result.extra || {}) },
        });
      } catch (handlerError) {
        console.error(`[Runs] ${agentConfig.special_handler} error:`, handlerError.message);
        markRunFailed(runId, agent.id, handlerError.message);
        emitLog(`${agentConfig.special_handler} failed: ${handlerError.message}`);
        throw new AppError(`${agentConfig.special_handler} failed: ${handlerError.message}`, 'HANDLER_ERROR', 500);
      }
    }

    // ── OPENCLAW AGENT EXECUTION ──────────────────────────────────────────
    const openclawId = agentConfig.openclaw_id;
    if (!openclawId) {
      markRunFailed(runId, agent.id, 'Agent not registered with OpenClaw');
      throw new AppError(`Agent "${agent.name}" has no openclaw_id configured.`, 'AGENT_NOT_REGISTERED', 400);
    }

    const RUN_TIMEOUT_MS = parseInt(process.env.MAX_DURATION_PER_RUN || '300', 10) * 1000;
    const withTimeout = (promise, ms) =>
      Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error(`Agent timed out after ${ms / 1000}s`)), ms))]);

    try {
      emitLog(`Starting OpenClaw agent "${agent.name}" (${openclawId})...`);

      const openclawBridge = require('../services/openclawBridge');
      const runResult = await withTimeout(
        openclawBridge.runAgent(agent.id, { openclawId, message, sessionId }),
        RUN_TIMEOUT_MS
      );

      emitLog(`Agent "${agent.name}" completed.`);

      // Parse OpenClaw output
      let durationMs = null, tokensUsed = 0, costUsd = 0, outputText = '';
      try {
        const parsed = JSON.parse(runResult.output || '{}');
        if (parsed.payloads?.[0]?.text) {
          // Native OpenClaw format: { payloads: [{ text }], meta: { durationMs, agentMeta: { usage } } }
          outputText = parsed.payloads[0].text;
          durationMs = parsed.meta?.durationMs || null;
          const usage = parsed.meta?.agentMeta?.usage || {};
          tokensUsed = usage.total || ((usage.input || 0) + (usage.output || 0));
          costUsd = (usage.input || 0) * 0.0000025 + (usage.output || 0) * 0.00001;
        } else if (parsed.type === 'result') {
          // Legacy bridge format
          outputText = parsed.result || '';
          durationMs = parsed.duration_ms || null;
          costUsd = parsed.total_cost_usd || 0;
          const usage = parsed.usage || {};
          tokensUsed = (usage.input_tokens || 0) + (usage.output_tokens || 0);
        }
      } catch {
        outputText = runResult.output || '';
      }

      const resultData = buildResultData(runId, message, outputText, {
        sessionId: runResult.sessionId,
        rawOutput: runResult.output || null,
      });

      // Update DB
      run(
        `UPDATE runs SET status=?, completed_at=?, duration_ms=?, tokens_used=?, cost_usd=?, result_data=?, updated_at=datetime('now') WHERE id=?`,
        [runResult.status || 'completed', runResult.completedAt || new Date().toISOString(), durationMs, tokensUsed, costUsd, resultData, runId]
      );
      run(
        `UPDATE agents SET status='idle', total_runs=total_runs+1, last_run_at=datetime('now'), updated_at=datetime('now') WHERE id=?`,
        [agent.id]
      );

      // CFO agent post-processing: save LLM output as drafts
      try {
        if (agent.id.includes('cfo-content') && outputText) {
          let p = null;
          try { p = JSON.parse(outputText); } catch {
            const m = outputText.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (m) try { p = JSON.parse(m[1]); } catch {}
          }
          if (p?.content_markdown) {
            run(`INSERT INTO cfo_content_pieces (pillar, channel, title, content_markdown, cta, status) VALUES (?, ?, ?, ?, ?, 'draft')`,
              [p.pillar || 'general', p.channel || 'linkedin', p.title || 'Untitled', p.content_markdown, p.cta || '']);
          }
        }
        if (agent.id.includes('cfo-outreach') && outputText) {
          let p = null;
          try { p = JSON.parse(outputText); } catch {
            const m = outputText.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (m) try { p = JSON.parse(m[1]); } catch {}
          }
          if (p?.email_body) {
            let leadId = null;
            try { leadId = JSON.parse(message)?.lead_id || null; } catch {}
            run(`INSERT INTO cfo_outreach_sequences (lead_id, sequence_type, email_subject, email_body, pilot_offer, status) VALUES (?, 'blitz', ?, ?, ?, 'draft')`,
              [leadId, p.email_subject || 'Outreach', p.email_body, p.pilot_offer || null]);
          }
        }
      } catch (saveErr) {
        console.warn('[Runs] CFO post-processing (non-fatal):', saveErr.message);
      }

      // WebSocket events
      try {
        if (io) io.emit('run:completed', { runId, agentId: agent.id, status: 'completed', cost: costUsd, duration: durationMs });
      } catch {}

      res.json({
        message: `Agent "${agent.name}" completed`,
        run: { id: runId, status: 'completed', duration_ms: durationMs, tokens_used: tokensUsed, cost_usd: costUsd, outputText },
      });
    } catch (error) {
      const isTimeout = error.message.includes('timed out');
      markRunFailed(runId, agent.id, error.message);
      try {
        if (io) {
          io.emit('run:log', { runId, line: `Error: ${error.message}`, timestamp: new Date().toISOString() });
          io.emit('run:failed', { runId, agentId: agent.id, error: error.message, isTimeout });
        }
      } catch {}
      throw new AppError(`Agent failed: ${error.message}`, 'AGENT_EXECUTION_FAILED', 500);
    }
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/runs/:id/cancel
 */
router.post('/:id/cancel', validateParams(runIdParamSchema), (req, res, next) => {
  try {
    const runId = req.validated.params.id;
    const runData = get('SELECT * FROM runs WHERE id = ?', [runId]);
    if (!runData) throw new AppError(`Run not found.`, 'RUN_NOT_FOUND', 404);
    if (runData.status !== 'pending') {
      throw new AppError(`Cannot cancel — status is ${runData.status}.`, 'RUN_NOT_PENDING', 400);
    }
    run(`UPDATE runs SET status='cancelled', completed_at=datetime('now'), updated_at=datetime('now') WHERE id=?`, [runId]);
    res.json({ message: 'Run cancelled', id: runId, status: 'cancelled' });
  } catch (error) {
    next(error);
  }
});

// Export both router and handler registry
router.SPECIAL_HANDLERS = SPECIAL_HANDLERS;
module.exports = router;
