/**
 * @file dcIntel.js
 * @description DC Site Intel integration — 4 special handlers for the dc-intel workspace.
 *
 * Handlers:
 *   dcIntelDealMonitor     — Daily market + owner distress scan → intel notes
 *   dcIntelOwnerResearch   — Deep-dive single owner → owner-intel POST
 *   dcIntelResearchQueue   — Batch: poll candidates → run owner research on each
 *   dcIntelOpportunityScout — Hunt NEW land opportunities not yet in DB
 *
 * All handlers:
 *   - Use Brave Search for web research ($0 — included in plan)
 *   - POST findings to DC Site Intel via webhook API (localhost)
 *   - Record brain observations (Layer 1) for collective memory
 *   - Cost: ~$0/run (no LLM export — just search + structured POST)
 */

'use strict';

const { exaSearch } = require('./exaSearcher');

const DC_API = process.env.DC_SITE_INTEL_URL || 'http://localhost:8095';
const DC_SECRET = process.env.DC_SITE_INTEL_SECRET || '';
const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
const BRAVE_API_URL = 'https://api.search.brave.com/res/v1/web/search';
// Use Exa for exploratory/semantic queries, Brave for site:-scoped and county recorder queries
const USE_EXA = process.env.DC_INTEL_USE_EXA !== 'false'; // on by default

// ── County recorder / assessor site prefixes for high-credibility queries ─────
const COUNTY_RECORD_SITES = {
  'Cook-IL':           'site:cookcountyassessor.com OR site:cookcountyrecorder.com',
  'Will-IL':           'site:willcountyillinois.com OR site:willcountyrecorder.com',
  'DuPage-IL':         'site:dupageco.org',
  'Kane-IL':           'site:co.kane.il.us',
  'Kendall-IL':        'site:co.kendall.il.us',
  'Loudoun-VA':        'site:loudouncounty.gov OR site:loudouneconomicdevelopment.org',
  'Prince William-VA': 'site:pwcgov.org OR site:pwcedc.org',
  'Montgomery-MD':     'site:montgomerycountymd.gov',
  'Prince Georges-MD': 'site:princegeorgescountymd.gov',
};

