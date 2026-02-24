'use strict';
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  // Step 1: Select "Search by License Type"
  await page.goto('https://www.myfloridalicense.com/wl11.asp', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.locator('input[value="LicTyp"]').click();
  await page.locator('button[name="SelectSearchType"]').click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);

  // Step 2: Fill in the search criteria
  await page.selectOption('select[name="Board"]', '06'); // Construction Industry
  await page.waitForTimeout(800);
  await page.selectOption('select[name="LicenseType"]', '0605'); // Certified General Contractor
  await page.selectOption('select[name="County"]', '39');  // Hillsborough
  await page.selectOption('select[name="RecsPerPage"]', '50');
  await page.waitForTimeout(500);

  // Step 3: Click the Search button (name=Search1)
  await page.locator('button[name="Search1"]').click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);
  console.log('Results URL:', page.url());

  // Check for records
  const resultsText = await page.textContent('body');
  if (resultsText.includes('no records found') || resultsText.includes('No records found')) {
    console.log('No records found');
    process.exit(0);
  }

  // Get the record count
  const countMatch = resultsText.match(/Search Results\s*(\d+)\s*-\s*(\d+)\s*of\s*(\d+)/);
  if (countMatch) console.log(`Records: ${countMatch[3]} total (showing ${countMatch[1]}-${countMatch[2]})`);

  // Parse the results table
  const rows = await page.evaluate(() => {
    const results = [];
    // Find all tr with exactly 5 td cells (License Type | Name | NameType | LicNum | Status)
    document.querySelectorAll('tr').forEach(tr => {
      const cells = tr.querySelectorAll('td');
      if (cells.length >= 4) {
        const licType = cells[0].textContent.trim();
        const name = cells[1].textContent.trim();
        const nameType = cells[2]?.textContent.trim() || '';
        const licNum = cells[3]?.textContent.trim() || '';
        const status = cells[4]?.textContent.trim() || '';
        const addr = cells[5]?.textContent.trim() || '';
        if (name && name.length > 1 && licType && !licType.toLowerCase().includes('license type')) {
          results.push({ licType, name, nameType, licNum, status, addr });
        }
      }
    });
    return results.slice(0, 20);
  });

  console.log(`\nParsed ${rows.length} rows:`);
  rows.forEach(r => console.log(`  [${r.licNum}] ${r.name} | ${r.nameType} | ${r.status} | ${r.addr.substring(0,40)}`));

  await browser.close();
})().catch(e => console.error('Error:', e.message));
