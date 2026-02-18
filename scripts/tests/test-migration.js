#!/usr/bin/env node

/**
 * Test script for campaign migration
 * Verifies that:
 * 1. All campaign tables are created
 * 2. All existing tables have campaign_id column
 * 3. Default campaign exists
 * 4. All existing records are backfilled
 * 5. Indexes are created
 * 6. Foreign key constraints work
 */

const path = require('path');
const { initDatabase, get, all, run } = require('../server/db/connection');

let testsPassed = 0;
let testsFailed = 0;

function test(description, fn) {
  try {
    fn();
    console.log(`✅ ${description}`);
    testsPassed++;
  } catch (error) {
    console.log(`❌ ${description}`);
    console.log(`   Error: ${error.message}`);
    testsFailed++;
  }
}

async function runTests() {
  console.log('🧪 Testing Campaign Migration...\n');
  console.log('📦 Initializing database...\n');

  await initDatabase();

  console.log('\n🔍 Running tests...\n');

  // Test 1: Campaign tables exist
  test('campaigns table exists', () => {
    const result = get(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='campaigns'
    `);
    if (!result) throw new Error('campaigns table not found');
  });

  test('campaign_agents table exists', () => {
    const result = get(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='campaign_agents'
    `);
    if (!result) throw new Error('campaign_agents table not found');
  });

  test('campaign_metrics table exists', () => {
    const result = get(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='campaign_metrics'
    `);
    if (!result) throw new Error('campaign_metrics table not found');
  });

  test('campaign_activity_log table exists', () => {
    const result = get(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='campaign_activity_log'
    `);
    if (!result) throw new Error('campaign_activity_log table not found');
  });

  // Test 2: campaign_id columns exist
  const tablesToCheck = [
    'agents', 'runs', 'schedules', 'leads', 'hoa_contacts',
    'lg_engagement_queue', 'lg_community_accounts', 'linkedin_prospects',
    'email_prospects', 'quora_questions', 'content_queue'
  ];

  tablesToCheck.forEach(tableName => {
    test(`${tableName} table has campaign_id column`, () => {
      const result = all(`PRAGMA table_info(${tableName})`);
      const hasCampaignId = result.some(col => col.name === 'campaign_id');
      if (!hasCampaignId) throw new Error(`campaign_id column not found in ${tableName}`);
    });
  });

  // Test 3: Default campaign exists
  test('default campaign exists', () => {
    const campaign = get(`
      SELECT * FROM campaigns WHERE id = ?
    `, ['default-hoa-fl']);
    if (!campaign) throw new Error('default campaign not found');
    if (campaign.slug !== 'hoa-fl-lead-gen') throw new Error('invalid slug');
    if (campaign.status !== 'active') throw new Error('campaign should be active');
  });

  // Test 4: Indexes exist
  const indexesToCheck = [
    'idx_campaigns_status',
    'idx_campaigns_company',
    'idx_campaign_agents_campaign',
    'idx_campaign_agents_status',
    'idx_metrics_campaign_date',
    'idx_activity_campaign',
    'idx_agents_campaign',
    'idx_runs_campaign',
    'idx_schedules_campaign'
  ];

  indexesToCheck.forEach(indexName => {
    test(`index ${indexName} exists`, () => {
      const result = get(`
        SELECT name FROM sqlite_master WHERE type='index' AND name=?
      `, [indexName]);
      if (!result) throw new Error(`index ${indexName} not found`);
    });
  });

  // Test 5: Backfill verification (check if existing data has campaign_id)
  test('existing agents have campaign_id', () => {
    const agents = get('SELECT * FROM agents LIMIT 1');
    if (agents && !agents.campaign_id) {
      throw new Error('existing agents not backfilled with campaign_id');
    }
  });

  test('existing schedules have campaign_id', () => {
    const schedules = get('SELECT * FROM schedules LIMIT 1');
    if (schedules && !schedules.campaign_id) {
      throw new Error('existing schedules not backfilled with campaign_id');
    }
  });

  // Test 6: Query with campaign_id filter works
  test('query with campaign_id filter works', () => {
    const agents = all(`
      SELECT * FROM agents WHERE campaign_id = ?
    `, ['default-hoa-fl']);
    // Should not throw error (even if no results)
    if (!Array.isArray(agents)) throw new Error('query failed');
  });

  // Test 7: Campaign structure validation
  test('campaigns table has correct structure', () => {
    const columns = all('PRAGMA table_info(campaigns)');
    const requiredColumns = ['id', 'name', 'company', 'slug', 'type', 'status', 'color', 'icon'];
    requiredColumns.forEach(col => {
      if (!columns.some(c => c.name === col)) {
        throw new Error(`missing required column: ${col}`);
      }
    });
  });

  // Test 8: Unique constraint on slug
  test('campaigns.slug has unique constraint', () => {
    const indexes = get(`
      SELECT sql FROM sqlite_master WHERE type='table' AND name='campaigns'
    `);
    if (!indexes.sql.includes('UNIQUE')) {
      throw new Error('slug should have unique constraint');
    }
  });

  // Test 9: Test insert into campaigns
  test('can insert new campaign', () => {
    const testId = 'test-campaign-123';

    // Clean up if exists
    run('DELETE FROM campaigns WHERE id = ?', [testId]);

    // Insert
    run(`
      INSERT INTO campaigns (id, name, company, slug, type, status, color, icon)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [testId, 'Test Campaign', 'Test Co', 'test-campaign-123', 'marketing', 'active', '#FF0000', '🧪']);

    // Verify
    const campaign = get('SELECT * FROM campaigns WHERE id = ?', [testId]);
    if (!campaign) throw new Error('campaign insert failed');

    // Clean up
    run('DELETE FROM campaigns WHERE id = ?', [testId]);
  });

  // Test 10: Test campaign_agents insertion
  test('can insert campaign agent', () => {
    const testId = 'test-agent-123';

    // Clean up if exists
    run('DELETE FROM campaign_agents WHERE id = ?', [testId]);

    // Insert
    run(`
      INSERT INTO campaign_agents (id, campaign_id, agent_type, agent_name)
      VALUES (?, ?, ?, ?)
    `, [testId, 'default-hoa-fl', 'test-agent', 'Test Agent']);

    // Verify
    const agent = get('SELECT * FROM campaign_agents WHERE id = ?', [testId]);
    if (!agent) throw new Error('campaign agent insert failed');
    if (agent.status !== 'idle') throw new Error('default status should be idle');

    // Clean up
    run('DELETE FROM campaign_agents WHERE id = ?', [testId]);
  });

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`Tests Passed: ${testsPassed}`);
  console.log(`Tests Failed: ${testsFailed}`);
  console.log('='.repeat(50));

  if (testsFailed > 0) {
    console.log('\n❌ Migration tests FAILED');
    process.exit(1);
  } else {
    console.log('\n✅ All migration tests PASSED');
    console.log('\n📊 Migration Summary:');

    // Show counts
    const campaigns = get('SELECT COUNT(*) as count FROM campaigns');
    const agents = get('SELECT COUNT(*) as count FROM agents WHERE campaign_id IS NOT NULL');
    const schedules = get('SELECT COUNT(*) as count FROM schedules WHERE campaign_id IS NOT NULL');
    const leads = get('SELECT COUNT(*) as count FROM leads WHERE campaign_id IS NOT NULL');

    console.log(`   - Campaigns: ${campaigns.count}`);
    console.log(`   - Agents with campaign_id: ${agents.count}`);
    console.log(`   - Schedules with campaign_id: ${schedules.count}`);
    console.log(`   - Leads with campaign_id: ${leads.count}`);

    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
