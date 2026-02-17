/**
 * CLI test runner for HOA Contact Finder
 * Run: node scripts/run-hoa-search.js --city="San Diego"
 * Run: node scripts/run-hoa-search.js --city="Irvine" --zip="92618"
 */

require('dotenv').config({ path: '.env.local' });
const { initDatabase, get, all, run } = require('../server/db/connection');
const { searchHOAContacts } = require('../server/services/hoaContactScraper');

async function runSearch() {
  await initDatabase();

  // Parse command line args
  const args = process.argv.slice(2);
  const params = {};

  args.forEach(arg => {
    const [key, value] = arg.split('=');
    const cleanKey = key.replace('--', '');
    params[cleanKey] = value.replace(/['"]/g, '');
  });

  // Defaults
  params.state = params.state || 'CA';
  params.use_mock = params.use_mock !== 'false'; // Default to true

  if (!params.city) {
    console.error('❌ Error: --city parameter required');
    console.log('\nUsage:');
    console.log('  node scripts/run-hoa-search.js --city="San Diego"');
    console.log('  node scripts/run-hoa-search.js --city="Irvine" --zip="92618"');
    console.log('  node scripts/run-hoa-search.js --city="Oakland" --use_mock=false');
    process.exit(1);
  }

  console.log('\n🔍 HOA CONTACT SEARCH');
  console.log('='.repeat(50));
  console.log('City:', params.city);
  console.log('State:', params.state);
  if (params.zip) console.log('Zip:', params.zip);
  console.log('Mode:', params.use_mock ? 'MOCK DATA' : 'REAL SCRAPING');
  console.log('='.repeat(50));
  console.log('');

  try {
    const startTime = Date.now();
    const result = await searchHOAContacts(params);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n✅ SEARCH COMPLETE');
    console.log('='.repeat(50));
    console.log('Duration:', duration + 's');
    console.log('Total Found:', result.results.total_found);
    console.log('New Contacts:', result.results.new_contacts);
    console.log('Duplicates Skipped:', result.results.duplicates_skipped);
    console.log('Search ID:', result.search_id);

    if (result.results.new_contacts > 0) {
      console.log('\n📋 SAMPLE CONTACTS (first 3):');
      console.log('='.repeat(50));

      const contacts = all(
        `SELECT * FROM hoa_contacts ORDER BY scraped_at DESC LIMIT 3`,
        []
      );

      contacts.forEach((contact, i) => {
        console.log(`\n${i + 1}. ${contact.hoa_name}`);
        console.log(`   Contact: ${contact.contact_person || 'N/A'} (${contact.title || 'N/A'})`);
        console.log(`   Email: ${contact.email || 'N/A'}`);
        console.log(`   Phone: ${contact.phone || 'N/A'}`);
        console.log(`   Address: ${contact.property_address || 'N/A'}`);
        console.log(`   City: ${contact.city}, ${contact.state} ${contact.zip || ''}`);
        console.log(`   Units: ${contact.unit_count || 'N/A'}`);
        console.log(`   Management: ${contact.management_company || 'N/A'}`);
        console.log(`   Confidence: ${contact.confidence_score}%`);
        console.log(`   Status: ${contact.status}`);
      });

      console.log('\n💾 All contacts saved to database');
      console.log('   View in UI: http://localhost:5174/hoa-leads');
      console.log('   Export CSV: Click "Export CSV" in UI');

      // Show total stats
      const totalContacts = get('SELECT COUNT(*) as count FROM hoa_contacts').count;
      const byCity = all('SELECT city, COUNT(*) as count FROM hoa_contacts GROUP BY city ORDER BY count DESC LIMIT 5');

      console.log('\n📊 TOTAL DATABASE STATS:');
      console.log('   Total contacts:', totalContacts);
      console.log('   Top cities:');
      byCity.forEach(row => console.log(`     ${row.city}: ${row.count}`));
    }

    console.log('\n🎉 Success!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ SEARCH FAILED');
    console.error('='.repeat(50));
    console.error('Error:', error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    process.exit(1);
  }
}

runSearch();
