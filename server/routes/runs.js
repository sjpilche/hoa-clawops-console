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

  // ── Failure alerts — fire-and-forget, never block the caller ──
  try {
    const agent = get('SELECT name FROM agents WHERE id=?', [agentId]);
    const agentName = agent?.name || agentId;
    require('../services/discordNotifier').notifyRunCompleted({
      agentName, status: 'failed', errorMsg, runId,
    });
  } catch { /* non-fatal */ }
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

    // Brain Layer 3: record discovery episode for signal performance tracking
    try {
      const brain = require('../services/collectiveBrain');
      brain.recordEpisode('hoa-discovery', {
        market: topTarget,
        actionTaken: `Google Maps HOA discovery: ${result.queries_run || 0} queries`,
        outcome: `Found ${totalNew} new HOA communities in ${topTarget}`,
        outcomeType: 'discovery',
        outcomeScore: totalNew > 10 ? 0.8 : totalNew > 0 ? 0.6 : 0.2,
        signalSource: 'maps_discovery',
      });
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
    const startTime = Date.now();
    const crypto = require('crypto');

    let params = parseMessageParams(message);
    if (!params.limit) {
      const text = parseTextParams(message, {
        limit: /limit[:\s]+(\d+)/i,
      });
      params = { ...params, ...text };
    }

    const defaults = agentConfig.default_params || {};
    const parsedLimit = parseInt(params.limit || defaults.limit || 15);

    // ── Enrich HOA communities via Apollo searchPeople on management companies ──
    // The 182 hoa_communities have management_company names but 0 contacts.
    // We search Apollo for property manager contacts at each mgmt company.
    const apollo = require('../services/apolloEnricher');

    // Find communities needing enrichment (contact_enrichment_status = 'pending')
    const communities = all(`
      SELECT id, name, management_company, city, state
      FROM hoa_communities
      WHERE contact_enrichment_status = 'pending'
        AND management_company IS NOT NULL
      ORDER BY id
      LIMIT ?
    `, [parsedLimit]);

    console.log(`[hoa_contact_enricher] Found ${communities.length} communities to enrich via Apollo`);

    let successCount = 0;
    let failedCount = 0;
    const results = [];
    const HOA_TITLES = ['Property Manager', 'Community Manager', 'HOA Manager', 'General Manager', 'Regional Manager', 'Community Association Manager', 'President'];

    for (let i = 0; i < communities.length; i++) {
      const comm = communities[i];
      try {
        // Mark in-progress
        run(`UPDATE hoa_communities SET contact_enrichment_status = 'in_progress' WHERE id = ?`, [comm.id]);

        const location = [comm.city, comm.state || 'Florida'].filter(Boolean).join(', ') || undefined;
        const people = await apollo.searchAndReveal({
          companyName: comm.management_company,
          location,
          titles: HOA_TITLES,
          limit: 3,
        });

        let contactsInserted = 0;
        for (const person of people) {
          if (!person.email && !person.name) continue;

          const fingerprint = crypto.createHash('md5')
            .update(`${(person.name || '').toLowerCase()}|${(person.email || '').toLowerCase()}|${comm.management_company.toLowerCase()}`)
            .digest('hex');

          // Check for duplicate
          const existing = get(`SELECT id FROM hoa_contacts WHERE fingerprint = ?`, [fingerprint]);
          if (existing) continue;

          run(`
            INSERT INTO hoa_contacts (
              hoa_name, contact_person, title, email, phone,
              city, state, management_company,
              source_url, source_type, confidence_score, status,
              fingerprint, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            comm.name,
            person.name || null,
            person.title || null,
            person.email || null,
            person.phone || null,
            comm.city || 'Unknown',
            comm.state || 'FL',
            comm.management_company,
            person.linkedin_url || 'apollo',
            'apollo',
            person.email ? 80 : 40,
            'new',
            fingerprint,
            person.organization?.name ? `Org: ${person.organization.name}` : null,
          ]);
          contactsInserted++;
        }

        // Mark complete or failed
        const newStatus = contactsInserted > 0 ? 'complete' : 'failed';
        run(`UPDATE hoa_communities SET contact_enrichment_status = ?, needs_contact_enrichment = 0 WHERE id = ?`, [newStatus, comm.id]);

        if (contactsInserted > 0) {
          successCount++;
          console.log(`[hoa_contact_enricher] ${comm.name} (${comm.management_company}): ${contactsInserted} contacts found`);
        } else {
          failedCount++;
          console.log(`[hoa_contact_enricher] ${comm.name} (${comm.management_company}): no contacts found`);
        }

        results.push({ community: comm.name, mgmt: comm.management_company, contacts: contactsInserted });

      } catch (err) {
        failedCount++;
        run(`UPDATE hoa_communities SET contact_enrichment_status = 'failed' WHERE id = ?`, [comm.id]);
        console.error(`[hoa_contact_enricher] Error enriching ${comm.name}: ${err.message}`);
        results.push({ community: comm.name, error: err.message });
      }

      // Rate limit: 200ms between Apollo calls
      if (i < communities.length - 1) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    const durationMs = Date.now() - startTime;
    const totalContacts = get(`SELECT COUNT(*) as cnt FROM hoa_contacts`).cnt;
    const outputText = `HOA Contact Enrichment: ${successCount}/${communities.length} communities enriched (${failedCount} failed), ${totalContacts} total contacts in ${(durationMs / 1000).toFixed(1)}s`;

    // ── Quality trending ──
    const hoaHitRate = communities.length > 0 ? Math.round((successCount / communities.length) * 100) : 0;
    try {
      run(
        `INSERT INTO audit_log (id, action, resource, details, outcome) VALUES (lower(hex(randomblob(16))), 'enricher_quality', ?, ?, ?)`,
        ['agent:hoa-contact-enricher', JSON.stringify({ run_id: runId, total: communities.length, enriched: successCount, hit_rate: hoaHitRate }), hoaHitRate >= 50 ? 'success' : 'failure']
      );
    } catch {}

    if (communities.length >= 5 && hoaHitRate < 50) {
      try {
        const discord = require('../services/discordNotifier');
        discord.sendEmbed({ title: 'HOA Enricher Quality Alert', description: `HOA enricher hit rate: ${hoaHitRate}% (${successCount}/${communities.length}). Below 50% threshold.`, color: 0xff9500, footer: { text: 'hoa-contact-enricher' } });
      } catch {}
    }

    return { outputText, durationMs, extra: { enrichResult: { enriched_count: communities.length, success_count: successCount, failed_count: failedCount, total_contacts: totalContacts, results }, hitRate: hoaHitRate } };
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
    const brain = require('../services/collectiveBrain');
    const startTime = Date.now();
    const params = parseMessageParams(message);
    const parsedLimit = parseInt(params.limit) || 20;
    const enrichParams = {
      limit: parsedLimit,
      min_score: parseInt(params.min_score) || 0,
      status_filter: params.status_filter || 'all_unenriched',
      source: params.source || null,
    };

    // Try Apollo first
    let apolloResults = { enriched: 0, total: 0, results: [] };
    try {
      const apollo = require('../services/apolloEnricher');
      apolloResults = await apollo.enrichMultipleLeads({ limit: parsedLimit, workspace_id: enrichParams.workspace_id || null, min_score: enrichParams.min_score, status_filter: enrichParams.status_filter, source: enrichParams.source });
      console.log(`[jake_contact_enricher] Apollo enriched ${apolloResults.enriched}/${parsedLimit}`);
    } catch (apolloErr) {
      console.warn('[jake_contact_enricher] Apollo failed, falling back to Playwright:', apolloErr.message);
    }

    // Fall back to Playwright if Apollo enriched < 50% of requested limit
    let result;
    if (apolloResults.enriched >= Math.ceil(parsedLimit * 0.5)) {
      result = apolloResults;
    } else {
      const remainingLimit = parsedLimit - apolloResults.enriched;
      const { enrichMultipleLeads } = require('../services/jakeContactEnricher');
      const playwrightResult = await enrichMultipleLeads({
        ...enrichParams,
        limit: remainingLimit,
      });
      // Merge results
      result = {
        enriched: apolloResults.enriched + playwrightResult.enriched,
        total: apolloResults.total + playwrightResult.total,
        results: [...apolloResults.results, ...playwrightResult.results],
      };
    }
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

    // Brain Layer 3: record enrichment episode for signal performance tracking
    const topMethod = Object.entries(methodDist).sort((a,b) => b[1] - a[1])[0];
    brain.recordEpisode('jake-contact-enricher', {
      actionTaken: `Contact enrichment: ${result.total} leads processed`,
      outcome: `Enriched ${result.enriched}/${result.total} (${hitRate}% hit rate). Best method: ${topMethod?.[0] || 'none'}`,
      outcomeType: 'enrichment',
      outcomeScore: hitRate >= 25 ? 0.8 : hitRate >= 15 ? 0.6 : 0.3,
      signalSource: 'enrichment',
    });

    return { outputText, durationMs, extra: { enrichResult: result, hitRate, methodDist } };
  },

  apollo_lead_miner: async ({ message, runId, agent }) => {
    // Apollo API lead miner — 3 construction CFO lists, CRAP scoring, dedup
    const { mineAndScore } = require('../services/apolloLeadMiner');
    const brain = require('../services/collectiveBrain');
    const startTime = Date.now();
    const params = parseMessageParams(message);

    const listType = params.list || 'core_cfos';
    const pages = parseInt(params.pages) || 1;
    const minScore = parseInt(params.min_score) || 35;

    const result = await mineAndScore(listType, { pages, minScore });

    const durationMs = Date.now() - startTime;
    const outputText = [
      `Apollo Lead Miner [${listType}]: ${result.mined} mined, ${result.scored} scored, ${result.inserted} inserted, ${result.skipped} below threshold, ${result.duplicates} duplicates`,
      `  Duration: ${(durationMs / 1000).toFixed(1)}s | Credits used: ${result.creditsUsed || pages}`,
      result.inserted > 0
        ? `  ${result.inserted} new leads in cfo_leads — run jake-contact-enricher or outreach-batch-drafter next`
        : `  No new leads inserted (all below min score ${minScore} or already in DB)`,
      result.topLeads && result.topLeads.length > 0
        ? `  Top lead: ${result.topLeads[0].name} @ ${result.topLeads[0].company} (score: ${result.topLeads[0].score})`
        : '',
    ].filter(Boolean).join('\n');

    // Collective Brain: log discovery observation
    if (result.inserted > 0) {
      try {
        const sessionId = `apollo-miner-${listType}-${new Date().toISOString().slice(0, 10)}`;
        brain.observe(sessionId, 'apollo-lead-miner', 'lead_discovery', {
          subject: listType,
          content: `Mined ${result.mined} people from Apollo [${listType}], inserted ${result.inserted} new leads (CRAP score >= ${minScore}).`,
          confidence: 1.0,
          metadata: { listType, pages, mined: result.mined, inserted: result.inserted, duplicates: result.duplicates },
        });
      } catch {}
    }

    return { outputText, durationMs, extra: { ...result } };
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

    // Brain Layer 3: record discovery episode for signal performance tracking
    brain.recordEpisode('jake-construction-discovery', {
      market: result.region,
      actionTaken: `Google Maps discovery scan: ${result.stats.total || 0} companies scraped`,
      outcome: `Inserted ${result.stats.inserted || 0} new GC leads in ${result.region}`,
      outcomeType: 'discovery',
      outcomeScore: result.stats.inserted > 10 ? 0.8 : result.stats.inserted > 0 ? 0.6 : 0.2,
      signalSource: 'maps_discovery',
    });

    return { outputText, durationMs, costUsd: 0, extra: { stats: result.stats, region: result.region } };
  },

  // ── Batch Outreach Drafter — 10 emails per LLM call, no OpenClaw CLI ────────
  outreach_batch_drafter: async ({ message, runId, agent }) => {
    const { runBatchDraft } = require('../services/outreachDrafter');
    const startTime = Date.now();
    const params = parseMessageParams(message);

    const result = await runBatchDraft({
      limit: parseInt(params.limit) || 10,
      sourceAgent: params.sourceAgent || params.source_agent || params.persona || null,
      persona: params.persona || 'jake',
    });

    const durationMs = Date.now() - startTime;
    const lines = [
      `Outreach Drafter: ${result.drafted}/${result.leads} emails drafted in ${(durationMs / 1000).toFixed(1)}s`,
      `  QA passed: ${result.qa_passed} | Auto-approved: ${result.approved} | Flagged: ${result.flagged}`,
    ];
    if (result.results.length > 0) {
      for (const r of result.results.slice(0, 10)) {
        const lead = r.lead_id ? require('../db/connection').get('SELECT company_name FROM cfo_leads WHERE id = ?', [r.lead_id]) : null;
        lines.push(`  ${lead?.company_name || 'lead#' + r.lead_id}: ${r.status}${r.qa ? ' qa:' + r.qa.score : ''}${r.approval ? ' -> ' + r.approval : ''}`);
      }
    }

    return {
      outputText: lines.join('\n'),
      durationMs,
      costUsd: result.drafted > 0 ? 0.01 : 0,
      extra: { drafted: result.drafted, qa_passed: result.qa_passed, approved: result.approved },
    };
  },

  // ── Google Maps Discovery (shared service) — any vertical, any market ──────
  google_maps_discovery: async ({ message, runId, agent }) => {
    const gms = require('../services/googleMapsService');
    const startTime = Date.now();
    const params = parseMessageParams(message);

    // Determine vertical config or use custom queries
    const vertical = params.vertical ? gms.VERTICALS[params.vertical] : null;
    const queries = vertical?.queries || (params.queries ? params.queries.split('|') : null);

    if (!queries && !vertical) {
      return {
        outputText: 'Google Maps Discovery: specify vertical=construction|hoa_management|property_management or queries="query1|query2" and location="City, ST"',
        durationMs: 0,
        costUsd: 0,
      };
    }

    const location = params.location || params.region;
    if (!location) {
      return {
        outputText: 'Google Maps Discovery: location required (e.g. location=Austin, TX)',
        durationMs: 0,
        costUsd: 0,
      };
    }

    const result = await gms.discover({
      queries: queries || vertical.queries,
      location,
      source: params.source || 'google_maps',
      sourceAgent: params.source_agent || 'jake',
      limit: parseInt(params.limit) || 100,
      filter: vertical?.filter,
      score: vertical?.score,
      enrichTop: params.enrich !== 'false',
      workspaceId: parseInt(params.workspace_id) || 1,
    });

    const durationMs = Date.now() - startTime;
    return {
      outputText: result.summary + `\n  Duration: ${(durationMs / 1000).toFixed(1)}s`,
      durationMs,
      costUsd: 0,
      extra: { stats: result.stats, region: result.region, vertical: params.vertical || 'custom' },
    };
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

    // Pipeline health — the revenue-critical metrics
    const allTimeSent = dbGet("SELECT COUNT(*) c FROM cfo_outreach_sequences WHERE status='sent'")?.c || 0;
    const allTimeReplied = dbGet("SELECT COUNT(*) c FROM cfo_outreach_sequences WHERE status='replied'")?.c || 0;
    const allTimeReplyRate = allTimeSent > 0 ? (allTimeReplied / allTimeSent * 100).toFixed(2) : '0';
    const pendingApproval = dbGet("SELECT COUNT(*) c FROM cfo_outreach_sequences WHERE status='approved'")?.c || 0;
    const daysSinceLastReply = dbGet("SELECT CAST(julianday('now') - julianday(MAX(replied_at)) AS INTEGER) d FROM cfo_outreach_sequences WHERE replied_at IS NOT NULL")?.d || 99;
    const daysSinceLastSend = dbGet("SELECT CAST(julianday('now') - julianday(MAX(sent_at)) AS INTEGER) d FROM cfo_outreach_sequences WHERE sent_at IS NOT NULL")?.d || 99;
    const pendingRuns = dbGet("SELECT COUNT(*) c FROM runs WHERE status='pending'")?.c || 0;
    const cadenceActive = dbGet("SELECT COUNT(*) c FROM cfo_leads WHERE cadence_active = 1")?.c || 0;

    const replyAlert = daysSinceLastReply >= 3 ? ' 🔴 NO REPLIES IN ' + daysSinceLastReply + ' DAYS' : '';
    const sendAlert = daysSinceLastSend >= 2 ? ' 🔴 NO SENDS IN ' + daysSinceLastSend + ' DAYS' : '';

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
          { name: '💰 REVENUE PIPELINE', value: `Sent all-time: ${allTimeSent} · Replied: ${allTimeReplied} (${allTimeReplyRate}%) · Pending approval: ${pendingApproval}${sendAlert}${replyAlert}`, inline: false },
          { name: '🎯 Pipeline',  value: `${leadsFound} found · ${leadsEnriched} enriched · ${emailsDrafted} drafted · ${cadenceActive} in follow-up cadence`, inline: false },
          { name: '📧 Outreach',  value: `${emailsSent} sent · ${emailsReplied} replied (${replyRate}% reply rate) · ${pendingRuns} pending runs`,        inline: false },
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
      signalSource: lead.source || lead.attribution_source || null,
      signalFitScore: lead.pilot_fit_score || null,
    });

    // Cadence Brain v2: deactivate cadence on terminal reply outcomes
    if (['INTERESTED', 'UNSUBSCRIBE', 'BOUNCED'].includes(classification)) {
      try {
        const cadence = require('../services/tenacityCadenceEngine');
        cadence.deactivateCadence(lead_id, 'jake');
      } catch { /* service may not be seeded yet */ }
    }

    // Revenue tracking: record reply event + update variant
    try {
      const revenueTracker = require('../services/revenueTracker');
      const replyEventMap = {
        INTERESTED: 'replied', NOT_NOW: 'replied', WRONG_PERSON: 'replied',
        UNSUBSCRIBE: 'deal_lost', BOUNCED: 'deal_lost', NEUTRAL: 'replied',
      };
      const lastSeq = get("SELECT id FROM cfo_outreach_sequences WHERE lead_id=? ORDER BY sent_at DESC LIMIT 1", [lead_id]);
      revenueTracker.recordEvent(lead_id, replyEventMap[classification], {
        agent: 'jake-reply-classifier',
        sequenceId: lastSeq?.id,
        channel: 'email',
        metadata: { classification, reply_preview: reply_text.slice(0, 200) },
      });
      revenueTracker.updateEngagementScore(lead_id, 'reply', { sequenceId: lastSeq?.id });
      if (lastSeq) {
        revenueTracker.updateVariantOutcome(lastSeq.id, 'replied', 1);
        revenueTracker.updateVariantOutcome(lastSeq.id, 'reply_sentiment', classification);
        revenueTracker.updateVariantOutcome(lastSeq.id, 'replied_at', new Date().toISOString());
        if (classification === 'INTERESTED') {
          revenueTracker.updateVariantOutcome(lastSeq.id, 'converted', 1);
          revenueTracker.recordEvent(lead_id, 'meeting_booked', {
            agent: 'jake-reply-classifier', sequenceId: lastSeq.id, channel: 'email',
          });
        }
      }
    } catch {}

    // Marketing learner: record what angle/tone worked for this reply
    try {
      const learner = require('../services/marketingLearner');
      const lastSeq2 = get("SELECT id FROM cfo_outreach_sequences WHERE lead_id=? ORDER BY sent_at DESC LIMIT 1", [lead_id]);
      if (lastSeq2) learner.learnFromReply(lead_id, classification, lastSeq2.id);
    } catch {}

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
      signalSource: lead.source || lead.attribution_source || null,
      signalFitScore: lead.pilot_fit_score || null,
    });

    // Revenue tracking: meeting booked event
    try {
      const revenueTracker = require('../services/revenueTracker');
      revenueTracker.recordEvent(lead_id, 'meeting_booked', {
        agent: 'jake-meeting-booker', channel: 'email',
        metadata: { subject: meetingSubject, qa_status: meetingStatus },
      });
    } catch {}

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

    // ── BOUNCE RATE GUARD — prevent further domain damage ─────────────────
    // Check bounce rate over last 100 sends. If > 5%, pause all sending.
    // SendGrid recommends keeping bounce rate under 5% to protect domain reputation.
    const recentSends = dbAll(`
      SELECT status, delivery_status FROM cfo_outreach_sequences
      WHERE sent_at IS NOT NULL AND status NOT IN ('cancelled', 'draft')
      ORDER BY sent_at DESC LIMIT 100
    `);
    if (recentSends.length >= 10) { // need at least 10 sends for meaningful rate
      const bounced = recentSends.filter(r => r.status === 'bounced' || r.delivery_status === 'bounced').length;
      const bounceRate = (bounced / recentSends.length * 100).toFixed(1);
      if (bounceRate > 5) {
        const msg = `Outreach Sender: PAUSED — bounce rate ${bounceRate}% on last ${recentSends.length} sends exceeds 5% safety threshold. Fix email quality before resuming.`;
        console.warn(`[OutreachSender] ${msg}`);
        try {
          const discord = require('../services/discordNotifier');
          discord.postWebhook({ embeds: [{ title: '🚨 Outreach PAUSED — High Bounce Rate', color: 0xff0000, description: msg, timestamp: new Date().toISOString() }] });
        } catch {}
        return { outputText: msg, durationMs: Date.now() - startTime, costUsd: 0, extra: { paused: true, bounceRate: parseFloat(bounceRate) } };
      }
    }

    // Find approved sequences with contact emails, ordered by urgency score
    // Support both cfo_leads (Jake/DataRehab) and hoa_contacts (HOA)
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

    let sequences = dbAll(query, [dailyLimit]);

    // Also check HOA contacts (hoa_contacts table) for HOA-sourced sequences
    if (sequences.length < dailyLimit) {
      const hoaQuery = `
        SELECT s.id, s.lead_id, s.email_subject, s.email_body, s.sequence_position, s.source_agent,
               h.email AS contact_email, h.contact_person AS contact_name, h.management_company AS company_name,
               NULL AS erp_type, h.city, h.state, 0 AS urgency_score, 0 AS pilot_fit_score
        FROM cfo_outreach_sequences s
        JOIN hoa_contacts h ON h.id = s.lead_id
        WHERE s.status = 'approved'
          AND s.source_agent = 'hoa'
          AND h.email IS NOT NULL AND h.email != ''
        ORDER BY s.created_at ASC
        LIMIT ?
      `;
      const hoaSeqs = dbAll(hoaQuery, [dailyLimit - sequences.length]);
      console.log(`[OutreachSender] HOA query found ${hoaSeqs.length} sequences`);
      sequences = sequences.concat(hoaSeqs);
    }

    console.log(`[OutreachSender] Total sequences to send: ${sequences.length} (cfo_leads: ${sequences.filter(s => s.source_agent !== 'hoa').length}, hoa: ${sequences.filter(s => s.source_agent === 'hoa').length})`);

    if (sequences.length === 0) {
      return { outputText: 'Outreach Sender: No approved sequences with contact emails ready to send', durationMs: Date.now() - startTime, costUsd: 0 };
    }

    // ── PREVIEW MODE (default for scheduled runs) ─────────────────────────
    // Per CLAUDE.md Rule #5: scheduled outreach_sender is preview-only.
    // Confidence is still scored so Discord can rank the preview, but nothing
    // sends without an explicit confirmed=true (manual trigger or !send).
    // To re-enable auto-send, set autoSendCap above 0 AND update CLAUDE.md.
    if (!isConfirmed) {
      const approval = require('../services/approvalEngine');
      const autoSendList = [];
      const previewList = [];
      const skipList = [];
      const autoSendCap = 0; // Locked: no auto-sends without confirmed=true

      for (const seq of sequences) {
        const lead = dbGet('SELECT * FROM cfo_leads WHERE id = ?', [seq.lead_id]);
        if (!lead) { skipList.push(seq); continue; }

        const decision = await approval.decideSendApproval(lead, seq.source_agent || 'jake');

        if (decision.skip) {
          skipList.push(seq);
          approval.notifyLowConfidence(lead.id, seq.company_name, decision.confidence, decision.reason);
        } else if (decision.autoSend && autoSendList.length < autoSendCap) {
          autoSendList.push({ seq, lead, confidence: decision.confidence, reason: decision.reason });
        } else {
          previewList.push(seq);
        }
      }

      // Auto-send high-confidence leads (with guard checks)
      const outreachGuard = require('../services/outreachGuard');
      let autoSent = 0;
      for (const { seq, lead, confidence } of autoSendList) {
        const check = outreachGuard.canSend(seq.contact_email, seq.id, seq.source_agent || 'hoa', seq.email_subject);
        if (!check.allowed) {
          console.warn(`[OutreachSender] Auto-send blocked: ${check.reason}`);
          skipList.push(seq);
          continue;
        }
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
            persona: seq.source_agent || 'hoa',
            customArgs: { leadId: String(seq.lead_id), agentId: seq.source_agent || 'outreach-sender' },
          });
          if (result.success) {
            dbRun("UPDATE cfo_outreach_sequences SET status = 'sent', sent_at = datetime('now'), delivery_status = 'delivered' WHERE id = ?", [seq.id]);
            dbRun("UPDATE cfo_leads SET status = 'contacted', updated_at = datetime('now') WHERE id = ? AND status = 'new'", [seq.lead_id]);
            approval.notifyAutoSend(lead.id, seq.company_name, confidence);
            autoSent++;
            console.log(`[OutreachSender] AUTO-SENT to ${seq.contact_email} (${seq.company_name}) conf=${confidence}`);
            await new Promise(r => setTimeout(r, 2000)); // 2s stagger
          }
        } catch (err) {
          console.error(`[OutreachSender] Auto-send failed for ${seq.contact_email}: ${err.message}`);
        }
      }

      // Preview the rest for Steve's confirmation
      const preview = previewList.slice(0, 10).map((s, i) =>
        `${i + 1}. ${s.company_name} — ${s.contact_name || 'contact'} (${s.contact_email})\n   Subject: "${(s.email_subject || '').slice(0, 60)}"`
      ).join('\n');

      // Post to Discord with @everyone ping if there are items to confirm
      try {
        const autoSendNote = autoSent > 0 ? `\n\n✅ **${autoSent} high-confidence emails already sent** (auto-approved, conf≥90)` : '';
        const skipNote = skipList.length > 0 ? `\n⚠️ ${skipList.length} skipped (low confidence)` : '';

        if (previewList.length > 0 || autoSent > 0) {
          await discord.sendEmbed({
            title: `📨 Outreach: ${autoSent} auto-sent, ${previewList.length} awaiting your GO`,
            color: autoSent > 0 ? 0x22c55e : 0xffa500,
            description: (previewList.length > 0
              ? `**${previewList.length} emails** need confirmation:\n\n${preview}${previewList.length > 10 ? `\n... and ${previewList.length - 10} more` : ''}`
              : 'All high-confidence emails sent automatically.') + autoSendNote + skipNote,
            fields: previewList.length > 0 ? [
              { name: 'To send remaining', value: 'Type `!send` or POST /api/cfo-marketing/outreach/send-confirmed', inline: false },
            ] : [],
            timestamp: new Date().toISOString(),
            footer: { text: previewList.length > 0 ? 'Outreach Sender — type !send to confirm' : 'Outreach Sender — all auto-approved' },
          });
        }
      } catch {}

      const durationMs = Date.now() - startTime;
      const outputText = [
        `Outreach Sender: ${autoSent} auto-sent (conf≥90), ${previewList.length} awaiting confirmation, ${skipList.length} skipped (conf<70)`,
        autoSent > 0 ? `  Auto-sent: ${autoSendList.slice(0, 3).map(a => a.seq.company_name).join(', ')}${autoSent > 3 ? ` +${autoSent - 3} more` : ''}` : null,
        previewList.length > 0 ? `  Waiting: ${previewList.slice(0, 3).map(s => s.company_name).join(', ')}${previewList.length > 3 ? ` +${previewList.length - 3} more` : ''}` : null,
        previewList.length > 0 ? `  Confirm: !send or POST with {"confirmed":true}` : null,
      ].filter(Boolean).join('\n');
      return { outputText, durationMs, costUsd: 0, extra: { mode: 'smart_preview', auto_sent: autoSent, pending_count: previewList.length, skipped: skipList.length } };
    }

    // ── CONFIRMED MODE (manual trigger only) ──────────────────────────────
    // Steve explicitly confirmed — actually send the emails.
    console.log(`[OutreachSender] CONFIRMED — sending ${sequences.length} emails`);

    // SendGrid daily send cap — safety net
    const todaySent = dbGet("SELECT COUNT(*) c FROM cfo_outreach_sequences WHERE DATE(sent_at)=DATE('now') AND status='sent'")?.c || 0;
    const dailySendCap = parseInt(process.env.SENDGRID_DAILY_CAP) || 2000; // Paid plan — override via SENDGRID_DAILY_CAP env var
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

    const outreachGuard = require('../services/outreachGuard');
    let blocked = 0;

    for (const seq of sequences) {
      // ── Outreach guard: null-email, dedup, throttle, subject-flood ──
      const check = outreachGuard.canSend(seq.contact_email, seq.id, seq.source_agent || 'hoa', seq.email_subject);
      if (!check.allowed) {
        blocked++;
        dbRun("UPDATE cfo_outreach_sequences SET status = 'cancelled', delivery_error = ? WHERE id = ?", [check.reason, seq.id]);
        results.push({ company: seq.company_name, email: seq.contact_email, status: 'blocked', reason: check.reason });
        console.warn(`[OutreachSender] ${check.reason}`);
        continue;
      }

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
          persona: seq.source_agent || 'hoa',
          customArgs: {
            leadId: String(seq.lead_id),
            runId: runId || '',
            agentId: seq.source_agent || 'outreach-sender',
          },
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

          // Revenue tracking: record send event + A/B variant
          try {
            const revenueTracker = require('../services/revenueTracker');
            revenueTracker.recordEvent(seq.lead_id, 'contacted', {
              agent: 'outreach-sender', sequenceId: seq.id,
              touchNumber: seq.sequence_position, channel: 'email',
            });
            revenueTracker.recordOutreachVariant(seq.id, seq.lead_id, {
              subjectLine: seq.email_subject || '',
              angleType: seq.pilot_offer || null,
              personalizationLevel: seq.contact_name ? 'person' : 'company',
            });
          } catch {}
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
    const outputText = `Outreach Sender: ${sent} sent, ${failed} failed, ${blocked} blocked by guard (of ${sequences.length} confirmed) in ${(durationMs / 1000).toFixed(1)}s`;
    return { outputText, durationMs, costUsd: 0, extra: { mode: 'confirmed', sent, failed, blocked, results } };
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

      // Fetch real metrics from GitHub, Vercel, Stripe
      const { fetchAndRecordMetrics } = require('../services/tractionMonitorService');
      let metrics;
      try {
        metrics = await fetchAndRecordMetrics(proto);
      } catch { metrics = null; }

      // Get latest traction score (freshly updated by fetchAndRecordMetrics)
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
  // ── Database Health Monitor — daily integrity checks ────────────────────
  db_health_monitor: async ({ message, runId, agent }) => {
    const monitor = require('../services/dbHealthMonitor');
    const startTime = Date.now();
    const report = monitor.runHealthCheck();
    const formatted = monitor.formatReport(report);

    // Discord alert if unhealthy
    if (!report.healthy) {
      try {
        const discord = require('../services/discordNotifier');
        await discord.sendEmbed({
          title: `DB Health: ${report.summary.critical} critical, ${report.summary.high} high issues`,
          color: report.summary.critical > 0 ? 0xef4444 : 0xf59e0b,
          description: report.issues.slice(0, 5).map(i => `[${i.severity}] ${i.message}`).join('\n'),
          fields: [
            { name: 'Tables', value: `${report.tableCount}`, inline: true },
            { name: 'DB Size', value: `${report.dbStats?.db_size_mb || '?'} MB`, inline: true },
          ],
          timestamp: new Date().toISOString(),
          footer: { text: `Health check took ${report.durationMs}ms` },
        });
      } catch {}
    }

    return {
      outputText: `DB Health: ${report.healthy ? 'HEALTHY' : 'ISSUES FOUND'}\n${formatted}`,
      durationMs: Date.now() - startTime,
      costUsd: 0,
      extra: report,
    };
  },

  // ── Ralph Code Reviewer — static analysis on changed/new code ───────────
  ralph_code_review: async ({ message, runId, agent }) => {
    const ralph = require('../services/ralphCodeReview');
    const startTime = Date.now();
    const params = parseMessageParams(message);

    let results;
    if (params.file) {
      // Review single file
      results = [ralph.reviewFile(params.file)];
    } else if (params.mode === 'new') {
      // Review all new services we built
      results = ralph.reviewNewServices();
    } else {
      // Default: review all changed files (git diff)
      const batch = ralph.reviewChangedFiles();
      results = batch.results || [];
    }

    const totalIssues = results.reduce((sum, r) => sum + (r.issues?.length || 0), 0);
    const criticals = results.reduce((sum, r) => sum + (r.summary?.critical || 0), 0);
    const avgScore = results.length > 0
      ? Math.round(results.reduce((sum, r) => sum + (r.score || 0), 0) / results.length)
      : 100;

    // Discord alert if critical issues found
    if (criticals > 0) {
      try {
        const discord = require('../services/discordNotifier');
        await discord.sendEmbed({
          title: `Ralph Code Review — ${criticals} CRITICAL issues`,
          color: 0xef4444,
          description: results.filter(r => r.summary?.critical > 0)
            .map(r => `**${r.file}**: ${r.issues.filter(i => i.severity === 'CRITICAL').map(i => i.message).join('; ')}`)
            .join('\n'),
          timestamp: new Date().toISOString(),
          footer: { text: `${results.length} files reviewed, avg score: ${avgScore}/100` },
        });
      } catch {}
    }

    const report = ralph.formatReport(results);
    const outputText = [
      `Ralph Code Review: ${results.length} files, ${totalIssues} issues (${criticals} critical), avg score: ${avgScore}/100`,
      criticals > 0 ? '⚠️  CRITICAL issues require immediate fix' : '✅ No critical issues',
      '',
      report,
    ].join('\n');

    return { outputText, durationMs: Date.now() - startTime, costUsd: 0, extra: { filesReviewed: results.length, totalIssues, criticals, avgScore } };
  },

  // ── Marketing Learning Cycle — self-recursive improvement ───────────────
  marketing_learner: async ({ message, runId, agent }) => {
    const learner = require('../services/marketingLearner');
    const startTime = Date.now();
    const result = await learner.runLearningCycle();
    const outputText = [
      `Marketing Learner: Cycle complete`,
      `  Content scored: ${result.scoring.scored}/${result.scoring.total}`,
      `  Patterns extracted: ${result.patterns.learnings_stored}`,
      `  Calendar entries generated: ${result.calendarResult.created}`,
      `  Duration: ${result.durationMs}ms`,
    ].join('\n');
    return { outputText, durationMs: Date.now() - startTime, costUsd: 0, extra: result };
  },

  // ── Welcome Sequence Processor — sends welcome emails to new subscribers ──
  welcome_sequence: async ({ message, runId, agent }) => {
    const newsletter = require('../services/newsletterBroadcast');
    const startTime = Date.now();
    const result = await newsletter.processWelcomeSequence();
    return {
      outputText: `Welcome Sequence: ${result.sent} emails sent (${result.due} subscribers due)`,
      durationMs: Date.now() - startTime, costUsd: 0, extra: result,
    };
  },

  // ── LinkedIn Poster — posts to LinkedIn org page via API v2 ──────────────
  linkedin_poster: async ({ message, runId, agent }) => {
    const linkedin = require('../services/linkedinPoster');
    const startTime = Date.now();
    const params = parseMessageParams(message);

    const linkedinStatus = linkedin.status();
    if (!linkedinStatus.configured) {
      return { outputText: 'LinkedIn Poster: SKIPPED — LINKEDIN_ACCESS_TOKEN or LINKEDIN_ORGANIZATION_ID not configured', durationMs: Date.now() - startTime, costUsd: 0 };
    }

    const text = params.text || params.content || message;
    const articleUrl = params.url || params.article_url || null;
    const title = params.title || '';

    let result;
    if (articleUrl) {
      result = await linkedin.postArticle(text, articleUrl, title, params.description || '');
    } else {
      result = await linkedin.postText(text, { agent: agent?.name || 'linkedin-direct-poster' });
    }

    if (result.success) {
      // Track in content_queue as published
      try {
        run("INSERT INTO audit_log (id, action, resource, details, outcome) VALUES (lower(hex(randomblob(16))), 'social_post', 'linkedin', ?, 'success')",
          [JSON.stringify({ post_id: result.postId, text_preview: text.slice(0, 100) })]);
      } catch {}
    }

    const outputText = result.success
      ? `LinkedIn Poster: Posted successfully (ID: ${result.postId})`
      : `LinkedIn Poster: FAILED — ${result.error}`;
    return { outputText, durationMs: Date.now() - startTime, costUsd: 0, extra: result };
  },

  // ── Twitter Poster — posts tweets/threads via API v2 ──────────────────────
  twitter_poster: async ({ message, runId, agent }) => {
    const twitter = require('../services/twitterPoster');
    const startTime = Date.now();
    const params = parseMessageParams(message);

    const twitterStatus = twitter.status();
    if (!twitterStatus.configured) {
      return { outputText: 'Twitter Poster: SKIPPED — TWITTER_API_KEY or TWITTER_ACCESS_TOKEN not configured', durationMs: Date.now() - startTime, costUsd: 0 };
    }

    // Thread mode: array of tweets
    if (params.thread && Array.isArray(params.thread)) {
      const result = await twitter.postThread(params.thread, { agent: agent?.name || 'jake-twitter-poster' });
      const outputText = result.success
        ? `Twitter Poster: Thread posted (${result.tweetCount} tweets)`
        : `Twitter Poster: Thread FAILED — ${result.error}`;
      return { outputText, durationMs: Date.now() - startTime, costUsd: 0, extra: result };
    }

    // Single tweet mode
    const text = params.text || params.tweet || message;
    const result = await twitter.postTweet(text, { agent: agent?.name || 'jake-twitter-poster' });

    const outputText = result.success
      ? `Twitter Poster: Tweet posted (ID: ${result.tweetId})`
      : `Twitter Poster: FAILED — ${result.error}`;
    return { outputText, durationMs: Date.now() - startTime, costUsd: 0, extra: result };
  },

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
      return { outputText: `Dream Team: ${scorecards.length} agents scored`, durationMs: Date.now() - startTime, costUsd: 0, extra: { phase: 'score', scorecards: scorecards.length } };
    } else if (params.phase === 'report') {
      const report = await dt.buildMorningReport();
      return { outputText: `Dream Team: Morning report generated`, durationMs: Date.now() - startTime, costUsd: 0, extra: { phase: 'report' } };
    } else {
      // Full cycle (default for scheduled runs)
      result = await dt.runFullCycle();
      return {
        outputText: `Dream Team Nightly: ${result.scorecards} scored, ${result.diagnostics} findings (${result.criticals} critical), ${result.actions} actions`,
        durationMs: result.durationMs,
        costUsd: 0,
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

  // ── Owen PM Discovery — Google Maps PM company scraper ────────────────────
  owen_pm_discovery: async ({ message, runId, agent }) => {
    const { runPMDiscovery } = require('../services/owenPMDiscovery');
    const brain = require('../services/collectiveBrain');
    const startTime = Date.now();
    const params = parseMessageParams(message);
    const result = await runPMDiscovery({
      region: params.region || null,
      limit: parseInt(params.limit) || 100,
    });
    const durationMs = Date.now() - startTime;
    const outputText = [
      result.summary,
      `  Duration: ${(durationMs / 1000).toFixed(1)}s | Cost: $0.00`,
      result.stats.inserted > 0
        ? '  Run owen-contact-enricher next to find CFO/controller emails'
        : '  No new companies — try a different region',
    ].join('\n');

    // Brain observations + episodes
    if (result.stats.inserted > 0) {
      const sessionId = `owen-pipeline-${result.region?.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}`;
      brain.observe(sessionId, 'owen-pm-discovery', 'market_insight', {
        subject: result.region,
        content: `Owen PM Discovery: ${result.stats.inserted} new PM companies in ${result.region}. Total scraped: ${result.stats.total}.`,
        confidence: 1.0,
        metadata: { region: result.region, inserted: result.stats.inserted, total: result.stats.total },
      });
    }
    brain.recordEpisode('owen-pm-discovery', {
      market: result.region,
      actionTaken: `Google Maps PM company discovery: 7 query types`,
      outcome: `Inserted ${result.stats.inserted} new PM companies in ${result.region}`,
      outcomeType: 'discovery', outcomeScore: result.stats.inserted > 10 ? 0.8 : result.stats.inserted > 0 ? 0.6 : 0.2,
      signalSource: 'maps_discovery',
    });

    return { outputText, durationMs, costUsd: 0, extra: { stats: result.stats, region: result.region } };
  },

  // ── Data Rehab Discovery — cross-sell mining from existing leads ─────────
  data_rehab_discovery: async ({ message, runId, agent }) => {
    const { mineExistingLeads } = require('../services/dataRehabDiscovery');
    const brain = require('../services/collectiveBrain');
    const startTime = Date.now();
    const params = parseMessageParams(message);
    const result = mineExistingLeads({ limit: parseInt(params.limit) || 30 });
    const durationMs = Date.now() - startTime;

    const highScore = result.crossSellLeads.filter(l => l.data_rehab_score >= 75);
    const medScore = result.crossSellLeads.filter(l => l.data_rehab_score >= 50 && l.data_rehab_score < 75);

    const outputText = [
      `Data Rehab Discovery: ${result.crossSellLeads.length} candidates found, ${result.tagged} tagged for outreach`,
      `  HIGH (75+): ${highScore.length} | MEDIUM (50-74): ${medScore.length}`,
      ...highScore.slice(0, 5).map(l => `  🎯 ${l.company} (${l.erp || 'unknown'}) — score: ${l.data_rehab_score} → upsell: ${l.upsell_to}`),
    ].join('\n');

    brain.recordEpisode('data-rehab-discovery', {
      actionTaken: `Cross-sell mining: ${result.crossSellLeads.length} candidates assessed`,
      outcome: `${result.tagged} tagged for Data Rehab outreach (${highScore.length} HIGH, ${medScore.length} MED)`,
      outcomeType: 'discovery', outcomeScore: result.tagged > 5 ? 0.8 : result.tagged > 0 ? 0.6 : 0.3,
      signalSource: 'data_rehab_cross_sell',
    });

    if (highScore.length > 0) {
      try {
        const discord = require('../services/discordNotifier');
        await discord.sendEmbed({
          title: '🔧 Data Rehab — Cross-Sell Candidates',
          description: highScore.slice(0, 5).map(l => `**${l.company}** (${l.erp}) — ${l.signals[0]}`).join('\n'),
          color: 0x9C27B0,
          footer: `${result.tagged} tagged | ${highScore.length} HIGH priority`,
        });
      } catch {}
    }

    return { outputText, durationMs, costUsd: 0, extra: result };
  },

  // ── Data Rehab Reply Classifier — classifies inbound replies, updates lead status ($0) ──
  data_rehab_reply_classifier: async ({ message, runId, agent }) => {
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
    let nextAction     = 'No action needed — monitor for future re-engagement';

    if (/\b(yes|interested|tell me more|let'?s? talk|schedule|call|would like|sounds good|love to|set up|book|connect)\b/.test(text)) {
      classification = 'INTERESTED';  newLeadStatus = 'replied';      newSeqStatus = 'replied';
      nextAction = 'Run data-rehab-meeting-booker to draft an Autopsy kickoff email';
    } else if (/\b(not right now|maybe later|reach out in|try (me |us )?(again|in|next)|busy|not a (good|right) time|few months|next (quarter|year))\b/.test(text)) {
      classification = 'NOT_NOW';     newLeadStatus = 'nurture';      newSeqStatus = 'replied';
      nextAction = 'Move to nurture sequence — re-engage in 60 days';
    } else if (/\b(wrong person|not my area|not my department|forward(ed)? to|try [A-Z][a-z]|reach out to|you want|should contact)\b/.test(text)) {
      classification = 'WRONG_PERSON'; newLeadStatus = 'bad_contact'; newSeqStatus = 'replied';
      nextAction = 'Update contact info — find correct decision maker';
    } else if (/\b(unsubscribe|remove me|take me off|stop (emailing|contacting)|don'?t (contact|email)|opt out|no more)\b/.test(text)) {
      classification = 'UNSUBSCRIBE'; newLeadStatus = 'unsubscribed'; newSeqStatus = 'replied';
      nextAction = 'Do not contact again — marked unsubscribed';
    } else if (/\b(delivery failed|no such user|mailbox full|undeliverable|bounce|does not exist|invalid address)\b/.test(text)) {
      classification = 'BOUNCED';     newLeadStatus = 'bounced';      newSeqStatus = 'bounced';
      nextAction = 'Find correct email address — lead enrichment needed';
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

    // Brain feedback signal
    brain.recordFeedback('data-rehab-outreach', 'outreach', String(lead_id), classification === 'INTERESTED' ? 'converted' : 'rejected', {
      notes: `Data Rehab reply classifier: ${classification}. Reply: "${reply_text.slice(0, 100)}"`,
      metadata: { classification, company: lead.company_name },
    });

    brain.recordEpisode('data-rehab-reply-classifier', {
      actionTaken: `Classified reply for lead ${lead_id} (${lead.company_name})`,
      outcome: `${classification} — ${nextAction}`,
      outcomeType: classification === 'INTERESTED' ? 'replied' : 'lost',
      outcomeScore: classification === 'INTERESTED' ? 0.9 : classification === 'NOT_NOW' ? 0.3 : 0.1,
      signalSource: 'data_rehab_reply',
    });

    // Deactivate cadence on terminal replies
    if (['INTERESTED', 'UNSUBSCRIBE', 'BOUNCED'].includes(classification)) {
      try {
        const cadence = require('../services/tenacityCadenceEngine');
        cadence.deactivateCadence(lead_id, 'data-rehab');
      } catch { /* service may not be seeded yet */ }
    }

    const outputText = `Data Rehab Reply Classifier: Lead #${lead_id} (${lead.company_name}) → ${classification}\n  Next action: ${nextAction}`;
    return { outputText, durationMs: Date.now() - startTime, costUsd: 0, extra: { classification, nextAction, lead_id } };
  },

  // ── Data Rehab Follow-Up — generates follow-up drafts for contacted leads with no reply ──
  data_rehab_follow_up: async ({ message, runId, agent }) => {
    const { all: dbAll } = require('../db/connection');
    const openclawBridge = require('../services/openclawBridge');
    const brain = require('../services/collectiveBrain');
    const startTime = Date.now();

    const params = parseMessageParams(message);
    const limit  = parseInt(params.limit) || 10;
    const minDays = parseInt(params.min_days_since_last) || 5;

    // Find Data Rehab leads (workspace_id=4) with no reply after minDays
    const leads = dbAll(`
      SELECT l.id, l.company_name, l.contact_name, l.contact_title, l.erp_type, l.city, l.state,
             s.id AS seq_id, s.email_subject, s.sent_at
      FROM cfo_leads l
      JOIN cfo_outreach_sequences s ON s.lead_id = l.id
      WHERE l.status = 'contacted'
        AND l.workspace_id = 4
        AND s.status = 'sent'
        AND s.sequence_position = 1
        AND DATE(s.sent_at) <= DATE('now', '-' || ? || ' days')
        AND NOT EXISTS (
          SELECT 1 FROM cfo_outreach_sequences s2
          WHERE s2.lead_id = l.id AND s2.sequence_position = 2
        )
      ORDER BY s.sent_at ASC
      LIMIT ?
    `, [minDays, limit]);

    if (leads.length === 0) {
      return { outputText: 'Data Rehab Follow-Up: No leads due for follow-up (all replied or too recent)', durationMs: Date.now() - startTime, costUsd: 0 };
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
          product: 'data-rehab',
        });

        const result = await openclawBridge.runAgent('data-rehab-follow-up', {
          openclawId: 'data-rehab-follow-up',
          message: msg,
          sessionId: `data-rehab-followup-${lead.id}-${new Date().toISOString().slice(0,10)}`,
        });

        const parsed = openclawBridge.constructor.parseOutput(result.output);
        let data = null;
        try { data = JSON.parse(parsed.text || result.output || '{}'); } catch {}
        const body = data?.body_text;
        if (body) {
          const subject = data.subject || `Re: ${lead.email_subject}`;
          const angleType = data.follow_up_angle || 'data_audit';

          // Content guard
          const { checkContent } = require('../services/contentGuard');
          const guard = checkContent(body, subject);
          const status = guard.safe ? 'draft' : 'flagged';
          if (!guard.safe) {
            console.warn(`[ContentGuard] data-rehab-follow-up flagged for lead ${lead.id}: ${guard.flags.map(f => `${f.type}:${f.match}`).join(', ')}`);
          }

          run(
            `INSERT INTO cfo_outreach_sequences (lead_id, sequence_type, email_subject, email_body, source_agent, status, sequence_position, qa_status, angle_type) VALUES (?, 'follow_up', ?, ?, 'data-rehab', ?, 2, 'pending', ?)`,
            [lead.id, subject, body, status, angleType]
          );

          // Ralph QA auto-review
          try {
            const ralphQA = require('../services/ralphQA');
            const inserted = get('SELECT id FROM cfo_outreach_sequences WHERE lead_id = ? AND sequence_position = 2 ORDER BY id DESC LIMIT 1', [lead.id]);
            if (inserted) {
              const qaResult = ralphQA.reviewSingleOutreach(inserted.id);
              console.log(`[RalphQA] DR Follow-up #${inserted.id}: ${qaResult.passed ? 'PASSED' : 'FAILED'} (${qaResult.score}/100)`);
            }
          } catch {}

          brain.observe(
            `data-rehab-followup-${new Date().toISOString().slice(0,10)}`,
            'data-rehab-follow-up', 'follow_up_queued',
            { subject: lead.company_name, content: `Data Rehab follow-up drafted for ${lead.company_name} (${daysSince} days since first touch). Angle: ${angleType}.`, confidence: 0.9,
              metadata: { lead_id: lead.id, angle: angleType, days_since: daysSince } }
          );
          drafted++;
        } else {
          failed++;
        }
      } catch (e) {
        console.error(`[data_rehab_follow_up] Failed for lead ${lead.id}:`, e.message);
        failed++;
      }
    }

    const outputText = `Data Rehab Follow-Up: ${drafted} follow-ups drafted, ${failed} failed (of ${leads.length} eligible leads)`;
    return { outputText, durationMs: Date.now() - startTime, costUsd: 0, extra: { drafted, failed } };
  },

  // ── Data Rehab Meeting Booker — drafts Autopsy kickoff scheduling email ──
  data_rehab_meeting_booker: async ({ message, runId, agent }) => {
    const openclawBridge = require('../services/openclawBridge');
    const brain = require('../services/collectiveBrain');
    const startTime = Date.now();
    const params = parseMessageParams(message);

    const { lead_id } = params;
    if (!lead_id) throw new Error('Message must be JSON: {"lead_id": 123}');

    const lead = get('SELECT * FROM cfo_leads WHERE id = ?', [lead_id]);
    if (!lead) throw new Error(`Lead ${lead_id} not found`);
    if (lead.status !== 'replied') throw new Error(`Lead status is "${lead.status}" — must be "replied" to book a meeting`);

    const replyText = params.reply_text || 'Interested in learning more about the data audit';

    const msg = JSON.stringify({
      lead_id, company_name: lead.company_name, contact_name: lead.contact_name,
      contact_email: lead.contact_email, reply_text: replyText,
      erp_type: lead.erp_type, city: lead.city, state: lead.state,
      product: 'data-rehab',
    });

    const result = await openclawBridge.runAgent('data-rehab-meeting-booker', {
      openclawId: 'data-rehab-meeting-booker',
      message: msg,
      sessionId: `data-rehab-meeting-${lead_id}-${new Date().toISOString().slice(0,10)}`,
    });

    const parsed = openclawBridge.constructor.parseOutput(result.output);
    let data = null;
    try { data = JSON.parse(parsed.text || result.output || '{}'); } catch {}

    const body = data?.body_text;
    if (!body) throw new Error('Meeting booker returned no email body');

    const calendlyUrl = process.env.CALENDLY_URL || '[INSERT CALENDLY LINK]';
    const finalBody = body.replace(/\[CALENDLY_URL\]/g, calendlyUrl);
    const meetingSubject = data.subject || `Data Autopsy Kickoff — ${lead.company_name}`;

    // Content guard — meeting emails reach highest-value contacts
    const { checkContent } = require('../services/contentGuard');
    const guard = checkContent(finalBody, meetingSubject);
    const meetingStatus = guard.safe ? 'draft' : 'flagged';
    if (!guard.safe) {
      console.warn(`[ContentGuard] data-rehab-meeting-booker flagged for lead ${lead_id}: ${guard.flags.map(f => `${f.type}:${f.match}`).join(', ')}`);
    }

    run(
      `INSERT INTO cfo_outreach_sequences (lead_id, sequence_type, email_subject, email_body, source_agent, status, sequence_position, qa_status) VALUES (?, 'meeting', ?, ?, 'data-rehab', ?, 3, 'pending')`,
      [lead_id, meetingSubject, finalBody, meetingStatus]
    );

    // Ralph QA auto-review
    try {
      const ralphQA = require('../services/ralphQA');
      const inserted = get('SELECT id FROM cfo_outreach_sequences WHERE lead_id = ? AND sequence_position = 3 ORDER BY id DESC LIMIT 1', [lead_id]);
      if (inserted) {
        const qaResult = ralphQA.reviewSingleOutreach(inserted.id);
        console.log(`[RalphQA] DR Meeting #${inserted.id}: ${qaResult.passed ? 'PASSED' : 'FAILED'} (${qaResult.score}/100)`);
      }
    } catch {}

    brain.observe(
      `data-rehab-meeting-${new Date().toISOString().slice(0,10)}`,
      'data-rehab-meeting-booker', 'meeting_booked',
      { subject: lead.company_name, content: `Data Rehab Autopsy kickoff drafted for ${lead.company_name} — ${lead.contact_name}. QA: ${meetingStatus}.`, confidence: 1.0,
        metadata: { lead_id, company: lead.company_name, city: lead.city, qa_status: meetingStatus } }
    );

    brain.recordEpisode('data-rehab-meeting-booker', {
      actionTaken: `Autopsy kickoff email drafted for ${lead.company_name}`,
      outcome: `Meeting booked — ${lead.company_name}, ${lead.contact_name || 'contact'}`,
      outcomeType: 'booked',
      outcomeScore: 1.0,
      leadId: String(lead_id),
      signalSource: 'data_rehab',
    });

    const outputText = `Data Rehab Meeting Booker: Autopsy kickoff draft created for ${lead.contact_name} at ${lead.company_name} | Subject: "${meetingSubject}"`;
    return { outputText, durationMs: Date.now() - startTime, costUsd: parsed.costUsd || 0, extra: { lead_id, meetingStatus } };
  },

  // ── Data Rehab Contact Enricher — reuses jakeContactEnricher for workspace_id=4 leads ──
  data_rehab_enricher: async ({ message, runId, agent }) => {
    const brain = require('../services/collectiveBrain');
    const startTime = Date.now();
    const params = parseMessageParams(message);
    const parsedLimit = parseInt(params.limit) || 15;
    const enrichParams = {
      limit: parsedLimit,
      min_score: parseInt(params.min_score) || 0,
      status_filter: params.status_filter || 'pending',
      workspace_id: 4,
    };

    // Try Apollo first
    let apolloResults = { enriched: 0, total: 0, results: [] };
    try {
      const apollo = require('../services/apolloEnricher');
      apolloResults = await apollo.enrichMultipleLeads({ limit: parsedLimit, workspace_id: 4, min_score: enrichParams.min_score, status_filter: enrichParams.status_filter });
      console.log(`[data_rehab_enricher] Apollo enriched ${apolloResults.enriched}/${parsedLimit}`);
    } catch (apolloErr) {
      console.warn('[data_rehab_enricher] Apollo failed, falling back to Playwright:', apolloErr.message);
    }

    // Fall back to Playwright if Apollo enriched < 50% of requested limit
    let result;
    if (apolloResults.enriched >= Math.ceil(parsedLimit * 0.5)) {
      result = apolloResults;
    } else {
      const remainingLimit = parsedLimit - apolloResults.enriched;
      const { enrichMultipleLeads } = require('../services/jakeContactEnricher');
      const playwrightResult = await enrichMultipleLeads({
        ...enrichParams,
        limit: remainingLimit,
      });
      // Merge results
      result = {
        enriched: apolloResults.enriched + playwrightResult.enriched,
        total: apolloResults.total + playwrightResult.total,
        results: [...apolloResults.results, ...playwrightResult.results],
      };
    }
    const durationMs = Date.now() - startTime;
    const outputText = [
      `Data Rehab Enricher: ${result.enriched}/${result.total} enriched in ${(durationMs / 1000).toFixed(1)}s`,
      ...result.results.slice(0, 10).map(r => `  ${r.company}: ${r.email || 'no email found'} (${r.method || 'failed'})`),
    ].join('\n');

    // Brain observations for enriched contacts
    if (result.enriched > 0) {
      const today = new Date().toISOString().slice(0, 10);
      const enrichedLeads = result.results.filter(r => r.email);
      for (const r of enrichedLeads.slice(0, 20)) {
        const cityState = [r.city, r.state].filter(Boolean).join(', ');
        const region = cityState || 'Unknown market';
        const sessionId = `data-rehab-pipeline-${region.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${today}`;
        brain.observe(sessionId, 'data-rehab-enricher', 'contact_found', {
          subject: r.company,
          content: `${r.company} (${region}): Contact found via ${r.method}. Email: ${r.email}${r.contactName ? '. Name: ' + r.contactName : ''}${r.phone ? '. Phone: ' + r.phone : ''}.`,
          confidence: r.method === 'pattern_guess' ? 0.6 : 0.9,
          metadata: { email: r.email, name: r.contactName || null, method: r.method, company_id: r.id },
        });
      }
    }

    const hitRate = result.total > 0 ? Math.round((result.enriched / result.total) * 100) : 0;
    const methodDist = {};
    for (const r of result.results) { methodDist[r.method || 'failed'] = (methodDist[r.method || 'failed'] || 0) + 1; }

    brain.recordEpisode('data-rehab-enricher', {
      actionTaken: `Data Rehab contact enrichment: ${result.total} leads processed`,
      outcome: `Enriched ${result.enriched}/${result.total} (${hitRate}% hit rate)`,
      outcomeType: 'enrichment',
      outcomeScore: hitRate >= 25 ? 0.8 : hitRate >= 15 ? 0.6 : 0.3,
      signalSource: 'data_rehab_enrichment',
    });

    return { outputText, durationMs, costUsd: 0, extra: { enrichResult: result, hitRate, methodDist } };
  },

  // ── Data Rehab Analytics — daily pipeline health for workspace_id=4 ──
  data_rehab_analytics: async ({ message, runId, agent }) => {
    const { get: dbGet, all: dbAll } = require('../db/connection');
    const brain = require('../services/collectiveBrain');
    const startTime = Date.now();

    // Lead stats by status
    const leadStats = dbAll("SELECT status, COUNT(*) AS cnt FROM cfo_leads WHERE workspace_id = 4 GROUP BY status ORDER BY cnt DESC") || [];
    const totalLeads = leadStats.reduce((sum, r) => sum + r.cnt, 0);

    // Outreach stats by status
    const outreachStats = dbAll(`
      SELECT s.status, COUNT(*) AS cnt
      FROM cfo_outreach_sequences s
      JOIN cfo_leads l ON l.id = s.lead_id
      WHERE l.workspace_id = 4
      GROUP BY s.status ORDER BY cnt DESC
    `) || [];
    const totalOutreach = outreachStats.reduce((sum, r) => sum + r.cnt, 0);

    // Recent activity (last 7 days)
    const newLeads7d = dbGet("SELECT COUNT(*) c FROM cfo_leads WHERE workspace_id = 4 AND created_at >= datetime('now', '-7 days')")?.c || 0;
    const sent7d = dbGet(`
      SELECT COUNT(*) c FROM cfo_outreach_sequences s
      JOIN cfo_leads l ON l.id = s.lead_id
      WHERE l.workspace_id = 4 AND s.status = 'sent' AND s.sent_at >= datetime('now', '-7 days')
    `)?.c || 0;
    const replied7d = dbGet(`
      SELECT COUNT(*) c FROM cfo_outreach_sequences s
      JOIN cfo_leads l ON l.id = s.lead_id
      WHERE l.workspace_id = 4 AND s.status = 'replied' AND s.replied_at >= datetime('now', '-7 days')
    `)?.c || 0;

    const replyRate = sent7d > 0 ? Math.round((replied7d / sent7d) * 100) : 0;

    const leadBreakdown = leadStats.map(r => `${r.status}: ${r.cnt}`).join(' | ');
    const outreachBreakdown = outreachStats.map(r => `${r.status}: ${r.cnt}`).join(' | ');

    const outputText = [
      `Data Rehab Analytics — Pipeline Health`,
      `  Total leads: ${totalLeads} | ${leadBreakdown}`,
      `  Total outreach: ${totalOutreach} | ${outreachBreakdown}`,
      `  Last 7 days: ${newLeads7d} new leads, ${sent7d} sent, ${replied7d} replied (${replyRate}% reply rate)`,
    ].join('\n');

    // Post to Discord
    try {
      const discord = require('../services/discordNotifier');
      await discord.sendEmbed({
        title: 'Data Rehab — Pipeline Health',
        description: outputText,
        color: 0x9C27B0,
        footer: { text: `${new Date().toISOString().slice(0, 10)} | data-rehab-analytics` },
      });
    } catch {}

    brain.recordEpisode('data-rehab-analytics', {
      actionTaken: 'Daily Data Rehab pipeline health report',
      outcome: `${totalLeads} leads, ${totalOutreach} outreach sequences, ${replyRate}% 7d reply rate`,
      outcomeType: 'report',
      outcomeScore: 0.7,
      signalSource: 'data_rehab_analytics',
    });

    const durationMs = Date.now() - startTime;
    return { outputText, durationMs, costUsd: 0, extra: { totalLeads, totalOutreach, leadStats, outreachStats, replyRate } };
  },

  // ── Pain Signal Monitor — escalation handler ─────────────────────────────
  // Parses LLM output JSON, creates/boosts leads, posts Discord alerts.
  pain_signal_monitor: async ({ message, runId, agent }) => {
    const openclawBridge = require('../services/openclawBridge');
    const brain = require('../services/collectiveBrain');
    const startTime = Date.now();

    // Run the LLM agent to scan for signals
    const agentSlug = agent?.name || 'jake-pain-signal-monitor';
    const sessionId = `signal-${agentSlug}-${new Date().toISOString().slice(0, 10)}`;
    const brainContext = await brain.buildAgentContext(agentSlug, sessionId, {
      obsTypes: ['lead_signal', 'market_insight'],
    });
    const enrichedMsg = (brainContext || '') + (message || '{"scan": true}');
    const raw = await openclawBridge.runAgent(agentSlug, { message: enrichedMsg, sessionId });
    const parsed = openclawBridge.parseOutput(raw);

    let data;
    try { data = JSON.parse(parsed.text); } catch {
      return { outputText: `Pain Signal Monitor: LLM returned non-JSON — ${(parsed.text || '').slice(0, 200)}`, durationMs: Date.now() - startTime, costUsd: parsed.costUsd || 0 };
    }

    const { run: dbRun, get } = require('../db/connection');
    let boosted = 0, created = 0;
    const signals = data.high_priority_signals || data.top_signals || [];

    for (const sig of signals) {
      const companyName = sig.company || sig.company_name;
      if (!companyName) continue;
      const existing = get('SELECT id, urgency_score, urgency_signals FROM cfo_leads WHERE company_name = ? COLLATE NOCASE LIMIT 1', [companyName]);

      const scoreBoost = sig.urgency === 'high' ? 25 : sig.urgency === 'medium' ? 15 : 10;

      if (existing) {
        // Boost urgency on existing lead
        const currentSignals = JSON.parse(existing.urgency_signals || '[]');
        currentSignals.push({ type: 'pain_signal', signal: sig.signal_type, description: sig.brief_description, date: new Date().toISOString().slice(0, 10) });
        dbRun('UPDATE cfo_leads SET urgency_score = MIN(100, urgency_score + ?), urgency_signals = ?, urgency_updated_at = datetime(\'now\') WHERE id = ?',
          [scoreBoost, JSON.stringify(currentSignals), existing.id]);
        boosted++;
      } else if (sig.lead_inserted !== false) {
        // Create new lead from signal
        const fitScore = sig.urgency === 'high' ? 85 : sig.urgency === 'medium' ? 75 : 65;
        dbRun(`INSERT INTO cfo_leads (company_name, city, state, source, source_agent, pilot_fit_score, pilot_fit_reason, status, enrichment_status, attribution_source, revenue_stage, notes)
               VALUES (?, ?, ?, 'pain_signal', 'jake', ?, ?, 'new', 'pending', 'pain_signal', 'discovered', ?)`,
          [companyName, sig.location?.split(',')[0]?.trim() || null, sig.location?.split(',')[1]?.trim() || null,
           fitScore, `${sig.signal_type}: ${sig.brief_description || ''}`,
           `Pain signal: ${sig.signal_type}. Source: ${sig.source_url || 'web search'}. ${sig.brief_description || ''}`]);
        created++;
      }
    }

    // Discord alert for high-priority signals
    const highPriority = signals.filter(s => s.urgency === 'high');
    if (highPriority.length > 0) {
      try {
        const discord = require('../services/discordNotifier');
        await discord.sendEmbed({
          title: '🚨 Pain Signals Detected',
          description: highPriority.map(s => `**${s.company}**: ${s.signal_type} — ${s.brief_description || ''}`).join('\n'),
          color: 0xFF5722,
          footer: `${created} new leads, ${boosted} boosted | ${signals.length} total signals`,
        });
      } catch {}
    }

    // Record brain episode for signal discovery
    brain.recordEpisode(agentSlug, {
      actionTaken: `Pain signal scan: ${data.searches_run || 0} searches`,
      outcome: `Found ${signals.length} signals, created ${created} leads, boosted ${boosted}`,
      outcomeType: 'discovery', outcomeScore: signals.length > 0 ? 0.7 : 0.3,
      signalSource: 'pain_signal',
    });

    return {
      outputText: `Pain Signal Monitor: ${signals.length} signals found — ${created} new leads, ${boosted} urgency boosts | ${highPriority.length} HIGH priority`,
      durationMs: Date.now() - startTime, costUsd: parsed.costUsd || 0, tokensUsed: parsed.tokensUsed || 0,
      extra: { signals_found: signals.length, created, boosted, high_priority: highPriority.length },
    };
  },

  // ── Hiring Signal Agent — escalation handler ────────────────────────────
  // Parses LLM output JSON, creates high-priority leads from job postings.
  hiring_signal_agent: async ({ message, runId, agent }) => {
    const openclawBridge = require('../services/openclawBridge');
    const brain = require('../services/collectiveBrain');
    const startTime = Date.now();

    const agentSlug = agent?.name || 'jake-hiring-signal-agent';
    const sessionId = `signal-${agentSlug}-${new Date().toISOString().slice(0, 10)}`;
    const brainContext = await brain.buildAgentContext(agentSlug, sessionId, {
      obsTypes: ['lead_signal', 'market_insight'],
    });
    const enrichedMsg = (brainContext || '') + (message || '{"scan": true}');
    const raw = await openclawBridge.runAgent(agentSlug, { message: enrichedMsg, sessionId });
    const parsed = openclawBridge.parseOutput(raw);

    let data;
    try { data = JSON.parse(parsed.text); } catch {
      return { outputText: `Hiring Signal Agent: LLM returned non-JSON — ${(parsed.text || '').slice(0, 200)}`, durationMs: Date.now() - startTime, costUsd: parsed.costUsd || 0 };
    }

    const { run: dbRun, get } = require('../db/connection');
    let created = 0, skipped = 0;
    const topSignals = data.top_signals || [];

    for (const sig of topSignals) {
      const companyName = sig.company || sig.company_name;
      if (!companyName) continue;
      const existing = get('SELECT id FROM cfo_leads WHERE company_name = ? COLLATE NOCASE LIMIT 1', [companyName]);

      if (existing) {
        // Boost urgency on existing lead
        const urgencyBoost = sig.score >= 85 ? 20 : sig.score >= 70 ? 15 : 10;
        dbRun('UPDATE cfo_leads SET urgency_score = MIN(100, urgency_score + ?), urgency_updated_at = datetime(\'now\') WHERE id = ?',
          [urgencyBoost, existing.id]);
        skipped++;
        continue;
      }

      const city = sig.location?.split(',')[0]?.trim() || null;
      const state = sig.location?.split(',')[1]?.trim() || null;
      dbRun(`INSERT INTO cfo_leads (company_name, city, state, source, source_agent, pilot_fit_score, pilot_fit_reason, status, enrichment_status, attribution_source, revenue_stage, notes)
             VALUES (?, ?, ?, 'hiring_signal', 'jake', ?, ?, 'new', 'pending', 'hiring_signal', 'discovered', ?)`,
        [companyName, city, state,
         sig.score || 70, `Hiring: ${sig.role || 'finance role'}`,
         `Hiring signal: ${sig.role} posted ${sig.posted || 'recently'}. URL: ${sig.job_url || 'n/a'}`]);
      created++;
    }

    // Discord notification
    if (created > 0) {
      try {
        const discord = require('../services/discordNotifier');
        await discord.sendEmbed({
          title: '💼 Hiring Signals — New Leads',
          description: topSignals.slice(0, 5).map(s => `**${s.company}**: ${s.role} (score: ${s.score})`).join('\n'),
          color: 0x2196F3,
          footer: `${created} new leads, ${skipped} existing boosted`,
        });
      } catch {}
    }

    brain.recordEpisode(agentSlug, {
      actionTaken: `Hiring signal scan: ${data.searches_run || 0} searches`,
      outcome: `Found ${topSignals.length} postings, created ${created} leads`,
      outcomeType: 'discovery', outcomeScore: topSignals.length > 0 ? 0.7 : 0.3,
      signalSource: 'hiring_signal',
    });

    return {
      outputText: `Hiring Signal Agent: ${topSignals.length} postings found — ${created} new leads, ${skipped} existing boosted`,
      durationMs: Date.now() - startTime, costUsd: parsed.costUsd || 0, tokensUsed: parsed.tokensUsed || 0,
      extra: { postings_found: topSignals.length, created, skipped },
    };
  },

  // ── HOA Special Assessment Monitor — escalation handler ─────────────────
  // Parses LLM output, creates HOA leads from FL condo/reserve filings.
  hoa_assessment_monitor: async ({ message, runId, agent }) => {
    const openclawBridge = require('../services/openclawBridge');
    const brain = require('../services/collectiveBrain');
    const startTime = Date.now();

    const agentSlug = agent?.name || 'hoa-special-assessment-monitor';
    const sessionId = `signal-${agentSlug}-${new Date().toISOString().slice(0, 10)}`;
    const brainContext = await brain.buildAgentContext(agentSlug, sessionId, {
      obsTypes: ['lead_signal', 'market_insight'],
    });
    const enrichedMsg = (brainContext || '') + (message || '{"scan": true}');
    const raw = await openclawBridge.runAgent(agentSlug, { message: enrichedMsg, sessionId });
    const parsed = openclawBridge.parseOutput(raw);

    let data;
    try { data = JSON.parse(parsed.text); } catch {
      return { outputText: `HOA Assessment Monitor: LLM returned non-JSON — ${(parsed.text || '').slice(0, 200)}`, durationMs: Date.now() - startTime, costUsd: parsed.costUsd || 0 };
    }

    const { run: dbRun, get } = require('../db/connection');
    let created = 0;
    const topSignals = data.top_signals || [];

    for (const sig of topSignals) {
      const hoaName = sig.hoa_name || sig.company;
      if (!hoaName) continue;

      // Check lg_engagement_queue (HOA pipeline) for dedup
      const existing = get('SELECT id FROM lg_engagement_queue WHERE title LIKE ? LIMIT 1', [`%${hoaName}%`]);
      if (existing) continue;

      const fitScore = sig.urgency === 'immediate' ? 90 : sig.urgency === '6_months' ? 75 : 60;
      dbRun(`INSERT INTO cfo_leads (company_name, city, state, source, source_agent, pilot_fit_score, pilot_fit_reason, status, enrichment_status, attribution_source, revenue_stage, notes)
             VALUES (?, ?, ?, 'special_assessment', 'hoa', ?, ?, 'new', 'pending', 'special_assessment', 'discovered', ?)`,
        [hoaName, sig.city || sig.location?.split(',')[0]?.trim() || null,
         sig.state || 'FL', fitScore,
         `${sig.signal_type}: ${sig.assessment_purpose || 'capital project'}`,
         `Assessment: ${sig.signal_type}. Amount: $${sig.assessment_amount || 'unknown'}. Units: ${sig.units_count || '?'}. Source: ${sig.source_url || 'filing search'}`]);
      created++;
    }

    if (created > 0) {
      try {
        const discord = require('../services/discordNotifier');
        await discord.sendEmbed({
          title: '🏢 HOA Assessment Signals',
          description: topSignals.slice(0, 5).map(s => `**${s.hoa_name}**: ${s.signal_type} — ${s.urgency}`).join('\n'),
          color: 0xFF9800,
          footer: `${created} new leads from ${topSignals.length} signals`,
        });
      } catch {}
    }

    brain.recordEpisode(agentSlug, {
      actionTaken: `HOA assessment scan: ${data.searches_run || 0} searches`,
      outcome: `Found ${topSignals.length} signals, created ${created} leads`,
      outcomeType: 'discovery', outcomeScore: topSignals.length > 0 ? 0.7 : 0.3,
      signalSource: 'special_assessment',
    });

    return {
      outputText: `HOA Assessment Monitor: ${topSignals.length} signals — ${created} new leads | Types: ${JSON.stringify(data.signal_breakdown || {})}`,
      durationMs: Date.now() - startTime, costUsd: parsed.costUsd || 0, tokensUsed: parsed.tokensUsed || 0,
      extra: { signals: topSignals.length, created },
    };
  },

  // ── Signal Performance Rollup — Phase 1 Revenue Tracking ────────────────
  // Computes 30-day rolling conversion rates by signal source.
  // Posts Discord summary. $0/run.
  signal_performance: async ({ message, runId, agent }) => {
    const { computeSignalPerformance, getDiscordSummary } = require('../services/signalPerformance');
    const startTime = Date.now();
    const result = computeSignalPerformance();
    const durationMs = Date.now() - startTime;

    // Post to Discord
    try {
      const discord = require('../services/discordNotifier');
      const summary = getDiscordSummary();
      await discord.sendEmbed({
        title: '📊 Signal Performance Rollup',
        description: summary,
        color: 0x4CAF50,
        footer: `${result.sources} sources | ${result.totalLeads} leads | Top: ${result.topSource}`,
      });
    } catch {}

    return {
      outputText: `Signal Performance: ${result.sources} sources, ${result.totalLeads} leads. Top: ${result.topSource}`,
      durationMs,
      costUsd: 0,
      extra: result,
    };
  },

  // ── Data Audit Service (Lane 3: Service Arbitrage) ──────────────────────
  data_audit: async ({ message, runId, agent }) => {
    const { processPendingAudits, createAndRunAudit } = require('../services/dataAuditService');
    const startTime = Date.now();

    // Parse message for direct audit request or batch mode
    let result;
    try {
      const params = JSON.parse(message || '{}');
      if (params.companyName) {
        // Direct audit request
        result = await createAndRunAudit(params);
        result = { processed: 1, results: [result] };
      } else {
        // Batch: process pending audits
        result = await processPendingAudits(params.limit || 5);
      }
    } catch {
      // Default: batch process pending
      result = await processPendingAudits(5);
    }

    const durationMs = Date.now() - startTime;
    const completed = result.results.filter(r => !r.error).length;
    const failed = result.results.filter(r => r.error).length;

    // Discord notification
    try {
      const discord = require('../services/discordNotifier');
      if (completed > 0) {
        const topScore = Math.max(...result.results.filter(r => r.chaosScore).map(r => r.chaosScore), 0);
        await discord.sendEmbed({
          title: '📋 Data Audit Complete',
          description: `${completed} audits completed${failed ? `, ${failed} failed` : ''}`,
          color: topScore >= 50 ? 0xf59e0b : 0x22c55e,
          fields: result.results.filter(r => !r.error).map(r => ({
            name: `Score: ${r.chaosScore}/100 (${r.rating})`,
            value: `${r.signals} signals found`,
            inline: true,
          })),
        });
      }
    } catch {}

    return {
      outputText: `Data Audit: ${completed} completed, ${failed} failed in ${(durationMs / 1000).toFixed(1)}s`,
      durationMs,
      costUsd: completed * 0.05,
      extra: result,
    };
  },

  // ── Prototype Deployer (Lane 2: Micro-SaaS) ────────────────────────────
  prototype_deployer: async ({ message, runId, agent }) => {
    const { deployPending, deployPrototype } = require('../services/prototypeDeployer');
    const startTime = Date.now();

    let result;
    try {
      const params = JSON.parse(message || '{}');
      if (params.prototypeId) {
        // Deploy a specific prototype
        const single = await deployPrototype(params.prototypeId);
        result = { deployed: 1, failed: 0, results: [single] };
      } else {
        // Batch: deploy pending scaffolded prototypes
        result = await deployPending(params.limit || 3);
      }
    } catch (error) {
      result = { deployed: 0, failed: 1, results: [{ error: error.message }] };
    }

    const durationMs = Date.now() - startTime;

    // Discord notification
    try {
      const discord = require('../services/discordNotifier');
      if (result.deployed > 0) {
        await discord.sendEmbed({
          title: 'Prototype Deployed',
          description: `${result.deployed} deployed, ${result.failed} failed`,
          color: result.failed === 0 ? 0x22c55e : 0xf59e0b,
          fields: result.results.filter(r => !r.error).map(r => ({
            name: r.name || 'Prototype',
            value: r.deployUrl || 'No URL',
            inline: false,
          })),
        });
      }
    } catch {}

    return {
      outputText: `Prototype Deploy: ${result.deployed} deployed, ${result.failed} failed in ${(durationMs / 1000).toFixed(1)}s`,
      durationMs,
      costUsd: 0,
      extra: result,
    };
  },

  // ── Revenue Radar (Cross-Lane Revenue Intelligence) ─────────────────────
  revenue_radar: async ({ message, runId, agent }) => {
    const { runRevenueScan, formatForDiscord } = require('../services/revenueRadar');
    const startTime = Date.now();

    const scan = await runRevenueScan();
    const durationMs = Date.now() - startTime;

    // Discord notification with top money moves
    try {
      const discord = require('../services/discordNotifier');
      const embed = formatForDiscord(scan);
      await discord.sendEmbed(embed);
    } catch {}

    const movesSummary = scan.moneyMoves.slice(0, 3).map((m, i) => `${i + 1}. ${m.action}`).join('\n');

    return {
      outputText: `Revenue Radar: ${scan.allActions.length} actions found across ${Object.values(scan.lanes).filter(l => l.status !== 'inactive').length} active lanes\n\nTop Money Moves:\n${movesSummary}`,
      durationMs,
      costUsd: 0,
      extra: scan,
    };
  },

  // ── Lead Auto-Warmup — bridges enrichment → cadence ────────────────────
  // Finds enriched leads with email that aren't in cadence yet, activates them.
  // Also reactivates stale contacted leads whose cadence went dormant (>7d).
  // $0/run — no LLM, pure SQL.
  lead_auto_warmup: async ({ message, runId, agent }) => {
    const { runWarmupCycle } = require('../services/leadAutoWarmup');
    const startTime = Date.now();
    const result = await runWarmupCycle();
    return {
      outputText: `Auto-Warmup: ${result.activated} new leads activated, ${result.reactivated} stale leads reactivated`,
      durationMs: Date.now() - startTime,
      costUsd: 0,
      extra: result,
    };
  },

  // ── Todd — Pipeline Commander ────────────────────────────────────────────
  // Runs every 2 hours: force-activates stuck leads, escalates hot leads,
  // monitors agent health. Morning briefing at 7 AM posts to Discord.
  // $0/run — pure SQL, no LLM.
  todd_pipeline_commander: async ({ message, runId, agent }) => {
    const { toddPipelineMonitor, toddMorningBriefing } = require('../services/toddPipelineCheck');
    const startTime = Date.now();
    const params = parseMessageParams(message);

    if (params.briefing === true || params.briefing === 'true') {
      const result = toddMorningBriefing();
      return {
        outputText: result.briefingText,
        durationMs: Date.now() - startTime,
        costUsd: 0,
        extra: { kpis: result.kpis, monitor: result.monitor },
      };
    }

    const result = toddPipelineMonitor();
    return {
      outputText: `Todd Pipeline Check: ${result.activated} activated, ${result.hotLeads} hot leads, ${result.stalledLeads} stalled, ${result.failedRuns} failures`,
      durationMs: Date.now() - startTime,
      costUsd: 0,
      extra: result,
    };
  },

  // ── Pending Run Executor — fires cadence follow-ups that were queued ──
  // Delegates to scheduleRunner.processPendingCadenceRuns() which already
  // handles both special-handler and LLM execution paths correctly.
  pending_run_executor: async ({ message, runId, agent }) => {
    const { all: dbAll } = require('../db/connection');
    const startTime = Date.now();
    const params = parseMessageParams(message);
    const limit = parseInt(params.limit) || 10;

    // Count pending runs first (for reporting)
    const pendingRuns = dbAll(`
      SELECT r.id, a.name as agent_name
      FROM runs r
      JOIN agents a ON a.id = r.agent_id
      WHERE r.status = 'pending'
        AND (r.trigger = 'cadence' OR r.trigger = 'auto-reply')
      ORDER BY r.created_at ASC
      LIMIT ?
    `, [limit]);

    if (pendingRuns.length === 0) {
      return { outputText: 'Pending Run Executor: No pending cadence/follow-up runs to process', durationMs: Date.now() - startTime, costUsd: 0 };
    }

    // Use the scheduleRunner's processPendingCadenceRuns which actually executes
    // (marks running -> runs handler/LLM -> marks completed/failed)
    const { processPendingCadenceRuns } = require('../services/scheduleRunner');
    await processPendingCadenceRuns();

    const durationMs = Date.now() - startTime;
    return {
      outputText: `Pending Run Executor: ${pendingRuns.length} pending runs processed`,
      durationMs,
      costUsd: 0,
      extra: { total: pendingRuns.length },
    };
  },

  // ── Cadence Activator — wake up contacted leads that need follow-ups ──
  cadence_activator: async ({ message, runId, agent }) => {
    const { get: dbGet, run: dbRun, all: dbAll } = require('../db/connection');
    const startTime = Date.now();
    const params = parseMessageParams(message);
    const minDaysStale = parseInt(params.min_days) || 5;
    const limit = parseInt(params.limit) || 50;

    // Find contacted leads with email but cadence not active, stale for N+ days
    const staleLeads = dbAll(`
      SELECT id, company_name, contact_email, status, updated_at
      FROM cfo_leads
      WHERE status = 'contacted'
        AND contact_email IS NOT NULL
        AND cadence_active = 0
        AND updated_at <= datetime('now', '-${minDaysStale} days')
      ORDER BY pilot_fit_score DESC, urgency_score DESC
      LIMIT ?
    `, [limit]);

    if (staleLeads.length === 0) {
      return { outputText: `Cadence Activator: No stale contacted leads found (min ${minDaysStale} days)`, durationMs: Date.now() - startTime, costUsd: 0 };
    }

    let activated = 0;
    for (const lead of staleLeads) {
      dbRun("UPDATE cfo_leads SET cadence_active = 1, last_touch_number = 1, next_touch_due = datetime('now'), updated_at = datetime('now') WHERE id = ?", [lead.id]);
      activated++;
    }

    console.log(`[CadenceActivator] Activated ${activated} stale leads for follow-up cadence`);

    const durationMs = Date.now() - startTime;
    return {
      outputText: `Cadence Activator: ${activated} contacted leads activated for follow-up cadence (stale ${minDaysStale}+ days)\n  Top: ${staleLeads.slice(0, 5).map(l => l.company_name).join(', ')}`,
      durationMs,
      costUsd: 0,
      extra: { activated, minDaysStale },
    };
  },
};