// Target counties for opportunity scouting (IL + DC/MD/VA)
const TARGET_MARKETS = [
  { county: 'Cook', state: 'IL' },
  { county: 'Will', state: 'IL' },
  { county: 'DuPage', state: 'IL' },
  { county: 'Kendall', state: 'IL' },
  { county: 'Kane', state: 'IL' },
  { county: 'Loudoun', state: 'VA' },
  { county: 'Prince William', state: 'VA' },
  { county: 'Montgomery', state: 'MD' },
  { county: 'Prince Georges', state: 'MD' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const DC_TIMEOUT_MS = 30000; // 30s timeout for DC Site Intel calls

/** POST to DC Site Intel webhook. Returns parsed JSON or throws. */
async function dcPost(path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (DC_SECRET) headers['X-OpenClaw-Secret'] = DC_SECRET;
  const resp = await fetch(`${DC_API}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(DC_TIMEOUT_MS),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`DC API POST ${path} failed: ${resp.status} — ${text.slice(0, 200)}`);
  }
  return resp.json();
}

/** GET from DC Site Intel API. Returns parsed JSON or throws. */
async function dcGet(path) {
  const headers = {};
  if (DC_SECRET) headers['X-OpenClaw-Secret'] = DC_SECRET;
  const resp = await fetch(`${DC_API}${path}`, { headers, signal: AbortSignal.timeout(DC_TIMEOUT_MS) });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`DC API GET ${path} failed: ${resp.status} — ${text.slice(0, 200)}`);
  }
  return resp.json();
}

/**
 * Run a Brave Search query. Returns array of { title, url, description }.
 * @param {string} query
 * @param {number} count  — max results (1–20)
 * @param {string} freshness — 'pd' past day, 'pw' past week, 'pm' past month, null = any time
 */
async function braveSearch(query, count = 10, freshness = null) {
  if (!BRAVE_API_KEY) throw new Error('BRAVE_API_KEY not set');
  const p = { q: query, count: String(count), country: 'US', search_lang: 'en' };
  if (freshness) p.freshness = freshness;
  const params = new URLSearchParams(p);
  const resp = await fetch(`${BRAVE_API_URL}?${params}`, {
    headers: { 'Accept': 'application/json', 'X-Subscription-Token': BRAVE_API_KEY },
    signal: AbortSignal.timeout(DC_TIMEOUT_MS),
  });
  if (!resp.ok) return [];
  const data = await resp.json();
  return (data.web && data.web.results) ? data.web.results : [];
}

/**
 * Smart search — routes to Exa for semantic queries, Brave for site:-scoped queries.
 * Falls back to Brave only on Exa errors (not on 0 results) to avoid posting
 * low-quality Brave results when Exa legitimately finds nothing for a specific query.
 * Returns same shape as braveSearch.
 */
async function smartSearch(query, count = 10, freshness = null) {
  const isSiteScoped = /site:\S+/.test(query);
  if (!USE_EXA || isSiteScoped) {
    return braveSearch(query, count, freshness);
  }
  try {
    const results = await exaSearch(query, count);
    if (results.length > 0) {
      console.log(`[dcIntel] Exa: ${results.length} results for "${query.slice(0, 60)}..."`);
      return results;
    }
    // Exa returned 0 results — this means nothing relevant exists right now.
    // Do NOT fall back to Brave with the same query: Brave would return broad,
    // low-quality matches that pass the 0.35 quality gate and pollute intel notes.
    console.log(`[dcIntel] Exa found nothing for "${query.slice(0, 60)}..." — skipping (no Brave fallback)`);
    return [];
  } catch (err) {
    // Only fall back to Brave on actual errors (network, timeout, mcporter down)
    console.warn(`[dcIntel] Exa error (${err.message}), falling back to Brave`);
    return braveSearch(query, count, freshness);
  }
}

/** Extract a simple signal from search results — returns null if nothing useful found. */
function extractSignal(results, minDescriptionLength = 40) {
  for (const r of results) {
    const text = `${r.title || ''} ${r.description || ''}`.trim();
    if (text.length >= minDescriptionLength) {
      return { title: r.title, url: r.url, snippet: r.description || r.title };
    }
  }
  return null;
}

/** Naive distress signal detector from search snippets. */
function hasDistressSignal(results) {
  const DISTRESS_WORDS = [
    'foreclosure', 'tax lien', 'tax sale', 'delinquent', 'bankruptcy',
    'estate sale', 'probate', 'divorce', 'litigation', 'lawsuit',
    'judgement', 'judgment', 'sheriff sale', 'lis pendens',
  ];
  const combined = results.map(r => `${r.title} ${r.description || ''}`).join(' ').toLowerCase();
  return DISTRESS_WORDS.some(w => combined.includes(w));
}

/** Naive litigation detector. */
function hasLitigationSignal(results) {
  const LITIGATION_WORDS = ['lawsuit', 'sued', 'litigation', 'court case', 'plaintiff', 'defendant', 'complaint filed'];
  const combined = results.map(r => `${r.title} ${r.description || ''}`).join(' ').toLowerCase();
  return LITIGATION_WORDS.some(w => combined.includes(w));
}

/** Try to infer entity_type from search results + owner name. */
function inferEntityType(ownerName, results) {
  const name = (ownerName || '').toUpperCase();
  const snippet = results.map(r => `${r.title} ${r.description || ''}`).join(' ').toLowerCase();
  if (/LLC|L\.L\.C|LIMITED LIABILITY/.test(name)) return 'llc';
  if (/\bINC\b|\bCORP\b|\bINCORPORATED\b|\bCORPORATION\b/.test(name)) return 'corporation';
  if (/TRUST/.test(name)) return 'trust';
  if (/ESTATE/.test(name)) return 'trust'; // treat estates like trusts
  if (/\bLP\b|\bLLP\b/.test(name)) return 'corporation';
  if (snippet.includes('llc') || snippet.includes('limited liability')) return 'llc';
  if (snippet.includes('corporation') || snippet.includes('incorporated')) return 'corporation';
  return null; // unknown — let DB keep whatever it has
}

/** Extract related entity names from search snippets (crude but useful). */
function extractRelatedEntities(ownerName, results) {
  const found = [];
  const combined = results.map(r => `${r.title} ${r.description || ''}`).join(' ');
  // Match LLC/Corp patterns nearby the owner name
  const LLC_PATTERN = /([A-Z][A-Za-z0-9\s&,.']{3,50}\s(?:LLC|Inc|Corp|LP|LLP|Trust))/g;
  const matches = [...combined.matchAll(LLC_PATTERN)];
  for (const m of matches) {
    const entity = m[1].trim();
    if (entity !== ownerName && entity.length > 5) found.push(entity);
    if (found.length >= 5) break;
  }
  return [...new Set(found)];
}

/** Return up to `max` usable signals from Brave results (replaces extractSignal). */
function extractAllSignals(results, max = 5) {
  return results
    .filter(r => `${r.title || ''} ${r.description || ''}`.trim().length >= 40)
    .slice(0, max)
    .map(r => ({ title: r.title, url: r.url, snippet: r.description || r.title }));
}

/** Build a structured intel note content string that contains scoring deal keywords. */
function buildNoteContent({ county, state, signal, noteType = 'market_intel', acreage = null, apn = null }) {
  const header = noteType === 'municipal_intel' ? 'REZONING'
    : noteType === 'utility_intel' ? 'UTILITY'
    : noteType === 'competitor_intel' ? 'DATA CENTER'
    : 'MARKET SIGNAL';

  const text = `${signal.title} ${signal.snippet}`;
  const acres = acreage || extractAcreage(text);
  const pin   = apn     || extractAPN(text);

  const parts = [
    `[${county} Co, ${state}] ${header} | data_center_land`,
    `parcel site plan hyperscale acres industrial`,
    `Source: ${signal.title}.`,
    signal.snippet.slice(0, 250),
  ];
  if (acres) parts.push(`Acreage: ${acres} ac.`);
  if (pin)   parts.push(`APN: ${pin}.`);
  parts.push(`Deal keywords: rezoning, site plan, industrial, parcel, acquisition.`);
  return parts.join(' ').slice(0, 500);
}

/** Extract acreage from text — "45 acres", "45-acre", "45 ac" → "45" */
function extractAcreage(text) {
  const m = text.match(/(\d[\d,.]*)\s*-?\s*ac(?:re)?s?\b/i);
  return m ? m[1].replace(/,/g, '') : null;
}

/** Extract APN / PIN from text */
function extractAPN(text) {
  const m = text.match(/(?:APN|PIN|parcel\s*(?:no|id|#)?)[:\s]+([0-9\-]{7,20})/i)
         || text.match(/\b(\d{2}-\d{2}-\d{3}-\d{3})\b/);
  return m ? m[1] : null;
}

/** Extract sale date — "sold in Jan 2022", "closed Q3 2019" */
function extractSaleDate(text) {
  const m = text.match(/(?:sold|closed|transferred|recorded)\s+(?:in\s+)?([A-Za-z]+\s+\d{4}|Q[1-4]\s+\d{4}|\d{1,2}\/\d{4})/i);
  return m ? m[1] : null;
}

/** Extract sale amount — "$4.2M", "$4,200,000", "4.2 million" */
function extractSaleAmount(text) {
  const m = text.match(/\$\s*([\d,.]+)\s*(?:million|M\b)/i)
         || text.match(/\$\s*([\d,]{5,})/);
  if (!m) return null;
  const raw = m[1].replace(/,/g, '');
  if (m[0].toLowerCase().includes('million') || m[0].toUpperCase().includes('M')) {
    return `$${(parseFloat(raw) * 1_000_000).toFixed(0)}`;
  }
  return `$${raw}`;
}

/** Extract portfolio size — "owns 12 properties", "12-parcel portfolio" */
function extractPortfolioSize(text) {
  const m = text.match(/(\d+)\s*-?\s*(?:propert|parcel|site|asset)(?:ies|s)?\b/i)
         || text.match(/portfolio\s+of\s+(\d+)/i);
  return m ? parseInt(m[1]) : null;
}

/** Extract SOS entity ID — "Entity ID: 12345", "File #: 67890" */
function extractSOSId(text) {
  const m = text.match(/(?:entity\s*(?:id|no|#)|file\s*#|sos\s*id)[:\s]+([A-Z0-9\-]{4,20})/i);
  return m ? m[1] : null;
}

/** Infer motivation label from signals + full text. */
function inferMotivation(distressedSignal, litigationFlag, text) {
  const t = text.toLowerCase();
  if (t.includes('tax') && (t.includes('delinquen') || t.includes('lien') || t.includes('sale'))) return 'tax_distress';
  if (t.includes('probate') || t.includes('estate')) return 'estate_probate';
  if (litigationFlag && t.includes('partition')) return 'estate_probate';
  if (t.includes('bankruptcy') || t.includes('liquidat')) return 'portfolio_liquidation';
  if (t.includes('stalled') || t.includes('permit expire') || t.includes('incomplete')) return 'development_stalled';
  if (distressedSignal) return 'tax_distress';
  return 'unknown';
}

/** Detect thesis type from 7 categories based on keywords. */
function detectThesisType(text) {
  const t = text.toLowerCase();
  if (t.includes('power') || t.includes('substation') || t.includes('transmission') || t.includes('utility')) return 'power_adjacent_industrial';
  if (t.includes('warehouse') || t.includes('distribution') || t.includes('logistics')) return 'warehouse_land';
  if (t.includes('fiber') || t.includes('conduit') || t.includes('dark fiber')) return 'fiber_conduit_adjacency';
  if (t.includes('laydown') || t.includes('staging yard') || t.includes('staging area')) return 'laydown_staging';
  if (t.includes('assem') || t.includes('assemblage') || t.includes('adjacent parcel')) return 'land_assembly';
  if (t.includes('hyperscale') || t.includes('campus') || t.includes('data center') || t.includes('datacenter')) return 'data_center_land';
  return 'data_center_land';
}

/** Extract a company name from a snippet (crude pattern match for known DC players + LLCs). */
function extractCompanyFromSnippet(snippet) {
  if (!snippet) return null;
  const m = snippet.match(/([A-Z][A-Za-z0-9\s&]{3,40}(?:LLC|Inc|Corp|LP|LLP|Properties|Realty|Development|Digital|Data Centers?))/);
  return m ? m[1].trim() : null;
}

/** Call Apollo enrichment via DC Site Intel's /apollo/enrich endpoint (fire-and-forget safe). */
async function apolloEnrich(companyName, domain = null) {
  if (!companyName) return null;
  try {
    return await dcPost('/apollo/enrich', {
      company_name: companyName,
      domain,
      roles: ['vp real estate', 'director site selection', 'chief development officer', 'cfo', 'owner'],
    });
  } catch (err) {
    console.warn(`[apolloEnrich] ${companyName}: ${err.message}`);
    return null;
  }
}

/**
 * Pre-score a Brave Search signal BEFORE creating an opportunity.
 * Returns 0.0–1.0 quality estimate. Mirrors scoring engine source_credibility tiers.
 * Used as a quality gate: only create opp if score ≥ 0.35.
 */
function estimateSignalQuality(signal) {
  let score = 0;
  const url = (signal.url || '').toLowerCase();
  const text = `${signal.title} ${signal.snippet}`.toLowerCase();

  // Source domain tier (mirrors source_credibility in opportunity_score.py)
  if (url.includes('.gov') || url.includes('sec.gov')) score += 0.40;
  else if (url.includes('datacenterfrontier') || url.includes('datacenterknowledge') || url.includes('bisnow') || url.includes('bizjournals')) score += 0.30;
  else if (url.includes('costar') || url.includes('cbre') || url.includes('jll')) score += 0.25;
  else score += 0.05; // generic/unknown domain

  // Structural specificity signals
  if (/\d+[\s-]?ac(?:re)?s?\b/i.test(text)) score += 0.20;        // acreage found
  if (/\b\d{2}-\d{2}-\d{3}|\bAPN\b|\bPIN\b/i.test(text)) score += 0.20; // APN found
  if (/\$[\d,.]+[Mm]?\b/.test(text)) score += 0.10;                // price mentioned
  if (/\b(acquired|purchased|sold|transferred|closed)\b/.test(text)) score += 0.05; // deal verb

  return Math.min(score, 1.0);
}

// ── Handler: dc_intel_deal_monitor ────────────────────────────────────────────

/**
 * Daily 7am — scans DC/warehouse market news + owner distress signals.
 * Pushes intel notes to DC Site Intel for any meaningful findings.
 */
async function dcIntelDealMonitor({ message, runId, agent }) {
  const startTime = Date.now();
  const today = new Date().getFullYear();
  let notesCreated = 0;
  let errors = 0;

  // 1. Fetch active opportunities to scan
  let candidates = [];
  try {
    candidates = await dcGet('/webhooks/openclaw/parcels/candidates?limit=10');
  } catch (err) {
    console.error('[dcIntelDealMonitor] Failed to fetch candidates:', err.message);
    // Fall back to market-level scan without opportunity context
  }

  // 2. Market-level scans (per unique county+state, once each)
  const seenMarkets = new Set();
  const markets = candidates.length > 0
    ? candidates.map(c => ({ county: c.county, state: c.state }))
    : TARGET_MARKETS.slice(0, 3);

  // Market-specific context for sharper queries
  const MARKET_CONTEXT = {
    'Cook-IL':          'Elk Grove Village Itasca Lisle O\'Hare industrial corridor',
    'Will-IL':          'Joliet intermodal logistics warehouse corridor',
    'DuPage-IL':        'Naperville Aurora Downers Grove tech campus',
    'Kane-IL':          'Elgin Aurora industrial development',
    'Kendall-IL':       'Yorkville Oswego industrial expansion',
    'Loudoun-VA':       '"Data Center Alley" Ashburn hyperscale campus',
    'Prince William-VA':'Gainesville Manassas "Digital Gateway" data center',
    'Montgomery-MD':    'Germantown Rockville biotech life science campus',
    'Prince Georges-MD':'Beltsville Lanham mixed-use industrial development',
  };

  for (const { county, state } of markets) {
    const key = `${county}-${state}`;
    if (seenMarkets.has(key)) continue;
    seenMarkets.add(key);

    const ctx = MARKET_CONTEXT[key] || `${county} County`;
    const recorderSite = COUNTY_RECORD_SITES[key] || '';
    const marketQueries = [
      `${ctx} data center "site selection" OR "land acquisition" OR hyperscale 2025 OR 2026`,
      `${ctx} substation upgrade OR "transmission line" OR "power capacity" industrial`,
      `"${county} county" ${state} rezoning OR "special use permit" industrial data center`,
      // High-credibility: county recorder / assessor
      ...(recorderSite ? [`${recorderSite} "parcel transfer" OR "land use" industrial data center 2025 OR 2026`] : []),
      // Trade pubs (.gov/trade → source_credibility 0.80–1.0)
      `(site:datacenterfrontier.com OR site:datacenterknowledge.com OR site:bisnow.com) "${county}" land acquisition OR rezoning 2025 OR 2026`,
      // SEC EDGAR for hyperscaler land disclosures
      `site:sec.gov 8-K "data center" "${county} county" ${state} land OR acquisition 2025 OR 2026`,
    ];

    for (const query of marketQueries) {
      try {
        await sleep(1500);
        // freshness=pw — past week only, so we never re-surface old news
        // smartSearch routes semantic queries to Exa (free, unlimited), site:-scoped to Brave
        const results = await smartSearch(query, 10, 'pw');
        const signals = extractAllSignals(results, 5);
        if (signals.length === 0) continue;

        // Post one note per signal (up to 5 per query instead of 1)
        const matchingCandidate = candidates.find(c => c.county === county && c.state === state);
        for (const signal of signals) {
          // Determine note_type
          const lower = `${signal.title} ${signal.snippet}`.toLowerCase();
          let noteType = 'market_intel';
          if (lower.includes('rezon') || lower.includes('permit') || lower.includes('entitlement')) noteType = 'municipal_intel';
          else if (lower.includes('substation') || lower.includes('transmission') || lower.includes('power') || lower.includes('utility')) noteType = 'utility_intel';
          else if (lower.includes('data center') || lower.includes('hyperscale') || lower.includes('datacenter')) noteType = 'competitor_intel';

          await dcPost('/webhooks/openclaw/intel-note', {
            opportunity_id: matchingCandidate?.opportunity_id || null,
            note_type: noteType,
            content: buildNoteContent({ county, state, signal, noteType }),
            confidence: signal.url?.includes('.gov') || signal.url?.includes('sec.gov') ? 'high' : 'medium',
            source_url: signal.url,
          });
          notesCreated++;
        }
      } catch (err) {
        console.error(`[dcIntelDealMonitor] Market scan error (${key}):`, err.message);
        errors++;
      }
    }
  }

  // 3. Owner-specific distress scans
  for (const candidate of candidates) {
    if (!candidate.owner_name) continue;
    try {
      await sleep(2000);
      const distressQuery = `"${candidate.owner_name}" foreclosure OR "estate sale" OR probate OR "tax lien" OR lawsuit OR "lis pendens"`;
      const results = await braveSearch(distressQuery, 5, 'pm'); // past month for distress signals
      if (!hasDistressSignal(results)) continue;

      const signal = extractSignal(results);
      await dcPost('/webhooks/openclaw/intel-note', {
        opportunity_id: candidate.opportunity_id,
        owner_id: candidate.owner_id,
        note_type: 'timing_signal',
        content: `Distress signal detected for ${candidate.owner_name}: ${signal ? signal.snippet : 'Foreclosure/estate/tax-lien language in search results'}.`.slice(0, 500),
        confidence: 'medium',
        source_url: signal?.url || null,
      });
      notesCreated++;
    } catch (err) {
      console.error(`[dcIntelDealMonitor] Owner distress scan error (${candidate.owner_name}):`, err.message);
      errors++;
    }
  }

  const durationMs = Date.now() - startTime;
  const outputText = `DC Intel Deal Monitor: scanned ${seenMarkets.size} markets + ${candidates.length} owners → ${notesCreated} intel notes created${errors > 0 ? ` (${errors} errors)` : ''} in ${(durationMs / 1000).toFixed(1)}s`;

  // Brain observation
  try {
    const brain = require('./collectiveBrain');
    brain.observe(
      `dc-intel-${new Date().toISOString().slice(0, 10)}`,
      'dc-intel-deal-monitor', 'market_insight',
      {
        subject: `DC/Warehouse land markets — ${[...seenMarkets].join(', ')}`,
        content: outputText,
        confidence: 1.0,
        metadata: { markets_scanned: seenMarkets.size, candidates: candidates.length, notes_created: notesCreated },
      }
    );
  } catch {}

  return { outputText, durationMs, costUsd: 0, extra: { notesCreated, errors, marketsScanned: seenMarkets.size } };
}

// ── Handler: dc_intel_owner_research ──────────────────────────────────────────

/**
 * On-demand or called by research queue.
 * Deep-researches a single owner (SOS filings, litigation, news, distress).
 * Pushes results to /webhooks/openclaw/owner-intel.
 *
 * Message params: { owner_id, owner_name, county, state }
 */
async function dcIntelOwnerResearch({ message, runId, agent }) {
  const startTime = Date.now();

  // Parse params
  let params = {};
  try { params = JSON.parse(message); } catch {}
  const { owner_id, owner_name, county, state } = params;

  if (!owner_id) throw new Error('owner_id required in message: {"owner_id":"<uuid>"}');

  const name = owner_name || owner_id;
  const geo = county && state ? `${county} County ${state}` : '';

  // Run 4 searches
  const queries = [
    `"${name}" LLC "secretary of state" corporate filings members`,
    `"${name}" lawsuit litigation court case`,
    `"${name}" land sale real estate development listing`,
    `"${name}" data center OR warehouse OR industrial ${geo}`.trim(),
  ];

  let allResults = [];
  for (const query of queries) {
    try {
      await sleep(1500);
      const results = await braveSearch(query, 8);
      allResults = allResults.concat(results);
    } catch (err) {
      console.warn(`[dcIntelOwnerResearch] Search error: ${err.message}`);
    }
  }

  // Analyze
  const litigationFlag = hasLitigationSignal(allResults);
  const distressedSignal = hasDistressSignal(allResults);
  const entityType = inferEntityType(name, allResults);
  const relatedEntities = extractRelatedEntities(name, allResults);
  const combined = allResults.map(r => `${r.title} ${r.description || ''}`).join(' ');

  // Structured data extraction (populate Owner schema fields)
  const lastSaleDate    = extractSaleDate(combined);
  const lastSaleAmount  = extractSaleAmount(combined);
  const portfolioSize   = extractPortfolioSize(combined);
  const sosEntityId     = extractSOSId(combined);
  const likelyMotivation = inferMotivation(distressedSignal, litigationFlag, combined);

  // Build summary from top results
  const topSnippets = allResults
    .filter(r => r.description && r.description.length > 30)
    .slice(0, 3)
    .map(r => r.description.slice(0, 150));
  const backgroundSummary = topSnippets.length > 0
    ? topSnippets.join(' | ')
    : `No significant web presence found for ${name}.`;

  const recentNews = allResults
    .filter(r => r.title && r.description)
    .slice(0, 5)
    .map(r => `${r.title}: ${(r.description || '').slice(0, 100)}`);

  const sourceUrls = allResults
    .filter(r => r.url)
    .slice(0, 3)
    .map(r => r.url);

  // Confidence: high if primary sources found, medium if secondary, low if nothing
  const hasRealSources = allResults.some(r =>
    r.url && (r.url.includes('.gov') || r.url.includes('bizjournals') || r.url.includes('costar'))
  );
  const confidence = allResults.length > 5 ? (hasRealSources ? 'high' : 'medium') : 'low';

  // Apollo enrichment for corporate owners
  if (entityType && entityType !== 'individual') {
    const apollo = await apolloEnrich(name);
    if (apollo?.contacts?.length > 0) {
      const c = apollo.contacts[0];
      recentNews.push(`Apollo contact: ${c.name} (${c.title})`);
      try {
        await dcPost('/webhooks/openclaw/owner-contact', {
          owner_id,
          contact_name: c.name,
          contact_title: c.title,
          contact_email: c.email,
          contact_phone: c.phone,
          source: 'apollo',
        });
      } catch {} // endpoint may not exist yet — non-fatal
    }
  }

  // Push to DC Site Intel
  await dcPost('/webhooks/openclaw/owner-intel', {
    owner_id,
    background_summary: backgroundSummary.slice(0, 500),
    entity_type: entityType,
    related_entities: relatedEntities,
    recent_news: recentNews,
    litigation_flag: litigationFlag,
    distressed_signal: distressedSignal,
    confidence,
    source_urls: sourceUrls,
    last_sale_date: lastSaleDate,
    last_sale_amount: lastSaleAmount,
    portfolio_size: portfolioSize,
    sos_entity_id: sosEntityId,
    likely_motivation: likelyMotivation,
  });

  const durationMs = Date.now() - startTime;
  const signals = [litigationFlag && 'litigation', distressedSignal && 'distress'].filter(Boolean);
  const outputText = `DC Intel Owner Research: ${name} — ${allResults.length} results, signals: [${signals.join(', ') || 'none'}], confidence: ${confidence} (${(durationMs / 1000).toFixed(1)}s)`;

  // Brain observation
  try {
    const brain = require('./collectiveBrain');
    brain.observe(
      `dc-intel-${new Date().toISOString().slice(0, 10)}`,
      'dc-intel-owner-research', 'lead_signal',
      {
        subject: name,
        content: outputText,
        confidence: confidence === 'high' ? 0.9 : confidence === 'medium' ? 0.6 : 0.3,
        metadata: { owner_id, litigation_flag: litigationFlag, distressed_signal: distressedSignal, results_found: allResults.length },
      }
    );
  } catch {}

  return {
    outputText,
    durationMs,
    costUsd: 0,
    extra: { ownerName: name, signalsFound: signals, confidence, resultsCount: allResults.length },
  };
}

// ── Handler: dc_intel_research_queue ──────────────────────────────────────────

/**
 * Weekly Mon 6am — polls candidates, runs owner research on each.
 * Message params: { limit } (default 20)
 */
async function dcIntelResearchQueue({ message, runId, agent }) {
  const startTime = Date.now();

  let params = {};
  try { params = JSON.parse(message); } catch {}
  const limit = parseInt(params.limit || 12); // 12 × 4 queries = 48 searches/week, stays within Brave 2k/month budget

  // Fetch candidates
  const candidates = await dcGet(`/webhooks/openclaw/parcels/candidates?limit=${limit}`);

  if (!candidates || candidates.length === 0) {
    return {
      outputText: 'DC Intel Research Queue: queue empty — all active owners already researched.',
      durationMs: Date.now() - startTime,
      costUsd: 0,
      extra: { processed: 0, distressFound: 0, litigationFound: 0 },
    };
  }

  let processed = 0;
  let distressFound = 0;
  let litigationFound = 0;
  let errors = 0;

  for (const candidate of candidates) {
    console.log(`[dcIntelResearchQueue] Researching ${processed + 1}/${candidates.length}: ${candidate.owner_name}`);
    try {
      const result = await dcIntelOwnerResearch({
        message: JSON.stringify({
          owner_id: candidate.owner_id,
          owner_name: candidate.owner_name,
          county: candidate.county,
          state: candidate.state,
        }),
        runId,
        agent,
      });
      processed++;
      if (result.extra?.signalsFound?.includes('distress')) distressFound++;
      if (result.extra?.signalsFound?.includes('litigation')) litigationFound++;
    } catch (err) {
      console.error(`[dcIntelResearchQueue] Failed for ${candidate.owner_name}:`, err.message);
      errors++;
    }
    // Pause between owners to respect search rate limits
    if (processed < candidates.length) await sleep(5000);
  }

  const durationMs = Date.now() - startTime;
  const outputText = `DC Intel Research Queue: ${processed}/${candidates.length} owners researched — distress: ${distressFound}, litigation: ${litigationFound}${errors > 0 ? `, errors: ${errors}` : ''} in ${(durationMs / 1000).toFixed(1)}s`;

  // Brain observation
  try {
    const brain = require('./collectiveBrain');
    brain.observe(
      `dc-intel-${new Date().toISOString().slice(0, 10)}`,
      'dc-intel-research-queue', 'market_insight',
      {
        subject: 'Weekly owner research batch',
        content: outputText,
        confidence: 1.0,
        metadata: { processed, distress_found: distressFound, litigation_found: litigationFound },
      }
    );
  } catch {}

  return { outputText, durationMs, costUsd: 0, extra: { processed, distressFound, litigationFound, errors } };
}

// ── Handler: dc_intel_opportunity_scout ───────────────────────────────────────

/**
 * Daily 5am — hunts NEW land opportunities not yet in DC Site Intel.
 * Searches for county transfers, large parcel news, DC-related acquisitions.
 * Creates stub opportunities for promising new finds.
 * Message params: { counties } (optional, defaults to TARGET_MARKETS)
 */
async function dcIntelOpportunityScout({ message, runId, agent }) {
  const startTime = Date.now();
  const today = new Date().getFullYear();

  let params = {};
  try { params = JSON.parse(message); } catch {}
  const markets = params.counties || TARGET_MARKETS;

  let newOpportunities = 0;
  let alreadyKnown = 0;
  let notesCreated = 0;
  let errors = 0;

  // Market-specific high-signal queries — exact terms used in DC/industrial deal coverage
  const SCOUT_QUERIES = {
    'Cook-IL':          [
      '"Elk Grove Village" OR "Itasca" OR "Lisle" data center land acquisition 2025 OR 2026',
      '"Cook County" industrial rezoning "special use" data center warehouse 2025 OR 2026',
      `${COUNTY_RECORD_SITES['Cook-IL']} "parcel transfer" industrial data center 2025 OR 2026`,
      '(site:datacenterfrontier.com OR site:datacenterknowledge.com OR site:bisnow.com) "Cook County" OR "Elk Grove" land 2025 OR 2026',
      'site:sec.gov 8-K "data center" "Cook County" OR "Illinois" land acquisition 2025 OR 2026',
    ],
    'Will-IL':          [
      '"Will County" OR "Joliet" data center site "land purchase" OR acquisition 2025 OR 2026',
      '"Will County" substation OR "power capacity" industrial development',
      `${COUNTY_RECORD_SITES['Will-IL']} "parcel transfer" industrial 2025 OR 2026`,
      '(site:datacenterfrontier.com OR site:bisnow.com) "Will County" OR "Joliet" land 2025 OR 2026',
    ],
    'DuPage-IL':        [
      '"DuPage County" OR "Naperville" OR "Aurora" data center campus land 2025 OR 2026',
      '"DuPage County" rezoning industrial warehouse development',
      `${COUNTY_RECORD_SITES['DuPage-IL']} "land use" OR "rezoning" data center 2025 OR 2026`,
    ],
    'Kane-IL':          [
      '"Kane County" OR "Elgin" OR "Aurora" industrial land sale data center 2025 OR 2026',
      `${COUNTY_RECORD_SITES['Kane-IL']} "parcel transfer" industrial 2025 OR 2026`,
    ],
    'Kendall-IL':       [
      '"Kendall County" OR "Yorkville" industrial development land parcel 2025 OR 2026',
    ],
    'Loudoun-VA':       [
      '"Loudoun County" OR "Ashburn" "Data Center Alley" land acquisition site 2025 OR 2026',
      '"Loudoun County" hyperscale campus power substation new development',
      `${COUNTY_RECORD_SITES['Loudoun-VA']} "land use application" OR "rezoning" data center 2025`,
      '(site:datacenterfrontier.com OR site:datacenterknowledge.com) "Loudoun" OR "Ashburn" land 2025 OR 2026',
      'site:sec.gov 8-K "data center" "Loudoun" OR "Virginia" land acquisition 2025 OR 2026',
    ],
    'Prince William-VA':[
      '"Prince William" OR "Digital Gateway" data center land 2025 OR 2026',
      '"Manassas" OR "Gainesville" industrial rezoning data center site selection',
      `${COUNTY_RECORD_SITES['Prince William-VA']} "land use" OR "rezoning" data center 2025`,
      '(site:datacenterfrontier.com OR site:bisnow.com) "Prince William" OR "Manassas" land 2025 OR 2026',
    ],
    'Montgomery-MD':    [
      '"Montgomery County" MD data center OR industrial land acquisition 2025 OR 2026',
      `${COUNTY_RECORD_SITES['Montgomery-MD']} "land use" industrial data center 2025`,
    ],
    'Prince Georges-MD':[
      '"Prince George\'s County" data center industrial land development 2025 OR 2026',
      `${COUNTY_RECORD_SITES['Prince Georges-MD']} "land use" industrial 2025 OR 2026`,
    ],
  };

  // Track opportunity names we've already created this run to prevent same-run dupes
  const createdThisRun = new Set();

  for (const { county, state } of markets) {
    const key = `${county}-${state}`;
    const queries = SCOUT_QUERIES[key] || [
      `"${county} county" ${state} data center land acquisition site selection 2025 OR 2026`,
    ];

    for (const query of queries) {
      try {
        await sleep(2000);
        // freshness=pm — only surface news from past month, not stale articles
        // smartSearch routes semantic queries to Exa (free, unlimited), site:-scoped to Brave
        const results = await smartSearch(query, 8, 'pm');
        if (results.length === 0) continue;

        // Mine all signals from this query, not just first 3
        const signals = extractAllSignals(results, 5);

        for (const signal of signals) {
          const text = `${signal.title} ${signal.snippet}`.toLowerCase();

          // Higher bar — must mention an actual deal signal, not just industry color
          const isDealSignal = (
            (text.includes('acre') || text.includes('parcel') || text.includes('land sale') ||
             text.includes('acquisition') || text.includes('purchase') || text.includes('rezoning') ||
             text.includes('site selection') || text.includes('ground lease')) &&
            (text.includes('data center') || text.includes('industrial') || text.includes('hyperscale') ||
             text.includes('warehouse') || text.includes('campus'))
          );
          if (!isDealSignal) continue;

          // Dedup 1: check if we already created this same title this run
          const titleKey = signal.title.slice(0, 60).toLowerCase();
          if (createdThisRun.has(titleKey)) { alreadyKnown++; continue; }

          // Dedup 2: check existing opportunities by name prefix
          let alreadyExists = false;
          try {
            const existing = await dcGet(`/opportunities?search=${encodeURIComponent(county + ' Scout')}&limit=20`);
            const opps = Array.isArray(existing) ? existing : (existing?.items || []);
            if (opps.some(o => o.name && o.name.toLowerCase().includes(titleKey.slice(0, 30)))) {
              alreadyExists = true;
              alreadyKnown++;
            }
          } catch {}

          // Dedup 3 + PostGIS link: APN lookup — if scored parcel exists in our DB, link to it
          let linkedParcelId = null;
          if (!alreadyExists) {
            const apnFound = extractAPN(text);
            if (apnFound) {
              try {
                const parcelResp = await dcGet(`/parcels/owner-search?q=${encodeURIComponent(apnFound)}&limit=1`);
                const parcelResults = parcelResp?.results || [];
                if (parcelResults.length > 0) {
                  const parcel = parcelResults[0];
                  // Check if this parcel already has an opportunity (true dedup)
                  try {
                    const existingOpp = await dcGet(`/opportunities/by-parcel/${parcel.parcel_id}`);
                    if (existingOpp) {
                      alreadyExists = true;
                      alreadyKnown++;
                    } else {
                      // Parcel in our DB but no linked opportunity — link it on creation
                      linkedParcelId = parcel.parcel_id;
                    }
                  } catch {
                    linkedParcelId = parcel.parcel_id; // safe to create, linked to scored parcel
                  }
                }
              } catch {}
            }
          }

          const quality = estimateSignalQuality(signal);
          if (quality >= 0.35 && !alreadyExists && newOpportunities < 5) { // quality gate + hard cap
            try {
              const thesisType = detectThesisType(text);
              const acreage = extractAcreage(text);
              const apn = extractAPN(text);
              const nextActionDue = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
              const oppName = `${county} Co ${state} — Scout: ${signal.title.slice(0, 50)}`;

              const noteContent = buildNoteContent({ county, state, signal, noteType: 'market_intel', acreage, apn });

              await dcPost('/opportunities', {
                name: oppName,
                thesis_type: thesisType,
                angle: thesisType.includes('warehouse') ? 'warehouse' : 'data_center',
                micro_zone: `${county} County, ${state}`,
                pipeline_stage: 'new_lead',
                assigned_to: 'both',
                internal_notes: noteContent,
                next_action: 'Research owner and verify parcel details',
                next_action_due: nextActionDue,
                parcel_ids: linkedParcelId ? [linkedParcelId] : [], // link to scored DB parcel if found
              });
              createdThisRun.add(titleKey);
              newOpportunities++;

              // Apollo: try to find decision-maker at any company mentioned in the snippet
              const company = extractCompanyFromSnippet(signal.snippet);
              if (company) apolloEnrich(company).catch(e => console.warn('[dcIntel] fire-and-forget failed:', e.message)); // fire-and-forget

              // Also post the discovery as an intel note with full keyword content
              await dcPost('/webhooks/openclaw/intel-note', {
                opportunity_id: null,
                note_type: 'market_intel',
                content: noteContent,
                confidence: signal.url?.includes('.gov') || signal.url?.includes('sec.gov') ? 'high' : 'low',
                source_url: signal.url,
              }).catch(e => console.warn('[dcIntel] fire-and-forget failed:', e.message));
              notesCreated++;
            } catch (err) {
              console.warn(`[dcIntelOpportunityScout] Failed to create opportunity: ${err.message}`);
              errors++;
            }
          } else if (!alreadyExists && (quality < 0.35 || newOpportunities >= 5)) {
            // Below quality gate or cap reached — post intel note only, skip opp creation
            // (market_intel notes are still useful for scoring and deal monitor context)
            if (quality >= 0.15) {
              try {
                await dcPost('/webhooks/openclaw/intel-note', {
                  opportunity_id: null,
                  note_type: 'market_intel',
                  content: buildNoteContent({ county, state, signal }),
                  confidence: 'low',
                  source_url: signal.url,
                }).catch(e => console.warn('[dcIntel] fire-and-forget failed:', e.message));
                notesCreated++;
              } catch {}
            }
          }
        }
      } catch (err) {
        console.error(`[dcIntelOpportunityScout] Scout error (${county}, ${state}):`, err.message);
        errors++;
      }
    }
  }

  const durationMs = Date.now() - startTime;
  const outputText = `DC Intel Opportunity Scout: ${markets.length} markets scanned — ${newOpportunities} new opportunities created, ${alreadyKnown} already known, ${notesCreated} notes${errors > 0 ? `, ${errors} errors` : ''} in ${(durationMs / 1000).toFixed(1)}s`;

  // Brain observation
  try {
    const brain = require('./collectiveBrain');
    brain.observe(
      `dc-intel-${new Date().toISOString().slice(0, 10)}`,
      'dc-intel-opportunity-scout', 'market_insight',
      {
        subject: `Land opportunity scout — ${markets.map(m => m.county).join(', ')}`,
        content: outputText,
        confidence: 1.0,
        metadata: { markets: markets.length, new_opportunities: newOpportunities, already_known: alreadyKnown },
      }
    );
  } catch {}

  // Brain episode (track scout performance)
  try {
    const brain = require('./collectiveBrain');
    brain.recordEpisode('dc-intel-opportunity-scout', {
      market: markets.map(m => `${m.county} ${m.state}`).join(', '),
      actionTaken: `Scouted ${markets.length} county markets for new land opportunities`,
      outcome: `Found ${newOpportunities} new opportunities`,
      outcomeType: 'discovery',
      outcomeScore: newOpportunities > 3 ? 0.8 : newOpportunities > 0 ? 0.6 : 0.2,
      signalSource: 'brave_search',
    });
  } catch {}

  return { outputText, durationMs, costUsd: 0, extra: { newOpportunities, alreadyKnown, notesCreated, errors } };
}

// ── Handler: dc_intel_daily_scorecard ─────────────────────────────────────────

/**
 * Daily 8am — fetches the morning scorecard from DC Site Intel and emails it
 * to Steve + Doug via SendGrid. Grade A and B leads get highlighted.
 */
async function dcIntelDailyScorecard({ message, runId, agent }) {
  const startTime = Date.now();
  const DASHBOARD_URL = 'https://dcsi-dashboard.blackbush-bb9e213f.centralus.azurecontainerapps.io/';

  // Fetch all data in parallel for a rich daily briefing
  const [scorecard, pipeline, actionsDue, statsRaw, motivated, topOpps] = await Promise.all([
    dcGet('/scorecard/daily?hours=24'),
    dcGet('/opportunities/pipeline').catch(() => []),
    dcGet('/opportunities/actions-due').catch(() => []),
    dcGet('/scoring/dashboard/stats?angle=data_center').catch(() => ({})),
    dcGet('/owners/motivated?limit=5').catch(() => []),
    dcGet('/opportunities?limit=5&sort_by=pursuit_priority_score&angle=data_center').catch(() => []),
  ]);

  const { total, by_grade, summary, opportunities } = scorecard;

  // Pipeline stats
  const pipelineArr = Array.isArray(pipeline) ? pipeline : [];
  const stageMap = {};
  pipelineArr.forEach(s => { stageMap[s.stage] = s; });
  const activeStages = ['triage','underwriting','owner_identified','outreach_started','qualified_conversation','site_package','buyer_circulated','negotiation_control'];
  const totalActive = activeStages.reduce((sum, s) => sum + (stageMap[s]?.count || 0), 0);
  const newLeads = stageMap.new_lead?.count || 0;
  const weightedPipeline = activeStages.reduce((sum, s) => sum + (stageMap[s]?.total_weighted_fee_usd || 0), 0);

  // Actions due
  const actionsArr = Array.isArray(actionsDue) ? actionsDue : [];
  const todayStr = new Date().toISOString().slice(0, 10);
  const overdue = actionsArr.filter(a => a.next_action_due && a.next_action_due < todayStr);
  const dueToday = actionsArr.filter(a => a.next_action_due === todayStr);

  // Motivated sellers
  const motivatedArr = Array.isArray(motivated) ? motivated : [];

  // Top opportunities (for "what to focus on")
  const topOppsArr = Array.isArray(topOpps) ? topOpps : [];

  // Stats
  const stats = statsRaw || {};
  const qualifiedCount = stats.qualified_count || 0;

  if (total === 0 && totalActive === 0 && overdue.length === 0) {
    return {
      outputText: 'DC Intel Daily Scorecard: no new leads, no active deals, no overdue actions.',
      durationMs: Date.now() - startTime,
      costUsd: 0,
      extra: { total: 0 },
    };
  }

  // Build HTML email
  const gradeColors = { A: '#16A34A', B: '#2563EB', C: '#D97706', D: '#94A3B8' };
  const gradeBgs    = { A: '#F0FDF4', B: '#EFF6FF', C: '#FFFBEB', D: '#F8FAFC' };
  const stageLabels = {
    new_lead: 'New Lead', triage: 'Triage', underwriting: 'Underwriting',
    owner_identified: "Owner ID'd", outreach_started: 'Outreach',
    qualified_conversation: 'Qualified', site_package: 'Site Package',
    buyer_circulated: 'Buyer Circ.', negotiation_control: 'Negotiation',
  };

  // New lead rows
  const rows = (opportunities || []).slice(0, 10).map(opp => {
    const qs = opp.quick_score;
    const color = gradeColors[qs.grade] || '#94A3B8';
    const bg    = gradeBgs[qs.grade] || '#F8FAFC';
    const dims  = qs.dimensions || {};
    const drivers = qs.drivers?.length ? `<br><small style="color:#64748B">${qs.drivers.join(' · ')}</small>` : '';
    const zone = opp.micro_zone ? ` · <span style="color:#64748B">${opp.micro_zone}</span>` : '';
    const notes = opp.intel_note_count ? `<br><span style="font-size:11px;color:#64748B">📝 ${opp.intel_note_count} intel note${opp.intel_note_count > 1 ? 's' : ''}</span>` : '';
    return `
      <tr style="background:${bg}">
        <td style="padding:12px;border-bottom:1px solid #E2E8F0">
          <strong style="color:${color};font-size:20px">${qs.grade}</strong>
        </td>
        <td style="padding:12px;border-bottom:1px solid #E2E8F0">
          <strong>${opp.name}</strong>${zone}${drivers}${notes}
        </td>
        <td style="padding:12px;border-bottom:1px solid #E2E8F0;text-align:center">
          <span style="font-size:18px;font-weight:700;color:${color}">${(qs.overall * 100).toFixed(0)}%</span>
        </td>
        <td style="padding:12px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#64748B">
          ${dims.signal_specificity != null ? `Signal: ${(dims.signal_specificity * 100).toFixed(0)}%` : ''}
          ${dims.source_credibility != null ? ` · Source: ${(dims.source_credibility * 100).toFixed(0)}%` : ''}
          ${dims.market_heat != null ? ` · Market: ${(dims.market_heat * 100).toFixed(0)}%` : ''}
        </td>
      </tr>`;
  }).join('');

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  // Overdue action rows (top 5)
  const overdueRows = overdue.slice(0, 5).map(a => {
    const daysLate = Math.floor((new Date() - new Date(a.next_action_due)) / 86400000);
    return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;font-weight:600;font-size:13px">${(a.name || '?').slice(0, 40)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;font-size:13px">${a.next_action || 'Follow up'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;color:#DC2626;font-weight:700;font-size:13px">${daysLate}d late</td>
      </tr>`;
  }).join('');

  // Top opportunities rows (top 3)
  const topOppRows = topOppsArr.slice(0, 3).map((o, i) => {
    const pp = o.pursuit_priority_score ? (o.pursuit_priority_score * 100).toFixed(0) + '%' : '—';
    const fee = o.target_fee_usd ? `$${(o.target_fee_usd / 1000).toFixed(0)}K` : '—';
    const stage = stageLabels[o.pipeline_stage] || o.pipeline_stage || '—';
    return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;font-weight:700;font-size:14px">#${i+1}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;font-weight:600;font-size:13px">${(o.name || '?').slice(0, 45)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;font-size:13px">${stage}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;font-size:13px;font-weight:600;color:#2563EB">${pp}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;font-size:13px;color:#16A34A;font-weight:600">${fee}</td>
      </tr>`;
  }).join('');

  // Motivated sellers (top 3)
  const motivatedRows = motivatedArr.slice(0, 3).map(owner => {
    const signals = (owner.distress_signals || []).slice(0, 2).map(s =>
      s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    ).join(', ');
    const acres = owner.assemblage_acres ? `${owner.assemblage_acres.toFixed(0)} ac` : '';
    return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;font-weight:600;font-size:13px">${(owner.owner_name || '?').slice(0, 35)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#DC2626;font-weight:600">${signals}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#64748B">${acres}</td>
      </tr>`;
  }).join('');

  // Pipeline funnel bar
  const pipelineSegments = activeStages
    .filter(s => stageMap[s]?.count > 0)
    .map(s => {
      const c = stageMap[s].count;
      const label = stageLabels[s] || s;
      const colors = {
        triage: '#3B82F6', underwriting: '#2563EB', owner_identified: '#7C3AED',
        outreach_started: '#EA580C', qualified_conversation: '#C2410C',
        site_package: '#D97706', buyer_circulated: '#0D9488', negotiation_control: '#16A34A',
      };
      return `<td style="background:${colors[s] || '#94A3B8'};color:white;padding:8px 12px;text-align:center;font-size:12px;font-weight:600">${label} (${c})</td>`;
    }).join('');

  const fmtMoney = (v) => {
    if (!v || v === 0) return '$0';
    if (v >= 1000000) return `$${(v/1000000).toFixed(1)}M`;
    if (v >= 1000) return `$${(v/1000).toFixed(0)}K`;
    return `$${v.toLocaleString()}`;
  };

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:20px;background:#F1F5F9">
  <div style="max-width:800px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">

    <!-- Header -->
    <div style="background:#0F172A;padding:24px 28px">
      <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700">⚡ DC Site Intel — Morning Briefing</h1>
      <p style="color:#94A3B8;margin:6px 0 0;font-size:14px">${today}</p>
    </div>

    <!-- Hero KPIs -->
    <table style="width:100%;border-collapse:collapse;background:#F8FAFC;border-bottom:2px solid #E2E8F0">
      <tr>
        <td style="padding:16px 12px;text-align:center;border-right:1px solid #E2E8F0">
          <div style="font-size:28px;font-weight:800;color:${overdue.length > 0 ? '#DC2626' : '#16A34A'}">${overdue.length}</div>
          <div style="font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:.5px">Overdue</div>
        </td>
        <td style="padding:16px 12px;text-align:center;border-right:1px solid #E2E8F0">
          <div style="font-size:28px;font-weight:800;color:#0F172A">${totalActive + newLeads}</div>
          <div style="font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:.5px">Active Deals</div>
        </td>
        <td style="padding:16px 12px;text-align:center;border-right:1px solid #E2E8F0">
          <div style="font-size:28px;font-weight:800;color:#2563EB">${fmtMoney(weightedPipeline)}</div>
          <div style="font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:.5px">Pipeline</div>
        </td>
        <td style="padding:16px 12px;text-align:center;border-right:1px solid #E2E8F0">
          <div style="font-size:28px;font-weight:800;color:#D97706">${total}</div>
          <div style="font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:.5px">New Leads</div>
        </td>
        <td style="padding:16px 12px;text-align:center">
          <div style="font-size:28px;font-weight:800;color:#0F172A">${qualifiedCount.toLocaleString()}</div>
          <div style="font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:.5px">Scored Parcels</div>
        </td>
      </tr>
    </table>

    <!-- Pipeline Funnel -->
    ${pipelineSegments ? `
    <table style="width:100%;border-collapse:collapse;border-bottom:1px solid #E2E8F0">
      <tr>${pipelineSegments}</tr>
    </table>` : ''}

    <!-- Section: OVERDUE ACTIONS (attention grabber) -->
    ${overdue.length > 0 ? `
    <div style="padding:20px 28px 0">
      <h2 style="margin:0 0 10px;font-size:16px;color:#DC2626">🔴 ${overdue.length} Overdue Action${overdue.length > 1 ? 's' : ''} — Needs Attention</h2>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#FEF2F2">
          <th style="padding:6px 12px;text-align:left;font-size:11px;color:#991B1B;text-transform:uppercase">Deal</th>
          <th style="padding:6px 12px;text-align:left;font-size:11px;color:#991B1B;text-transform:uppercase">Action</th>
          <th style="padding:6px 12px;text-align:left;font-size:11px;color:#991B1B;text-transform:uppercase">Overdue</th>
        </tr></thead>
        <tbody>${overdueRows}</tbody>
      </table>
      ${overdue.length > 5 ? `<p style="font-size:12px;color:#DC2626;margin:4px 0">+ ${overdue.length - 5} more overdue...</p>` : ''}
    </div>` : `
    <div style="padding:16px 28px 0">
      <div style="background:#F0FDF4;border-left:4px solid #16A34A;padding:12px 16px;border-radius:0 8px 8px 0">
        ✅ <strong>No overdue actions</strong> — you're caught up.${dueToday.length > 0 ? ` (${dueToday.length} due today)` : ''}
      </div>
    </div>`}

    <!-- Section: TOP OPPORTUNITIES -->
    ${topOppRows ? `
    <div style="padding:20px 28px 0">
      <h2 style="margin:0 0 10px;font-size:16px;color:#0F172A">🏆 Top Pursuit Priorities</h2>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#F8FAFC">
          <th style="padding:6px 12px;text-align:left;font-size:11px;color:#64748B;text-transform:uppercase">#</th>
          <th style="padding:6px 12px;text-align:left;font-size:11px;color:#64748B;text-transform:uppercase">Opportunity</th>
          <th style="padding:6px 12px;text-align:left;font-size:11px;color:#64748B;text-transform:uppercase">Stage</th>
          <th style="padding:6px 12px;text-align:left;font-size:11px;color:#64748B;text-transform:uppercase">Priority</th>
          <th style="padding:6px 12px;text-align:left;font-size:11px;color:#64748B;text-transform:uppercase">Fee</th>
        </tr></thead>
        <tbody>${topOppRows}</tbody>
      </table>
    </div>` : ''}

    <!-- Section: MOTIVATED SELLERS -->
    ${motivatedRows ? `
    <div style="padding:20px 28px 0">
      <h2 style="margin:0 0 10px;font-size:16px;color:#DC2626">🎯 Motivated Sellers — Call Today</h2>
      <p style="margin:0 0 8px;font-size:12px;color:#64748B">Owners flagged with distress signals — highest conviction outreach targets</p>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#FEF2F2">
          <th style="padding:6px 12px;text-align:left;font-size:11px;color:#991B1B;text-transform:uppercase">Owner</th>
          <th style="padding:6px 12px;text-align:left;font-size:11px;color:#991B1B;text-transform:uppercase">Signals</th>
          <th style="padding:6px 12px;text-align:left;font-size:11px;color:#991B1B;text-transform:uppercase">Land</th>
        </tr></thead>
        <tbody>${motivatedRows}</tbody>
      </table>
    </div>` : ''}

    <!-- Section: NEW LEADS (scorecard) -->
    ${rows ? `
    <div style="padding:20px 28px 0">
      <h2 style="margin:0 0 4px;font-size:16px;color:#0F172A">📊 New Leads Scored (Last 24h)</h2>
      <p style="margin:0 0 10px;font-size:13px;color:#64748B">
        <strong>${summary}</strong> —
        <span style="color:#16A34A;font-weight:700">${by_grade.A} Priority</span> ·
        <span style="color:#2563EB;font-weight:700">${by_grade.B} Watch</span> ·
        <span style="color:#D97706">${by_grade.C} Low</span> ·
        <span style="color:#94A3B8">${by_grade.D} Noise</span>
      </p>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#F8FAFC">
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748B;font-weight:600;text-transform:uppercase">Grade</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748B;font-weight:600;text-transform:uppercase">Opportunity</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;color:#64748B;font-weight:600;text-transform:uppercase">Score</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748B;font-weight:600;text-transform:uppercase">Dimensions</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>` : ''}

    <!-- CTA: Open Dashboard -->
    <div style="padding:28px;text-align:center">
      <a href="${DASHBOARD_URL}" style="display:inline-block;background:#2563EB;color:white;padding:14px 36px;border-radius:8px;text-decoration:none;font-size:16px;font-weight:700;letter-spacing:.3px">Open Dashboard →</a>
      <p style="margin:10px 0 0;font-size:12px;color:#94A3B8">
        <a href="${DASHBOARD_URL}" style="color:#64748B">dcsi-dashboard.blackbush-bb9e213f.centralus.azurecontainerapps.io</a>
      </p>
    </div>

    <!-- Footer -->
    <div style="border-top:2px solid #E2E8F0;padding:16px 28px;font-size:11px;color:#94A3B8;text-align:center;background:#F8FAFC">
      DC Site Intel · Privium Pilch · Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC
      <br>10 AI agents scanned overnight · ${qualifiedCount.toLocaleString()} parcels scored · Act on fresh signals first
    </div>

  </div>
</body>
</html>`;

  // Send via SendGrid
  let emailSent = false;
  const sendgridKey = process.env.SENDGRID_API_KEY;
  const toEmails = ['steve.j.pilcher@gmail.com', 'doug.pilcher@gmail.com'];

  // Build a punchy subject line
  const subjectParts = [];
  if (overdue.length > 0) subjectParts.push(`🔴 ${overdue.length} overdue`);
  if (by_grade.A > 0) subjectParts.push(`${by_grade.A} Priority lead${by_grade.A > 1 ? 's' : ''}`);
  if (motivatedArr.length > 0) subjectParts.push(`${motivatedArr.length} motivated sellers`);
  if (!subjectParts.length) subjectParts.push(`${totalActive + newLeads} active deals`);
  subjectParts.push(fmtMoney(weightedPipeline) + ' pipeline');
  const subject = `DC Intel — ${subjectParts.join(' · ')}`;

  if (sendgridKey) {
    try {
      const emailResp = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sendgridKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: toEmails.map(e => ({ email: e })) }],
          from: { email: 'info@hoaprojectfunding.com', name: 'DC Site Intel' },
          subject,
          content: [{ type: 'text/html', value: html }],
        }),
      });
      emailSent = emailResp.ok;
    } catch (err) {
      console.warn('[dcIntelDailyScorecard] Email send failed:', err.message);
    }
  }

  // Brain observation
  try {
    const brain = require('./collectiveBrain');
    brain.observe(
      `dc-intel-${new Date().toISOString().slice(0, 10)}`,
      'dc-intel-daily-scorecard', 'market_insight',
      {
        subject: `Daily briefing: ${total} leads, ${overdue.length} overdue, ${totalActive} active, ${fmtMoney(weightedPipeline)} pipeline`,
        content: `${summary} | Grades: A=${by_grade.A} B=${by_grade.B} C=${by_grade.C} D=${by_grade.D} | Overdue: ${overdue.length} | Motivated: ${motivatedArr.length}`,
        confidence: 1.0,
        metadata: { total, by_grade, email_sent: emailSent, overdue: overdue.length, activeDeals: totalActive, pipeline: weightedPipeline },
      }
    );
  } catch {}

  const durationMs = Date.now() - startTime;
  const outputText = `DC Intel Morning Briefing: ${total} new leads (${by_grade.A}A/${by_grade.B}B) · ${overdue.length} overdue · ${totalActive} active deals · ${fmtMoney(weightedPipeline)} pipeline · ${motivatedArr.length} motivated sellers · email ${emailSent ? 'sent ✓' : 'SKIPPED (no key)'}`;
  return { outputText, durationMs, costUsd: 0, extra: { total, by_grade, emailSent, overdue: overdue.length, activeDeals: totalActive, motivatedSellers: motivatedArr.length } };
}


// ── Handler: dc_intel_learning_loop ───────────────────────────────────────────

/**
 * Weekly Sunday 10pm — reviews the past 7 days of outcome signals.
 * Uses Ollama (free, local) to find patterns in what's working vs noise.
 * Updates market heat weights in DC Site Intel and saves memo to Collective Brain.
 */
async function dcIntelLearningLoop({ message, runId, agent }) {
  const startTime = Date.now();

  // Fetch learning signals from past 7 days
  const signals = await dcGet('/scorecard/learning?days=7');
  const weekly  = await dcGet('/scorecard/weekly');

  const { total, validated, dismissed, by_county, by_source, overall_hit_rate } = weekly;

  if (total === 0) {
    return {
      outputText: 'DC Intel Learning Loop: no outcome signals this week — nothing to learn from yet.',
      durationMs: Date.now() - startTime,
      costUsd: 0,
      extra: { signals: 0 },
    };
  }

  // Build county performance narrative for the LLM
  const countyLines = Object.entries(by_county)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([c, s]) => `  ${c}: ${s.validated} validated / ${s.dismissed} dismissed / ${s.total} total (${Math.round(s.validation_rate * 100)}% hit rate)`)
    .join('\n');

  const sourceLines = Object.entries(by_source)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([src, s]) => `  ${src}: ${s.validated}/${s.total} validated (${Math.round((s.validated / (s.total || 1)) * 100)}% hit rate)`)
    .join('\n');

  // Call Ollama (local, free — qwen3:14b or llama3.1:8b)
  const ollamaModel = process.env.DT_MODEL || process.env.OLLAMA_DEFAULT_MODEL || 'llama3.1:8b';
  let memo = '';

  try {
    const prompt = `You are analyzing DC Site Intel's weekly lead quality data. Be concise and actionable.

WEEK SUMMARY:
- Total outcome signals: ${total}
- Validated: ${validated} | Dismissed: ${dismissed}
- Overall hit rate: ${Math.round(overall_hit_rate * 100)}%

BY COUNTY:
${countyLines}

BY SOURCE (openclaw_scout, openclaw_monitor, manual, apollo):
${sourceLines}

Analyze this data and provide:
1. TOP 2 insights about which markets/sources are producing quality leads vs noise
2. RECOMMENDED WEIGHT ADJUSTMENTS — for each county that had 3+ signals, suggest a market_heat weight (0.0=cold, 1.0=hottest). Only change weights if hit rate clearly warrants it.
3. ONE suggested query improvement for the lowest-performing source

Format your response as:
INSIGHTS: [your 2 insights]
WEIGHT_ADJUSTMENTS: [county: weight, county: weight, ...] (or NONE if no changes needed)
QUERY_IMPROVEMENT: [your suggestion]`;

    const resp = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: ollamaModel, prompt, stream: false }),
    });

    if (resp.ok) {
      const data = await resp.json();
      memo = data.response || '';
    }
  } catch (err) {
    console.warn('[dcIntelLearningLoop] Ollama unavailable:', err.message);
    // Fallback: generate a simple data-driven memo without LLM
    const bestCounty = Object.entries(by_county).sort((a, b) => b[1].validation_rate - a[1].validation_rate)[0];
    const worstCounty = Object.entries(by_county).sort((a, b) => a[1].validation_rate - b[1].validation_rate)[0];
    memo = `INSIGHTS: ${bestCounty ? `${bestCounty[0]} has highest hit rate (${Math.round(bestCounty[1].validation_rate * 100)}%)` : 'insufficient data'}. ${worstCounty ? `${worstCounty[0]} has lowest hit rate (${Math.round(worstCounty[1].validation_rate * 100)}%)` : ''}
WEIGHT_ADJUSTMENTS: NONE
QUERY_IMPROVEMENT: Focus scout queries on counties with higher validation rates.`;
  }

  // Parse weight adjustments from memo if present
  const weightMatch = memo.match(/WEIGHT_ADJUSTMENTS:\s*([^\n]+)/i);
  const weightLine = weightMatch ? weightMatch[1].trim() : '';
  let newWeights = {};

  if (weightLine && weightLine.toUpperCase() !== 'NONE') {
    const pairs = weightLine.matchAll(/(\w[\w\s]+):\s*([\d.]+)/g);
    for (const [, county, weight] of pairs) {
      const w = parseFloat(weight);
      if (!isNaN(w) && w >= 0 && w <= 1) {
        newWeights[county.trim().toLowerCase()] = w;
      }
    }
  }

  // Apply weight adjustments to DC Site Intel
  if (Object.keys(newWeights).length > 0) {
    try {
      await dcPost('/scorecard/market-weights', newWeights);
      console.log('[dcIntelLearningLoop] Applied weight updates:', newWeights);
    } catch (err) {
      console.warn('[dcIntelLearningLoop] Failed to update weights:', err.message);
    }
  }

  // Post weekly learning memo as an intel note (no opportunity — system-level)
  const memoContent = `Weekly Learning Loop (${new Date().toISOString().slice(0, 10)})\n\nHit rate: ${Math.round(overall_hit_rate * 100)}% (${validated}/${total} signals validated)\n\n${memo}`.slice(0, 900);

  try {
    await dcPost('/webhooks/openclaw/intel-note', {
      opportunity_id: null,
      note_type: 'market_intel',
      content: memoContent,
      confidence: 'high',
      source_url: null,
    });
  } catch {}

  // Save to Collective Brain as a high-value episode
  try {
    const brain = require('./collectiveBrain');
    brain.observe(
      `dc-intel-${new Date().toISOString().slice(0, 10)}`,
      'dc-intel-learning-loop', 'market_insight',
      {
        subject: `Weekly learning: ${Math.round(overall_hit_rate * 100)}% hit rate, ${Object.keys(newWeights).length} weight updates`,
        content: memo.slice(0, 800),
        confidence: 0.9,
        metadata: { hit_rate: overall_hit_rate, validated, dismissed, weight_updates: newWeights },
      }
    );
    brain.recordEpisode('dc-intel-learning-loop', {
      market: Object.keys(by_county).join(', '),
      actionTaken: `Analyzed ${total} outcome signals, updated ${Object.keys(newWeights).length} market weights`,
      outcome: `Hit rate: ${Math.round(overall_hit_rate * 100)}%`,
      outcomeType: 'optimization',
      outcomeScore: overall_hit_rate,
      signalSource: 'learning_signals_db',
    });
  } catch {}

  const durationMs = Date.now() - startTime;
  const outputText = `DC Intel Learning Loop: ${total} signals analyzed — ${Math.round(overall_hit_rate * 100)}% hit rate · ${Object.keys(newWeights).length} weight updates applied · memo saved`;
  return {
    outputText,
    durationMs,
    costUsd: 0,
    extra: { signalsAnalyzed: total, hitRate: overall_hit_rate, weightUpdates: newWeights },
  };
}


// ── Handler: dc_intel_auto_generate ───────────────────────────────────────────

/**
 * Weekly Tue 6am — sweeps DC Site Intel's scored parcel DB for top candidates
 * not yet in the pipeline, auto-generates opportunity stubs, then immediately
 * kicks off Apollo + skip-trace enrichment on each new owner.
 *
 * These are homeruns: real APNs, power/zoning/flood scores already computed,
 * owners identified. No Brave Search needed.
 */
async function dcIntelAutoGenerate({ message, runId, agent }) {
  const startTime = Date.now();

  let params = {};
  try { params = JSON.parse(message); } catch {}
  const limit = parseInt(params.limit || 8);

  // Call the existing auto-generate endpoint (POST with query params)
  const qs = new URLSearchParams({
    min_pp: '0.65',
    min_completeness: '8',
    limit: String(limit),
    owner_types: 'llc,trust,corporation',
    angle: 'data_center',
  });
  const headers = { 'Content-Type': 'application/json' };
  if (DC_SECRET) headers['X-OpenClaw-Secret'] = DC_SECRET;

  let result;
  try {
    const resp = await fetch(`${DC_API}/opportunities/auto-generate?${qs}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      throw new Error(`auto-generate: ${resp.status} — ${t.slice(0, 200)}`);
    }
    result = await resp.json();
  } catch (err) {
    return {
      outputText: `DC Intel Auto-Generate: failed — ${err.message}`,
      durationMs: Date.now() - startTime,
      costUsd: 0,
      extra: { created: 0, error: err.message },
    };
  }

  const { created = 0, opportunities: newOpps = [] } = result;

  if (created === 0) {
    return {
      outputText: 'DC Intel Auto-Generate: no new opportunities — all high-scored parcels already in pipeline.',
      durationMs: Date.now() - startTime,
      costUsd: 0,
      extra: { created: 0 },
    };
  }

  // Trigger enrichment on each new opportunity's owner
  let enriched = 0;
  for (const opp of newOpps.slice(0, limit)) {
    if (!opp.owner_id && !opp.owner_name) continue;
    try {
      await sleep(1200);
      const ownerType = (opp.owner_type || '').toLowerCase();
      if (['llc', 'corporation', 'trust'].includes(ownerType) && opp.owner_name) {
        // Apollo: find decision-makers at corporate owners
        await dcPost('/apollo/find-decision-makers', {
          organization_name: opp.owner_name,
          owner_id: opp.owner_id || null,
        }).catch(e => console.warn('[dcIntel] fire-and-forget failed:', e.message));
      }
      if (opp.owner_id) {
        // Skip-trace: get phone/email for any owner (individual or corporate)
        await dcPost(`/owners/${opp.owner_id}/skip-trace`, {}).catch(e => console.warn('[dcIntel] fire-and-forget failed:', e.message));
      }
      enriched++;
    } catch (err) {
      console.warn(`[dcIntelAutoGenerate] Enrichment failed for ${opp.owner_name}: ${err.message}`);
    }
  }

  const durationMs = Date.now() - startTime;
  const outputText = `DC Intel Auto-Generate: ${created} new DB-sourced opportunities created (score ≥0.65), ${enriched} owners queued for enrichment in ${(durationMs / 1000).toFixed(1)}s`;

  try {
    const brain = require('./collectiveBrain');
    brain.observe(
      `dc-intel-${new Date().toISOString().slice(0, 10)}`,
      'dc-intel-auto-generate', 'market_insight',
      {
        subject: 'DB parcel sweep — top-scored unworked opportunities',
        content: outputText,
        confidence: 1.0,
        metadata: { created, enriched },
      }
    );
  } catch {}

  return { outputText, durationMs, costUsd: 0, extra: { created, enriched } };
}


