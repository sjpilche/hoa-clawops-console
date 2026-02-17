import axios from 'axios';
import { logger } from '../utils/logger';
import { extractDomain } from '../utils/scorer';

interface HunterResponse {
  data: {
    emails: Array<{
      value: string;
      type: string;
      confidence: number;
      first_name?: string;
      last_name?: string;
      position?: string;
    }>;
  };
}

export async function findEmailsByDomain(websiteUrl: string): Promise<{
  emails: string[];
  contacts: Array<{ name: string; title: string; email: string }>;
}> {
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) {
    logger.warn('HUNTER_API_KEY not set, skipping Hunter enrichment');
    return { emails: [], contacts: [] };
  }

  const domain = extractDomain(websiteUrl);
  if (!domain) {
    logger.debug(`Invalid domain from ${websiteUrl}`);
    return { emails: [], contacts: [] };
  }

  try {
    const response = await axios.get<HunterResponse>(
      `https://api.hunter.io/v2/domain-search`,
      {
        params: { domain, api_key: apiKey, limit: 10 },
        timeout: 10000,
      }
    );

    const emailData = response.data.data.emails || [];
    const emails = emailData.map(e => e.value);
    const contacts = emailData
      .filter(e => e.first_name && e.last_name && e.position)
      .map(e => ({
        name: `${e.first_name} ${e.last_name}`,
        title: e.position || '',
        email: e.value,
      }));

    logger.info(`Hunter found ${emails.length} emails for ${domain}`);
    return { emails, contacts };
  } catch (error: any) {
    if (error.response?.status === 429) {
      logger.warn(`Hunter rate limit hit for ${domain}`);
    } else {
      logger.error(`Hunter API error for ${domain}:`, error.message);
    }
    return { emails: [], contacts: [] };
  }
}
