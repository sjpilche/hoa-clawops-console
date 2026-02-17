/**
 * @file run-minutes-monitor.js
 * @description CLI script to run Minutes Monitor (Agent 2)
 *
 * Usage:
 *   node scripts/run-minutes-monitor.js --limit=20
 *   node scripts/run-minutes-monitor.js --limit=10 --state=FL --priority_min=8
 */

const { scanMultipleHOAs } = require('../server/services/hoaMinutesMonitor');

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.split('=');
  const cleanKey = key.replace(/^--/, '');
  acc[cleanKey] = value || true;
  return acc;
}, {});

const params = {
  limit: parseInt(args.limit) || 20,
  state: args.state || null,
  priority_min: parseInt(args.priority_min) || 5
};

console.log('\n🦁 HOA MINUTES MONITOR - AGENT 2\n');

// Run scan
scanMultipleHOAs(params)
  .then(result => {
    if (result.success) {
      console.log('✅ Scan completed successfully!');
      console.log('');
      console.log('Next steps:');
      console.log('1. ✅ View HOT leads:');
      console.log('   SELECT * FROM scored_leads WHERE tier = \'HOT\' ORDER BY score DESC;');
      console.log('2. ⏭️  Run Agent 3 (Contact Enricher) for HOT leads');
      console.log('3. ⏭️  Run Agent 4 (Outreach Drafter) after enrichment');
      process.exit(0);
    } else {
      console.error('❌ Scan failed:', result.error);
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
