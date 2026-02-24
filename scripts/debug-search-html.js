/**
 * Dump the raw text of each search result to understand the format
 */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  const query = 'Castle Group Miami';
  console.log(`Searching: "${query}"\n`);
  await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(query)}`, { timeout: 30000 });
  await page.waitForTimeout(4000);

  // Get raw text of first 3 results
  const results = await page.evaluate(() => {
    const items = [];
    const feed = document.querySelector('[role="feed"]');
    if (!feed) return items;

    const divs = feed.querySelectorAll(':scope > div');
    for (let i = 0; i < Math.min(divs.length, 3); i++) {
      const div = divs[i];
      const nameLink = div.querySelector('a[aria-label]');
      if (!nameLink) continue;

      // Get aria-labels from all elements
      const ariaLabels = [];
      div.querySelectorAll('[aria-label]').forEach(el => {
        ariaLabels.push({ tag: el.tagName, label: el.getAttribute('aria-label'), text: el.textContent.substring(0, 50) });
      });

      items.push({
        name: nameLink.getAttribute('aria-label'),
        rawText: div.textContent.substring(0, 300),
        ariaLabels,
      });
    }
    return items;
  });

  for (const r of results) {
    console.log(`=== ${r.name} ===`);
    console.log('Raw text:', r.rawText);
    console.log('Aria labels:');
    for (const a of r.ariaLabels) {
      console.log(`  <${a.tag}> aria-label="${a.label}" text="${a.text}"`);
    }
    console.log('');
  }

  await browser.close();
})().catch(e => console.error(e.message));
