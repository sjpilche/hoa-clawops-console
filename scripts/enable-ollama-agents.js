/**
 * @file enable-ollama-agents.js
 * @description Tags eligible agents with use_ollama:true so they route through
 * local Ollama (free) instead of OpenAI when ollama_enabled=true in Settings.
 *
 * ELIGIBLE AGENTS (text formatting / summarization — no web_search needed):
 *   - daily-debrief          (end-of-day summary report)
 *   - pipeline-digest        (morning Discord stats post)
 *   - jake-follow-up-agent   (follow-up email drafts, position 2)
 *   - jake-analytics-monitor (pipeline health summary)
 *   - cfo-analytics-monitor  (same, CFO brand)
 *   - owen-analytics-monitor (same, Owen brand)
 *   - content-repurposer     (1 post → 5 derivatives)
 *   - hoa-social-media       (blog → Facebook/LinkedIn posts)
 *   - jake-case-study-builder (case study writing from data)
 *
 * NOT tagged (need web_search, high stakes, or $0 special handlers already):
 *   - jake-lead-scout        (needs live web_search)
 *   - jake-contact-enricher  ($0 already via Playwright)
 *   - jake-outreach-agent    (high stakes, GPT-4o quality matters)
 *   - jake-meeting-booker    (high stakes)
 *   - all special_handler agents ($0 already, no LLM)
 *
 * Run: node scripts/enable-ollama-agents.js
 * Safe to re-run — idempotent.
 */

const path = require('path');
const fs   = require('fs');

const OLLAMA_AGENTS = [
  'daily-debrief',
  'pipeline-digest',
  'jake-follow-up-agent',
  'jake-analytics-monitor',
  'cfo-analytics-monitor',
  'owen-analytics-monitor',
  'content-repurposer',
  'hoa-social-media',
  'jake-case-study-builder',
];

async function main() {
  const envPath = path.resolve(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath });

  const { initDatabase, get, run: dbRun, all } = require('../server/db/connection');
  await initDatabase();

  console.log('\n🦙 Ollama Agent Tagger\n');

  let tagged = 0;
  let alreadyTagged = 0;
  let notFound = 0;

  for (const name of OLLAMA_AGENTS) {
    const agent = get('SELECT id, name, config FROM agents WHERE name = ?', [name]);

    if (!agent) {
      console.log(`  ⚠  Not found in DB: ${name}`);
      notFound++;
      continue;
    }

    const config = JSON.parse(agent.config || '{}');

    if (config.use_ollama === true) {
      console.log(`  ✓  Already tagged: ${name}`);
      alreadyTagged++;
      continue;
    }

    config.use_ollama = true;
    dbRun('UPDATE agents SET config = ? WHERE id = ?', [JSON.stringify(config), agent.id]);
    console.log(`  ✅ Tagged: ${name}`);
    tagged++;
  }

  // Also enable ollama globally in settings (off by default — user must opt in via toggle)
  // We do NOT enable it automatically — just ensure the setting row exists
  dbRun(
    `INSERT OR IGNORE INTO settings (key, value, description)
     VALUES ('ollama_enabled', 'false', 'Route agents with use_ollama:true through local Ollama instead of OpenAI')`,
    []
  );

  console.log(`\nDone — ${tagged} agents tagged, ${alreadyTagged} already set, ${notFound} not found`);
  console.log(`\nTo activate: Settings → Local Ollama → flip the Enable toggle → Save Settings`);
  console.log(`These agents will then run free on your local llama3.2:3b.\n`);

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
