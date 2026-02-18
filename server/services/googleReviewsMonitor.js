/**
 * @file googleReviewsMonitor.js
 * @description Agent 5: Google Reviews Signal Monitor
 *
 * Monitors Google Maps reviews for HOA capital need signals.
 * Cost: $0/month (public web scraping, no API)
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { scrapeHOAReviews } = require('./googleReviewsScraper');
const { scoreCommunity } = require('./reviewScorer');

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE CONNECTION (hoa_leads.sqlite)
// ═══════════════════════════════════════════════════════════════════════════

const DB_PATH = path.resolve('./hoa_leads.sqlite');
let db = null;

async function getHoaDb() {
  if (db) return db;
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(DB_PATH);
  db = new SQL.Database(fileBuffer);
  return db;
}

function saveHoaDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function runHoaDb(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  db.run(sql, params);
  saveHoaDb();
  return { changes: db.getRowsModified() };
}

function getHoaDbRow(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function allHoaDbRows(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// ═══════════════════════════════════════════════════════════════════════════
// MONITOR FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Monitor reviews for a single HOA
 */
async function monitorHOA(hoaId) {
  await getHoaDb();

  const hoa = getHoaDbRow('SELECT * FROM hoa_communities WHERE id = ?', [hoaId]);
  if (!hoa) {
    throw new Error(`HOA with ID ${hoaId} not found`);
  }

  console.log(`[Google Reviews] 🔍 Monitoring: ${hoa.name}, ${hoa.city}, ${hoa.state}`);

  try {
    // Determine if this is first scrape
    const isFirstScrape = !hoa.google_last_reviewed_at;

    // Scrape reviews
    const scrapeResult = await scrapeHOAReviews(hoa, {
      maxReviews: 50,
      isFirstScrape
    });

    if (!scrapeResult.success) {
      throw new Error(scrapeResult.error || 'Scraping failed');
    }

    // Score reviews
    const scoreResult = scoreCommunity(scrapeResult.reviews);

    console.log(`[Google Reviews]    Reviews: ${scoreResult.total_reviews}`);
    console.log(`[Google Reviews]    Signals: ${scoreResult.signal_review_count}`);
    console.log(`[Google Reviews]    Score: ${scoreResult.community_signal_score} / 100`);
    console.log(`[Google Reviews]    Tier: ${scoreResult.signal_tier}`);

    // Save reviews to database
    let savedCount = 0;
    for (const review of scoreResult.scored_reviews) {
      const reviewId = `${hoaId}_${review.google_review_id || Date.now() + Math.random()}`;

      try {
        runHoaDb(`
          INSERT OR REPLACE INTO hoa_reviews (
            id, hoa_id, google_review_id, reviewer_name,
            star_rating, review_text, review_date,
            raw_score, weighted_score,
            tier1_hits, tier2_hits, tier3_hits, negative_hits,
            is_signal, signal_strength,
            scraped_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `, [
          reviewId,
          hoaId,
          review.google_review_id,
          review.reviewer_name,
          review.star_rating,
          review.review_text,
          review.review_date,
          review.raw_score,
          review.weighted_score,
          review.tier1_hits,
          review.tier2_hits,
          review.tier3_hits,
          review.negative_hits,
          review.is_signal,
          review.signal_strength
        ]);
        savedCount++;
      } catch (e) {
        // Skip duplicates
      }
    }

    // Update HOA community record
    const previousTier = hoa.google_signal_tier || 'COLD';
    const tierChanged = previousTier !== scoreResult.signal_tier;

    runHoaDb(`
      UPDATE hoa_communities
      SET google_signal_score = ?,
          google_signal_tier = ?,
          google_signal_keywords = ?,
          total_google_reviews = ?,
          signal_review_count = ?,
          avg_star_rating = ?,
          google_last_reviewed_at = datetime('now'),
          google_maps_url = ?
      WHERE id = ?
    `, [
      scoreResult.community_signal_score,
      scoreResult.signal_tier,
      JSON.stringify(scoreResult.top_keywords),
      scoreResult.total_reviews,
      scoreResult.signal_review_count,
      scoreResult.avg_star_rating,
      scrapeResult.maps_url || hoa.google_maps_url,
      hoaId
    ]);

    console.log(`[Google Reviews]    ✅ Saved ${savedCount} reviews`);

    if (tierChanged) {
      console.log(`[Google Reviews]    🔥 TIER CHANGE: ${previousTier} → ${scoreResult.signal_tier}`);
    }

    return {
      success: true,
      hoa_name: hoa.name,
      reviews_scraped: scrapeResult.reviews.length,
      reviews_saved: savedCount,
      signal_reviews: scoreResult.signal_review_count,
      score: scoreResult.community_signal_score,
      tier: scoreResult.signal_tier,
      tier_changed: tierChanged,
      previous_tier: previousTier,
      top_keywords: scoreResult.top_keywords
    };

  } catch (error) {
    console.error(`[Google Reviews]    ❌ Error: ${error.message}`);
    throw error;
  }
}

/**
 * Monitor multiple HOAs (batch operation)
 */
async function monitorMultipleHOAs(params) {
  const { limit = 10, tier = null } = params;

  console.log('\n🔍 GOOGLE REVIEWS MONITOR - STARTING');
  console.log('='.repeat(60));
  console.log(`Limit: ${limit}`);
  if (tier) console.log(`Tier filter: ${tier}`);
  console.log('');

  try {
    await getHoaDb();

    // Find HOAs to monitor (prioritize oldest last_reviewed_at)
    let query = `
      SELECT id FROM hoa_communities
      WHERE status = 'active'
      ${tier ? 'AND google_signal_tier = ?' : ''}
      ORDER BY
        CASE WHEN google_last_reviewed_at IS NULL THEN 0 ELSE 1 END,
        google_last_reviewed_at ASC
      LIMIT ?
    `;

    const queryParams = tier ? [tier, limit] : [limit];
    const hoasToMonitor = allHoaDbRows(query, queryParams);

    console.log(`[Google Reviews] Found ${hoasToMonitor.length} HOAs to monitor`);
    console.log('');

    const results = [];
    let successCount = 0;
    let failedCount = 0;
    let tierUpgrades = 0;

    for (const hoa of hoasToMonitor) {
      try {
        const result = await monitorHOA(hoa.id);
        results.push(result);
        successCount++;

        if (result.tier_changed && (result.tier === 'HOT' || result.tier === 'WARM')) {
          tierUpgrades++;
        }
      } catch (error) {
        console.error(`[Google Reviews]   ❌ Failed: ${error.message}`);
        failedCount++;
      }
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('✅ MONITORING COMPLETE');
    console.log('='.repeat(60));
    console.log(`Total monitored: ${hoasToMonitor.length}`);
    console.log(`Success: ${successCount}`);
    console.log(`Failed: ${failedCount}`);
    console.log(`Tier upgrades: ${tierUpgrades}`);
    console.log('');

    return {
      success: true,
      monitored_count: hoasToMonitor.length,
      success_count: successCount,
      failed_count: failedCount,
      tier_upgrades: tierUpgrades,
      results,
    };

  } catch (error) {
    console.error('');
    console.error('❌ MONITORING FAILED');
    console.error('Error:', error.message);
    console.error('');

    return {
      success: false,
      error: error.message,
      monitored_count: 0,
      success_count: 0,
      failed_count: 0,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  monitorHOA,
  monitorMultipleHOAs,
};
