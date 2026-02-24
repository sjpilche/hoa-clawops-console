'use strict';
const { chromium } = require('playwright');

// County codes from DBPR
const COUNTIES = {
  'Hillsborough': '39', 'Pinellas': '61', 'Sarasota': '66', 'Manatee': '51',
  'Charlotte': '18', 'Lee': '46', 'Collier': '21', 'Orange': '58',
  'Osceola': '59', 'Polk': '62', 'Seminole': '67', 'Brevard': '15',
  'Dade': '23', 'Broward': '16', 'Palm Beach': '60',
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  // Step 1: Select "Search by License Type" and submit
  await page.goto('https://www.myfloridalicense.com/wl11.asp', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.locator('input[value="LicTyp"]').click();
  await page.locator('button[name="SelectSearchType"]').click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);
  console.log('Step 1 done. URL:', page.url());

  // Step 2: Select Board = "06" (Construction Industry), County = "39" (Hillsborough)
  await page.selectOption('select[name="Board"]', '06');
  await page.waitForTimeout(1000);

  // After selecting board, a license type dropdown should appear
  const licTypes = await page.evaluate(() => {
    const sel = document.querySelector('select[name="LicenseType"]');
    if (!sel) return 'NOT FOUND';
    const opts = [];
    sel.querySelectorAll('option').forEach(o => opts.push({ v: o.value, t: o.textContent.trim().substring(0,50) }));
    return opts;
  });
  console.log('License types:', JSON.stringify(licTypes, null, 2));

  // Also check all current selects
  const allSelects = await page.evaluate(() => {
    const r = {};
    document.querySelectorAll('select').forEach(s => {
      const opts = [];
      s.querySelectorAll('option').forEach(o => opts.push(o.value + '=' + o.textContent.trim().substring(0,30)));
      r[s.name || 'unnamed'] = opts.slice(0, 20);
    });
    return r;
  });
  console.log('\nAll selects after board selection:', JSON.stringify(allSelects, null, 2));

  await browser.close();
})().catch(e => console.error('Error:', e.message));