// ── Handler: dc_intel_rto_scanner ─────────────────────────────────────────────

/**
 * Mon/Wed/Fri 5:30am — scans the PJM/MISO interconnect queue for NEW large-MW
 * filings in our target markets. A 100MW+ filing near Elk Grove or Ashburn means
 * a hyperscaler is site-selecting RIGHT NOW — competitors won't see this in any
 * news article for weeks.
 */
async function dcIntelRTOScanner({ message, runId, agent }) {
  const startTime = Date.now();

  let params = {};
  try { params = JSON.parse(message); } catch {}
  const days = parseInt(params.days || 14);
  const minMw = parseFloat(params.min_mw || 50);

  let signals = [];
  try {
    signals = await dcGet(`/webhooks/openclaw/rto-signals?days=${days}&min_mw=${minMw}`);
  } catch (err) {
    return {
      outputText: `DC Intel RTO Scanner: RTO signal data unavailable (${err.message})`,
      durationMs: Date.now() - startTime,
      costUsd: 0,
      extra: { signals: 0 },
    };
  }

  if (!Array.isArray(signals) || signals.length === 0) {
    return {
      outputText: 'DC Intel RTO Scanner: no new power queue filings ≥50MW in target markets.',
      durationMs: Date.now() - startTime,
      costUsd: 0,
      extra: { signals: 0 },
    };
  }

  let created = 0;
  let errors = 0;
  const createdThisRun = new Set();

  for (const sig of signals) {
    const dedupeKey = `rto-${sig.queue_id || sig.project_name}-${sig.county}`;
    if (createdThisRun.has(dedupeKey)) continue;

    const mw = sig.capacity_mw || 0;
    const county = sig.county || 'Unknown';
    const state = sig.state || '';
    const projectName = sig.project_name || 'Unknown Project';
    const confidence = mw >= 100 ? 'high' : 'medium';
    const oppName = `Power Queue Signal — ${sig.rto || 'RTO'} ${mw}MW [${county} Co, ${state}]`;

    // Dedup against existing opportunities
    let alreadyExists = false;
    try {
      const existing = await dcGet(`/opportunities?search=${encodeURIComponent(oppName.slice(0, 40))}&limit=5`);
      const opps = Array.isArray(existing) ? existing : (existing?.items || []);
      if (opps.some(o => o.name && o.name.includes(`${mw}MW`) && o.name.includes(county))) {
        alreadyExists = true;
      }
    } catch {}

    if (alreadyExists || created >= 5) {
      createdThisRun.add(dedupeKey);
      continue;
    }

    try {
      await sleep(1000);
      const noteContent = [
        `[${county} Co, ${state}] POWER QUEUE SIGNAL | power_adjacent_industrial | data_center_land`,
        `New ${mw}MW interconnect request filed with ${sig.rto || 'RTO'}.`,
        `Project: ${projectName}. Filed: ${sig.date_filed || 'recent'}.`,
        `Power signal — site selector likely needs land within 1–5 miles of target substation.`,
        `Deal keywords: interconnect, substation, power capacity, industrial, hyperscale, parcel, acres.`,
      ].join(' ');

      const nextActionDue = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const opp = await dcPost('/opportunities', {
        name: oppName,
        thesis_type: 'power_adjacent_industrial',
        angle: 'data_center',
        micro_zone: `${county} County, ${state}`,
        pipeline_stage: 'new_lead',
        assigned_to: 'both',
        internal_notes: noteContent,
        next_action: `Identify parcels within 5km of ${sig.rto || 'RTO'} substation and research owners`,
        next_action_due: nextActionDue,
      });

      if (opp?.id) {
        await dcPost('/webhooks/openclaw/intel-note', {
          opportunity_id: opp.id,
          note_type: 'utility_intel',
          content: noteContent,
          confidence,
          source_url: null,
        }).catch(e => console.warn('[dcIntel] fire-and-forget failed:', e.message));
      }

      createdThisRun.add(dedupeKey);
      created++;
    } catch (err) {
      console.warn(`[dcIntelRTOScanner] Failed for ${oppName}: ${err.message}`);
      errors++;
    }
  }

  const durationMs = Date.now() - startTime;
  const outputText = `DC Intel RTO Scanner: ${signals.length} power queue entries → ${created} new opportunities${errors > 0 ? ` (${errors} errors)` : ''} in ${(durationMs / 1000).toFixed(1)}s`;

  try {
    const brain = require('./collectiveBrain');
    brain.observe(
      `dc-intel-${new Date().toISOString().slice(0, 10)}`,
      'dc-intel-rto-scanner', 'market_insight',
      {
        subject: `RTO/MISO power queue scan — ${signals.length} filings`,
        content: outputText,
        confidence: 1.0,
        metadata: { signals_found: signals.length, created },
      }
    );
  } catch {}

  return { outputText, durationMs, costUsd: 0, extra: { signalsFound: signals.length, created, errors } };
}


