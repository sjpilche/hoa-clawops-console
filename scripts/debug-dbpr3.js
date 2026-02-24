'use strict';
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  await page.goto('https://www.myfloridalicense.com/wl11.asp', {
    waitUntil: 'networkidle', timeout: 30000
  });
  await page.waitForTimeout(3000);

  // Try clicking "Search by License Type" radio
  const licTypeRadio = page.locator('input[value="LicTyp"]');
  await licTypeRadio.click();
  await page.waitForTimeout(2000);

  // Now check what selects appeared
  const selects = await page.evaluate(() => {
    const result = {};
    document.querySelectorAll('select').forEach(sel => {
      const opts = [];
      sel.querySelectorAll('option').forEach(opt => {
        opts.push({ value: opt.value, text: opt.textContent.trim().substring(0, 40) });
      });
      if (opts.length > 0) result[sel.name || sel.id || 'unnamed'] = opts.slice(0, 40);
    });
    return result;
  });

  console.log('Selects after radio click:', JSON.stringify(selects, null, 2));

  // Also capture all visible form inputs
  const allInputs = await page.evaluate(() => {
    const result = [];
    document.querySelectorAll('input:not([type=hidden]), select, button').forEach(el => {
      const style = window.getComputedStyle(el);
      if (style.display !== 'none' && style.visibility !== 'hidden') {
        result.push({
          tag: el.tagName,
          type: el.type,
          name: el.name,
          id: el.id,
          value: (el.value || '').substring(0, 30),
          visible: true,
        });
      }
    });
    return result;
  });
  console.log('\nVisible inputs:', JSON.stringify(allInputs, null, 2));

  await browser.close();
})().catch(e => console.error('Error:', e.message));
