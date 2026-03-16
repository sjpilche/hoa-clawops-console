/**
 * @file dataAuditService.js
 * @description Data Audit Report — AI-delivered SMB data health assessment.
 *
 * Pipeline:
 *   1. Web scrape company site for tech stack signals
 *   2. Check job postings for data/accounting roles (pain signal)
 *   3. Score data readiness (reuse dataRehabDiscovery scoring logic)
 *   4. Generate HTML report
 *   5. Email report to customer (via SendGrid)
 *
 * Cost per delivery: ~$0.05 (LLM) + $0 (scraping)
 * Handler: data_audit
 */

'use strict';

const { run, get, all } = require('../db/connection');
const { chat } = require('./ollamaBridge');

// ── Constants ────────────────────────────────────────────────────────────────

const HIGH_CHAOS_ERP = ['QuickBooks', 'QBE', 'Excel', 'Unknown', 'Manual', 'None', 'Sage', 'Xero'];
const MEDIUM_CHAOS_ERP = ['NetSuite', 'SAP B1', 'Dynamics GP', 'Dynamics NAV', 'Acumatica'];

const TECH_STACK_SIGNALS = [
  { pattern: /quickbooks|intuit/i, label: 'QuickBooks', chaosWeight: 25 },
  { pattern: /excel|spreadsheet|\.xlsx/i, label: 'Excel/Spreadsheets', chaosWeight: 20 },
  { pattern: /sage\s*(50|100|200|300|intacct)/i, label: 'Sage', chaosWeight: 15 },
  { pattern: /xero/i, label: 'Xero', chaosWeight: 10 },
  { pattern: /netsuite/i, label: 'NetSuite', chaosWeight: 5 },
  { pattern: /salesforce/i, label: 'Salesforce', chaosWeight: 0 },
  { pattern: /hubspot/i, label: 'HubSpot', chaosWeight: 0 },
  { pattern: /appfolio/i, label: 'AppFolio', chaosWeight: 10 },
  { pattern: /yardi/i, label: 'Yardi', chaosWeight: 10 },
  { pattern: /procore/i, label: 'Procore', chaosWeight: 5 },
];

const PAIN_KEYWORDS = [
  { pattern: /data.*(mess|chaos|cleanup|quality|integrity)/i, label: 'Data chaos mentioned', weight: 20 },
  { pattern: /migrat(e|ion|ing)/i, label: 'Migration signal', weight: 15 },
  { pattern: /reconcil(e|iation)/i, label: 'Reconciliation issues', weight: 15 },
  { pattern: /month.?end.*(close|process|pain)/i, label: 'Month-end pain', weight: 20 },
  { pattern: /duplicate.*(record|data|entry)/i, label: 'Duplicate data', weight: 15 },
  { pattern: /manual.*(entry|process|input)/i, label: 'Manual processes', weight: 15 },
  { pattern: /hiring.*(bookkeeper|controller|accountant|data analyst)/i, label: 'Hiring finance/data role', weight: 20 },
  { pattern: /ai|artificial intelligence|automat/i, label: 'AI/automation interest', weight: 10 },
];

// ── Scoring ──────────────────────────────────────────────────────────────────

/**
 * Score a company's data chaos level (0-100).
 * Higher = more chaos = stronger candidate for Data Rehab.
 */