// ── Handler: dc_intel_planning_scanner ────────────────────────────────────────

/**
 * Daily 5:15am — polls real county planning events (rezonings, permits, variances)
 * directly from the DB (populated by Cook/DuPage/Will/Loudoun planning connectors).
 *
 * This is primary source data — the actual county filing, before any news article
 * covers it. Source credibility = 1.0 (government data).
 */
async function dcIntelPlanningScanner({ message, runId, agent }) {
  const startTime = Date.now();

  let params = {};
  try { params = JSON.parse(message); } catch {}
  const days = parseInt(params.days || 7);

  let events = [];
  try {
    events = await dcGet(`/webhooks/openclaw/planning-events?days=${days}`);
  } catch (err) {
    return {
      outputText: `DC Intel Planning Scanner: planning event data unavailable (${err.message})`,
      durationMs: Date.now() - startTime,
      costUsd: 0,
      extra: { events: 0 },
    };
  }

  if (!Array.isArray(events) || events.length === 0) {
    return {
      outputText: 'DC Intel Planning Scanner: no new planning events in target counties.',
      durationMs: Date.now() - startTime,
      costUsd: 0,
      extra: { events: 0 },
    };
  }

  let created = 0;
  let notesCreated = 0;
  let errors = 0;
  const createdThisRun = new Set();

  for (const evt of events) {
    const county = evt.county || 'Unknown';
    const state = evt.state || '';
    const descText = evt.description || '';
    const text = `${evt.event_type} ${descText}`.toLowerCase();

    // Only surface DC/industrial relevant events — filter noise
    const isRelevant = (
      text.includes('data center') || text.includes('hyperscale') ||
      text.includes('industrial') || text.includes('warehouse') ||
      text.includes('campus') || text.includes('substation') ||
      text.includes('rezoning') || text.includes('special use')
    );
    if (!isRelevant) continue;

    const titleKey = descText.slice(0, 60).toLowerCase();
    if (createdThisRun.has(titleKey)) continue;

    try {
      await sleep(800);
      const signal = {
        title: `${(evt.event_type || 'filing').toUpperCase()}: ${descText.slice(0, 80)}`,
        url: evt.source_url,
        snippet: descText.slice(0, 250),
      };
      const noteContent = buildNoteContent({ county, state, signal, noteType: 'municipal_intel' });

      let oppId = evt.opportunity_id || null;

      if (!oppId && created < 8) {
        const oppName = `${county} Co ${state} — Planning: ${descText.slice(0, 50)}`;
        const thesisType = detectThesisType(text);
        const nextActionDue = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

        const opp = await dcPost('/opportunities', {
          name: oppName,
          thesis_type: thesisType,
          angle: thesisType.includes('warehouse') ? 'warehouse' : 'data_center',
          micro_zone: `${county} County, ${state}`,
          pipeline_stage: 'new_lead',
          assigned_to: 'both',
          internal_notes: noteContent,
          next_action: 'Verify filing and identify parcel owner',
          next_action_due: nextActionDue,
        });

        if (opp?.id) {
          oppId = opp.id;
          createdThisRun.add(titleKey);
          created++;
        }
      }

      if (oppId) {
        await dcPost('/webhooks/openclaw/intel-note', {
          opportunity_id: oppId,
          note_type: 'municipal_intel',
          content: noteContent,
          confidence: 'high', // primary source = county filing system
          source_url: evt.source_url || null,
        }).catch(e => console.warn('[dcIntel] fire-and-forget failed:', e.message));
        notesCreated++;
      }
    } catch (err) {
      console.warn(`[dcIntelPlanningScanner] Failed for ${county} event: ${err.message}`);
      errors++;
    }
  }

  const durationMs = Date.now() - startTime;
  const outputText = `DC Intel Planning Scanner: ${events.length} planning events → ${created} new opportunities, ${notesCreated} intel notes (confidence: high)${errors > 0 ? ` — ${errors} errors` : ''} in ${(durationMs / 1000).toFixed(1)}s`;

  try {
    const brain = require('./collectiveBrain');
    brain.observe(
      `dc-intel-${new Date().toISOString().slice(0, 10)}`,
      'dc-intel-planning-scanner', 'market_insight',
      {
        subject: `County planning event scan — ${events.length} new events`,
        content: outputText,
        confidence: 1.0,
        metadata: { events_found: events.length, created, notes_created: notesCreated },
      }
    );
  } catch {}

  return { outputText, durationMs, costUsd: 0, extra: { eventsFound: events.length, created, notesCreated, errors } };
}


