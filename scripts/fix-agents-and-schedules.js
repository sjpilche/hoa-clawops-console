/**
 * @file fix-agents-and-schedules.js
 * @description Cleans up duplicate agents, deduplicates schedules, and creates
 *              schedules for all agents that should be running on autopilot.
 *
 * Run: node scripts/fix-agents-and-schedules.js
 *
 * What it does:
 * 1. Removes duplicate agents (keeps slug-name versions, deletes display-name dupes)
 * 2. Removes duplicate schedules (keeps the most recently used one per agent)
 * 3. Re-points any orphaned schedules to the correct (slug-name) agent IDs
 * 4. Creates schedules for all agents that don't have one
 *
 * Safe to re-run — idempotent.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Load environment
const envPath = path.resolve(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath });

const { initDatabase, all, get, run } = require('../server/db/connection');
const { v4: uuidv4 } = require('uuid');

// The canonical agent fleet — slug names only, with optimal schedules
const SCHEDULE_PLAN = [
  // ── Core ──
  { agent: 'daily-debrief', cron: '0 18 * * *', message: '{}', description: 'End-of-day war room report — 6 PM daily' },

  // ── HOA Marketing ──
  { agent: 'hoa-content-writer', cron: '0 8 * * 1', message: 'Write a new SEO blog post for hoaprojectfunding.com', description: 'Monday 8 AM — weekly blog post' },
  { agent: 'hoa-cms-publisher', cron: '30 8 * * 1', message: 'Publish latest blog post to GitHub/Netlify', description: 'Monday 8:30 AM — publish after writer finishes' },
  { agent: 'hoa-social-media', cron: '0 10 * * 1,3,5', message: 'Create social content from latest blog post', description: 'Mon/Wed/Fri 10 AM — social content from blog' },
  { agent: 'hoa-social-engagement', cron: '0 9 * * 1-5', message: 'Engage with Facebook groups and comments', description: 'Weekdays 9 AM — community engagement' },
  { agent: 'hoa-networker', cron: '0 14 * * 2,4', message: 'LinkedIn networking and relationship building', description: 'Tue/Thu 2 PM — LinkedIn networking' },
  { agent: 'hoa-email-campaigns', cron: '0 10 * * 5', message: 'Send weekly email newsletter', description: 'Friday 10 AM — weekly newsletter' },
  { agent: 'hoa-website-publisher', cron: '0 11 * * 1', message: 'Review and update website content', description: 'Monday 11 AM — website content refresh' },
  { agent: 'hoa-facebook-poster', cron: '0 10 * * *', message: 'Post today\'s content to Facebook page', description: 'Daily 10 AM — Facebook page post' },

  // ── HOA Pipeline ──
  { agent: 'hoa-discovery', cron: '0 6 * * 1', message: '{"limit": 3}', description: 'Monday 6 AM — discover HOAs across 3 geo-targets' },
  { agent: 'hoa-contact-finder', cron: '0 8 * * 2', message: '{"limit": 20}', description: 'Tuesday 8 AM — find contacts for top 20 HOAs' },
  { agent: 'hoa-contact-enricher', cron: '0 8 * * 3', message: '{"limit": 15, "tier": "HOT"}', description: 'Wednesday 8 AM — enrich HOT contacts' },
  { agent: 'hoa-outreach-drafter', cron: '0 9 * * 4', message: '{"limit": 10, "tier": "HOT"}', description: 'Thursday 9 AM — draft outreach for HOT leads' },

  // ── HOA Intel ──
  { agent: 'hoa-minutes-monitor', cron: '0 7 * * 1,4', message: '{"limit": 25}', description: 'Mon/Thu 7 AM — scan HOA meeting minutes for signals' },
  { agent: 'google-reviews-monitor', cron: '0 5 * * *', message: '{"limit": 15}', description: 'Daily 5 AM — monitor management company reviews' },

  // ── Mgmt Research ──
  { agent: 'mgmt-portfolio-scraper', cron: '0 3 * * 0', message: '{}', description: 'Sunday 3 AM — scrape management company portfolios' },
  { agent: 'mgmt-contact-puller', cron: '0 4 * * 0', message: '{}', description: 'Sunday 4 AM — pull management company contacts' },
  { agent: 'mgmt-portfolio-mapper', cron: '0 5 * * 0', message: '{}', description: 'Sunday 5 AM — map HOA-to-management relationships' },
  { agent: 'mgmt-review-scanner', cron: '0 4 * * *', message: '{}', description: 'Daily 4 AM — scan management company reviews' },
  { agent: 'mgmt-cai-scraper', cron: '0 2 * * 0', message: '{}', description: 'Sunday 2 AM — CAI directory refresh' },

  // ── CFO Marketing ──
  { agent: 'cfo-lead-scout', cron: '0 7 * * 1', message: '{}', description: 'Monday 7 AM — scrape DBPR for new contractor leads' },
  { agent: 'cfo-content-engine', cron: '0 8 * * 1,4', message: 'Write Steve Pilcher voice content for CFO marketing', description: 'Mon/Thu 8 AM — CFO content creation' },
  { agent: 'cfo-outreach-agent', cron: '0 9 * * 2,5', message: 'Draft personalized outreach emails for top CFO leads', description: 'Tue/Fri 9 AM — CFO cold outreach' },
  { agent: 'cfo-social-scheduler', cron: '0 11 * * 1,3,5', message: 'Schedule CFO marketing social posts', description: 'Mon/Wed/Fri 11 AM — CFO social scheduling' },
  { agent: 'cfo-analytics-monitor', cron: '0 6 * * *', message: 'Review marketing analytics and report', description: 'Daily 6 AM — CFO analytics review' },
  { agent: 'cfo-offer-proof-builder', cron: '0 10 * * 3', message: 'Build case studies from latest pilot results', description: 'Wednesday 10 AM — proof/case study building' },
  { agent: 'cfo-pilot-deliverer', cron: '0 9 * * 1', message: 'Check pilot delivery status and next steps', description: 'Monday 9 AM — pilot delivery coordination' },
];

async function main() {
  await initDatabase();

  console.log('\n=== PHASE 1: Clean up duplicate agents ===\n');

  // Get all agents
  const agents = all('SELECT id, name, config FROM agents ORDER BY name');
  console.log(`Total agents in DB: ${agents.length}`);

  // Group by slug-name: the canonical form uses hyphens, lowercase
  const slugAgents = new Map(); // slug -> agent row
  const displayAgents = []; // display-name dupes to remove

  for (const a of agents) {
    // Slug-name agents have hyphens and are all lowercase
    const isSlug = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.name);
    if (isSlug) {
      slugAgents.set(a.name, a);
    } else {
      // Check if there's a slug equivalent
      const possibleSlug = a.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      if (slugAgents.has(possibleSlug) || agents.some(x => x.name === possibleSlug && x.id !== a.id)) {
        displayAgents.push(a);
      }
    }
  }

  console.log(`Slug-name agents (canonical): ${slugAgents.size}`);
  console.log(`Display-name duplicates to clean: ${displayAgents.length}`);

  // Re-point any schedules, runs referencing display-name agent IDs to slug-name IDs
  for (const dupe of displayAgents) {
    const possibleSlug = dupe.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const canonical = slugAgents.get(possibleSlug);
    if (canonical) {
      // Re-point schedules
      const schedCount = all('SELECT id FROM schedules WHERE agent_id = ?', [dupe.id]);
      if (schedCount.length > 0) {
        run('UPDATE schedules SET agent_id = ?, agent_name = ? WHERE agent_id = ?', [canonical.id, canonical.name, dupe.id]);
        console.log(`  Migrated ${schedCount.length} schedule(s): "${dupe.name}" → "${canonical.name}"`);
      }

      // Re-point runs
      const runCount = get('SELECT COUNT(*) as c FROM runs WHERE agent_id = ?', [dupe.id]);
      if (runCount.c > 0) {
        run('UPDATE runs SET agent_id = ? WHERE agent_id = ?', [canonical.id, dupe.id]);
        console.log(`  Migrated ${runCount.c} run(s): "${dupe.name}" → "${canonical.name}"`);
      }

      // Delete the display-name agent
      run('DELETE FROM agents WHERE id = ?', [dupe.id]);
      console.log(`  Deleted duplicate: "${dupe.name}" (id: ${dupe.id.slice(0, 8)}...)`);
    }
  }

  // Verify
  const remaining = get('SELECT COUNT(*) as c FROM agents');
  console.log(`\nAgents after cleanup: ${remaining.c}`);

  console.log('\n=== PHASE 2: Deduplicate schedules ===\n');

  // For each agent, keep only the best schedule (most recently run, or the first one)
  const allScheds = all('SELECT * FROM schedules ORDER BY last_run_at DESC NULLS LAST, created_at ASC');
  const seenAgents = new Set();
  const toDelete = [];

  for (const s of allScheds) {
    if (seenAgents.has(s.agent_id)) {
      toDelete.push(s);
    } else {
      seenAgents.add(s.agent_id);
    }
  }

  for (const s of toDelete) {
    run('DELETE FROM schedules WHERE id = ?', [s.id]);
    console.log(`  Deleted duplicate schedule: "${s.name}" (cron: ${s.cron_expression})`);
  }

  console.log(`Removed ${toDelete.length} duplicate schedule(s)`);

  console.log('\n=== PHASE 3: Create/update schedules for all agents ===\n');

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const plan of SCHEDULE_PLAN) {
    // Find the canonical agent by slug name
    const agent = get('SELECT id, name FROM agents WHERE name = ?', [plan.agent]);
    if (!agent) {
      console.log(`  SKIP: Agent "${plan.agent}" not in DB — seed it first`);
      skipped++;
      continue;
    }

    // Check if schedule already exists for this agent
    const existing = get('SELECT * FROM schedules WHERE agent_id = ?', [agent.id]);
    if (existing) {
      // Update cron and message to match plan
      run(
        `UPDATE schedules SET cron_expression = ?, message = ?, description = ?, name = ?, enabled = 1, updated_at = datetime('now') WHERE id = ?`,
        [plan.cron, plan.message, plan.description, `${plan.agent} schedule`, existing.id]
      );
      updated++;
      console.log(`  Updated: ${plan.agent} → ${plan.cron} — ${plan.description}`);
    } else {
      // Create new schedule
      const id = uuidv4();
      run(
        `INSERT INTO schedules (id, name, description, agent_id, agent_name, cron_expression, message, enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [id, `${plan.agent} schedule`, plan.description, agent.id, agent.name, plan.cron, plan.message]
      );
      created++;
      console.log(`  Created: ${plan.agent} → ${plan.cron} — ${plan.description}`);
    }
  }

  console.log(`\nSchedules: ${created} created, ${updated} updated, ${skipped} skipped`);

  // ── Also handle "main" agent — NO schedule needed (it's the chat router) ──

  console.log('\n=== PHASE 4: Final verification ===\n');

  const finalAgents = get('SELECT COUNT(*) as c FROM agents');
  const finalSchedules = get('SELECT COUNT(*) as c FROM schedules WHERE enabled = 1');
  const unscheduled = all(`
    SELECT a.name FROM agents a
    WHERE a.id NOT IN (SELECT agent_id FROM schedules)
    AND a.name != 'main'
    ORDER BY a.name
  `);

  console.log(`Total agents: ${finalAgents.c}`);
  console.log(`Enabled schedules: ${finalSchedules.c}`);
  console.log(`Agents without schedules: ${unscheduled.length}`);
  if (unscheduled.length > 0) {
    unscheduled.forEach(a => console.log(`  ⚠️  ${a.name}`));
  }

  // Print full schedule for review
  console.log('\n=== COMPLETE SCHEDULE ===\n');
  const schedules = all(`
    SELECT s.name, s.cron_expression, s.description, s.enabled, a.name as agent_name, s.last_run_at
    FROM schedules s LEFT JOIN agents a ON s.agent_id = a.id
    WHERE s.enabled = 1
    ORDER BY s.cron_expression
  `);
  for (const s of schedules) {
    const lastRun = s.last_run_at ? ` (last: ${s.last_run_at})` : ' (never run)';
    console.log(`  ${s.cron_expression.padEnd(18)} ${(s.agent_name || '???').padEnd(25)} ${s.description || ''}${lastRun}`);
  }

  console.log('\nDone!');
}

main().catch(err => { console.error(err); process.exit(1); });
