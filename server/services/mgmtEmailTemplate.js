/**
 * @file mgmtEmailTemplate.js
 * @description Email template for HOA management company outreach.
 *
 * HOW TO CUSTOMIZE:
 * Replace the letter body in LETTER_BODY below with your actual letter.
 * Available variables (auto-substituted from DB):
 *   {{company_name}}   — management company name (e.g. "FirstService Residential")
 *   {{contact_name}}   — contact's first name (e.g. "John")
 *   {{contact_title}}  — their job title (e.g. "Director of Vendor Relations")
 *   {{hot_community}}  — most urgent community under their management (from review signals)
 *   {{signal_issue}}   — primary issue flagged in reviews (e.g. "reserve deficiency")
 *   {{company_health}} — critical | deteriorating | concerning | healthy
 *   {{state}}          — company's primary state (e.g. "FL")
 */

const { wrapInBrandedShell } = require('./sendgrid');

// ─── SUBJECT LINE ────────────────────────────────────────────────────────────
// Modify this to change the subject for every outreach email.
const SUBJECT_TEMPLATE = `HOA capital funding for communities you manage — {{company_name}}`;

// ─── YOUR LETTER ─────────────────────────────────────────────────────────────
// Live letter — Steve Pilcher / Empire Capital / HOA Project Funding
// Variables auto-substituted from DB: {{contact_name}}, {{company_name}}, {{hot_community}}, {{signal_issue}}

const LETTER_BODY = `
<p>Hi {{contact_name}},</p>

<p>
As a property manager, you know how tough it is when your HOA boards need funding for
capital repairs — roof replacements, exterior work, paving, or reserve shortfalls — but
traditional bank loans take 90–180 days and often force difficult special assessments.
</p>

<p>
Empire Capital is a tech-enabled HOA financing platform built specifically for homeowner
associations nationwide. We provide streamlined loans typically from $25K to $2M for
capital repairs, reconstruction, and reserve projects.
</p>

<p>
Our underwriting is designed around how HOAs actually operate (reserves, delinquency rates,
assessment structures, reserve studies, etc.). We're HOA specialists — not a consumer
lender — and we integrate construction oversight through EmpireWorks so projects stay on
track.
</p>

<p>
We've made the next step ridiculously simple for your boards:<br/>
👉 They can complete our quick intake form in just a few minutes here:
<a href="https://www.hoaprojectfunding.com" style="color:#1e40af;">www.hoaprojectfunding.com</a>
</p>

<p>
If it's helpful, I'd be glad to jump on a quick 10–15 minute call and walk you through
exactly how it works so you can decide if this is something worth keeping in your toolkit
for your communities. No pressure, no sales pitch — just another option to help your
boards move faster.
</p>

<p>Looking forward to connecting,</p>

<p>
<strong>Steve Pilcher</strong><br/>
Empire Capital | HOA Project Funding<br/>
Highlands Ranch, Colorado<br/>
630-989-3887<br/>
<a href="mailto:info@hoaprojectfunding.com" style="color:#1e40af;">info@hoaprojectfunding.com</a><br/>
<a href="https://www.hoaprojectfunding.com" style="color:#1e40af;">www.hoaprojectfunding.com</a>
</p>
`;

// ─── TEMPLATE BUILDER ────────────────────────────────────────────────────────

/**
 * Build a personalized email for one management company contact.
 *
 * @param {Object} params
 * @param {string} params.companyName
 * @param {string} params.contactName   — Full name; first name extracted automatically
 * @param {string} params.contactTitle
 * @param {string} params.hotCommunity  — Community name from review signals (may be null)
 * @param {string} params.signalIssue   — Primary issue (may be null)
 * @param {string} params.companyHealth
 * @param {string} params.state
 * @returns {{ subject: string, body_html: string, body_text: string }}
 */
function buildMgmtEmail({ companyName, contactName, contactTitle, hotCommunity, signalIssue, companyHealth, state }) {
  const firstName = extractFirstName(contactName);

  const vars = {
    '{{company_name}}':   companyName  || 'your company',
    '{{contact_name}}':   firstName    || 'there',
    '{{contact_title}}':  contactTitle || 'your team',
    '{{hot_community}}':  hotCommunity || 'your communities',
    '{{signal_issue}}':   signalIssue  || 'funding needs',
    '{{company_health}}': companyHealth || '',
    '{{state}}':          state        || '',
  };

  const subject  = substitute(SUBJECT_TEMPLATE, vars);
  const bodyHtml = substitute(LETTER_BODY.trim(), vars);
  const body_html = wrapInBrandedShell(bodyHtml, { preheader: `HOA reserve funding solutions for ${companyName || 'your communities'}` });
  const body_text = stripToPlainText(bodyHtml);

  return { subject, body_html, body_text };
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function substitute(template, vars) {
  let result = template;
  for (const [key, val] of Object.entries(vars)) {
    result = result.split(key).join(val);
  }
  return result;
}

function extractFirstName(fullName) {
  if (!fullName) return null;
  return fullName.trim().split(/\s+/)[0];
}

function stripToPlainText(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = { buildMgmtEmail };
