/**
 * @file mgmtContactPuller.js
 * @description Agent 37: Management Company Contact Puller
 *
 * Scrapes management company websites for decision-maker contacts,
 * vendor pathways, branch offices, and email patterns.
 *
 * Cost: $0 — Playwright web scraping, no LLM calls.
 * Schedule: On-demand (after Agent 36/40)
 */

const { chromium } = require('playwright');
const { v4: uuidv4 } = require('uuid');
const { run, get, all } = require('../db/connection');
const { classifyContactType, sleep } = require('./mgmtCompanyUtils');
const azure = require('./mgmtAzureSync');

const CONFIG = {
  headless: true,
  timeout: 30000,
  pageLoadWait: 3000,
  betweenPages: 2000,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
};

// Pages to check for contact info
const CONTACT_PATHS = [
  '/about', '/about-us', '/leadership', '/our-team', '/team', '/staff',
  '/contact', '/contact-us',
  '/vendors', '/vendor-registration', '/vendor-portal',
  '/partners', '/become-a-partner', '/partnership',
  '/locations', '/offices', '/branches', '/markets',
];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run contact extraction for a management company.
 * @param {Object} params
 * @param {string} params.company_name
 * @param {string} params.company_url
 * @param {string} [params.mgmt_company_id]
 */
async function runContactPuller(params = {}) {
  const { company_name, company_url, mgmt_company_id } = params;

  if (!company_name || !company_url) {
    throw new Error('company_name and company_url are required');
  }

  const runId = uuidv4();
  const startTime = Date.now();

  console.log(`[Agent 37] Starting contact extraction: ${company_name}`);
  console.log(`[Agent 37] URL: ${company_url}`);

  // Azure SQL — ensure tables + create run record (non-fatal)
  await azure.ensureTables();
  const azureRunId = await azure.azureCreateRun('mgmt_contact_puller', company_name);

  const contacts = [];
  const vendorPathway = { has_vendor_portal: false };
  let emailPattern = null;
  let generalContact = {};

  let browser;
  try {
    browser = await chromium.launch({
      headless: CONFIG.headless,
      args: ['--disable-blink-features=AutomationControlled'],
    });

    const context = await browser.newContext({
      userAgent: CONFIG.userAgent,
      viewport: { width: 1920, height: 1080 },
    });

    const page = await context.newPage();

    // Step 1: General contact from main page
    await page.goto(company_url, { timeout: CONFIG.timeout, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(CONFIG.pageLoadWait);

    generalContact = await extractGeneralContact(page);

    // Step 2: Scan all relevant pages
    for (const pathSuffix of CONTACT_PATHS) {
      try {
        const url = new URL(pathSuffix, company_url).toString();
        const response = await page.goto(url, { timeout: 15000, waitUntil: 'domcontentloaded' });
        if (!response || response.status() !== 200) continue;

        await page.waitForTimeout(CONFIG.betweenPages);

        // Check if this is a vendor page
        const isVendorPage = pathSuffix.includes('vendor') || pathSuffix.includes('partner');
        if (isVendorPage) {
          const vpInfo = await extractVendorPathway(page, url);
          if (vpInfo.has_vendor_portal) {
            Object.assign(vendorPathway, vpInfo);
          }
        }

        // Extract people (team/leadership pages)
        const isTeamPage = pathSuffix.includes('team') || pathSuffix.includes('leadership') ||
                          pathSuffix.includes('staff') || pathSuffix.includes('about');
        if (isTeamPage) {
          const people = await extractPeople(page);
          contacts.push(...people);
        }

        // Extract branch offices
        const isBranchPage = pathSuffix.includes('location') || pathSuffix.includes('office') ||
                            pathSuffix.includes('branch') || pathSuffix.includes('market');
        if (isBranchPage) {
          const branches = await extractBranches(page);
          contacts.push(...branches);
        }

        // Extract emails from any page
        const pageEmails = await extractEmails(page);
        if (pageEmails.length > 0 && !emailPattern) {
          emailPattern = detectEmailPattern(pageEmails, company_url);
        }
      } catch (e) {
        // Page doesn't exist or error — continue
      }
    }

    await browser.close();
  } catch (err) {
    console.error(`[Agent 37] Error: ${err.message}`);
    if (browser) await browser.close();
  }

  // Deduplicate contacts by name
  const uniqueContacts = deduplicateContacts(contacts);

  // Save to database
  let contactCount = 0;
  let decisionMakerCount = 0;

  for (const contact of uniqueContacts) {
    insertContact(contact, company_name, mgmt_company_id);
    contactCount++;
    const ctype = classifyContactType(contact.title);
    if (['c_suite', 'operations', 'biz_dev', 'vendor_relations'].includes(ctype)) {
      decisionMakerCount++;
    }
  }

  // Determine outreach priority
  const outreachPriority = determineOutreachPriority(vendorPathway, decisionMakerCount, generalContact);

  // Update management company record
  if (mgmt_company_id) {
    run(`
      UPDATE management_companies SET
        contacts_pulled = 1,
        vendor_portal_url = ?,
        vendor_email = ?,
        vendor_phone = ?,
        has_vendor_program = ?,
        email_pattern = ?,
        outreach_priority = ?,
        hq_address = COALESCE(?, hq_address),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      vendorPathway.vendor_page_url || null,
      vendorPathway.vendor_email || null,
      vendorPathway.vendor_phone || null,
      vendorPathway.has_vendor_portal ? 1 : 0,
      emailPattern || null,
      outreachPriority,
      generalContact.hq_address || null,
      mgmt_company_id,
    ]);

    // Azure sync — update pipeline flags
    azure.azureUpdateCompanyPipeline(mgmt_company_id, {
      contacts_pulled: true,
      has_vendor_program: vendorPathway.has_vendor_portal,
      outreach_priority: outreachPriority,
    }).catch(() => {});
  }

  const duration = Math.round((Date.now() - startTime) / 1000);

  const summary = {
    run_id: runId,
    company_name,
    contacts_found: contactCount,
    decision_makers: decisionMakerCount,
    has_vendor_portal: vendorPathway.has_vendor_portal,
    email_pattern: emailPattern,
    outreach_priority: outreachPriority,
    duration_seconds: duration,
    cost_usd: 0,
  };

  console.log(`[Agent 37] COMPLETE — ${contactCount} contacts, ${decisionMakerCount} decision makers, priority: ${outreachPriority}, ${duration}s`);

  // Azure SQL — complete run + close pool
  await azure.azureCompleteRun(azureRunId, { results_found: contactCount, new_records: decisionMakerCount });
  await azure.closePool();

  return summary;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXTRACTION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

async function extractGeneralContact(page) {
  return await page.evaluate(() => {
    const text = document.body.textContent || '';

    // Phone
    const phoneMatch = text.match(/(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/);
    const phone = phoneMatch ? phoneMatch[1] : '';

    // Email
    const emailMatch = text.match(/(info|contact|hello|general)@[\w.-]+\.\w{2,}/i);
    const email = emailMatch ? emailMatch[0] : '';

    // Address: look for structured address patterns
    const addressMatch = text.match(/\d+\s[A-Za-z\s]+(?:St|Ave|Blvd|Dr|Rd|Way|Ln|Ct|Pl|Pkwy)[^,]*,\s*[A-Za-z\s]+,\s*[A-Z]{2}\s*\d{5}/);
    const address = addressMatch ? addressMatch[0] : '';

    return { main_phone: phone, main_email: email, hq_address: address };
  });
}

async function extractVendorPathway(page, url) {
  return await page.evaluate((pageUrl) => {
    const text = document.body.textContent || '';
    const result = {
      has_vendor_portal: true,
      vendor_page_url: pageUrl,
      vendor_email: '',
      vendor_phone: '',
      preferred_vendor_program: false,
    };

    // Vendor-specific email
    const emailMatch = text.match(/(vendor|partner|supplier)[\w.-]*@[\w.-]+\.\w{2,}/i);
    if (emailMatch) result.vendor_email = emailMatch[0];

    // Vendor phone
    const phoneMatch = text.match(/(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/);
    if (phoneMatch) result.vendor_phone = phoneMatch[1];

    // Preferred vendor program
    if (text.match(/preferred vendor|approved vendor|vendor program/i)) {
      result.preferred_vendor_program = true;
    }

    return result;
  }, url);
}

async function extractPeople(page) {
  return await page.evaluate(() => {
    const people = [];

    // Look for team member cards
    const cardSelectors = [
      '.team-member', '.staff-member', '.leader', '.person',
      '[class*="team"]', '[class*="staff"]', '[class*="leader"]',
    ];

    let cards = [];
    for (const sel of cardSelectors) {
      cards = document.querySelectorAll(sel);
      if (cards.length >= 2) break;
    }

    if (cards.length >= 2) {
      for (const card of cards) {
        const nameEl = card.querySelector('h2, h3, h4, h5, .name, strong');
        const titleEl = card.querySelector('.title, .position, .role, p, span');
        const name = nameEl ? nameEl.textContent.trim() : '';
        const title = titleEl ? titleEl.textContent.trim() : '';
        if (!name || name.length < 3) continue;

        // Email from mailto: links
        const emailEl = card.querySelector('a[href^="mailto:"]');
        const email = emailEl ? emailEl.getAttribute('href').replace('mailto:', '').split('?')[0] : '';

        // Phone
        const phoneEl = card.querySelector('a[href^="tel:"]');
        const phone = phoneEl ? phoneEl.getAttribute('href').replace('tel:', '') : '';

        // LinkedIn
        const linkedinEl = card.querySelector('a[href*="linkedin.com"]');
        const linkedin = linkedinEl ? linkedinEl.getAttribute('href') : '';

        people.push({
          type: 'person',
          name,
          title,
          email,
          phone,
          linkedin,
          location: '',
          region: '',
          bio: '',
        });
      }
    }

    return people;
  });
}

async function extractBranches(page) {
  return await page.evaluate(() => {
    const branches = [];

    // Look for location cards
    const cards = document.querySelectorAll('[class*="location"], [class*="office"], [class*="branch"], .card');

    for (const card of cards) {
      const text = card.textContent || '';
      const nameEl = card.querySelector('h2, h3, h4, h5, strong, .name');
      const location = nameEl ? nameEl.textContent.trim() : '';
      if (!location || location.length < 3) continue;

      const phoneMatch = text.match(/(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/);
      const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w{2,}/);
      const managerMatch = text.match(/(?:manager|director):\s*([A-Z][a-z]+ [A-Z][a-z]+)/i);

      branches.push({
        type: 'branch',
        name: managerMatch ? managerMatch[1] : '',
        title: 'Branch Manager',
        email: emailMatch ? emailMatch[0] : '',
        phone: phoneMatch ? phoneMatch[1] : '',
        linkedin: '',
        location,
        region: '',
        bio: '',
      });
    }

    return branches;
  });
}

async function extractEmails(page) {
  return await page.evaluate(() => {
    const emails = [];
    // Find all mailto: links
    document.querySelectorAll('a[href^="mailto:"]').forEach(el => {
      const email = el.getAttribute('href').replace('mailto:', '').split('?')[0];
      if (email && email.includes('@')) emails.push(email);
    });

    // Also regex scan body text
    const text = document.body.textContent || '';
    const matches = text.match(/[\w.-]+@[\w.-]+\.\w{2,}/g);
    if (matches) {
      for (const m of matches) {
        if (!emails.includes(m)) emails.push(m);
      }
    }

    return emails;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function detectEmailPattern(emails, companyUrl) {
  if (emails.length === 0) return null;

  // Get domain from company URL
  let domain;
  try { domain = new URL(companyUrl).hostname.replace('www.', ''); } catch (e) { return null; }

  // Filter to company domain emails
  const companyEmails = emails.filter(e => e.endsWith(`@${domain}`));
  if (companyEmails.length === 0) return null;

  // Detect pattern from first email
  const first = companyEmails[0];
  const local = first.split('@')[0];

  if (local.includes('.')) return `firstname.lastname@${domain}`;
  if (local.match(/^[a-z]{2,}$/)) return `firstname@${domain}`;
  if (local.match(/^[a-z][a-z]+$/)) return `flastname@${domain}`;

  return `unknown@${domain}`;
}

function deduplicateContacts(contacts) {
  const seen = new Set();
  return contacts.filter(c => {
    const key = `${c.name}|${c.title}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function determineOutreachPriority(vendorPathway, decisionMakers, generalContact) {
  if (vendorPathway.has_vendor_portal && vendorPathway.vendor_email) return 'CRITICAL';
  if (vendorPathway.has_vendor_portal || decisionMakers >= 2) return 'HIGH';
  if (decisionMakers >= 1 || generalContact.main_email) return 'MEDIUM';
  return 'LOW';
}

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE
// ═══════════════════════════════════════════════════════════════════════════

function insertContact(contact, companyName, mgmtCompanyId) {
  if (!contact.name && !contact.email) return;

  const contactType = classifyContactType(contact.title);

  run(`
    INSERT INTO mgmt_company_contacts (
      mgmt_company_id, mgmt_company_name, contact_type,
      full_name, title, email, email_quality,
      phone, linkedin_url, office_location,
      region_covered, bio_notes, source_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    mgmtCompanyId || null,
    companyName,
    contactType,
    contact.name || null,
    contact.title || null,
    contact.email || null,
    contact.email ? 'verified' : 'unknown',
    contact.phone || null,
    contact.linkedin || null,
    contact.location || null,
    contact.region || null,
    contact.bio || null,
    null,
  ]);

  // Azure sync — fire-and-forget
  azure.azureWriteContact({
    mgmt_company_id: mgmtCompanyId || null,
    mgmt_company_name: companyName,
    contact_type: contactType,
    full_name: contact.name || null,
    title: contact.title || null,
    email: contact.email || null,
    email_quality: contact.email ? 'verified' : 'unknown',
    phone: contact.phone || null,
    linkedin_url: contact.linkedin || null,
    office_location: contact.location || null,
    source_url: null,
  }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = { runContactPuller };
