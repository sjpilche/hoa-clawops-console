/**
 * Fix agent configs: merge remaining display-name dupes, assign correct special_handlers.
 */
const path = require('path');
const fs = require('fs');
const envPath = path.resolve(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath });

const { initDatabase, all, get, run } = require('../server/db/connection');

async function main() {
  await initDatabase();

  // Merge "CAI Directory Scraper" into "mgmt-cai-scraper"
  const cai1 = get("SELECT id, name, config FROM agents WHERE name = 'CAI Directory Scraper'");
  const cai2 = get("SELECT id, name, config FROM agents WHERE name = 'mgmt-cai-scraper'");
  if (cai1 && cai2) {
    const rc = get('SELECT COUNT(*) as c FROM runs WHERE agent_id = ?', [cai1.id]);
    if (rc.c > 0) run('UPDATE runs SET agent_id = ? WHERE agent_id = ?', [cai2.id, cai1.id]);
    const sc = all('SELECT id FROM schedules WHERE agent_id = ?', [cai1.id]);
    if (sc.length > 0) run("UPDATE schedules SET agent_id = ?, agent_name = ? WHERE agent_id = ?", [cai2.id, 'mgmt-cai-scraper', cai1.id]);
    run('DELETE FROM agents WHERE id = ?', [cai1.id]);
    console.log('Merged "CAI Directory Scraper" into "mgmt-cai-scraper" (' + rc.c + ' runs, ' + sc.length + ' scheds)');
  }

  // Fix agents that should have special_handlers but have [LLM]
  const fixes = [
    { name: 'hoa-contact-finder', handler: 'hoa_contact_scraper' },
    { name: 'hoa-contact-enricher', handler: 'hoa_contact_enricher' },
    { name: 'hoa-outreach-drafter', handler: 'hoa_outreach_drafter' },
    { name: 'hoa-minutes-monitor', handler: 'hoa_minutes_monitor' },
    { name: 'google-reviews-monitor', handler: 'google_reviews_monitor' },
    { name: 'mgmt-review-scanner', handler: 'mgmt_review_scanner' },
    { name: 'mgmt-cai-scraper', handler: 'mgmt_cai_scraper' },
    { name: 'mgmt-portfolio-scraper', handler: 'mgmt_portfolio_scraper' },
    { name: 'mgmt-contact-puller', handler: 'mgmt_contact_puller' },
    { name: 'mgmt-portfolio-mapper', handler: 'mgmt_portfolio_mapper' },
  ];

  for (const fix of fixes) {
    const agent = get('SELECT id, name, config FROM agents WHERE name = ?', [fix.name]);
    if (!agent) {
      console.log('Not found:', fix.name);
      continue;
    }

    let cfg = {};
    try { cfg = JSON.parse(agent.config || '{}'); } catch {}

    if (cfg.special_handler === fix.handler) {
      console.log('Already correct:', fix.name, '->', fix.handler);
      continue;
    }

    cfg.special_handler = fix.handler;
    if (!cfg.openclaw_id) cfg.openclaw_id = fix.name;
    run('UPDATE agents SET config = ? WHERE id = ?', [JSON.stringify(cfg), agent.id]);
    console.log('FIXED:', fix.name, '->', fix.handler);
  }

  // Final report
  console.log('\n=== FINAL AGENT FLEET ===');
  const agents = all('SELECT name, config FROM agents ORDER BY name');
  let specialCount = 0;
  let llmCount = 0;
  agents.forEach(a => {
    let cfg = {};
    try { cfg = JSON.parse(a.config || '{}'); } catch {}
    const handler = cfg.special_handler ? ' [' + cfg.special_handler + ']' : ' [LLM]';
    if (cfg.special_handler) specialCount++;
    else llmCount++;
    console.log('  ' + a.name + handler);
  });
  console.log('\nTotal:', agents.length, '(' + specialCount + ' special handlers, ' + llmCount + ' LLM)');

  const sc = get('SELECT COUNT(*) as c FROM schedules WHERE enabled = 1');
  const unsch = all("SELECT name FROM agents WHERE id NOT IN (SELECT agent_id FROM schedules) AND name != 'main'");
  console.log('Schedules:', sc.c, 'enabled');
  console.log('Unscheduled (excl main):', unsch.length);
  unsch.forEach(a => console.log('  ', a.name));
}

main().catch(err => { console.error(err); process.exit(1); });