// ── Handler: dc_intel_distress_scanner ────────────────────────────────────────

/**
 * Weekly Wed 6:30am — cross-references distressed owners (tax delinquent, estate,
 * stale tenure) with skip-trace results to generate a prioritized "call today" list.
 * Posts one intel note per owner with phone, distress context, and assemblage size.
 * $0/run (DB-native, no search).
 */
async function dcIntelDistressScanner({ message, runId, agent }) {
  const startTime = Date.now();

  let params = {};
  try { params = JSON.parse(message); } catch {}
  const limit = params.limit || 30;

  // Fetch distressed + phone-reachable owners from DC Site Intel
  let candidates = [];
  try {
    const resp = await dcGet(`/webhooks/openclaw/distress-candidates?limit=${limit}`);
    candidates = Array.isArray(resp) ? resp : [];
  } catch (err) {
    console.error('[dcIntelDistressScanner] Failed to fetch distress candidates:', err.message);
    return { outputText: 'Distress Scanner: failed to fetch candidates', durationMs: Date.now() - startTime, costUsd: 0 };
  }

  if (candidates.length === 0) {
    return {
      outputText: 'Distress Scanner: 0 distressed owners with phones found — run skip-trace batch first',
      durationMs: Date.now() - startTime, costUsd: 0,
    };
  }

  const SIGNAL_LABELS = {
    tax_delinquent:           '⚠️ tax delinquent',
    tax_delinquent_scavenger: '🔴 tax delinquent (scavenger — severely delinquent)',
    estate_probable:          '📋 probable estate/heir situation',
    long_tenure:              '⏳ long-tenure owner (20+ years)',
    stale_ownership:          '🕸️ stale ownership — no transfers in 15+ years',
    multiple_parcels:         '🗺️ multi-parcel assemblage opportunity',
    assemblage_opportunity:   '🔗 adjacent parcel assemblage candidate',
  };

  let notesCreated = 0;
  let errors = 0;

  for (const owner of candidates) {
    try {
      const signals = (owner.distress_signals || [])
        .map(s => SIGNAL_LABELS[s] || s)
        .join('\n  • ');
      const acres = owner.assemblage_acres ? `${parseFloat(owner.assemblage_acres).toFixed(1)} ac` : 'acreage unknown';
      const parcelCount = owner.assemblage_parcel_count || 1;
      const location = [owner.mailing_city, owner.mailing_state].filter(Boolean).join(', ') || 'location unknown';
      const emailLine = (owner.skip_trace_emails || []).length > 0
        ? `Email: ${owner.skip_trace_emails[0]?.email || owner.skip_trace_emails[0]}`
        : 'No email on file';
      const contactScore = owner.contactability_score != null
        ? `${(owner.contactability_score * 100).toFixed(0)}%`
        : 'N/A';

      const content = [
        `DISTRESS SIGNAL — Call Today`,
        `Owner: ${owner.owner_name} (${owner.entity_type || 'unknown entity'})`,
        `APN: ${owner.primary_apn || 'N/A'} | Assemblage: ${acres} across ${parcelCount} parcel(s) | Location: ${location}`,
        ``,
        `Distress signals:`,
        `  • ${signals}`,
        ``,
        `Contact:`,
        `  Phone: ${owner.phone || 'see skip-trace record'}`,
        `  ${emailLine}`,
        `  Mailing: ${[owner.mailing_address, owner.mailing_city, owner.mailing_state].filter(Boolean).join(', ') || 'N/A'}`,
        `  Contactability score: ${contactScore}`,
        ``,
        `Recommended action: Call today. Multiple distress signals indicate seller motivation.`,
        `Source: DC Site Intel tax delinquency + owner distress DB (primary source).`,
      ].join('\n');

      await dcPost('/webhooks/openclaw/intel-note', {
        owner_id: owner.owner_id,
        opportunity_id: null,
        note_type: 'owner_intel',
        content,
        confidence: 'high',
        source_url: null,
      });
      notesCreated++;
      await sleep(400);
    } catch (err) {
      console.warn(`[dcIntelDistressScanner] Failed for ${owner.owner_name}: ${err.message}`);
      errors++;
    }
  }

  const durationMs = Date.now() - startTime;
  const outputText = `DC Intel Distress Scanner: ${candidates.length} distressed owners with phones — ${notesCreated} "call today" notes created${errors > 0 ? `, ${errors} errors` : ''} in ${(durationMs / 1000).toFixed(1)}s`;

  try {
    const brain = require('./collectiveBrain');
    brain.observe(
      `dc-intel-${new Date().toISOString().slice(0, 10)}`,
      'dc-intel-distress-scanner', 'market_insight',
      {
        subject: `Distressed owner call list — ${candidates.length} owners`,
        content: outputText,
        confidence: 1.0,
        metadata: { candidates: candidates.length, notes_created: notesCreated },
      }
    );
  } catch {}

  return { outputText, durationMs, costUsd: 0, extra: { candidates: candidates.length, notesCreated, errors } };
}


