#!/usr/bin/env node
/**
 * Test a single scrape query and show raw output + parse results.
 * Helps debug why communities aren't saving.
 */

const { chromium } = require('playwright');
const path = require('path');

const CONFIG = {
  headless: true,
  timeout: 30000,
  pageWait: 3000,
  actionWait: 2000,
};

function parseAddress(addressStr) {
  if (!addressStr) return {};
  const cleaned = addressStr.replace(/,?\s*USA\s*$/, '').trim();
  const zipMatch = cleaned.match(/\b(\d{5}(?:-\d{4})?)\b/);
  const zip = zipMatch ? zipMatch[1] : null;
  const stateMatch = cleaned.match(/,\s*([A-Z]{2})\s*(?:\d{5})?$/);
  const state = stateMatch ? stateMatch[1] : null;
  const cityMatch = cleaned.match(/,\s*([^,]+),\s*[A-Z]{2}/);
  const city = cityMatch ? cityMatch[1].trim() : null;
  const streetMatch = cleaned.match(/^(.+?),/);
  const street = streetMatch ? streetMatch[1].trim() : null;
  return { street, city, state, zip };
}

(async () => {
  const query = 'HOA Miami, FL';
  console.log(`Scraping: "${query}"\n`);

  const browser = await chromium.launch({
    headless: CONFIG.headless,
    args: ['--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'],
  });
  const page = await browser.newPage();

  const encodedQuery = encodeURIComponent(query);
  const searchUrl = `https://www.google.com/maps/search/${encodedQuery}`;
  console.log('URL:', searchUrl);

  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: CONFIG.timeout });
  await page.waitForTimeout(CONFIG.pageWait);

  const listings = await page.evaluate(() => {
    const results = [];
    const allCards = document.querySelectorAll('a[href*="maps/place"]');
    console.log('Cards found:', allCards.length);

    for (const card of allCards) {
      try {
        const container = card.closest('div[jsaction]') || card.parentElement;
        const nameEl = container?.querySelector('.qBF1Pd') ||
                       container?.querySelector('[class*="fontHeadlineSmall"]') ||
                       container?.querySelector('div[class*="NrDZNb"]');
        const name = nameEl?.textContent?.trim() || card.textContent?.trim()?.split('\n')[0];
        if (!name || name.length < 3) continue;

        const addressEl = container?.querySelector('.W4Efsd .W4Efsd span') ||
                          container?.querySelector('[class*="UsdlK"]');
        const address = addressEl?.textContent?.trim();

        const ratingEl = container?.querySelector('.MW4etd') ||
                         container?.querySelector('[class*="ZkP5Je"]');
        const ratingText = ratingEl?.textContent?.trim();
        const rating = ratingText ? parseFloat(ratingText) : null;

        const reviewEl = container?.querySelector('.UY7F9') ||
                         container?.querySelector('[class*="UY7F9"]');
        const reviewText = reviewEl?.textContent?.replace(/[()]/g, '').trim();
        const reviewCount = reviewText ? parseInt(reviewText.replace(/,/g, '')) : null;

        const mapsUrl = card.href || null;

        results.push({ name, address, rating, reviewCount, mapsUrl: mapsUrl?.substring(0, 80) });
      } catch (e) {
        // skip
      }
    }
    return results;
  });

  await browser.close();

  console.log(`\nFound ${listings.length} listings:\n`);
  listings.forEach((l, i) => {
    const parsed = parseAddress(l.address);
    console.log(`${i+1}. ${l.name}`);
    console.log(`   Raw address: ${l.address || '(none)'}`);
    console.log(`   Parsed: city=${parsed.city} state=${parsed.state} zip=${parsed.zip}`);
    console.log(`   Rating: ${l.rating || 'n/a'} (${l.reviewCount || 0} reviews)`);
    console.log('');
  });

  // Check how many would pass the upsert (need name at minimum)
  const valid = listings.filter(l => l.name && l.name.length >= 3);
  console.log(`Valid for insert: ${valid.length}/${listings.length}`);
  console.log(`With address: ${valid.filter(l => l.address).length}`);
  console.log(`With zip parsed: ${valid.filter(l => parseAddress(l.address).zip).length}`);
  console.log(`With city parsed: ${valid.filter(l => parseAddress(l.address).city).length}`);
})();