// ── DC Site Intel handlers (injected after SPECIAL_HANDLERS definition) ──────
const dcIntel = require('../services/dcIntel');
SPECIAL_HANDLERS.dc_intel_deal_monitor = dcIntel.dcIntelDealMonitor;
SPECIAL_HANDLERS.dc_intel_owner_research = dcIntel.dcIntelOwnerResearch;
SPECIAL_HANDLERS.dc_intel_research_queue = dcIntel.dcIntelResearchQueue;
SPECIAL_HANDLERS.dc_intel_opportunity_scout = dcIntel.dcIntelOpportunityScout;
SPECIAL_HANDLERS.dc_intel_daily_scorecard = dcIntel.dcIntelDailyScorecard;
SPECIAL_HANDLERS.dc_intel_learning_loop = dcIntel.dcIntelLearningLoop;
SPECIAL_HANDLERS.dc_intel_auto_generate = dcIntel.dcIntelAutoGenerate;
SPECIAL_HANDLERS.dc_intel_rto_scanner = dcIntel.dcIntelRTOScanner;
SPECIAL_HANDLERS.dc_intel_planning_scanner = dcIntel.dcIntelPlanningScanner;
SPECIAL_HANDLERS.dc_intel_distress_scanner = dcIntel.dcIntelDistressScanner;
SPECIAL_HANDLERS.dc_intel_meta_reviewer = dcIntel.dcIntelMetaReviewer;
SPECIAL_HANDLERS.dc_intel_weekly_digest = dcIntel.dcIntelWeeklyDigest;
SPECIAL_HANDLERS.dc_intel_dominion_monitor = dcIntel.dcIntelDominionMonitor;