function scoreDataChaos({ companyName, website, industry, erpSystem, scrapedText, jobPostings }) {
  let score = 0;
  const signals = [];
  const systems = [];

  // 1. Known ERP system
  if (erpSystem) {
    if (HIGH_CHAOS_ERP.includes(erpSystem)) {
      score += 25;
      signals.push(`${erpSystem} — high data chaos risk`);
      systems.push(erpSystem);
    } else if (MEDIUM_CHAOS_ERP.includes(erpSystem)) {
      score += 10;
      signals.push(`${erpSystem} — moderate complexity`);
      systems.push(erpSystem);
    }
  }

  // 2. Tech stack signals from website
  if (scrapedText) {
    for (const sig of TECH_STACK_SIGNALS) {
      if (sig.pattern.test(scrapedText)) {
        score += sig.chaosWeight;
        signals.push(`Website mentions ${sig.label}`);
        systems.push(sig.label);
      }
    }

    // 3. Pain keywords in website text
    for (const kw of PAIN_KEYWORDS) {
      if (kw.pattern.test(scrapedText)) {
        score += kw.weight;
        signals.push(kw.label);
      }
    }
  }

  // 4. Job posting signals
  if (jobPostings && jobPostings.length > 0) {
    score += 15;
    signals.push(`${jobPostings.length} relevant job postings found`);
  }

  // 5. Industry multiplier
  if (/construction|contractor|general contractor/i.test(industry)) {
    score += 10;
    signals.push('Construction — high data chaos industry');
  } else if (/property.*(management|mgmt)|real estate/i.test(industry)) {
    score += 10;
    signals.push('Property management — multi-system complexity');
  }

  // 6. Multiple disconnected systems
  const uniqueSystems = [...new Set(systems)];
  if (uniqueSystems.length >= 3) {
    score += 15;
    signals.push(`${uniqueSystems.length} disconnected systems detected`);
  } else if (uniqueSystems.length === 2) {
    score += 10;
    signals.push('2 systems — possible integration gaps');
  }

  score = Math.min(score, 100);

  const rating = score >= 75 ? 'CRITICAL'
    : score >= 50 ? 'HIGH'
    : score >= 30 ? 'MODERATE'
    : 'LOW';

  return { score, rating, signals, systems: uniqueSystems };
}

// ── Web Scraping ─────────────────────────────────────────────────────────────

/**
 * Lightweight website text extraction via fetch (no Playwright needed).
 */
