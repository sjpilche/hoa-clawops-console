/**
 * @file runs.js (routes)
 * @description Agent run management endpoints.
 * Mostly scaffolded for Phase 3 — the OpenClaw bridge will populate these.
 *
 * ENDPOINTS:
 *   GET  /api/runs              — List recent runs
 *   GET  /api/runs/:id          — Get run details
 *   GET  /api/runs/:id/status   — Poll run status (Phase 2.1)
 *   POST /api/runs/:id/confirm  — Confirm and execute pending run (Phase 2.1) ⭐
 *   POST /api/runs/:id/cancel   — Cancel pending run (Phase 2.1)
 *   POST /api/runs/:id/stop     — Stop a running agent (Phase 3)
 */

const { Router } = require('express');
const { v4: uuidv4 } = require('uuid');
const { all, get, run } = require('../db/connection');
const { authenticate } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { validateParams, validateQuery } = require('../middleware/validator');
const campaignMetrics = require('../services/campaignMetrics');
const { runIdParamSchema, listRunsQuerySchema } = require('../schemas');

const router = Router();
router.use(authenticate);

/**
 * GET /api/runs?limit=50&agent_id=xxx&status=running
 * List recent runs with optional filtering
 */
router.get('/', validateQuery(listRunsQuerySchema), (req, res, next) => {
  try {
    const { limit, offset, agent_id, status, start_date, end_date } = req.validated.query;

    let query = 'SELECT runs.*, agents.name AS agent_name FROM runs LEFT JOIN agents ON runs.agent_id = agents.id WHERE 1=1';
    const params = [];

    // Apply filters
    if (agent_id) {
      query += ' AND runs.agent_id = ?';
      params.push(agent_id);
    }

    if (status) {
      query += ' AND runs.status = ?';
      params.push(status);
    }

    if (start_date) {
      query += ' AND runs.created_at >= ?';
      params.push(start_date);
    }

    if (end_date) {
      query += ' AND runs.created_at <= ?';
      params.push(end_date);
    }

    query += ' ORDER BY runs.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const runs = all(query, params);
    res.json({ runs, limit, offset });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/runs/:id
 * Get detailed information about a specific run
 */
router.get('/:id', validateParams(runIdParamSchema), (req, res, next) => {
  try {
    const runId = req.validated.params.id;
    const run = get('SELECT * FROM runs WHERE id = ?', [runId]);
    if (!run) {
      throw new AppError(`Run with ID "${runId}" not found.`, 'RUN_NOT_FOUND', 404);
    }
    res.json({ run });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/runs/:id/status
 * Poll the current status of a run (for pending runs awaiting confirmation).
 * Phase 2.1: Confirmation Gates
 */
router.get('/:id/status', validateParams(runIdParamSchema), (req, res, next) => {
  try {
    const runId = req.validated.params.id;
    const runData = get(
      'SELECT id, status, started_at, completed_at, duration_ms, error_msg FROM runs WHERE id = ?',
      [runId]
    );

    if (!runData) {
      throw new AppError(`Run with ID "${runId}" not found.`, 'RUN_NOT_FOUND', 404);
    }

    res.json({
      id: runData.id,
      status: runData.status,
      started_at: runData.started_at,
      completed_at: runData.completed_at,
      duration_ms: runData.duration_ms,
      error_msg: runData.error_msg,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/runs/:id/confirm
 * =============================
 * PHASE 2.1: CONFIRMATION GATE ⭐
 * =============================
 *
 * Confirms and executes a pending run.
 * This is the human-in-the-loop gate - no agent can run without confirmation.
 *
 * Flow:
 * 1. POST /api/agents/:id/run → creates pending run record
 * 2. Client displays ConfirmationDialog with cost estimate, permissions, domains
 * 3. User confirms → POST /api/runs/:id/confirm
 * 4. This endpoint executes the agent and updates run status
 */
router.post('/:id/confirm', validateParams(runIdParamSchema), async (req, res, next) => {
  try {
    const runId = req.validated.params.id;
    const userId = req.user.id;

    // 1. Fetch the pending run
    const runData = get('SELECT * FROM runs WHERE id = ?', [runId]);
    if (!runData) {
      throw new AppError(`Run with ID "${runId}" not found.`, 'RUN_NOT_FOUND', 404);
    }

    // 2. Verify status is 'pending'
    if (runData.status !== 'pending') {
      throw new AppError(
        `Run is not pending. Current status: ${runData.status}. Only pending runs can be confirmed.`,
        'RUN_NOT_PENDING',
        400
      );
    }

    // 3. Get the agent details
    const agent = get('SELECT * FROM agents WHERE id = ?', [runData.agent_id]);
    if (!agent) {
      throw new AppError(`Agent for this run not found.`, 'AGENT_NOT_FOUND', 404);
    }

    // 4. Parse the result_data to get the original message
    let message = 'Run agent';
    let sessionId = null;
    let jsonOutput = true;
    try {
      const resultData = JSON.parse(runData.result_data || '{}');
      message = resultData.message || message;
      sessionId = resultData.sessionId;
      jsonOutput = resultData.json !== false;
    } catch {
      // Use defaults
    }

    // 5. Update run status to 'running' and record confirmation
    run(
      `UPDATE runs SET
        status = 'running',
        confirmed_by = ?,
        confirmed_at = datetime('now'),
        started_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = ?`,
      [userId, runId]
    );

    // 6. Execute the agent via OpenClaw (or special handler)
    const useMock = process.env.USE_MOCK_OPENCLAW === 'true';
    const openclawBridge = useMock
      ? require('../services/mockOpenClaw')
      : require('../services/openclawBridge');
    const agentConfig = agent.config ? JSON.parse(agent.config) : {};

    // ── Special handler: github_publisher ──────────────────────────────────
    // Agents with special_handler: 'github_publisher' run deterministic Node.js
    // code instead of an LLM. They publish blog posts to GitHub via API.
    if (agentConfig.special_handler === 'github_publisher') {
      try {
        const { publishPost } = require('../services/githubPublisher');
        const startTime = Date.now();
        console.log(`[Runs] Agent "${agent.name}" using github_publisher handler`);

        const summary = await publishPost(message);
        const durationMs = Date.now() - startTime;

        const finalResultData = JSON.stringify({
          sessionId: runId,
          message,
          output: null,
          outputText: summary,
        });

        run(
          `UPDATE runs SET
            status = 'completed',
            completed_at = datetime('now'),
            duration_ms = ?,
            tokens_used = 0,
            cost_usd = 0,
            result_data = ?,
            updated_at = datetime('now')
          WHERE id = ?`,
          [durationMs, finalResultData, runId]
        );

        run(
          `UPDATE agents SET
            status = 'idle',
            total_runs = total_runs + 1,
            last_run_at = datetime('now'),
            updated_at = datetime('now')
          WHERE id = ?`,
          [agent.id]
        );

        return res.json({
          success: true,
          run: {
            id: runId,
            status: 'completed',
            outputText: summary,
            cost_usd: 0,
            duration_ms: durationMs,
          },
        });
      } catch (publishError) {
        console.error('[Runs] GitHub publisher error:', publishError.message);
        run(
          `UPDATE runs SET status = 'failed', error_msg = ?, completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
          [publishError.message, runId]
        );
        run(`UPDATE agents SET status = 'idle', updated_at = datetime('now') WHERE id = ?`, [agent.id]);
        throw new AppError(`Publisher failed: ${publishError.message}`, 'PUBLISHER_ERROR', 500);
      }
    }
    // ── END special handler ────────────────────────────────────────────────

    // ── Special handler: hoa_contact_scraper ────────────────────────────────
    // Agents with special_handler: 'hoa_contact_scraper' run web scraping
    // to find HOA contact information from public sources.
    if (agentConfig.special_handler === 'hoa_contact_scraper') {
      try {
        const { searchHOAContacts } = require('../services/hoaContactScraper');
        const startTime = Date.now();
        console.log(`[Runs] Agent "${agent.name}" using hoa_contact_scraper handler`);

        // Parse search parameters from message
        let searchParams = {};
        try {
          // Try to parse as JSON first
          searchParams = JSON.parse(message);
        } catch {
          // Fallback: extract city from plain text message
          const cityMatch = message.match(/city[:\s]+([a-zA-Z\s]+?)(?:\s*,|\s*$)/i);
          const stateMatch = message.match(/state[:\s]+([A-Z]{2})/i);
          const zipMatch = message.match(/zip[:\s]+(\d{5})/i);

          if (cityMatch) searchParams.city = cityMatch[1].trim();
          if (stateMatch) searchParams.state = stateMatch[1];
          if (zipMatch) searchParams.zip_code = zipMatch[1];
        }

        if (!searchParams.city) {
          throw new Error('Search parameters must include a city. Example: {"city":"San Diego","state":"CA"}');
        }

        const result = await searchHOAContacts(searchParams);
        const durationMs = Date.now() - startTime;

        const summary = `✅ HOA CONTACT SEARCH COMPLETE
==========================================
Location: ${result.params.city}, ${result.params.state}${result.params.zip_code ? ` ${result.params.zip_code}` : ''}

RESULTS:
  Total Found:       ${result.results.total_found}
  New Contacts:      ${result.results.new_contacts}
  Duplicates Skipped: ${result.results.duplicates_skipped}

Search ID: ${result.search_id}
Duration: ${(durationMs / 1000).toFixed(2)}s

View contacts at: /hoa-leads`;

        const finalResultData = JSON.stringify({
          sessionId: runId,
          message,
          output: null,
          outputText: summary,
          searchResult: result,
        });

        run(
          `UPDATE runs SET
            status = 'completed',
            completed_at = datetime('now'),
            duration_ms = ?,
            tokens_used = 0,
            cost_usd = 0,
            result_data = ?,
            updated_at = datetime('now')
          WHERE id = ?`,
          [durationMs, finalResultData, runId]
        );

        run(
          `UPDATE agents SET
            status = 'idle',
            total_runs = total_runs + 1,
            last_run_at = datetime('now'),
            updated_at = datetime('now')
          WHERE id = ?`,
          [agent.id]
        );

        return res.json({
          success: true,
          run: {
            id: runId,
            status: 'completed',
            outputText: summary,
            cost_usd: 0,
            duration_ms: durationMs,
            searchResult: result,
          },
        });
      } catch (scraperError) {
        console.error('[Runs] HOA contact scraper error:', scraperError.message);
        run(
          `UPDATE runs SET status = 'failed', error_msg = ?, completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
          [scraperError.message, runId]
        );
        run(`UPDATE agents SET status = 'idle', updated_at = datetime('now') WHERE id = ?`, [agent.id]);
        throw new AppError(`Scraper failed: ${scraperError.message}`, 'SCRAPER_ERROR', 500);
      }
    }
    // ── END special handler: hoa_contact_scraper ────────────────────────────

    // ── Special handler: hoa_discovery ──────────────────────────────────────
    // Agent 1: HOA Google Maps Discovery - Scrapes Google Maps by geo-target
    // Zero-cost Playwright scraping (no paid APIs, no LLM)
    if (agentConfig.special_handler === 'hoa_discovery') {
      try {
        const { processGeoTarget, processMultipleGeoTargets } = require('../services/googleMapsDiscovery');
        const startTime = Date.now();
        console.log(`[Runs] Agent "${agent.name}" using hoa_discovery (Google Maps) handler`);

        // Parse parameters from message
        let params = {};
        try {
          params = JSON.parse(message);
        } catch {
          // Parse from plain text: "geo_target: south-florida", "limit: 2"
          const geoMatch = message.match(/geo[_-]?target[:\s]+([a-z-]+)/i);
          const limitMatch = message.match(/limit[:\s]+(\d+)/i);
          if (geoMatch) params.geoTargetId = geoMatch[1];
          if (limitMatch) params.limit = parseInt(limitMatch[1]);
        }

        const defaults = agentConfig.default_params || {};
        const geoTargetId = params.geoTargetId || params.geo_target_id || defaults.geo_target_id || null;
        const limit = params.limit || defaults.limit || 1;

        console.log('[Runs] Discovery params:', { geoTargetId, limit });

        // Run discovery
        let result;
        if (geoTargetId) {
          result = await processGeoTarget(geoTargetId);
        } else {
          result = await processMultipleGeoTargets({ limit });
        }

        const durationMs = Date.now() - startTime;

        // Build summary text
        const topTarget = result.geo_target || (result.results && result.results[0]?.geo_target) || 'Unknown';
        const totalNew = result.new_communities || result.total_new_communities || 0;
        const totalFound = result.results_found || result.total_results_found || 0;
        const summary = `✅ HOA GOOGLE MAPS DISCOVERY COMPLETE
==========================================
Geo-Target:  ${topTarget}
Queries Run: ${result.queries_run || 0}

RESULTS:
  Google Maps Results: ${totalFound}
  New Communities:     ${totalNew}
  Updated:             ${result.updated_communities || 0}
  Mgmt Companies:      ${result.management_companies || 0}
  Skipped:             ${result.skipped || 0}

Duration: ${(durationMs / 1000).toFixed(2)}s
Cost:     $0.00
Database: hoa_leads.sqlite

Pipeline flags set for each new community:
  ✓ needs_review_scan = 1   → Agent 5 (Google Reviews Monitor)
  ✓ needs_website_scrape = 1
  ✓ needs_contact_enrichment = 1
  ✓ needs_minutes_scan = 1  → Agent 2 (Minutes Monitor)

Next steps:
  • Run Agent 2 (Minutes Monitor) to scan for capital signals
  • Run Agent 5 (Reviews Monitor) to score by Google reviews
  • View communities: SELECT * FROM hoa_communities WHERE source='google_maps';`;

        const finalResultData = JSON.stringify({
          sessionId: runId,
          message,
          output: null,
          outputText: summary,
          discoveryResult: result,
        });

        run(
          `UPDATE runs SET
            status = 'completed',
            completed_at = datetime('now'),
            duration_ms = ?,
            tokens_used = 0,
            cost_usd = 0,
            result_data = ?,
            updated_at = datetime('now')
          WHERE id = ?`,
          [durationMs, finalResultData, runId]
        );

        run(
          `UPDATE agents SET
            status = 'idle',
            total_runs = total_runs + 1,
            last_run_at = datetime('now'),
            updated_at = datetime('now')
          WHERE id = ?`,
          [agent.id]
        );

        return res.json({
          success: true,
          run: {
            id: runId,
            status: 'completed',
            outputText: summary,
            cost_usd: 0,
            duration_ms: durationMs,
            discoveryResult: result,
          },
        });
      } catch (discoveryError) {
        console.error('[Runs] HOA discovery error:', discoveryError.message);
        run(
          `UPDATE runs SET status = 'failed', error_msg = ?, completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
          [discoveryError.message, runId]
        );
        run(`UPDATE agents SET status = 'idle', updated_at = datetime('now') WHERE id = ?`, [agent.id]);
        throw new AppError(`Discovery failed: ${discoveryError.message}`, 'DISCOVERY_ERROR', 500);
      }
    }
    // ── END special handler: hoa_discovery ──────────────────────────────────

    // ── Special handler: hoa_minutes_monitor ────────────────────────────────
    // Agent 2: Minutes Monitor - Scans meeting minutes and scores for capital signals
    if (agentConfig.special_handler === 'hoa_minutes_monitor') {
      try {
        const { scanMultipleHOAs } = require('../services/hoaMinutesMonitor');
        const startTime = Date.now();
        console.log(`[Runs] Agent "${agent.name}" using hoa_minutes_monitor handler`);

        // Parse scan parameters from message
        let scanParams = {};
        try {
          scanParams = JSON.parse(message);
        } catch {
          const limitMatch = message.match(/limit[:\s]+(\d+)/i);
          const stateMatch = message.match(/state[:\s]+([A-Z]{2})/i);
          const priorityMatch = message.match(/priority[:\s]+(\d+)/i);

          if (limitMatch) scanParams.limit = parseInt(limitMatch[1]);
          if (stateMatch) scanParams.state = stateMatch[1];
          if (priorityMatch) scanParams.priority_min = parseInt(priorityMatch[1]);
        }

        // Apply defaults
        const defaults = agentConfig.default_params || {};
        scanParams = {
          limit: scanParams.limit || defaults.limit || 20,
          state: scanParams.state || defaults.state || null,
          priority_min: scanParams.priority_min || defaults.priority_min || 5
        };

        console.log('[Runs] Scan params:', scanParams);

        const result = await scanMultipleHOAs(scanParams);
        const durationMs = Date.now() - startTime;

        const summary = `✅ HOA MINUTES SCAN COMPLETE
==========================================
Scanned: ${result.scanned_count} HOAs
State: ${scanParams.state || 'All states'}
Priority min: ${scanParams.priority_min}

RESULTS:
  🔥 HOT leads:     ${result.hot_count}
  🟡 WARM leads:    ${result.warm_count}
  🟢 WATCH leads:   ${result.watch_count}
  ⚪ ARCHIVE:       ${result.archive_count}

Duration: ${(durationMs / 1000).toFixed(2)}s
Database: hoa_leads.sqlite

Next steps:
  • ${result.hot_count + result.warm_count} leads ready for Agent 3 (Contact Enricher)
  • View leads: SELECT * FROM scored_leads ORDER BY score DESC;
  • View HOT leads: SELECT * FROM hot_leads_dashboard;`;

        const finalResultData = JSON.stringify({
          sessionId: runId,
          message,
          output: null,
          outputText: summary,
          scanResult: result,
        });

        run(
          `UPDATE runs SET
            status = 'completed',
            completed_at = datetime('now'),
            duration_ms = ?,
            tokens_used = 0,
            cost_usd = 0,
            result_data = ?,
            updated_at = datetime('now')
          WHERE id = ?`,
          [durationMs, finalResultData, runId]
        );

        run(
          `UPDATE agents SET
            status = 'idle',
            total_runs = total_runs + 1,
            last_run_at = datetime('now'),
            updated_at = datetime('now')
          WHERE id = ?`,
          [agent.id]
        );

        return res.json({
          success: true,
          run: {
            id: runId,
            status: 'completed',
            outputText: summary,
            cost_usd: 0,
            duration_ms: durationMs,
            scanResult: result,
          },
        });
      } catch (scanError) {
        console.error('[Runs] Minutes scan error:', scanError.message);
        run(
          `UPDATE runs SET status = 'failed', error_msg = ?, completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
          [scanError.message, runId]
        );
        run(`UPDATE agents SET status = 'idle', updated_at = datetime('now') WHERE id = ?`, [agent.id]);
        throw new AppError(`Minutes scan failed: ${scanError.message}`, 'SCAN_ERROR', 500);
      }
    }
    // ── END special handler: hoa_minutes_monitor ────────────────────────────

    // ── Special handler: hoa_contact_enricher ───────────────────────────────
    // Agent 3: Contact Enricher - Zero-cost email enrichment for HOT/WARM leads
    if (agentConfig.special_handler === 'hoa_contact_enricher') {
      try {
        const { enrichMultipleLeads } = require('../services/hoaContactEnricher');
        const startTime = Date.now();
        console.log(`[Runs] Agent "${agent.name}" using hoa_contact_enricher handler`);

        // Parse enrichment parameters from message
        let enrichParams = {};
        try {
          enrichParams = JSON.parse(message);
        } catch {
          const limitMatch = message.match(/limit[:\s]+(\d+)/i);
          const tierMatch = message.match(/tier[:\s]+(HOT|WARM|WATCH)/i);

          if (limitMatch) enrichParams.limit = parseInt(limitMatch[1]);
          if (tierMatch) enrichParams.tier = tierMatch[1];
        }

        // Apply defaults
        const defaults = agentConfig.default_params || {};
        enrichParams = {
          limit: enrichParams.limit || defaults.limit || 10,
          tier: enrichParams.tier || defaults.tier || null
        };

        console.log('[Runs] Enrichment params:', enrichParams);

        const result = await enrichMultipleLeads(enrichParams);
        const durationMs = Date.now() - startTime;

        const summary = `✅ CONTACT ENRICHMENT COMPLETE
==========================================
Total enriched: ${result.enriched_count}
Success: ${result.success_count}
Failed: ${result.failed_count}
Success rate: ${result.enriched_count > 0 ? Math.round((result.success_count / result.enriched_count) * 100) : 0}%

Tier filter: ${enrichParams.tier || 'All tiers (HOT, WARM)'}

Duration: ${(durationMs / 1000).toFixed(2)}s
Database: hoa_leads.sqlite
Cost: $0 (zero-cost enrichment!)

Next steps:
  • ${result.success_count} leads ready for Agent 4 (Outreach Drafter)
  • View contacts: SELECT * FROM contacts ORDER BY created_at DESC;
  • View enrichment status: SELECT * FROM scored_leads WHERE contact_enrichment_status = 'complete';`;

        const finalResultData = JSON.stringify({
          sessionId: runId,
          message,
          output: null,
          outputText: summary,
          enrichResult: result,
        });

        run(
          `UPDATE runs SET
            status = 'completed',
            completed_at = datetime('now'),
            duration_ms = ?,
            tokens_used = 0,
            cost_usd = 0,
            result_data = ?,
            updated_at = datetime('now')
          WHERE id = ?`,
          [durationMs, finalResultData, runId]
        );

        run(
          `UPDATE agents SET
            status = 'idle',
            total_runs = total_runs + 1,
            last_run_at = datetime('now'),
            updated_at = datetime('now')
          WHERE id = ?`,
          [agent.id]
        );

        return res.json({
          success: true,
          run: {
            id: runId,
            status: 'completed',
            outputText: summary,
            cost_usd: 0,
            duration_ms: durationMs,
            enrichResult: result,
          },
        });
      } catch (enrichError) {
        console.error('[Runs] Contact enrichment error:', enrichError.message);
        run(
          `UPDATE runs SET status = 'failed', error_msg = ?, completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
          [enrichError.message, runId]
        );
        run(`UPDATE agents SET status = 'idle', updated_at = datetime('now') WHERE id = ?`, [agent.id]);
        throw new AppError(`Contact enrichment failed: ${enrichError.message}`, 'ENRICHMENT_ERROR', 500);
      }
    }
    // ── END special handler: hoa_contact_enricher ───────────────────────────

    // ── Special handler: hoa_outreach_drafter ───────────────────────────────
    // Agent 4: Outreach Drafter - Generates personalized email sequences for enriched leads
    if (agentConfig.special_handler === 'hoa_outreach_drafter') {
      try {
        const { draftMultipleOutreach } = require('../services/hoaOutreachDrafter');
        const startTime = Date.now();
        console.log(`[Runs] Agent "${agent.name}" using hoa_outreach_drafter handler`);

        // Parse drafting parameters from message
        let draftParams = {};
        try {
          draftParams = JSON.parse(message);
        } catch {
          const limitMatch = message.match(/limit[:\s]+(\d+)/i);
          const tierMatch = message.match(/tier[:\s]+(HOT|WARM|WATCH)/i);

          if (limitMatch) draftParams.limit = parseInt(limitMatch[1]);
          if (tierMatch) draftParams.tier = tierMatch[1];
        }

        // Apply defaults
        const defaults = agentConfig.default_params || {};
        draftParams = {
          limit: draftParams.limit || defaults.limit || 10,
          tier: draftParams.tier || defaults.tier || null
        };

        console.log('[Runs] Drafting params:', draftParams);

        const result = await draftMultipleOutreach(draftParams);
        const durationMs = Date.now() - startTime;

        const summary = `✅ OUTREACH DRAFTING COMPLETE
==========================================
Total drafted: ${result.drafted_count}
Success: ${result.success_count}
Failed: ${result.failed_count}
Success rate: ${result.drafted_count > 0 ? Math.round((result.success_count / result.drafted_count) * 100) : 0}%

Tier filter: ${draftParams.tier || 'All tiers (HOT, WARM)'}
Emails per lead: 3 (initial + 2 follow-ups)
Total emails drafted: ${result.success_count * 3}

Duration: ${(durationMs / 1000).toFixed(2)}s
Database: hoa_leads.sqlite
Cost: $0 (template mode)

Next steps:
  • Review ${result.success_count} email sequences in /hoa-outreach-queue page
  • Approve or edit drafts
  • Send approved outreach emails`;

        const finalResultData = JSON.stringify({
          sessionId: runId,
          message,
          output: null,
          outputText: summary,
          draftResult: result,
        });

        run(
          `UPDATE runs SET
            status = 'completed',
            completed_at = datetime('now'),
            duration_ms = ?,
            tokens_used = 0,
            cost_usd = 0,
            result_data = ?,
            updated_at = datetime('now')
          WHERE id = ?`,
          [durationMs, finalResultData, runId]
        );

        run(
          `UPDATE agents SET
            status = 'idle',
            total_runs = total_runs + 1,
            last_run_at = datetime('now'),
            updated_at = datetime('now')
          WHERE id = ?`,
          [agent.id]
        );

        return res.json({
          success: true,
          run: {
            id: runId,
            status: 'completed',
            outputText: summary,
            cost_usd: 0,
            duration_ms: durationMs,
            draftResult: result,
          },
        });
      } catch (draftError) {
        console.error('[Runs] Outreach drafting error:', draftError.message);
        run(
          `UPDATE runs SET status = 'failed', error_msg = ?, completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
          [draftError.message, runId]
        );
        run(`UPDATE agents SET status = 'idle', updated_at = datetime('now') WHERE id = ?`, [agent.id]);
        throw new AppError(`Outreach drafting failed: ${draftError.message}`, 'DRAFTING_ERROR', 500);
      }
    }
    // ── END special handler: hoa_outreach_drafter ───────────────────────────

    // ── Special handler: google_reviews_monitor ─────────────────────────────
    // Agent 5: Google Reviews Monitor - Monitors Google Maps reviews for capital signals
    if (agentConfig.special_handler === 'google_reviews_monitor') {
      try {
        const { monitorMultipleHOAs } = require('../services/googleReviewsMonitor');
        const startTime = Date.now();
        console.log(`[Runs] Agent "${agent.name}" using google_reviews_monitor handler`);

        // Parse monitoring parameters from message
        let monitorParams = {};
        try {
          monitorParams = JSON.parse(message);
        } catch {
          const limitMatch = message.match(/limit[:\s]+(\d+)/i);
          const tierMatch = message.match(/tier[:\s]+(HOT|WARM|MONITOR|COLD)/i);

          if (limitMatch) monitorParams.limit = parseInt(limitMatch[1]);
          if (tierMatch) monitorParams.tier = tierMatch[1];
        }

        // Apply defaults
        const defaults = agentConfig.default_params || {};
        monitorParams = {
          limit: monitorParams.limit || defaults.limit || 10,
          tier: monitorParams.tier || defaults.tier || null
        };

        console.log('[Runs] Monitoring params:', monitorParams);

        const result = await monitorMultipleHOAs(monitorParams);
        const durationMs = Date.now() - startTime;

        const summary = `✅ GOOGLE REVIEWS MONITORING COMPLETE
==========================================
Total monitored: ${result.monitored_count}
Success: ${result.success_count}
Failed: ${result.failed_count}
Tier upgrades: ${result.tier_upgrades}

Tier filter: ${monitorParams.tier || 'All tiers'}

Duration: ${(durationMs / 1000).toFixed(2)}s
Database: hoa_leads.sqlite
Cost: $0 (FREE!)

Next steps:
  • ${result.tier_upgrades} HOAs upgraded to HOT/WARM
  • Run Agent 3 (Contact Enricher) for HOT leads
  • View results: SELECT * FROM hoa_communities WHERE google_signal_tier = 'HOT';`;

        const finalResultData = JSON.stringify({
          sessionId: runId,
          message,
          output: null,
          outputText: summary,
          monitorResult: result,
        });

        run(
          `UPDATE runs SET
            status = 'completed',
            completed_at = datetime('now'),
            duration_ms = ?,
            tokens_used = 0,
            cost_usd = 0,
            result_data = ?,
            updated_at = datetime('now')
          WHERE id = ?`,
          [durationMs, finalResultData, runId]
        );

        run(
          `UPDATE agents SET
            status = 'idle',
            total_runs = total_runs + 1,
            last_run_at = datetime('now'),
            updated_at = datetime('now')
          WHERE id = ?`,
          [agent.id]
        );

        return res.json({
          success: true,
          run: {
            id: runId,
            status: 'completed',
            outputText: summary,
            cost_usd: 0,
            duration_ms: durationMs,
            monitorResult: result,
          },
        });
      } catch (monitorError) {
        console.error('[Runs] Google Reviews monitoring error:', monitorError.message);
        run(
          `UPDATE runs SET status = 'failed', error_msg = ?, completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
          [monitorError.message, runId]
        );
        run(`UPDATE agents SET status = 'idle', updated_at = datetime('now') WHERE id = ?`, [agent.id]);
        throw new AppError(`Google Reviews monitoring failed: ${monitorError.message}`, 'MONITORING_ERROR', 500);
      }
    }
    // ── END special handler: google_reviews_monitor ─────────────────────────

    if (!agentConfig.openclaw_id) {
      // Mark run as failed
      run(
        `UPDATE runs SET status = 'failed', error_msg = ?, completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
        ['Agent not registered with OpenClaw', runId]
      );
      throw new AppError(
        `Agent "${agent.name}" is not registered with OpenClaw.`,
        'AGENT_NOT_REGISTERED',
        400
      );
    }

    const openclawId = agentConfig.openclaw_id;

    try {
      const runResult = await openclawBridge.runAgent(agent.id, {
        openclawId,
        message,
        sessionId,
        json: jsonOutput,
      });

      // 7. Extract metrics from OpenClaw output
      // Claude Code CLI returns JSON format: { type, result, total_cost_usd, usage, modelUsage, ... }
      let durationMs = null;
      let tokensUsed = 0;
      let costUsd = 0;
      let outputText = '';
      try {
        const parsed = JSON.parse(runResult.output || '{}');

        // Claude Code CLI format
        if (parsed.type === 'result') {
          outputText = parsed.result || '';
          durationMs = parsed.duration_ms || null;
          costUsd = parsed.total_cost_usd || 0;

          // Calculate total tokens from usage
          const usage = parsed.usage || {};
          tokensUsed = (usage.input_tokens || 0) +
                       (usage.output_tokens || 0) +
                       (usage.cache_read_input_tokens || 0) +
                       (usage.cache_creation_input_tokens || 0);
        }
        // Legacy format (if still using old OpenClaw)
        else if (parsed.meta) {
          if (parsed.meta?.durationMs) durationMs = parsed.meta.durationMs;
          if (parsed.meta?.agentMeta?.usage?.total) tokensUsed = parsed.meta.agentMeta.usage.total;
          const usage = parsed.meta?.agentMeta?.usage || {};
          costUsd = (usage.input || 0) * 0.00000015 + (usage.output || 0) * 0.0000006;
          if (parsed.payloads?.[0]?.text) outputText = parsed.payloads[0].text;
        }
      } catch {
        outputText = runResult.output || '';
      }

      const finalResultData = JSON.stringify({
        sessionId: runResult.sessionId,
        message,
        output: runResult.output || null,
        outputText,
      });

      // 8. Update run record with results
      run(
        `UPDATE runs SET
          status = ?,
          completed_at = ?,
          duration_ms = ?,
          tokens_used = ?,
          cost_usd = ?,
          result_data = ?,
          updated_at = datetime('now')
        WHERE id = ?`,
        [
          runResult.status || 'success',
          runResult.completedAt || new Date().toISOString(),
          durationMs,
          tokensUsed,
          costUsd,
          finalResultData,
          runId,
        ]
      );

      // 9. Update agent stats
      run(
        `UPDATE agents SET
          status = 'idle',
          total_runs = total_runs + 1,
          last_run_at = datetime('now'),
          updated_at = datetime('now')
        WHERE id = ?`,
        [agent.id]
      );

      // 10. Emit WebSocket event (if available)
      try {
        const io = req.app.get('io');
        if (io) {
          io.emit('run:completed', {
            runId,
            agentId: agent.id,
            status: runResult.status || 'success',
            cost: costUsd,
            duration: durationMs,
          });
        }
      } catch {
        // WebSocket not available, skip
      }

      // 11. Return success response
      res.json({
        message: `Agent "${agent.name}" completed successfully`,
        run: {
          id: runId,
          status: runResult.status || 'success',
          duration_ms: durationMs,
          tokens_used: tokensUsed,
          cost_usd: costUsd,
          outputText,
        },
      });
    } catch (error) {
      // Execution failed - update run status
      run(
        `UPDATE runs SET
          status = 'failed',
          error_msg = ?,
          completed_at = datetime('now'),
          updated_at = datetime('now')
        WHERE id = ?`,
        [error.message, runId]
      );

      throw new AppError(`Agent execution failed: ${error.message}`, 'AGENT_EXECUTION_FAILED', 500);
    }
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/runs/:id/cancel
 * Cancel a pending run before it starts.
 * Phase 2.1: Confirmation Gates
 */
router.post('/:id/cancel', validateParams(runIdParamSchema), (req, res, next) => {
  try {
    const runId = req.validated.params.id;

    const runData = get('SELECT * FROM runs WHERE id = ?', [runId]);
    if (!runData) {
      throw new AppError(`Run with ID "${runId}" not found.`, 'RUN_NOT_FOUND', 404);
    }

    if (runData.status !== 'pending') {
      throw new AppError(
        `Cannot cancel run - current status: ${runData.status}. Only pending runs can be cancelled.`,
        'RUN_NOT_PENDING',
        400
      );
    }

    run(
      `UPDATE runs SET status = 'cancelled', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      [runId]
    );

    res.json({
      message: 'Run cancelled successfully',
      id: runId,
      status: 'cancelled',
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