// ── Handler: dc_intel_meta_reviewer ───────────────────────────────────────────

/**
 * Daily 9am — reviews all OpenClaw intel notes from the past 24 hours using
 * Ollama. Scores each note on relevance, specificity, and actionability (0–10).
 * High-scoring notes (≥7) post a 'validated' outcome signal; low-scoring (<4)
 * post 'dismissed'. Writes per-agent quality stats to the collective brain.
 * $0/run (local Ollama, no API calls).
 */
async function dcIntelMetaReviewer({ message, runId, agent }) {
  const startTime = Date.now();

  let params = {};
  try { params = JSON.parse(message); } catch {}
  const days = params.days || 1;

  // Fetch recent openclaw notes
  let notes = [];
  try {
    const resp = await dcGet(`/webhooks/openclaw/intel-notes-recent?days=${days}&source=openclaw&limit=200`);
    notes = Array.isArray(resp) ? resp : [];
  } catch (err) {
    console.error('[dcIntelMetaReviewer] Failed to fetch notes:', err.message);
    return {
      outputText: `Meta-Reviewer: failed to fetch intel notes — ${err.message}`,
      durationMs: Date.now() - startTime, costUsd: 0,
    };
  }

  if (notes.length === 0) {
    return {
      outputText: `Meta-Reviewer: 0 OpenClaw notes in last ${days} day(s) to review`,
      durationMs: Date.now() - startTime, costUsd: 0,
    };
  }

  const ollamaModel = process.env.DT_MODEL || process.env.OLLAMA_DEFAULT_MODEL || 'llama3.1:8b';

  let validated = 0;
  let dismissed = 0;
  let neutral   = 0;
  let ollamaFailed = 0;
  const scores = [];

  // Source quality bonus by URL pattern
  function sourceQualityBonus(sourceUrl) {
    if (!sourceUrl) return 0;
    const url = sourceUrl.toLowerCase();
    if (url.includes('.gov') || url.includes('sec.gov'))        return 1;
    if (url.includes('datacenterfrontier') || url.includes('bisnow') ||
        url.includes('bizjournals') || url.includes('costar'))  return 0.7;
    if (url.includes('datacenterknowledge'))                    return 0.7;
    return 0.3;
  }

  for (const note of notes) {
    let score = null;
    let reason = '';

    // Try Ollama for quality scoring
    try {
      const prompt = `You are reviewing intel notes for a DC/warehouse land brokerage firm (Privium Pilch) operating in Cook County IL, DuPage IL, Will IL, Loudoun VA, and Prince William VA.

Rate this intel note on 3 dimensions (integers 0–3 each):
1. Relevance: Is this specifically about data center or warehouse land in the target markets?
2. Specificity: Does it name an APN, street address, acreage, specific company, or dollar amount?
3. Actionability: Can a broker take a concrete action today (call an owner, file a request, verify a listing)?

Note type: ${note.note_type}
Confidence: ${note.confidence}
Content: ${note.content.slice(0, 500)}

Reply ONLY with valid JSON (no markdown, no explanation):
{"relevance":N,"specificity":N,"actionability":N,"reason":"one sentence max 20 words"}`;

      const resp = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: ollamaModel, prompt, stream: false }),
      });

      if (resp.ok) {
        const data = await resp.json();
        const raw = (data.response || '').trim();
        // Extract JSON from response (sometimes wrapped in markdown)
        const jsonMatch = raw.match(/\{[^}]+\}/s);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const src = sourceQualityBonus(note.source_url);
          score = Math.min(10, (parsed.relevance || 0) + (parsed.specificity || 0) + (parsed.actionability || 0) + src);
          reason = parsed.reason || '';
        }
      }
    } catch (err) {
      ollamaFailed++;
      // Fallback: heuristic scoring without LLM
      let hScore = 0;
      const text = (note.content || '').toLowerCase();
      const url  = (note.source_url || '').toLowerCase();
      // Relevance heuristic
      if (text.includes('data center') || text.includes('industrial') || text.includes('warehouse')) hScore += 2;
      else if (text.includes('land') || text.includes('parcel') || text.includes('acre')) hScore += 1;
      // Specificity heuristic
      if (/\b\d{2}-\d{2}|\bapn\b|\bpin\b/i.test(text)) hScore += 3;
      else if (/\d+\s*acres?|address|\$[\d,]+/i.test(text)) hScore += 2;
      else if (text.includes('county') || text.includes('township')) hScore += 1;
      // Source quality
      hScore += Math.round(sourceQualityBonus(url) * 3);
      score = Math.min(10, hScore);
      reason = 'heuristic (Ollama unavailable)';
    }

    if (score !== null) {
      scores.push(score);

      if (score >= 7 && note.opportunity_id) {
        try {
          await dcPost('/webhooks/openclaw/outcome-signal', {
            opportunity_id: note.opportunity_id,
            outcome: 'validated',
            signal_source: 'openclaw_meta_reviewer',
            feedback_note: `Meta-Reviewer score ${score.toFixed(1)}/10: ${reason}`,
          });
          validated++;
        } catch {}
      } else if (score < 4 && note.opportunity_id) {
        try {
          await dcPost('/webhooks/openclaw/outcome-signal', {
            opportunity_id: note.opportunity_id,
            outcome: 'dismissed',
            signal_source: 'openclaw_meta_reviewer',
            feedback_note: `Meta-Reviewer score ${score.toFixed(1)}/10 (below threshold): ${reason}`,
          });
          dismissed++;
        } catch {}
      } else {
        neutral++;
      }
    }

    await sleep(200); // pace Ollama calls
  }

  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const signalRate = notes.length > 0 ? Math.round((validated / notes.length) * 100) : 0;

  const durationMs = Date.now() - startTime;
  const outputText = `Meta-Reviewer: ${notes.length} notes reviewed — avg quality ${avgScore.toFixed(1)}/10 | ✅ ${validated} validated, ❌ ${dismissed} dismissed, ⏸ ${neutral} neutral | Signal rate: ${signalRate}% in ${(durationMs / 1000).toFixed(1)}s${ollamaFailed > 0 ? ` (${ollamaFailed} heuristic fallbacks)` : ''}`;

  // Write quality summary to collective brain
  try {
    const brain = require('./collectiveBrain');
    brain.observe(
      `dc-intel-${new Date().toISOString().slice(0, 10)}`,
      'dc-intel-meta-reviewer', 'market_insight',
      {
        subject: `Agent output quality review — ${notes.length} notes, avg ${avgScore.toFixed(1)}/10`,
        content: outputText,
        confidence: 1.0,
        metadata: {
          notes_reviewed: notes.length,
          avg_score: avgScore,
          validated, dismissed, neutral,
          signal_rate: signalRate,
          ollama_fallbacks: ollamaFailed,
        },
      }
    );

    brain.recordEpisode('dc-intel-meta-reviewer', {
      market: 'all target markets',
      actionTaken: `Reviewed ${notes.length} OpenClaw intel notes for quality`,
      outcome: `avg score ${avgScore.toFixed(1)}/10, ${signalRate}% signal rate`,
      outcomeType: 'quality_assessment',
      outcomeScore: avgScore / 10,
      signalSource: 'ollama_meta_review',
    });
  } catch {}

  return {
    outputText,
    durationMs,
    costUsd: 0,
    extra: { notesReviewed: notes.length, avgScore, validated, dismissed, neutral, signalRate },
  };
}


