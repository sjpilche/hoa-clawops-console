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

  jake_lead_scout: async ({ message, runId, agent }) => {
    // LLM-powered national lead scout with market rotation.
    // Saves leads with OR without email — enricher finds emails afterward.
    const { getNextRunMessage, markMarketScouted } = require('../services/jakeLeadRotation');
    const openclawBridge = require('../services/openclawBridge');
    const startTime = Date.now();

    // Build rotation-aware message (or use explicit region override)
    const params = parseMessageParams(message);
    const runMsg = params.region
      ? { region: params.region, trade: params.trade || 'GC', limit: params.limit || 8 }
      : getNextRunMessage(params);

    const marketIndex = runMsg._market_index;
    delete runMsg._market_index;

    console.log(`[jake_lead_scout] Scouting market: ${runMsg.region}`);

    // Run the LLM agent via OpenClaw
    const result = await openclawBridge.runAgent('jake-lead-scout', {
      openclawId: 'jake-lead-scout',
      message: JSON.stringify(runMsg),
      sessionId: `jake-scout-${new Date().toISOString().slice(0,10)}-${runId.slice(0,6)}`,
    });

    const parsed = openclawBridge.constructor.parseOutput(result.output);
    const durationMs = Date.now() - startTime;
    const rawOutput = parsed.text || result.output || '';

    console.log(`[jake_lead_scout] Raw output length: ${rawOutput.length} chars`);

    // ── Parse JSON from agent output (multiple fallback strategies) ──
    let data = null;

    // Strip markdown code fences (```json ... ```)
    let cleaned = rawOutput
      .replace(/^```(?:json)?\s*/m, '')
      .replace(/\s*```\s*$/m, '')
      .trim();

    // Find the first `{` — skip any prose before it
    const firstBrace = cleaned.indexOf('{');
    if (firstBrace > 0) {
      console.log(`[jake_lead_scout] Skipping ${firstBrace} chars of prose before JSON`);
      cleaned = cleaned.slice(firstBrace);
    }

    // Strategy 1: direct parse of cleaned output
    try { data = JSON.parse(cleaned); } catch {}

    // Strategy 2: find the largest JSON object containing "leads"
    if (!data) {
      const m = cleaned.match(/\{[\s\S]*"leads"[\s\S]*\}/);
      if (m) try { data = JSON.parse(m[0]); } catch {}
    }

    // Strategy 3: extract just the leads array
    if (!data) {
      const m = cleaned.match(/"leads"\s*:\s*(\[[\s\S]*?\])/);
      if (m) try { data = { leads: JSON.parse(m[1]) }; } catch {}
    }

    if (!data) {
      console.warn(`[jake_lead_scout] Could not parse JSON from output. First 500 chars: ${rawOutput.slice(0, 500)}`);
    }

    // ── Insert leads into DB ──
    let leadsInserted = 0;
    let leadsSkipped = 0;
    const leads = data?.leads || [];

    console.log(`[jake_lead_scout] Parsed ${leads.length} leads from agent output`);

    for (const lead of leads) {
      // Must have company name + contact name at minimum
      if (!lead.company_name || !lead.contact_name) {
        console.log(`[jake_lead_scout] Skipping lead — missing company or contact name`);
        leadsSkipped++;
        continue;
      }

      // Skip if score too low (20 minimum — basically just needs name+title)
      const score = lead.qualification_score || 0;
      if (score < 20) {
        console.log(`[jake_lead_scout] Skipping ${lead.company_name} — score ${score} < 20`);
        leadsSkipped++;
        continue;
      }

      // Dedup check by company name
      const existing = get('SELECT id FROM cfo_leads WHERE LOWER(company_name) = LOWER(?)', [lead.company_name]);
      if (existing) {
        console.log(`[jake_lead_scout] Dedup: ${lead.company_name} already in DB`);
        leadsSkipped++;
        continue;
      }

      // Clean up email — null if "unknown", empty, or fake
      const rawEmail = lead.contact_email;
      const email = (rawEmail && rawEmail !== 'unknown' && rawEmail !== 'null' && rawEmail.includes('@'))
        ? rawEmail : null;

      // Clean up LinkedIn URL
      const linkedin = (lead.contact_linkedin && lead.contact_linkedin !== 'null' && lead.contact_linkedin.includes('linkedin'))
        ? lead.contact_linkedin : null;

      // Enrichment status: enriched if has email, pending if only LinkedIn, failed if neither
      const enrichStatus = email ? 'enriched' : (linkedin ? 'partial' : 'pending');
      const enrichMethod = email ? (lead.contact_source || 'lead_scout') : (linkedin ? 'linkedin_profile' : null);

      // Parse "City, ST" location string
      let city = null, state = null;
      if (lead.location) {
        const parts = lead.location.split(',').map(s => s.trim());
        if (parts.length >= 2) { city = parts[0]; state = parts[parts.length - 1]; }
        else if (parts.length === 1) { city = parts[0]; }
      }

      const painText = Array.isArray(lead.pain_signals)
        ? lead.pain_signals.join('; ')
        : (lead.pain_signals || null);

      try {
        run(
          `INSERT INTO cfo_leads (
            company_name, revenue_range, contact_name, contact_title,
            contact_email, contact_linkedin, website, employee_count, erp_type,
            pilot_fit_score, pilot_fit_reason, state, city,
            enrichment_status, enrichment_method, phone,
            source, source_agent, status, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'lead_scout', 'jake', 'new', ?)`,
          [
            lead.company_name,
            lead.estimated_revenue || null,
            lead.contact_name,
            lead.contact_title || null,
            email,
            linkedin,
            lead.website || null,
            lead.employee_count || null,
            lead.erp_system || 'unknown',
            score,
            painText,
            state,
            city,
            enrichStatus,
            enrichMethod,
            null,  // phone — enricher finds it
            lead.notes || null,
          ]
        );
        console.log(`[jake_lead_scout] Inserted: ${lead.company_name} | ${lead.contact_name} | email:${email || 'none'} | linkedin:${linkedin ? 'yes' : 'no'}`);
        leadsInserted++;
      } catch (insertErr) {
        console.error(`[jake_lead_scout] Insert failed for ${lead.company_name}:`, insertErr.message);
        leadsSkipped++;
      }
    }

    // Mark market as scouted in rotation tracker
    if (marketIndex !== undefined) markMarketScouted(marketIndex);

    const outputText = [
      `Jake Lead Scout: ${leadsInserted} new leads inserted, ${leadsSkipped} skipped (${runMsg.region})`,
      `  Market: ${runMsg.region} | Duration: ${(durationMs/1000).toFixed(1)}s | Cost: $${(parsed.costUsd||0).toFixed(4)}`,
      leadsInserted > 0 ? `  Leads need enrichment: run jake-contact-enricher next` : `  No new leads this run — market will rotate next time`,
    ].join('\n');

    return { outputText, durationMs, costUsd: parsed.costUsd || 0, tokensUsed: parsed.tokensUsed || 0, extra: { leadsInserted, leadsSkipped, region: runMsg.region } };
  },

  jake_contact_enricher: async ({ message, runId, agent }) => {
    const { enrichMultipleLeads } = require('../services/jakeContactEnricher');
    const brain = require('../services/collectiveBrain');
    const startTime = Date.now();
    const params = parseMessageParams(message);
    const result = await enrichMultipleLeads({
      limit: parseInt(params.limit) || 20,
      min_score: parseInt(params.min_score) || 0,
      status_filter: params.status_filter || 'pending',
      source: params.source || null,
    });
    const durationMs = Date.now() - startTime;
    const outputText = [
      `Contact Enricher: ${result.enriched}/${result.total} enriched in ${(durationMs / 1000).toFixed(1)}s`,
      ...result.results.slice(0, 10).map(r => `  ${r.company}: ${r.email || 'no email found'} (${r.method || 'failed'})`),
    ].join('\n');

    // ── Collective Brain Layer 1: write contact_found observations for outreach agent ──
    if (result.enriched > 0) {
      const today = new Date().toISOString().slice(0, 10);
      const enrichedLeads = result.results.filter(r => r.email);
      for (const r of enrichedLeads.slice(0, 20)) {
        // Use same session pattern as discovery so outreach agent can correlate
        const cityState = [r.city, r.state].filter(Boolean).join(', ');
        const region = cityState || 'Unknown market';
        const sessionId = `jake-pipeline-${region.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${today}`;
        brain.observe(sessionId, 'jake-contact-enricher', 'contact_found', {
          subject: r.company,
          content: `${r.company} (${region}): Contact found via ${r.method}. ` +
                   `Email: ${r.email}${r.contactName ? '. Name: ' + r.contactName : ''}${r.phone ? '. Phone: ' + r.phone : ''}.`,
          confidence: r.method === 'pattern_guess' ? 0.6 : 0.9,
          metadata: { email: r.email, name: r.contactName || null, method: r.method, company_id: r.id },
        });
      }
    }

    return { outputText, durationMs, extra: { enrichResult: result } };
  },

  jake_construction_discovery: async ({ message, runId, agent }) => {
    // Google Maps GC scraper — bulk company discovery, $0/run
    // Finds 50-150 construction companies per market; enricher finds contacts.
    const { runConstructionDiscovery } = require('../services/jakeConstructionDiscovery');
    const brain = require('../services/collectiveBrain');
    const startTime = Date.now();
    const params = parseMessageParams(message);

    const result = await runConstructionDiscovery({
      region: params.region || null,
      limit: parseInt(params.limit) || 100,
    });

    const durationMs = Date.now() - startTime;
    const outputText = [
      result.summary,
      `  Duration: ${(durationMs / 1000).toFixed(1)}s | Cost: $0.00`,
      result.stats.inserted > 0
        ? `  Run jake-contact-enricher next to find email + contact names`
        : `  No new companies — try a different region or market has been fully scraped`,
    ].join('\n');

    // ── Collective Brain Layer 1: write observations for downstream agents ──
    if (result.stats.inserted > 0 && result.leads) {
      const sessionId = `jake-pipeline-${result.region?.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${new Date().toISOString().slice(0,10)}`;
      // Market-level insight
      brain.observe(sessionId, 'jake-construction-discovery', 'market_insight', {
        subject: result.region,
        content: `Discovered ${result.stats.inserted} new GC companies in ${result.region}. ` +
                 `Total scraped: ${result.stats.total}. Top sources: Google Maps.`,
        confidence: 1.0,
        metadata: { region: result.region, inserted: result.stats.inserted, total: result.stats.total },
      });
      // Per-company lead signals (up to 20 most relevant)
      const topLeads = (result.leads || []).slice(0, 20);
      for (const lead of topLeads) {
        brain.observe(sessionId, 'jake-construction-discovery', 'lead_signal', {
          subject: lead.company_name,
          content: `${lead.company_name} — ${lead.city || result.region}. Found via Google Maps. Needs contact enrichment.`,
          confidence: 0.9,
          metadata: { company_id: lead.id, city: lead.city, phone: lead.phone || null },
        });
      }
    }

    return { outputText, durationMs, costUsd: 0, extra: { stats: result.stats, region: result.region } };
  },

  // ── Morning Pipeline Digest — posts yesterday's stats to Discord at 7 AM ──
  morning_digest: async ({ message, runId, agent }) => {
    const { get: dbGet } = require('../db/connection');
    const brain   = require('../services/collectiveBrain');
    const discord = require('../services/discordNotifier');
    const startTime = Date.now();

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    const leadsFound    = dbGet("SELECT COUNT(*) c FROM cfo_leads WHERE DATE(created_at)=?",                                        [yesterday])?.c || 0;
    const leadsEnriched = dbGet("SELECT COUNT(*) c FROM cfo_leads WHERE DATE(enriched_at)=?",                                       [yesterday])?.c || 0;
    const emailsDrafted = dbGet("SELECT COUNT(*) c FROM cfo_outreach_sequences WHERE DATE(created_at)=? AND status='draft'",        [yesterday])?.c || 0;
    const emailsSent    = dbGet("SELECT COUNT(*) c FROM cfo_outreach_sequences WHERE DATE(sent_at)=?",                              [yesterday])?.c || 0;
    const emailsReplied = dbGet("SELECT COUNT(*) c FROM cfo_outreach_sequences WHERE DATE(replied_at)=?",                           [yesterday])?.c || 0;
    const contentPieces = dbGet("SELECT COUNT(*) c FROM cfo_content_pieces WHERE DATE(created_at)=?",                              [yesterday])?.c || 0;
    const runCosts      = dbGet("SELECT COALESCE(SUM(cost_usd),0) total FROM runs WHERE DATE(created_at)=? AND status='completed'", [yesterday])?.total || 0;

    let brainStats = {};
    try { brainStats = await brain.getStats(); } catch {}

    const replyRate = emailsSent > 0 ? Math.round(emailsReplied / emailsSent * 100) : 0;

    await discord.postWebhook({
      embeds: [{
        title: `\u2600\ufe0f Morning Digest \u2014 ${yesterday}`,
        color: 0x5865f2,
        fields: [
          { name: '\ud83c\udfaf Pipeline',  value: `${leadsFound} found \u00b7 ${leadsEnriched} enriched \u00b7 ${emailsDrafted} drafted`, inline: false },
          { name: '\ud83d\udce7 Outreach',  value: `${emailsSent} sent \u00b7 ${emailsReplied} replied (${replyRate}% reply rate)`,        inline: false },
          { name: '\u270d\ufe0f Content',   value: `${contentPieces} pieces created`,                                                      inline: false },
          { name: '\ud83e\udde0 Brain',     value: `${brainStats.observations_7d || 0} obs this week \u00b7 ${brainStats.feedback_approved || 0} \u2705`, inline: false },
          { name: '\ud83d\udcb0 Cost',      value: `$${parseFloat(runCosts).toFixed(4)} yesterday`,                                        inline: false },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'ClawOps Console' },
      }]
    });

    const outputText = `Morning digest posted to Discord \u2014 ${yesterday}: ${leadsFound} leads, ${emailsSent} sent, ${replyRate}% reply rate`;
    return { outputText, durationMs: Date.now() - startTime, costUsd: 0 };
  },

  // ── Jake Follow-Up — generates follow-up drafts for contacted leads with no reply ──
  jake_follow_up: async ({ message, runId, agent }) => {
    const { all: dbAll } = require('../db/connection');
    const openclawBridge = require('../services/openclawBridge');
    const brain = require('../services/collectiveBrain');
    const startTime = Date.now();

    const params = parseMessageParams(message);
    const limit  = parseInt(params.limit) || 10;

    // Find sent leads with no reply after 5+ days and no existing follow-up draft
    const leads = dbAll(`
      SELECT l.id, l.company_name, l.contact_name, l.contact_title, l.erp_type, l.city, l.state,
             s.id AS seq_id, s.email_subject, s.sent_at
      FROM cfo_leads l
      JOIN cfo_outreach_sequences s ON s.lead_id = l.id
      WHERE l.status = 'contacted'
        AND s.status = 'sent'
        AND s.sequence_position = 1
        AND DATE(s.sent_at) <= DATE('now', '-5 days')
        AND NOT EXISTS (
          SELECT 1 FROM cfo_outreach_sequences s2
          WHERE s2.lead_id = l.id AND s2.sequence_position = 2
        )
      ORDER BY s.sent_at ASC
      LIMIT ?
    `, [limit]);

    if (leads.length === 0) {
      return { outputText: 'Jake Follow-Up: No leads due for follow-up (all replied or < 5 days since send)', durationMs: Date.now() - startTime };
    }

    let drafted = 0;
    let failed  = 0;
    for (const lead of leads) {
      try {
        const daysSince = Math.floor((Date.now() - new Date(lead.sent_at).getTime()) / 86400000);
        const msg = JSON.stringify({
          lead_id: lead.id,
          company_name: lead.company_name,
          contact_name: lead.contact_name,
          contact_title: lead.contact_title,
          original_subject: lead.email_subject,
          days_since_send: daysSince,
          erp_type: lead.erp_type,
          city: lead.city,
          state: lead.state,
        });

        const result = await openclawBridge.runAgent('jake-follow-up-agent', {
          openclawId: 'jake-follow-up-agent',
          message: msg,
          sessionId: `jake-followup-${lead.id}-${new Date().toISOString().slice(0,10)}`,
        });

        const parsed = openclawBridge.constructor.parseOutput(result.output);
        let data = null;
        try { data = JSON.parse(parsed.text || result.output || '{}'); } catch {}
        const body = data?.body_text;
        if (body) {
          run(
            `INSERT INTO cfo_outreach_sequences (lead_id, sequence_type, email_subject, email_body, source_agent, status, sequence_position) VALUES (?, 'follow_up', ?, ?, 'jake', 'draft', 2)`,
            [lead.id, data.subject || `Re: ${lead.email_subject}`, body]
          );
          brain.observe(
            `jake-followup-${new Date().toISOString().slice(0,10)}`,
            'jake-follow-up-agent', 'follow_up_queued',
            { subject: lead.company_name, content: `Follow-up drafted for ${lead.company_name} (${daysSince} days since first touch)`, confidence: 0.9 }
          );
          drafted++;
        } else {
          failed++;
        }
      } catch (e) {
        console.error(`[jake_follow_up] Failed for lead ${lead.id}:`, e.message);
        failed++;
      }
    }

    const outputText = `Jake Follow-Up: ${drafted} follow-ups drafted, ${failed} failed (of ${leads.length} eligible leads)`;
    return { outputText, durationMs: Date.now() - startTime, extra: { drafted, failed } };
  },

  // ── Jake Reply Classifier — paste a reply, classifies and updates lead status ($0) ──
  jake_reply_classifier: async ({ message, runId, agent }) => {
    const brain = require('../services/collectiveBrain');
    const startTime = Date.now();
    const params = parseMessageParams(message);
    const { lead_id, reply_text } = params;

    if (!lead_id || !reply_text) {
      throw new Error('Message must be JSON: {"lead_id": 123, "reply_text": "..."}');
    }

    const lead = get('SELECT * FROM cfo_leads WHERE id = ?', [lead_id]);
    if (!lead) throw new Error(`Lead ${lead_id} not found`);

    const text = reply_text.toLowerCase();

    let classification = 'NEUTRAL';
    let newLeadStatus  = null;
    let newSeqStatus   = null;
    let nextAction     = 'No action needed \u2014 monitor for future re-engagement';

    if (/\b(yes|interested|tell me more|let'?s? talk|schedule|call|would like|sounds good|love to|set up|book|connect)\b/.test(text)) {
      classification = 'INTERESTED';  newLeadStatus = 'replied';      newSeqStatus = 'replied';
      nextAction = 'Run jake-meeting-booker to draft a meeting confirmation email';
    } else if (/\b(not right now|maybe later|reach out in|try (me |us )?(again|in|next)|busy|not a (good|right) time|few months|next (quarter|year))\b/.test(text)) {
      classification = 'NOT_NOW';     newLeadStatus = 'nurture';      newSeqStatus = 'replied';
      nextAction = 'Move to nurture sequence \u2014 re-engage in 60 days';
    } else if (/\b(wrong person|not my area|not my department|forward(ed)? to|try [A-Z][a-z]|reach out to|you want|should contact)\b/.test(text)) {
      classification = 'WRONG_PERSON'; newLeadStatus = 'bad_contact'; newSeqStatus = 'replied';
      nextAction = 'Update contact info \u2014 find correct decision maker';
    } else if (/\b(unsubscribe|remove me|take me off|stop (emailing|contacting)|don'?t (contact|email)|opt out|no more)\b/.test(text)) {
      classification = 'UNSUBSCRIBE'; newLeadStatus = 'unsubscribed'; newSeqStatus = 'replied';
      nextAction = 'Do not contact again \u2014 marked unsubscribed';
    } else if (/\b(delivery failed|no such user|mailbox full|undeliverable|bounce|does not exist|invalid address)\b/.test(text)) {
      classification = 'BOUNCED';     newLeadStatus = 'bounced';      newSeqStatus = 'bounced';
      nextAction = 'Find correct email address \u2014 lead enrichment needed';
    }

    if (newLeadStatus) {
      run("UPDATE cfo_leads SET status=?, updated_at=datetime('now') WHERE id=?", [newLeadStatus, lead_id]);
    }
    if (newSeqStatus) {
      run(
        "UPDATE cfo_outreach_sequences SET status=?, replied_at=datetime('now') WHERE lead_id=? AND status='sent'",
        [newSeqStatus, lead_id]
      );
    }

    // Brain Layer 2: feedback signal
    const agentName = (lead.source_agent === 'jake') ? 'jake-outreach-agent' : 'cfo-outreach-agent';
    const market = [lead.city, lead.state].filter(Boolean).join(', ');
    const signalMap = { INTERESTED: 'converted', NOT_NOW: 'rejected', WRONG_PERSON: 'rejected', UNSUBSCRIBE: 'rejected', BOUNCED: 'bounced', NEUTRAL: 'approved' };
    brain.recordFeedback(agentName, 'outreach', String(lead_id), signalMap[classification], {
      notes: `Reply classifier: ${classification}. Reply: "${reply_text.slice(0, 100)}"`,
      market,
      metadata: { classification, company: lead.company_name, erp: lead.erp_type },
    });

    // Brain Layer 3: episode if interested
    if (classification === 'INTERESTED') {
      const sentSeq = get("SELECT sent_at FROM cfo_outreach_sequences WHERE lead_id=? AND sequence_position=1 ORDER BY created_at LIMIT 1", [lead_id]);
      const daysToOutcome = sentSeq?.sent_at
        ? Math.floor((Date.now() - new Date(sentSeq.sent_at).getTime()) / 86400000) : null;
      brain.recordEpisode(agentName, {
        market, erpContext: lead.erp_type, contactTitle: lead.contact_title,
        actionTaken: `Cold email outreach to ${lead.company_name}`,
        outcome: 'Lead replied \u2014 interested in meeting',
        outcomeType: 'replied', outcomeScore: 0.8,
        daysToOutcome, leadId: String(lead_id),
      });
    }

    const outputText = `Reply Classifier: ${lead.company_name} \u2192 ${classification} | New status: ${newLeadStatus || 'unchanged'} | Next: ${nextAction}`;
    return { outputText, durationMs: Date.now() - startTime, extra: { classification, newLeadStatus, nextAction } };
  },

  // ── Jake Meeting Booker — drafts meeting confirmation email for interested leads ──
  jake_meeting_booker: async ({ message, runId, agent }) => {
    const openclawBridge = require('../services/openclawBridge');
    const brain = require('../services/collectiveBrain');
    const startTime = Date.now();
    const params = parseMessageParams(message);

    const { lead_id } = params;
    if (!lead_id) throw new Error('Message must be JSON: {"lead_id": 123}');

    const lead = get('SELECT * FROM cfo_leads WHERE id = ?', [lead_id]);
    if (!lead) throw new Error(`Lead ${lead_id} not found`);
    if (lead.status !== 'replied') throw new Error(`Lead status is "${lead.status}" \u2014 must be "replied" to book a meeting`);

    const replyText = params.reply_text || 'Interested in learning more';

    const msg = JSON.stringify({
      lead_id, company_name: lead.company_name, contact_name: lead.contact_name,
      contact_email: lead.contact_email, reply_text: replyText,
      erp_type: lead.erp_type, city: lead.city, state: lead.state,
    });

    const result = await openclawBridge.runAgent('jake-meeting-booker', {
      openclawId: 'jake-meeting-booker',
      message: msg,
      sessionId: `jake-meeting-${lead_id}-${new Date().toISOString().slice(0,10)}`,
    });

    const parsed = openclawBridge.constructor.parseOutput(result.output);
    let data = null;
    try { data = JSON.parse(parsed.text || result.output || '{}'); } catch {}

    const body = data?.body_text;
    if (!body) throw new Error('Meeting booker returned no email body');

    const calendlyUrl = process.env.CALENDLY_URL || '[INSERT CALENDLY LINK]';
    const finalBody = body.replace(/\[CALENDLY_URL\]/g, calendlyUrl);

    run(
      `INSERT INTO cfo_outreach_sequences (lead_id, sequence_type, email_subject, email_body, source_agent, status, sequence_position) VALUES (?, 'meeting', ?, ?, 'jake', 'draft', 3)`,
      [lead_id, data.subject || `Let's talk \u2014 ${lead.company_name}`, finalBody]
    );

    brain.observe(
      `jake-meeting-${new Date().toISOString().slice(0,10)}`,
      'jake-meeting-booker', 'meeting_booked',
      { subject: lead.company_name, content: `Meeting booking drafted for ${lead.company_name} \u2014 ${lead.contact_name}`, confidence: 1.0,
        metadata: { lead_id, company: lead.company_name, city: lead.city } }
    );

    const outputText = `Meeting Booker: Draft created for ${lead.contact_name} at ${lead.company_name} | Subject: "${data.subject || 'Meeting draft'}"`;
    return { outputText, durationMs: Date.now() - startTime, costUsd: parsed.costUsd || 0, tokensUsed: parsed.tokensUsed || 0 };
  },

  brain_distillation: async ({ message, runId, agent }) => {
    // Nightly job — distills approved outputs into Azure knowledge base (Layer 4).
    // Runs at 2 AM daily. Zero LLM cost — pure DB read + Azure write.
    const brain = require('../services/collectiveBrain');
    const startTime = Date.now();
    const result = await brain.runDistillation();
    const stats = await brain.getStats();
    const durationMs = Date.now() - startTime;
    const outputText = [
      `Brain Distillation: ${result.inserted} new entries, ${result.skipped} already in KB`,
      `  Knowledge Base total: ${stats.kb_total || 0} entries (${stats.kb_total_uses || 0} total retrievals)`,
      `  Feedback signals: ${stats.feedback_total || 0} (${stats.feedback_approved || 0} ✅  ${stats.feedback_rejected || 0} ❌)`,
      `  Episodes: ${stats.episodes_total || 0} (avg score: ${stats.episodes_avg_score ? (stats.episodes_avg_score * 100).toFixed(0) + '%' : 'n/a'})`,
      `  Observations: ${stats.observations_total || 0} (${stats.observations_7d || 0} this week)`,
    ].join('\n');
    return { outputText, durationMs, costUsd: 0, extra: { distillResult: result, brainStats: stats } };
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

  // ── Jake CRM Sync — pushes replied/meeting_booked leads to Google Sheets (or CSV fallback) ──
  jake_crm_sync: async ({ message, runId, agent }) => {
    const { get: dbGet, all: dbAll } = require('../db/connection');
    const path = require('path');
    const fs = require('fs');
    const startTime = Date.now();

    // Find leads updated in last 24h with actionable statuses
    const since = new Date(Date.now() - 86400000).toISOString();
    const leads = dbAll(
      `SELECT l.*, s.email_subject, s.email_body, s.replied_at, s.sequence_position
       FROM cfo_leads l
       LEFT JOIN cfo_outreach_sequences s ON s.lead_id = l.id AND s.status IN ('replied','sent')
       WHERE l.status IN ('replied','meeting_booked','pilot') AND l.updated_at >= ?
       ORDER BY l.updated_at DESC`,
      [since]
    );

    let synced = 0;
    let csvFallback = false;

    if (!leads.length) {
      return { outputText: 'CRM Sync: No new replied/meeting_booked/pilot leads in last 24h', durationMs: Date.now() - startTime, costUsd: 0 };
    }

    // Try Google Sheets if configured
    const sheetsId = process.env.GOOGLE_SHEETS_ID;
    if (sheetsId) {
      try {
        const { google } = require('googleapis');
        const auth = new google.auth.GoogleAuth({
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const sheets = google.sheets({ version: 'v4', auth });
        const rows = leads.map(l => [
          l.id, l.company_name, l.contact_name || '', l.contact_title || '',
          l.contact_email || '', l.phone || '', l.erp_type || '',
          l.pilot_fit_score || 0, l.status, `${l.city || ''}, ${l.state || ''}`,
          l.updated_at, l.notes || '', '',
        ]);
        await sheets.spreadsheets.values.append({
          spreadsheetId: sheetsId,
          range: 'Jake Pipeline!A:M',
          valueInputOption: 'RAW',
          resource: { values: rows },
        });
        synced = rows.length;
      } catch (sheetsErr) {
        console.warn('[CRM Sync] Google Sheets failed, using CSV fallback:', sheetsErr.message);
        csvFallback = true;
      }
    } else {
      csvFallback = true;
    }

    // CSV fallback
    if (csvFallback) {
      const today = new Date().toISOString().slice(0, 10);
      const csvPath = path.join(__dirname, '../../data', `crm-sync-${today}.csv`);
      const header = 'lead_id,company,contact,title,email,phone,erp,score,status,location,updated_at,notes\n';
      const rows = leads.map(l =>
        [l.id, `"${l.company_name}"`, `"${l.contact_name || ''}"`, `"${l.contact_title || ''}"`,
         l.contact_email || '', l.phone || '', l.erp_type || '', l.pilot_fit_score || 0,
         l.status, `"${l.city || ''} ${l.state || ''}"`, l.updated_at, `"${(l.notes || '').replace(/"/g, '""')}"`].join(',')
      ).join('\n');
      fs.writeFileSync(csvPath, header + rows, 'utf8');
      synced = leads.length;
    }

    const durationMs = Date.now() - startTime;
    const outputText = `CRM Sync: ${synced} leads ${csvFallback ? 'exported to CSV fallback' : 'pushed to Google Sheets'} (replied + meeting_booked + pilot)`;
    return { outputText, durationMs, costUsd: 0, extra: { synced, csv_fallback_used: csvFallback } };
  },

  // ── Bid Result Scraper — scrapes FL/TX procurement portals for recently awarded GC contracts ──
  jake_bid_scraper: async ({ message, runId, agent }) => {
    const { get: dbGet } = require('../db/connection');
    const { run: dbRun } = require('../db/connection');
    const startTime = Date.now();
    const params = parseMessageParams(message);

    // Use web_search fallback since Playwright portal access varies — LLM agents handle scraping
    // This handler provides the scaffold; actual Playwright scraping is in the service file
    let scraperResult = { inserted: 0, scanned: 0, by_state: { FL: 0, TX: 0 } };
    try {
      const { runBidScraper } = require('../services/jakeBidScraper');
      scraperResult = await runBidScraper({ states: params.states || ['FL', 'TX'], limit: parseInt(params.limit) || 50 });
    } catch (e) {
      // Service not yet implemented — return scaffolded result
      console.warn('[BidScraper] Service not available:', e.message);
      return {
        outputText: 'Bid Scraper: Service file not yet created — run jake-hiring-signal-agent as interim lead source',
        durationMs: Date.now() - startTime,
        costUsd: 0,
      };
    }

    const durationMs = Date.now() - startTime;
    const outputText = `Bid Scraper: ${scraperResult.scanned} awards scanned, ${scraperResult.inserted} new GC leads (FL: ${scraperResult.by_state.FL}, TX: ${scraperResult.by_state.TX})`;
    return { outputText, durationMs, costUsd: 0, extra: scraperResult };
  },

  // ── Jake Permit Scanner — county permit portal lead discovery ──
  jake_permit_scanner: async ({ message, runId, agent }) => {
    const startTime = Date.now();
    try {
      const { runPermitScanner } = require('../services/jakePermitScanner');
      const params = parseMessageParams(message);
      const result = await runPermitScanner({ counties: params.counties || null, limit: parseInt(params.limit) || 100 });
      const durationMs = Date.now() - startTime;
      const outputText = `Permit Scanner: ${result.permits_scanned} permits, ${result.leads_inserted} new leads (${(result.counties_checked || []).join(', ')})`;
      return { outputText, durationMs, costUsd: 0, extra: result };
    } catch (e) {
      console.warn('[PermitScanner] Service not available:', e.message);
      return {
        outputText: 'Permit Scanner: Service file not yet created — use jake-hiring-signal-agent as interim',
        durationMs: Date.now() - startTime,
        costUsd: 0,
      };
    }
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

        // Discord notification
        try { require('../services/discordNotifier').notifyRunCompleted({ agentName: agent.name, status: 'completed', outputText: result.outputText, durationMs: result.durationMs, costUsd: handlerCost, runId }); } catch {}

        return res.json({
          success: true,
          run: { id: runId, status: 'completed', outputText: result.outputText, cost_usd: handlerCost, duration_ms: result.durationMs, ...(result.extra || {}) },
        });
      } catch (handlerError) {
        console.error(`[Runs] ${agentConfig.special_handler} error:`, handlerError.message);
        markRunFailed(runId, agent.id, handlerError.message);
        emitLog(`${agentConfig.special_handler} failed: ${handlerError.message}`);
        try { require('../services/discordNotifier').notifyRunCompleted({ agentName: agent.name, status: 'failed', errorMsg: handlerError.message, runId }); } catch {}
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

      // Post-process LLM output into unified marketing pipeline
      const { postProcessLLMOutput } = require('../services/postProcessor');
      postProcessLLMOutput(agent, outputText, message);

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
