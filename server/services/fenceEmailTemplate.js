/**
 * @file fenceEmailTemplate.js
 * @description Email templates for Terrapin Station Community Services outreach sequences.
 *
 * Four sequences, 11 emails total:
 *   cold_mgmt  — 4 emails targeting HOA management companies (fence + fire bundled)
 *   cold_board — 2 emails targeting HOA board presidents (requires community_name)
 *   warm       — 2 emails re-engaging existing HGE/EMP contacts
 *   fire_wui   — 3 emails targeting WUI-zone communities (insurance urgency angle)
 *
 * Variables:
 *   {{first_name}}           — contact first name
 *   {{company_name}}         — management company name
 *   {{community_name}}       — HOA community name
 *   {{sender_name}}          — sales rep name (default: Adam Weir)
 *   {{previous_project_type}} — for warm leads (roofing, siding, etc.)
 */

const { wrapInBrandedShell } = require('./sendgrid');

// ─── SEQUENCE DEFINITIONS ───────────────────────────────────────────────────

const SEQUENCES = {
  cold_mgmt: [
    {
      step: 1,
      subject: 'Two things every board dreads — fences and fire risk',
      abTestSubject: 'Quick question about your communities\' fences and defensible space',
      body: `<p>Hi {{first_name}},</p>
<p>Quick question — across your portfolio, how many communities have fence painting OR fire mitigation on the reserve study this year?</p>
<p>We just launched a turnkey program that handles both under one contract. One vendor does the assessment, coordination, execution, and warranty for fence painting AND wildfire defensible space — so boards sign once and stop worrying about both.</p>
<p>The kicker: we offer financing through HOA Project Funding (no special assessment), and with HB 1182 hitting in July, documented fire mitigation now directly impacts insurance premiums.</p>
<p>Would a one-pager be useful? I can also do a free dual assessment on one of your communities.</p>
<p>Best,<br/>{{sender_name}}<br/>Terrapin Station Community Services</p>`,
      dayOffset: 0,
    },
    {
      step: 2,
      subject: 'Re: the math on fences + fire for your boards',
      body: `<p>Hi {{first_name}},</p>
<p>Quick example to show what this looks like.</p>
<p>A 200-home community with 2,000 LF of fencing and 8 acres of common area typically needs $25K-30K for fence painting and $45K-60K for fire mitigation. We bundle that with homeowner coordination, private lot opt-ins, insurance documentation, and warranties — all under one program management contract.</p>
<p>For fire mitigation specifically, starting July 2026, insurers must factor completed work into premiums. We produce the documentation package boards need to pursue savings.</p>
<p>The board gets predictable pricing, zero coordination burden, and financing that avoids a special assessment.</p>
<p>15 minutes to walk through how this works for one of your communities?</p>
<p>{{sender_name}}</p>`,
      dayOffset: 3,
      triggerCondition: 'no_reply',
    },
    {
      step: 3,
      subject: 'Free dual assessment — fences + fire risk, no strings',
      body: `<p>{{first_name}} — one more thought.</p>
<p>We'll walk any one of your communities for free and deliver two things:</p>
<p>1. A fence condition report with photos and LF counts<br/>2. A fire risk zone map showing defensible space gaps</p>
<p>No commitment, no pitch. The board can use both reports regardless of whether they work with us.</p>
<p>Want me to pick a community and schedule it?</p>
<p>{{sender_name}}</p>`,
      dayOffset: 7,
      triggerCondition: 'no_reply',
    },
    {
      step: 4,
      subject: 'Last note on fence + fire programs',
      body: `<p>Hi {{first_name}},</p>
<p>I'll keep this brief — we're booking free dual assessments for Denver-area communities through the end of the month.</p>
<p>If any of your boards have fence maintenance or fire mitigation on the radar (especially with insurance renewals coming up), we'd love to show them what a turnkey program looks like.</p>
<p>No pressure — just let me know if and when it makes sense.</p>
<p>{{sender_name}}<br/>Terrapin Station Community Services</p>`,
      dayOffset: 14,
      triggerCondition: 'no_reply',
    },
  ],

  cold_board: [
    {
      step: 1,
      subject: '{{community_name}} — fences and fire risk, one solution',
      body: `<p>Hi {{first_name}},</p>
<p>I'm reaching out because HOA boards in Colorado tell us the same two things: fence maintenance is their biggest visual headache, and insurance costs are their biggest financial headache.</p>
<p>We built a program that solves both. One contract covers fence painting (assessment, coordination, painting, 3-year warranty) AND wildfire defensible space (tree work, mitigation, insurance documentation).</p>
<p>With HB 1182 taking effect in July, documented fire mitigation directly impacts what your community pays for insurance. And we offer financing so you don't need a special assessment for either program.</p>
<p>Can I do a free walk-through of {{community_name}}'s fencing and tree conditions?</p>
<p>{{sender_name}}<br/>Terrapin Station Community Services</p>`,
      dayOffset: 0,
    },
    {
      step: 2,
      subject: 'Re: free assessment for {{community_name}}',
      body: `<p>{{first_name}} — quick follow-up.</p>
<p>We'll walk {{community_name}}'s fence line and common area vegetation and deliver:</p>
<ul>
<li>Fence condition report with LF counts and a fixed-price estimate</li>
<li>Fire risk zone map with defensible space gaps flagged</li>
</ul>
<p>Free, no commitment. Your board gets both reports regardless.</p>
<p>15-minute call to set it up?</p>
<p>{{sender_name}}</p>`,
      dayOffset: 5,
      triggerCondition: 'no_reply',
    },
  ],

  warm: [
    {
      step: 1,
      subject: 'New from our team — thought of {{community_name}} first',
      body: `<p>Hi {{first_name}},</p>
<p>Hope things are going well at {{community_name}}. We've enjoyed working with your community on {{previous_project_type}} and wanted to give you a first look at something new.</p>
<p>We just launched Terrapin Station Community Services — a dedicated program for two things every Colorado HOA needs: turnkey fence maintenance and wildfire defensible space mitigation.</p>
<p>For fences: assessment, painting, homeowner coordination, 3-year warranty, financing.<br/>For fire: risk assessment, tree work, defensible space, insurance documentation for HB 1182, annual maintenance.</p>
<p>One vendor, one contract for each (or both). Given what we know about {{community_name}}, I think this could be a great fit.</p>
<p>Can I do a quick walk-through next week?</p>
<p>{{sender_name}}<br/>Terrapin Station Community Services</p>`,
      dayOffset: 0,
    },
    {
      step: 2,
      subject: 'Quick question for the {{community_name}} board',
      body: `<p>{{first_name}} — circling back.</p>
<p>Would it help if I put together a one-page overview the board could review at your next meeting? I can tailor it to {{community_name}}'s specific fence and vegetation conditions.</p>
<p>Either way, the free dual assessment offer stands whenever you're ready.</p>
<p>{{sender_name}}</p>`,
      dayOffset: 4,
      triggerCondition: 'no_reply',
    },
  ],

  fire_wui: [
    {
      step: 1,
      subject: '{{community_name}} — heading into fire season exposed?',
      abTestSubject: '{{community_name}}\'s insurance renewal + HB 1182',
      body: `<p>Hey {{first_name}},</p>
<p>After going through the Marshall Fire, I pay a lot more attention to how exposed communities actually are.</p>
<p>This winter has been dry, and most HOAs I talk to don't have a clear picture of their risk heading into the season.</p>
<p>We've been running simple wildfire assessments:</p>
<ul>
<li>Where exposure actually exists (fences, vegetation, layout)</li>
<li>What to prioritize</li>
<li>What it would cost to address</li>
</ul>
<p>No cost — just a board-ready report.</p>
<p>Want me to run one for {{community_name}}?</p>
<p>{{sender_name}}<br/>Terrapin Station Community Services</p>`,
      dayOffset: 0,
    },
    {
      step: 2,
      subject: 'Re: what inaction costs your community',
      body: `<p>{{first_name}} — to put a number on it:</p>
<p>Colorado FAIR Plan rates (the insurer of last resort) run $4,000-5,000+ per year for a single home. If your community's carrier drops coverage or raises rates because mitigation isn't documented, every homeowner feels it.</p>
<p>We'll do a free fire risk assessment for {{community_name}} — a professional zone map showing exactly where defensible space gaps exist. No commitment. Your board gets the report regardless.</p>
<p>The assessment itself is step one of the documentation trail HB 1182 requires.</p>
<p>Want me to schedule it?</p>
<p>{{sender_name}}</p>`,
      dayOffset: 4,
      triggerCondition: 'no_reply',
    },
    {
      step: 3,
      subject: 'Last note — free fire assessment for {{community_name}}',
      body: `<p>Hi {{first_name}},</p>
<p>I know boards have a hundred things competing for attention, so I'll be brief.</p>
<p>We're booking free fire risk assessments for Front Range communities through the end of the month. If {{community_name}}'s insurance renewal is coming up, having a professional assessment and mitigation plan in place before July could make a material difference.</p>
<p>Happy to help whenever the timing is right.</p>
<p>{{sender_name}}<br/>Terrapin Station Community Services</p>`,
      dayOffset: 10,
      triggerCondition: 'no_reply',
    },
  ],
};

