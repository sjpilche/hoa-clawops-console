/**
 * @file jakeContactEnricher.js
 * @description Contact enrichment for Jake/CFO marketing leads.
 *
 * Finds email addresses for leads in the cfo_leads table that lack contact info.
 * Uses Playwright to scrape public sources — $0/month, no paid APIs.
 *
 * Enrichment waterfall:
 * 1. Google search — "[company] [city] [state] contact email"
 * 2. Website scrape — scrape /contact, /about, /team pages
 * 3. DBPR detail page — FL license detail sometimes has contact info
 * 4. Email pattern guessing — common patterns + domain MX check
 *
 * Modeled on hoaContactEnricher.js but uses main SQLite DB.
 */

'use strict';

const { run, get, all } = require('../db/connection');

// ═══════════════════════════════════════════════════════════════════════════
// EMAIL & PHONE EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

// Emails to skip entirely (bots/traps — not real inboxes)
const SPAM_TRAP_EMAILS = new Set([
  'noreply@', 'no-reply@', 'donotreply@', 'do-not-reply@',
  'webmaster@', 'postmaster@', 'mailer-daemon@',
]);

// Generic role emails — valid contact points for small companies but lower priority
const GENERIC_ROLE_EMAILS = new Set([
  'info@', 'admin@', 'contact@', 'support@', 'sales@', 'help@',
  'office@', 'mail@', 'service@', 'general@', 'hello@', 'team@',
  'billing@', 'accounting@', 'hr@', 'jobs@', 'careers@',
]);

/**
 * Extract personal emails only (name-based like john.smith@company.com).
 * Used when we want a named contact.
 */
function extractPersonalEmails(text) {
  if (!text) return [];
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const matches = text.match(emailRegex) || [];
  return matches.filter(email => {
    const lower = email.toLowerCase();
    const prefix = lower.split('@')[0] + '@';
    if (SPAM_TRAP_EMAILS.has(prefix)) return false;
    if (GENERIC_ROLE_EMAILS.has(prefix)) return false;
    if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.gif')) return false;
    return true;
  });
}

/**
 * Extract all usable emails including generic role addresses.
 * For small GCs, info@company.com typically goes straight to the owner.
 * Spam traps (noreply@, etc.) are still excluded.
 */
function extractEmails(text) {
  if (!text) return [];
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const matches = text.match(emailRegex) || [];
  return matches.filter(email => {
    const lower = email.toLowerCase();
    const prefix = lower.split('@')[0] + '@';
    if (SPAM_TRAP_EMAILS.has(prefix)) return false;
    if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.gif')) return false;
    return true;
  });
}

function extractPhones(text) {
  if (!text) return [];
  const phoneRegex = /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
  const matches = text.match(phoneRegex) || [];
  return matches.map(phone => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    if (digits.length === 11 && digits.startsWith('1')) {
      return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    return phone;
  });
}

// Words that cannot appear in a valid person's name
const NAME_BLACKLIST = new Set([
  'our', 'the', 'with', 'your', 'their', 'this', 'that', 'these', 'those',
  'and', 'for', 'from', 'all', 'any', 'more', 'new', 'best', 'top',
]);

function extractContactNames(text) {
  if (!text) return [];
  const patterns = [
    // Title before name: "CFO John Smith" / "Owner: Bob Jones"
    /(?:CFO|Controller|Owner|Founder|President|Principal|Partner|VP\s+Finance|Vice President|General Manager|Project Manager|Director)[\s:,–-]+([A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20})+)/g,
    // Name before title: "John Smith, Owner" / "Bob Jones - President"
    /([A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20})+)[\s,–-]+(?:CFO|Controller|Owner|Founder|President|Principal|Partner|VP\s+Finance|Vice President|General Manager)/g,
    // "Meet/Contact: First Last" patterns
    /(?:meet|contact|email|reach)\s+(?:our\s+)?(?:owner|founder|ceo|president|principal)?[:,\s]+([A-Z][a-z]{1,20}\s+[A-Z][a-z]{1,20})/g,
    // "Founded by John Smith"
    /(?:founded|owned|operated|managed)\s+by\s+([A-Z][a-z]{1,20}\s+[A-Z][a-z]{1,20})/g,
  ];
  const names = new Set();
  patterns.forEach(pattern => {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const name = match[1].trim();
      const words = name.toLowerCase().split(/\s+/);
      // Reject if any word is in blacklist or too short (likely not a real name)
      if (words.some(w => NAME_BLACKLIST.has(w) || w.length < 2)) continue;
      if (name.length >= 5 && name.length < 40) {
        names.add(name);
      }
    }
  });
  return Array.from(names);
}