// ── Virginia SOS Buyer Identification ─────────────────────────────────────────

/**
 * Known registered agents → likely hyperscaler mapping.
 * Hyperscalers use the SAME registered agents across all their shell LLCs.
 * This mapping lets us identify the buyer behind an anonymous LLC.
 */
const KNOWN_REGISTERED_AGENTS = {
  'corporation service company':     { likely: 'Amazon / AWS',      confidence: 0.75 },
  'csc':                             { likely: 'Amazon / AWS',      confidence: 0.70 },
  'ct corporation system':           { likely: 'Microsoft',         confidence: 0.70 },
  'the corporation trust company':   { likely: 'Google / Alphabet', confidence: 0.65 },
  'national registered agents':      { likely: 'Meta / Facebook',   confidence: 0.55 },
  'nrai':                            { likely: 'Meta / Facebook',   confidence: 0.55 },
  'cogency global':                  { likely: 'CoreWeave',         confidence: 0.50 },
  'registered agents inc':           { likely: 'Oracle',            confidence: 0.45 },
  // Known specific LLCs
  'vadata':                          { likely: 'Amazon / AWS',      confidence: 0.95 },
  'huge holdings':                   { likely: 'Microsoft',         confidence: 0.90 },
  'cloverleaf':                      { likely: 'Google / Alphabet', confidence: 0.85 },
};

/**
 * Look up an LLC/entity on Virginia SCC Business Entity Search via Brave.
 * Returns registered agent name, principal office, and formation date if found.
 *
 * @param {string} entityName — LLC or corp name to look up
 * @returns {{ agent: string|null, office: string|null, likelyBuyer: string|null, confidence: number }}
 */
async function lookupVirginiaSOS(entityName) {
  if (!entityName || entityName.length < 3) return { agent: null, office: null, likelyBuyer: null, confidence: 0 };

  // Search SCC business entity database via Brave
  const query = `site:cis.scc.virginia.gov "${entityName}" registered agent`;
  let results;
  try {
    results = await braveSearch(query, 3);
  } catch {
    return { agent: null, office: null, likelyBuyer: null, confidence: 0 };
  }

  if (!results || results.length === 0) {
    // Fallback: broader search
    try {
      results = await braveSearch(`"${entityName}" Virginia LLC registered agent`, 3);
    } catch {
      return { agent: null, office: null, likelyBuyer: null, confidence: 0 };
    }
  }

  // Extract registered agent from search snippets
  const combined = results.map(r => `${r.title || ''} ${r.description || ''}`).join(' ').toLowerCase();
  let detectedAgent = null;
  let likelyBuyer = null;
  let confidence = 0;

  for (const [agentKey, mapping] of Object.entries(KNOWN_REGISTERED_AGENTS)) {
    if (combined.includes(agentKey.toLowerCase())) {
      detectedAgent = agentKey;
      likelyBuyer = mapping.likely;
      confidence = mapping.confidence;
      break;
    }
  }

  // Also check if the entity name itself matches a known pattern
  const nameLower = entityName.toLowerCase();
  for (const [key, mapping] of Object.entries(KNOWN_REGISTERED_AGENTS)) {
    if (nameLower.includes(key)) {
      likelyBuyer = mapping.likely;
      confidence = Math.max(confidence, mapping.confidence);
      break;
    }
  }

  // Extract office address if present in snippets
  const officeMatch = combined.match(/(?:principal|office|address)[:\s]+([^.]{10,80})/i);
  const office = officeMatch ? officeMatch[1].trim() : null;

  return { agent: detectedAgent, office, likelyBuyer, confidence };
}


// ── Handler: dc_intel_dominion_monitor ────────────────────────────────────────

/**
 * Weekly Mon 8am — scans Virginia SCC docket and Dominion Energy sources for
 * new large power service filings that signal hyperscaler site-selection activity
 * in Loudoun and Prince William counties.
 *
 * Primary sources:
 *   1. Virginia SCC docket (Brave Search targeting site:scc.virginia.gov)
 *      — PUR-YYYY-XXXXX cases for Dominion Energy large power/interconnection
 *   2. Interconnection.fyi VA large load requests
 *   3. Dominion Energy ICA / queue updates
 *   4. SEC 8-K filings (hyperscaler land acquisitions in NoVA)
 *
 * Posts utility_intel notes to DC Site Intel when new signals found.
 */
