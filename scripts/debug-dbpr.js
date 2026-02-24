'use strict';
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false }); // visible for debug
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  // Try the direct URL with county name
  const url = 'https://www.myfloridalicense.com/wl11.asp?mode=2&brd=1601&typ=Certified+General+Contractor&LicTyp=CGC&bus_name=&bus_city=&bus_county=Hillsborough&SID=&search_type=3';
  console.log('Navigating to:', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Get page title and first 500 chars of body
  const title = await page.title();
  const body = await page.textContent('body');
  console.log('Title:', title);
  console.log('\nBody preview:', body.substring(0, 1000));

  // Get all table rows
  const tables = await page.evaluate(() => {
    const result = [];
    document.querySelectorAll('table').forEach((table, ti) => {
      const rows = [];
      table.querySelectorAll('tr').forEach((row, ri) => {
        const cells = [];
        row.querySelectorAll('td, th').forEach(cell => {
          cells.push(cell.textContent.trim().substring(0, 50));
        });
        if (cells.length > 0) rows.push(cells);
      });
      if (rows.length > 0) result.push({ tableIndex: ti, rows: rows.slice(0, 5) });
    });
    return result;
  });

  console.log('\nTables found:', tables.length);
  tables.forEach(t => {
    console.log(`\nTable ${t.tableIndex}:`);
    t.rows.forEach(r => console.log('  ', r.join(' | ')));
  });

  // Check all form elements
  const forms = await page.evaluate(() => {
    const result = [];
    document.querySelectorAll('form').forEach((form, fi) => {
      const inputs = [];
      form.querySelectorAll('input, select, button').forEach(el => {
        inputs.push({ tag: el.tagName, type: el.type, name: el.name, value: el.value?.substring(0, 30) });
      });
      result.push({ formIndex: fi, action: form.action, method: form.method, inputs });
    });
    return result;
  });

  console.log('\nForms:', JSON.stringify(forms, null, 2));

  await page.screenshot({ path: 'scripts/dbpr-debug.png' });
  console.log('\nScreenshot saved to scripts/dbpr-debug.png');

  await browser.close();
})().catch(e => console.error('Error:', e.message));
