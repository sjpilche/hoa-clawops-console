/**
 * Click into Castle Group Miami and inspect the listing page for review elements
 */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  await page.goto('https://www.google.com/maps/search/Castle%20Group%20Miami', { timeout: 30000 });
  await page.waitForTimeout(4000);

  // Click first result
  const first = page.locator('[role="feed"] > div a[aria-label="Castle Group"]').first();
  await first.click();
  await page.waitForTimeout(4000);

  console.log('URL:', page.url().substring(0, 100));

  // Dump all button texts and aria-labels
  const elements = await page.evaluate(() => {
    const items = [];
    // All buttons
    document.querySelectorAll('button').forEach(btn => {
      const label = btn.getAttribute('aria-label') || '';
      const text = btn.textContent.substring(0, 60);
      if (label.includes('review') || label.includes('Review') || text.includes('review') || text.includes('Review')) {
        items.push({ type: 'button', label, text });
      }
    });
    // All spans with aria-label
    document.querySelectorAll('span[aria-label]').forEach(span => {
      const label = span.getAttribute('aria-label') || '';
      if (label.includes('star') || label.includes('review')) {
        items.push({ type: 'span', label, text: span.textContent.substring(0, 60) });
      }
    });
    // All role=img with star labels
    document.querySelectorAll('[role="img"]').forEach(el => {
      const label = el.getAttribute('aria-label') || '';
      if (label.includes('star') || label.includes('review')) {
        items.push({ type: 'role-img', label, text: el.textContent.substring(0, 60) });
      }
    });
    // Tabs
    document.querySelectorAll('[role="tab"]').forEach(tab => {
      items.push({ type: 'tab', label: tab.getAttribute('aria-label') || '', text: tab.textContent.substring(0, 60) });
    });
    return items;
  });

  console.log('\nReview-related elements:');
  for (const el of elements) {
    console.log(`  [${el.type}] aria-label="${el.label}" text="${el.text}"`);
  }

  // Also check for "Reviews" tab
  const tabs = await page.locator('[role="tab"]').allTextContents();
  console.log('\nTabs:', tabs);

  await browser.close();
})().catch(e => console.error(e.message));
