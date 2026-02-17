/**
 * seed-facebook-poster.js
 * Creates the hoa-facebook-poster agent in the DB and sets up its schedule.
 * Run once: node scripts/seed-facebook-poster.js
 */

require('dotenv').config({ path: '.env.local' });
const { initDatabase, get, run, all } = require('../server/db/connection');

async function seed() {
  await initDatabase();

  // ── 1. Upsert agent ───────────────────────────────────────────────────────
  const agentId = 'hoa-facebook-poster';
  const existing = get('SELECT id FROM agents WHERE id = ?', [agentId]);

  if (!existing) {
    run(
      `INSERT INTO agents (id, name, description, status, config)
       VALUES (?, ?, ?, 'active', ?)`,
      [
        agentId,
        'HOA Facebook Poster',
        'Publishes pending posts from the content queue to the HOA Project Funding Facebook page.',
        JSON.stringify({
          openclaw_id: agentId,
          soul_path: 'openclaw-skills/hoa-facebook-poster/SOUL.md',
          platform: 'facebook',
        }),
      ]
    );
    console.log('✅ Agent created: hoa-facebook-poster');
  } else {
    console.log('ℹ️  Agent already exists: hoa-facebook-poster');
  }

  // ── 2. Upsert schedule — runs daily at 10:00 AM ───────────────────────────
  const scheduleId = 'sched-facebook-poster-daily';
  const existingSched = get('SELECT id FROM schedules WHERE id = ?', [scheduleId]);

  if (!existingSched) {
    run(
      `INSERT INTO schedules (id, name, description, agent_id, agent_name, cron_expression, message, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        scheduleId,
        'Facebook Daily Publisher',
        'Publishes any pending content queue posts to Facebook at 10 AM every day.',
        agentId,
        'HOA Facebook Poster',
        '0 10 * * *',
        'Check the content queue and publish any posts that are due. Report what was published and what failed.',
      ]
    );
    console.log('✅ Schedule created: Daily at 10:00 AM');
  } else {
    console.log('ℹ️  Schedule already exists: sched-facebook-poster-daily');
  }

  // ── 3. Upsert schedule — content generator runs daily at 9:45 AM ─────────
  const genScheduleId = 'sched-facebook-content-daily';
  const existingGenSched = get('SELECT id FROM schedules WHERE id = ?', [genScheduleId]);

  if (!existingGenSched) {
    run(
      `INSERT INTO schedules (id, name, description, agent_id, agent_name, cron_expression, message, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        genScheduleId,
        'Facebook Content Generator',
        'Generates a Facebook post and adds it to the content queue at 9:45 AM, ready for the 10 AM publisher.',
        'hoa-social-media',
        'HOA Social Media',
        '45 9 * * *',
        'Generate a Facebook PAGE post about HOA project funding topics — grant programs, funding tips, community success stories, or financing options. Include a CTA to www.hoaprojectfunding.com and 3-5 relevant hashtags. Then call POST /api/content-queue with the generated content (platform: "facebook", post_type: "page", topic: the topic you chose, source_agent: "hoa-social-media"). Return ONLY the post text you generated.',
      ]
    );
    console.log('✅ Schedule created: Content Generator at 9:45 AM');
  } else {
    console.log('ℹ️  Schedule already exists: sched-facebook-content-daily');
  }

  // ── 4. Show current queue stats ───────────────────────────────────────────
  const queueStats = all(
    `SELECT status, COUNT(*) as count FROM content_queue GROUP BY status`,
    []
  );
  console.log('\n📋 Content queue stats:');
  if (queueStats.length === 0) {
    console.log('   (empty — add posts via UI or POST /api/content-queue)');
  } else {
    queueStats.forEach(row => console.log(`   ${row.status}: ${row.count}`));
  }

  console.log('\n🎉 Done! Restart the server to pick up the new route.');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
