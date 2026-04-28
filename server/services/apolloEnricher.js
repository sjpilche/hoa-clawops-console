/**
 * @file apolloEnricher.js
 * @description Unified Apollo.io enrichment service for all workspaces (Jake, Data Rehab, HOA).
 *
 * Replaces Playwright as the primary contact enrichment method.
 * Uses Apollo's REST API for people search, people match, and organization enrichment.
 *
 * Endpoints used:
 *   POST /api/v1/mixed_people/api_search   — find contacts at a company by title
 *   POST /api/v1/people/match          — enrich a specific person
 *   GET  /api/v1/organizations/enrich   — get company firmographic data
 *
 * Auth: x-api-key header from process.env.APOLLO_API_KEY
 */

'use strict';

const { run, get, all } = require('../db/connection');

const APOLLO_BASE = 'https://api.apollo.io';

// Default titles to search for when enriching CFO/finance leads
const DEFAULT_TITLES = ['CFO', 'Controller', 'VP Finance', 'Director Finance', 'COO'];

// ERP keywords → canonical names
const ERP_MAP = [
  { pattern: /quickbooks/i, label: 'QuickBooks' },
  { pattern: /sage/i, label: 'Sage300' },
  { pattern: /vista/i, label: 'Vista' },
  { pattern: /\bsap\b/i, label: 'SAP' },
  { pattern: /netsuite/i, label: 'NetSuite' },
  { pattern: /dynamics/i, label: 'Dynamics' },
  { pattern: /xero/i, label: 'Xero' },
  { pattern: /freshbooks/i, label: 'FreshBooks' },
];

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function getApiKey() {
  return process.env.APOLLO_API_KEY || null;
}

/**
 * Make an authenticated request to the Apollo API.
 * Handles 429 rate-limit with one retry after the indicated wait.
 */
async function apolloFetch(method, path, { body = null, params = null, _retried = false } = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { ok: false, status: 0, data: null, error: 'APOLLO_API_KEY not configured' };
  }

  let url = `${APOLLO_BASE}${path}`;
  if (params) {
    const qs = new URLSearchParams(params).toString();
    url += `?${qs}`;
  }

  const headers = {
    'x-api-key': apiKey,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  const APOLLO_TIMEOUT_MS = 30000; // 30s timeout
  const opts = { method, headers, signal: AbortSignal.timeout(APOLLO_TIMEOUT_MS) };
  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    opts.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(url, opts);

    // Rate limited — wait and retry once
    if (res.status === 429 && !_retried) {
      const retryAfter = parseInt(res.headers.get('retry-after') || '5', 10);
      const waitMs = Math.min(retryAfter * 1000, 30000);
      console.log(`[ApolloEnricher] Rate limited. Waiting ${waitMs}ms before retry...`);
      await new Promise(r => setTimeout(r, waitMs));
      return apolloFetch(method, path, { body, params, _retried: true });
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, status: res.status, data: null, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }

    const data = await res.json();
    return { ok: true, status: res.status, data, error: null };

  } catch (err) {
    return { ok: false, status: 0, data: null, error: err.message };
  }
}

/**
 * Detect ERP/tech stack from Apollo's technologies array.
 * Returns canonical label string (e.g. "QuickBooks", "Sage300+QuickBooks").
 */
function detectErp(technologies) {
  if (!Array.isArray(technologies) || technologies.length === 0) return null;
  const joined = technologies.join(' | ');
  const matches = [];
  for (const { pattern, label } of ERP_MAP) {
    if (pattern.test(joined) && !matches.includes(label)) {
      matches.push(label);
    }
  }
  return matches.length > 0 ? matches.join('+') : null;
}

/**
 * Record a brain observation for successful enrichments (fire-and-forget).
 */
