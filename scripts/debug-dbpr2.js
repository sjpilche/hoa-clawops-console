'use strict';
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  // Go to the main search form
  await page.goto('https://www.myfloridalicense.com/wl11.asp', {
    waitUntil: 'domcontentloaded', timeout: 30000
  });
  await page.waitForTimeout(2000);

  // Dump all select options to understand county values
  const selects = await page.evaluate(() => {
    const result = {};
    document.querySelectorAll('select').forEach(sel => {
      const opts = [];
      sel.querySelectorAll('option').forEach(opt => {
        opts.push({ value: opt.value, text: opt.textContent.trim().substring(0, 40) });
      });
      result[sel.name || sel.id || 'unnamed'] = opts.slice(0, 30);
    });
    return result;
  });

  console.log('Select options:', JSON.stringify(selects, null, 2));

  // Look for radio buttons
  const radios = await page.evaluate(() => {
    const result = [];
    document.querySelectorAll('input[type=radio]').forEach(r => {
      result.push({ name: r.name, value: r.value, id: r.id });
    });
    return result;
  });
  console.log('\nRadio buttons:', JSON.stringify(radios, null, 2));

  await browser.close();
})().catch(e => console.error('Error:', e.message));
