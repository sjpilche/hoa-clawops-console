const { initDatabase, all } = require('../server/db/connection');
initDatabase();

const rows = all(`
  SELECT company_name, contact_name, contact_title, contact_email, city, state, erp_type, pilot_fit_score, notes
  FROM cfo_leads
  WHERE source = 'livempaint'
  ORDER BY pilot_fit_score DESC
  LIMIT 30
`);

console.log('\n=== LIVEMPAINT LEAD SAMPLE (top 30 by score) ===\n');
rows.forEach(r => {
  const domain = r.contact_email ? r.contact_email.split('@')[1] : 'no-email';
  console.log(`${(r.company_name||'').slice(0,35).padEnd(36)} | ${(r.contact_name||'').slice(0,22).padEnd(23)} | ${(r.contact_title||'—').slice(0,25).padEnd(26)} | ${(r.city||'').padEnd(15)} ${(r.state||'').padEnd(3)} | ${domain}`);
});

// Also show title breakdown
console.log('\n=== CONTACT TITLE BREAKDOWN ===');
const titles = all(`
  SELECT COALESCE(contact_title,'(none)') t, COUNT(*) c
  FROM cfo_leads WHERE source='livempaint'
  GROUP BY contact_title ORDER BY c DESC LIMIT 20
`);
titles.forEach(t => console.log(`  ${String(t.c).padStart(5)}  ${t.t}`));

// Company type clues
console.log('\n=== COMPANY NAME PATTERNS ===');
const hoaCount  = all(`SELECT COUNT(*) c FROM cfo_leads WHERE source='livempaint' AND (LOWER(company_name) LIKE '%hoa%' OR LOWER(company_name) LIKE '%homeowner%' OR LOWER(company_name) LIKE '%condo%' OR LOWER(company_name) LIKE '%association%')`)[0]?.c || 0;
const mgmtCount = all(`SELECT COUNT(*) c FROM cfo_leads WHERE source='livempaint' AND (LOWER(company_name) LIKE '%management%' OR LOWER(company_name) LIKE '%property%')`)[0]?.c || 0;
const gcCount   = all(`SELECT COUNT(*) c FROM cfo_leads WHERE source='livempaint' AND (LOWER(company_name) LIKE '%construction%' OR LOWER(company_name) LIKE '%contractor%' OR LOWER(company_name) LIKE '%builder%')`)[0]?.c || 0;
console.log(`  HOA/Condo/Association: ${hoaCount}`);
console.log(`  Management/Property:   ${mgmtCount}`);
console.log(`  Construction/Builder:  ${gcCount}`);
console.log(`  Other:                 ${7213 - hoaCount - mgmtCount - gcCount}`);

process.exit(0);