function recordBrainObservation(lead, enrichResult) {
  try {
    const brain = require('./collectiveBrain');
    if (typeof brain.observe === 'function') {
      brain.observe('apollo-enrichment', 'Jake', 'enrichment_result', {
        subject: lead.company_name,
        content: `Apollo enriched ${lead.company_name}: ${enrichResult.email || 'no email'} (${enrichResult.title || 'no title'}). Employee count: ${enrichResult.company_data?.employees || 'unknown'}. ERP: ${enrichResult.company_data?.erp || 'unknown'}.`,
        confidence: enrichResult.email ? 0.9 : 0.5,
        metadata: {
          lead_id: lead.id,
          method: 'apollo',
          email: enrichResult.email || null,
          title: enrichResult.title || null,
        },
      });
    }
  } catch { /* collectiveBrain not available — no-op */ }
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Search for people at a company matching title criteria.
 *
 * @param {object} opts
 * @param {string} opts.companyName    - Organization name to search
 * @param {string} [opts.location]     - e.g. "Tampa, Florida"
 * @param {string[]} [opts.titles]     - Title filters (default: CFO/Controller/VP Finance)
 * @param {number} [opts.limit=5]      - Max results
 * @returns {Promise<Array>} Array of contact objects
 */
async function searchPeople({ companyName, location, titles, limit = 5 } = {}) {
  if (!companyName) return [];

  const body = {
    person_titles: titles || DEFAULT_TITLES,
    q_organization_name: companyName,
    per_page: limit,
  };
  if (location) {
    body.organization_locations = [location];
  }

  const res = await apolloFetch('POST', '/api/v1/mixed_people/api_search', { body });
  if (!res.ok) {
    console.log(`[ApolloEnricher] People search failed for "${companyName}": ${res.error}`);
    return [];
  }

  const people = res.data?.people || [];
  return people.map(p => ({
    first_name: p.first_name || null,
    last_name: p.last_name || null,
    name: [p.first_name, p.last_name].filter(Boolean).join(' ') || null,
    email: p.email || null,
    phone: p.phone_numbers?.[0]?.sanitized_number || null,
    title: p.title || null,
    linkedin_url: p.linkedin_url || null,
    organization: {
      name: p.organization?.name || null,
      employees: p.organization?.estimated_num_employees || null,
      revenue: p.organization?.annual_revenue || null,
      technologies: p.organization?.technologies || [],
    },
  }));
}

/**
 * Enrich a specific organization by domain.
 *
 * @param {string} domain - e.g. "acmebuilders.com"
 * @returns {Promise<object>} { name, employees, revenue, technologies, industry }
 */
async function enrichOrganization(domain) {
  if (!domain) return { success: false, error: 'No domain provided' };

  const res = await apolloFetch('GET', '/api/v1/organizations/enrich', {
    params: { domain },
  });

  if (!res.ok) {
    console.log(`[ApolloEnricher] Org enrich failed for "${domain}": ${res.error}`);
    return { success: false, error: res.error };
  }

  const org = res.data?.organization || {};
  return {
    success: true,
    name: org.name || null,
    employees: org.estimated_num_employees || null,
    revenue: org.annual_revenue || null,
    technologies: org.technologies || [],
    industry: org.industry || null,
    erp: detectErp(org.technologies),
  };
}

/**
 * Enrich a single lead from cfo_leads.
 *
 * Strategy:
 * 1. People search by company name + location + title filter
 * 2. Extract email, phone, title, linkedin, org data
 * 3. Update the lead row in DB
 *
 * @param {object} lead - A cfo_leads row object (must have id, company_name)
 * @returns {Promise<object>} { success, email, phone, title, company_data }
 */
async function enrichLead(lead) {
  if (!lead || !lead.id) {
    return { success: false, error: 'Invalid lead object' };
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn('[ApolloEnricher] APOLLO_API_KEY not configured');
    return { success: false, error: 'APOLLO_API_KEY not configured' };
  }

  // Skip already-enriched leads
  if (lead.contact_email && lead.enrichment_status === 'enriched') {
    return { success: true, skipped: true, method: 'already_enriched' };
  }

  console.log(`[ApolloEnricher] Enriching: ${lead.company_name} (${lead.city || ''}, ${lead.state || 'FL'})`);

  // Mark as in-progress
  run("UPDATE cfo_leads SET enrichment_status = 'in_progress', updated_at = datetime('now') WHERE id = ?", [lead.id]);

  let email = null;
  let phone = null;
  let contactName = lead.contact_name || null;
  let contactTitle = lead.contact_title || null;
  let linkedin = null;
  let companyData = {};

  try {
    // ── Step 1: People search by company + location + title ──
    const location = [lead.city, lead.state || 'Florida'].filter(Boolean).join(', ');
    const people = await searchAndReveal({
      companyName: lead.company_name,
      location: location || undefined,
      titles: DEFAULT_TITLES,
      limit: 5,
    });

    if (people.length > 0) {
      // Pick the best match — first person with an email wins
      const best = people.find(p => p.email) || people[0];

      email = best.email || null;
      phone = best.phone || null;
      if (best.name) contactName = best.name;
      if (best.title) contactTitle = best.title;
      linkedin = best.linkedin_url || null;

      // Extract org data from the first person's org record
      const org = best.organization || {};
      companyData = {
        employees: org.employees || null,
        revenue: org.revenue || null,
        technologies: org.technologies || [],
        erp: detectErp(org.technologies),
      };
    }

    // ── Step 2: If no email from search, try people match with known contact ──
    if (!email && contactName) {
      const nameParts = contactName.trim().split(/\s+/);
      if (nameParts.length >= 2) {
        const matchRes = await apolloFetch('POST', '/api/v1/people/match', {
          body: {
            first_name: nameParts[0],
            last_name: nameParts[nameParts.length - 1],
            organization_name: lead.company_name,
            reveal_personal_emails: true,
          },
        });

        if (matchRes.ok && matchRes.data?.person) {
          const p = matchRes.data.person;
          if (p.email) email = p.email;
          if (p.phone_numbers?.[0]?.sanitized_number && !phone) {
            phone = p.phone_numbers[0].sanitized_number;
          }
          if (p.title && !contactTitle) contactTitle = p.title;
          if (p.linkedin_url && !linkedin) linkedin = p.linkedin_url;

          // Org data from match endpoint
          if (p.organization && !companyData.employees) {
            companyData = {
              employees: p.organization.estimated_num_employees || companyData.employees,
              revenue: p.organization.annual_revenue || companyData.revenue,
              technologies: p.organization.technologies || companyData.technologies || [],
              erp: detectErp(p.organization.technologies) || companyData.erp,
            };
          }
        }
      }
    }

    // ── Step 3: Update the lead in DB ──
    if (email || phone || contactName || linkedin || companyData.employees) {
      const updates = [];
      const params = [];

      // Validate email format before saving — reject garbage data
      const emailValid = email && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
        && !/(@example\.|@test\.|noreply|no-reply)/i.test(email);
      if (emailValid) { updates.push('contact_email = ?'); params.push(email); }
      else if (email) { console.warn(`[ApolloEnricher] Invalid email rejected for ${lead.company_name}: ${email}`); }
      if (phone) { updates.push('phone = ?'); params.push(phone); }
      if (contactName && !lead.contact_name) { updates.push('contact_name = ?'); params.push(contactName); }
      if (contactTitle && !lead.contact_title) { updates.push('contact_title = ?'); params.push(contactTitle); }
      if (linkedin) { updates.push('contact_linkedin = ?'); params.push(linkedin); }
      if (companyData.employees) { updates.push('employee_count = ?'); params.push(companyData.employees); }
      if (companyData.erp) { updates.push('erp_type = ?'); params.push(companyData.erp); }

      updates.push('enrichment_status = ?'); params.push(emailValid ? 'enriched' : 'partial');
      updates.push("enrichment_method = 'apollo'");
      updates.push("enriched_at = datetime('now')");
      updates.push("updated_at = datetime('now')");

      params.push(lead.id);
      run(`UPDATE cfo_leads SET ${updates.join(', ')} WHERE id = ?`, params);

      console.log(`[ApolloEnricher] Enriched ${lead.company_name}: ${email || 'no email'} (${contactTitle || 'no title'})`);

      // Auto-warmup: activate cadence for newly enriched leads with valid email
      if (emailValid) {
        try {
          run(`UPDATE cfo_leads
               SET cadence_active = 1,
                   next_touch_due = datetime('now'),
                   status = CASE WHEN status IN ('new', 'discovered') OR status IS NULL THEN 'queued' ELSE status END,
                   updated_at = datetime('now')
               WHERE id = ? AND (cadence_active IS NULL OR cadence_active = 0)`, [lead.id]);
        } catch (e) {
          console.warn(`[ApolloEnricher] Auto-warmup failed for ${lead.id}:`, e.message);
        }
      }

      const result = { success: true, method: 'apollo', email, phone, title: contactTitle, linkedin, company_data: companyData };
      recordBrainObservation(lead, result);
      return result;

    } else {
      // Nothing found
      run("UPDATE cfo_leads SET enrichment_status = 'failed', enrichment_method = 'apollo', enriched_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", [lead.id]);
      console.log(`[ApolloEnricher] No results for ${lead.company_name}`);
      return { success: false, method: 'apollo', company_data: companyData };
    }

  } catch (err) {
    run("UPDATE cfo_leads SET enrichment_status = 'failed', updated_at = datetime('now') WHERE id = ?", [lead.id]);
    console.error(`[ApolloEnricher] Error enriching ${lead.company_name}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Batch enricher — process unenriched leads via Apollo.
 *
 * @param {object} opts
 * @param {number} [opts.limit=20]        - Max leads to process
 * @param {string} [opts.workspace_id]    - Optional workspace filter
 * @returns {Promise<object>} { enriched, failed, total, results }
 */
async function enrichMultipleLeads({ limit = 20, workspace_id = null } = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn('[ApolloEnricher] APOLLO_API_KEY not configured');
    return { success: false, error: 'APOLLO_API_KEY not configured', enriched: 0, failed: 0, total: 0, results: [] };
  }

  console.log(`[ApolloEnricher] Starting batch enrichment: limit=${limit}${workspace_id ? ', workspace_id=' + workspace_id : ''}`);

  const query = `SELECT * FROM cfo_leads
    WHERE enrichment_status IN ('pending', 'partial', 'failed')
      AND (workspace_id = ? OR ? IS NULL)
    ORDER BY pilot_fit_score DESC
    LIMIT ?`;
  const leads = all(query, [workspace_id, workspace_id, limit]);

  if (leads.length === 0) {
    console.log('[ApolloEnricher] No leads need enrichment.');
    return { total: 0, enriched: 0, failed: 0, results: [] };
  }

  console.log(`[ApolloEnricher] Found ${leads.length} leads to enrich`);

  const results = [];
  let enriched = 0;
  let failed = 0;

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    try {
      const result = await enrichLead(lead);
      results.push({ id: lead.id, company: lead.company_name, ...result });
      if (result.success && !result.skipped) enriched++;
      else if (!result.success) failed++;
    } catch (err) {
      results.push({ id: lead.id, company: lead.company_name, success: false, error: err.message });
      failed++;
    }

    // 200ms delay between calls to respect rate limits
    if (i < leads.length - 1) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  const summary = `Apollo enriched ${enriched}/${leads.length} leads (${failed} failed)`;
  console.log(`[ApolloEnricher] ${summary}`);

  return {
    total: leads.length,
    enriched,
    failed,
    results,
    summary,
  };
}

/**
 * Search for people then reveal their emails via bulk_match.
 *
 * Apollo's free search returns obfuscated results (no last name, no email).
 * This function does search + bulk_match in sequence to get full contact data.
 *
 * @param {object} opts - Same as searchPeople
 * @returns {Promise<Array>} Array of contacts with revealed emails
 */
async function searchAndReveal({ companyName, location, titles, limit = 5 } = {}) {
  if (!companyName) return [];

  // Step 1: Search to get person IDs
  const body = {
    person_titles: titles || DEFAULT_TITLES,
    q_organization_name: companyName,
    per_page: limit,
  };
  if (location) body.organization_locations = [location];

  const searchRes = await apolloFetch('POST', '/api/v1/mixed_people/api_search', { body });
  if (!searchRes.ok) {
    console.log(`[ApolloEnricher] People search failed for "${companyName}": ${searchRes.error}`);
    return [];
  }

  const searchPeople = searchRes.data?.people || [];
  if (searchPeople.length === 0) return [];

  // Filter to people who actually have emails to reveal
  const revealable = searchPeople.filter(p => p.has_email && p.id);
  if (revealable.length === 0) {
    console.log(`[ApolloEnricher] Search found ${searchPeople.length} people but none have emails for "${companyName}"`);
    return searchPeople.map(p => ({
      first_name: p.first_name || null,
      last_name: null,
      name: p.first_name || null,
      email: null,
      phone: null,
      title: p.title || null,
      linkedin_url: null,
      organization: { name: p.organization?.name || null },
    }));
  }

  // Step 2: Bulk match to reveal emails (costs credits)
  const matchRes = await apolloFetch('POST', '/api/v1/people/bulk_match', {
    body: { details: revealable.map(p => ({ id: p.id })) },
  });

  if (!matchRes.ok) {
    console.log(`[ApolloEnricher] Bulk match failed for "${companyName}": ${matchRes.error}`);
    return [];
  }

  const matches = matchRes.data?.matches || [];
  const creditsUsed = matchRes.data?.credits_consumed || 0;
  console.log(`[ApolloEnricher] Revealed ${matches.length} contacts for "${companyName}" (${creditsUsed} credits)`);

  return matches.filter(Boolean).map(p => ({
    first_name: p.first_name || null,
    last_name: p.last_name || null,
    name: p.name || [p.first_name, p.last_name].filter(Boolean).join(' ') || null,
    email: p.email || null,
    phone: p.phone_numbers?.[0]?.sanitized_number || null,
    title: p.title || null,
    linkedin_url: p.linkedin_url || null,
    organization: {
      name: p.organization?.name || null,
      employees: p.organization?.estimated_num_employees || null,
    },
  }));
}

module.exports = {
  enrichLead,
  enrichMultipleLeads,
  enrichOrganization,
  searchPeople,
  searchAndReveal,
  // Exported for testing
  detectErp,
};
