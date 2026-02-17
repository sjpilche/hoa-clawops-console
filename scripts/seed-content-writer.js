/**
 * seed-content-writer.js
 * Seeds the hoa-content-writer agent and a weekly schedule.
 * Run: node scripts/seed-content-writer.js
 */
require('dotenv').config({ path: '.env.local' });
const { initDatabase, get, run } = require('../server/db/connection');

async function seed() {
  await initDatabase();

  // ── Agent ─────────────────────────────────────────────────────────────────
  const agentId = 'hoa-content-writer';
  const existing = get('SELECT id FROM agents WHERE id = ?', [agentId]);

  if (!existing) {
    run(
      `INSERT INTO agents (id, name, description, status, config) VALUES (?, ?, ?, 'active', ?)`,
      [
        agentId,
        'HOA Content Writer',
        'Writes SEO-optimized blog posts for HOA Project Funding. 1,400-1,800 words, 12-topic rotation covering SIRS compliance, loan frameworks, project types, and authority content.',
        JSON.stringify({
          openclaw_id: agentId,
          soul_path: 'openclaw-skills/hoa-content-writer/SOUL.md',
          output_dir: 'outputs/blog-posts',
        }),
      ]
    );
    console.log('✅ Agent created: hoa-content-writer');
  } else {
    console.log('ℹ️  Agent already exists: hoa-content-writer');
  }

  // ── Weekly schedule — every Monday at 8 AM ───────────────────────────────
  const scheduleId = 'sched-content-writer-weekly';
  const existingSched = get('SELECT id FROM schedules WHERE id = ?', [scheduleId]);

  if (!existingSched) {
    run(
      `INSERT INTO schedules (id, name, description, agent_id, agent_name, cron_expression, message, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        scheduleId,
        'Weekly Blog Post',
        'Generates one SEO-optimized blog post every Monday at 8 AM, rotating through the 12-topic content calendar.',
        agentId,
        'HOA Content Writer',
        '0 8 * * 1',
        'Write the next blog post in the rotation following your full SOUL.md workflow. Pick the next unwritten topic from the 12-topic list (start with "Florida SIRS Funding Guide 2026" if none have been written yet). Complete the full post: research, outline, write 1400-1800 words, add YAML frontmatter, run quality checklist, output the completed markdown and summary block.',
      ]
    );
    console.log('✅ Schedule created: Weekly Blog Post (Monday 8 AM)');
  } else {
    console.log('ℹ️  Schedule already exists:', scheduleId);
  }

  // ── Make output dir ───────────────────────────────────────────────────────
  const fs = require('fs');
  const outputDir = 'outputs/blog-posts';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log('✅ Created output directory:', outputDir);
  } else {
    console.log('ℹ️  Output directory exists:', outputDir);
  }

  console.log('\n🎉 Done! Restart server to pick up agent.');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
