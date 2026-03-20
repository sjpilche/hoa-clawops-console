/**
 * @file apolloLeadMiner.js
 * @description Apollo Lead Miner — uses Apollo as PRIMARY lead source, not just enricher.
 *
 * 3 Lists (from CRAP playbook):
 *   List 1: Core CFOs — high probability buyers
 *   List 2: Tinkerer CFOs — new in role, scaling company, open to change
 *   List 3: Data Pain — messy tech stack, fragmented systems
 *
 * Credit guardrails:
 *   - 60K credits/month (Basic plan) = ~1,200 reveals
 *   - Daily cap: 40 reveals/day (safe buffer)
 *   - Tracks usage in settings table
 *
 * Scoring rubric (CRAP):
 *   Industry match:    20 pts
 *   Company size:      20 pts
 *   Growth signal:     20 pts
 *   Job change:        15 pts
 *   Tech stack:        25 pts
 *   Total:            100 pts — only >70 enters cadence
 *
 * $0 compute + Apollo API credits only.
 */

'use strict';

const { get, all, run } = require('../db/connection');

const APOLLO_API_KEY = process.env.APOLLO_API_KEY;
const APOLLO_BASE = 'https://api.apollo.io';
const DAILY_CREDIT_CAP = 40; // Max reveals per day (60K/month ÷ 30 = 2K/day, but be conservative)

// ── List Configs ────────────────────────────────────────────────────────────

const LIST_CONFIGS = {
  core_cfos: {
    name: 'Core CFOs',
    person_titles: ['CFO', 'Chief Financial Officer', 'VP Finance', 'Controller', 'Director of Finance'],
    person_seniorities: ['c_suite', 'vp', 'director'],
    organization_industry_tag_ids: [], // Will use keywords instead
    q_organization_keyword_tags: ['construction', 'general contractor', 'civil engineering', 'building', 'mechanical contractor', 'electrical contractor', 'plumbing contractor', 'HVAC contractor'],
    organization_num_employees_ranges: ['21-50', '51-100', '101-200', '201-500'],
    person_locations: ['United States'],
    per_page: 25,
  },

  tinkerer_cfos: {
    name: 'Tinkerer CFOs',
    person_titles: ['CFO', 'Chief Financial Officer', 'VP Finance', 'Controller'],
    person_seniorities: ['c_suite', 'vp'],
    q_organization_keyword_tags: ['construction', 'general contractor', 'specialty contractor', 'mechanical', 'electrical', 'plumbing', 'HVAC'],
    organization_num_employees_ranges: ['21-50', '51-100', '101-200', '201-500'],
    person_locations: ['United States'],
    q_person_name: '', // Will be empty — we want anyone matching
    contact_email_status: ['verified'],
    per_page: 25,
    // Tinkerer signals checked post-search via org enrichment
  },

  data_pain: {
    name: 'Data Pain Targets',
    person_titles: ['CFO', 'Chief Financial Officer', 'VP Finance', 'Controller', 'Director of Finance', 'Accounting Manager'],
    person_seniorities: ['c_suite', 'vp', 'director', 'manager'],
    q_organization_keyword_tags: ['construction', 'contractor', 'building', 'facilities', 'field services'],
    organization_num_employees_ranges: ['51-100', '101-200', '201-500'],
    person_locations: ['United States'],
    per_page: 25,
  },
};

// ── Credit Tracking ─────────────────────────────────────────────────────────

function getCreditsUsedToday() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const row = get("SELECT value FROM settings WHERE key = 'apollo_credits_today'");
    if (row) {
      const data = JSON.parse(row.value);
      if (data.date === today) return data.used;
    }
    return 0;
  } catch { return 0; }
}

