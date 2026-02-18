/**
 * @file mgmtReviewScanner.js
 * @description Agent 39: Management Company Review Scanner — THE MONEY AGENT
 *
 * Scans Google Maps reviews for management companies to identify struggling
 * HOA communities with deferred maintenance, special assessments, or
 * management failure signals.
 *
 * Reuses googleReviewsScraper.js for Playwright-based review extraction.
 * Signal analysis is pure JS keyword matching — $0, no LLM calls.
 *
 * Cost: $0 — Playwright + deterministic keyword scoring
 * Schedule: Daily 4am (batch of companies)
 */

const { v4: uuidv4 } = require('uuid');
const { run, get, all } = require('../db/connection');
const { scrapeHOAReviews } = require('./googleReviewsScraper');
const azure = require('./mgmtAzureSync');
const {
  scoreReviewSignals,
  extractCommunityMentions,
  classifyUrgency,
  determinePrimaryIssue,
  classifyCompanyHealth,
  sleep,
} = require('./mgmtCompanyUtils');

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run review scanning for a management company.
 * @param {Object} params
 * @param {string} params.company_name
 * @param {string} [params.company_url]
 * @param {string} [params.mgmt_company_id]
 * @param {number} [params.min_signal_score] - Minimum score to flag (default: 5)
 * @param {number} [params.max_reviews] - Max reviews to scrape (default: 100)
 */
