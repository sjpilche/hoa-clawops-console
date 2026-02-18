#!/usr/bin/env node
/**
 * Update HOA Discovery agent to use the new Google Maps Discovery service.
 * The agent already exists — this updates its config and description.
 *
 * Usage: node scripts/seed-discovery-agent.js
 */

const { run, get, initDatabase } = require('../server/db/connection');

(async () => {
  await initDatabase();

  const existing = get('SELECT id FROM agents WHERE id = ?', ['hoa-discovery']);

  const config = JSON.stringify({
    special_handler: 'hoa_discovery',
    soul_path: 'openclaw-skills/hoa-discovery/SOUL.md',
    database: 'hoa_leads.sqlite',
    scraping_config: {
      headless: true,
      page_wait_ms: 3000,
      action_wait_ms: 2000,
      max_pages_per_query: 5,
      max_results_per_query: 100,
      rate_limit_seconds: 3,
    },
    default_params: {
      limit: 1,           // geo-targets per run
      geo_target_id: null // null = auto-pick next by priority
    },
  });

  const instructions = `You are the HOA Google Maps Discovery Agent.

Your job is to systematically discover HOA communities across major metro areas using Google Maps.

Run Parameters:
- limit: Number of geo-targets to process per run (default: 1)
- geo_target_id: Specific target to process (e.g., "south-florida"). Leave null for auto-selection.

Geo-targets are processed in priority order:
1. south-florida (Miami/FTL/WPB) — highest HOA density
2. central-florida (Orlando Metro)
3. tampa-bay
4. southwest-florida (Naples/Fort Myers)
5. jacksonville
6. southeast-texas (Houston)
7. dfw (Dallas-Fort Worth)
8. phoenix
9. las-vegas
10. atlanta

Each run processes 5 primary + 4 secondary search queries per city in the target.
Results are saved to hoa_communities with pipeline flags set for Agents 2-5.

Cost: $0 — Playwright web scraping only, no APIs.`;

  if (existing) {
    run(
      `UPDATE agents SET
        name = ?,
        description = ?,
        config = ?,
        instructions = ?,
        updated_at = datetime('now')
      WHERE id = ?`,
      [
        'HOA Google Maps Discovery',
        'Discovers HOA communities via Google Maps geo-targeted search. Processes 10 metro areas. Cost: $0/month.',
        config,
        instructions,
        'hoa-discovery',
      ]
    );
    console.log('✅ Updated hoa-discovery agent');
  } else {
    run(
      `INSERT INTO agents (id, name, description, status, config, instructions, created_at, updated_at)
       VALUES (?, ?, ?, 'idle', ?, ?, datetime('now'), datetime('now'))`,
      [
        'hoa-discovery',
        'HOA Google Maps Discovery',
        'Discovers HOA communities via Google Maps geo-targeted search. Processes 10 metro areas. Cost: $0/month.',
        config,
        instructions,
      ]
    );
    console.log('✅ Created hoa-discovery agent');
  }

  const agent = get('SELECT id, name, status FROM agents WHERE id = ?', ['hoa-discovery']);
  console.log('  ID:', agent.id);
  console.log('  Name:', agent.name);
  console.log('  Status:', agent.status);
  console.log('\n✅ Agent ready in ClawOps Console!');
  console.log('   View: http://localhost:5174/agents');
})();
