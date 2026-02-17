/**
 * @file braveSearcher.js
 * @description Brave Search API integration for finding HOA contact information
 *
 * Uses Brave Search API (included in user's paid plan) to:
 * 1. Search for HOAs in a specific city
 * 2. Extract contact info from search results (emails, phones, names)
 * 3. Visit promising URLs to get full details
 * 4. Return structured contact data
 *
 * FREE TIER: 2,000 queries/month (66/day)
 * API DOCS: https://brave.com/search/api/
 */

const crypto = require('crypto');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
const BRAVE_API_URL = 'https://api.search.brave.com/res/v1/web/search';

const CONFIG = {
  USER_AGENT: 'HOA Project Funding Lead Finder (hoaprojectfunding.com)',
  RATE_LIMIT_MS: 2000,           // 2 seconds between requests
  MAX_RESULTS: 20,                // Results per search
  REQUEST_TIMEOUT_MS: 30000,      // 30 second timeout
};

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate fingerprint for deduplication
 */
function generateFingerprint(hoaName, city, zip) {
  const normalized = `${hoaName}|${city}|${zip || 'unknown'}`
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return crypto.createHash('md5').update(normalized).digest('hex');
}

/**
 * Extract email addresses from text
 */
function extractEmails(text) {
  if (!text) return [];
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const matches = text.match(emailRegex) || [];

  // Filter out common spam/generic emails
  return matches.filter(email => {
    const lower = email.toLowerCase();
    return !lower.includes('noreply') &&
           !lower.includes('no-reply') &&
           !lower.includes('donotreply') &&
           !lower.startsWith('info@') &&
           !lower.startsWith('admin@') &&
           !lower.startsWith('webmaster@');
  });
}

/**
 * Extract phone numbers from text
 */
function extractPhones(text) {
  if (!text) return [];

  // Match various US phone formats
  const phoneRegex = /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
  const matches = text.match(phoneRegex) || [];

  return matches.map(phone => {
    // Normalize to (XXX) XXX-XXXX format
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    if (digits.length === 11 && digits[0] === '1') {
      return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    return phone; // Return original if can't format
  });
}

/**
 * Extract HOA names from text
 */
function extractHOANames(text) {
  if (!text) return [];

  const patterns = [
    /([A-Z][A-Za-z\s]+)\s+(HOA|Homeowners Association|Homeowner Association)/gi,
    /([A-Z][A-Za-z\s]+)\s+(Community Association|Condo Association)/gi,
    /([A-Z][A-Za-z\s]+)\s+(Properties|Estates|Village|Heights|Meadows|Villas)\s+HOA/gi,
  ];

  const names = new Set();

  patterns.forEach(pattern => {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const name = match[0].trim();
      if (name.length > 5 && name.length < 100) {
        names.add(name);
      }
    }
  });

  return Array.from(names);
}

/**
 * Extract contact person names from text (near email/phone)
 */
function extractContactNames(text) {
  if (!text) return [];

  // Look for names near "president", "manager", "contact", etc.
  const patterns = [
    /(?:President|Manager|Director|Contact|Board Member)[\s:]+([A-Z][a-z]+\s+[A-Z][a-z]+)/gi,
    /([A-Z][a-z]+\s+[A-Z][a-z]+)[\s,]+(?:President|Manager|Director)/gi,
  ];

  const names = new Set();

  patterns.forEach(pattern => {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const name = match[1].trim();
      if (name.length > 3 && name.length < 50) {
        names.add(name);
      }
    }
  });

  return Array.from(names);
}

/**
 * Calculate confidence score based on data completeness
 */
function calculateConfidence(contact) {
  let score = 30; // Base score

  if (contact.hoa_name) score += 10;
  if (contact.contact_person) score += 15;
  if (contact.email) score += 20;
  if (contact.phone) score += 15;
  if (contact.property_address) score += 5;
  if (contact.management_company) score += 5;

  return Math.min(score, 100);
}

