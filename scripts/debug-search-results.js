/**
 * Debug: Extract review data from Google Maps SEARCH RESULTS (not individual listings)
 * These companies show multiple branches in search results, each with ratings.
 */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  const query = 'Sentry Management FL';
  console.log(`Searching: "${query}"\n`);
  await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(query)}`, { timeout: 30000 });
  await page.waitForTimeout(4000);

  // Extract ALL results from the feed with their ratings and review counts
  const results = await page.evaluate(() => {
    const items = [];
    const feed = document.querySelector('[role="feed"]');
    if (!feed) return items;

    const divs = feed.querySelectorAll(':scope > div');
    for (const div of divs) {
      const nameLink = div.querySelector('a[aria-label]');
      if (!nameLink) continue;

      const name = nameLink.getAttribute('aria-label');
      const href = nameLink.getAttribute('href');

      // Get all text content
      const text = div.textContent;

      // Find rating — pattern: "3.8" near stars
      const ratingMatch = text.match(/(\d\.\d)\s*\(/);
      const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

      // Find review count — pattern: "(42)" or "(1,234)"
      const reviewMatch = text.match(/\((\d[\d,]*)\)/);
      const reviewCount = reviewMatch ? parseInt(reviewMatch[1].replace(/,/g, '')) : 0;

      // Get address text
      const addressMatch = text.match(/·\s*(.+?)(?:Closed|Open|$)/);

      items.push({
        name,
        href: href ? href.substring(0, 80) : '',
        rating,
        reviewCount,
        address: addressMatch ? addressMatch[1].trim().substring(0, 60) : '',
      });
    }
    return items;
  });

  console.log(`Found ${results.length} results:\n`);
  for (const r of results) {
    console.log(`  ${r.name}`);
    console.log(`    Rating: ${r.rating}, Reviews: ${r.reviewCount}`);
    console.log(`    Address: ${r.address}`);
    console.log(`    URL: ${r.href}`);
    console.log('');
  }

  // Now click the one with most reviews
  const bestResult = results.filter(r => r.reviewCount > 0).sort((a, b) => b.reviewCount - a.reviewCount)[0];
  if (bestResult) {
    console.log(`\nClicking best result: ${bestResult.name} (${bestResult.reviewCount} reviews)`);
    const link = page.locator(`a[aria-label="${bestResult.name}"]`).first();
    await link.click();
    await page.waitForTimeout(3000);

    console.log('URL:', page.url().substring(0, 100));

    // Try to find the reviews tab
    try {
      const reviewTab = page.locator('button[aria-label*="Reviews"]');
      if (await reviewTab.isVisible({ timeout: 3000 })) {
        const tabText = await reviewTab.textContent();
        console.log('Reviews tab:', tabText);
      }
    } catch(e) {
      console.log('No Reviews tab found');
    }
  } else {
    console.log('\nNo results with reviews found');
  }

  await browser.close();
})().catch(e => console.error(e.message));