// ─── TEMPLATE BUILDER ───────────────────────────────────────────────────────

/**
 * Build a personalized Terrapin Station outreach email.
 *
 * @param {Object} lead - Lead record from fence_leads table
 * @param {string} sequenceType - 'cold_mgmt' | 'cold_board' | 'warm' | 'fire_wui'
 * @param {number} step - 1-based step number
 * @param {string} [senderName='Adam Weir'] - Sending rep's name
 * @returns {{ subject: string, body_html: string, body_text: string, dayOffset: number }}
 */
function buildFenceEmail(lead, sequenceType, step, senderName = 'Adam Weir') {
  const sequence = SEQUENCES[sequenceType];
  if (!sequence) throw new Error(`Unknown sequence type: ${sequenceType}`);

  const template = sequence.find(t => t.step === step);
  if (!template) throw new Error(`No step ${step} in sequence ${sequenceType}`);

  const firstName = extractFirstName(lead.contact_name);

  const vars = {
    '{{first_name}}':            firstName || 'there',
    '{{company_name}}':          lead.company_name || 'your company',
    '{{community_name}}':        lead.community_name || 'your community',
    '{{sender_name}}':           senderName,
    '{{previous_project_type}}': lead.previous_project_type || 'exterior work',
  };

  const subject = substitute(template.subject, vars);
  const bodyHtml = substitute(template.body, vars);

  let body_html;
  try {
    body_html = wrapInBrandedShell(bodyHtml, {
      preheader: `Terrapin Station Community Services — ${lead.community_name || lead.company_name || 'Denver Metro'}`,
    });
  } catch {
    body_html = bodyHtml;
  }

  const body_text = stripToPlainText(bodyHtml);

  return { subject, body_html, body_text, dayOffset: template.dayOffset };
}

/**
 * Get sequence metadata (step count, day offsets) for a sequence type.
 */
function getSequenceInfo(sequenceType) {
  const sequence = SEQUENCES[sequenceType];
  if (!sequence) return null;
  return sequence.map(t => ({
    step: t.step,
    subject: t.subject,
    dayOffset: t.dayOffset,
    triggerCondition: t.triggerCondition || null,
  }));
}

/**
 * Get max steps for a given sequence type.
 */
function getMaxSteps(sequenceType) {
  const sequence = SEQUENCES[sequenceType];
  return sequence ? sequence.length : 0;
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

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
    .replace(/&#8211;|&ndash;/g, '–')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = { buildFenceEmail, getSequenceInfo, getMaxSteps, SEQUENCES };
