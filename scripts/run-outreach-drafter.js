/**
 * @file run-outreach-drafter.js
 * @description CLI script to run Outreach Drafter (Agent 4)
 *
 * Usage:
 *   node scripts/run-outreach-drafter.js --limit=10
 *   node scripts/run-outreach-drafter.js --limit=5 --tier=HOT
 */

const { draftMultipleOutreach } = require('../server/services/hoaOutreachDrafter');

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.split('=');
  const cleanKey = key.replace(/^--/, '');
  acc[cleanKey] = value || true;
  return acc;
}, {});

const params = {
  limit: parseInt(args.limit) || 10,
  tier: args.tier || null
};

console.log('\n🦁 HOA OUTREACH DRAFTER - AGENT 4\n');

// Run drafting
draftMultipleOutreach(params)
  .then(result => {
    if (result.success) {
      console.log('✅ Drafting completed successfully!');
      console.log('');
      console.log('Next steps:');
      console.log('1. ✅ View drafts:');
      console.log('   SELECT * FROM outreach_queue WHERE status = \'draft\' ORDER BY created_at DESC;');
      console.log('2. ⏭️  Review drafts in /hoa-outreach-queue page (coming soon)');
      console.log('3. ⏭️  Approve and send outreach emails');
      process.exit(0);
    } else {
      console.error('❌ Drafting failed:', result.error);
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
