#!/usr/bin/env node
/**
 * backfill-workspace-ids.js — Assign workspace_id + agent_scope to all records
 *
 * Usage:
 *   node scripts/backfill-workspace-ids.js --dry-run
 *   node scripts/backfill-workspace-ids.js --yes
 */
'use strict';

const { initDatabase, get, all, run } = require('../server/db/connection');

const isDryRun = process.argv.includes('--dry-run');
const isConfirmed = process.argv.includes('--yes');
if (!isDryRun && !isConfirmed) {
  console.log('Usage:\n  --dry-run   Preview\n  --yes       Execute');
  process.exit(1);
}

// Workspace mapping by agent name prefix
const WORKSPACE_MAP = [
  { id: 1, slug: 'jake', prefixes: ['jake', 'ralph', 'charlie', 'todd', 'bid-result', 'permit', 'hiring-signal', 'pain-signal', 'content-repurposer', 'meeting-booker', 'linkedin-direct', 'twitter-poster', 'cfo-outreach', 'cfo-content', 'cfo-social', 'cfo-analytics', 'cfo-offer', 'cfo-pilot'] },
  { id: 2, slug: 'hoa', prefixes: ['hoa'] },
  { id: 3, slug: 'owen', prefixes: ['owen'] },
  { id: 4, slug: 'data-rehab', prefixes: ['data-rehab'] },
];

// Global/system agents (no workspace)
const GLOBAL_AGENTS = [
  'dream-team-nightly', 'daily-debrief', 'pipeline-digest', 'pipeline-state-tracker',
  'pipeline-director', 'pending-run-executor', 'cadence-activator', 'database-backup',
  'opportunity-scanner', 'opportunity-scorer', 'software-factory', 'traction-monitor',
  'weekly-portfolio-review', 'signal-performance-rollup', 'tenacity-cadence-engine',
  'urgency-scorer', 'lead-dossier-generator', 'outreach-sender', 'main',
  'rse-channel-monitor', 'rse-transcript-extractor', 'rse-signal-scorer',
  'rse-build-spec-generator', 'rse-code-builder', 'rse-campaign-builder',
  'rse-expert-librarian', 'rse-feedback-loop',
  'competitor-intel', 'sms-follow-up',
  'dc-intel-owner-research', 'dc-intel-research-queue',
];

function getWorkspaceId(agentName) {
  const name = (agentName || '').toLowerCase();
  if (GLOBAL_AGENTS.includes(name)) return null;
  for (const ws of WORKSPACE_MAP) {
    if (ws.prefixes.some(p => name.startsWith(p))) return ws.id;
  }
  return null;
}

function getAgentScope(agentName) {
  const name = (agentName || '').toLowerCase();
  if (GLOBAL_AGENTS.includes(name)) return 'global';
  return 'workspace';
}

(async () => {
  await initDatabase();
  console.log(`\n=== WORKSPACE BACKFILL ${isDryRun ? '(DRY RUN)' : '(EXECUTING)'} ===\n`);

  // 1. Agents
  const agents = all('SELECT id, name, workspace_id, agent_scope FROM agents');
  let agentUpdates = 0;
  for (const a of agents) {
    const wsId = getWorkspaceId(a.name);
    const scope = getAgentScope(a.name);
    if (a.workspace_id !== wsId || a.agent_scope !== scope) {
      if (!isDryRun) {
        run('UPDATE agents SET workspace_id = ?, agent_scope = ? WHERE id = ?', [wsId, scope, a.id]);
      }
      agentUpdates++;
    }
  }
  console.log(`Agents: ${agentUpdates} updated (of ${agents.length})`);

  // 2. cfo_leads (by source_agent)
  const leadsByWs = {};
  for (const ws of WORKSPACE_MAP) {
    const conditions = ws.prefixes.map(p => `source_agent LIKE '${p}%'`).join(' OR ');
    const count = get(`SELECT COUNT(*) c FROM cfo_leads WHERE workspace_id IS NULL AND (${conditions})`)?.c || 0;
    if (count > 0 && !isDryRun) {
      run(`UPDATE cfo_leads SET workspace_id = ? WHERE workspace_id IS NULL AND (${conditions})`, [ws.id]);
    }
    leadsByWs[ws.slug] = count;
  }
  console.log('cfo_leads backfill:', JSON.stringify(leadsByWs));

  // 3. cfo_outreach_sequences (by source_agent)
  const seqsByWs = {};
  for (const ws of WORKSPACE_MAP) {
    const conditions = ws.prefixes.map(p => `source_agent LIKE '${p}%'`).join(' OR ');
    const count = get(`SELECT COUNT(*) c FROM cfo_outreach_sequences WHERE workspace_id IS NULL AND (${conditions})`)?.c || 0;
    if (count > 0 && !isDryRun) {
      run(`UPDATE cfo_outreach_sequences SET workspace_id = ? WHERE workspace_id IS NULL AND (${conditions})`, [ws.id]);
    }
    seqsByWs[ws.slug] = count;
  }
  console.log('cfo_outreach_sequences backfill:', JSON.stringify(seqsByWs));

  // 4. cfo_content_pieces (by source_agent)
  const contentByWs = {};
  for (const ws of WORKSPACE_MAP) {
    const conditions = ws.prefixes.map(p => `source_agent LIKE '${p}%'`).join(' OR ');
    const count = get(`SELECT COUNT(*) c FROM cfo_content_pieces WHERE workspace_id IS NULL AND (${conditions})`)?.c || 0;
    if (count > 0 && !isDryRun) {
      run(`UPDATE cfo_content_pieces SET workspace_id = ? WHERE workspace_id IS NULL AND (${conditions})`, [ws.id]);
    }
    contentByWs[ws.slug] = count;
  }
  console.log('cfo_content_pieces backfill:', JSON.stringify(contentByWs));

  // 5. Runs (join through agent)
  if (!isDryRun) {
    run(`UPDATE runs SET workspace_id = (SELECT a.workspace_id FROM agents a WHERE a.id = runs.agent_id) WHERE workspace_id IS NULL`);
  }
  const runsUpdated = get('SELECT COUNT(*) c FROM runs WHERE workspace_id IS NULL')?.c || 0;
  console.log('runs: remaining NULL after backfill:', runsUpdated);

  // Summary
  console.log('\n=== WORKSPACE ASSIGNMENT SUMMARY ===');
  const summary = all('SELECT w.slug, w.status, COUNT(a.id) as agents FROM workspaces w LEFT JOIN agents a ON a.workspace_id = w.id GROUP BY w.id');
  summary.forEach(s => console.log(`  ${s.slug} (${s.status}): ${s.agents} agents`));
  const globalCount = get("SELECT COUNT(*) c FROM agents WHERE agent_scope = 'global'")?.c || 0;
  console.log(`  global/system: ${globalCount} agents`);

  if (isDryRun) console.log('\n--- DRY RUN — no changes. Run with --yes to execute. ---');
  else console.log('\n✓ Backfill complete.');
})();
