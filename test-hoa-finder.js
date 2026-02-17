/**
 * Quick test script to verify HOA Contact Finder is working
 * Run: node test-hoa-finder.js
 */

require('dotenv').config({ path: '.env.local' });
const { initDatabase, get, all } = require('./server/db/connection');

async function test() {
  await initDatabase();

  console.log('\n🔍 HOA CONTACT FINDER - SYSTEM CHECK\n');
  console.log('='.repeat(50));

  // 1. Check agent exists
  const agent = get('SELECT * FROM agents WHERE id = ?', ['hoa-contact-finder']);
  if (!agent) {
    console.log('❌ Agent not found! Run: node scripts/seed-hoa-contact-finder.js');
    process.exit(1);
  }

  console.log('✅ Agent exists:', agent.name);
  const config = JSON.parse(agent.config);
  console.log('   Special handler:', config.special_handler);
  console.log('   Supported states:', config.supported_states.join(', '));
  console.log('   Status:', agent.status);

  // 2. Check tables exist
  const contactsTable = get("SELECT name FROM sqlite_master WHERE type='table' AND name='hoa_contacts'");
  const historyTable = get("SELECT name FROM sqlite_master WHERE type='table' AND name='hoa_search_history'");

  console.log('\n✅ Database tables:');
  console.log('   hoa_contacts:', contactsTable ? '✓' : '✗');
  console.log('   hoa_search_history:', historyTable ? '✓' : '✗');

  // 3. Check current data
  const contactCount = get('SELECT COUNT(*) as count FROM hoa_contacts');
  const searchCount = get('SELECT COUNT(*) as count FROM hoa_search_history');

  console.log('\n📊 Current data:');
  console.log('   Total contacts:', contactCount.count);
  console.log('   Total searches:', searchCount.count);

  if (contactCount.count > 0) {
    const byCity = all('SELECT city, COUNT(*) as count FROM hoa_contacts GROUP BY city ORDER BY count DESC LIMIT 5');
    console.log('\n📍 Top cities:');
    byCity.forEach(row => console.log(`   ${row.city}: ${row.count} contacts`));

    const byStatus = all('SELECT status, COUNT(*) as count FROM hoa_contacts GROUP BY status');
    console.log('\n📋 Status breakdown:');
    byStatus.forEach(row => console.log(`   ${row.status}: ${row.count}`));
  }

  // 4. Show UI endpoints
  console.log('\n🌐 Available endpoints:');
  console.log('   Frontend: http://localhost:5174/hoa-leads');
  console.log('   API: http://localhost:3001/api/hoa-contacts');
  console.log('   Agent API: http://localhost:3001/api/agents/hoa-contact-finder');

  // 5. Test instructions
  console.log('\n🚀 READY TO TEST!');
  console.log('='.repeat(50));
  console.log('\nNext steps:');
  console.log('1. Make sure server is running: npm run dev');
  console.log('2. Open: http://localhost:5174/hoa-leads');
  console.log('3. Click "New Search" button');
  console.log('4. Enter city: San Diego');
  console.log('5. Click "Search"');
  console.log('6. Wait 2-3 seconds for results');
  console.log('7. You should see 10 mock HOA contacts appear!');

  console.log('\n💡 To run a search via CLI (for testing):');
  console.log('   node scripts/run-hoa-search.js --city="San Diego"');

  console.log('\n📖 Documentation:');
  console.log('   Setup guide: HOA-CONTACT-FINDER-GUIDE.md');
  console.log('   Strategy: HOA-CONTACT-FINDER-STRATEGY.md');

  process.exit(0);
}

test().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