// ── Agent-Reach powered handlers (RSS, YouTube, Exa) ────────────────────────

/**
 * RSS Feed Digest — polls construction, HOA, and DC Intel feeds.
 * Scores articles by keyword relevance, sends Discord digest.
 * Schedule: daily at 9am ("0 9 * * *")
 * Cost: $0
 */
SPECIAL_HANDLERS.rss_feed_digest = async ({ message, runId, agent }) => {
  const startTime = Date.now();
  const params = parseMessageParams(message);

  const { scanFeeds, formatDigest } = require('../services/rssFeedMonitor');
  const categories = params.categories || null; // null = all categories
  const minScore = params.minScore || 0.3;

  const items = await scanFeeds({ categories, minScore });

  // Send Discord digest
  try {
    const discord = require('../services/discordNotifier');
    if (items.length > 0) {
      const digest = formatDigest(items);
      discord.sendEmbed({
        title: `📡 RSS Feed Digest — ${items.length} items`,
        color: 0xff6600,
        description: digest.slice(0, 4000),
        timestamp: new Date().toISOString(),
        footer: { text: 'Agent-Reach RSS Monitor' },
      }).catch(() => {});
    }
  } catch {}

  // Brain observation
  try {
    const brain = require('../services/collectiveBrain');
    brain.observe(
      `rss-digest-${new Date().toISOString().slice(0, 10)}`,
      'rss-feed-digest', 'market_insight',
      {
        subject: `RSS Feed Scan — ${items.length} relevant articles`,
        content: items.slice(0, 5).map(i => `${i.label}: ${i.title}`).join('\n'),
        confidence: 1.0,
        metadata: { itemCount: items.length, categories: [...new Set(items.map(i => i.category))] },
      }
    );
  } catch {}

  const durationMs = Date.now() - startTime;
  const outputText = items.length > 0
    ? `RSS Digest: ${items.length} relevant articles found.\n\n` +
      items.slice(0, 10).map(i => `• [${i.label}] ${i.title} (score: ${(i.relevanceScore * 100).toFixed(0)}%)\n  ${i.link}`).join('\n')
    : 'RSS Digest: No new relevant articles found.';

  return { outputText, durationMs, costUsd: 0, extra: { itemCount: items.length } };
};