async function runReviewScanner(params = {}) {
  const {
    company_name,
    company_url,
    mgmt_company_id,
    min_signal_score = 5,
    max_reviews = 100,
  } = params;

  if (!company_name) {
    throw new Error('company_name is required');
  }

  const runId = uuidv4();
  const startTime = Date.now();

  console.log(`[Agent 39] Starting review scan: ${company_name}`);
  console.log(`[Agent 39] Min signal score: ${min_signal_score}, max reviews: ${max_reviews}`);

  // Azure SQL — ensure tables + create run record (non-fatal)
  await azure.ensureTables();
  const azureRunId = await azure.azureCreateRun('mgmt_review_scanner', company_name);

  // Step 1: Scrape Google Maps reviews using existing scraper
  // National companies have local offices — search with state to find relevant listing.
  // Try multiple search strategies to find the best listing with reviews.
  const companyState = params.state || '';
  const searchStrategies = [
    { name: company_name, city: '', state: companyState },              // "Associa FL"
    { name: `${company_name} management`, city: '', state: companyState }, // "Associa management FL"
    { name: company_name, city: '', state: '' },                        // "Associa" (national)
  ];

  let scrapeResult = { reviews: [], metadata: null };
  for (const searchObj of searchStrategies) {
    console.log(`[Agent 39] Trying search: "${searchObj.name}" ${searchObj.state}`);
    const attempt = await scrapeHOAReviews(searchObj, {
      maxReviews: max_reviews,
      isFirstScrape: true,
    });
    if (attempt.reviews && attempt.reviews.length > (scrapeResult.reviews?.length || 0)) {
      scrapeResult = attempt;
      console.log(`[Agent 39] Found ${attempt.reviews.length} reviews with strategy: "${searchObj.name}" ${searchObj.state}`);
    }
    if (scrapeResult.reviews.length > 0) break; // Use first strategy that returns reviews
    await sleep(2000); // Rate limit between attempts
  }

  const googleRating = scrapeResult.metadata?.avg_rating || 0;
  const totalReviews = scrapeResult.metadata?.total_reviews || 0;
  const reviews = scrapeResult.reviews || [];

  console.log(`[Agent 39] Scraped ${reviews.length} reviews (${totalReviews} total, ${googleRating} stars)`);

  // Step 2: Analyze each review for signals
  const signalReviews = [];
  let switchingSignals = 0;

  for (const review of reviews) {
    const text = review.review_text || '';
    if (!text || text.length < 10) continue;

    // Score signals
    const signals = scoreReviewSignals(text);

    // Check for switching signals
    if (signals.switching.length > 0) {
      switchingSignals += signals.switching.length;
    }

    // Skip low-signal reviews
    if (signals.signal_score < min_signal_score) continue;

    // Extract community mentions
    const communities = extractCommunityMentions(text);
    const urgency = classifyUrgency(signals, review.star_rating);
    const primaryIssue = determinePrimaryIssue(signals);

    signalReviews.push({
      review,
      signals,
      communities,
      urgency,
      primaryIssue,
    });
  }

  console.log(`[Agent 39] Signal reviews: ${signalReviews.length} (from ${reviews.length} total)`);

  // Step 3: Save signal reviews to database
  for (const sr of signalReviews) {
    const communityName = sr.communities.length > 0 ? sr.communities[0] : null;
    let communityCity = null;
    let communityState = null;
    let hoaCommunityId = null;

    // Try to link to existing community
    if (communityName) {
      const hoa = get(
        `SELECT id, city, state FROM hoa_communities WHERE name LIKE ? LIMIT 1`,
        [`%${communityName}%`]
      );
      if (hoa) {
        hoaCommunityId = hoa.id;
        communityCity = hoa.city;
        communityState = hoa.state;
      }
    }

    run(`
      INSERT INTO review_signals (
        mgmt_company_id, mgmt_company_name, review_source,
        reviewer_name, review_date, star_rating, review_text, source_url,
        community_mentioned, community_city, community_state, hoa_community_id,
        tier1_signals, tier2_signals, tier3_signals, tier4_signals,
        signal_score, primary_issue, urgency, scan_run_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      mgmt_company_id || null,
      company_name,
      'google',
      sr.review.reviewer_name || null,
      sr.review.review_date || null,
      sr.review.star_rating || null,
      sr.review.review_text || '',
      scrapeResult.maps_url || null,
      communityName,
      communityCity,
      communityState,
      hoaCommunityId,
      JSON.stringify(sr.signals.tier1),
      JSON.stringify(sr.signals.tier2),
      JSON.stringify(sr.signals.tier3),
      JSON.stringify(sr.signals.tier4),
      sr.signals.signal_score,
      sr.primaryIssue,
      sr.urgency,
      runId,
    ]);

    // Azure sync — fire-and-forget
    azure.azureWriteSignal({
      mgmt_company_id: mgmt_company_id || null,
      mgmt_company_name: company_name,
      review_source: 'google',
      reviewer_name: sr.review.reviewer_name || null,
      star_rating: sr.review.star_rating || null,
      review_text: sr.review.review_text || '',
      community_mentioned: communityName,
      community_city: communityCity,
      community_state: communityState,
      signal_score: sr.signals.signal_score,
      primary_issue: sr.primaryIssue,
      urgency: sr.urgency,
      scan_run_id: runId,
    }).catch(() => {});
  }

  // Step 4: Try to link unlinked signals to existing communities
  linkUnlinkedSignals();

  // Step 5: Count hot leads
  const hotLeads = signalReviews.filter(sr => sr.urgency === 'critical' || sr.urgency === 'high').length;
  const criticalCount = signalReviews.filter(sr => sr.urgency === 'critical').length;

  // Step 6: Determine company health
  const companyHealth = classifyCompanyHealth({
    google_rating: googleRating,
    bbb_rating: null,
    switching_signals: switchingSignals,
  });

  // Step 7: Update management company record
  if (mgmt_company_id) {
    run(`
      UPDATE management_companies SET
        reviews_scanned = 1,
        google_rating = ?,
        google_review_count = ?,
        company_health = ?,
        switching_signals = ?,
        last_review_scan = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      googleRating || null,
      totalReviews || null,
      companyHealth,
      switchingSignals,
      mgmt_company_id,
    ]);

    // Azure sync — update pipeline flags
    azure.azureUpdateCompanyPipeline(mgmt_company_id, {
      reviews_scanned: true,
      google_rating: googleRating,
      google_review_count: totalReviews,
      company_health: companyHealth,
      switching_signals: switchingSignals,
    }).catch(() => {});
  }

  const duration = Math.round((Date.now() - startTime) / 1000);

  const summary = {
    run_id: runId,
    company_name,
    reviews_scraped: reviews.length,
    total_google_reviews: totalReviews,
    google_rating: googleRating,
    signal_reviews: signalReviews.length,
    hot_leads: hotLeads,
    critical_issues: criticalCount,
    switching_signals: switchingSignals,
    company_health: companyHealth,
    duration_seconds: duration,
    cost_usd: 0,
  };

  console.log(`[Agent 39] COMPLETE — ${reviews.length} reviewed, ${signalReviews.length} signals, ${hotLeads} hot leads, health: ${companyHealth}, ${duration}s`);

  // Azure SQL — complete run + close pool
  await azure.azureCompleteRun(azureRunId, { signal_reviews: signalReviews.length, results_found: reviews.length, new_records: hotLeads });
  await azure.closePool();

  return summary;
}

