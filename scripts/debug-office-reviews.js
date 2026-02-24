/**
 * Try searching for specific office locations that are more likely to have reviews
 */
const { chromium } = require('playwright');

const SEARCHES = [
  'Sentry Management Inc Orlando FL',
  'Castle Group Fort Lauderdale FL',
  'Associa community management Miami FL',
  'FirstService Residential Fort Lauderdale',
  'Leland Management Maitland FL',
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    viewport: { width: 1920, height: 1080 },
  });

  for (const query of SEARCHES) {
    console.log(`\n--- "${query}" ---`);
    const page = await context.newPage();
    await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(query)}`, { timeout: 30000 });
    await page.waitForTimeout(3000);

    const url = page.url();
    const isPlace = url.includes('/place/');

    if (isPlace) {
      console.log('  Landed on place listing directly');
      // Check tabs
      const tabs = await page.locator('[role="tab"]').allTextContents();
      console.log('  Tabs:', tabs);
      // Check star rating
      try {
        const stars = await page.locator('[role="img"][aria-label*="stars"]').first().textContent({ timeout: 2000 });
        console.log('  Stars:', stars);
      } catch(e) {}
      // Check review button
      try {
        const revBtn = await page.locator('button[aria-label*="reviews"]').first().textContent({ timeout: 2000 });
        console.log('  Review button:', revBtn);
      } catch(e) {
        console.log('  No review count button');
      }
    } else {
      // Search results — get feed items
      const results = await page.evaluate(() => {
        const items = [];
        const feed = document.querySelector('[role="feed"]');
        if (!feed) return items;
        feed.querySelectorAll(':scope > div').forEach(div => {
          const link = div.querySelector('a[aria-label]');
          if (!link) return;
          const starSpan = div.querySelector('span[aria-label*="stars"]');
          const text = div.textContent;
          // Look for (N) pattern after the star rating
          const reviewMatch = text.match(/stars?\s*(\d[\d,]*)\s/);
          items.push({
            name: link.getAttribute('aria-label'),
            stars: starSpan ? starSpan.getAttribute('aria-label') : 'none',
            reviewCountText: reviewMatch ? reviewMatch[1] : 'no count',
            snippet: text.substring(0, 120),
          });
        });
        return items;
      });

      console.log(`  ${results.length} results`);
      for (const r of results.slice(0, 3)) {
        console.log(`  ${r.name} | ${r.stars} | reviews: ${r.reviewCountText}`);
        console.log(`    "${r.snippet}"`);
      }
    }

    await page.close();
    await new Promise(r => setTimeout(r, 2000));
  }

  await browser.close();
})().catch(e => console.error(e.message));
