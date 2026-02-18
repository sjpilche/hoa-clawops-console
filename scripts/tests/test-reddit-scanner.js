/**
 * Test Reddit Scanner
 *
 * Manually test the Reddit scanner to verify API credentials and functionality
 *
 * Usage: node scripts/test-reddit-scanner.js
 */

require('dotenv').config({ path: '.env.local' });
const { scanReddit } = require('../server/services/platformScanner');
const { initDatabase } = require('../server/db/connection');

async function testRedditScanner() {
  console.log('\n🧪 Testing Reddit Scanner...\n');

  // Check if credentials are configured
  const requiredVars = [
    'REDDIT_CLIENT_ID',
    'REDDIT_CLIENT_SECRET',
    'REDDIT_USERNAME',
    'REDDIT_PASSWORD'
  ];

  const missing = requiredVars.filter(v => !process.env[v]);

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(v => console.error(`   - ${v}`));
    console.error('\nPlease follow REDDIT-SETUP.md to configure Reddit API credentials.\n');
    process.exit(1);
  }

  console.log('✅ Reddit API credentials found');
  console.log(`   Username: ${process.env.REDDIT_USERNAME}`);
  console.log(`   Client ID: ${process.env.REDDIT_CLIENT_ID?.substring(0, 8)}...`);
  console.log('');

  try {
    // Initialize database
    await initDatabase();

    // Run Reddit scanner
    console.log('🔍 Scanning Reddit subreddits...\n');
    const results = await scanReddit();

    console.log('\n✨ Test complete!');
    console.log('\n📊 Results:');
    console.log(`   Posts scanned: ${results.scanned}`);
    console.log(`   Added to queue: ${results.added}`);
    console.log(`   Skipped: ${results.skipped}`);

    if (results.added > 0) {
      console.log('\n✅ Success! Posts were added to your Engagement Queue.');
      console.log('   View them at: http://localhost:5174/engagement-queue\n');
    } else if (results.scanned === 0) {
      console.log('\n⚠️  No posts found. This could mean:');
      console.log('   1. Subreddits are quiet today');
      console.log('   2. No posts match your keywords in the last 24 hours');
      console.log('   3. Try again in a few hours\n');
    } else {
      console.log('\n⚠️  Posts were scanned but none scored high enough (70+) to add to queue.');
      console.log('   This is normal - not every post is a good opportunity.\n');
    }

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Reddit scanner test failed:');
    console.error(`   ${error.message}\n`);

    if (error.message.includes('401')) {
      console.error('💡 This looks like an authentication error. Check:');
      console.error('   1. REDDIT_CLIENT_ID is correct');
      console.error('   2. REDDIT_CLIENT_SECRET is correct');
      console.error('   3. REDDIT_USERNAME and REDDIT_PASSWORD are correct\n');
    } else if (error.message.includes('403')) {
      console.error('💡 This looks like a permissions error. Check:');
      console.error('   1. Your Reddit account is at least 1 week old');
      console.error('   2. Your account has at least 50 karma');
      console.error('   3. You\'re subscribed to the subreddits\n');
    } else if (error.message.includes('429')) {
      console.error('💡 Rate limit hit. Wait a few minutes and try again.\n');
    }

    process.exit(1);
  }
}

testRedditScanner();