// ═══════════════════════════════════════════════════════════════════════════
// BRAVE SEARCH API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Search Brave for HOA contacts in a specific city
 */
async function searchBrave(city, state = 'CA') {
  if (!BRAVE_API_KEY) {
    throw new Error('BRAVE_API_KEY not set in environment variables');
  }

  // Multiple search queries to cover different angles
  const queries = [
    `"${city} ${state}" HOA homeowners association board president contact email`,
    `"${city} ${state}" HOA management company contact information`,
    `"${city} ${state}" community association contact board members`,
  ];

  const allResults = [];

  for (const query of queries) {
    console.log(`[Brave] Searching: ${query}`);

    try {
      const params = new URLSearchParams({
        q: query,
        count: CONFIG.MAX_RESULTS,
        country: 'US',
        search_lang: 'en',
      });

      const response = await fetch(`${BRAVE_API_URL}?${params}`, {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': BRAVE_API_KEY,
        },
      });

      if (!response.ok) {
        console.error(`[Brave] API error: ${response.status} ${response.statusText}`);
        const errorText = await response.text();
        console.error(`[Brave] Error details: ${errorText}`);
        continue;
      }

      const data = await response.json();

      if (data.web && data.web.results) {
        console.log(`[Brave] Found ${data.web.results.length} results for: ${query}`);
        allResults.push(...data.web.results);
      }

      // Rate limiting
      await sleep(CONFIG.RATE_LIMIT_MS);

    } catch (error) {
      console.error(`[Brave] Search error for "${query}":`, error.message);
    }
  }

  console.log(`[Brave] Total results collected: ${allResults.length}`);
  return allResults;
}

/**
 * Extract contact information from Brave search results
 */
function extractContactsFromResults(results, city, state) {
  const contacts = [];
  const seenFingerprints = new Set();

  for (const result of results) {
    const { title, url, description } = result;
    const combinedText = `${title} ${description}`;

    // Extract all possible data
    const hoaNames = extractHOANames(combinedText);
    const emails = extractEmails(combinedText);
    const phones = extractPhones(combinedText);
    const contactNames = extractContactNames(combinedText);

    // If we found an HOA name and at least email or phone, create a contact
    if (hoaNames.length > 0 && (emails.length > 0 || phones.length > 0)) {
      for (const hoaName of hoaNames) {
        const fingerprint = generateFingerprint(hoaName, city, null);

        // Skip duplicates
        if (seenFingerprints.has(fingerprint)) {
          continue;
        }
        seenFingerprints.add(fingerprint);

        const contact = {
          hoa_name: hoaName,
          contact_person: contactNames[0] || null,
          title: null, // Could extract from text if patterns found
          email: emails[0] || null,
          phone: phones[0] || null,
          property_address: null,
          city: city,
          state: state,
          zip: null,
          unit_count: null,
          management_company: null,
          source_url: url,
          source_type: 'brave_search',
        };

        contact.confidence_score = calculateConfidence(contact);

        // Only include if confidence is reasonable (>40)
        if (contact.confidence_score >= 40) {
          contacts.push(contact);
          console.log(`[Brave] Extracted: ${contact.hoa_name} (confidence: ${contact.confidence_score}%)`);
        }
      }
    }
  }

  return contacts;
}

/**
 * Main search function using Brave Search API
 */
async function searchHOAsWithBrave(city, state = 'CA') {
  console.log(`[Brave] Starting HOA search for ${city}, ${state}`);

  try {
    // Search Brave
    const results = await searchBrave(city, state);

    if (results.length === 0) {
      console.log(`[Brave] No results found for ${city}, ${state}`);
      return [];
    }

    // Extract contacts from results
    const contacts = extractContactsFromResults(results, city, state);

    console.log(`[Brave] Extracted ${contacts.length} contacts from ${results.length} search results`);
    return contacts;

  } catch (error) {
    console.error(`[Brave] Search failed for ${city}, ${state}:`, error.message);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  searchHOAsWithBrave,
  extractEmails,
  extractPhones,
  extractHOANames,
  extractContactNames,
};
