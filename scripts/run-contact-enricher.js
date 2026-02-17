/**
 * @file run-contact-enricher.js
 * @description CLI script to run Contact Enricher (Agent 3)
 *
 * Usage:
 *   node scripts/run-contact-enricher.js --limit=10
 *   node scripts/run-contact-enricher.js --limit=5 --tier=HOT
 */

const { enrichMultipleLeads } = require('../server/services/hoaContactEnricher');

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

console.log('\n🦁 HOA CONTACT ENRICHER - AGENT 3\n');

// Run enrichment
enrichMultipleLeads(params)
  .then(result => {
    if (result.success) {
      console.log('✅ Enrichment completed successfully!');
      console.log('');
      console.log('Next steps:');
      console.log('1. ✅ View enriched contacts:');
      console.log('   SELECT * FROM contacts ORDER BY created_at DESC;');
      console.log('2. ⏭️  Run Agent 4 (Outreach Drafter) for enriched leads');
      console.log('3. ⏭️  Review and send outreach emails');
      process.exit(0);
    } else {
      console.error('❌ Enrichment failed:', result.error);
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
