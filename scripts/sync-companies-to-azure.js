/**
 * One-time sync: push all management_companies from SQLite to Azure SQL.
 * Usage: node scripts/sync-companies-to-azure.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });
const { initDatabase, all } = require('../server/db/connection');
const azure = require('../server/services/mgmtAzureSync');

(async () => {
  console.log('\n=== SYNC: SQLite management_companies to Azure SQL ===\n');
  await initDatabase();
  const companies = all('SELECT id, name, website_url, website, phone, email, city, state, priority_tier, cai_designations, communities_managed, google_rating, google_review_count, company_health, switching_signals, outreach_priority, has_vendor_program, portfolio_scraped, contacts_pulled, portfolio_mapped, reviews_scanned, source FROM management_companies ORDER BY communities_managed DESC');
  console.log('Found', companies.length, 'companies to sync\n');
  await azure.ensureTables();
  let synced = 0;
  for (const c of companies) {
    try {
      await azure.azureUpsertCompany({ id: c.id, name: c.name, website_url: c.website_url || c.website, phone: c.phone, email: c.email, city: c.city, state: c.state, priority_tier: c.priority_tier, communities_managed: c.communities_managed, google_rating: c.google_rating, source: c.source });
      await azure.azureUpdateCompanyPipeline(c.id, { portfolio_scraped: !!c.portfolio_scraped, contacts_pulled: !!c.contacts_pulled, portfolio_mapped: !!c.portfolio_mapped, reviews_scanned: !!c.reviews_scanned, google_rating: c.google_rating, company_health: c.company_health, switching_signals: c.switching_signals });
      console.log('  OK:', c.name, '(' + c.priority_tier + ')');
      synced++;
    } catch(e) { console.log('  FAIL:', c.name, e.message); }
  }
  await azure.closePool();
  console.log('\nDone:', synced, 'synced');
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