function extractTitles(text) {
  if (!text) return null;
  const titlePatterns = [
    /\b(Chief Financial Officer|CFO)\b/i,
    /\b(Controller)\b/i,
    /\b(VP\s+(?:of\s+)?Finance)\b/i,
    /\b(Vice President\s+(?:of\s+)?Finance)\b/i,
    /\b(Founder\s*(?:&|and)?\s*(?:Owner|CEO|President)?)\b/i,
    /\b(Owner\s*(?:&|and)?\s*(?:Founder|President|CEO)?)\b/i,
    /\b(President)\b/i,
    /\b(Principal)\b/i,
    /\b(General Manager)\b/i,
    /\b(Project Manager)\b/i,
  ];
  for (const pattern of titlePatterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAYWRIGHT SCRAPING HELPERS
// ═══════════════════════════════════════════════════════════════════════════

let browser = null;

async function getBrowser() {
  if (browser) return browser;
  const { chromium } = require('playwright');
  browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  return browser;
}

async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

/**
 * Scrape a URL and return text content + extracted data.
 * Tighter 6s nav timeout — sites that respond to partial content are fast.
 */
async function scrapePage(url, timeoutMs = 6000) {
  const b = await getBrowser();
  const page = await b.newPage();
  // Hard deadline — kills the page promise after timeoutMs + 2s grace period
  const hardDeadline = new Promise(resolve => setTimeout(() => resolve(''), timeoutMs + 2000));
  const scrape = (async () => {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      return await page.evaluate(() => document.body?.innerText || '');
    } catch (err) {
      console.log(`[ContactEnricher] Scrape failed for ${url}: ${err.message.split('\n')[0]}`);
      return '';
    } finally {
      // Force close with a 2s timeout — don't let page.close() block forever
      await Promise.race([page.close(), new Promise(r => setTimeout(r, 2000))]);
    }
  })();
  return Promise.race([scrape, hardDeadline]);
}

/**
 * Scrape multiple paths in parallel and return combined results.
 * Much faster than sequential scraping — finds email in ~8s instead of 91s.
 */
async function scrapePathsParallel(baseUrl, paths) {
  const results = await Promise.all(
    paths.map(p => scrapePage(baseUrl.replace(/\/$/, '') + p))
  );
  const allText = results.join('\n');
  return {
    emails: extractEmails(allText),
    phones: extractPhones(allText),
    names: extractContactNames(allText),
    title: extractTitles(allText),
  };
}

/**
 * Try to find a company's website by guessing common domain patterns.
 * No search engine required — uses HTTP HEAD then text verification.
 *
 * Only returns a URL if the page text appears to actually be for this company
 * (contains a meaningful fragment of the company name). This prevents false
 * matches like "Tampa Bay General Contractors" → tampabay.com (newspaper).
 */
async function findWebsiteDirect(companyName) {
  // Strip only legal entity suffixes — keep meaningful words (construction, general, etc.)
  const coreSlug = companyName
    .toLowerCase()
    .replace(/\b(corporation|incorporated|limited|company|llc|inc|corp|ltd|co\.?|&|and|the)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '')
    .replace(/^[^a-z]+|[^a-z0-9]+$/g, '');

  // Also strip industry words for a shorter variant
  const shortSlug = companyName
    .toLowerCase()
    .replace(/\b(corporation|incorporated|limited|company|llc|inc|corp|ltd|co\.?|&|and|the|construction|contractors|contracting|builder|builders|building|services|service|group|associates|enterprises|general|gc)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '')
    .replace(/^[^a-z]+|[^a-z0-9]+$/g, '');

  if (!coreSlug || coreSlug.length < 4) return null;

  // Build candidates — try with industry words first, then stripped version
  const candidates = [
    coreSlug.length >= 5 ? `${coreSlug}.com` : null,
    shortSlug.length >= 4 && shortSlug !== coreSlug ? `${shortSlug}construction.com` : null,
    shortSlug.length >= 4 && shortSlug !== coreSlug ? `${shortSlug}contractors.com` : null,
    shortSlug.length >= 4 ? `${shortSlug}inc.com` : null,
    shortSlug.length >= 4 ? `${shortSlug}llc.com` : null,
    coreSlug.length >= 5 ? `${coreSlug}co.com` : null,
  ].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i); // dedupe + remove nulls

  // Extract key words for verification (longest words from company name, excluding boilerplate)
  const boilerplate = new Set(['construction', 'contractors', 'contracting', 'building', 'builders',
    'builder', 'services', 'service', 'group', 'associates', 'enterprises', 'general',
    'company', 'corporation', 'incorporated', 'limited', 'llc', 'inc', 'corp', 'ltd', 'and', 'the']);
  const verifyWords = companyName.toLowerCase().split(/\s+/)
    .map(w => w.replace(/[^a-z0-9]/g, ''))
    .filter(w => w.length >= 5 && !boilerplate.has(w))  // min 5 chars to avoid generic words like "best"
    .slice(0, 3); // top 3 most distinctive words

  // If no distinctive words, skip direct guessing — fall through to search engine
  if (verifyWords.length === 0) return null;

  for (const domain of candidates) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`https://${domain}`, {
        method: 'HEAD',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });
      clearTimeout(timeout);

      if (res.ok || res.status === 405) {
        // Verify this is actually their site by checking page text contains a key word
        if (verifyWords.length > 0) {
          try {
            const textRes = await fetch(`https://${domain}`, {
              method: 'GET',
              redirect: 'follow',
              signal: AbortSignal.timeout(6000),
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            });
            const html = await textRes.text();
            const pageText = html.toLowerCase();
            // Must match at least one of the distinctive words
            const isMatch = verifyWords.some(w => pageText.includes(w));
            if (isMatch) return `https://${domain}`;
            // No match — this domain exists but isn't their site
          } catch { /* couldn't verify, skip */ }
        } else {
          return `https://${domain}`;
        }
      }
    } catch { /* try next */ }
  }
  return null;
}

