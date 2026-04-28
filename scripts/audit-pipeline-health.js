#!/usr/bin/env node
/**
 * audit-pipeline-health.js — Full diagnostic of the outreach pipeline
 *
 * Runs 5 audits:
 *   1. Deliverability — bounce/delivery status breakdown
 *   2. Domain auth — checks sender domains for DKIM/SPF/DMARC
 *   3. Reply detection — unmatched inbound replies, webhook health
 *   4. Email quality — personalization check on random sample
 *   5. Lead quality — enrichment status, email validity distribution
 *
 * Usage: node scripts/audit-pipeline-health.js
 */

const { initDatabase, all, get } = require('../server/db/connection');
const dns = require('dns').promises;

async function main() {
  await initDatabase();

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIT 1: DELIVERABILITY
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70));
  console.log('AUDIT 1: DELIVERABILITY');
  console.log('═'.repeat(70));

  const deliveryStatus = all(`
    SELECT delivery_status, COUNT(*) as cnt
    FROM cfo_outreach_sequences
    WHERE status = 'sent'
    GROUP BY delivery_status
    ORDER BY cnt DESC
  `);
  console.log('\nSent emails by delivery_status:');
  if (deliveryStatus.length === 0) {
    console.log('  (no delivery_status data — column may not exist or no sent emails)');
  } else {
    deliveryStatus.forEach(r => console.log(`  ${r.delivery_status || 'NULL'}: ${r.cnt}`));
  }

  const totalSent = get("SELECT COUNT(*) as cnt FROM cfo_outreach_sequences WHERE status = 'sent'")?.cnt || 0;
  const totalBounced = get("SELECT COUNT(*) as cnt FROM cfo_outreach_sequences WHERE status = 'bounced'")?.cnt || 0;
  const totalReplied = get("SELECT COUNT(*) as cnt FROM cfo_outreach_sequences WHERE status = 'replied'")?.cnt || 0;
  console.log(`\nTotal sent: ${totalSent}`);
  console.log(`Total bounced: ${totalBounced}`);
  console.log(`Total replied: ${totalReplied}`);
  if (totalSent > 0) {
    console.log(`Bounce rate: ${((totalBounced / totalSent) * 100).toFixed(2)}%`);
    console.log(`Reply rate: ${((totalReplied / totalSent) * 100).toFixed(2)}%`);
  }

  // Check for sends by week
  const weeklyStats = all(`
    SELECT
      strftime('%Y-W%W', sent_at) as week,
      COUNT(*) as sent,
      SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) as bounced,
      SUM(CASE WHEN status = 'replied' THEN 1 ELSE 0 END) as replied
    FROM cfo_outreach_sequences
    WHERE sent_at IS NOT NULL
    GROUP BY week
    ORDER BY week DESC
    LIMIT 8
  `);
  if (weeklyStats.length > 0) {
    console.log('\nWeekly send volume:');
    weeklyStats.forEach(w => console.log(`  ${w.week}: ${w.sent} sent, ${w.bounced} bounced, ${w.replied} replied`));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIT 2: DOMAIN AUTHENTICATION
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70));
  console.log('AUDIT 2: DOMAIN AUTHENTICATION');
  console.log('═'.repeat(70));

  // Extract unique sender domains from sendgrid.js config
  const senderDomains = new Set();
  try {
    const sg = require('../server/services/sendgrid');
    if (sg.SENDER_IDENTITIES) {
      for (const [key, identity] of Object.entries(sg.SENDER_IDENTITIES)) {
        const email = identity.from || identity.email || '';
        const domain = email.split('@')[1];
        if (domain) senderDomains.add(domain);
      }
    }
  } catch {}

  // Also check reply domain
  const replyDomains = ['reply.hoaprojectfunding.com', 'hoaprojectfunding.com'];
  replyDomains.forEach(d => senderDomains.add(d));

  // Fallback: extract domains from sent emails
  if (senderDomains.size <= 2) {
    const emailDomains = all("SELECT DISTINCT substr(contact_email, instr(contact_email, '@') + 1) as domain FROM cfo_leads WHERE contact_email LIKE '%@%' LIMIT 5");
    // These are recipient domains, not sender domains — skip
  }

  for (const domain of senderDomains) {
    console.log(`\n--- ${domain} ---`);

    // SPF check
    try {
      const txt = await dns.resolveTxt(domain);
      const spf = txt.flat().find(r => r.startsWith('v=spf1'));
      console.log(`  SPF: ${spf ? 'PASS — ' + spf.substring(0, 80) : 'MISSING'}`);
    } catch (err) {
      console.log(`  SPF: FAILED — ${err.code || err.message}`);
    }

    // DKIM check (common selectors)
    let dkimFound = false;
    for (const selector of ['s1', 's2', 'google', 'sendgrid', 'sg', 'k1', 'default']) {
      try {
        const cname = await dns.resolveCname(`${selector}._domainkey.${domain}`);
        console.log(`  DKIM (${selector}): PASS — ${cname[0]}`);
        dkimFound = true;
        break;
      } catch {
        try {
          const txt = await dns.resolveTxt(`${selector}._domainkey.${domain}`);
          const dkim = txt.flat().find(r => r.includes('v=DKIM1'));
          if (dkim) {
            console.log(`  DKIM (${selector}): PASS — TXT record found`);
            dkimFound = true;
            break;
          }
        } catch {}
      }
    }
    if (!dkimFound) console.log('  DKIM: NOT FOUND (checked s1, s2, google, sendgrid, sg, k1, default)');

    // DMARC check
    try {
      const txt = await dns.resolveTxt(`_dmarc.${domain}`);
      const dmarc = txt.flat().find(r => r.startsWith('v=DMARC1'));
      console.log(`  DMARC: ${dmarc ? 'PASS — ' + dmarc.substring(0, 80) : 'MISSING'}`);
    } catch (err) {
      console.log(`  DMARC: MISSING — ${err.code || err.message}`);
    }

    // MX check (for reply domain)
    if (domain.startsWith('reply.')) {
      try {
        const mx = await dns.resolveMx(domain);
        const hasSendgrid = mx.some(r => r.exchange.includes('sendgrid'));
        console.log(`  MX: ${mx.map(r => `${r.exchange} (pri ${r.priority})`).join(', ')}`);
        console.log(`  SendGrid MX: ${hasSendgrid ? 'PASS' : 'WARNING — no sendgrid MX found'}`);
      } catch (err) {
        console.log(`  MX: MISSING — ${err.code || err.message} (replies will not be received!)`);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIT 3: REPLY DETECTION
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70));
  console.log('AUDIT 3: REPLY DETECTION');
  console.log('═'.repeat(70));

  // Check audit_log for inbound events
  try {
    const inboundEvents = all(`
      SELECT action, outcome, COUNT(*) as cnt
      FROM audit_log
      WHERE action LIKE '%inbound%' OR action LIKE '%reply%' OR action LIKE '%webhook%'
      GROUP BY action, outcome
      ORDER BY cnt DESC
      LIMIT 20
    `);
    if (inboundEvents.length > 0) {
      console.log('\nInbound/reply events in audit_log:');
      inboundEvents.forEach(e => console.log(`  ${e.action} (${e.outcome}): ${e.cnt}`));
    } else {
      console.log('\nNo inbound/reply events found in audit_log');
      console.log('  This means either: (a) no replies received, (b) webhook not configured, or (c) events not being logged');
    }
  } catch (err) {
    console.log(`Audit log query failed: ${err.message}`);
  }

  // Check sequences with replied status
  const repliedSeqs = all(`
    SELECT s.id, s.lead_id, l.company_name, l.contact_email, s.replied_at
    FROM cfo_outreach_sequences s
    LEFT JOIN cfo_leads l ON l.id = s.lead_id
    WHERE s.status = 'replied'
    ORDER BY s.replied_at DESC
    LIMIT 10
  `);
  console.log(`\nReplied sequences: ${repliedSeqs.length}`);
  repliedSeqs.forEach(r => console.log(`  ${r.company_name} (${r.contact_email}) — replied ${r.replied_at}`));

  // Leads marked as replied
  const repliedLeads = all("SELECT id, company_name, contact_email, updated_at FROM cfo_leads WHERE status = 'replied' ORDER BY updated_at DESC LIMIT 10");
  console.log(`\nLeads marked as replied: ${repliedLeads.length}`);
  repliedLeads.forEach(r => console.log(`  ${r.company_name} (${r.contact_email}) — ${r.updated_at}`));

  // Discrepancy check
  if (repliedSeqs.length !== repliedLeads.length) {
    console.log(`\n  WARNING: ${repliedSeqs.length} replied sequences vs ${repliedLeads.length} replied leads — discrepancy!`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIT 4: EMAIL QUALITY (Random Sample)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70));
  console.log('AUDIT 4: EMAIL QUALITY (20-email sample)');
  console.log('═'.repeat(70));

  const sample = all(`
    SELECT s.id, s.email_subject, s.email_body, l.company_name, l.city, l.state, l.contact_name
    FROM cfo_outreach_sequences s
    LEFT JOIN cfo_leads l ON l.id = s.lead_id
    WHERE s.status = 'sent'
    ORDER BY RANDOM()
    LIMIT 20
  `);

  let personalized = 0, generic = 0, hasCompanyName = 0, hasCity = 0, hasContactName = 0;

  for (const email of sample) {
    const body = (email.email_body || '').toLowerCase();
    const subject = (email.email_subject || '').toLowerCase();
    const combined = body + ' ' + subject;

    const companyMatch = email.company_name && combined.includes(email.company_name.toLowerCase().split(' ')[0]);
    const cityMatch = email.city && combined.includes(email.city.toLowerCase());
    const contactMatch = email.contact_name && combined.includes(email.contact_name.toLowerCase().split(' ')[0]);

    if (companyMatch) hasCompanyName++;
    if (cityMatch) hasCity++;
    if (contactMatch) hasContactName++;

    if (companyMatch || cityMatch || contactMatch) {
      personalized++;
    } else {
      generic++;
      console.log(`  GENERIC: "${(email.email_subject || '').substring(0, 60)}" → ${email.company_name} (${email.city}, ${email.state})`);
    }
  }

  console.log(`\nSample size: ${sample.length}`);
  console.log(`Personalized: ${personalized} (${sample.length ? Math.round(personalized / sample.length * 100) : 0}%)`);
  console.log(`Generic: ${generic} (${sample.length ? Math.round(generic / sample.length * 100) : 0}%)`);
  console.log(`Contains company name: ${hasCompanyName}`);
  console.log(`Contains city: ${hasCity}`);
  console.log(`Contains contact name: ${hasContactName}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIT 5: LEAD DATA QUALITY
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70));
  console.log('AUDIT 5: LEAD DATA QUALITY');
  console.log('═'.repeat(70));

  const totalLeads = get("SELECT COUNT(*) as cnt FROM cfo_leads")?.cnt || 0;
  console.log(`\nTotal leads: ${totalLeads}`);

  // By enrichment status
  const enrichStatus = all("SELECT enrichment_status, COUNT(*) as cnt FROM cfo_leads GROUP BY enrichment_status ORDER BY cnt DESC");
  console.log('\nBy enrichment_status:');
  enrichStatus.forEach(r => console.log(`  ${r.enrichment_status || 'NULL'}: ${r.cnt}`));

  // Email validity check
  const emailStats = {
    total: get("SELECT COUNT(*) as cnt FROM cfo_leads WHERE contact_email IS NOT NULL AND contact_email != ''")?.cnt || 0,
    missing: get("SELECT COUNT(*) as cnt FROM cfo_leads WHERE contact_email IS NULL OR contact_email = ''")?.cnt || 0,
  };

  // Check for obviously bad emails
  const badEmails = all(`
    SELECT contact_email, company_name FROM cfo_leads
    WHERE contact_email IS NOT NULL
      AND contact_email != ''
      AND (
        contact_email NOT LIKE '%@%.%'
        OR contact_email LIKE '%@example.%'
        OR contact_email LIKE '%@test.%'
        OR contact_email LIKE '%noreply%'
        OR contact_email LIKE '%no-reply%'
        OR length(contact_email) < 6
      )
    LIMIT 20
  `);

  console.log(`\nWith email: ${emailStats.total}`);
  console.log(`Missing email: ${emailStats.missing}`);
  console.log(`Obviously bad emails: ${badEmails.length}`);
  badEmails.forEach(r => console.log(`  ${r.contact_email} (${r.company_name})`));

  // Check enrichment metadata for email source info
  try {
    const hasMetadata = get("SELECT COUNT(*) as cnt FROM cfo_leads WHERE enrichment_metadata IS NOT NULL AND enrichment_metadata != '' AND enrichment_metadata != '{}'")?.cnt || 0;
    console.log(`\nLeads with enrichment_metadata: ${hasMetadata}`);

    if (hasMetadata > 0) {
      const metaSample = all("SELECT enrichment_metadata FROM cfo_leads WHERE enrichment_metadata IS NOT NULL AND enrichment_metadata != '' AND enrichment_metadata != '{}' LIMIT 3");
      console.log('Sample metadata:');
      metaSample.forEach(r => console.log(`  ${String(r.enrichment_metadata).substring(0, 200)}`));
    }
  } catch {
    console.log('\nNo enrichment_metadata column found');
  }

  // Source agent breakdown with email presence
  const sourceQuality = all(`
    SELECT source_agent,
      COUNT(*) as total,
      SUM(CASE WHEN contact_email IS NOT NULL AND contact_email != '' THEN 1 ELSE 0 END) as with_email,
      SUM(CASE WHEN enrichment_status = 'enriched' THEN 1 ELSE 0 END) as enriched,
      SUM(CASE WHEN status = 'contacted' THEN 1 ELSE 0 END) as contacted,
      SUM(CASE WHEN status = 'replied' THEN 1 ELSE 0 END) as replied
    FROM cfo_leads
    GROUP BY source_agent
    ORDER BY total DESC
  `);
  console.log('\nBy source agent:');
  console.log('  Agent        | Total | Email | Enriched | Contacted | Replied');
  console.log('  ' + '-'.repeat(65));
  sourceQuality.forEach(r => {
    const agent = (r.source_agent || 'unknown').padEnd(12);
    console.log(`  ${agent} | ${String(r.total).padStart(5)} | ${String(r.with_email).padStart(5)} | ${String(r.enriched).padStart(8)} | ${String(r.contacted).padStart(9)} | ${String(r.replied).padStart(7)}`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70));
  console.log('SUMMARY');
  console.log('═'.repeat(70));

  const issues = [];
  if (totalBounced > 0 && totalSent > 0 && (totalBounced / totalSent) > 0.05) issues.push(`High bounce rate: ${((totalBounced / totalSent) * 100).toFixed(1)}%`);
  if (generic > personalized) issues.push(`${generic}/${sample.length} sampled emails are generic (no personalization)`);
  if (badEmails.length > 0) issues.push(`${badEmails.length} obviously bad email addresses in lead database`);
  if (emailStats.missing > 100) issues.push(`${emailStats.missing} leads missing email addresses`);
  if (repliedSeqs.length !== repliedLeads.length) issues.push('Reply count mismatch between sequences and leads');

  if (issues.length === 0) {
    console.log('\nNo critical issues detected in pipeline data.');
    console.log('Low reply rate may be due to domain reputation, email content, or market fit.');
  } else {
    console.log('\nIssues found:');
    issues.forEach((issue, i) => console.log(`  ${i + 1}. ${issue}`));
  }

  console.log('\nDone.');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
