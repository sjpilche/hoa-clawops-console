/**
 * Migrate to Table-Level Isolation
 * Migrates existing campaigns from campaign_id-based isolation to table-level isolation
 */

const { initDatabase, all } = require('../server/db/connection');
const campaignTableManager = require('../server/services/campaignTableManager');

async function migrateToTableIsolation() {
  await initDatabase();

  console.log('🚀 MIGRATING TO TABLE-LEVEL ISOLATION\n');
  console.log('This will create campaign-specific tables and migrate data.');
  console.log('Old shared tables will NOT be deleted (backup safety).\n');
  console.log('='.repeat(50) + '\n');

  // Get all campaigns
  const campaigns = all('SELECT id, slug, name, status FROM campaigns ORDER BY created_at');

  if (!campaigns || campaigns.length === 0) {
    console.log('⚠️  No campaigns found in database.\n');
    console.log('This is normal if you haven\'t created any campaigns yet.');
    console.log('Table-level isolation will be enabled automatically when you create campaigns.\n');
    return;
  }

  console.log(`Found ${campaigns.length} campaign(s):\n`);

  campaigns.forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.name} (${c.slug}) - ${c.status}`);
  });

  console.log('\n' + '='.repeat(50) + '\n');

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const campaign of campaigns) {
    console.log(`📦 Campaign: ${campaign.name}`);
    console.log(`   Slug: ${campaign.slug}`);
    console.log(`   ID: ${campaign.id}`);
    console.log(`   Status: ${campaign.status}\n`);

    try {
      // Check if tables already exist
      if (campaignTableManager.tablesExist(campaign.slug)) {
        console.log('  ⚠️  Tables already exist for this campaign');

        // Show current record counts
        const counts = campaignTableManager.getRecordCounts(campaign.slug);
        console.log('  📊 Current record counts:');
        console.log(`     Leads: ${counts.leads}`);
        console.log(`     Runs: ${counts.runs}`);
        console.log(`     Content Queue: ${counts.content_queue}`);
        console.log(`     HOA Contacts: ${counts.hoa_contacts}`);
        console.log('  ℹ️  Skipping creation and migration\n');

        skipped++;
        continue;
      }

      // Create campaign tables
      console.log('  🔨 Creating campaign-specific tables...');
      await campaignTableManager.createCampaignTables(campaign.slug);

      // Migrate data from shared tables to campaign tables
      console.log('  📦 Migrating data from shared tables...');
      await campaignTableManager.migrateData(campaign.id, campaign.slug);

      // Verify migration
      const counts = campaignTableManager.getRecordCounts(campaign.slug);
      console.log('  ✅ Migration complete!');
      console.log('  📊 Record counts in new tables:');
      console.log(`     Leads: ${counts.leads}`);
      console.log(`     Runs: ${counts.runs}`);
      console.log(`     Content Queue: ${counts.content_queue}`);
      console.log(`     HOA Contacts: ${counts.hoa_contacts}\n`);

      migrated++;

    } catch (error) {
      console.error(`  ❌ Migration failed: ${error.message}`);
      console.error(`     ${error.stack}\n`);
      errors++;
    }
  }

  console.log('='.repeat(50));
  console.log('MIGRATION SUMMARY');
  console.log('='.repeat(50));
  console.log(`Total campaigns: ${campaigns.length}`);
  console.log(`Migrated: ${migrated}`);
  console.log(`Skipped (already migrated): ${skipped}`);
  console.log(`Errors: ${errors}`);
  console.log('='.repeat(50) + '\n');

  if (errors > 0) {
    console.log('❌ Migration completed with errors. Review output above.\n');
    process.exit(1);
  } else if (migrated > 0) {
    console.log('✅ All campaigns successfully migrated to table-level isolation!\n');
    console.log('⚠️  IMPORTANT NOTES:');
    console.log('  1. Old shared tables (leads, runs, content_queue, hoa_contacts) still exist');
    console.log('  2. Verify all data migrated correctly before dropping shared tables');
    console.log('  3. Run table isolation tests: node scripts/test-table-isolation.js');
    console.log('  4. Test multi-tenant system: node scripts/test-multi-tenant.js\n');
  } else {
    console.log('ℹ️  All campaigns already using table-level isolation.\n');
  }
}

// Run migration
migrateToTableIsolation().catch(err => {
  console.error('\n❌ FATAL ERROR during migration:');
  console.error(err);
  console.error('\n⚠️  Migration stopped. Database may be in partial state.');
  console.error('Review error above and fix before retrying.\n');
  process.exit(1);
});
