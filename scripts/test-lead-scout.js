'use strict';
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  // Try the main AGC member lookup
  const urls = [
    'https://www.agcfla.com/members',
    'https://www.agcfl.org/members',
    'https://abc-florida.org/members',
    'https://www.floridaroofing.com/find-a-contractor',
    'https://www.agc.org/membership/member-directory',
  ];

  for (const url of urls.slice(0, 3)) {
    console.log('\n---', url, '---');
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(2000);
      console.log('Title:', (await page.title()).substring(0, 60));
      // Get first 5 link texts that look like company names
      const links = await page.evaluate(() => {
        const items = [];
        document.querySelectorAll('a').forEach(a => {
          const t = (a.textContent || '').trim();
          if (t.length > 5 && t.length < 50 && /[A-Z]/.test(t) && !/^(Home|About|Contact|Member|Join|Login|Menu|Search)/.test(t)) {
            items.push({ text: t, href: (a.href || '').substring(0, 80) });
          }
        });
        return items.slice(5, 20);
      });
      links.forEach(l => console.log(' ', l.text, '->', l.href));
    } catch (e) {
      console.log('Error:', e.message.substring(0, 80));
    }
  }

  await browser.close();
})().catch(e => console.error(e.message));
