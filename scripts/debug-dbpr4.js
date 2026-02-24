'use strict';
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  // Step 1: Land on search form, pick "Search by License Type"
  await page.goto('https://www.myfloridalicense.com/wl11.asp', {
    waitUntil: 'domcontentloaded', timeout: 30000
  });
  await page.waitForTimeout(1500);

  await page.locator('input[value="LicTyp"]').click();
  await page.waitForTimeout(500);

  // Submit the search type selection
  await page.locator('button[name="SelectSearchType"]').click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  console.log('After step 1 - URL:', page.url());
  const body1 = await page.textContent('body');
  console.log('Body preview:', body1.substring(0, 500));

  // Check what selects are now available
  const selects1 = await page.evaluate(() => {
    const result = {};
    document.querySelectorAll('select').forEach(sel => {
      const opts = [];
      sel.querySelectorAll('option').forEach(opt => {
        opts.push({ value: opt.value, text: opt.textContent.trim().substring(0, 40) });
      });
      if (opts.length > 0) result[sel.name || sel.id || sel.className.substring(0,20) || 'unnamed'] = opts.slice(0, 50);
    });
    return result;
  });
  console.log('\nSelects at step 2:', JSON.stringify(selects1, null, 2));

  await browser.close();
})().catch(e => console.error('Error:', e.message));
