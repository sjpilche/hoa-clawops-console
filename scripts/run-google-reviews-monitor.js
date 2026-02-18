/**
 * @file run-google-reviews-monitor.js
 * @description CLI script to run Google Reviews Monitor (Agent 5)
 *
 * Usage:
 *   node scripts/run-google-reviews-monitor.js --limit=10
 *   node scripts/run-google-reviews-monitor.js --limit=5 --tier=HOT
 */

const { monitorMultipleHOAs } = require('../server/services/googleReviewsMonitor');

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

console.log('\n🦁 GOOGLE REVIEWS MONITOR - AGENT 5\n');

// Run monitoring
monitorMultipleHOAs(params)
  .then(result => {
    if (result.success) {
      console.log('✅ Monitoring completed successfully!');
      console.log('');
      console.log('Next steps:');
      console.log('1. ✅ View HOT leads:');
      console.log('   SELECT * FROM hoa_communities WHERE google_signal_tier = \'HOT\' ORDER BY google_signal_score DESC;');
      console.log('2. ⏭️  Run Agent 3 (Contact Enricher) for HOT leads');
      console.log('3. ⏭️  Run Agent 4 (Outreach Drafter) after enrichment');
      process.exit(0);
    } else {
      console.error('❌ Monitoring failed:', result.error);
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
