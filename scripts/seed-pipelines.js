#!/usr/bin/env node
/**
 * Seed predefined agent pipelines.
 * Run: node scripts/seed-pipelines.js
 */

const path = require('path');
const initSqlJs = require('sql.js');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'clawops.db');

async function seed() {
  const SQL = await initSqlJs();
  const buf = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buf);

  // Ensure migration 022 tables exist
  db.run(`
    CREATE TABLE IF NOT EXISTS agent_pipelines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      domain TEXT,
      steps TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  const pipelines = [
    {
      name: 'hoa-discovery-to-outreach',
      description: 'HOA Discovery → Contact Finder → Enricher → Outreach Drafter. Full lead-gen pipeline from Google Maps to draft emails.',
      domain: 'hoa',
      steps: [
        { agent_name: 'hoa-discovery', delay_minutes: 0, message_template: '{}' },
        { agent_name: 'hoa-contact-finder', delay_minutes: 5, message_template: 'Find contacts for the HOAs discovered in the previous step. Focus on board members and property managers.' },
        { agent_name: 'hoa-contact-enricher', delay_minutes: 5, message_template: 'Enrich the contacts found. Add LinkedIn profiles, email verification, and company size estimates.' },
        { agent_name: 'hoa-outreach-drafter', delay_minutes: 5, message_template: 'Draft personalized outreach emails for the enriched contacts. Use the HOA Project Funding value proposition.' },
      ],
    },
    {
      name: 'jake-lead-to-outreach',
      description: 'Jake Lead Scout → Contact Enricher → Outreach Agent. Find leads, enrich with emails, then draft outreach.',
      domain: 'jake',
      steps: [
        { agent_name: 'jake-lead-scout', delay_minutes: 0, message_template: '{"search_region":"Tampa Bay, FL","target_trade":"GC","target_revenue":"$5M-$25M","limit":10}' },
        { agent_name: 'jake-contact-enricher', delay_minutes: 2, message_template: '{"limit":20,"min_score":45,"status_filter":"pending"}' },
        { agent_name: 'jake-outreach-agent', delay_minutes: 5, message_template: 'Draft outreach emails for enriched leads that have contact emails. Use the Jake AI CFO value proposition. Pipeline context: {{jake_contact_enricher_output}}' },
      ],
    },
    {
      name: 'cfo-lead-to-outreach',
      description: 'CFO Lead Scout → Contact Enricher → Outreach Agent. Scrape DBPR contractors, enrich with emails, then draft outreach.',
      domain: 'cfo',
      steps: [
        { agent_name: 'cfo-lead-scout', delay_minutes: 0, message_template: '{"county":"Sarasota","lic_type":"0605","limit":10}' },
        { agent_name: 'jake-contact-enricher', delay_minutes: 2, message_template: '{"limit":20,"min_score":45,"status_filter":"pending"}' },
        { agent_name: 'cfo-outreach-agent', delay_minutes: 5, message_template: 'Draft outreach emails for enriched leads that have contact emails. Use the CFO AI Suite value proposition and Trust Envelope voice. Pipeline context: {{jake_contact_enricher_output}}' },
      ],
    },
    {
      name: 'hoa-content-to-publish',
      description: 'HOA Content Writer → CMS Publisher. Write a blog post and publish to the website.',
      domain: 'hoa',
      steps: [
        { agent_name: 'hoa-content-writer', delay_minutes: 0, message_template: 'Write a blog post about HOA reserve fund best practices.' },
        { agent_name: 'hoa-cms-publisher', delay_minutes: 2, message_template: 'Publish the blog post written by hoa-content-writer.' },
      ],
    },
    {
      name: 'jake-content-to-social',
      description: 'Jake Content Engine → Social Scheduler. Create content and schedule social posts.',
      domain: 'jake',
      steps: [
        { agent_name: 'jake-content-engine', delay_minutes: 0, message_template: '{"pillar":"cash_flow","channel":"linkedin"}' },
        { agent_name: 'jake-social-scheduler', delay_minutes: 2, message_template: 'Schedule social posts based on the content created. Use the content from the previous step as the basis for LinkedIn and Twitter posts. Pipeline context: {{jake_content_engine_output}}' },
      ],
    },
    {
      name: 'daily-full-pipeline',
      description: 'Morning pipeline: Discovery → Enrich → Content → Social → Debrief. Runs the full daily workflow.',
      domain: null,
      steps: [
        { agent_name: 'hoa-discovery', delay_minutes: 0, message_template: '{}' },
        { agent_name: 'jake-lead-scout', delay_minutes: 0, message_template: '{"search_region":"Tampa Bay, FL","target_trade":"GC","target_revenue":"$5M-$25M","limit":10}' },
        { agent_name: 'jake-contact-enricher', delay_minutes: 3, message_template: '{"limit":20,"min_score":45,"status_filter":"pending"}' },
        { agent_name: 'hoa-content-writer', delay_minutes: 5, message_template: 'Write a blog post about HOA reserve fund best practices.' },
        { agent_name: 'jake-content-engine', delay_minutes: 5, message_template: '{"pillar":"cash_flow","channel":"linkedin"}' },
        { agent_name: 'hoa-facebook-poster', delay_minutes: 10, message_template: 'Write a Facebook post about HOA reserve funding. Casual tone, engage the community.' },
        { agent_name: 'daily-debrief', delay_minutes: 15, message_template: 'Generate the daily war room debrief covering all agent activity.' },
      ],
    },
  ];

  let inserted = 0;
  for (const p of pipelines) {
    const existing = db.exec(`SELECT id FROM agent_pipelines WHERE name = '${p.name}'`);
    if (existing.length && existing[0].values.length) {
      console.log(`  ⏭  ${p.name} (already exists)`);
      continue;
    }

    db.run(
      `INSERT INTO agent_pipelines (name, description, domain, steps, is_active) VALUES (?, ?, ?, ?, 1)`,
      [p.name, p.description, p.domain, JSON.stringify(p.steps)]
    );
    inserted++;
    console.log(`  ✅ ${p.name} (${p.steps.length} steps)`);
  }

  // Save
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  db.close();

  console.log(`\n✅ Seeded ${inserted} pipelines (${pipelines.length - inserted} already existed)`);

  // List all
  const SQL2 = await initSqlJs();
  const buf2 = fs.readFileSync(DB_PATH);
  const db2 = new SQL2.Database(buf2);
  const all = db2.exec('SELECT id, name, domain, is_active FROM agent_pipelines ORDER BY domain, name');
  if (all.length) {
    console.log('\nAll pipelines:');
    for (const row of all[0].values) {
      console.log(`  ${row[0]}. ${row[1]} (${row[2] || 'all'}) ${row[3] ? '✅' : '⏸'}`);
    }
  }
  db2.close();
}

seed().catch(console.error);
