/**
 * Click into a management company listing to see if it has reviews
 */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  // Try FirstService Residential (the 2.0 star one - likely has angry reviews)
  console.log('Searching: "FirstService Residential Fort Lauderdale"');
  await page.goto('https://www.google.com/maps/search/FirstService%20Residential%20Fort%20Lauderdale', { timeout: 30000 });
  await page.waitForTimeout(4000);

  // Click the 2.0 star listing (second result)
  const results = page.locator('[role="feed"] > div a[aria-label]');
  const count = await results.count();
  console.log(`Search results: ${count}`);

  for (let i = 0; i < count; i++) {
    const label = await results.nth(i).getAttribute('aria-label');
    console.log(`  [${i}] ${label}`);
  }

  // Click the last FirstService result (the 2.0 star one)
  const target = page.locator('a[aria-label="FirstService Residential"]').last();
  console.log('\nClicking into listing...');
  await target.click();
  await page.waitForTimeout(4000);

  console.log('URL:', page.url().substring(0, 100));

  // Check ALL tabs
  const tabs = await page.locator('[role="tab"]').allTextContents();
  console.log('Tabs:', tabs);

  // Find reviews-related button text
  const allButtons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button'))
      .filter(b => b.textContent.match(/review/i))
      .map(b => ({ text: b.textContent.substring(0, 60), label: b.getAttribute('aria-label') }));
  });
  console.log('Review buttons:', allButtons);

  // Check for reviews tab specifically
  if (tabs.some(t => t.toLowerCase().includes('review'))) {
    console.log('\n*** HAS REVIEWS TAB! ***');
    const reviewTab = page.locator('[role="tab"]:has-text("Reviews")');
    await reviewTab.click();
    await page.waitForTimeout(2000);

    // Count review elements
    const reviewEls = await page.evaluate(() => {
      const revs = document.querySelectorAll('[data-review-id]');
      const texts = [];
      revs.forEach(r => {
        const text = r.querySelector('.wiI7pd')?.textContent || r.textContent.substring(0, 100);
        texts.push(text.substring(0, 80));
      });
      return texts;
    });
    console.log(`Reviews found: ${reviewEls.length}`);
    for (const rt of reviewEls.slice(0, 3)) {
      console.log(`  "${rt}"`);
    }
  } else {
    console.log('\nNo Reviews tab. Checking for review text in page...');
    // Some listings show reviews inline
    const pageText = await page.evaluate(() => {
      const main = document.querySelector('[role="main"]');
      return main ? main.textContent.substring(0, 2000) : '';
    });
    const hasReviewText = pageText.match(/(\d+)\s+reviews?/i);
    console.log('Review text match:', hasReviewText ? hasReviewText[0] : 'none');
  }

  await browser.close();
})().catch(e => console.error(e.message));
