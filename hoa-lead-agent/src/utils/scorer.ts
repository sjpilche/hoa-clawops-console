import { Lead } from '../storage/db';

export function calculateSignalScore(lead: Partial<Lead>): number {
  let score = 0;

  // Email found: +3
  if (lead.primary_email) score += 3;

  // Direct contact (name + title): +3
  if (lead.contact_name && lead.contact_title) score += 3;

  // Manages 10+ HOAs: +4
  if (lead.number_of_hoas_managed && lead.number_of_hoas_managed >= 10) score += 4;

  // Has website: +1
  if (lead.website) score += 1;

  // Has phone: +1
  if (lead.phone) score += 1;

  // LinkedIn URL: +1
  if (lead.contact_linkedin_url) score += 1;

  return Math.min(score, 10); // Cap at 10
}

export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|corporation|limited)\b\.?/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

export function extractDomain(url: string): string | null {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}
