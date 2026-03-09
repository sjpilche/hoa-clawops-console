require('dotenv').config({ path: '.env.local' });
const path = require('path');
process.chdir(path.join(__dirname, '..'));
const { initDatabase, all, get } = require('../server/db/connection');
const sql = require('mssql');

const azureConfig = {
  server: process.env.AZURE_SQL_SERVER,
  database: process.env.AZURE_SQL_DATABASE,
  user: process.env.AZURE_SQL_USER,
  password: process.env.AZURE_SQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: false, connectTimeout: 20000 },
};

async function main() {
  await initDatabase();

  console.log('\n========================================');
  console.log('  FULL ASSET AUDIT — HOA + JAKE CFO');
  console.log('========================================');

  // ── JAKE CFO LEADS (SQLite cfo_leads, source_agent=jake) ──
  const jakeSources = all(`
    SELECT source, enrichment_status,
      COUNT(*) AS total,
      SUM(CASE WHEN contact_email IS NOT NULL AND contact_email NOT LIKE '%unknown%' AND contact_email NOT LIKE '%seebelow%' AND contact_email NOT LIKE '%not.com' THEN 1 ELSE 0 END) AS email,
      SUM(CASE WHEN phone IS NOT NULL THEN 1 ELSE 0 END) AS phone,
      SUM(CASE WHEN contact_linkedin IS NOT NULL THEN 1 ELSE 0 END) AS linkedin,
      SUM(CASE WHEN website IS NOT NULL THEN 1 ELSE 0 END) AS website
    FROM cfo_leads WHERE source_agent='jake'
    GROUP BY source, enrichment_status ORDER BY total DESC
  `);
  console.log('\n── JAKE CFO LEADS (cfo_leads SQLite) ──');
  console.log(' Source'.padEnd(26), 'Enrich'.padEnd(12), 'Total'.padEnd(7), 'Email'.padEnd(7), 'Phone'.padEnd(7), 'LinkedIn'.padEnd(10), 'Website');
  jakeSources.forEach(r => console.log(
    ' ' + (r.source||'?').padEnd(25), (r.enrichment_status||'?').padEnd(12),
    String(r.total).padEnd(7), String(r.email).padEnd(7), String(r.phone).padEnd(7), String(r.linkedin).padEnd(10), r.website
  ));

  const jakeStates = all(`
    SELECT UPPER(TRIM(state)) AS st, COUNT(*) AS cnt
    FROM cfo_leads WHERE source_agent='jake' AND state IS NOT NULL
    GROUP BY UPPER(TRIM(state)) ORDER BY cnt DESC LIMIT 10
  `);
  console.log('\n  Top states:', jakeStates.map(r => `${r.st}(${r.cnt})`).join(' '));

  // ── HOA LEADS (SQLite) ──
  const hoaLeads = get(`SELECT COUNT(*) AS total,
    SUM(CASE WHEN contact_email IS NOT NULL THEN 1 ELSE 0 END) AS email
    FROM cfo_leads WHERE source_agent='cfo'`);
  console.log('\n── HOA CFO LEADS (cfo_leads SQLite, source_agent=cfo) ──');
  console.log('  Total:', hoaLeads.total, '| Email:', hoaLeads.email);

  // ── HOA CONTACTS (hoa_contacts table) ──
  const hoaContacts = get(`SELECT COUNT(*) AS total,
    SUM(CASE WHEN email IS NOT NULL AND email NOT LIKE '%unknown%' THEN 1 ELSE 0 END) AS email,
    SUM(CASE WHEN phone IS NOT NULL THEN 1 ELSE 0 END) AS phone
    FROM hoa_contacts`);
  console.log('\n── HOA CONTACTS (hoa_contacts SQLite) ──');
  console.log('  Total:', hoaContacts.total, '| Email:', hoaContacts.email, '| Phone:', hoaContacts.phone);

  // ── HOA COMMUNITIES (discovery) ──
  try {
    const communities = get(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN tier='HOT' THEN 1 ELSE 0 END) AS hot,
      SUM(CASE WHEN tier='WARM' THEN 1 ELSE 0 END) AS warm,
      SUM(CASE WHEN phone IS NOT NULL THEN 1 ELSE 0 END) AS has_phone,
      SUM(CASE WHEN website IS NOT NULL THEN 1 ELSE 0 END) AS has_website
      FROM hoa_communities`);
    console.log('\n── HOA COMMUNITIES (hoa_communities SQLite — discovery) ──');
    console.log('  Total:', communities.total, '| HOT:', communities.hot, '| WARM:', communities.warm, '| Phone:', communities.has_phone, '| Website:', communities.has_website);
  } catch(e) { console.log('\n  hoa_communities: not found'); }

  // ── MGMT COMPANIES ──
  try {
    const mgmt = get(`SELECT COUNT(*) AS total FROM management_companies`);
    const mgmtContacts = get(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN email IS NOT NULL AND LENGTH(email) > 5 THEN 1 ELSE 0 END) AS email,
      SUM(CASE WHEN phone IS NOT NULL THEN 1 ELSE 0 END) AS phone
      FROM mgmt_company_contacts`);
    console.log('\n── MGMT COMPANIES (management_companies SQLite) ──');
    console.log('  Companies:', mgmt.total, '| Contacts:', mgmtContacts.total, '| Email:', mgmtContacts.email, '| Phone:', mgmtContacts.phone);
  } catch(e) { console.log('\n  management_companies: not found or empty'); }

  // ── CONTENT PIECES ──
  try {
    const content = all(`SELECT source_agent, channel, status, COUNT(*) AS cnt
      FROM cfo_content_pieces GROUP BY source_agent, channel, status ORDER BY cnt DESC`);
    console.log('\n── CONTENT PIECES (cfo_content_pieces) ──');
    content.forEach(r => console.log(' ', (r.source_agent||'?').padEnd(8), (r.channel||'?').padEnd(12), (r.status||'?').padEnd(10), r.cnt));
  } catch(e) { console.log('\n  cfo_content_pieces: empty'); }

  // ── OUTREACH SEQUENCES ──
  try {
    const seqs = all(`SELECT source_agent, status, COUNT(*) AS cnt
      FROM cfo_outreach_sequences GROUP BY source_agent, status ORDER BY cnt DESC`);
    console.log('\n── OUTREACH SEQUENCES (cfo_outreach_sequences) ──');
    seqs.forEach(r => console.log(' ', (r.source_agent||'?').padEnd(8), (r.status||'?').padEnd(12), r.cnt));
  } catch(e) { console.log('\n  cfo_outreach_sequences: empty'); }

  // ── SCHEDULES ──
  const schedules = all(`SELECT name, cron, enabled, last_run_at FROM schedules ORDER BY enabled DESC, name`);
  console.log('\n── ACTIVE SCHEDULES ──');
  schedules.forEach(r => console.log(' ', r.enabled ? '✓' : '✗', (r.name||'?').padEnd(35), r.cron));

  // ── AZURE: livempaint_leads ──
  try {
    const pool = await sql.connect(azureConfig);
    const { recordset: lm } = await pool.request().query(`
      SELECT client_type, outreach_status, COUNT(*) AS cnt
      FROM livempaint_leads
      GROUP BY client_type, outreach_status ORDER BY client_type, cnt DESC
    `);
    console.log('\n── LIVEMPAINT LEADS (Azure empcapmaster2) ──');
    lm.forEach(r => console.log(' ', (r.client_type||'NULL').padEnd(25), (r.outreach_status||'?').padEnd(12), r.cnt));

    const { recordset: lmStats } = await pool.request().query(`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN website IS NOT NULL AND LEN(website)>5 THEN 1 ELSE 0 END) AS has_website,
        SUM(CASE WHEN zip IS NOT NULL THEN 1 ELSE 0 END) AS has_zip,
        SUM(CASE WHEN state IS NOT NULL THEN 1 ELSE 0 END) AS has_state
      FROM livempaint_leads WHERE outreach_status='new'
    `);
    const ls = lmStats[0];
    console.log('  New unsent:', ls.total, '| Website:', ls.has_website, '| Has ZIP:', ls.has_zip, '| Has State:', ls.has_state);

    await pool.close();
  } catch(e) { console.log('\n  Azure connect failed:', e.message); }

  // ── AGENTS ──
  const agents = all(`SELECT name, status, total_runs, config FROM agents ORDER BY total_runs DESC`);
  console.log('\n── AGENT FLEET ──');
  agents.forEach(r => {
    const cfg = JSON.parse(r.config || '{}');
    const type = cfg.special_handler ? `[handler:${cfg.special_handler}]` : cfg.openclaw_id ? `[llm:${cfg.openclaw_id}]` : '[?]';
    console.log(' ', r.status === 'idle' ? '·' : '!', (r.name||'?').padEnd(32), type.padEnd(35), `${r.total_runs} runs`);
  });

  console.log('\n========================================');
  console.log('  END AUDIT');
  console.log('========================================\n');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
