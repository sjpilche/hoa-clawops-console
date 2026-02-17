import axios from 'axios';
import { logger } from '../utils/logger';
import { extractDomain } from '../utils/scorer';

export async function enrichWithClearbit(websiteUrl: string): Promise<{
  phone?: string;
  employeeCount?: number;
}> {
  const apiKey = process.env.CLEARBIT_API_KEY;
  if (!apiKey) {
    logger.debug('CLEARBIT_API_KEY not set, skipping Clearbit enrichment');
    return {};
  }

  const domain = extractDomain(websiteUrl);
  if (!domain) return {};

  try {
    const response = await axios.get(
      `https://company.clearbit.com/v2/companies/find`,
      {
        params: { domain },
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
      }
    );

    const data = response.data;
    return {
      phone: data.phone || undefined,
      employeeCount: data.metrics?.employees || undefined,
    };
  } catch (error: any) {
    logger.debug(`Clearbit lookup failed for ${domain}: ${error.message}`);
    return {};
  }
}