/**
 * YouTube Intel Scanner — mines transcripts from DC Intel / construction channels.
 * Extracts auto-generated subtitles, scores for relevance, creates intel notes.
 * Schedule: weekly on Monday 8am ("0 8 * * 1")
 * Cost: $0
 */
SPECIAL_HANDLERS.youtube_intel_scan = async ({ message, runId, agent }) => {
  const startTime = Date.now();
  const params = parseMessageParams(message);

  const { scanForIntel, DC_INTEL_SEARCHES, CONSTRUCTION_SEARCHES } = require('../services/youtubeIntel');
  const searchType = params.type || 'dc_intel'; // 'dc_intel' or 'construction'
  const searches = searchType === 'construction' ? CONSTRUCTION_SEARCHES : DC_INTEL_SEARCHES;
  const maxVideos = params.maxVideos || 3;
  const minScore = params.minScore || 0.3;

  const notes = await scanForIntel({ searches, maxVideos, minScore });

  // Post high-relevance notes to DC Intel API (if dc_intel type).
  // Bails after 2 consecutive failures — if DC API is offline, don't spend 15s × N notes timing out.
  let notesPosted = 0;
  if (searchType === 'dc_intel' && notes.length > 0) {
    const DC_API = process.env.DC_SITE_INTEL_URL || 'http://localhost:8095';
    const DC_SECRET = process.env.DC_SITE_INTEL_SECRET || '';
    let consecutiveFailures = 0;
    for (const note of notes) {
      if (consecutiveFailures >= 2) {
        console.warn(`[YouTubeIntel] DC API unreachable — skipping ${notes.length - notesPosted} remaining notes`);
        break;
      }
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (DC_SECRET) headers['X-OpenClaw-Secret'] = DC_SECRET;
        await fetch(`${DC_API}/webhooks/openclaw/intel-note`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            note_type: note.note_type,
            content: note.content,
            confidence: note.confidence,
            source_url: note.source_url,
          }),
          signal: AbortSignal.timeout(15000),
        });
        notesPosted++;
        consecutiveFailures = 0;
      } catch (err) {
        consecutiveFailures++;
        console.warn(`[YouTubeIntel] Failed to post note: ${err.message}`);
      }
    }
  }

  // Discord notification
  try {
    const discord = require('../services/discordNotifier');
    if (notes.length > 0) {
      discord.sendEmbed({
        title: `📺 YouTube Intel — ${notes.length} insights found`,
        color: 0xff0000,
        description: notes.slice(0, 3).map(n => n.content.slice(0, 300)).join('\n\n---\n\n'),
        timestamp: new Date().toISOString(),
        footer: { text: 'Agent-Reach YouTube Intel' },
      }).catch(() => {});
    }
  } catch {}

  // Brain observation
  try {
    const brain = require('../services/collectiveBrain');
    brain.observe(
      `youtube-intel-${new Date().toISOString().slice(0, 10)}`,
      'youtube-intel-scan', 'market_insight',
      {
        subject: `YouTube transcript mining — ${notes.length} intel notes`,
        content: notes.slice(0, 3).map(n => n.metadata?.title || '').join(', '),
        confidence: 1.0,
        metadata: { noteCount: notes.length, notesPosted, searchType },
      }
    );
  } catch {}

  const durationMs = Date.now() - startTime;
  const outputText = notes.length > 0
    ? `YouTube Intel: ${notes.length} insights extracted, ${notesPosted} posted to DC Intel.\n\n` +
      notes.slice(0, 5).map(n => `• ${n.metadata?.title} (${(n.metadata?.relevance_score * 100).toFixed(0)}% relevant)\n  ${n.source_url}`).join('\n')
    : 'YouTube Intel: No relevant transcripts found this scan.';

  return { outputText, durationMs, costUsd: 0, extra: { notesFound: notes.length, notesPosted } };
};

