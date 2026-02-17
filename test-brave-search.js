/**
 * Test Brave Search API integration
 * Run: node test-brave-search.js
 *
 * REQUIREMENTS:
 * - BRAVE_API_KEY in .env.local
 */

require('dotenv').config({ path: '.env.local' });
const { searchHOAsWithBrave } = require('./server/services/braveSearcher');

async function test() {
  console.log('\n🦁 BRAVE SEARCH API - TEST\n');
  console.log('='.repeat(50));

  // Check API key
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) {
    console.error('❌ BRAVE_API_KEY not found in .env.local');
    console.log('\nSetup:');
    console.log('1. Get your API key from https://brave.com/search/api/');
    console.log('2. Add to .env.local:');
    console.log('   BRAVE_API_KEY=BSAxxxxx');
    console.log('3. Run this test again');
    process.exit(1);
  }

  console.log('✅ BRAVE_API_KEY found:', apiKey.substring(0, 10) + '...');
  console.log('');

  // Test city
  const testCity = 'Irvine';
  const testState = 'CA';

  console.log(`🔍 Testing search for: ${testCity}, ${testState}`);
  console.log('This will:');
  console.log('  1. Search Brave for HOA contacts');
  console.log('  2. Extract emails, phones, names from results');
  console.log('  3. Return structured contact data');
  console.log('');
  console.log('⏳ Please wait 6-8 seconds...');
  console.log('='.repeat(50));
  console.log('');

  try {
    const startTime = Date.now();
    const contacts = await searchHOAsWithBrave(testCity, testState);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('');
    console.log('='.repeat(50));
    console.log('✅ SEARCH COMPLETE');
    console.log('='.repeat(50));
    console.log(`Duration: ${duration}s`);
    console.log(`Results: ${contacts.length} contacts found`);
    console.log('');

    if (contacts.length === 0) {
      console.log('⚠️  No contacts found for', testCity);
      console.log('This is normal for some cities.');
      console.log('Try a larger city like "San Diego" or "Los Angeles"');
    } else {
      console.log('📋 CONTACTS FOUND:');
      console.log('='.repeat(50));

      contacts.forEach((contact, i) => {
        console.log(`\n${i + 1}. ${contact.hoa_name}`);
        if (contact.contact_person) console.log(`   Contact: ${contact.contact_person}`);
        if (contact.email) console.log(`   Email: ${contact.email}`);
        if (contact.phone) console.log(`   Phone: ${contact.phone}`);
        if (contact.source_url) console.log(`   Source: ${contact.source_url}`);
        console.log(`   Confidence: ${contact.confidence_score}%`);
      });

      console.log('');
      console.log('='.repeat(50));
      console.log('🎉 SUCCESS! Brave Search is working!');
      console.log('');
      console.log('Next steps:');
      console.log('1. Run: node scripts/run-hoa-search.js --city="San Diego" --use_brave=true --use_mock=false');
      console.log('2. This will save results to your database');
      console.log('3. View in UI: http://localhost:5174/hoa-leads');
    }

    process.exit(0);

  } catch (error) {
    console.error('');
    console.error('='.repeat(50));
    console.error('❌ TEST FAILED');
    console.error('='.repeat(50));
    console.error('Error:', error.message);
    console.error('');

    if (error.message.includes('401')) {
      console.error('→ Invalid API key. Check BRAVE_API_KEY in .env.local');
    } else if (error.message.includes('429')) {
      console.error('→ Rate limit exceeded. Wait a moment and try again.');
    } else if (error.message.includes('BRAVE_API_KEY')) {
      console.error('→ Add BRAVE_API_KEY to .env.local');
    } else {
      console.error('Stack trace:');
      console.error(error.stack);
    }

    process.exit(1);
  }
}

test();
