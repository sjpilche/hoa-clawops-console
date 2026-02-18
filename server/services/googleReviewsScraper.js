/**
 * @file googleReviewsScraper.js
 * @description Playwright-based Google Maps reviews scraper
 *
 * Scrapes HOA reviews from Google Maps (public data, no API).
 * Cost: $0 (browser automation, no rate limits)
 */

const { chromium } = require('playwright');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
  headless: true,  // Set to false for debugging
  timeout: 30000,  // 30 seconds
  scrollWait: 800,  // ms between scrolls
  expandWait: 300,  // ms after clicking "More"
  maxReviews: 50,   // Max reviews per HOA (known HOAs)
  maxReviewsNew: 200,  // Max reviews for first scrape
  maxScrollAttempts: 10,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
};

// ═══════════════════════════════════════════════════════════════════════════
// SCRAPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Scrape reviews for a single HOA community
 */
async function scrapeHOAReviews(hoa, options = {}) {
  const {
    maxReviews = CONFIG.maxReviews,
    isFirstScrape = false
  } = options;

  const limit = isFirstScrape ? CONFIG.maxReviewsNew : maxReviews;

  console.log(`[Scraper] 🔍 Scraping: ${hoa.name}, ${hoa.city}, ${hoa.state}`);
  console.log(`[Scraper]    Limit: ${limit} reviews`);

  let browser;
  try {
    // Launch browser
    browser = await chromium.launch({
      headless: CONFIG.headless,
      args: ['--disable-blink-features=AutomationControlled']
    });

    const context = await browser.newContext({
      userAgent: CONFIG.userAgent,
      viewport: { width: 1920, height: 1080 }
    });

    const page = await context.newPage();

    // Navigate to Google Maps
    let mapsUrl = hoa.google_maps_url;

    if (!mapsUrl) {
      // Search for HOA via direct URL
      const searchQuery = `${hoa.name} ${hoa.city} ${hoa.state}`;
      console.log(`[Scraper]    Searching: "${searchQuery}"`);

      // Use direct search URL instead of navigating and typing
      const encodedQuery = encodeURIComponent(searchQuery);
      const searchUrl = `https://www.google.com/maps/search/${encodedQuery}`;

      await page.goto(searchUrl, { timeout: CONFIG.timeout });
      await page.waitForTimeout(3000);

      // Check if we landed on search results (multiple listings) vs a single place
      mapsUrl = page.url();
      if (mapsUrl.includes('/search/') && !mapsUrl.includes('/place/')) {
        console.log(`[Scraper]    Search results page — clicking first result...`);
        try {
          // Click the first result in the feed
          const firstResult = page.locator('[role="feed"] > div a[aria-label]').first();
          if (await firstResult.isVisible({ timeout: 3000 })) {
            await firstResult.click();
            await page.waitForTimeout(3000);
            mapsUrl = page.url();
            console.log(`[Scraper]    Clicked into: ${mapsUrl.substring(0, 80)}...`);
          }
        } catch (e) {
          console.log(`[Scraper]    Could not click first result: ${e.message}`);
        }
      }

      console.log(`[Scraper]    Found URL: ${mapsUrl.substring(0, 60)}...`);
    } else {
      // Navigate directly to stored URL
      console.log(`[Scraper]    Using stored URL`);
      await page.goto(mapsUrl, { timeout: CONFIG.timeout });
      await page.waitForTimeout(2000);
    }

    // Extract listing metadata
    const metadata = await extractMetadata(page);
    console.log(`[Scraper]    Reviews found: ${metadata.total_reviews}`);

    if (metadata.total_reviews === 0) {
      console.log(`[Scraper]    ⚠️  No reviews available`);
      await browser.close();
      return {
        success: true,
        reviews: [],
        metadata,
        maps_url: mapsUrl
      };
    }

    // Click Reviews tab and sort by Newest
    await openReviewsTab(page);
    await sortByNewest(page);

    // Scrape reviews
    const reviews = await scrapeReviews(page, limit);
    console.log(`[Scraper]    ✅ Scraped ${reviews.length} reviews`);

    await browser.close();

    return {
      success: true,
      reviews,
      metadata,
      maps_url: mapsUrl
    };

  } catch (error) {
    console.error(`[Scraper]    ❌ Error: ${error.message}`);

    if (browser) {
      await browser.close();
    }

    return {
      success: false,
      error: error.message,
      reviews: [],
      metadata: null,
      maps_url: null
    };
  }
}

/**
 * Extract metadata from Maps listing
 */
async function extractMetadata(page) {
  try {
    // Extract star rating
    let avgRating = 0;
    try {
      const ratingText = await page.textContent('[role="img"][aria-label*="stars"]', { timeout: 5000 });
      const match = ratingText.match(/(\d+\.\d+)\s+stars/);
      if (match) {
        avgRating = parseFloat(match[1]);
      }
    } catch (e) {
      // No rating found
    }

    // Extract total reviews count
    let totalReviews = 0;
    try {
      const reviewsText = await page.textContent('button[aria-label*="reviews"]', { timeout: 5000 });
      const match = reviewsText.match(/(\d+[\d,]*)\s+reviews?/);
      if (match) {
        totalReviews = parseInt(match[1].replace(/,/g, ''));
      }
    } catch (e) {
      // No reviews found
    }

    // Extract Place ID from URL
    let placeId = null;
    const url = page.url();
    const placeMatch = url.match(/!1s([^!]+)/);
    if (placeMatch) {
      placeId = placeMatch[1];
    }

    return {
      avg_rating: avgRating,
      total_reviews: totalReviews,
      place_id: placeId
    };

  } catch (error) {
    console.error(`[Scraper]    ⚠️  Metadata extraction failed: ${error.message}`);
    return {
      avg_rating: 0,
      total_reviews: 0,
      place_id: null
    };
  }
}

