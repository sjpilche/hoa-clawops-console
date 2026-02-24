'use strict';
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  // Full search flow
  await page.goto('https://www.myfloridalicense.com/wl11.asp', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.locator('input[value="LicTyp"]').click();
  await page.locator('button[name="SelectSearchType"]').click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);
  await page.selectOption('select[name="Board"]', '06');
  await page.waitForTimeout(800);
  await page.selectOption('select[name="LicenseType"]', '0605');
  await page.selectOption('select[name="County"]', '66'); // Sarasota
  await page.selectOption('select[name="RecsPerPage"]', '50');
  await page.waitForTimeout(300);
  await page.locator('button[name="Search1"]').click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  console.log('URL:', page.url());

  // Dump all raw tr/td
  const allRows = await page.evaluate(() => {
    const result = [];
    document.querySelectorAll('tr').forEach((tr, ti) => {
      const cells = tr.querySelectorAll('td');
      if (cells.length < 2) return;
      const row = [];
      cells.forEach(c => row.push(c.textContent.trim().replace(/\s+/g, ' ').substring(0, 60)));
      result.push({ rowIdx: ti, cellCount: cells.length, cells: row });
    });
    return result;
  });

  console.log(`Total tr rows with >=2 tds: ${allRows.length}`);
  console.log('\nFirst 30 rows:');
  allRows.slice(0, 30).forEach(r => {
    console.log(`  Row ${r.rowIdx} (${r.cellCount} cells): ${JSON.stringify(r.cells)}`);
  });

  await browser.close();
})().catch(e => console.error(e.message));
