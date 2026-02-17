import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../utils/logger';
import { Lead } from '../storage/db';

const BBB_CATEGORIES = [
  'homeowner-association-management',
  'property-management',
  'community-association-management',
];

export async function scrapeBBB(states: string[], maxResults: number = 20): Promise<Partial<Lead>[]> {
  const leads: Partial<Lead>[] = [];

  logger.info(`Starting BBB scraper for states: ${states.join(', ')}`);

  for (const state of states) {
    if (leads.length >= maxResults) break;

    for (const category of BBB_CATEGORIES) {
      if (leads.length >= maxResults) break;

      try {
        const url = `https://www.bbb.org/search?find_country=USA&find_text=${category}&find_loc=${state}&page=1`;

        logger.debug(`Scraping BBB: ${url}`);

        const response = await axios.get(url, {
          timeout: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });

        const $ = cheerio.load(response.data);

        $('.search-result-item').each((i, el) => {
          if (leads.length >= maxResults) return false;

          const $el = $(el);
          const name = $el.find('.business-name').text().trim();
          const addressText = $el.find('.address').text().trim();
          const phone = $el.find('.phone').text().trim();

          // Extract city/state from address
          const match = addressText.match(/([^,]+),\s*([A-Z]{2})\s+(\d{5})/);
          const city = match ? match[1].trim() : undefined;
          const zip = match ? match[3] : undefined;

          if (name) {
            leads.push({
              company_name: name,
              city,
              state,
              zip,
              phone: phone || undefined,
              source: 'BBB',
              date_found: new Date().toISOString().split('T')[0],
              outreach_status: 'new',
              signal_score: 0,
            });
          }
        });

        logger.info(`BBB: found ${leads.length} leads in ${state} (${category})`);

        await new Promise(resolve => setTimeout(resolve, 2000)); // Rate limit
      } catch (error: any) {
        logger.error(`BBB scraper error for ${state}/${category}:`, error.message);
      }
    }
  }

  logger.info(`BBB scraper completed: ${leads.length} leads found`);
  return leads;
}
