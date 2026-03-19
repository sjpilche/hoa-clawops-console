#!/usr/bin/env node
/**
 * One-time script: Enrich HOA communities with contacts via Apollo
 *
 * Reads the 12 distinct management companies from hoa_communities,
 * calls Apollo searchPeople for property manager contacts,
 * and inserts results into hoa_contacts.
 *
 * Usage:
 *   node scripts/enrich-hoa-contacts-apollo.js --dry-run   # Preview only
 *   node scripts/enrich-hoa-contacts-apollo.js              # Actually insert
 *   node scripts/enrich-hoa-contacts-apollo.js --limit 5    # Limit to 5 mgmt companies
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env.local') });

const crypto = require('crypto');
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.resolve(__dirname, '..', 'data', 'clawops.db');
const db = new Database(DB_PATH);

// ── Parse CLI args ──
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) || 12 : 12;

const HOA_TITLES = [
  'Property Manager', 'Community Manager', 'HOA Manager',
  'General Manager', 'Regional Manager', 'Community Association Manager',
  'President', 'Vice President', 'Director of Operations',
];

// ── Apollo API (inline to avoid server require chain) ──
const APOLLO_BASE = 'https://api.apollo.io';

async function apolloFetch(method, path, { body = null, params = null } = {}) {
  const apiKey = process.env.APOLLO_API_KEY;
  let url = `${APOLLO_BASE}${path}`;
  if (params) url += '?' + new URLSearchParams(params).toString();

  const opts = {
    method,
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' },
  };
  if (body && method === 'POST') opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);

  if (res.status === 429) {
    const wait = parseInt(res.headers.get('retry-after') || '5') * 1000;
    console.log(`  Rate limited, waiting ${wait}ms...`);
    await new Promise(r => setTimeout(r, Math.min(wait, 30000)));
    return apolloFetch(method, path, { body, params });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Apollo HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

/**
 * Search for people then reveal their emails via bulk_match.
 * Apollo free search returns obfuscated results (no last name, no email).
 * We do search + bulk_match to get full contact data including emails.
 */
async function apolloSearchAndReveal({ companyName, location, titles, limit = 5 }) {
  if (!process.env.APOLLO_API_KEY) throw new Error('APOLLO_API_KEY not set');

  // Step 1: Search to get person IDs
  const body = {
    person_titles: titles || HOA_TITLES,
    q_organization_name: companyName,
    per_page: limit,
  };
  if (location) body.organization_locations = [location];

  const searchData = await apolloFetch('POST', '/api/v1/mixed_people/api_search', { body });
  const searchPeople = searchData.people || [];
  if (searchPeople.length === 0) return [];

  // Filter to people with emails available
  const revealable = searchPeople.filter(p => p.has_email && p.id);
  if (revealable.length === 0) {
    console.log(`  Search found ${searchPeople.length} people but none have emails`);
    return [];
  }

  // Step 2: Bulk match to reveal emails (costs credits)
  const matchData = await apolloFetch('POST', '/api/v1/people/bulk_match', {
    body: { details: revealable.map(p => ({ id: p.id })) },
  });

  const matches = matchData.matches || [];
  const creditsUsed = matchData.credits_consumed || 0;
  console.log(`  Revealed ${matches.filter(Boolean).length} contacts (${creditsUsed} credits used)`);

  return matches.filter(Boolean).map(p => ({
    name: p.name || [p.first_name, p.last_name].filter(Boolean).join(' ') || null,
    email: p.email || null,
    phone: p.phone_numbers?.[0]?.sanitized_number || null,
    title: p.title || null,
    linkedin_url: p.linkedin_url || null,
    org_name: p.organization?.name || null,
  }));
}

// ── Main ──
async function main() {
  console.log(`\nHOA Contact Apollo Enrichment ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'}`);
  console.log('='.repeat(60));

  if (!process.env.APOLLO_API_KEY) {
    console.error('ERROR: APOLLO_API_KEY not set in .env.local');
    process.exit(1);
  }

  // Get distinct management companies with community counts
  const mgmtCompanies = db.prepare(`
    SELECT management_company, COUNT(*) as community_count
    FROM hoa_communities
    WHERE management_company IS NOT NULL
    GROUP BY management_company
    ORDER BY COUNT(*) DESC
    LIMIT ?
  `).all(LIMIT);

  console.log(`Found ${mgmtCompanies.length} management companies to search\n`);

  let totalContacts = 0;
  let totalCompaniesHit = 0;

  const checkStmt = db.prepare(`SELECT id FROM hoa_contacts WHERE fingerprint = ?`);
  const insertStmt = db.prepare(`
    INSERT INTO hoa_contacts (
      hoa_name, contact_person, title, email, phone,
      city, state, management_company,
      source_url, source_type, confidence_score, status,
      fingerprint, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < mgmtCompanies.length; i++) {
    const { management_company, community_count } = mgmtCompanies[i];
    console.log(`[${i + 1}/${mgmtCompanies.length}] ${management_company} (${community_count} communities)`);

    try {
      const people = await apolloSearchAndReveal({
        companyName: management_company,
        location: 'Florida',
        titles: HOA_TITLES,
        limit: 5,
      });

      if (people.length === 0) {
        console.log(`  No contacts found\n`);
        continue;
      }

      totalCompaniesHit++;

      // Get all communities for this mgmt company
      const communities = db.prepare(
        'SELECT id, name, city, state FROM hoa_communities WHERE management_company = ?'
      ).all(management_company);

      for (const person of people) {
        if (!person.email && !person.name) continue;

        console.log(`  ${person.name || '?'} | ${person.title || '?'} | ${person.email || 'no email'}`);

        if (DRY_RUN) {
          totalContacts++;
          continue;
        }

        // Insert one contact row per community linked to this mgmt company
        for (const comm of communities) {
          const fingerprint = crypto.createHash('md5')
            .update(`${(person.name || '').toLowerCase()}|${(person.email || '').toLowerCase()}|${comm.name.toLowerCase()}`)
            .digest('hex');

          // Skip duplicates (fingerprint index exists but no UNIQUE constraint)
          if (checkStmt.get(fingerprint)) continue;

          try {
            insertStmt.run(
              comm.name,
              person.name || null,
              person.title || null,
              person.email || null,
              person.phone || null,
              comm.city || 'Unknown',          // NOT NULL column
              comm.state || 'FL',
              management_company,
              person.linkedin_url || 'apollo', // NOT NULL column
              'apollo',                        // NOT NULL column
              person.email ? 80 : 40,
              'new',
              fingerprint,                     // NOT NULL column
              person.org_name ? `Org: ${person.org_name}` : null,
            );
            totalContacts++;
          } catch (e) {
            console.error(`  Insert error: ${e.message}`);
          }
        }

        // Update community enrichment status
        db.prepare(`
          UPDATE hoa_communities
          SET contact_enrichment_status = 'complete', needs_contact_enrichment = 0
          WHERE management_company = ?
        `).run(management_company);
      }

      console.log('');
    } catch (err) {
      console.error(`  ERROR: ${err.message}\n`);
    }

    // Rate limit: 500ms between companies
    if (i < mgmtCompanies.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  const finalCount = DRY_RUN ? '(dry run)' : db.prepare('SELECT COUNT(*) as cnt FROM hoa_contacts').get().cnt;

  console.log('='.repeat(60));
  console.log(`DONE: ${totalCompaniesHit}/${mgmtCompanies.length} companies had contacts`);
  console.log(`Contacts ${DRY_RUN ? 'found' : 'inserted'}: ${totalContacts}`);
  console.log(`Total hoa_contacts: ${finalCount}`);

  db.close();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
