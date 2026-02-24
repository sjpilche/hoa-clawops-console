'use strict';
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 ...' });
  const page = await context.newPage();

  await page.goto('https://www.myfloridalicense.com/wl11.asp', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.locator('input[value="LicTyp"]').click();
  await page.locator('button[name="SelectSearchType"]').click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);

  // Get ALL county options with their values
  const counties = await page.evaluate(() => {
    const sel = document.querySelector('select[name="County"]');
    const opts = [];
    sel.querySelectorAll('option').forEach(o => {
      if (o.value) opts.push({ value: o.value, name: o.textContent.trim() });
    });
    return opts;
  });

  console.log('ALL DBPR County Codes:');
  counties.forEach(c => console.log(`  ${c.value} = ${c.name}`));

  await browser.close();
})().catch(e => console.error(e.message));