async function dcIntelDominionMonitor({ message, runId, agent }) {
  const startTime = Date.now();
  const MAX_RUNTIME_MS = 3 * 60 * 1000; // 3-minute wall clock limit

  let params = {};
  try { params = JSON.parse(message); } catch {}
  const targetCounties = params.counties || ['Loudoun', 'Prince William'];

  const SCC_QUERIES = [
    // SCC docket filings — Dominion large power in target counties
    'site:scc.virginia.gov "Dominion" "large load" OR "large power" OR "transmission" "Loudoun" OR "Prince William" 2025 OR 2026',
    // SCC PUR case number format search
    'site:scc.virginia.gov PUR-2025 OR PUR-2026 "Dominion" "Loudoun" OR "Prince William" OR "Northern Virginia"',
    // Dominion ICA and interconnection capacity news
    '"Dominion Energy" "interconnection" OR "large load" "Loudoun" OR "Prince William" "data center" 2025 OR 2026',
    // Virginia SCC + power capacity + hyperscaler signals
    '"Virginia SCC" OR "State Corporation Commission" "Dominion" "data center" OR "hyperscale" "Northern Virginia" 2025 OR 2026',
    // SEC 8-K — hyperscaler land acquisitions in NoVA
    'site:sec.gov 8-K "Loudoun" OR "Prince William" "data center" OR "land" acquisition 2025 OR 2026',
    // Interconnection.fyi VA large loads
    'site:interconnection.fyi Virginia "large load" OR "data center" Dominion 2025 OR 2026',
    // Dominion queue reports and capacity announcements
    '"Dominion Energy" "queue" OR "ICA" "Northern Virginia" OR "NoVA" "capacity" "megawatt" OR "MW" 2025 OR 2026',
    // Data center developers filing with SCC
    '"Prince William" OR "Loudoun" "substation" OR "transmission" "new" 2025 OR 2026 data center site:bizjournals.com OR site:datacenterdynamics.com OR site:datacenterknowledge.com',
  ];

  let notesCreated = 0;
  let errors = 0;
  const signalsSeen = new Set();

  for (const query of SCC_QUERIES) {
    // Bail out if we've been running too long
    if (Date.now() - startTime > MAX_RUNTIME_MS) {
      console.log('[dcIntelDominionMonitor] Reached max runtime — stopping early');
      break;
    }
    try {
      const results = await smartSearch(query, 5, 'pm'); // past month
      await sleep(1500);

      for (const r of results) {
        const key = r.url || r.title;
        if (signalsSeen.has(key)) continue;
        signalsSeen.add(key);

        const text = `${r.title || ''} ${r.description || ''}`;

        // Filter to only meaningful power/DC signals
        const isPowerSignal = /dominion|substation|transmission|megawatt|\bMW\b|interconnect|large.?load|power.?service|capacity|kilowatt|\bkV\b/i.test(text);
        const isDCSignal = /data.?center|hyperscal|colocation|campus|compute|ai.?infra|server.?farm/i.test(text);
        const isCountySignal = /loudoun|prince.?william|ashburn|manassas|chantilly|northern.?virginia|NoVA/i.test(text);
        const isSCCSignal = /\bSCC\b|virginia.?state.?corp|PUR-\d{4}|efile\.scc|scc\.virginia/i.test(text);

        // Must match county + (power OR SCC signal)
        if (!isCountySignal) continue;
        if (!isPowerSignal && !isSCCSignal) continue;

        // Determine note type and confidence
        let noteType = 'utility_intel';
        let confidence = 'medium';
        let county = null;

        if (/loudoun/i.test(text)) county = 'Loudoun';
        else if (/prince.?william|manassas|woodbridge/i.test(text)) county = 'Prince William';

        if (isSCCSignal) confidence = 'high'; // official gov source
        if (r.url && r.url.includes('sec.gov')) {
          noteType = 'market_intel';
          confidence = 'high'; // SEC 8-K is primary source
        }
        if (r.url && r.url.includes('interconnection.fyi')) {
          confidence = 'high'; // primary data source
        }

        // Extract MW signal if present
        const mwMatch = text.match(/(\d[\d,.]*)\s*(?:MW|megawatt|GW|gigawatt)/i);
        const mwStr = mwMatch ? ` | ${mwMatch[0]}` : '';

        // Extract SCC case number if present
        const caseMatch = text.match(/PUR-\d{4}-\d{5}/i);
        const caseStr = caseMatch ? ` | SCC Case: ${caseMatch[0]}` : '';

        const content = [
          `[${county || 'Northern VA'}] DOMINION POWER SIGNAL${mwStr}${caseStr}`,
          `data_center_land power_infrastructure utility_intel`,
          `Source: ${r.title}.`,
          (r.description || '').slice(0, 280),
          isDCSignal ? 'Data center / hyperscaler activity confirmed.' : '',
        ].filter(Boolean).join(' ').slice(0, 500);

        // Attempt Virginia SOS buyer identification on any LLC/Corp name in the signal
        let buyerNote = '';
        const llcMatch = text.match(/([A-Z][A-Za-z0-9\s&,.']{3,40}\s(?:LLC|Inc|Corp|LP|LLP|Holdings))/);
        if (llcMatch) {
          try {
            const sos = await lookupVirginiaSOS(llcMatch[1].trim());
            if (sos.likelyBuyer) {
              buyerNote = ` | BUYER LIKELY: ${sos.likelyBuyer} (agent: ${sos.agent || 'match'}, conf: ${(sos.confidence * 100).toFixed(0)}%)`;
              content = content.slice(0, 400) + buyerNote;
              confidence = 'high'; // upgrade confidence when buyer identified
              console.log(`[dcIntelDominionMonitor] Buyer ID: ${llcMatch[1]} → ${sos.likelyBuyer}`);
            }
          } catch {} // SOS lookup failure is non-fatal
        }

        // Post as market-level intel (no specific opportunity link required)
        await dcPost('/webhooks/openclaw/intel-note', {
          note_type: noteType,
          confidence,
          content,
          source: 'dominion_monitor',
          source_url: r.url || null,
          authored_by: 'openclaw',
        });

        notesCreated++;
        console.log(`[dcIntelDominionMonitor] Posted: ${r.title?.slice(0, 60)}`);
        await sleep(800);
      }
    } catch (err) {
      console.error(`[dcIntelDominionMonitor] Query failed:`, err.message);
      errors++;
    }
  }

  // ── Hot Signal Alert: fire immediately if high-confidence notes found ──
  let alertsSent = 0;
  if (notesCreated > 0) {
    try {
      // Send one consolidated alert per county
      const countySignals = {};
      for (const [key, r] of signalsSeen.entries()) {
        if (typeof r === 'string') continue; // signalsSeen stores URLs as keys
      }
      // Simple: send one alert summarizing all findings
      const alertResult = await sendHotSignalAlert({
        county: 'Prince William',  // Primary target
        state: 'VA',
        signalType: 'utility_intel',
        content: `Dominion/SCC scanner found ${notesCreated} new power infrastructure signal(s) in Northern Virginia. Review intel notes for details.`,
        confidence: 'high',
      });
      if (alertResult.sent) alertsSent++;
    } catch (err) {
      console.warn('[dcIntelDominionMonitor] Hot signal alert failed:', err.message);
    }
  }

  const durationMs = Date.now() - startTime;
  const outputText = `DC Intel Dominion Monitor: ${notesCreated} signals posted, ${alertsSent} hot alerts sent, ${errors} errors, ${signalsSeen.size} URLs scanned in ${(durationMs / 1000).toFixed(1)}s`;

  try {
    const brain = require('./collectiveBrain');
    brain.observe(
      `dc-intel-${new Date().toISOString().slice(0, 10)}`,
      'dc-intel-dominion-monitor', 'market_insight',
      {
        subject: 'Dominion Energy + SCC power filing scan',
        content: outputText,
        confidence: 0.8,
        metadata: { notes_created: notesCreated, urls_scanned: signalsSeen.size, alerts_sent: alertsSent },
      }
    );
  } catch {}

  return { outputText, durationMs, costUsd: 0, extra: { notesCreated, errors, urlsScanned: signalsSeen.size, alertsSent } };
}


// ── Hot Signal Alert Utility ──────────────────────────────────────────────────

/**
 * Send an instant email alert when a high-confidence signal is detected.
 * Called from Dominion monitor, RTO scanner, or planning scanner when
 * they find something worth an immediate phone call.
 *
 * @param {{ county, state, signalType, content, sourceUrl, confidence }} signal
 */
async function sendHotSignalAlert(signal) {
  const sg = require('./sendgrid');
  if (!sg.status().configured) {
    console.log('[HotSignal] SendGrid not configured — skipping alert');
    return { sent: false, reason: 'not_configured' };
  }

  // Get uncontacted owners in this county for the alert
  let owners = [];
  try {
    owners = await dcGet(`/owners/call-queue?county=${encodeURIComponent(signal.county || '')}&state=${encodeURIComponent(signal.state || 'VA')}&limit=5`);
  } catch (err) {
    console.warn('[HotSignal] Failed to fetch call queue:', err.message);
  }

  // Build owner rows HTML
  let ownerHtml = '';
  if (owners && owners.length > 0) {
    const rows = owners.map((o, i) => {
      const phone = o.phone || '—';
      const acres = o.acreage ? `${o.acreage} ac` : '—';
      const score = o.pursuit_priority_score ? o.pursuit_priority_score.toFixed(2) : '—';
      return `<tr>
        <td style="padding:8px;border-bottom:1px solid #eee;font-weight:600;">${i + 1}. ${o.owner_name || '—'}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${acres}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;font-weight:700;color:#1b5e20;">${phone}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${score}</td>
      </tr>`;
    }).join('');
    ownerHtml = `
      <h3 style="margin:16px 0 8px;font-size:14px;color:#333;">Uncontacted Owners in ${signal.county || 'Target'} County — Call NOW</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:#f8f8f8;font-size:11px;text-transform:uppercase;color:#555;">
          <th style="padding:8px;text-align:left;">Owner</th>
          <th style="padding:8px;text-align:left;">Acres</th>
          <th style="padding:8px;text-align:left;">Phone</th>
          <th style="padding:8px;text-align:center;">Score</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  } else {
    ownerHtml = '<p style="color:#888;font-size:13px;">No uncontacted owners found in this county — run owner resolution first.</p>';
  }

  const confidenceColor = signal.confidence === 'high' ? '#b71c1c' : '#e65100';
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:650px;margin:0 auto;">
      <div style="background:#b71c1c;color:white;padding:18px 24px;border-radius:6px 6px 0 0;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;opacity:.8;">⚡ Hot Signal Alert</div>
        <div style="font-size:18px;font-weight:700;margin-top:4px;">${signal.county || 'Target Market'} County, ${signal.state || 'VA'}</div>
      </div>
      <div style="background:#fff;border:1px solid #ddd;border-top:none;padding:20px 24px;">
        <div style="margin-bottom:12px;">
          <span style="background:${confidenceColor};color:white;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:700;">${(signal.confidence || 'medium').toUpperCase()}</span>
          <span style="margin-left:8px;font-size:12px;color:#666;">${signal.signalType || 'utility_intel'}</span>
        </div>
        <p style="font-size:14px;color:#222;line-height:1.5;margin:0 0 12px;">${signal.content || 'New signal detected.'}</p>
        ${signal.sourceUrl ? `<p style="font-size:12px;"><a href="${signal.sourceUrl}" style="color:#1565c0;">Source →</a></p>` : ''}
        ${ownerHtml}
      </div>
      <div style="background:#f9f9f9;border:1px solid #ddd;border-top:none;border-radius:0 0 6px 6px;padding:12px 24px;text-align:center;">
        <a href="https://dcsi-dashboard.blackbush-bb9e213f.centralus.azurecontainerapps.io/" style="display:inline-block;background:#0d47a1;color:white;padding:6px 16px;border-radius:4px;text-decoration:none;font-size:12px;font-weight:600;margin-bottom:8px;">Open Dashboard</a>
        <div style="font-size:11px;color:#999;">DC Site Intel — Hot Signal Alert — ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC</div>
      </div>
    </div>`;

  const recipients = (process.env.DIGEST_TO || process.env.DC_INTEL_ALERT_TO || '').split(',').map(e => e.trim()).filter(Boolean);
  if (recipients.length === 0) {
    console.warn('[HotSignal] No recipients configured (DIGEST_TO)');
    return { sent: false, reason: 'no_recipients' };
  }

  const result = await sg.send({
    to: recipients,
    subject: `⚡ HOT SIGNAL: ${signal.county || 'Target'} Co ${signal.state || 'VA'} — ${(signal.signalType || 'utility_intel').replace(/_/g, ' ')}`,
    html,
    from: process.env.SENDGRID_FROM_EMAIL || 'augustwest154@gmail.com',
    fromName: 'DC Site Intel Alerts',
  });

  console.log(`[HotSignal] Alert sent to ${recipients.join(', ')}: ${result.success ? 'OK' : result.error}`);
  return { sent: result.success, recipients: recipients.length };
}


// ── Handler: dc_intel_weekly_digest ───────────────────────────────────────────

/**
 * Monday 7am — fires the weekly digest email (Call 5 Now + pipeline summary).
 * Calls the DC Site Intel /webhooks/openclaw/trigger-digest endpoint which
 * runs scripts/weekly_digest.py inside the container.
 */
async function dcIntelWeeklyDigest({ message, runId, agent }) {
  const startTime = Date.now();

  const resp = await dcPost('/webhooks/openclaw/trigger-digest', {});
  const durationMs = Date.now() - startTime;

  const status = resp?.status || 'unknown';
  const output = resp?.output || '';
  const leadsMatch = output.match(/Call 5 Now leads:\s*(\d+)/);
  const leadCount = leadsMatch ? parseInt(leadsMatch[1]) : '?';

  const outputText = status === 'sent'
    ? `DC Intel Weekly Digest: sent ✓ — ${leadCount} call leads included (${(durationMs / 1000).toFixed(1)}s)`
    : `DC Intel Weekly Digest: ${status} — ${output.slice(-300)}`;

  return {
    outputText,
    durationMs,
    costUsd: 0,
    extra: { status, leadCount },
  };
}


// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  dcIntelDealMonitor,
  dcIntelOwnerResearch,
  dcIntelResearchQueue,
  dcIntelOpportunityScout,
  dcIntelDailyScorecard,
  dcIntelLearningLoop,
  dcIntelAutoGenerate,
  dcIntelRTOScanner,
  dcIntelPlanningScanner,
  dcIntelDistressScanner,
  dcIntelMetaReviewer,
  dcIntelWeeklyDigest,
  dcIntelDominionMonitor,
};
