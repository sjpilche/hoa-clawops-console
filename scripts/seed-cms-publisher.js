/**
 * seed-cms-publisher.js
 * Seeds the hoa-cms-publisher agent and a Monday 8:30 AM schedule.
 * Run: node scripts/seed-cms-publisher.js
 *
 * This agent uses a special_handler (github_publisher) — it runs deterministic
 * Node.js code to push blog posts to GitHub, NOT an LLM. Cost: $0.00/run.
 */
require('dotenv').config({ path: '.env.local' });
const { initDatabase, get, run } = require('../server/db/connection');

async function seed() {
  await initDatabase();

  // ── Agent ─────────────────────────────────────────────────────────────────
  const agentId = 'hoa-cms-publisher';
  const existing = get('SELECT id FROM agents WHERE id = ?', [agentId]);

  if (!existing) {
    run(
      `INSERT INTO agents (id, name, description, status, config) VALUES (?, ?, ?, 'active', ?)`,
      [
        agentId,
        'HOA CMS Publisher',
        'Publishes approved blog posts to hoaprojectfunding.com via GitHub API. No LLM needed — deterministic code that pushes markdown to the React site repo. Netlify auto-deploys.',
        JSON.stringify({
          special_handler: 'github_publisher',
          repo: 'sjpilche/hoaprojectfunding.com',
          posts_dir: 'outputs/blog-posts',
          soul_path: 'openclaw-skills/hoa-cms-publisher/SOUL.md',
        }),
      ]
    );
    console.log('✅ Agent created: hoa-cms-publisher');
  } else {
    // Update the config if the agent already exists (migrate from old git-CLI approach)
    run(
      `UPDATE agents SET config = ?, description = ?, updated_at = datetime('now') WHERE id = ?`,
      [
        JSON.stringify({
          special_handler: 'github_publisher',
          repo: 'sjpilche/hoaprojectfunding.com',
          posts_dir: 'outputs/blog-posts',
          soul_path: 'openclaw-skills/hoa-cms-publisher/SOUL.md',
        }),
        'Publishes approved blog posts to hoaprojectfunding.com via GitHub API. No LLM needed — deterministic code that pushes markdown to the React site repo. Netlify auto-deploys.',
        agentId,
      ]
    );
    console.log('ℹ️  Agent updated: hoa-cms-publisher (config refreshed)');
  }

  // ── Schedule: Monday 8:30 AM (30 min after content writer) ───────────────
  const scheduleId = 'sched-cms-publisher-weekly';
  const existingSched = get('SELECT id FROM schedules WHERE id = ?', [scheduleId]);

  if (!existingSched) {
    run(
      `INSERT INTO schedules (id, name, description, agent_id, agent_name, cron_expression, message, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        scheduleId,
        'Weekly Blog Publisher',
        'Publishes the latest blog post to hoaprojectfunding.com every Monday at 8:30 AM — 30 minutes after the content writer generates it. Finds the newest markdown in outputs/blog-posts/, converts it to JSON, and pushes to GitHub. Netlify deploys automatically.',
        agentId,
        'HOA CMS Publisher',
        '30 8 * * 1',
        'Publish the latest blog post to hoaprojectfunding.com. Find the most recently generated markdown in outputs/blog-posts/ and push it to the GitHub repo.',
      ]
    );
    console.log('✅ Schedule created: Weekly Blog Publisher (Monday 8:30 AM)');
  } else {
    console.log('ℹ️  Schedule already exists:', scheduleId);
  }

  console.log('\n🎉 Done! Pipeline summary:');
  console.log('   Monday 8:00 AM → hoa-content-writer → generates blog post markdown');
  console.log('   Monday 8:30 AM → hoa-cms-publisher → pushes to GitHub → Netlify deploys');
  console.log('   ~60 seconds later → post live at https://hoaprojectfunding.com/Blog');
  console.log('\n   Cost: ~$0.02/week (content writer only — publisher is free)');

  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
