import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { logger } from '../utils/logger';
import { Lead } from '../storage/db';

puppeteer.use(StealthPlugin());

const TARGET_CITIES: { [state: string]: string[] } = {
  FL: ['Miami', 'Tampa', 'Orlando', 'Jacksonville', 'Fort Lauderdale'],
  TX: ['Houston', 'Dallas', 'Austin', 'San Antonio', 'Fort Worth'],
  CA: ['Los Angeles', 'San Diego', 'San Jose', 'San Francisco', 'Sacramento'],
  AZ: ['Phoenix', 'Tucson', 'Mesa', 'Chandler', 'Scottsdale'],
  NC: ['Charlotte', 'Raleigh', 'Greensboro', 'Durham', 'Winston-Salem'],
};

export async function scrapeGoogleMaps(states: string[], maxResults: number = 20): Promise<Partial<Lead>[]> {
  const leads: Partial<Lead>[] = [];

  logger.info(`Starting Google Maps scraper for states: ${states.join(', ')}`);

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    for (const state of states) {
      const cities = TARGET_CITIES[state] || [];

      for (const city of cities.slice(0, 2)) { // Limit to 2 cities per state per run
        if (leads.length >= maxResults) break;

        try {
          const page = await browser.newPage();
          await page.setViewport({ width: 1280, height: 800 });

          const searchQuery = `HOA management company ${city} ${state}`;
          const url = `https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`;

          logger.debug(`Searching Google Maps: ${searchQuery}`);
          await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

          await new Promise(resolve => setTimeout(resolve, 3000));

          // Extract business listings
          const listings = await page.evaluate(() => {
            const results: any[] = [];
            const cards = document.querySelectorAll('[role="article"]');

            cards.forEach((card, idx) => {
              if (idx >= 10) return; // Limit to first 10 results

              // Get company name from the main link
              const nameLink = card.querySelector('a[href*="/maps/place/"]');
              const name = nameLink?.getAttribute('aria-label') || '';

              // Get website URL if available
              const websiteLink = Array.from(card.querySelectorAll('a')).find(a => {
                const href = a.getAttribute('href') || '';
                return href.startsWith('http') && !href.includes('google.com');
              });
              const website = websiteLink?.getAttribute('href') || null;

              // Get address
              const addressEl = card.querySelector('[aria-label*="Address"]');
              const address = addressEl?.textContent || '';

              // Try to find phone
              const phoneEl = Array.from(card.querySelectorAll('span')).find(el =>
                /\(\d{3}\)/.test(el.textContent || '')
              );
              const phone = phoneEl?.textContent || null;

              if (name) {
                results.push({ name, address, phone, website });
              }
            });

            return results;
          });

          logger.info(`Found ${listings.length} listings in ${city}, ${state}`);

          listings.forEach((listing: any) => {
            leads.push({
              company_name: listing.name,
              website: listing.website || undefined,
              city,
              state,
              phone: listing.phone || undefined,
              source: 'Google Maps',
              date_found: new Date().toISOString().split('T')[0],
              outreach_status: 'new',
              signal_score: 0, // Will be calculated after enrichment
            });
          });

          await page.close();
          await new Promise(resolve => setTimeout(resolve, 3000)); // Rate limiting
        } catch (error: any) {
          logger.error(`Error scraping ${city}, ${state}:`, error.message);
        }
      }
    }

    await browser.close();
  } catch (error: any) {
    logger.error('Google Maps scraper failed:', error.message);
  }

  logger.info(`Google Maps scraper completed: ${leads.length} leads found`);
  return leads;
}
