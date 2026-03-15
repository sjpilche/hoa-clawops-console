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
  // Update total_runs and compute success_rate from actual run history
  run(
    `UPDATE agents SET status='idle', total_runs=total_runs+1, last_run_at=datetime('now'),
     success_rate = (
       SELECT CASE WHEN COUNT(*) = 0 THEN 0.0
         ELSE CAST(SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS REAL) / COUNT(*)
       END FROM runs WHERE agent_id = ?
     ),
     updated_at=datetime('now') WHERE id=?`,
    [agentId, agentId]
  );
}

function markRunFailed(runId, agentId, errorMsg) {
  run(
    `UPDATE runs SET status='failed', error_msg=?, completed_at=datetime('now'), updated_at=datetime('now') WHERE id=?`,
    [errorMsg, runId]
  );
  // Recompute success_rate on failure too so it stays accurate
  run(
    `UPDATE agents SET status='idle',
     success_rate = (
       SELECT CASE WHEN COUNT(*) = 0 THEN 0.0
         ELSE CAST(SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS REAL) / COUNT(*)
       END FROM runs WHERE agent_id = ?
     ),
     updated_at=datetime('now') WHERE id=?`,
    [agentId, agentId]
  );
}

function buildResultData(runId, message, outputText, extra = {}) {
  return JSON.stringify({ sessionId: runId, message, output: null, outputText, ...extra });
}

function parseMessageParams(message) {
  try {
    return JSON.parse(message);
  } catch (err) {
    // Log non-trivial parse failures so malformed messages don't silently disappear
    if (message && message.trim().startsWith('{')) {
      console.warn(`[parseMessageParams] Failed to parse JSON-like message: "${message.slice(0, 200)}..." — ${err.message}`);
    }
    return {};
  }
}

