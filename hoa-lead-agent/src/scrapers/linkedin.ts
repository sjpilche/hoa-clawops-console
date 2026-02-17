import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { logger } from '../utils/logger';
import { Lead } from '../storage/db';

puppeteer.use(StealthPlugin());

export async function scrapeLinkedIn(states: string[], maxResults: number = 20): Promise<Partial<Lead>[]> {
  const leads: Partial<Lead>[] = [];

  // LinkedIn requires auth - skip if no credentials
  if (!process.env.LINKEDIN_EMAIL || !process.env.LINKEDIN_PASSWORD) {
    logger.warn('LinkedIn credentials not set, skipping LinkedIn scraper');
    return leads;
  }

  logger.info(`Starting LinkedIn scraper for states: ${states.join(', ')}`);

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // Login to LinkedIn
    try {
      await page.goto('https://www.linkedin.com/login', { waitUntil: 'networkidle2' });
      await page.type('#username', process.env.LINKEDIN_EMAIL!);
      await page.type('#password', process.env.LINKEDIN_PASSWORD!);
      await page.click('button[type="submit"]');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });

      logger.info('LinkedIn login successful');
    } catch (error) {
      logger.error('LinkedIn login failed:', error);
      await browser.close();
      return leads;
    }

    // Search for HOA management companies
    for (const state of states) {
      if (leads.length >= maxResults) break;

      try {
        const searchQuery = `"HOA management" OR "homeowners association management" ${state}`;
        const url = `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(searchQuery)}`;

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 3000));

        const companies = await page.evaluate(() => {
          const results: any[] = [];
          const items = document.querySelectorAll('.entity-result');

          items.forEach((item, idx) => {
            if (idx >= 10) return;

            const nameEl = item.querySelector('.entity-result__title-text a');
            const name = nameEl?.textContent?.trim() || '';
            const linkedinUrl = (nameEl as HTMLAnchorElement)?.href || '';

            const locationEl = item.querySelector('.entity-result__secondary-subtitle');
            const location = locationEl?.textContent?.trim() || '';

            if (name) {
              results.push({ name, linkedinUrl, location });
            }
          });

          return results;
        });

        logger.info(`LinkedIn: found ${companies.length} companies in ${state}`);

        companies.forEach((company: any) => {
          leads.push({
            company_name: company.name,
            state,
            contact_linkedin_url: company.linkedinUrl,
            source: 'LinkedIn',
            date_found: new Date().toISOString().split('T')[0],
            outreach_status: 'new',
            signal_score: 0,
          });
        });

        await new Promise(resolve => setTimeout(resolve, 3000)); // Rate limiting
      } catch (error: any) {
        logger.error(`LinkedIn scraper error for ${state}:`, error.message);
      }
    }

    await browser.close();
  } catch (error: any) {
    logger.error('LinkedIn scraper failed:', error.message);
  }

  logger.info(`LinkedIn scraper completed: ${leads.length} leads found`);
  return leads;
}
