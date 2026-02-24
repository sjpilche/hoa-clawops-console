/**
 * Debug Google Maps search for management company reviews.
 * Tests what Google Maps actually returns for these company searches.
 */
const { chromium } = require('playwright');

const COMPANIES = [
  'Sentry Management FL',
  'Sentry Management Orlando',
  'Castle Group Miami',
  'Leland Management Orlando FL',
  'Associa',
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
  });

  for (const query of COMPANIES) {
    console.log(`\n--- Searching: "${query}" ---`);
    const page = await context.newPage();

    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    await page.goto(searchUrl, { timeout: 30000 });
    await page.waitForTimeout(3000);

    const url = page.url();
    console.log(`  URL: ${url.substring(0, 100)}`);

    // Check if we landed on a listing or search results
    const isListing = url.includes('/place/');
    const isSearch = url.includes('/search/');
    console.log(`  Type: ${isListing ? 'LISTING' : isSearch ? 'SEARCH RESULTS' : 'OTHER'}`);

    // Try to get rating
    try {
      const ratingEl = await page.locator('[role="img"][aria-label*="stars"]').first();
      const ratingText = await ratingEl.textContent({ timeout: 3000 });
      console.log(`  Rating: ${ratingText}`);
    } catch (e) {
      console.log(`  Rating: NOT FOUND`);
    }

    // Try to get review count
    try {
      const reviewBtn = await page.locator('button[aria-label*="reviews"]').first();
      const reviewText = await reviewBtn.textContent({ timeout: 3000 });
      console.log(`  Reviews: ${reviewText}`);
    } catch (e) {
      console.log(`  Reviews: NOT FOUND`);
    }

    // If search results, count results listed
    if (isSearch) {
      try {
        const results = await page.locator('[role="feed"] > div').count();
        console.log(`  Results count: ${results}`);

        // Get first 3 result names
        const names = await page.evaluate(() => {
          const items = document.querySelectorAll('[role="feed"] > div a[aria-label]');
          return Array.from(items).slice(0, 3).map(el => el.getAttribute('aria-label'));
        });
        for (const name of names) {
          console.log(`    - ${name}`);
        }
      } catch (e) {
        console.log(`  Could not extract results: ${e.message}`);
      }
    }

    await page.close();
  }

  await browser.close();
  console.log('\nDone!');
})().catch(e => console.error(e.message));
