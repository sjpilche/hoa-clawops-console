require('dotenv').config({ path: '.env.local' });
const path = require('path');
process.chdir(path.join(__dirname, '..'));
const { initDatabase, all, get } = require('../server/db/connection');

async function main() {
  await initDatabase();

  // Overall breakdown
  const breakdown = all(`
    SELECT source, source_agent, enrichment_status, status, COUNT(*) AS cnt
    FROM cfo_leads
    GROUP BY source, source_agent, enrichment_status, status
    ORDER BY source_agent, cnt DESC
  `);
  console.log('\n=== cfo_leads breakdown ===');
  breakdown.forEach(r =>
    console.log(' ', (r.source_agent||'?').padEnd(8), '|', (r.source||'?').padEnd(20), '|', (r.enrichment_status||'?').padEnd(12), '|', (r.status||'?').padEnd(12), '|', r.cnt)
  );

  // Jake-specific: what contact channels do we have?
  const channels = all(`
    SELECT
      source,
      COUNT(*) AS total,
      SUM(CASE WHEN contact_email IS NOT NULL AND contact_email NOT LIKE '%unknown%' THEN 1 ELSE 0 END) AS has_email,
      SUM(CASE WHEN phone IS NOT NULL THEN 1 ELSE 0 END) AS has_phone,
      SUM(CASE WHEN contact_linkedin IS NOT NULL THEN 1 ELSE 0 END) AS has_linkedin,
      SUM(CASE WHEN website IS NOT NULL THEN 1 ELSE 0 END) AS has_website,
      SUM(CASE WHEN state IS NOT NULL THEN 1 ELSE 0 END) AS has_location
    FROM cfo_leads
    WHERE source_agent = 'jake'
    GROUP BY source
    ORDER BY total DESC
  `);
  console.log('\n=== Jake leads — contact channels by source ===');
  console.log(' Source'.padEnd(25), 'Total'.padEnd(8), 'Email'.padEnd(8), 'Phone'.padEnd(8), 'LinkedIn'.padEnd(12), 'Website'.padEnd(10), 'Location');
  console.log(' ' + '-'.repeat(75));
  channels.forEach(r =>
    console.log(
      ' ' + (r.source||'?').padEnd(24),
      String(r.total).padEnd(8),
      String(r.has_email).padEnd(8),
      String(r.has_phone).padEnd(8),
      String(r.has_linkedin).padEnd(12),
      String(r.has_website).padEnd(10),
      r.has_location
    )
  );

  // State breakdown — where are they?
  const states = all(`
    SELECT state, COUNT(*) AS cnt,
      SUM(CASE WHEN contact_email IS NOT NULL AND contact_email NOT LIKE '%unknown%' THEN 1 ELSE 0 END) AS has_email
    FROM cfo_leads
    WHERE source_agent = 'jake' AND state IS NOT NULL
    GROUP BY state
    ORDER BY cnt DESC
    LIMIT 15
  `);
  console.log('\n=== Jake leads — top states ===');
  states.forEach(r => console.log(' ', (r.state||'?').padEnd(6), r.cnt, 'total,', r.has_email, 'with email'));

  // ERP type breakdown
  const erps = all(`
    SELECT erp_type, COUNT(*) AS cnt,
      SUM(CASE WHEN contact_email IS NOT NULL AND contact_email NOT LIKE '%unknown%' THEN 1 ELSE 0 END) AS has_email
    FROM cfo_leads
    WHERE source_agent = 'jake'
    GROUP BY erp_type
    ORDER BY cnt DESC
  `);
  console.log('\n=== Jake leads — ERP type ===');
  erps.forEach(r => console.log(' ', (r.erp_type||'unknown').padEnd(20), r.cnt, 'total,', r.has_email, 'with email'));

  // Sample the best leads (score + email)
  const top = all(`
    SELECT company_name, contact_name, contact_title, contact_email, contact_linkedin,
           phone, website, erp_type, state, pilot_fit_score, enrichment_status, source
    FROM cfo_leads
    WHERE source_agent = 'jake'
      AND contact_email IS NOT NULL
      AND contact_email NOT LIKE '%unknown%'
    ORDER BY pilot_fit_score DESC
    LIMIT 15
  `);
  console.log('\n=== Top 15 Jake leads with email (by score) ===');
  top.forEach(r =>
    console.log(
      ' ', (r.company_name||'?').substring(0,28).padEnd(28),
      '|', (r.contact_name||'?').padEnd(20),
      '|', (r.erp_type||'?').padEnd(12),
      '|', (r.state||'?').padEnd(4),
      '|', r.pilot_fit_score,
      '|', r.contact_email
    )
  );

  // Leads with LinkedIn but no email
  const linkedinOnly = all(`
    SELECT company_name, contact_name, contact_title, contact_linkedin, state, erp_type, pilot_fit_score
    FROM cfo_leads
    WHERE source_agent = 'jake'
      AND contact_linkedin IS NOT NULL
      AND (contact_email IS NULL OR contact_email LIKE '%unknown%')
    ORDER BY pilot_fit_score DESC
    LIMIT 10
  `);
  console.log('\n=== Jake leads with LinkedIn but NO email (' + linkedinOnly.length + ' shown) ===');
  linkedinOnly.forEach(r =>
    console.log(' ', (r.company_name||'?').substring(0,28).padEnd(28), '|', (r.contact_name||'?').padEnd(20), '|', r.contact_linkedin)
  );

  // Total summary
  const summary = get(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN contact_email IS NOT NULL AND contact_email NOT LIKE '%unknown%' THEN 1 ELSE 0 END) AS email,
      SUM(CASE WHEN contact_linkedin IS NOT NULL THEN 1 ELSE 0 END) AS linkedin,
      SUM(CASE WHEN phone IS NOT NULL THEN 1 ELSE 0 END) AS phone,
      SUM(CASE WHEN website IS NOT NULL THEN 1 ELSE 0 END) AS website
    FROM cfo_leads
    WHERE source_agent = 'jake'
  `);
  console.log('\n=== JAKE TOTAL SUMMARY ===');
  console.log('  Total leads:  ', summary.total);
  console.log('  Has email:    ', summary.email);
  console.log('  Has LinkedIn: ', summary.linkedin);
  console.log('  Has phone:    ', summary.phone);
  console.log('  Has website:  ', summary.website);
  console.log('  No channel:   ', summary.total - summary.email - summary.linkedin + (summary.email && summary.linkedin ? summary.email : 0));
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