/**
 * Exa Competitor Intel — semantic search for competitive signals.
 * Finds thematic competitors and market moves that keyword search misses.
 * Schedule: weekly on Wednesday 10am ("0 10 * * 3")
 * Cost: $0
 */
SPECIAL_HANDLERS.exa_competitor_intel = async ({ message, runId, agent }) => {
  const startTime = Date.now();
  const params = parseMessageParams(message);

  const { exaSearch } = require('../services/exaSearcher');
  const focus = params.focus || 'all'; // 'hoa', 'jake', 'dc', or 'all'

  const COMPETITOR_QUERIES = {
    hoa: [
      'HOA reserve fund financing alternative to special assessment 2026',
      'community association capital improvement lending platform',
      'HOA loan technology startup funding',
    ],
    jake: [
      'construction accounting software for contractors alternative',
      'construction CFO technology financial management automation',
      'general contractor back office software startup',
    ],
    dc: [
      'data center site selection AI tool platform',
      'commercial real estate land acquisition technology data center',
      'utility infrastructure investment intelligence platform',
    ],
  };

  const queries = focus === 'all'
    ? [...COMPETITOR_QUERIES.hoa, ...COMPETITOR_QUERIES.jake, ...COMPETITOR_QUERIES.dc]
    : (COMPETITOR_QUERIES[focus] || []);

  const allResults = [];
  const seenUrls = new Set();

  for (const query of queries) {
    try {
      const results = await exaSearch(query, 5);
      for (const r of results) {
        if (!seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          allResults.push({ ...r, query });
        }
      }
      console.log(`[ExaCompetitor] "${query.slice(0, 50)}..." → ${results.length} results`);
    } catch (err) {
      console.warn(`[ExaCompetitor] Query failed: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 1500));
  }

  // Discord notification
  try {
    const discord = require('../services/discordNotifier');
    if (allResults.length > 0) {
      discord.sendEmbed({
        title: `🔍 Competitor Intel — ${allResults.length} signals`,
        color: 0x5865f2,
        description: allResults.slice(0, 5).map(r =>
          `**${r.title?.slice(0, 80)}**\n${r.url}\n_Query: ${r.query.slice(0, 60)}_`
        ).join('\n\n'),
        timestamp: new Date().toISOString(),
        footer: { text: 'Agent-Reach Exa Competitor Intel' },
      }).catch(() => {});
    }
  } catch {}

  // Brain observation
  try {
    const brain = require('../services/collectiveBrain');
    brain.observe(
      `exa-competitor-${new Date().toISOString().slice(0, 10)}`,
      'exa-competitor-intel', 'competitor_signal',
      {
        subject: `Exa competitor scan — ${allResults.length} signals across ${queries.length} queries`,
        content: allResults.slice(0, 5).map(r => r.title).join(', '),
        confidence: 1.0,
        metadata: { signalCount: allResults.length, focus, queryCount: queries.length },
      }
    );
  } catch {}

  const durationMs = Date.now() - startTime;
  const outputText = allResults.length > 0
    ? `Competitor Intel: ${allResults.length} signals from ${queries.length} semantic queries.\n\n` +
      allResults.slice(0, 10).map(r => `• ${r.title?.slice(0, 80)}\n  ${r.url}`).join('\n')
    : 'Competitor Intel: No new competitor signals found.';

  return { outputText, durationMs, costUsd: 0, extra: { signalCount: allResults.length, queriesRun: queries.length } };
};

// ── Terrapin Station Community Services — fence + fire outreach ──────────
SPECIAL_HANDLERS.fence_outreach_builder = async ({ message, runId, agent }) => {
  const { all: dbAll, get: dbGet, run: dbRun } = require('../db/connection');
  const { buildFenceEmail, getMaxSteps } = require('../services/fenceEmailTemplate');
  const startTime = Date.now();
  const params = parseMessageParams(message);
  const senderName = params.sender_name || 'Adam Weir';

  // ── Sync new CO HOA leads from CRM into fence_leads ──
  // Terrapin pulls from the same lead database as everyone else
  try {
    const existingEmails = new Set(dbAll('SELECT contact_email FROM fence_leads').map(r => r.contact_email?.toLowerCase()).filter(Boolean));
    const WUI_CITIES = ['ken caryl', 'castle pines', 'roxborough', 'highlands ranch', 'evergreen', 'conifer', 'golden', 'morrison', 'parker', 'castle rock'];
    const newCrmLeads = dbAll(`
      SELECT * FROM cfo_leads
      WHERE source_agent = 'hoa' AND state = 'CO'
        AND contact_email IS NOT NULL AND contact_email != ''
        AND enrichment_status = 'enriched'
      ORDER BY created_at DESC LIMIT 100
    `);
    let synced = 0;
    for (const lead of newCrmLeads) {
      if (existingEmails.has(lead.contact_email?.toLowerCase())) continue;
      const city = (lead.city || '').toLowerCase().trim();
      const isMgmt = /property manag|community manag|regional|portfolio|associa|realmanage|vesta|firstservice|sentry|castle group|cushman|management/i.test((lead.contact_title || '') + ' ' + (lead.company_name || ''));
      const isWui = WUI_CITIES.some(w => city.includes(w));
      const leadType = isMgmt ? 'mgmt_company' : 'board_president';
      const tier = isMgmt ? 1 : isWui ? 2 : 3;
      dbRun(
        `INSERT INTO fence_leads (lead_type, tier, company_name, community_name, contact_name, contact_email, contact_title, source, status, notes, wui_zone)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'crm', 'new', ?, ?)`,
        [leadType, tier, lead.company_name, lead.company_name, lead.contact_name, lead.contact_email, lead.contact_title, 'Auto-synced from CRM #' + lead.id, isWui ? 1 : 0]
      );
      synced++;
    }
    if (synced > 0) console.log(`[Terrapin] Synced ${synced} new CO leads from CRM`);
  } catch (err) {
    console.warn('[Terrapin] CRM sync warning:', err.message);
  }

  // Find new fence leads that need sequences built
  const leads = dbAll("SELECT * FROM fence_leads WHERE status = 'new' LIMIT 50");
  if (leads.length === 0) {
    return { outputText: 'Terrapin Builder: No new leads to process', durationMs: Date.now() - startTime, costUsd: 0 };
  }

  let created = 0, skipped = 0;
  for (const lead of leads) {
    // Routing logic from SOUL.md
    let seqType;
    if (lead.previous_project_type || lead.lead_type === 'warm_contact') {
      seqType = 'warm';
    } else if (lead.wui_zone === 1 && lead.community_name) {
      seqType = 'fire_wui';
    } else if (lead.lead_type === 'mgmt_company') {
      seqType = 'cold_mgmt';
    } else if (lead.lead_type === 'board_president') {
      if (!lead.community_name) { skipped++; continue; }
      seqType = 'cold_board';
    } else { skipped++; continue; }

    // Skip if sequences already exist
    const existing = dbGet('SELECT COUNT(*) as cnt FROM fence_outreach_sequences WHERE lead_id = ?', [lead.id]);
    if (existing.cnt > 0) { skipped++; continue; }

    const maxSteps = getMaxSteps(seqType);
    for (let step = 1; step <= maxSteps; step++) {
      const email = buildFenceEmail(lead, seqType, step, senderName);
      const scheduledDate = new Date();
      scheduledDate.setDate(scheduledDate.getDate() + email.dayOffset);
      dbRun(
        `INSERT INTO fence_outreach_sequences (lead_id, sequence_type, sequence_step, email_subject, email_body_html, email_body_text, status, scheduled_send_date)
         VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)`,
        [lead.id, seqType, step, email.subject, email.body_html, email.body_text, scheduledDate.toISOString()]
      );
      created++;
    }
    dbRun("UPDATE fence_leads SET status = 'contacted', updated_at = datetime('now') WHERE id = ?", [lead.id]);
  }

  return {
    outputText: `Terrapin Builder: ${created} emails built for ${leads.length} leads (${skipped} skipped)`,
    durationMs: Date.now() - startTime, costUsd: 0,
    extra: { created, skipped, leads: leads.length },
  };
};

SPECIAL_HANDLERS.fence_outreach_sender = async ({ message, runId, agent }) => {
  const { all: dbAll, get: dbGet, run: dbRun } = require('../db/connection');
  const startTime = Date.now();

  // Find approved emails that are due to send
  const approved = dbAll(
    `SELECT s.*, l.contact_email, l.contact_name, l.company_name, l.community_name
     FROM fence_outreach_sequences s
     JOIN fence_leads l ON s.lead_id = l.id
     WHERE s.status = 'approved' AND s.scheduled_send_date <= datetime('now')
     ORDER BY s.scheduled_send_date ASC`
  );

  if (approved.length === 0) {
    return { outputText: 'Terrapin Sender: No approved emails ready to send', durationMs: Date.now() - startTime, costUsd: 0 };
  }

  const sg = require('../services/sendgrid');
  let sent = 0, failed = 0;

  for (const item of approved) {
    try {
      const result = await sg.send({
        to: item.contact_email,
        subject: item.email_subject,
        html: item.email_body_html,
        text: item.email_body_text,
        persona: 'terrapin',
      });

      if (result.success) {
        dbRun(
          "UPDATE fence_outreach_sequences SET status='sent', sent_at=datetime('now'), delivery_status='delivered', sendgrid_msg_id=? WHERE id=?",
          [result.messageId || null, item.id]
        );
        sent++;
      } else {
        dbRun("UPDATE fence_outreach_sequences SET delivery_status='failed', delivery_error=? WHERE id=?",
          [result.error || 'Unknown', item.id]);
        failed++;
      }
    } catch (err) {
      dbRun("UPDATE fence_outreach_sequences SET delivery_status='failed', delivery_error=? WHERE id=?",
        [err.message, item.id]);
      failed++;
    }
  }

  // Update daily metrics
  const today = new Date().toISOString().split('T')[0];
  const existing = dbGet('SELECT id FROM fence_metrics WHERE date = ?', [today]);
  if (existing) {
    dbRun('UPDATE fence_metrics SET emails_sent = emails_sent + ? WHERE date = ?', [sent, today]);
  } else {
    dbRun('INSERT INTO fence_metrics (date, emails_sent) VALUES (?, ?)', [today, sent]);
  }

  return {
    outputText: `Terrapin Sender: ${sent} sent, ${failed} failed (of ${approved.length} approved)`,
    durationMs: Date.now() - startTime, costUsd: 0,
    extra: { sent, failed, total: approved.length },
  };
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
      let runResult;

      if (useOllama) {
        // Try Ollama first (free, local)
        emitLog(`Starting Ollama agent "${agent.name}" (${ollamaModel} — free local inference)...`);
        try {
          const ollamaBridge = require('../services/ollamaBridge');
          runResult = await withTimeout(
            ollamaBridge.runAgent(agent.name, { openclawId, message, sessionId, ollamaModel }),
            RUN_TIMEOUT_MS
          );
          emitLog(`Agent "${agent.name}" completed via Ollama.`);
        } catch (ollamaErr) {
          // Ollama failed — fall back to OpenClaw/OpenAI if available
          if (openclawId) {
            emitLog(`Ollama failed (${ollamaErr.message.split('\n')[0]}) — falling back to OpenClaw...`);
            const openclawBridge = require('../services/openclawBridge');
            runResult = await withTimeout(
              openclawBridge.runAgent(agent.id, { openclawId, message, sessionId }),
              RUN_TIMEOUT_MS
            );
            emitLog(`Agent "${agent.name}" completed via OpenClaw fallback.`);
          } else {
            throw ollamaErr; // No fallback available
          }
        }
      } else {
        emitLog(`Starting OpenClaw agent "${agent.name}" (${openclawId})...`);
        const openclawBridge = require('../services/openclawBridge');
        runResult = await withTimeout(
          openclawBridge.runAgent(agent.id, { openclawId, message, sessionId }),
          RUN_TIMEOUT_MS
        );
        emitLog(`Agent "${agent.name}" completed.`);
      }

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
      postProcessLLMOutput(agent, outputText, message, { runId });

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
