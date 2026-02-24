/**
 * Debug — what does a Google Maps listing page look like for "Sentry Management FL"?
 */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  // Go to search results
  await page.goto('https://www.google.com/maps/search/Sentry%20Management%20FL', { timeout: 30000 });
  await page.waitForTimeout(3000);

  // Click first result
  const first = page.locator('[role="feed"] > div a[aria-label]').first();
  if (await first.isVisible({ timeout: 3000 })) {
    const label = await first.getAttribute('aria-label');
    console.log('Clicking:', label);
    await first.click();
    await page.waitForTimeout(3000);
  }

  console.log('URL:', page.url().substring(0, 100));

  // Debug: look for review-related elements
  const selectors = [
    '[role="img"][aria-label*="stars"]',
    '[role="img"][aria-label*="star"]',
    'button[aria-label*="reviews"]',
    'button[aria-label*="review"]',
    'button[jsaction*="reviews"]',
    'span[aria-label*="reviews"]',
    'span[aria-label*="stars"]',
    '.fontDisplayLarge',
    '.fontBodyMedium',
  ];

  for (const sel of selectors) {
    try {
      const count = await page.locator(sel).count();
      if (count > 0) {
        const text = await page.locator(sel).first().textContent({ timeout: 2000 });
        console.log(`  ${sel}: ${count} found — "${text}"`);
      }
    } catch (e) {
      // skip
    }
  }

  // Also look for the text that indicates reviews
  const bodyText = await page.evaluate(() => {
    const el = document.querySelector('[role="main"]');
    return el ? el.textContent.substring(0, 1000) : 'NO MAIN ROLE';
  });

  // Find review-count patterns
  const reviewMatch = bodyText.match(/(\d+[\d,]*)\s+reviews?/i);
  const starMatch = bodyText.match(/(\d+\.?\d*)\s*stars?/i);
  console.log('\nReview pattern match:', reviewMatch ? reviewMatch[0] : 'NOT FOUND');
  console.log('Star pattern match:', starMatch ? starMatch[0] : 'NOT FOUND');

  // Dump interesting text
  const lines = bodyText.split('\n').filter(l => l.includes('review') || l.includes('star') || l.includes('rating') || l.match(/\d+\.\d/));
  for (const line of lines.slice(0, 10)) {
    console.log('  >', line.trim().substring(0, 100));
  }

  await browser.close();
})().catch(e => console.error(e.message));