// ── Lead validation — prevents LLM hallucinations from reaching DB ──
function validateLead(lead) {
  const errors = [];

  // Required fields
  if (!lead.company_name || typeof lead.company_name !== 'string') errors.push('missing company_name');
  if (!lead.contact_name || typeof lead.contact_name !== 'string') errors.push('missing contact_name');

  // String length caps — LLM can hallucinate essays into fields
  if (lead.company_name && lead.company_name.length > 200) errors.push('company_name too long');
  if (lead.contact_name && lead.contact_name.length > 150) errors.push('contact_name too long');
  if (lead.contact_title && lead.contact_title.length > 150) errors.push('contact_title too long');
  if (lead.website && lead.website.length > 500) errors.push('website too long');
  if (lead.notes && lead.notes.length > 2000) errors.push('notes too long');

  // Score sanity — must be 0-100 integer
  const score = lead.qualification_score;
  if (score !== undefined && score !== null) {
    const numScore = Number(score);
    if (isNaN(numScore) || numScore < 0 || numScore > 100) errors.push(`invalid score: ${score}`);
  }

  // Email format — basic check to reject obvious hallucinations
  if (lead.contact_email && typeof lead.contact_email === 'string') {
    const email = lead.contact_email.trim();
    if (email !== 'unknown' && email !== 'null' && email !== '') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push(`invalid email format: ${email}`);
      if (email.length > 254) errors.push('email too long');
    }
  }

  // LinkedIn — must contain linkedin.com if present
  if (lead.contact_linkedin && typeof lead.contact_linkedin === 'string') {
    if (lead.contact_linkedin !== 'null' && !lead.contact_linkedin.includes('linkedin.com')) {
      errors.push(`invalid linkedin: ${lead.contact_linkedin}`);
    }
  }

  // Reject SQL injection attempts in string fields
  const sqlPatterns = /(\b(DROP|DELETE|INSERT|UPDATE|ALTER|EXEC|UNION)\b.*\b(TABLE|FROM|INTO|SET)\b)/i;
  const fieldsToCheck = [lead.company_name, lead.contact_name, lead.contact_title, lead.notes];
  for (const field of fieldsToCheck) {
    if (field && typeof field === 'string' && sqlPatterns.test(field)) {
      errors.push(`suspicious SQL pattern in field: "${field.slice(0, 50)}"`);
    }
  }

  return { valid: errors.length === 0, errors };
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
    const { checkContent } = require('../services/contentGuard');
    const startTime = Date.now();

    // Content guard + Ralph QA before pushing to GitHub (goes live on Netlify)
    const guard = checkContent(message, '');
    if (!guard.safe) {
      const flagSummary = guard.flags.map(f => `${f.type}:${f.match}`).join(', ');
      console.warn(`[GitHubPublisher] Content flagged — blocking push: ${flagSummary}`);
      return {
        outputText: `GitHub publish BLOCKED by content guard: ${flagSummary}. Fix content and retry.`,
        durationMs: Date.now() - startTime,
      };
    }

    // Ralph QA score check — warn but don't block (content is already human-approved at this point)
    try {
      const ralphQA = require('../services/ralphQA');
      const wordCount = message.split(/\s+/).filter(Boolean).length;
      let qaScore = 70;
      if (wordCount >= 300 && wordCount <= 2000) qaScore += 10;
      if (message.includes('#')) qaScore += 10;
      if (/\b(construction|contractor|HOA|CFO|controller)\b/i.test(message)) qaScore += 10;
      for (const flag of guard.flags) { qaScore -= (flag.severity === 'medium' ? 5 : 2); }
      console.log(`[GitHubPublisher] Pre-push QA score: ${qaScore}/100`);
    } catch {}

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

    // Brain Layer 1: contact search observation
    try {
      const brain = require('../services/collectiveBrain');
      brain.observe(
        `hoa-contacts-${new Date().toISOString().slice(0, 10)}`,
        'hoa-contact-finder', 'contact_found',
        {
          subject: `${searchParams.city}, ${searchParams.state || 'US'}`,
          content: `HOA Contact Search: ${result.results.total_found} found, ${result.results.new_contacts} new in ${searchParams.city}.`,
          confidence: 1.0,
          metadata: { city: searchParams.city, state: searchParams.state, total_found: result.results.total_found, new_contacts: result.results.new_contacts },
        }
      );
    } catch {}

    // Audit log for contact finder trending
    try {
      run(
        `INSERT INTO audit_log (id, action, resource, details, outcome) VALUES (lower(hex(randomblob(16))), 'contact_finder_quality', ?, ?, ?)`,
        ['agent:hoa-contact-finder', JSON.stringify({ run_id: runId, city: searchParams.city, state: searchParams.state, found: result.results.total_found, new: result.results.new_contacts }), result.results.new_contacts > 0 ? 'success' : 'failure']
      );
    } catch {}

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

    // Brain Layer 1: market_insight observation (matching jake-construction-discovery pattern)
    try {
      const brain = require('../services/collectiveBrain');
      brain.observe(
        `hoa-discovery-${new Date().toISOString().slice(0, 10)}`,
        'hoa-discovery', 'market_insight',
        {
          subject: topTarget,
          content: `HOA Discovery: ${totalNew} new communities in ${topTarget}. Queries: ${result.queries_run || 0}.`,
          confidence: 1.0,
          metadata: { geo_target: topTarget, new_communities: totalNew, queries: result.queries_run || 0 },
        }
      );
    } catch {}

    // Audit log for discovery trending
    try {
      run(
        `INSERT INTO audit_log (id, action, resource, details, outcome) VALUES (lower(hex(randomblob(16))), 'discovery_quality', ?, ?, ?)`,
        ['agent:hoa-discovery', JSON.stringify({ run_id: runId, geo_target: topTarget, new_communities: totalNew, queries: result.queries_run || 0 }), totalNew > 0 ? 'success' : 'failure']
      );
    } catch {}

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

    // ── HOA Enrichment quality trending ──
    const hoaHitRate = result.enriched_count > 0 ? Math.round((result.success_count / result.enriched_count) * 100) : 0;
    try {
      run(
        `INSERT INTO audit_log (id, action, resource, details, outcome) VALUES (lower(hex(randomblob(16))), 'enricher_quality', ?, ?, ?)`,
        ['agent:hoa-contact-enricher', JSON.stringify({ run_id: runId, total: result.enriched_count, enriched: result.success_count, hit_rate: hoaHitRate, tier: enrichParams.tier }), hoaHitRate >= 50 ? 'success' : 'failure']
      );
    } catch {}

    if (result.enriched_count >= 5 && hoaHitRate < 50) {
      try {
        const discord = require('../services/discordNotifier');
        discord.sendEmbed({ title: 'HOA Enricher Quality Alert', description: `HOA enricher hit rate: ${hoaHitRate}% (${result.success_count}/${result.enriched_count}). Below 50% threshold.`, color: 0xff9500, footer: { text: 'hoa-contact-enricher' } });
      } catch {}
    }

    return { outputText, durationMs, extra: { enrichResult: result, hitRate: hoaHitRate } };
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

    // ── CFO Lead Scout quality trending (matching jake-lead-scout pattern) ──
    const avgScore = result.leads.length > 0
      ? Math.round(result.leads.reduce((s, l) => s + (l.pilot_fit_score || 0), 0) / result.leads.length)
      : 0;
    try {
      run(
        `INSERT INTO audit_log (id, action, resource, details, outcome) VALUES (lower(hex(randomblob(16))), 'lead_scout_quality', ?, ?, ?)`,
        ['agent:cfo-lead-scout', JSON.stringify({ run_id: runId, inserted: result.stats.inserted, skipped: result.stats.skipped, avg_score: avgScore, total_leads: result.leads.length }), result.stats.inserted > 0 ? 'success' : 'failure']
      );
    } catch {}

    // Brain observation
    try {
      const brain = require('../services/collectiveBrain');
      brain.observe(
        `cfo-scout-${new Date().toISOString().slice(0, 10)}`,
        'cfo-lead-scout', 'lead_signal',
        {
          subject: 'CFO Lead Scout',
          content: `CFO Scout: ${result.stats.inserted} new leads, ${result.stats.skipped} dupes. Avg score: ${avgScore}.`,
          confidence: 1.0,
          metadata: { inserted: result.stats.inserted, skipped: result.stats.skipped, avg_score: avgScore },
        }
      );
    } catch {}

    return { outputText, durationMs, extra: { stats: result.stats, avgScore } };
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
      // ── Schema validation — reject LLM hallucinations before DB ──
      const validation = validateLead(lead);
      if (!validation.valid) {
        console.warn(`[jake_lead_scout] Validation failed for lead: ${validation.errors.join(', ')}. Data: ${JSON.stringify(lead).slice(0, 200)}`);
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

    // ── Lead quality trending — track degradation over time ──
    const totalAttempted = leads.length;
    const validationFailureRate = totalAttempted > 0 ? Math.round((leadsSkipped / totalAttempted) * 100) : 0;
    const avgScore = leads.length > 0
      ? Math.round(leads.reduce((sum, l) => sum + (l.qualification_score || 0), 0) / leads.length)
      : 0;

    // Log quality metrics to audit_log
    try {
      run(
        `INSERT INTO audit_log (id, action, resource, details, outcome) VALUES (lower(hex(randomblob(16))), 'lead_scout_quality', ?, ?, ?)`,
        [
          `agent:jake-lead-scout`,
          JSON.stringify({ run_id: runId, region: runMsg.region, leads_attempted: totalAttempted, leads_inserted: leadsInserted, leads_skipped: leadsSkipped, validation_failure_rate: validationFailureRate, avg_score: avgScore }),
          leadsInserted > 0 ? 'success' : 'failure',
        ]
      );
    } catch {}

    // Brain observation for rejected leads — track WHY leads are being skipped
    if (leadsSkipped > 0) {
      try {
        const brain = require('../services/collectiveBrain');
        brain.observe(
          `jake-scout-${new Date().toISOString().slice(0,10)}`,
          'jake-lead-scout', 'lead_quality_alert',
          {
            subject: runMsg.region,
            content: `Lead Scout ${runMsg.region}: ${leadsSkipped}/${totalAttempted} leads rejected (${validationFailureRate}% failure rate). Avg score: ${avgScore}. Inserted: ${leadsInserted}.`,
            confidence: 1.0,
            metadata: { region: runMsg.region, failure_rate: validationFailureRate, avg_score: avgScore, inserted: leadsInserted, skipped: leadsSkipped },
          }
        );
      } catch {}
    }

    // Discord alert on quality degradation
    if (validationFailureRate > 30 || (totalAttempted >= 3 && leadsInserted < 3)) {
      try {
        const discord = require('../services/discordNotifier');
        discord.sendEmbed({
          title: 'Lead Scout Quality Alert',
          description: `Region: ${runMsg.region}\nInserted: ${leadsInserted}/${totalAttempted} (${validationFailureRate}% rejected)\nAvg score: ${avgScore}\n\nPossible causes: market exhaustion, LLM degradation, or overly strict validation.`,
          color: 0xff9500,
          timestamp: new Date().toISOString(),
          footer: { text: 'jake-lead-scout' },
        });
      } catch {}
    }

    const outputText = [
      `Jake Lead Scout: ${leadsInserted} new leads inserted, ${leadsSkipped} skipped (${runMsg.region})`,
      `  Market: ${runMsg.region} | Duration: ${(durationMs/1000).toFixed(1)}s | Cost: $${(parsed.costUsd||0).toFixed(4)}`,
      `  Quality: avg_score=${avgScore}, failure_rate=${validationFailureRate}%`,
      leadsInserted > 0 ? `  Leads need enrichment: run jake-contact-enricher next` : `  No new leads this run — market will rotate next time`,
    ].join('\n');

    return { outputText, durationMs, costUsd: parsed.costUsd || 0, tokensUsed: parsed.tokensUsed || 0, extra: { leadsInserted, leadsSkipped, region: runMsg.region, avgScore, validationFailureRate } };
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

    // ── Enrichment quality trending ──
    const hitRate = result.total > 0 ? Math.round((result.enriched / result.total) * 100) : 0;
    const methodDist = {};
    for (const r of result.results) { methodDist[r.method || 'failed'] = (methodDist[r.method || 'failed'] || 0) + 1; }

    try {
      run(
        `INSERT INTO audit_log (id, action, resource, details, outcome) VALUES (lower(hex(randomblob(16))), 'enricher_quality', ?, ?, ?)`,
        ['agent:jake-contact-enricher', JSON.stringify({ run_id: runId, total: result.total, enriched: result.enriched, hit_rate: hitRate, methods: methodDist }), hitRate >= 15 ? 'success' : 'failure']
      );
    } catch {}

    // Discord alert if hit rate drops below 15% (below 20% baseline = degraded)
    if (result.total >= 5 && hitRate < 15) {
      try {
        const discord = require('../services/discordNotifier');
        discord.sendEmbed({ title: 'Enricher Quality Alert', description: `Jake enricher hit rate: ${hitRate}% (${result.enriched}/${result.total}). Below 15% threshold.\nMethods: ${JSON.stringify(methodDist)}`, color: 0xff9500, footer: { text: 'jake-contact-enricher' } });
      } catch {}
    }

    return { outputText, durationMs, extra: { enrichResult: result, hitRate, methodDist } };
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

    // RSE stats for Todd's briefing
    let rseField = '';
    try {
      const rseVideos = dbGet("SELECT COUNT(*) c FROM rse_transcripts WHERE DATE(created_at)=?", [yesterday])?.c || 0;
      const rseSignals = dbGet("SELECT COUNT(*) c FROM rse_signals WHERE DATE(created_at)=?", [yesterday])?.c || 0;
      const rseSpecs = dbGet("SELECT COUNT(*) c FROM rse_build_specs WHERE DATE(created_at)=?", [yesterday])?.c || 0;
      const topIdea = dbGet("SELECT one_liner, composite_score FROM rse_evaluations WHERE status NOT IN ('passed') ORDER BY composite_score DESC LIMIT 1");
      const totalIdeas = dbGet("SELECT COUNT(*) c FROM rse_evaluations WHERE status NOT IN ('passed')")?.c || 0;

      const parts = [];
      if (rseVideos > 0) parts.push(`${rseVideos} videos scanned`);
      if (rseSignals > 0) parts.push(`${rseSignals} signals accepted`);
      if (rseSpecs > 0) parts.push(`${rseSpecs} specs generated`);
      parts.push(`${totalIdeas} ideas ranked`);
      if (topIdea) parts.push(`Top: "${topIdea.one_liner}" (${topIdea.composite_score.toFixed(1)}/10)`);
      rseField = parts.join(' · ');
    } catch {}

    await discord.postWebhook({
      embeds: [{
        title: `\u2600\ufe0f Morning Digest \u2014 ${yesterday}`,
        color: 0x5865f2,
        fields: [
          { name: '\ud83c\udfaf Pipeline',  value: `${leadsFound} found \u00b7 ${leadsEnriched} enriched \u00b7 ${emailsDrafted} drafted`, inline: false },
          { name: '\ud83d\udce7 Outreach',  value: `${emailsSent} sent \u00b7 ${emailsReplied} replied (${replyRate}% reply rate)`,        inline: false },
          { name: '\u270d\ufe0f Content',   value: `${contentPieces} pieces created`,                                                      inline: false },
          ...(rseField ? [{ name: '\ud83d\udce1 Signal Engine', value: rseField, inline: false }] : []),
          { name: '\ud83e\udde0 Brain',     value: `${brainStats.observations_7d || 0} obs this week \u00b7 ${brainStats.feedback_approved || 0} \u2705`, inline: false },
          { name: '\ud83d\udcb0 Cost',      value: `$${parseFloat(runCosts).toFixed(4)} yesterday`,                                        inline: false },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'ClawOps Console' },
      }]
    });

    // ── Memory Bridge: create daily log + update project memory ──
    let memoryStatus = '';
    try {
      const memBridge = require('../services/memoryBridge');
      const logResult = memBridge.createDailyLog(yesterday);
      const projResult = memBridge.updateProjectMemory();
      memoryStatus = ` | Memory: ${logResult.created ? 'daily log created' : 'log exists'}, ${projResult.updated} project files updated`;
    } catch (memErr) {
      console.warn('[MorningDigest] Memory bridge failed (non-fatal):', memErr.message);
    }

    const outputText = `Morning digest posted to Discord \u2014 ${yesterday}: ${leadsFound} leads, ${emailsSent} sent, ${replyRate}% reply rate${memoryStatus}`;
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
          const subject = data.subject || `Re: ${lead.email_subject}`;
          const angleType = data.follow_up_angle || 'general';

          // Content guard — same filter as outreach agents
          const { checkContent } = require('../services/contentGuard');
          const guard = checkContent(body, subject);
          const status = guard.safe ? 'draft' : 'flagged';
          if (!guard.safe) {
            console.warn(`[ContentGuard] jake-follow-up flagged for lead ${lead.id}: ${guard.flags.map(f => `${f.type}:${f.match}`).join(', ')}`);
          }

          run(
            `INSERT INTO cfo_outreach_sequences (lead_id, sequence_type, email_subject, email_body, source_agent, status, sequence_position, qa_status, angle_type) VALUES (?, 'follow_up', ?, ?, 'jake', ?, 2, 'pending', ?)`,
            [lead.id, subject, body, status, angleType]
          );

          // Ralph QA auto-review on the follow-up draft
          try {
            const ralphQA = require('../services/ralphQA');
            const inserted = get('SELECT id FROM cfo_outreach_sequences WHERE lead_id = ? AND sequence_position = 2 ORDER BY id DESC LIMIT 1', [lead.id]);
            if (inserted) {
              const qaResult = ralphQA.reviewSingleOutreach(inserted.id);
              console.log(`[RalphQA] Follow-up #${inserted.id}: ${qaResult.passed ? 'PASSED' : 'FAILED'} (${qaResult.score}/100)`);
            }
          } catch {}

          brain.observe(
            `jake-followup-${new Date().toISOString().slice(0,10)}`,
            'jake-follow-up-agent', 'follow_up_queued',
            { subject: lead.company_name, content: `Follow-up drafted for ${lead.company_name} (${daysSince} days since first touch). Angle: ${angleType}. QA: ${status}.`, confidence: 0.9,
              metadata: { lead_id: lead.id, angle: angleType, days_since: daysSince } }
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

    // Brain Layer 3: episode for all reply outcomes with proper outcome scores
    // High scores flow into Layer 4 KB via nightly distillation
    const outcomeScoreMap = {
      INTERESTED:   0.9,
      NOT_NOW:      0.3,
      WRONG_PERSON: 0.2,
      UNSUBSCRIBE:  0.1,
      BOUNCED:      0.0,
      NEUTRAL:      0.5,
    };
    const outcomeTypeMap = {
      INTERESTED:   'replied',
      NOT_NOW:      'lost',
      WRONG_PERSON: 'lost',
      UNSUBSCRIBE:  'lost',
      BOUNCED:      'lost',
      NEUTRAL:      'replied',
    };
    const outcomeTextMap = {
      INTERESTED:   'Lead replied \u2014 interested in meeting',
      NOT_NOW:      'Lead replied \u2014 not right now, nurture sequence',
      WRONG_PERSON: 'Lead replied \u2014 wrong contact, need new decision maker',
      UNSUBSCRIBE:  'Lead replied \u2014 unsubscribed, do not contact',
      BOUNCED:      'Email bounced \u2014 invalid address',
      NEUTRAL:      'Lead replied \u2014 neutral or unclear',
    };
    const sentSeq = get("SELECT sent_at FROM cfo_outreach_sequences WHERE lead_id=? AND sequence_position=1 ORDER BY created_at LIMIT 1", [lead_id]);
    const daysToOutcome = sentSeq?.sent_at
      ? Math.floor((Date.now() - new Date(sentSeq.sent_at).getTime()) / 86400000) : null;
    brain.recordEpisode(agentName, {
      market, erpContext: lead.erp_type, contactTitle: lead.contact_title,
      actionTaken: `Cold email outreach to ${lead.company_name} (${lead.erp_type || 'unknown ERP'})`,
      outcome:     outcomeTextMap[classification] || 'Unknown reply',
      outcomeType: outcomeTypeMap[classification] || 'replied',
      outcomeScore: outcomeScoreMap[classification] ?? 0.5,
      daysToOutcome,
      leadId: String(lead_id),
    });

    // Cadence Brain v2: deactivate cadence on terminal reply outcomes
    if (['INTERESTED', 'UNSUBSCRIBE', 'BOUNCED'].includes(classification)) {
      try {
        const cadence = require('../services/tenacityCadenceEngine');
        cadence.deactivateCadence(lead_id, 'jake');
      } catch { /* service may not be seeded yet */ }
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
    const meetingSubject = data.subject || `Let's talk \u2014 ${lead.company_name}`;

    // Content guard on meeting emails — these reach INTERESTED leads (highest-value contacts)
    const { checkContent } = require('../services/contentGuard');
    const guard = checkContent(finalBody, meetingSubject);
    const meetingStatus = guard.safe ? 'draft' : 'flagged';
    if (!guard.safe) {
      console.warn(`[ContentGuard] meeting-booker flagged for lead ${lead_id}: ${guard.flags.map(f => `${f.type}:${f.match}`).join(', ')}`);
    }

    run(
      `INSERT INTO cfo_outreach_sequences (lead_id, sequence_type, email_subject, email_body, source_agent, status, sequence_position, qa_status) VALUES (?, 'meeting', ?, ?, 'jake', ?, 3, 'pending')`,
      [lead_id, meetingSubject, finalBody, meetingStatus]
    );

    // Ralph QA auto-review on meeting draft
    try {
      const ralphQA = require('../services/ralphQA');
      const inserted = get('SELECT id FROM cfo_outreach_sequences WHERE lead_id = ? AND sequence_position = 3 ORDER BY id DESC LIMIT 1', [lead_id]);
      if (inserted) {
        const qaResult = ralphQA.reviewSingleOutreach(inserted.id);
        console.log(`[RalphQA] Meeting #${inserted.id}: ${qaResult.passed ? 'PASSED' : 'FAILED'} (${qaResult.score}/100)`);
      }
    } catch {}

    brain.observe(
      `jake-meeting-${new Date().toISOString().slice(0,10)}`,
      'jake-meeting-booker', 'meeting_booked',
      { subject: lead.company_name, content: `Meeting booking drafted for ${lead.company_name} \u2014 ${lead.contact_name}. QA: ${meetingStatus}.`, confidence: 1.0,
        metadata: { lead_id, company: lead.company_name, city: lead.city, qa_status: meetingStatus } }
    );

    // Brain v2 Layer 3: record 'booked' episode — scores 1.0, flows to Layer 4 KB via distillation
    const agentName = lead.source_agent === 'cfo' ? 'cfo-outreach-agent' : 'jake-outreach-agent';
    const market = [lead.city, lead.state].filter(Boolean).join(', ');
    const sentSeq = get("SELECT sent_at FROM cfo_outreach_sequences WHERE lead_id=? AND sequence_position=1 ORDER BY created_at LIMIT 1", [lead_id]);
    const daysToOutcome = sentSeq?.sent_at
      ? Math.floor((Date.now() - new Date(sentSeq.sent_at).getTime()) / 86400000) : null;
    brain.recordEpisode(agentName, {
      market, erpContext: lead.erp_type, contactTitle: lead.contact_title,
      actionTaken: `Cold email outreach to ${lead.company_name} (${lead.erp_type || 'unknown ERP'})`,
      outcome: `Meeting booked \u2014 ${lead.company_name}, ${lead.contact_name || 'contact'}`,
      outcomeType: 'booked',
      outcomeScore: 1.0,
      daysToOutcome,
      leadId: String(lead_id),
    });

    const outputText = `Meeting Booker: Draft created for ${lead.contact_name} at ${lead.company_name} | Subject: "${data.subject || 'Meeting draft'}"`;
    return { outputText, durationMs: Date.now() - startTime, costUsd: parsed.costUsd || 0, tokensUsed: parsed.tokensUsed || 0 };
  },

  // ── Tenacity Cadence Engine — Upgrade E ──────────────────────────────────
  // Runs a full cadence cycle: finds leads with cadence_active=1 and
  // next_touch_due <= now, queues outreach/follow-up runs for each.
  // Also supports single-lead compute for inspection.
  // $0/run — no LLM in this handler; dispatches pending runs for LLM agents.
  tenacity_cadence: async ({ message, runId, agent }) => {
    const { runCadenceCycle, computeCadenceForLead } = require('../services/tenacityCadenceEngine');
    const startTime = Date.now();
    const params = parseMessageParams(message);

    // Single-lead inspect mode
    if (params.lead_id) {
      const product = params.product || 'jake';
      const cadence = await computeCadenceForLead(parseInt(params.lead_id), product);
      const durationMs = Date.now() - startTime;
      const outputText = [
        `Cadence for ${product} lead #${params.lead_id}:`,
        `  Next touch: #${cadence.next_touch_number} | Channel: ${cadence.channel} | Tone: ${cadence.tone}`,
        `  Wait days: ${cadence.wait_days_next} | Due: ${cadence.next_touch_due?.slice(0,10)}`,
        `  Rationale: ${cadence.rationale}`,
      ].join('\n');
      return { outputText, durationMs, costUsd: 0, extra: cadence };
    }

    // Full cycle mode
    const product = params.product || 'both';
    const result = await runCadenceCycle(product);
    const durationMs = Date.now() - startTime;
    return {
      outputText: result.summary,
      durationMs,
      costUsd: 0,
      extra: {
        queued:  result.queued,
        skipped: result.skipped,
        errors:  result.errors,
        opened:  result.opened,
      },
    };
  },

  // ── Outreach Sender — sends all approved outreach emails via SendGrid ────
  // Runs daily at 10 AM. Finds approved sequences with contact emails,
  // sends via SendGrid, updates delivery status, progresses lead status.
  // $0/run (SendGrid free tier: 100 emails/day).
  // ── Outreach Sender — TWO MODES ──────────────────────────────────────────
  // DEFAULT (scheduled): Preview-only. Shows what WOULD send, posts to Discord,
  //   does NOT send. Steve must confirm via UI or pass confirmed=true.
  // CONFIRMED (manual): Actually sends. Only fires when Steve explicitly triggers
  //   via /api/runs/:id/confirm or passes { confirmed: true } in message.
  //
  // CLAUDE.md HARD STOP: "Send external communications... requires human authorization."
  // This handler enforces that rule. Scheduled runs are preview-only.
  outreach_sender: async ({ message, runId, agent }) => {
    const { all: dbAll, run: dbRun, get: dbGet } = require('../db/connection');
    const sg = require('../services/sendgrid');
    const brain = require('../services/collectiveBrain');
    const discord = require('../services/discordNotifier');
    const startTime = Date.now();
    const params = parseMessageParams(message);

    const sgStatus = sg.status();
    if (!sgStatus.configured) {
      return { outputText: 'Outreach Sender: SKIPPED — SENDGRID_API_KEY not configured in .env.local', durationMs: Date.now() - startTime, costUsd: 0 };
    }

    const dailyLimit = parseInt(params.limit) || 50;
    const product = params.product || 'both';
    const isConfirmed = params.confirmed === true || params.confirmed === 'true';

    // Find approved sequences with contact emails, ordered by urgency score
    let query = `
      SELECT s.id, s.lead_id, s.email_subject, s.email_body, s.sequence_position, s.source_agent,
             l.contact_email, l.contact_name, l.company_name, l.erp_type, l.city, l.state,
             l.urgency_score, l.pilot_fit_score
      FROM cfo_outreach_sequences s
      JOIN cfo_leads l ON l.id = s.lead_id
      WHERE s.status = 'approved'
        AND l.contact_email IS NOT NULL AND l.contact_email != ''
        AND l.status NOT IN ('unsubscribed', 'bounced', 'closed_lost')
    `;
    if (product === 'jake') query += " AND s.source_agent = 'jake'";
    else if (product === 'cfo') query += " AND s.source_agent = 'cfo'";
    query += ` ORDER BY COALESCE(l.urgency_score, 0) DESC, s.created_at ASC LIMIT ?`;

    const sequences = dbAll(query, [dailyLimit]);

    if (sequences.length === 0) {
      return { outputText: 'Outreach Sender: No approved sequences with contact emails ready to send', durationMs: Date.now() - startTime, costUsd: 0 };
    }

    // ── PREVIEW MODE (default for scheduled runs) ─────────────────────────
    // Shows what would send, posts to Discord, does NOT send anything.
    if (!isConfirmed) {
      const preview = sequences.slice(0, 10).map((s, i) =>
        `${i + 1}. ${s.company_name} — ${s.contact_name || 'contact'} (${s.contact_email})\n   Subject: "${(s.email_subject || '').slice(0, 60)}"`
      ).join('\n');

      // Post preview to Discord so Steve sees it
      try {
        await discord.sendEmbed({
          title: `\ud83d\udce8 Outreach Ready — ${sequences.length} emails awaiting your GO`,
          color: 0xffa500, // orange = needs confirmation
          description: `**${sequences.length} approved emails** are ready to send.\nConfirm in the Console to fire, or they stay queued.\n\n${preview}${sequences.length > 10 ? `\n... and ${sequences.length - 10} more` : ''}`,
          fields: [
            { name: 'How to send', value: 'Console → Runs → outreach-sender → Confirm\nOr: POST /api/cfo-marketing/outreach/send-confirmed', inline: false },
          ],
          timestamp: new Date().toISOString(),
          footer: { text: 'Outreach Sender — PREVIEW ONLY (no emails sent)' },
        });
      } catch {}

      const durationMs = Date.now() - startTime;
      const outputText = [
        `Outreach Sender: PREVIEW — ${sequences.length} emails ready (NOT sent, awaiting confirmation)`,
        ...sequences.slice(0, 5).map(s => `  ${s.company_name} → ${s.contact_email}`),
        sequences.length > 5 ? `  ... and ${sequences.length - 5} more` : null,
        `  Confirm in Console or POST with {"confirmed":true} to send.`,
      ].filter(Boolean).join('\n');
      return { outputText, durationMs, costUsd: 0, extra: { mode: 'preview', ready_count: sequences.length, preview: sequences.slice(0, 10).map(s => ({ company: s.company_name, email: s.contact_email, subject: s.email_subject })) } };
    }

    // ── CONFIRMED MODE (manual trigger only) ──────────────────────────────
    // Steve explicitly confirmed — actually send the emails.
    console.log(`[OutreachSender] CONFIRMED — sending ${sequences.length} emails`);

    // SendGrid daily send cap — safety net
    const todaySent = dbGet("SELECT COUNT(*) c FROM cfo_outreach_sequences WHERE DATE(sent_at)=DATE('now') AND status='sent'")?.c || 0;
    const dailySendCap = 100; // SendGrid free tier
    if (todaySent + sequences.length > dailySendCap) {
      const allowed = Math.max(0, dailySendCap - todaySent);
      if (allowed === 0) {
        return { outputText: `Outreach Sender: BLOCKED — daily send cap reached (${todaySent}/${dailySendCap} today)`, durationMs: Date.now() - startTime, costUsd: 0 };
      }
      sequences.length = allowed; // truncate to remaining capacity
      console.log(`[OutreachSender] Capped to ${allowed} emails (${todaySent} already sent today, cap=${dailySendCap})`);
    }

    let sent = 0;
    let failed = 0;
    const results = [];

    for (const seq of sequences) {
      try {
        const bodyText = seq.email_body || '';
        const html = sg.wrapInBrandedShell(
          bodyText.split('\n').map(p => p.trim() ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;">${p}</p>` : '').join(''),
          { preheader: seq.email_subject }
        );
        const result = await sg.send({
          to: seq.contact_email,
          subject: seq.email_subject || 'Quick question',
          html,
          text: bodyText,
        });

        if (result.success) {
          dbRun("UPDATE cfo_outreach_sequences SET status = 'sent', sent_at = datetime('now'), delivery_status = 'delivered' WHERE id = ?", [seq.id]);
          dbRun("UPDATE cfo_leads SET status = 'contacted', updated_at = datetime('now') WHERE id = ? AND status = 'new'", [seq.lead_id]);
          sent++;
          results.push({ company: seq.company_name, email: seq.contact_email, status: 'sent' });
          console.log(`[OutreachSender] Sent to ${seq.contact_email} (${seq.company_name})`);

          const market = [seq.city, seq.state].filter(Boolean).join(', ');
          brain.observe(
            `outreach-send-${new Date().toISOString().slice(0, 10)}`,
            'outreach-sender', 'email_sent',
            { subject: seq.company_name, content: `Email sent to ${seq.contact_name || 'contact'} at ${seq.company_name} (${market})`, confidence: 1.0,
              metadata: { lead_id: seq.lead_id, seq_id: seq.id, position: seq.sequence_position } }
          );
        } else {
          throw new Error(result.error || result.reason || 'SendGrid failed');
        }

        // 2s stagger between emails
        if (sent + failed < sequences.length - 1) {
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch (err) {
        failed++;
        dbRun("UPDATE cfo_outreach_sequences SET delivery_status = 'failed', delivery_error = ? WHERE id = ?", [err.message, seq.id]);
        results.push({ company: seq.company_name, email: seq.contact_email, status: 'failed', error: err.message });
        console.error(`[OutreachSender] Failed for ${seq.contact_email}: ${err.message}`);
      }
    }

    // Discord confirmation summary
    if (sent > 0) {
      try {
        discord.postWebhook({
          embeds: [{
            title: `\ud83d\udce7 Outreach Sent — ${sent} emails delivered`,
            color: 0x22c55e,
            fields: [
              { name: 'Sent', value: String(sent), inline: true },
              { name: 'Failed', value: String(failed), inline: true },
              { name: 'Recipients', value: results.filter(r => r.status === 'sent').slice(0, 5).map(r => r.company).join(', ') || 'None', inline: false },
            ],
            timestamp: new Date().toISOString(),
          }],
        });
      } catch {}
    }

    const durationMs = Date.now() - startTime;
    const outputText = `Outreach Sender: ${sent} sent, ${failed} failed (of ${sequences.length} confirmed) in ${(durationMs / 1000).toFixed(1)}s`;
    return { outputText, durationMs, costUsd: 0, extra: { mode: 'confirmed', sent, failed, results } };
  },

  brain_distillation: async ({ message, runId, agent }) => {
    // Nightly job — distills approved outputs into Azure knowledge base (Layer 4).
    // Runs at 2 AM daily. Zero LLM cost — pure DB read + Azure write.
    const brain = require('../services/collectiveBrain');
    const startTime = Date.now();
    const result = await brain.runDistillation();
    const stats = await brain.getStats();

    // ── Memory hygiene: purge old audit log + stale fallback observations ──
    let auditPurged = 0;
    let obsPurged = 0;
    try {
      // Purge audit_log entries older than 90 days (keeps table performant)
      const retentionDays = parseInt((get("SELECT value FROM settings WHERE key='data_retention_days'") || {}).value || '90');
      const auditResult = run(
        `DELETE FROM audit_log WHERE timestamp < datetime('now', '-${retentionDays} days')`
      );
      auditPurged = auditResult?.changes || 0;
      if (auditPurged > 0) console.log(`[BrainDistillation] Purged ${auditPurged} audit_log entries (>${retentionDays} days old)`);
    } catch {}

    try {
      // Purge synced fallback observations older than 90 days
      const obsResult = run(
        `DELETE FROM brain_fallback_observations WHERE synced = 1 AND created_at < datetime('now', '-90 days')`
      );
      obsPurged = obsResult?.changes || 0;

      // Purge synced fallback feedback older than 90 days
      run(`DELETE FROM brain_fallback_feedback WHERE synced = 1 AND created_at < datetime('now', '-90 days')`);
      // Purge synced fallback episodes older than 90 days
      run(`DELETE FROM brain_fallback_episodes WHERE synced = 1 AND created_at < datetime('now', '-90 days')`);

      if (obsPurged > 0) console.log(`[BrainDistillation] Purged ${obsPurged} synced fallback observations (>90 days old)`);
    } catch {}

    const durationMs = Date.now() - startTime;
    const outputLines = [
      `Brain Distillation: ${result.inserted} new entries, ${result.skipped} already in KB`,
      `  Knowledge Base total: ${stats.kb_total || 0} entries (${stats.kb_total_uses || 0} total retrievals)`,
      `  Feedback signals: ${stats.feedback_total || 0} (${stats.feedback_approved || 0} ✅  ${stats.feedback_rejected || 0} ❌)`,
      `  Episodes: ${stats.episodes_total || 0} (avg score: ${stats.episodes_avg_score ? (stats.episodes_avg_score * 100).toFixed(0) + '%' : 'n/a'})`,
      `  Observations: ${stats.observations_total || 0} (${stats.observations_7d || 0} this week)`,
      auditPurged > 0 || obsPurged > 0 ? `  Hygiene: ${auditPurged} audit entries + ${obsPurged} stale observations purged` : null,
    ];

    // ── Memory Bridge: weekly compression of daily logs ──
    try {
      const memBridge = require('../services/memoryBridge');
      const compResult = memBridge.compressWeeklyLogs();
      if (compResult.compressed > 0) {
        outputLines.push(`  Memory: ${compResult.compressed} weekly summaries created, ${compResult.archived} daily logs archived`);
      }
    } catch (memErr) {
      console.warn('[BrainDistillation] Memory compression failed (non-fatal):', memErr.message);
    }

    const outputText = outputLines.filter(Boolean).join('\n');
    return { outputText, durationMs, costUsd: 0, extra: { distillResult: result, brainStats: stats, auditPurged, obsPurged } };
  },

  daily_debrief: async ({ message, runId, agent }) => {
    const { collectDebrief } = require('../services/debriefCollector');
    const startTime = Date.now();

    const params = parseMessageParams(message);
    const data = await collectDebrief(params.date || undefined);

    // ── Compact summary for LLM — avoids Windows 8191 char command-line limit ──
    // Previously: JSON.stringify(data, null, 2) → 10-20K chars → CLI overflow.
    // Now: human-readable compact summary < 3000 chars.
    const r = data.runs;
    const failedList = r.runs.filter(x => x.status === 'failed').map(x => `${x.agent}: ${(x.error || '').slice(0, 60)}`);
    const topCostAgents = data.costs.byAgent.filter(a => a.cost > 0).slice(0, 5).map(a => `${a.agent}: $${a.cost.toFixed(4)} (${a.runs} runs)`);

    const summary = [
      `Date: ${data.date}`,
      ``,
      `RUNS: ${r.total} total | ${r.completed} completed | ${r.failed} failed | ${r.pending} pending`,
      `Cost today: $${r.totalCost.toFixed(4)} | Yesterday: $${r.yesterday.cost.toFixed(4)}`,
      `Duration: ${(r.totalDurationMs / 1000).toFixed(0)}s total`,
      failedList.length > 0 ? `Failed: ${failedList.join('; ')}` : 'No failures',
      topCostAgents.length > 0 ? `Top cost: ${topCostAgents.join(', ')}` : 'All runs $0',
      ``,
      `AGENTS: ${data.agentUtilization.total} total | ${data.agentUtilization.usedToday} active today | ${data.agentUtilization.idle.length} idle`,
      ``,
      `LEADS: HOA ${data.leads.hoa.total} total (+${data.leads.hoa.newToday} today) | CFO ${data.leads.cfo.total} total (+${data.leads.cfo.newToday} today)`,
      `Cost/lead: ${data.leads.costPerLead}`,
      ``,
      `CONTENT: ${data.content.queueDepth} pending in queue`,
      ``,
      `TRADING: ${data.trading.status}${data.trading.status === 'online' ? ` | ${data.trading.positions} positions | $${data.trading.totalValue.toFixed(2)} value | P&L: $${data.trading.unrealizedPnl.toFixed(2)}` : ''}`,
      ``,
      `COSTS: Today $${data.costs.today.toFixed(4)} | Week $${data.costs.thisWeek.toFixed(4)} | All-time $${data.costs.allTime.toFixed(4)} | Avg daily $${data.costs.avgDaily.toFixed(4)} | Projected monthly $${data.costs.projectedMonthly.toFixed(2)}`,
    ].join('\n');

    // ── Deterministic report — $0, instant, never fails ──
    // LLM was wasting $0.04/run to produce "give me the JSON" responses.
    // CLAUDE.md Rule 1: "Value over novelty." Numbers don't need personality.
    const outputText = [
      `### DAILY DEBRIEF — ${data.date}`,
      ``,
      `**AGENT OPS:** ${r.completed}/${r.total} runs completed | ${r.failed} failed | $${r.totalCost.toFixed(4)} spent`,
      r.failed > 0 ? `**FAILURES:** ${failedList.join('; ')}` : null,
      topCostAgents.length > 0 ? `**TOP COST:** ${topCostAgents.join(' | ')}` : null,
      `**UTILIZATION:** ${data.agentUtilization.usedToday}/${data.agentUtilization.total} agents active`,
      ``,
      `**LEADS:** HOA ${data.leads.hoa.total} (+${data.leads.hoa.newToday}) | CFO ${data.leads.cfo.total} (+${data.leads.cfo.newToday}) | Cost/lead: ${data.leads.costPerLead}`,
      `**CONTENT:** ${data.content.queueDepth} pending`,
      data.trading.status === 'online'
        ? `**TRADING:** ${data.trading.positions} positions | $${data.trading.totalValue.toFixed(2)} value | P&L: $${data.trading.unrealizedPnl.toFixed(2)}`
        : `**TRADING:** offline`,
      ``,
      `**COSTS:** Today $${data.costs.today.toFixed(4)} | Week $${data.costs.thisWeek.toFixed(4)} | All-time $${data.costs.allTime.toFixed(4)} | Projected monthly $${data.costs.projectedMonthly.toFixed(2)}`,
      ``,
      r.failed > 0 ? `**STATUS: ISSUES** — ${r.failed} failure(s) need attention` : `**STATUS: GREEN** — all systems nominal`,
    ].filter(Boolean).join('\n');

    // Post to Discord
    try {
      const discord = require('../services/discordNotifier');
      const newLeads = data.leads.hoa.newToday + data.leads.cfo.newToday;
      await discord.sendEmbed({
        title: `Daily Debrief — ${data.date}`,
        color: r.failed > 0 ? 0xff4444 : newLeads > 0 ? 0x22c55e : 0x5865f2,
        description: outputText,
        fields: [
          { name: 'Runs', value: `${r.completed}/${r.total} | $${r.totalCost.toFixed(4)}`, inline: true },
          { name: 'Leads', value: `+${newLeads} new`, inline: true },
          { name: 'Trading', value: data.trading.status === 'online' ? `$${data.trading.unrealizedPnl.toFixed(2)} P&L` : 'offline', inline: true },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'Deterministic debrief — $0' },
      });
    } catch {}

    return { outputText, durationMs: Date.now() - startTime, costUsd: 0, tokensUsed: 0 };
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

  // ── Urgency / Intent Scorer — ClawOps 2.0 Upgrade A ──────────────────────
  // Scores every lead 0-100 across Fit/Pain/Timeliness/Enrichment dimensions.
  // Dual-product: scores cfo_leads (Jake pipeline) + lg_engagement_queue (HOA).
  // $0/run — pure SQLite reads + writes, no LLM, no external calls.
  urgency_scorer: async ({ message, runId, agent }) => {
    const { runUrgencyScorer } = require('../services/urgencyScorer');
    const startTime = Date.now();
    const params = parseMessageParams(message);
    const result = await runUrgencyScorer({
      limit:   parseInt(params.limit)   || 300,
      product: params.product           || 'both',
    });
    return {
      outputText: result.summary,
      durationMs: Date.now() - startTime,
      costUsd: 0,
      extra: {
        leads_scored:        result.leads.scored,
        leads_avg_score:     result.leads.avg_score,
        engagements_scored:  result.engagements.scored,
        top_leads:           result.leads.top_leads,
      },
    };
  },

  // ── Lead Dossier Generator — ClawOps 2.0 Upgrade B ───────────────────────
  // Assembles a personalized Markdown dossier for each lead:
  //   situation snapshot · pain narrative · brain episodes · KB angles · CTA.
  // Dual-product (Jake + HOA). $0/run — pure string assembly + DB reads.
  // Message params:
  //   { lead_id, product }            → single lead
  //   { batch: true, product, limit } → batch mode (top urgency leads)
  lead_dossier_generator: async ({ message, runId, agent }) => {
    const { generateDossier, generateEngagementDossier, generateDossierForBatch } = require('../services/leadDossierGenerator');
    const startTime = Date.now();
    const params = parseMessageParams(message);

    // Single-lead mode
    if (params.lead_id) {
      const product = params.product || 'jake';
      const entityType = params.entity_type || 'cfo_lead';

      if (entityType === 'hoa_engagement') {
        const result = await generateEngagementDossier(parseInt(params.lead_id));
        const durationMs = Date.now() - startTime;
        return {
          outputText: `Dossier generated for HOA engagement #${params.lead_id} — ${result.length} chars | sources: ${JSON.stringify(result.sourcesUsed)}`,
          durationMs,
          costUsd: 0,
          extra: { lead_id: params.lead_id, length: result.length, sourcesUsed: result.sourcesUsed },
        };
      }

      const result = await generateDossier(parseInt(params.lead_id), product);
      const durationMs = Date.now() - startTime;
      return {
        outputText: `Dossier generated for lead #${params.lead_id} (${product}) — ${result.length} chars | sources: ${JSON.stringify(result.sourcesUsed)}`,
        durationMs,
        costUsd: 0,
        extra: { lead_id: params.lead_id, product, length: result.length, sourcesUsed: result.sourcesUsed },
      };
    }

    // Batch mode
    const batchResult = await generateDossierForBatch(
      params.product || 'both',
      parseInt(params.limit) || 50
    );
    const durationMs = Date.now() - startTime;
    return {
      outputText: batchResult.summary,
      durationMs,
      costUsd: 0,
      extra: {
        generated:   batchResult.generated,
        errors:      batchResult.errors,
        rate_limited: batchResult.rateLimited,
      },
    };
  },

  // ── Pipeline State Tracker — ClawOps 2.0 Upgrade C ──────────────────────
  // Recomputes pipeline_stage for every active lead. Flags stalled leads.
  // Posts Discord alert if stalled leads found. $0/run.
  pipeline_state_tracker: async ({ message, runId, agent }) => {
    const { computeAllStates } = require('../services/pipelineStateTracker');
    const startTime = Date.now();
    const params = parseMessageParams(message);
    const result = await computeAllStates(params.product || 'both');
    const durationMs = Date.now() - startTime;

    const jakeStats = result.jake;
    const hoaStats  = result.hoa;

    const outputText = [
      `Pipeline State Tracker: computed in ${(durationMs / 1000).toFixed(1)}s`,
      jakeStats ? `  Jake: ${jakeStats.total} leads — ${jakeStats.changed} stage changes, ${jakeStats.stalled} stalled` : null,
      jakeStats ? `    Stages: ${Object.entries(jakeStats.byStage).map(([s,n])=>`${s}:${n}`).join(' | ')}` : null,
      hoaStats  ? `  HOA:  ${hoaStats.total} engagements — ${hoaStats.changed} stage changes, ${hoaStats.stalled} stalled` : null,
      result.total_stalled > 0 ? `  ⚠️  ${result.total_stalled} stalled leads — Discord alert sent` : `  ✅ No stalled leads`,
    ].filter(Boolean).join('\n');

    return {
      outputText,
      durationMs,
      costUsd: 0,
      extra: { jakeStats, hoaStats, total_stalled: result.total_stalled },
    };
  },

  // ── Pipeline Director — ClawOps 2.0 Upgrade C ───────────────────────────
  // Dispatches next actions for all ready leads (enrich, dossier, outreach,
  // follow-up, book-call). Posts Discord summary. Respects daily budget cap.
  pipeline_director: async ({ message, runId, agent }) => {
    const { runDirectorCycle } = require('../services/pipelineDirector');
    const startTime = Date.now();
    const result = await runDirectorCycle();
    const durationMs = Date.now() - startTime;

    // ── Dispatch audit trail — log every decision the director makes ──
    try {
      run(
        `INSERT INTO audit_log (id, action, resource, details, outcome) VALUES (lower(hex(randomblob(16))), 'pipeline_dispatch', ?, ?, ?)`,
        [
          'agent:pipeline-director',
          JSON.stringify({
            run_id: runId,
            plan: result.plan,
            total_stalled: result.stateResult?.total_stalled || 0,
            actions_dispatched: result.plan?.length || 0,
          }),
          (result.plan?.length || 0) > 0 ? 'success' : 'failure',
        ]
      );
    } catch {}

    // Brain Layer 1: pipeline_dispatched observation
    const actionsCount = result.plan?.length || 0;
    try {
      const brain = require('../services/collectiveBrain');
      brain.observe(
        `pipeline-${new Date().toISOString().slice(0, 10)}`,
        'pipeline-director', 'pipeline_dispatched',
        {
          subject: 'Pipeline Director Cycle',
          content: `Dispatched ${actionsCount} actions. Stalled: ${result.stateResult?.total_stalled || 0}. ${result.outputText?.slice(0, 200)}`,
          confidence: 1.0,
          metadata: { actions: actionsCount, stalled: result.stateResult?.total_stalled || 0 },
        }
      );
    } catch {}

    // Dispatch sanity check — warn if unusually high action count (possible runloop)
    if (actionsCount > 15) {
      console.warn(`[PipelineDirector] Sanity check: ${actionsCount} actions dispatched in one cycle (threshold: 15)`);
      try {
        const discord = require('../services/discordNotifier');
        discord.sendEmbed({
          title: 'Pipeline Director: High Dispatch Volume',
          description: `Dispatched ${actionsCount} actions in one cycle (normal max ~20, warning at 15).\nThis may indicate a dispatch loop or unusual pipeline state.\n\nStalled: ${result.stateResult?.total_stalled || 0}`,
          color: 0xff9500,
          footer: { text: 'pipeline-director' },
        });
      } catch {}
    }

    return {
      outputText: result.outputText,
      durationMs,
      costUsd: 0,
      extra: {
        plan: result.plan,
        total_stalled: result.stateResult?.total_stalled || 0,
      },
    };
  },

  // ── Opportunity Engine — Tier 1: Signal Scanner ─────────────────────────
  // Cycles through enabled scanners (Reddit, HN, PH, etc.), ingests signals,
  // classifies via Ollama ($0), clusters via semantic fingerprints.
  opportunity_scanner: async ({ message, runId, agent }) => {
    const ingest = require('../services/signalIngest');
    const startTime = Date.now();
    const params = parseMessageParams(message);

    // Load all enabled scanners
    const { all: dbAll } = require('../db/connection');
    const enabledScanners = dbAll("SELECT scanner_name, last_cursor FROM opp_scanner_state WHERE enabled = 1");

    const scannerModules = {
      reddit:         () => require('../services/scanners/redditScanner'),
      hn:             () => require('../services/scanners/hnScanner'),
      ph:             () => require('../services/scanners/phScanner'),
      github:         () => require('../services/scanners/githubScanner'),
      twitter:        () => require('../services/scanners/twitterScanner'),
      forum:          () => require('../services/scanners/forumScanner'),
      trends:         () => require('../services/scanners/trendsScanner'),
      stackoverflow:  () => require('../services/scanners/stackoverflowScanner'),
      indeed:         () => require('../services/scanners/indeedScanner'),
      indiehackers:   () => require('../services/scanners/indieHackersScanner'),
    };

    let totalNew = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    const scannerResults = [];

    // Run specific scanner if requested, otherwise all enabled
    const targetScanners = params.scanner
      ? enabledScanners.filter(s => s.scanner_name === params.scanner)
      : enabledScanners;

    for (const scanner of targetScanners) {
      const loader = scannerModules[scanner.scanner_name];
      if (!loader) {
        console.log(`[OppScanner] No module for scanner: ${scanner.scanner_name}`);
        continue;
      }

      try {
        const mod = loader();
        const state = ingest.getScannerState(scanner.scanner_name);
        const result = await mod.scan(state.last_cursor);

        let inserted = 0;
        let skipped = 0;
        for (const signal of result.signals) {
          const r = ingest.ingestSignal(scanner.scanner_name, signal);
          if (r) inserted++;
          else skipped++;
        }

        ingest.updateScannerState(scanner.scanner_name, result.nextCursor, inserted, result.errors);
        totalNew += inserted;
        totalSkipped += skipped;
        totalErrors += result.errors;

        scannerResults.push({ scanner: scanner.scanner_name, found: result.signals.length, inserted, skipped, errors: result.errors });
      } catch (err) {
        console.error(`[OppScanner] ${scanner.scanner_name} failed:`, err.message);
        totalErrors++;
        scannerResults.push({ scanner: scanner.scanner_name, error: err.message });
      }
    }

    // Classify new signals via Ollama ($0)
    const classifyResult = await ingest.classifyBatch(params.classify_limit || 50);

    const durationMs = Date.now() - startTime;
    const stats = ingest.getStats();

    const outputText = [
      `Opportunity Scanner: ${totalNew} new signals, ${totalSkipped} dupes, ${totalErrors} errors in ${(durationMs / 1000).toFixed(1)}s`,
      `  Classified: ${classifyResult.classified} valid, ${classifyResult.noise} noise, ${classifyResult.errors} errors`,
      `  Totals: ${stats.signals_total} signals, ${stats.clusters_total} clusters, ${stats.clusters_hot} hot (score≥75)`,
      ...scannerResults.map(r => r.error
        ? `  ❌ ${r.scanner}: ${r.error}`
        : `  ✅ ${r.scanner}: ${r.found} found, ${r.inserted} new`
      ),
    ].join('\n');

    return { outputText, durationMs, costUsd: 0, extra: { totalNew, totalSkipped, classifyResult, stats } };
  },

  // ── Opportunity Engine — Tier 1: Cluster Scorer ─────────────────────────
  // Scores clusters with signal_count >= 3 using ICE+RPS+ALS via GPT-4o.
  // Falls back to Ollama if budget cap reached. ~$0.01/cluster.
  opportunity_scorer: async ({ message, runId, agent }) => {
    const { scoreBatch } = require('../services/opportunityScorer');
    const startTime = Date.now();
    const params = parseMessageParams(message);

    const result = await scoreBatch({
      limit: parseInt(params.limit) || 10,
      useLLM: params.use_ollama !== 'true',
      budget_cap_usd: parseFloat(params.budget_cap) || 0.50,
    });

    const durationMs = Date.now() - startTime;
    const outputText = [
      `Opportunity Scorer: ${result.scored}/${result.clusters_checked} clusters scored in ${(durationMs / 1000).toFixed(1)}s`,
      `  Cost: $${result.total_cost.toFixed(4)} | Skipped: ${result.skipped}`,
      result.top_cluster
        ? `  🔥 Top: "${result.top_cluster.pain_summary}" — ${result.top_cluster.composite}/100 (${result.top_cluster.template || 'TBD'})`
        : `  No clusters qualified for scoring (need signal_count >= 3)`,
    ].join('\n');

    return { outputText, durationMs, costUsd: result.total_cost, extra: result };
  },

  // ── Opportunity Engine — Tier 2: Software Factory ───────────────────────
  // Picks top scored cluster (composite >= 75), scaffolds prototype via
  // DeepSeek Coder V2 ($0) or GPT-4o fallback (~$0.10), runs basic QA,
  // writes launch copy, saves files to data/prototypes/{name}/.
  // Message params: { cluster_id } for single build, or omit for batch (top 1).
  software_factory: async ({ message, runId, agent }) => {
    const { buildPrototype, runFactoryBatch } = require('../services/softwareFactory');
    const startTime = Date.now();
    const params = parseMessageParams(message);

    let result;
    if (params.cluster_id) {
      // Single cluster build
      result = await buildPrototype(parseInt(params.cluster_id));
    } else {
      // Batch mode — picks top unbuilt scored cluster
      result = await runFactoryBatch();
    }

    const durationMs = Date.now() - startTime;

    if (!result.built) {
      return {
        outputText: result.summary || 'Software Factory: No clusters ready for prototyping (need composite >= 75 and status = scored)',
        durationMs,
        costUsd: 0,
      };
    }

    const outputText = [
      result.summary,
      `  Template: ${result.template} | Product: ${result.product_name}`,
      `  Files: ${result.files_count} | QA: ${result.qa_passed ? 'PASSED' : 'ISSUES FOUND'}`,
      `  Path: ${result.output_dir}`,
      `  Cost: $${(result.cost_usd || 0).toFixed(4)} | Duration: ${(durationMs / 1000).toFixed(1)}s`,
      result.qa_passed ? '  Status: BUILT — ready for Ralph deep QA' : '  Status: BUILT — QA issues flagged, review needed',
    ].join('\n');

    return {
      outputText,
      durationMs,
      costUsd: result.cost_usd || 0,
      extra: {
        cluster_id: result.cluster_id,
        prototype_id: result.prototype_id,
        product_name: result.product_name,
        template: result.template,
        files_count: result.files_count,
        qa_passed: result.qa_passed,
      },
    };
  },

  // ── Opportunity Engine — Tier 3: Traction Monitor ───────────────────────
  // Checks deployed prototypes daily: page views, stars, signups, revenue.
  // 14-day kill gate: auto-kill if traction_score < threshold at day 14.
  // Alerts Steve if traction_score > threshold for scale decision.
  // $0/run — reads from opp_prototypes + opp_traction tables.
  traction_monitor: async ({ message, runId, agent }) => {
    const { get: dbGet, all: dbAll, run: dbRun } = require('../db/connection');
    const discord = require('../services/discordNotifier');
    const startTime = Date.now();

    // Find all deployed/monitoring prototypes
    const prototypes = dbAll(
      "SELECT p.*, c.pain_summary FROM opp_prototypes p JOIN opp_clusters c ON p.cluster_id = c.id WHERE p.status IN ('deployed', 'monitoring')"
    );

    if (!prototypes || prototypes.length === 0) {
      return {
        outputText: 'Traction Monitor: No deployed prototypes to monitor',
        durationMs: Date.now() - startTime,
        costUsd: 0,
      };
    }

    const today = new Date().toISOString().slice(0, 10);
    let monitored = 0;
    let killed = 0;
    let alertedSteve = 0;
    const results = [];

    for (const proto of prototypes) {
      // Check if we already have today's traction entry
      const existing = dbGet(
        "SELECT id FROM opp_traction WHERE prototype_id = ? AND date = ?",
        [proto.id, today]
      );

      if (!existing) {
        // Insert placeholder traction entry (real metrics filled by deploy integrations)
        const tractionScore = 0; // Will be computed when real data comes in
        dbRun(
          `INSERT INTO opp_traction (prototype_id, date, page_views, signups, github_stars, mentions, revenue_cents, traction_score)
           VALUES (?, ?, 0, 0, 0, 0, 0, ?)`,
          [proto.id, today, tractionScore]
        );
      }

      // Get latest traction score
      const latestTraction = dbGet(
        "SELECT traction_score, revenue_cents FROM opp_traction WHERE prototype_id = ? ORDER BY date DESC LIMIT 1",
        [proto.id]
      );

      // Calculate days since deploy
      const deployedAt = proto.deployed_at ? new Date(proto.deployed_at) : null;
      const daysSinceDeploy = deployedAt
        ? Math.floor((Date.now() - deployedAt.getTime()) / 86400000)
        : null;

      const tractionScore = latestTraction?.traction_score || 0;
      const revenue = latestTraction?.revenue_cents || 0;

      // Revenue alert — immediate escalation
      if (revenue > 0) {
        try {
          discord.postWebhook({
            embeds: [{
              title: '💰 REVENUE DETECTED — Prototype generating money!',
              color: 0x00ff00,
              fields: [
                { name: 'Prototype', value: proto.product_name || proto.id, inline: true },
                { name: 'Revenue', value: `$${(revenue / 100).toFixed(2)}`, inline: true },
                { name: 'Pain', value: proto.pain_summary || 'Unknown', inline: false },
                { name: 'Days Live', value: String(daysSinceDeploy || '?'), inline: true },
              ],
              timestamp: new Date().toISOString(),
            }],
          });
        } catch {}
        alertedSteve++;
      }

      // 14-day kill gate
      if (daysSinceDeploy !== null && daysSinceDeploy >= 14 && tractionScore < 20 && revenue === 0) {
        dbRun("UPDATE opp_prototypes SET status = 'killed', updated_at = datetime('now') WHERE id = ?", [proto.id]);
        dbRun("UPDATE opp_clusters SET status = 'killed', updated_at = datetime('now') WHERE id = ?", [proto.cluster_id]);
        killed++;
        try {
          discord.postWebhook({
            embeds: [{
              title: '💀 Prototype killed — 14-day gate failed',
              color: 0xff0000,
              fields: [
                { name: 'Prototype', value: proto.product_name || proto.id, inline: true },
                { name: 'Traction Score', value: String(tractionScore), inline: true },
                { name: 'Pain', value: proto.pain_summary || 'Unknown', inline: false },
              ],
            }],
          });
        } catch {}
      }

      // Day 7 early alert if traction is promising
      if (daysSinceDeploy !== null && daysSinceDeploy >= 7 && daysSinceDeploy < 14 && tractionScore >= 50) {
        try {
          discord.postWebhook({
            embeds: [{
              title: '🚀 Prototype showing traction at day 7!',
              color: 0x5865f2,
              fields: [
                { name: 'Prototype', value: proto.product_name || proto.id, inline: true },
                { name: 'Traction Score', value: String(tractionScore), inline: true },
                { name: 'Pain', value: proto.pain_summary || 'Unknown', inline: false },
              ],
            }],
          });
        } catch {}
        alertedSteve++;
      }

      // Day 7 early kill if zero traction
      if (daysSinceDeploy !== null && daysSinceDeploy >= 7 && tractionScore === 0 && revenue === 0) {
        dbRun("UPDATE opp_prototypes SET status = 'killed', updated_at = datetime('now') WHERE id = ?", [proto.id]);
        dbRun("UPDATE opp_clusters SET status = 'killed', updated_at = datetime('now') WHERE id = ?", [proto.cluster_id]);
        killed++;
      }

      results.push({
        name: proto.product_name || proto.id,
        days: daysSinceDeploy,
        traction: tractionScore,
        revenue,
      });
      monitored++;
    }

    const durationMs = Date.now() - startTime;
    const outputText = [
      `Traction Monitor: ${monitored} prototypes checked, ${killed} killed, ${alertedSteve} alerts sent`,
      ...results.map(r => `  ${r.name}: day ${r.days || '?'}, traction=${r.traction}, revenue=$${((r.revenue || 0) / 100).toFixed(2)}`),
    ].join('\n');

    return {
      outputText,
      durationMs,
      costUsd: 0,
      extra: { monitored, killed, alertedSteve, results },
    };
  },

  // ── Idle Training v2 — Two-layer architecture with QA gate ──────────────
  // Layer 1: Heartbeat triage decides activity type (reflection > corpus > YouTube)
  // Layer 2: Deep training via queue → skill candidates → QA grading → promotion
  // Modes: { mode: 'train' } (default), { mode: 'promote' }, { mode: 'stats' }
  //        { agent_id } for specific agent, { max_agents } for batch (default 3)
  idle_training: async ({ message, runId, agent }) => {
    const trainer = require('../services/idleTrainer');
    const startTime = Date.now();
    const params = parseMessageParams(message);
    const mode = params.mode || (params.stats ? 'stats' : params.agent_id ? 'single' : 'train');

    // ── Stats mode ──
    if (mode === 'stats') {
      const stats = trainer.getTrainingStats();
      const capacity = trainer.getSystemCapacity();
      const gates = trainer.checkTrainingGates();
      const durationMs = Date.now() - startTime;
      const outputText = [
        `Training Stats (v2):`,
        `  Sessions: ${stats.totalSessions} | Skills: ${stats.totalSkills} | Agents: ${stats.uniqueAgents} | Max level: ${stats.maxLevel}`,
        `  Candidates: ${stats.candidates.pending} pending, ${stats.candidates.approved} approved, ${stats.candidates.rejected} rejected (avg QA: ${stats.candidates.avgScore})`,
        `  Queue depth: ${stats.queueDepth} | By activity: ${stats.byActivity.map(a => `${a.activity_type}:${a.count}`).join(', ') || 'none yet'}`,
        `  System: CPU ${capacity.cpuPercent}%, RAM ${capacity.ramPercent}% | Gates: ${gates.allowed ? 'OPEN' : gates.reason}`,
        stats.recentQuip ? `  Latest quip: ${stats.recentQuip}` : null,
        stats.topSkilled.length > 0 ? `  Top agents: ${stats.topSkilled.map(a => `${a.agent_name}(${a.total_levels}pts)`).join(', ')}` : null,
      ].filter(Boolean).join('\n');
      return { outputText, durationMs, costUsd: 0, extra: { ...stats, capacity, gates } };
    }

    // ── Promote mode — just run QA grading + promotion ──
    if (mode === 'promote') {
      const qa = require('../services/trainingQA');
      const qaResult = await qa.runQACycle(parseInt(params.limit) || 10);
      const durationMs = Date.now() - startTime;
      const outputText = [
        `QA Promotion Cycle: ${qaResult.graded} graded → ${qaResult.promoted} promoted, ${qaResult.rejected} rejected, ${qaResult.skipped} pending re-eval`,
      ].join('\n');
      return { outputText, durationMs, costUsd: 0, extra: qaResult };
    }

    // ── Single agent mode ──
    if (mode === 'single' || params.agent_id) {
      const result = await trainer.runTrainingSession(params.agent_id);
      const durationMs = Date.now() - startTime;
      if (result.skipped) {
        return { outputText: `Idle Training: Skipped — ${result.reason}`, durationMs, costUsd: 0 };
      }
      const outputText = [
        `${result.activityType === 'reflection' ? '\ud83d\udcad' : result.activityType === 'internal_corpus' ? '\ud83c\udfc6' : '\ud83c\udfac'} ${result.agent} — ${result.activityType} training`,
        `  Topic: "${result.topic}"`,
        result.video ? `  Video: ${result.video.title}` : null,
        `  Skill candidate: ${result.skillName || 'none'} (pending QA) | Duration: ${(result.durationMs / 1000).toFixed(1)}s`,
        `  \ud83d\udca1 ${result.quip}`,
      ].filter(Boolean).join('\n');
      return { outputText, durationMs, costUsd: 0, extra: result };
    }

    // ── Full training cycle (default) — queue + train + QA ──
    const maxAgents = parseInt(params.max_agents) || 3;
    const result = await trainer.runTrainingCycle(maxAgents);
    const durationMs = Date.now() - startTime;
    return {
      outputText: result.summary,
      durationMs,
      costUsd: 0,
      extra: { trained: result.trained, skipped: result.skipped, queued: result.queued, qa: result.qa },
    };
  },

  // ── Revenue Signal Engine ─────────────────────────────────────────────────

  rse_channel_monitor: async ({ message, runId, agent }) => {
    const { discoverNewVideos } = require('../services/rseTranscriptService');
    const startTime = Date.now();
    const result = await discoverNewVideos();
    const durationMs = Date.now() - startTime;
    return {
      outputText: `RSE Channel Monitor: checked ${result.sourcesChecked} sources, found ${result.totalNew} new videos`,
      durationMs,
      costUsd: 0,
      extra: result,
    };
  },

  rse_transcript_extractor: async ({ message, runId, agent }) => {
    const { extractPendingTranscripts } = require('../services/rseTranscriptService');
    const startTime = Date.now();
    const params = parseMessageParams(message);
    const limit = parseInt(params.limit) || 15;
    const result = await extractPendingTranscripts(limit);
    const durationMs = Date.now() - startTime;
    return {
      outputText: `RSE Transcript Extractor: ${result.extracted} extracted, ${result.failed} failed, ${result.skipped} too short (${result.total} total)`,
      durationMs,
      costUsd: 0,
      extra: result,
    };
  },

  rse_signal_scorer: async ({ message, runId, agent }) => {
    const { scoreBatch } = require('../services/rseSignalScorer');
    const startTime = Date.now();
    const params = parseMessageParams(message);
    const limit = parseInt(params.limit) || 10;
    const result = await scoreBatch(limit);
    const durationMs = Date.now() - startTime;

    // Brain observation for accepted signals
    try {
      const brain = require('../services/collectiveBrain');
      for (const r of result.results) {
        if (r.accepted > 0) {
          brain.observe(runId, 'rse-signal-scorer', 'market_insight', {
            subject: r.title,
            content: `New signals from "${r.title}": ${r.accepted} accepted, ${r.rejected} rejected`,
            confidence: 0.8,
            metadata: { transcript_id: r.id, accepted: r.accepted },
          });
        }
      }
    } catch {}

    // Discord notification for new signals
    if (result.accepted > 0) {
      try {
        const discord = require('../services/discordNotifier');
        const { all: dbAll } = require('../db/connection');
        const recentSignals = dbAll(
          `SELECT sig.title, sig.composite_score, sig.signal_type, s.name AS source_name
           FROM rse_signals sig JOIN rse_sources s ON s.id = sig.source_id
           ORDER BY sig.created_at DESC LIMIT ?`, [result.accepted]
        );
        const signalList = recentSignals.map(s =>
          `• **${s.title}** (${s.composite_score.toFixed(1)}/5) — ${s.source_name}`
        ).join('\n');

        await discord.sendEmbed({
          title: `🎯 RSE: ${result.accepted} New Signal${result.accepted > 1 ? 's' : ''} Accepted`,
          description: `Scored ${result.scored} transcripts.\n\n${signalList}`,
          color: 0x9b59b6,
          footer: { text: `${result.rejected} rejected | Signal Engine` },
        });
      } catch {}
    }

    return {
      outputText: `RSE Signal Scorer: ${result.scored} transcripts scored, ${result.accepted} signals accepted, ${result.rejected} rejected`,
      durationMs,
      costUsd: 0,
      extra: result,
    };
  },

  rse_expert_librarian: async ({ message, runId, agent }) => {
    const { extractBatch, getLibraryStats } = require('../services/rseExpertLibrary');
    const startTime = Date.now();
    const params = parseMessageParams(message);
    const limit = parseInt(params.limit) || 10;
    const minScore = parseFloat(params.min_score) || 4.0;
    const result = await extractBatch(limit, minScore);
    const stats = getLibraryStats();
    const durationMs = Date.now() - startTime;
    return {
      outputText: `RSE Expert Librarian: ${result.extracted} patterns extracted, ${result.duplicatesSkipped} duplicates skipped. Library: ${stats.total} total (${stats.verified} verified)`,
      durationMs,
      costUsd: 0,
      extra: { ...result, libraryStats: stats },
    };
  },

  rse_code_builder: async ({ message, runId, agent }) => {
    const params = parseMessageParams(message);
    const startTime = Date.now();

    // Evaluate mode (default for scheduled runs)
    if (params.action === 'evaluate') {
      const { evaluateBatch } = require('../services/rseEvaluator');
      const limit = parseInt(params.limit) || 10;
      const result = await evaluateBatch(limit);
      const durationMs = Date.now() - startTime;
      return {
        outputText: `RSE Evaluator: ${result.evaluated} ideas evaluated, ${result.failed} failed`,
        durationMs,
        costUsd: result.evaluated * 0.003,
        extra: result,
      };
    }

    // Build mode (manual trigger only)
    const { buildFromSpec, buildBatch } = require('../services/rseCodeBuilder');
    let result;
    if (params.spec_id) {
      const buildResult = await buildFromSpec(parseInt(params.spec_id));
      result = { built: 1, failed: 0, total: 1, results: [{ specId: params.spec_id, ...buildResult }] };
    } else {
      const limit = parseInt(params.limit) || 3;
      result = await buildBatch(limit);
    }

    const durationMs = Date.now() - startTime;
    return {
      outputText: `RSE Code Builder: ${result.built} built, ${result.failed} failed (${result.total} attempted)`,
      durationMs,
      costUsd: result.results.reduce((sum, r) => sum + (r.costUsd || 0), 0),
      extra: result,
    };
  },

  rse_feedback_loop: async ({ message, runId, agent }) => {
    const { all: dbAll, run: dbRun, get: dbGet } = require('../db/connection');
    const { pruneStalePatterns } = require('../services/rseExpertLibrary');
    const startTime = Date.now();

    // 1. Update source trust scores based on acceptance rates
    const sources = dbAll('SELECT * FROM rse_sources WHERE enabled = 1 AND total_videos_scanned >= 5');
    let sourcesUpdated = 0, sourcesDisabled = 0;

    for (const source of sources) {
      const rate = source.total_videos_scanned > 0
        ? source.total_signals_accepted / source.total_videos_scanned
        : 0;
      // Trust score moves toward acceptance rate, with decay toward 0.5
      const newTrust = Math.max(0.1, Math.min(0.95, (source.trust_score * 0.7) + (rate * 0.3)));
      dbRun('UPDATE rse_sources SET trust_score = ? WHERE id = ?', [newTrust, source.id]);

      // Auto-disable sources with very low trust after enough data
      if (newTrust < 0.2 && source.total_videos_scanned >= 20) {
        dbRun('UPDATE rse_sources SET enabled = 0 WHERE id = ?', [source.id]);
        sourcesDisabled++;
        console.log(`[RSE-Feedback] Disabled low-trust source: ${source.name} (trust: ${newTrust.toFixed(2)})`);
      }
      sourcesUpdated++;
    }

    // 2. Track campaign outcomes back to signals
    const campaigns = dbAll(
      `SELECT c.*, sig.source_id FROM rse_campaigns c
       JOIN rse_signals sig ON sig.id = c.signal_id
       WHERE c.status = 'completed' AND c.leads_generated > 0`
    );

    for (const campaign of campaigns) {
      try {
        const brain = require('../services/collectiveBrain');
        brain.observe(runId, 'rse-feedback-loop', 'campaign_outcome', {
          subject: campaign.title,
          content: `Campaign "${campaign.title}" generated ${campaign.leads_generated} leads, $${(campaign.revenue_attributed_cents / 100).toFixed(2)} revenue`,
          confidence: 0.9,
          metadata: { campaign_id: campaign.id, leads: campaign.leads_generated, revenue_cents: campaign.revenue_attributed_cents },
        });
      } catch {}
    }

    // 3. Prune stale expert library patterns
    const pruneResult = pruneStalePatterns();

    const durationMs = Date.now() - startTime;
    return {
      outputText: `RSE Feedback Loop: ${sourcesUpdated} sources updated, ${sourcesDisabled} disabled, ${pruneResult.pruned} stale patterns pruned, ${campaigns.length} campaign outcomes tracked`,
      durationMs,
      costUsd: 0,
      extra: { sourcesUpdated, sourcesDisabled, pruned: pruneResult.pruned, campaignsTracked: campaigns.length },
    };
  },

  // ── Dream Team Nightly Cycle ────────────────────────────────────────────

  dream_team_nightly: async ({ message, runId, agent }) => {
    const dt = require('../services/dreamTeamNightly');
    const startTime = Date.now();
    const params = parseMessageParams(message);

    let result;
    if (params.phase === 'collect') {
      result = dt.collectDailyData();
      return { outputText: `Dream Team: Data collected for ${result.date}`, durationMs: Date.now() - startTime, costUsd: 0, extra: { phase: 'collect' } };
    } else if (params.phase === 'score') {
      const snapshot = dt.collectDailyData();
      const scorecards = await dt.scoreAgents(snapshot);
      return { outputText: `Dream Team: ${scorecards.length} agents scored`, durationMs: Date.now() - startTime, costUsd: 0.015, extra: { phase: 'score', scorecards: scorecards.length } };
    } else if (params.phase === 'report') {
      const report = await dt.buildMorningReport();
      return { outputText: `Dream Team: Morning report generated`, durationMs: Date.now() - startTime, costUsd: 0.006, extra: { phase: 'report' } };
    } else {
      // Full cycle (default for scheduled runs)
      result = await dt.runFullCycle();
      return {
        outputText: `Dream Team Nightly: ${result.scorecards} scored, ${result.proposals} proposed, ${result.approved} approved, ${result.rejected} rejected, ${result.actions} actions taken`,
        durationMs: result.durationMs,
        costUsd: 0.07,
        extra: result,
      };
    }
  },

  // ── Database Backup — daily SQLite backup with 7-day retention ──────────
  database_backup: async ({ message, runId, agent }) => {
    const { execSync } = require('child_process');
    const path = require('path');
    const startTime = Date.now();
    try {
      const scriptPath = path.join(__dirname, '../../scripts/backup-database.js');
      const output = execSync(`node "${scriptPath}"`, { encoding: 'utf8', timeout: 30000 });
      const durationMs = Date.now() - startTime;
      return { outputText: output.trim(), durationMs, costUsd: 0 };
    } catch (err) {
      return { outputText: `Backup failed: ${err.message}`, durationMs: Date.now() - startTime, costUsd: 0 };
    }
  },

  // ── Ralph QA Gate — reviews outreach drafts and content pieces ──────────
  // Deterministic scoring: subject, personalization, structure, safety, tone.
  // $0/run. Modes:
  //   { mode: 'outreach' }           — review pending outreach drafts (default)
  //   { mode: 'content' }            — review pending content pieces
  //   { mode: 'both' }               — review all pending
  //   { mode: 'stats' }              — return QA queue stats
  //   { sequence_id: 123 }           — review single outreach sequence
  ralph_qa: async ({ message, runId, agent }) => {
    const ralph = require('../services/ralphQA');
    const startTime = Date.now();
    const params = parseMessageParams(message);
    const mode = params.mode || (params.sequence_id ? 'single' : 'outreach');

    if (mode === 'stats') {
      const stats = ralph.getQAStats();
      const durationMs = Date.now() - startTime;
      return {
        outputText: [
          `Ralph QA Stats:`,
          `  Outreach: ${stats.outreach.pending || 0} pending, ${stats.outreach.passed || 0} passed, ${stats.outreach.failed || 0} failed (avg: ${stats.outreach.avg_score ? Math.round(stats.outreach.avg_score) : 'N/A'})`,
          `  Content:  ${stats.content.pending || 0} pending, ${stats.content.passed || 0} passed, ${stats.content.failed || 0} failed (avg: ${stats.content.avg_score ? Math.round(stats.content.avg_score) : 'N/A'})`,
        ].join('\n'),
        durationMs,
        costUsd: 0,
        extra: stats,
      };
    }

    if (mode === 'single' && params.sequence_id) {
      const result = ralph.reviewSingleOutreach(parseInt(params.sequence_id));
      const durationMs = Date.now() - startTime;
      return {
        outputText: `Ralph QA: Sequence #${params.sequence_id} — ${result.passed ? 'PASSED' : 'FAILED'} (${result.score}/100). ${result.notes}`,
        durationMs,
        costUsd: 0,
        extra: result,
      };
    }

    const limit = parseInt(params.limit) || 20;
    let outreachResult = { reviewed: 0, passed: 0, failed: 0, summary: '' };
    let contentResult = { reviewed: 0, passed: 0, failed: 0, summary: '' };

    if (mode === 'outreach' || mode === 'both') {
      outreachResult = ralph.reviewOutreachBatch(limit);
    }
    if (mode === 'content' || mode === 'both') {
      contentResult = ralph.reviewContentBatch(limit);
    }

    const durationMs = Date.now() - startTime;
    const totalReviewed = outreachResult.reviewed + contentResult.reviewed;
    const totalPassed = outreachResult.passed + contentResult.passed;
    const totalFailed = outreachResult.failed + contentResult.failed;

    return {
      outputText: [
        `Ralph QA Review: ${totalReviewed} items reviewed — ${totalPassed} passed, ${totalFailed} failed in ${(durationMs / 1000).toFixed(1)}s`,
        outreachResult.reviewed > 0 ? `  Outreach: ${outreachResult.summary}` : null,
        contentResult.reviewed > 0 ? `  Content: ${contentResult.summary}` : null,
        totalReviewed === 0 ? '  No pending items in QA queue' : null,
      ].filter(Boolean).join('\n'),
      durationMs,
      costUsd: 0,
      extra: { outreach: outreachResult, content: contentResult },
    };
  },

  // ── Weekly Portfolio Review — generates scorecard + posts to Discord ─────
  // Runs Friday 5PM. Computes 5-dimension scores for all active agents,
  // generates ranked report, posts summary to Discord, saves full report to file.
  // $0/run — pure DB reads + file write.
  weekly_portfolio_review: async ({ message, runId, agent }) => {
    const { computeScorecard, generateWeeklyReport } = require('../services/portfolioScorecard');
    const fs = require('fs');
    const path = require('path');
    const startTime = Date.now();

    const { agents: scored, summary } = computeScorecard();
    const report = generateWeeklyReport();

    // Save to file
    const today = new Date().toISOString().slice(0, 10);
    const reportDir = path.join(process.cwd(), 'memory', 'daily_logs', 'weekly');
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, `scorecard-${today}.md`);
    fs.writeFileSync(reportPath, report, 'utf8');

    // Post summary to Discord
    try {
      const discord = require('../services/discordNotifier');
      const topPerformers = scored.filter(a => a.composite >= 80).slice(0, 5);
      const watchList = scored.filter(a => a.composite >= 60 && a.composite < 80);
      const actionRequired = scored.filter(a => a.composite < 60);

      await discord.sendEmbed({
        title: `Portfolio Scorecard — ${today}`,
        color: actionRequired.length > 0 ? 0xff4444 : watchList.length > 0 ? 0xff9500 : 0x57f287,
        fields: [
          { name: 'Fleet', value: `${summary.total} scored | ${summary.continue_count} GO | ${summary.harden_count} HARDEN | ${summary.freeze_count} FREEZE`, inline: false },
          { name: 'Cost', value: `$${summary.total_cost_7d.toFixed(4)} / ${summary.total_runs_7d} runs`, inline: true },
          { name: 'Avg Score', value: `${summary.avg_composite}/100`, inline: true },
          { name: 'Top 5', value: topPerformers.map(a => `${a.name}: ${a.composite}`).join('\n') || 'None', inline: false },
          ...(watchList.length > 0 ? [{ name: `Watch (${watchList.length})`, value: watchList.slice(0, 5).map(a => `${a.name}: ${a.composite}`).join('\n'), inline: false }] : []),
          ...(actionRequired.length > 0 ? [{ name: `ACTION (${actionRequired.length})`, value: actionRequired.map(a => `${a.name}: ${a.composite} → ${a.action}`).join('\n'), inline: false }] : []),
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'Weekly Portfolio Review' },
      });
    } catch {}

    const durationMs = Date.now() - startTime;
    return {
      outputText: `Portfolio Review: ${summary.total} agents — ${summary.continue_count} GO, ${summary.harden_count} HARDEN, ${summary.freeze_count} FREEZE | Avg: ${summary.avg_composite}/100 | $${summary.total_cost_7d.toFixed(4)}`,
      durationMs,
      costUsd: 0,
      extra: summary,
    };
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

    // 0. Daily cost cap — circuit breaker to prevent runaway GPT-4o spend
    const dailyCostCap = parseFloat(
      (get("SELECT value FROM settings WHERE key='daily_cost_cap'") || {}).value || '5.00'
    );
    const todayCost = get(
      "SELECT COALESCE(SUM(cost_usd), 0) AS total FROM runs WHERE DATE(created_at) = DATE('now') AND status = 'completed'"
    );
    if (todayCost && todayCost.total >= dailyCostCap) {
      console.warn(`[Runs] Daily cost cap reached: $${todayCost.total.toFixed(4)} >= $${dailyCostCap}`);
      throw new AppError(
        `Daily cost cap reached ($${todayCost.total.toFixed(2)} / $${dailyCostCap}). Wait until tomorrow or increase 'daily_cost_cap' in Settings.`,
        'DAILY_COST_CAP_REACHED', 429
      );
    }

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

    // ── OPENCLAW / OLLAMA AGENT EXECUTION ────────────────────────────────
    const openclawId = agentConfig.openclaw_id;

    // Route to Ollama if: global ollama_enabled=true AND agent has use_ollama:true
    const ollamaEnabled = get("SELECT value FROM settings WHERE key='ollama_enabled'")?.value === 'true';
    const useOllama = ollamaEnabled && (agentConfig.use_ollama === true);
    const ollamaModel = get("SELECT value FROM settings WHERE key='ollama_model'")?.value || 'llama3.2:3b';

    if (!useOllama && !openclawId) {
      markRunFailed(runId, agent.id, 'Agent not registered with OpenClaw');
      throw new AppError(`Agent "${agent.name}" has no openclaw_id configured.`, 'AGENT_NOT_REGISTERED', 400);
    }

    const RUN_TIMEOUT_MS = parseInt(process.env.MAX_DURATION_PER_RUN || '300', 10) * 1000;
    const withTimeout = (promise, ms) =>
      Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error(`Agent timed out after ${ms / 1000}s`)), ms))]);

    try {
      if (useOllama) {
        emitLog(`Starting Ollama agent "${agent.name}" (${ollamaModel} — free local inference)...`);
      } else {
        emitLog(`Starting OpenClaw agent "${agent.name}" (${openclawId})...`);
      }

      const activeBridge = useOllama
        ? require('../services/ollamaBridge')
        : require('../services/openclawBridge');

      const runResult = await withTimeout(
        activeBridge.runAgent(useOllama ? agent.name : agent.id, { openclawId, message, sessionId, ollamaModel }),
        RUN_TIMEOUT_MS
      );

      emitLog(`Agent "${agent.name}" completed.`);

      // Parse output (same format for both OpenClaw and Ollama bridges)
      let durationMs = null, tokensUsed = 0, costUsd = 0, outputText = '';
      try {
        const parsed = JSON.parse(runResult.output || '{}');
        if (parsed.payloads?.[0]?.text) {
          // Native OpenClaw / Ollama bridge format
          outputText = parsed.payloads[0].text;
          durationMs = parsed.meta?.durationMs || null;
          const usage = parsed.meta?.agentMeta?.usage || {};
          tokensUsed = usage.total || ((usage.input || 0) + (usage.output || 0));
          costUsd = useOllama ? 0 : ((usage.input || 0) * 0.0000025 + (usage.output || 0) * 0.00001);
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

      // Validate LLM output against expected schema
      const { validateAgentOutput, recordOutputQuality } = require('../services/outputValidator');
      let parsedOutput = null;
      try { parsedOutput = JSON.parse(outputText); } catch {}
      const validation = validateAgentOutput(agent.name, parsedOutput, outputText);
      recordOutputQuality(agent.name, runId, validation.score, validation.errors.length, validation.warnings.length);

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