function trackCredits(count) {
  const today = new Date().toISOString().slice(0, 10);
  const current = getCreditsUsedToday();
  const newUsed = current + count;
  run(
    `INSERT INTO settings (key, value, updated_at) VALUES ('apollo_credits_today', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [JSON.stringify({ date: today, used: newUsed })]
  );
  return newUsed;
}

function canAfford(count) {
  return getCreditsUsedToday() + count <= DAILY_CREDIT_CAP;
}

// ── Apollo API ──────────────────────────────────────────────────────────────

async function apolloSearch(listConfig, page = 1) {
  if (!APOLLO_API_KEY) throw new Error('APOLLO_API_KEY not configured');

  const remaining = DAILY_CREDIT_CAP - getCreditsUsedToday();
  if (remaining <= 0) {
    return { people: [], totalAvailable: 0, message: `Daily credit cap reached (${DAILY_CREDIT_CAP}/day)` };
  }

  const limit = Math.min(listConfig.per_page || 25, remaining);

  const body = {
    page,
    per_page: limit,
    person_titles: listConfig.person_titles,
    person_seniorities: listConfig.person_seniorities,
    person_locations: listConfig.person_locations,
    q_organization_keyword_tags: listConfig.q_organization_keyword_tags,
    organization_num_employees_ranges: listConfig.organization_num_employees_ranges,
  };

  // Only include non-empty filters
  Object.keys(body).forEach(k => {
    if (body[k] === undefined || body[k] === null || (Array.isArray(body[k]) && body[k].length === 0)) {
      delete body[k];
    }
  });

  const resp = await fetch(`${APOLLO_BASE}/api/v1/mixed_people/api_search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': APOLLO_API_KEY },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Apollo API ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data = await resp.json();
  let people = data.people || [];

  // Reveal emails — always try, Apollo search hides emails even when they exist
  const revealable = people.filter(p => !p.email && p.id);
  if (revealable.length > 0 && canAfford(revealable.length)) {
    try {
      const revealResp = await fetch(`${APOLLO_BASE}/api/v1/people/bulk_match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': APOLLO_API_KEY },
        body: JSON.stringify({ details: revealable.map(p => ({ id: p.id })) }),
      });
      if (revealResp.ok) {
        const revealData = await revealResp.json();
        // bulk_match returns { matches: [{...person}] } or could be nested differently
        const revealed = revealData.matches || revealData.people || (Array.isArray(revealData) ? revealData : []);
        console.log(`[ApolloMiner] Reveal response keys: ${Object.keys(revealData).join(',')} | revealed: ${revealed.length}`);
        const emailMap = {};
        for (const r of revealed) {
          if (r.email) emailMap[r.id] = r;
        }
        // Merge revealed emails + last names back into people array
        people = people.map(p => {
          if (emailMap[p.id]) {
            return { ...p, email: emailMap[p.id].email, last_name: emailMap[p.id].last_name || p.last_name };
          }
          return p;
        });
        console.log(`[ApolloMiner] Revealed ${Object.keys(emailMap).length}/${revealable.length} emails`);
      } else {
        const errText = await revealResp.text();
        console.warn(`[ApolloMiner] Reveal failed ${revealResp.status}: ${errText.slice(0, 200)}`);
      }
    } catch (revealErr) {
      console.warn('[ApolloMiner] Email reveal failed (non-fatal):', revealErr.message);
    }
  }

  // Track credits (search + reveals)
  trackCredits(people.length + revealable.length);

  return {
    people,
    totalAvailable: data.pagination?.total_entries || 0,
    page: data.pagination?.page || 1,
    totalPages: data.pagination?.total_pages || 0,
    creditsUsedToday: getCreditsUsedToday(),
    creditsRemaining: DAILY_CREDIT_CAP - getCreditsUsedToday(),
  };
}

// ── Lead Scoring (CRAP Rubric) ──────────────────────────────────────────────

function scoreLeadCRAP(person) {
  let score = 0;
  const reasons = [];
  const org = person.organization || {};

  // Industry match (20 pts) — check industry, keywords, AND company name
  const industry = (org.industry || '').toLowerCase();
  const keywords = (org.keywords || []).map(k => k.toLowerCase());
  const companyLower = (org.name || '').toLowerCase();
  const industryHits = ['construction', 'contractor', 'building', 'civil', 'mechanical', 'electrical', 'plumbing', 'hvac', 'facilities', 'roofing', 'paving', 'demolition', 'excavat'];
  const industryMatch = industryHits.some(h => industry.includes(h) || keywords.some(k => k.includes(h)) || companyLower.includes(h));
  if (industryMatch) {
    score += 20;
    reasons.push('industry:construction (+20)');
  }

  // Company size sweet spot (20 pts)
  const employees = org.estimated_num_employees || 0;
  if (employees >= 50 && employees <= 200) {
    score += 20;
    reasons.push(`size:${employees} sweet-spot (+20)`);
  } else if (employees >= 20 && employees <= 300) {
    score += 12;
    reasons.push(`size:${employees} acceptable (+12)`);
  } else if (employees > 0) {
    reasons.push(`size:${employees} outside-range (+0)`);
  }

  // Growth signal (20 pts)
  const isHiring = person.organization_hiring || org.actively_hiring;
  if (isHiring) {
    score += 20;
    reasons.push('hiring:yes (+20)');
  }

  // Job change — new in role (15 pts)
  const startDate = person.employment_history?.[0]?.start_date;
  if (startDate) {
    const monthsInRole = Math.floor((Date.now() - new Date(startDate).getTime()) / (30 * 86400000));
    if (monthsInRole <= 18) {
      score += 15;
      reasons.push(`new-in-role:${monthsInRole}mo (+15)`);
    }
  }

  // Title match bonus (15 pts) — CFO/Controller at construction = high value
  const titleLower = (person.title || '').toLowerCase();
  if (/cfo|chief financial|controller|vp.?finance/.test(titleLower)) {
    score += 15;
    reasons.push('title:finance-leader (+15)');
  }

  // Tech stack weakness (25 pts)
  const techStack = (org.technologies || []).map(t => t.toLowerCase());
  const weakTech = ['quickbooks', 'sage', 'excel', 'manual'];
  const modernTech = ['snowflake', 'dbt', 'looker', 'tableau', 'power bi'];
  const hasWeakTech = weakTech.some(t => techStack.some(ts => ts.includes(t)));
  const hasModernTech = modernTech.some(t => techStack.some(ts => ts.includes(t)));

  if (hasWeakTech && !hasModernTech) {
    score += 25;
    reasons.push('tech:weak-stack (+25)');
  } else if (hasWeakTech) {
    score += 10;
    reasons.push('tech:mixed-stack (+10)');
  } else if (techStack.length === 0) {
    score += 8; // No tech data = likely small/fragmented
    reasons.push('tech:unknown (+8)');
  }

  return { score, reasons, maxScore: 100 };
}

// ── Mine + Score + Insert ───────────────────────────────────────────────────

/**
 * Mine leads from Apollo, score them, insert qualified ones into cfo_leads.
 *
 * @param {string} listType — 'core_cfos', 'tinkerer_cfos', or 'data_pain'
 * @param {object} [opts]
 * @param {number} [opts.pages=1] — how many pages to fetch
 * @param {number} [opts.minScore=35] — minimum CRAP score to insert (low default because Apollo search returns limited data; enrich after for full scoring)
 * @returns {{ mined, scored, inserted, skipped, duplicates, creditsUsed, topLeads }}
 */
async function mineAndScore(listType = 'core_cfos', opts = {}) {
  const config = LIST_CONFIGS[listType];
  if (!config) throw new Error(`Unknown list type: ${listType}. Valid: ${Object.keys(LIST_CONFIGS).join(', ')}`);

  const pages = opts.pages || 1;
  const minScore = opts.minScore || 35;
  let mined = 0, scored = 0, inserted = 0, skipped = 0, duplicates = 0;
  const topLeads = [];

  for (let page = 1; page <= pages; page++) {
    if (!canAfford(1)) {
      console.warn(`[ApolloMiner] Daily credit cap reached. Stopping at page ${page}.`);
      break;
    }

    const result = await apolloSearch(config, page);
    mined += result.people.length;

    for (const person of result.people) {
      const scoreResult = scoreLeadCRAP(person);
      scored++;

      // Track all scores for debugging
      topLeads.push({
        name: `${person.first_name} ${person.last_name}`,
        title: person.title,
        company: person.organization?.name || '?',
        score: scoreResult.score,
        reasons: scoreResult.reasons,
        email: person.email ? '✓' : '✗',
      });

      if (scoreResult.score < minScore) {
        skipped++;
        continue;
      }

      // Check for duplicate
      const email = person.email || null;
      const companyName = person.organization?.name || '';
      if (email) {
        const existing = get('SELECT id FROM cfo_leads WHERE LOWER(contact_email) = LOWER(?)', [email]);
        if (existing) { duplicates++; continue; }
      } else {
        // No email — check by name + company
        const existing = get('SELECT id FROM cfo_leads WHERE LOWER(company_name) = LOWER(?) AND LOWER(contact_name) = LOWER(?)',
          [companyName, `${person.first_name} ${person.last_name}`]);
        if (existing) { duplicates++; continue; }
      }

      // Insert qualified lead
      const org = person.organization || {};
      const techStack = (org.technologies || []).join(', ');
      const erpType = detectErp(org.technologies || []);

      run(`INSERT INTO cfo_leads (
        company_name, contact_name, contact_title, contact_email, contact_linkedin,
        employee_count, revenue_range, erp_type, city, state, website,
        pilot_fit_score, urgency_score, enrichment_status, source, source_agent,
        status, workspace_id, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'enriched', 'apollo_miner', 'jake', 'new', 1, ?, datetime('now'), datetime('now'))`,
        [
          companyName,
          `${person.first_name || ''} ${person.last_name || ''}`.trim(),
          person.title || null,
          email,
          person.linkedin_url || null,
          org.estimated_num_employees || null,
          org.estimated_annual_revenue ? `$${Math.round(org.estimated_annual_revenue / 1000000)}M` : null,
          erpType,
          person.city || org.city || null,
          person.state || org.state || null,
          org.website_url || null,
          scoreResult.score, // pilot_fit_score = CRAP score
          scoreResult.score, // urgency_score = same for now
          `CRAP score: ${scoreResult.score}/100 | ${scoreResult.reasons.join(', ')} | Tech: ${techStack || 'unknown'} | List: ${config.name}`,
        ]
      );

      inserted++;
      topLeads.push({
        name: `${person.first_name} ${person.last_name}`,
        title: person.title,
        company: companyName,
        score: scoreResult.score,
        reasons: scoreResult.reasons,
        email: email ? '✓' : '✗',
      });
    }

    // Rate limit between pages
    if (page < pages) await new Promise(r => setTimeout(r, 1000));
  }

  // Sort top leads by score
  topLeads.sort((a, b) => b.score - a.score);

  const summary = `Apollo Miner (${config.name}): ${mined} found, ${scored} scored, ${inserted} inserted (≥${minScore}), ${skipped} below threshold, ${duplicates} duplicates. Credits: ${getCreditsUsedToday()}/${DAILY_CREDIT_CAP} today.`;
  console.log(`[ApolloMiner] ${summary}`);

  return {
    list: listType,
    listName: config.name,
    mined, scored, inserted, skipped, duplicates,
    creditsUsedToday: getCreditsUsedToday(),
    creditsRemaining: DAILY_CREDIT_CAP - getCreditsUsedToday(),
    topLeads: topLeads.slice(0, 10),
    summary,
  };
}

// ── ERP Detection (reused from apolloEnricher) ─────────────────────────────

function detectErp(technologies) {
  if (!technologies || !Array.isArray(technologies)) return 'Unknown';
  const techStr = technologies.map(t => t.toLowerCase()).join(' ');
  if (/quickbooks|qb/.test(techStr)) return 'QuickBooks';
  if (/sage.?300|sage.?100/.test(techStr)) return 'Sage300';
  if (/vista/.test(techStr)) return 'Vista';
  if (/netsuite/.test(techStr)) return 'NetSuite';
  if (/dynamics/.test(techStr)) return 'Dynamics';
  if (/sap/.test(techStr)) return 'SAP';
  if (/xero/.test(techStr)) return 'Xero';
  return 'Unknown';
}

// ── Get credit status ──────────────────────────────────────────────────────

function getCreditStatus() {
  return {
    usedToday: getCreditsUsedToday(),
    dailyCap: DAILY_CREDIT_CAP,
    remaining: DAILY_CREDIT_CAP - getCreditsUsedToday(),
    configured: !!APOLLO_API_KEY,
  };
}

// ── Learning from outcomes — adjust scoring weights ─────────────────────────

/**
 * Analyze which lead characteristics correlate with replies/meetings.
 * Returns adjusted weights based on actual conversion data.
 * Call weekly to recalibrate scoring.
 */
function learnFromOutcomes() {
  try {
    // What do leads that replied have in common?
    const winners = all(`
      SELECT employee_count, erp_type, contact_title, city, state, pilot_fit_score, notes
      FROM cfo_leads
      WHERE status IN ('replied', 'meeting_booked', 'pilot', 'closed_won')
        AND source_agent = 'jake'
      LIMIT 100
    `);

    if (winners.length < 5) {
      return { learned: false, message: 'Not enough winners to learn from (need 5+)', winners: winners.length };
    }

    // Analyze patterns
    const patterns = {
      avgScore: 0,
      avgEmployees: 0,
      erpDistribution: {},
      titleDistribution: {},
      stateDistribution: {},
    };

    for (const w of winners) {
      patterns.avgScore += w.pilot_fit_score || 0;
      patterns.avgEmployees += w.employee_count || 0;
      const erp = w.erp_type || 'Unknown';
      patterns.erpDistribution[erp] = (patterns.erpDistribution[erp] || 0) + 1;
      const title = (w.contact_title || 'Unknown').toLowerCase();
      patterns.titleDistribution[title] = (patterns.titleDistribution[title] || 0) + 1;
      const state = w.state || 'Unknown';
      patterns.stateDistribution[state] = (patterns.stateDistribution[state] || 0) + 1;
    }

    patterns.avgScore = Math.round(patterns.avgScore / winners.length);
    patterns.avgEmployees = Math.round(patterns.avgEmployees / winners.length);

    // Write learning to brain as observation
    try {
      const brain = require('./collectiveBrain');
      brain.observe(`scout-learning-${new Date().toISOString().slice(0, 10)}`, 'scout', 'scoring_calibration', {
        subject: 'CRAP Score Calibration',
        content: `Winning lead profile: avg score ${patterns.avgScore}, avg ${patterns.avgEmployees} employees. Top ERPs: ${JSON.stringify(patterns.erpDistribution)}. Top states: ${JSON.stringify(patterns.stateDistribution)}.`,
        confidence: 1.0,
        metadata: patterns,
      });
    } catch {}

    return { learned: true, winners: winners.length, patterns };
  } catch (err) {
    return { learned: false, message: err.message, winners: 0 };
  }
}

module.exports = { mineAndScore, getCreditStatus, LIST_CONFIGS, scoreLeadCRAP, learnFromOutcomes };