// ═══════════════════════════════════════════════════════════════════════════
// BATCH SCANNING (for scheduled runs)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Scan a batch of companies (for daily scheduled run).
 * Picks companies that haven't been scanned or were scanned longest ago.
 * @param {Object} params
 * @param {number} [params.batch_size] - Number of companies to scan (default: 5)
 */
async function runReviewScannerBatch(params = {}) {
  const batchSize = params.batch_size || 5;

  console.log(`[Agent 39] Starting batch scan (batch size: ${batchSize})`);

  // Get companies to scan (prioritize unscanned, then oldest scan)
  const companies = all(`
    SELECT id, name, website_url, website
    FROM management_companies
    WHERE reviews_scanned = 0
    ORDER BY
      CASE priority_tier
        WHEN 'AAMC_TOP' THEN 1
        WHEN 'DESIGNATED' THEN 2
        WHEN 'MEMBER' THEN 3
        ELSE 4
      END,
      communities_managed DESC
    LIMIT ?
  `, [batchSize]);

  if (companies.length === 0) {
    // All scanned — rescan oldest
    const oldest = all(`
      SELECT id, name, website_url, website
      FROM management_companies
      ORDER BY last_review_scan ASC NULLS FIRST
      LIMIT ?
    `, [batchSize]);
    companies.push(...oldest);
  }

  console.log(`[Agent 39] Batch: ${companies.length} companies to scan`);

  const batchResults = [];
  for (const company of companies) {
    try {
      const result = await runReviewScanner({
        company_name: company.name,
        company_url: company.website_url || company.website,
        mgmt_company_id: company.id,
      });
      batchResults.push({ company: company.name, ...result });
    } catch (err) {
      console.error(`[Agent 39] Error scanning ${company.name}: ${err.message}`);
      batchResults.push({ company: company.name, error: err.message });
    }

    // Rate limit between companies
    if (companies.indexOf(company) < companies.length - 1) {
      await sleep(5000);
    }
  }

  return {
    batch_size: batchResults.length,
    results: batchResults,
    total_signals: batchResults.reduce((sum, r) => sum + (r.signal_reviews || 0), 0),
    total_hot_leads: batchResults.reduce((sum, r) => sum + (r.hot_leads || 0), 0),
    cost_usd: 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMUNITY LINKING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Try to link unlinked review signals to existing hoa_communities records.
 */
function linkUnlinkedSignals() {
  const unlinked = all(`
    SELECT id, community_mentioned, community_city, community_state
    FROM review_signals
    WHERE hoa_community_id IS NULL AND community_mentioned IS NOT NULL
  `);

  for (const signal of unlinked) {
    // Try exact name match
    let hoa = get(
      `SELECT id FROM hoa_communities WHERE name LIKE ? AND (state = ? OR ? IS NULL) LIMIT 1`,
      [`%${signal.community_mentioned}%`, signal.community_state, signal.community_state]
    );

    if (hoa) {
      run('UPDATE review_signals SET hoa_community_id = ? WHERE id = ?', [hoa.id, signal.id]);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = { runReviewScanner, runReviewScannerBatch };
