/**
 * Seed sample activity events for testing
 */

const { initDatabase, get, all, run } = require('../server/db/connection');
const { v4: uuid } = require('uuid');
const campaignMetrics = require('../server/services/campaignMetrics');

async function seedActivity() {
  await initDatabase();

  console.log('🌱 Seeding sample activity...\n');

  // Get any campaign (prefer one with agents)
  const campaigns = all('SELECT c.id, c.slug, COUNT(ca.id) as agent_count FROM campaigns c LEFT JOIN campaign_agents ca ON c.id = ca.campaign_id GROUP BY c.id ORDER BY agent_count DESC LIMIT 1');

  const campaign = campaigns[0];

  if (!campaign) {
    console.log('❌ No campaigns found');
    return;
  }

  console.log(`📊 Campaign: ${campaign.id} (${campaign.slug})`);

  // Get some agents (or create fake ones for activity purposes)
  let agents = all('SELECT id, agent_name FROM campaign_agents WHERE campaign_id = ? LIMIT 5', [campaign.id]);

  if (agents.length === 0) {
    console.log('⚠️  No agents assigned - using placeholder agents for activity');
    // Create placeholder agent data for activity logging
    agents = [
      { id: null, agent_name: 'Content Writer' },
      { id: null, agent_name: 'CMS Publisher' },
      { id: null, agent_name: 'Social Media Agent' },
      { id: null, agent_name: 'Email Campaign Agent' },
      { id: null, agent_name: 'Lead Discovery Agent' },
    ];
  }

  console.log(`🤖 Found ${agents.length} agents`);

  // Sample events
  const events = [
    {
      agentId: agents[0]?.id,
      eventType: 'agent_run',
      severity: 'success',
      title: `${agents[0]?.agent_name || 'Agent'} completed successfully`,
      detail: { duration: 1234, output: 'Generated 3 blog post ideas' }
    },
    {
      agentId: agents[1]?.id,
      eventType: 'agent_run',
      severity: 'success',
      title: `${agents[1]?.agent_name || 'Agent'} published content`,
      detail: { articles: 2, platform: 'Website' }
    },
    {
      agentId: agents[2]?.id,
      eventType: 'agent_error',
      severity: 'error',
      title: `${agents[2]?.agent_name || 'Agent'} failed - timeout`,
      detail: { error: 'Request timeout after 30s' }
    },
    {
      agentId: null,
      eventType: 'campaign_created',
      severity: 'info',
      title: 'Campaign created',
      detail: { source: 'migration' }
    },
    {
      agentId: agents[3]?.id,
      eventType: 'agent_run',
      severity: 'success',
      title: `${agents[3]?.agent_name || 'Agent'} found 12 new leads`,
      detail: { leads: 12, source: 'HOA discovery' }
    },
    {
      agentId: agents[0]?.id,
      eventType: 'agent_run',
      severity: 'warning',
      title: `${agents[0]?.agent_name || 'Agent'} completed with warnings`,
      detail: { warnings: ['API rate limit approaching'] }
    },
    {
      agentId: null,
      eventType: 'agent_assigned',
      severity: 'info',
      title: 'New agent assigned to campaign',
      detail: { agentName: agents[0]?.agent_name }
    },
    {
      agentId: agents[4]?.id,
      eventType: 'agent_run',
      severity: 'success',
      title: `${agents[4]?.agent_name || 'Agent'} sent 5 emails`,
      detail: { sent: 5, opened: 2 }
    },
  ];

  // Insert events
  for (const event of events) {
    campaignMetrics.logActivity(
      campaign.id,
      event.agentId,
      event.eventType,
      event.severity,
      event.title,
      event.detail
    );
  }

  console.log(`\n✅ Created ${events.length} activity events`);

  // Also seed some metrics for the past week
  console.log('\n📊 Seeding metrics...');

  for (let i = 7; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);

    run(`
      INSERT INTO campaign_metrics (id, campaign_id, date, leads_generated, emails_sent, agent_runs, agent_errors, replies_received, cost_estimate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(campaign_id, date) DO UPDATE SET
        leads_generated = excluded.leads_generated,
        emails_sent = excluded.emails_sent,
        agent_runs = excluded.agent_runs
    `, [
      uuid(),
      campaign.id,
      date.toISOString().split('T')[0],
      Math.floor(Math.random() * 10) + 5, // 5-15 leads
      Math.floor(Math.random() * 20) + 10, // 10-30 emails
      agents.length + Math.floor(Math.random() * 3), // agent count + 0-3
      Math.floor(Math.random() * 2), // 0-2 errors
      Math.floor(Math.random() * 5), // 0-5 replies
      (Math.random() * 0.5).toFixed(2) // $0.00-$0.50
    ]);
  }

  console.log('✅ Created metrics for past 7 days');
  console.log('\n🎉 Sample data seeded!');
  console.log('Visit http://localhost:5174/c/hoa-fl-lead-gen to see the activity feed\n');
}

seedActivity().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
