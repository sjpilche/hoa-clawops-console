/**
 * @file run-hoa-discovery.js
 * @description CLI script to run HOA Discovery (Agent 1)
 *
 * Usage:
 *   node scripts/run-hoa-discovery.js --source=mock --state=FL --limit=20
 *   node scripts/run-hoa-discovery.js --source=fl-dbpr --limit=1000
 *   node scripts/run-hoa-discovery.js --source=co-dora --limit=500
 *
 * Sources:
 *   mock      - Generate test data (default)
 *   fl-dbpr   - Florida DBPR Open Data (25,000+ HOAs)
 *   co-dora   - Colorado DORA Registry (10,000+ HOAs)
 *   ca-sos    - California Secretary of State (5,000+ HOAs)
 */

const { discoverHOAs } = require('../server/services/hoaDiscovery');

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.split('=');
  const cleanKey = key.replace(/^--/, '');
  acc[cleanKey] = value || true;
  return acc;
}, {});

const params = {
  source: args.source || 'mock',
  state: args.state || 'FL',
  limit: parseInt(args.limit) || 100
};

console.log('\n🦁 HOA DISCOVERY - AGENT 1\n');

// Run discovery
discoverHOAs(params)
  .then(result => {
    if (result.success) {
      console.log('✅ Discovery completed successfully!');
      console.log('');
      console.log('Next steps:');
      console.log('1. ✅ Check database: sqlite3 hoa_leads.sqlite "SELECT COUNT(*) FROM hoa_communities;"');
      console.log('2. ⏭️  Run Agent 2 (Minutes Monitor): node scripts/run-minutes-monitor.js');
      process.exit(0);
    } else {
      console.error('❌ Discovery failed:', result.error);
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
