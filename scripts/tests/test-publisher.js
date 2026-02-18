/**
 * Quick test of the GitHub publisher service (no server needed).
 * Directly calls publishPost() to verify GitHub API connectivity.
 * Run: node scripts/test-publisher.js
 */
require('dotenv').config({ path: '.env.local' });

async function main() {
  const { publishPost } = require('../server/services/githubPublisher');
  console.log('Testing GitHub publisher...\n');
  const result = await publishPost('Publish the latest blog post');
  console.log(result);
}

main().catch(e => {
  console.error('❌ Publisher test failed:', e.message);
  process.exit(1);
});