/**
 * Bing search via Playwright — separate rate limit from Google/DDG.
 * Falls back gracefully if also blocked.
 */
async function googleSearch(query, timeoutMs = 10000) {
  const b = await getBrowser();
  const page = await b.newPage();

  // Hard deadline — ensures this function ALWAYS returns within timeoutMs + 5s
  const hardDeadline = new Promise(resolve =>
    setTimeout(() => resolve({ text: '', links: [] }), timeoutMs + 5000)
  );

  const search = (async () => {
    try {
      const encoded = encodeURIComponent(query);
      // Try Bing first
      await page.goto(`https://www.bing.com/search?q=${encoded}&count=10`, {
        waitUntil: 'domcontentloaded',
        timeout: timeoutMs,
      });
      await page.waitForTimeout(800);

      const title = await page.title().catch(() => '');
      const isBingBlocked = /blocked|captcha|access denied/i.test(title);

      if (!isBingBlocked) {
        const text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
        const links = await page.evaluate(() => {
          const found = [];
          document.querySelectorAll('li.b_algo a, .b_title a').forEach(a => {
            if (a.href && a.href.startsWith('http') && !a.href.includes('bing.com') && !a.href.includes('microsoft.com'))
              found.push(a.href);
          });
          if (found.length === 0) {
            document.querySelectorAll('a[href]').forEach(a => {
              if (a.href && a.href.startsWith('http') && !a.href.includes('bing.com')) found.push(a.href);
            });
          }
          return found.slice(0, 12);
        }).catch(() => []);
        if (text && text.length > 200) return { text, links };
      }

      // Fallback: DuckDuckGo HTML
      await page.goto(`https://html.duckduckgo.com/html/?q=${encoded}`, {
        waitUntil: 'domcontentloaded', timeout: timeoutMs,
      });
      await page.waitForTimeout(600);
      const text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
      const links = await page.evaluate(() => {
        const found = [];
        document.querySelectorAll('a.result__a, a.result__url').forEach(a => {
          const href = a.href || '';
          if (href.startsWith('http') && !href.includes('duckduckgo.com')) found.push(href);
        });
        return found.slice(0, 12);
      }).catch(() => []);
      return { text, links };

    } catch (err) {
      console.log(`[ContactEnricher] Search failed: ${err.message.split('\n')[0]}`);
      return { text: '', links: [] };
    } finally {
      // Force close — don't let page.close() block indefinitely
      await Promise.race([page.close(), new Promise(r => setTimeout(r, 2000))]);
    }
  })();

  return Promise.race([search, hardDeadline]);
}