async function scrapeWebsite(url) {
  try {
    if (!url) return '';
    if (!url.startsWith('http')) url = `https://${url}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DataAuditBot/1.0)' },
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeout);
    if (!resp.ok) return '';

    const html = await resp.text();
    // Strip HTML tags, keep text
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 10000); // Cap at 10k chars
  } catch {
    return '';
  }
}

// ── Report Generation ────────────────────────────────────────────────────────

/**
 * Generate the Data Audit Report using LLM.
 */
async function generateReport(auditData) {
  const { companyName, industry, erpSystem, chaosResult, website } = auditData;

  const prompt = `You are a data health consultant writing a professional Data Audit Report.

Company: ${companyName}
Industry: ${industry || 'Unknown'}
Current ERP/Systems: ${erpSystem || 'Unknown'}
Website: ${website || 'N/A'}
Data Chaos Score: ${chaosResult.score}/100 (${chaosResult.rating})
Systems Detected: ${chaosResult.systems.join(', ') || 'None identified'}
Signals Found:
${chaosResult.signals.map(s => `- ${s}`).join('\n')}

Write a concise, professional data audit report with these sections:
1. EXECUTIVE SUMMARY (2-3 sentences)
2. DATA HEALTH SCORE (explain the ${chaosResult.score}/100 score)
3. KEY FINDINGS (bullet each signal with business impact)
4. RISK ASSESSMENT (what breaks if they don't fix this)
5. RECOMMENDED ACTIONS (3-5 specific, prioritized steps)
6. ESTIMATED ROI (time savings, error reduction, AI-readiness)

Keep it under 800 words. Be specific and actionable — no fluff.
Write as if you are the consultant, not an AI.`;

  try {
    const reportText = await chat(
      'You are a data health consultant. Write professional, actionable reports.',
      prompt,
      { model: 'llama3.2:3b', provider: 'ollama', maxTokens: 2048, temperature: 0.4 }
    );
    return reportText;
  } catch {
    // Fallback: structured template without LLM
    return generateTemplateReport(auditData);
  }
}

/**
 * Fallback template report (no LLM needed).
 */
function generateTemplateReport(auditData) {
  const { companyName, industry, erpSystem, chaosResult } = auditData;
  const { score, rating, signals, systems } = chaosResult;

  return `
DATA AUDIT REPORT — ${companyName.toUpperCase()}
${'='.repeat(50)}

EXECUTIVE SUMMARY
${companyName} has a Data Chaos Score of ${score}/100 (${rating}).
${score >= 50 ? 'Immediate action is recommended to prevent data-driven decision failures.' : 'Some cleanup recommended before implementing AI or automation tools.'}

DATA HEALTH SCORE: ${score}/100 (${rating})
${rating === 'CRITICAL' ? 'Your data infrastructure has significant issues that are likely costing money and causing errors daily.'
  : rating === 'HIGH' ? 'Multiple data quality issues detected that will block AI adoption and growth.'
  : rating === 'MODERATE' ? 'Some data hygiene issues found. Addressing these will unlock automation opportunities.'
  : 'Your data infrastructure appears relatively clean. Minor optimizations possible.'}

CURRENT SYSTEMS: ${systems.length > 0 ? systems.join(', ') : erpSystem || 'Not identified'}

KEY FINDINGS
${signals.map(s => `• ${s}`).join('\n')}

RECOMMENDED ACTIONS
1. ${score >= 50 ? 'Conduct full data mapping exercise — identify all data sources and flows' : 'Document current data flows between systems'}
2. ${systems.length >= 2 ? 'Evaluate integration platform to connect ' + systems.slice(0, 2).join(' and ') : 'Standardize data entry procedures'}
3. ${score >= 40 ? 'Implement data validation rules at entry points' : 'Set up monthly data quality checks'}
4. Clean existing duplicate and stale records
5. Build data dictionary for key business entities

ESTIMATED ROI
• Time savings: ${score >= 50 ? '10-20' : '5-10'} hours/month from reduced manual reconciliation
• Error reduction: ${score >= 50 ? '60-80%' : '30-50%'} fewer data-related errors
• AI readiness: ${score >= 40 ? 'Currently NOT ready for AI — this audit is the first step' : 'Near-ready for AI tools after minor cleanup'}

${'='.repeat(50)}
Report generated by Pilcher & Associates Data Health Assessment
  `.trim();
}

/**
 * Format report as HTML for email delivery.
 */
function reportToHtml(reportText, companyName, chaosScore) {
  const scoreColor = chaosScore >= 75 ? '#ef4444'
    : chaosScore >= 50 ? '#f59e0b'
    : chaosScore >= 30 ? '#3b82f6'
    : '#22c55e';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; color: #1a1a1a; line-height: 1.6; }
  h1 { color: #111827; border-bottom: 3px solid ${scoreColor}; padding-bottom: 10px; }
  .score-badge { display: inline-block; background: ${scoreColor}; color: white; padding: 4px 12px; border-radius: 4px; font-weight: bold; font-size: 18px; }
  h2 { color: #374151; margin-top: 24px; }
  ul { padding-left: 20px; }
  li { margin-bottom: 6px; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 13px; }
  pre { white-space: pre-wrap; font-family: inherit; }
</style></head>
<body>
  <h1>Data Health Audit — ${companyName}</h1>
  <p>Data Chaos Score: <span class="score-badge">${chaosScore}/100</span></p>
  <pre>${reportText}</pre>
  <div class="footer">
    <p>Pilcher &amp; Associates — Data Health Assessment</p>
    <p>Questions? Reply to this email or visit our website.</p>
  </div>
</body>
</html>`;
}

// ── Email Delivery ───────────────────────────────────────────────────────────

async function deliverReport(auditId) {
  const audit = get('SELECT * FROM audit_requests WHERE id = ?', [auditId]);
  if (!audit) throw new Error(`Audit ${auditId} not found`);
  if (!audit.contact_email) throw new Error('No contact email for delivery');
  if (audit.status !== 'completed') throw new Error(`Audit status is ${audit.status}, not completed`);

  try {
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    const report = JSON.parse(audit.report_json || '{}');
    const html = reportToHtml(report.reportText || '', audit.company_name, audit.chaos_score);

    await sgMail.send({
      to: audit.contact_email,
      from: process.env.SENDGRID_FROM_EMAIL || 'reports@pilcherassociates.com',
      subject: `Data Health Audit Report — ${audit.company_name}`,
      html,
    });

    run('UPDATE audit_requests SET status = ?, delivered_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?',
      ['delivered', auditId]);

    return { success: true, deliveredTo: audit.contact_email };
  } catch (error) {
    run('UPDATE audit_requests SET error = ?, updated_at = datetime(\'now\') WHERE id = ?',
      [error.message, auditId]);
    throw error;
  }
}

// ── Main Pipeline ────────────────────────────────────────────────────────────

/**
 * Run the full Data Audit pipeline for a request.
 *
 * @param {string} auditId — ID from audit_requests table
 * @returns {{ auditId, chaosScore, rating, reportLength, costUsd }}
 */
async function runDataAudit(auditId) {
  const audit = get('SELECT * FROM audit_requests WHERE id = ?', [auditId]);
  if (!audit) throw new Error(`Audit request ${auditId} not found`);

  run('UPDATE audit_requests SET status = ?, updated_at = datetime(\'now\') WHERE id = ?',
    ['processing', auditId]);

  try {
    // Step 1: Scrape website
    const scrapedText = await scrapeWebsite(audit.website);

    // Step 2: Score data chaos
    const chaosResult = scoreDataChaos({
      companyName: audit.company_name,
      website: audit.website,
      industry: audit.industry,
      erpSystem: audit.erp_system,
      scrapedText,
      jobPostings: [], // Future: job board scraping
    });

    // Step 3: Generate report
    const reportText = await generateReport({
      companyName: audit.company_name,
      industry: audit.industry,
      erpSystem: audit.erp_system,
      chaosResult,
      website: audit.website,
    });

    // Step 4: Save results
    const reportJson = JSON.stringify({
      chaosResult,
      reportText,
      scrapedTextLength: scrapedText.length,
      generatedAt: new Date().toISOString(),
    });

    run(`UPDATE audit_requests SET
      status = 'completed',
      chaos_score = ?,
      report_json = ?,
      updated_at = datetime('now')
      WHERE id = ?`,
      [chaosResult.score, reportJson, auditId]);

    // Step 5: If lead has email, auto-enter into Data Rehab pipeline
    if (audit.contact_email && chaosResult.score >= 50) {
      try {
        const existingLead = get('SELECT id FROM cfo_leads WHERE contact_email = ?', [audit.contact_email]);
        if (!existingLead) {
          run(`INSERT INTO cfo_leads (id, company_name, contact_name, contact_email, city, state,
               source_agent, status, erp_type, pilot_fit_score, attribution_source, notes)
               VALUES (lower(hex(randomblob(16))), ?, ?, ?, '', '', 'data_rehab', 'new', ?, ?,
               'data_audit_report', ?)`,
            [audit.company_name, audit.contact_name || '', audit.contact_email,
             audit.erp_system || '', chaosResult.score,
             `Data audit score: ${chaosResult.score}/100 (${chaosResult.rating}). Signals: ${chaosResult.signals.join('; ')}`]);
        }
      } catch {}
    }

    return {
      auditId,
      chaosScore: chaosResult.score,
      rating: chaosResult.rating,
      signals: chaosResult.signals.length,
      reportLength: reportText.length,
      costUsd: 0.05, // Ollama is free, this is conservative
    };
  } catch (error) {
    run('UPDATE audit_requests SET status = ?, error = ?, updated_at = datetime(\'now\') WHERE id = ?',
      ['failed', error.message, auditId]);
    throw error;
  }
}

/**
 * Create a new audit request and run the pipeline.
 */
async function createAndRunAudit({ companyName, website, industry, erpSystem, contactName, contactEmail, source = 'manual', amountCents = 0 }) {
  if (!companyName) throw new Error('company_name is required');

  const id = require('crypto').randomBytes(16).toString('hex');

  run(`INSERT INTO audit_requests (id, company_name, website, industry, erp_system, contact_name, contact_email, source, amount_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, companyName, website || null, industry || null, erpSystem || null,
     contactName || null, contactEmail || null, source, amountCents]);

  const result = await runDataAudit(id);
  return { ...result, auditId: id };
}

/**
 * Process pending audit requests (batch mode for scheduled runs).
 */
async function processPendingAudits(limit = 5) {
  const pending = all('SELECT id FROM audit_requests WHERE status = ? ORDER BY created_at ASC LIMIT ?',
    ['pending', limit]);

  const results = [];
  for (const audit of pending) {
    try {
      const result = await runDataAudit(audit.id);
      results.push(result);
    } catch (error) {
      results.push({ auditId: audit.id, error: error.message });
    }
  }

  return { processed: results.length, results };
}

module.exports = {
  scoreDataChaos,
  runDataAudit,
  createAndRunAudit,
  processPendingAudits,
  deliverReport,
  reportToHtml,
};