/**
 * Open Reviews tab
 */
async function openReviewsTab(page) {
  try {
    // Look for Reviews button
    await page.click('button[aria-label*="Reviews"]', { timeout: 5000 });
    await page.waitForTimeout(2000);
    console.log(`[Scraper]    ✅ Opened Reviews tab`);
  } catch (error) {
    console.log(`[Scraper]    ⚠️  Could not find Reviews tab (may already be open)`);
  }
}

/**
 * Sort reviews by Newest
 */
async function sortByNewest(page) {
  try {
    // Find and click Sort button
    const sortButton = await page.locator('button[aria-label*="Sort"]').first();
    if (await sortButton.isVisible()) {
      await sortButton.click();
      await page.waitForTimeout(1000);

      // Click "Newest" option
      await page.click('div[role="menuitem"]:has-text("Newest")', { timeout: 3000 });
      await page.waitForTimeout(2000);
      console.log(`[Scraper]    ✅ Sorted by Newest`);
    }
  } catch (error) {
    console.log(`[Scraper]    ⚠️  Could not change sort (${error.message})`);
  }
}

/**
 * Scrape reviews with pagination
 */
async function scrapeReviews(page, maxReviews) {
  const reviews = [];
  const seenIds = new Set();
  let scrollAttempts = 0;
  let lastCount = 0;

  while (reviews.length < maxReviews && scrollAttempts < CONFIG.maxScrollAttempts) {
    // Get all review elements currently visible
    const reviewElements = await page.locator('[data-review-id]').all();

    console.log(`[Scraper]    Processing ${reviewElements.length} review elements...`);

    for (const element of reviewElements) {
      if (reviews.length >= maxReviews) break;

      try {
        // Extract review ID
        const reviewId = await element.getAttribute('data-review-id');
        if (!reviewId || seenIds.has(reviewId)) continue;
        seenIds.add(reviewId);

        // Expand "More" button if present
        try {
          const moreButton = element.locator('button:has-text("More")').first();
          if (await moreButton.isVisible({ timeout: 500 })) {
            await moreButton.click();
            await page.waitForTimeout(CONFIG.expandWait);
          }
        } catch (e) {
          // No "More" button
        }

        // Extract review data
        const reviewData = await extractReviewData(element, reviewId);
        if (reviewData) {
          reviews.push(reviewData);
        }

      } catch (error) {
        console.log(`[Scraper]    ⚠️  Skipped review: ${error.message}`);
      }
    }

    // Check if we got new reviews
    if (reviews.length === lastCount) {
      scrollAttempts++;
    } else {
      scrollAttempts = 0;  // Reset if we got new reviews
      lastCount = reviews.length;
    }

    // Scroll to load more
    if (reviews.length < maxReviews) {
      try {
        // Scroll the reviews container
        await page.evaluate(() => {
          const scrollable = document.querySelector('[role="feed"]') ||
                            document.querySelector('div[tabindex="-1"]');
          if (scrollable) {
            scrollable.scrollTop = scrollable.scrollHeight;
          }
        });
        await page.waitForTimeout(CONFIG.scrollWait);
      } catch (e) {
        console.log(`[Scraper]    ⚠️  Could not scroll: ${e.message}`);
        break;
      }
    }
  }

  return reviews;
}

/**
 * Extract data from a single review element
 */
async function extractReviewData(element, reviewId) {
  try {
    // Reviewer name
    let reviewerName = 'Anonymous';
    try {
      reviewerName = await element.locator('[aria-label*="Photo of"]').getAttribute('aria-label');
      reviewerName = reviewerName.replace('Photo of ', '').trim();
    } catch (e) {
      // Try alternate selector
      try {
        reviewerName = await element.locator('button[aria-label*="reviews by"]').textContent();
      } catch (e2) {
        // Keep default
      }
    }

    // Star rating
    let starRating = 0;
    try {
      const ratingLabel = await element.locator('[role="img"][aria-label*="stars"]').first().getAttribute('aria-label');
      const match = ratingLabel.match(/(\d+)\s+stars?/);
      if (match) {
        starRating = parseInt(match[1]);
      }
    } catch (e) {
      // No rating found
    }

    // Review text
    let reviewText = '';
    try {
      reviewText = await element.locator('span[data-expandable-section]').textContent();
      reviewText = reviewText.trim();
    } catch (e) {
      // Try alternate selector
      try {
        reviewText = await element.locator('[jslog*="review"]').textContent();
        reviewText = reviewText.trim();
      } catch (e2) {
        // No text
      }
    }

    // Review date
    let reviewDate = '';
    try {
      reviewDate = await element.locator('span[aria-label*="ago"]').textContent();
      reviewDate = reviewDate.trim();
    } catch (e) {
      // Try alternate selector
      try {
        const spans = await element.locator('span').all();
        for (const span of spans) {
          const text = await span.textContent();
          if (text && (text.includes('ago') || text.match(/\w+ \d{4}/))) {
            reviewDate = text.trim();
            break;
          }
        }
      } catch (e2) {
        // No date
      }
    }

    // Only return if we have meaningful data
    if (!reviewText && starRating === 0) {
      return null;
    }

    return {
      google_review_id: reviewId,
      reviewer_name: reviewerName,
      star_rating: starRating,
      review_text: reviewText,
      review_date: reviewDate
    };

  } catch (error) {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  scrapeHOAReviews,
  CONFIG
};