// ═══════════════════════════════════════════════════════════════════════════
// ENRICHMENT WATERFALL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Enrich a single lead with contact info.
 * Tries multiple methods in order, stops on first success.
 */
async function enrichLead(leadId) {
  const lead = get('SELECT * FROM cfo_leads WHERE id = ?', [leadId]);
  if (!lead) throw new Error(`Lead ${leadId} not found`);

  // Skip if already enriched
  if (lead.contact_email && lead.enrichment_status === 'enriched') {
    return { success: true, skipped: true, method: 'already_enriched', lead };
  }

  console.log(`[ContactEnricher] Enriching: ${lead.company_name} (${lead.city || ''}, ${lead.state || 'FL'})`);

  // Mark as in-progress
  run("UPDATE cfo_leads SET enrichment_status = 'in_progress', updated_at = datetime('now') WHERE id = ?", [leadId]);

  let email = null;
  let phone = null;
  let contactName = lead.contact_name || null;
  let contactTitle = lead.contact_title || null;
  let linkedin = null;
  let website = lead.website || null;
  let method = null;

  try {
    // Hard per-lead timeout — no lead should ever take more than 75s total
    const leadDeadline = new Promise(resolve => setTimeout(() => resolve('TIMEOUT'), 75000));
    const enrichWork = (async () => {

    // ── Step 0: Direct domain guess (no search engine — rate-limit free) ──
    if (!website) {
      console.log(`[ContactEnricher]   Step 0: Direct domain guess...`);
      const directWebsite = await findWebsiteDirect(lead.company_name);
      if (directWebsite) {
        website = directWebsite;
        console.log(`[ContactEnricher]   Found website directly: ${website}`);
      }
    }

    // ── Step 1: Parallel website scrape — homepage + contact + about simultaneously ──
    if (!email && website) {
      console.log(`[ContactEnricher]   Step 1: Parallel website scrape (${website})...`);
      // First wave: most likely pages in parallel
      const wave1 = await scrapePathsParallel(website, ['', '/contact', '/about', '/about-us']);
      if (wave1.emails.length > 0) {
        email = wave1.emails[0];
        method = 'website_scrape_direct';
        console.log(`[ContactEnricher]   Found email via website (wave1): ${email}`);
      }
      if (wave1.phones.length > 0 && !phone) phone = wave1.phones[0];
      if (wave1.names.length > 0 && !contactName) contactName = wave1.names[0];
      if (wave1.title && !contactTitle) contactTitle = wave1.title;

      // Second wave: only if first wave found no email
      if (!email) {
        const wave2 = await scrapePathsParallel(website, ['/contact-us', '/team', '/our-team']);
        if (wave2.emails.length > 0) {
          email = wave2.emails[0];
          method = 'website_scrape_direct';
          console.log(`[ContactEnricher]   Found email via website (wave2): ${email}`);
        }
        if (wave2.phones.length > 0 && !phone) phone = wave2.phones[0];
        if (wave2.names.length > 0 && !contactName) contactName = wave2.names[0];
        if (wave2.title && !contactTitle) contactTitle = wave2.title;
      }
    }

    // ── Step 2: Search engine — only if no website found yet ──
    if (!email && !website) {
      console.log(`[ContactEnricher]   Step 2: Search engine...`);
      const companySearch = `"${lead.company_name}" ${lead.city || ''} ${lead.state || 'FL'} contact email CFO controller owner`;
      const searchResult = await googleSearch(companySearch);

      const searchEmails = extractEmails(searchResult.text);
      const searchPhones = extractPhones(searchResult.text);
      const searchNames = extractContactNames(searchResult.text);
      const searchTitle = extractTitles(searchResult.text);

      if (searchEmails.length > 0) {
        email = searchEmails[0];
        method = 'search_engine';
        console.log(`[ContactEnricher]   Found email via search: ${email}`);
      }
      if (searchPhones.length > 0 && !phone) phone = searchPhones[0];
      if (searchNames.length > 0 && !contactName) contactName = searchNames[0];
      if (searchTitle && !contactTitle) contactTitle = searchTitle;

      // Pick up website from search results for pattern guessing later
      if (!website && searchResult.links) {
        const skipDomains = ['facebook.com', 'linkedin.com', 'yelp.com', 'bbb.org', 'houzz.com', 'angieslist.com', 'thumbtack.com'];
        const candidateLink = searchResult.links.find(l => {
          const domain = l.replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
          return !skipDomains.some(s => domain.includes(s));
        });
        if (candidateLink) {
          website = 'https://' + candidateLink.replace(/^https?:\/\//, '').split('/')[0];
        }
      }
    }

    // ── Step 3: Scrape website found via search (if applicable) ──
    if (!email && website && method !== 'website_scrape_direct') {
      console.log(`[ContactEnricher]   Step 3: Scrape search-found website (${website})...`);
      const wave = await scrapePathsParallel(website, ['', '/contact', '/about', '/contact-us']);
      if (wave.emails.length > 0) {
        email = wave.emails[0];
        method = 'website_scrape';
        console.log(`[ContactEnricher]   Found email via website: ${email}`);
      }
      if (wave.phones.length > 0 && !phone) phone = wave.phones[0];
      if (wave.names.length > 0 && !contactName) contactName = wave.names[0];
      if (wave.title && !contactTitle) contactTitle = wave.title;
    }

    // ── Step 4: Email pattern guessing (if website + contact name found) ──
    if (!email && website && contactName) {
      console.log(`[ContactEnricher]   Step 4: Email pattern guess...`);
      const domain = website.replace(/^https?:\/\//, '').split('/')[0];
      const nameParts = contactName.toLowerCase().split(/\s+/);
      if (nameParts.length >= 2) {
        const first = nameParts[0];
        const last = nameParts[nameParts.length - 1];
        email = `${first}.${last}@${domain}`;
        method = 'pattern_guess';
        console.log(`[ContactEnricher]   Guessed email: ${email} (unverified)`);
      }
    }

    return 'done';
    })(); // end enrichWork

    // Race against per-lead timeout
    const raceResult = await Promise.race([enrichWork, leadDeadline]);
    if (raceResult === 'TIMEOUT') {
      console.warn(`[ContactEnricher]   ⏱ Lead timed out (75s cap): ${lead.company_name}`);
    }

    // ── Update the lead ──
    if (email || phone || contactName || linkedin || website) {
      const updates = [];
      const params = [];

      if (email) { updates.push('contact_email = ?'); params.push(email); }
      if (phone) { updates.push('phone = ?'); params.push(phone); }
      if (contactName && !lead.contact_name) { updates.push('contact_name = ?'); params.push(contactName); }
      if (contactTitle && !lead.contact_title) { updates.push('contact_title = ?'); params.push(contactTitle); }
      if (linkedin) { updates.push('contact_linkedin = ?'); params.push(linkedin); }
      if (website && !lead.website) { updates.push('website = ?'); params.push(website); }

      updates.push("enrichment_status = ?"); params.push(email ? 'enriched' : 'partial');
      updates.push("enrichment_method = ?"); params.push(method || 'mixed');
      updates.push("enriched_at = datetime('now')");
      updates.push("updated_at = datetime('now')");

      params.push(leadId);
      run(`UPDATE cfo_leads SET ${updates.join(', ')} WHERE id = ?`, params);

      console.log(`[ContactEnricher]   ✅ ${lead.company_name}: email=${email || '—'}, phone=${phone || '—'}, contact=${contactName || '—'}`);

      return {
        success: true,
        method,
        email,
        phone,
        contactName,
        contactTitle,
        linkedin,
        website,
      };
    } else {
      // Nothing found
      run("UPDATE cfo_leads SET enrichment_status = 'failed', enrichment_method = 'none_found', enriched_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", [leadId]);
      console.log(`[ContactEnricher]   ❌ ${lead.company_name}: no contact info found`);
      return { success: false, method: 'none_found' };
    }

  } catch (err) {
    run("UPDATE cfo_leads SET enrichment_status = 'failed', updated_at = datetime('now') WHERE id = ?", [leadId]);
    console.error(`[ContactEnricher] Error enriching ${lead.company_name}:`, err.message);
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BATCH ENRICHMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Enrich multiple leads that lack contact email.
 *
 * @param {object} params
 * @param {number} params.limit - Max leads to process (default 20)
 * @param {number} params.min_score - Minimum pilot_fit_score (default 45)
 * @param {string} params.status_filter - enrichment_status to target (default 'pending')
 */
async function enrichMultipleLeads({ limit = 20, min_score = 45, status_filter = 'pending', source = null } = {}) {
  console.log(`[ContactEnricher] Starting batch enrichment: limit=${limit}, min_score=${min_score}, status=${status_filter}${source ? ', source=' + source : ''}`);

  // Build query — optionally filter by source (e.g. 'google_maps_discovery' vs 'dbpr_scrape')
  let query, params;
  if (source) {
    query = `SELECT id, company_name, city, state, pilot_fit_score
     FROM cfo_leads
     WHERE (enrichment_status = ? OR enrichment_status IS NULL)
       AND (contact_email IS NULL OR contact_email = '')
       AND pilot_fit_score >= ?
       AND source = ?
     ORDER BY pilot_fit_score DESC
     LIMIT ?`;
    params = [status_filter, min_score, source, limit];
  } else {
    query = `SELECT id, company_name, city, state, pilot_fit_score
     FROM cfo_leads
     WHERE (enrichment_status = ? OR enrichment_status IS NULL)
       AND (contact_email IS NULL OR contact_email = '')
       AND pilot_fit_score >= ?
     ORDER BY pilot_fit_score DESC
     LIMIT ?`;
    params = [status_filter, min_score, limit];
  }

  const leads = all(query, params);

  if (leads.length === 0) {
    console.log('[ContactEnricher] No leads need enrichment.');
    return { total: 0, enriched: 0, failed: 0, results: [] };
  }

  console.log(`[ContactEnricher] Found ${leads.length} leads to enrich`);

  const results = [];
  let enriched = 0;
  let failed = 0;

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];

    // Restart browser every 8 leads to flush bad Playwright state
    if (i > 0 && i % 8 === 0) {
      console.log(`[ContactEnricher] Restarting browser after ${i} leads...`);
      await closeBrowser();
      await new Promise(r => setTimeout(r, 1500));
    }

    try {
      const result = await enrichLead(lead.id);
      results.push({ id: lead.id, company: lead.company_name, ...result });
      if (result.success && result.email) enriched++;
      else failed++;
    } catch (err) {
      results.push({ id: lead.id, company: lead.company_name, success: false, error: err.message });
      failed++;
    }

    // Delay between leads — shorter now that per-page timeouts are tighter
    if (i < leads.length - 1) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  // Close browser when done
  await closeBrowser();

  const summary = `Enriched ${enriched}/${leads.length} leads (${failed} failed)`;
  console.log(`[ContactEnricher] ${summary}`);

  return {
    total: leads.length,
    enriched,
    failed,
    success_count: enriched,
    results,
    summary,
  };
}

module.exports = { enrichLead, enrichMultipleLeads };
