#!/usr/bin/env node
/**
 * @file seed-hoa-articles.js
 * @description Pushes starter articles, industry news, and SEO insights to the HOA
 *              Project Intake website via its webhook API. Run once to populate the
 *              Articles & Insights page so it looks professional from day one.
 *
 * Usage:
 *   node scripts/seed-hoa-articles.js              # Uses .env.local config
 *   node scripts/seed-hoa-articles.js --dry-run     # Preview without posting
 *
 * Requires:
 *   HOA_WEBHOOK_SECRET and HOA_WEBHOOK_API_URL set in .env.local
 */

require('dotenv').config({ path: '.env.local' });

const crypto = require('crypto');

const SECRET = process.env.HOA_WEBHOOK_SECRET;
const API_URL = (process.env.HOA_WEBHOOK_API_URL || '').replace(/\/$/, '');
const DRY_RUN = process.argv.includes('--dry-run');

if (!SECRET || !API_URL) {
  console.error('ERROR: HOA_WEBHOOK_SECRET and HOA_WEBHOOK_API_URL must be set in .env.local');
  process.exit(1);
}

function signPayload(payload) {
  const timestamp = Date.now().toString();
  const body = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', SECRET)
    .update(timestamp + body)
    .digest('hex');
  return {
    'x-webhook-signature': signature,
    'x-webhook-timestamp': timestamp,
    'Content-Type': 'application/json',
  };
}

async function postWebhook(path, payload) {
  const url = `${API_URL}${path}`;
  const headers = signPayload(payload);

  if (DRY_RUN) {
    console.log(`[DRY RUN] Would POST to ${url}`);
    console.log(`  Payload keys: ${Object.keys(payload).join(', ')}`);
    return { success: true, dryRun: true };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${data.message || JSON.stringify(data)}`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// SEED DATA
// ---------------------------------------------------------------------------

const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

const internalArticles = [
  {
    external_id: 'seed-001-special-assessment-alternatives',
    type: 'internal',
    status: 'published',
    title: 'Special Assessment Alternatives: 5 Ways to Fund HOA Projects Without Burdening Homeowners',
    excerpt: 'Discover proven financing strategies that protect homeowners from large, unexpected special assessments while still getting critical projects done.',
    body: `<h2>The Problem With Special Assessments</h2>
<p>When an HOA faces a major capital improvement — a roof replacement, elevator modernization, or parking structure repair — the default reaction is often a special assessment. But these one-time levies can devastate homeowners financially, especially retirees on fixed incomes.</p>
<p>The good news? Special assessments aren't your only option. Modern HOA financing has evolved to offer flexible, homeowner-friendly alternatives that spread costs over time without requiring large upfront payments.</p>

<h2>5 Proven Alternatives to Special Assessments</h2>

<h3>1. HOA Reserve Fund Loans</h3>
<p>A reserve fund loan lets your association borrow against future reserve contributions. The community repays the loan over 5-15 years through slightly increased monthly dues, rather than a single lump-sum assessment.</p>
<p><strong>Best for:</strong> Communities with healthy reserve fund histories and projects under $2M.</p>
<p><strong>Key advantage:</strong> No individual homeowner credit checks required — the loan is to the association, not individuals.</p>

<h3>2. Capital Improvement Lines of Credit</h3>
<p>Similar to a business line of credit, this gives your HOA access to a predetermined amount of funding that you draw from as needed. You only pay interest on what you use.</p>
<p><strong>Best for:</strong> Phased projects or communities with multiple upcoming repairs.</p>

<h3>3. Assessment Bonds</h3>
<p>Municipal-style bonds issued specifically for HOA projects. Homeowners who want to pay their share upfront can do so, while others pay over time through their dues.</p>
<p><strong>Best for:</strong> Large projects ($1M+) in communities with 100+ units.</p>

<div style="background: #f0f9ff; border-left: 4px solid #0369a1; padding: 16px; margin: 24px 0;">
<strong>Need financing for your HOA project?</strong><br>
Talk to our team — free 15-minute consult, no commitment, no personal guarantees.<br>
<a href="https://www.hoaprojectfunding.com">Get Your Free Consultation →</a>
</div>

<h3>4. Vendor Financing Programs</h3>
<p>Many large contractors offer their own financing programs for HOA projects. While convenience is a plus, be sure to compare rates — vendor financing often costs more than third-party lending.</p>
<p><strong>Best for:</strong> Smaller projects where the contractor relationship is already established.</p>

<h3>5. Phased Project Execution</h3>
<p>Sometimes the best financing strategy is breaking a large project into manageable phases funded by increased reserves over time. This requires planning ahead but avoids debt entirely.</p>
<p><strong>Best for:</strong> Non-emergency repairs that can be staged over 2-3 years.</p>

<h2>How to Choose the Right Option</h2>
<p>Consider these factors when evaluating alternatives:</p>
<ul>
<li><strong>Project urgency:</strong> Emergency repairs limit your options; planned improvements give you time to explore.</li>
<li><strong>Community size:</strong> Larger communities qualify for better loan terms.</li>
<li><strong>Reserve fund health:</strong> Strong reserves make you a better borrowing candidate.</li>
<li><strong>Homeowner demographics:</strong> Communities with many retirees benefit most from spreading costs.</li>
</ul>

<h2>Getting Started</h2>
<p>The first step is understanding your project scope and getting competitive bids. Once you have a clear cost picture, explore your financing options before defaulting to a special assessment.</p>

<div style="background: #f0f9ff; border-left: 4px solid #0369a1; padding: 16px; margin: 24px 0;">
<strong>Ready to see competitive loan options for your community?</strong><br>
Complete the application and we'll present your board with tailored bids in days.<br>
<a href="https://www.hoaprojectfunding.com">Apply Now →</a>
</div>`,
    category: 'Financing',
    tags: ['special assessments', 'HOA financing', 'reserve fund loans', 'capital improvements'],
    author: 'HOA Project Funding Team',
    read_time: '6 min read',
    featured: true,
    published_at: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
  {
    external_id: 'seed-002-reserve-study-guide',
    type: 'internal',
    status: 'published',
    title: 'How to Read Your HOA Reserve Study: A Board Member\'s Complete Guide',
    excerpt: 'Reserve studies can be overwhelming. Here\'s how to extract the key insights your board needs to make smart funding decisions.',
    body: `<h2>What Is a Reserve Study?</h2>
<p>A reserve study is a detailed assessment of your community's common-area components — roofs, parking lots, pools, elevators, plumbing — and how much money you'll need to repair or replace them over the next 30 years. Think of it as your community's financial crystal ball.</p>
<p>Every HOA should have one, and most states require them. But simply having a reserve study isn't enough — your board needs to understand what it says and act on its recommendations.</p>

<h2>The Two Key Sections</h2>

<h3>1. Physical Analysis</h3>
<p>This section inventories every major component your HOA is responsible for maintaining. For each item, the study estimates:</p>
<ul>
<li><strong>Useful life:</strong> How long the component will last (e.g., asphalt shingles: 25 years)</li>
<li><strong>Remaining useful life:</strong> How many years until replacement is needed</li>
<li><strong>Current replacement cost:</strong> What it would cost to replace today</li>
<li><strong>Future replacement cost:</strong> Adjusted for inflation</li>
</ul>

<h3>2. Financial Analysis</h3>
<p>This section compares your current reserve fund balance against projected future costs. The key metric here is your <strong>percent funded</strong> — the ratio of what you have saved to what you should have saved.</p>
<ul>
<li><strong>70-100% funded:</strong> Healthy — you're on track</li>
<li><strong>30-70% funded:</strong> Caution — consider increasing contributions</li>
<li><strong>Below 30% funded:</strong> Critical — special assessments or loans may be needed</li>
</ul>

<div style="background: #f0f9ff; border-left: 4px solid #0369a1; padding: 16px; margin: 24px 0;">
<strong>Need financing for your HOA project?</strong><br>
Talk to our team — free 15-minute consult, no commitment, no personal guarantees.<br>
<a href="https://www.hoaprojectfunding.com">Get Your Free Consultation →</a>
</div>

<h2>Red Flags to Watch For</h2>
<p>When reviewing your reserve study, look out for:</p>
<ul>
<li><strong>Deferred maintenance items</strong> — components past their useful life that haven't been replaced</li>
<li><strong>Flat funding plans</strong> — contribution schedules that don't increase with inflation</li>
<li><strong>Missing components</strong> — make sure all common areas are accounted for</li>
<li><strong>Outdated cost estimates</strong> — construction costs have risen 30-40% in many markets since 2020</li>
</ul>

<h2>Taking Action</h2>
<p>Once you understand your reserve study, your board should:</p>
<ol>
<li>Update the study every 3-5 years (or annually for large communities)</li>
<li>Adjust reserve contributions to meet the recommended funding level</li>
<li>Plan ahead for large upcoming expenses by exploring financing options early</li>
<li>Share a summary with homeowners to build trust and transparency</li>
</ol>

<div style="background: #f0f9ff; border-left: 4px solid #0369a1; padding: 16px; margin: 24px 0;">
<strong>Ready to see competitive loan options for your community?</strong><br>
Complete the application and we'll present your board with tailored bids in days.<br>
<a href="https://www.hoaprojectfunding.com">Apply Now →</a>
</div>`,
    category: 'Reserve Studies',
    tags: ['reserve study', 'HOA board', 'percent funded', 'financial planning'],
    author: 'HOA Project Funding Team',
    read_time: '7 min read',
    featured: false,
    published_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
  {
    external_id: 'seed-003-board-governance-meetings',
    type: 'internal',
    status: 'published',
    title: 'Running Effective HOA Board Meetings: 8 Best Practices Every Board Should Follow',
    excerpt: 'Well-run board meetings build homeowner trust, reduce conflict, and lead to better decisions for your community.',
    body: `<h2>Why Board Meetings Matter</h2>
<p>HOA board meetings are where the most important decisions about your community get made — budgets, maintenance priorities, vendor selection, and policy changes. When meetings are organized and transparent, homeowners feel heard and trust the board's leadership. When they're not, frustration builds and conflicts escalate.</p>

<h2>8 Best Practices for Better Board Meetings</h2>

<h3>1. Distribute the Agenda 48 Hours in Advance</h3>
<p>Surprises breed suspicion. Send the agenda to all board members and homeowners at least two days before the meeting. Include backup materials for major decisions so everyone comes prepared.</p>

<h3>2. Start and End on Time</h3>
<p>Respect everyone's schedule. Set a hard start time and a target end time (90 minutes max for regular meetings). If you can't cover everything, schedule a follow-up rather than running long.</p>

<h3>3. Use a Consent Agenda for Routine Items</h3>
<p>Bundle routine approvals (meeting minutes, financial reports, committee updates) into a single consent agenda that's approved with one vote. This frees up time for substantive discussion on complex topics.</p>

<div style="background: #f0f9ff; border-left: 4px solid #0369a1; padding: 16px; margin: 24px 0;">
<strong>Need financing for your HOA project?</strong><br>
Talk to our team — free 15-minute consult, no commitment, no personal guarantees.<br>
<a href="https://www.hoaprojectfunding.com">Get Your Free Consultation →</a>
</div>

<h3>4. Allow Homeowner Comments — With Structure</h3>
<p>Designate a specific time slot (usually 15-20 minutes) for homeowner comments. Use a sign-up sheet and a 3-minute time limit per speaker to ensure fairness.</p>

<h3>5. Take Formal Votes on Every Decision</h3>
<p>Even if the board is in agreement, record a formal vote with the count. This protects the board legally and creates a clear audit trail.</p>

<h3>6. Assign Action Items With Deadlines</h3>
<p>Every decision should result in a specific action item assigned to a specific person with a specific deadline. Review outstanding action items at the start of each meeting.</p>

<h3>7. Keep Accurate Minutes</h3>
<p>Meeting minutes should record decisions and votes, not every word spoken. Have them reviewed and approved at the next meeting. Store them where all homeowners can access them.</p>

<h3>8. Separate Executive Sessions Clearly</h3>
<p>When the board needs to discuss legal, personnel, or contractual matters privately, transition to an executive session with a clear motion and return to open session with a summary of any actions taken.</p>

<h2>Building Trust Through Transparency</h2>
<p>The best boards treat meetings as an opportunity to demonstrate competent, transparent governance. When homeowners see organized meetings with clear decision-making, they're far more likely to support board initiatives — including necessary assessments and projects.</p>

<div style="background: #f0f9ff; border-left: 4px solid #0369a1; padding: 16px; margin: 24px 0;">
<strong>Ready to see competitive loan options for your community?</strong><br>
Complete the application and we'll present your board with tailored bids in days.<br>
<a href="https://www.hoaprojectfunding.com">Apply Now →</a>
</div>`,
    category: 'Board Governance',
    tags: ['board meetings', 'HOA governance', 'transparency', 'best practices'],
    author: 'HOA Project Funding Team',
    read_time: '6 min read',
    featured: false,
    published_at: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
  {
    external_id: 'seed-004-roof-replacement-financing',
    type: 'internal',
    status: 'published',
    title: 'HOA Roof Replacement Financing: What Every Board Needs to Know Before Getting Bids',
    excerpt: 'Roof replacements are one of the most expensive projects an HOA will face. Here\'s how to approach financing before the first contractor walks the property.',
    body: `<h2>The Reality of HOA Roof Costs</h2>
<p>A full roof replacement for a multi-building HOA community can easily run $500,000 to $2 million or more, depending on size, materials, and local labor costs. It's often the single largest capital expense an association will face — and one of the most urgent, since a failing roof leads to water damage, mold, and liability issues.</p>
<p>The key to handling this cost without devastating homeowners is planning your financing strategy <em>before</em> you start getting contractor bids.</p>

<h2>Step 1: Understand Your Full Scope</h2>
<p>Before financing, you need accurate cost estimates. Get at least three bids from licensed, insured roofing contractors. Each bid should break down:</p>
<ul>
<li>Tear-off vs. overlay (tear-off costs more but lasts longer)</li>
<li>Material options and warranties</li>
<li>Timeline and phasing options</li>
<li>Permits and inspection costs</li>
<li>Contingency for unexpected issues (10-15% is standard)</li>
</ul>

<h2>Step 2: Check Your Reserve Fund</h2>
<p>Your reserve study should include a line item for roof replacement. Compare the reserve allocation against actual bid amounts. If there's a gap (and there usually is, given construction cost inflation), you'll need to finance the difference.</p>

<div style="background: #f0f9ff; border-left: 4px solid #0369a1; padding: 16px; margin: 24px 0;">
<strong>Need financing for your HOA project?</strong><br>
Talk to our team — free 15-minute consult, no commitment, no personal guarantees.<br>
<a href="https://www.hoaprojectfunding.com">Get Your Free Consultation →</a>
</div>

<h2>Step 3: Evaluate Financing Options</h2>
<p>Most HOAs have three primary financing paths for roof replacement:</p>

<h3>Reserve Fund Loan</h3>
<p>Borrow against future reserve contributions. Repayment comes through slightly increased monthly dues over 5-15 years. No individual homeowner credit impact.</p>

<h3>Special Assessment</h3>
<p>A one-time levy on each unit owner. Fast to implement but can cause significant financial hardship, especially for retirees and fixed-income homeowners.</p>

<h3>Combination Approach</h3>
<p>Use available reserves for a portion, finance the remainder with a loan, and implement a modest dues increase to fund repayment. This is often the most homeowner-friendly approach.</p>

<h2>Step 4: Get Board and Owner Approval</h2>
<p>Most states require owner approval for borrowing above certain thresholds or for special assessments. Check your governing documents and state statutes. Build a clear presentation showing the cost, financing terms, and impact on monthly dues.</p>

<h2>Getting Started</h2>
<p>Don't wait until leaks appear. If your reserve study shows a roof replacement within the next 5 years, start exploring financing options now. Early planning gives you leverage to negotiate better terms and avoid emergency decisions.</p>

<div style="background: #f0f9ff; border-left: 4px solid #0369a1; padding: 16px; margin: 24px 0;">
<strong>Ready to see competitive loan options for your community?</strong><br>
Complete the application and we'll present your board with tailored bids in days.<br>
<a href="https://www.hoaprojectfunding.com">Apply Now →</a>
</div>`,
    category: 'Project Planning',
    tags: ['roof replacement', 'HOA financing', 'capital improvements', 'project planning'],
    author: 'HOA Project Funding Team',
    read_time: '7 min read',
    featured: true,
    published_at: new Date(Date.now() - 7 * 86400000).toISOString(),
  },
  {
    external_id: 'seed-005-sb4d-compliance',
    type: 'internal',
    status: 'published',
    title: 'SB 4-D Compliance for Florida Condos: What Your Association Needs to Do Now',
    excerpt: 'Florida\'s landmark condo safety law requires structural inspections and fully funded reserves. Here\'s your compliance roadmap.',
    body: `<h2>What Is SB 4-D?</h2>
<p>In the wake of the Champlain Towers South tragedy in Surfside, Florida enacted Senate Bill 4-D — the most significant condo safety legislation in the state's history. The law mandates structural integrity inspections and fully funded reserves for condos three stories or taller.</p>
<p>If you serve on a Florida condo board, compliance isn't optional. Failing to meet deadlines can expose your association to significant legal liability.</p>

<h2>Key Requirements</h2>

<h3>Milestone Inspections</h3>
<p>Condominiums three stories or taller must undergo milestone structural inspections:</p>
<ul>
<li><strong>Buildings 30+ years old:</strong> Initial inspection by December 31, 2025</li>
<li><strong>Buildings within 3 miles of the coastline:</strong> Initial inspection at 25 years</li>
<li><strong>Subsequent inspections:</strong> Every 10 years after the initial</li>
</ul>

<h3>Structural Integrity Reserve Studies (SIRS)</h3>
<p>Starting January 1, 2025, associations must complete a SIRS that covers these components:</p>
<ul>
<li>Roof</li>
<li>Load-bearing walls and primary structural members</li>
<li>Floor systems</li>
<li>Foundation</li>
<li>Fireproofing and fire protection systems</li>
<li>Plumbing</li>
<li>Electrical systems</li>
<li>Waterproofing and exterior painting</li>
<li>Windows and exterior doors</li>
</ul>

<div style="background: #f0f9ff; border-left: 4px solid #0369a1; padding: 16px; margin: 24px 0;">
<strong>Need financing for your HOA project?</strong><br>
Talk to our team — free 15-minute consult, no commitment, no personal guarantees.<br>
<a href="https://www.hoaprojectfunding.com">Get Your Free Consultation →</a>
</div>

<h2>The Full Funding Mandate</h2>
<p>Perhaps the most impactful provision: associations can <strong>no longer waive or reduce reserve funding</strong> for the structural components listed above. This means many communities will need to significantly increase their reserve contributions or find alternative funding for deferred maintenance.</p>
<p>For communities that have been underfunding reserves for years, the gap between current reserves and required levels can be staggering — often hundreds of thousands of dollars.</p>

<h2>Funding Strategies for Compliance</h2>
<p>Boards facing large reserve shortfalls have several options:</p>
<ol>
<li><strong>Gradual dues increases</strong> — Spread the increase over 2-3 years to reduce homeowner shock</li>
<li><strong>Reserve fund loans</strong> — Borrow to bring reserves to required levels, repay through dues</li>
<li><strong>Special assessments</strong> — One-time levy to close the gap quickly</li>
<li><strong>Combination approach</strong> — Partial loan + partial dues increase</li>
</ol>

<h2>Your Compliance Timeline</h2>
<p>Don't wait for deadlines to approach. Start now by:</p>
<ol>
<li>Scheduling your milestone inspection with a licensed engineer</li>
<li>Commissioning an updated SIRS from a qualified reserve study provider</li>
<li>Reviewing your current reserve funding level against SIRS requirements</li>
<li>Presenting financing options to your board and homeowners</li>
</ol>

<div style="background: #f0f9ff; border-left: 4px solid #0369a1; padding: 16px; margin: 24px 0;">
<strong>Ready to see competitive loan options for your community?</strong><br>
Complete the application and we'll present your board with tailored bids in days.<br>
<a href="https://www.hoaprojectfunding.com">Apply Now →</a>
</div>`,
    category: 'Compliance',
    tags: ['SB 4-D', 'Florida condos', 'structural inspections', 'reserve funding', 'compliance'],
    author: 'HOA Project Funding Team',
    read_time: '8 min read',
    featured: false,
    published_at: new Date(Date.now() - 10 * 86400000).toISOString(),
  },
];

const externalArticles = [
  {
    external_id: 'seed-ext-001-cai-deferred-maintenance',
    type: 'external',
    status: 'published',
    title: 'CAI Report: The Growing Crisis of Deferred Maintenance in U.S. HOAs',
    excerpt: 'The Community Associations Institute\'s latest research highlights a $100B+ deferred maintenance backlog across American HOAs.',
    category: 'Industry Trends',
    tags: ['CAI', 'deferred maintenance', 'industry research'],
    source: 'Community Associations Institute',
    source_url: 'https://www.caionline.org',
    read_time: '5 min read',
    featured: false,
    published_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    external_id: 'seed-ext-002-federal-condo-safety',
    type: 'external',
    status: 'published',
    title: 'Federal Condo Safety Guidelines: What the Latest Proposals Mean for Your Community',
    excerpt: 'Congressional proposals for nationwide structural inspection requirements could reshape HOA obligations across all 50 states.',
    category: 'Compliance',
    tags: ['federal legislation', 'condo safety', 'structural inspections'],
    source: 'National Association of Home Builders',
    source_url: 'https://www.nahb.org',
    read_time: '4 min read',
    featured: false,
    published_at: new Date(Date.now() - 6 * 86400000).toISOString(),
  },
  {
    external_id: 'seed-ext-003-insurance-crisis',
    type: 'external',
    status: 'published',
    title: 'HOA Insurance Costs Surge 30-50% in Coastal Markets: What Boards Can Do',
    excerpt: 'Rising insurance premiums are straining budgets for coastal communities. Industry experts share strategies to manage the impact.',
    category: 'Industry Trends',
    tags: ['insurance', 'coastal communities', 'budget management'],
    source: 'Insurance Journal',
    source_url: 'https://www.insurancejournal.com',
    read_time: '6 min read',
    featured: false,
    published_at: new Date(Date.now() - 8 * 86400000).toISOString(),
  },
];

const seoInsights = [
  {
    insight_key: 'financing-trends-q1-2026',
    title: 'HOA Financing Trends — Q1 2026',
    description: 'Search volume for HOA financing alternatives has surged as more boards seek alternatives to special assessments.',
    metric_value: '42%',
    metric_label: 'increase in HOA financing searches',
    icon: 'TrendingUp',
    color: 'blue',
    sort_order: 1,
    data: {
      chartData: [
        { month: 'Oct', searches: 8200 },
        { month: 'Nov', searches: 9400 },
        { month: 'Dec', searches: 10800 },
        { month: 'Jan', searches: 14200 },
        { month: 'Feb', searches: 17600 },
      ],
    },
  },
  {
    insight_key: 'top-keywords-2026',
    title: 'Top Keywords Driving Traffic',
    description: 'The most searched HOA financing terms this quarter, ranked by search volume and commercial intent.',
    metric_value: '15K+',
    metric_label: 'monthly searches for top keywords',
    icon: 'Target',
    color: 'emerald',
    sort_order: 2,
    data: {
      keywords: [
        { term: 'HOA special assessment alternatives', volume: 4800 },
        { term: 'HOA roof replacement financing', volume: 3200 },
        { term: 'HOA reserve fund loan', volume: 2800 },
        { term: 'condo special assessment help', volume: 2400 },
        { term: 'HOA capital improvement loan', volume: 1900 },
      ],
    },
  },
  {
    insight_key: 'content-performance-q1-2026',
    title: 'Content Performance',
    description: 'Articles focused on financing alternatives consistently outperform general governance content in both traffic and time on page.',
    metric_value: '3.2x',
    metric_label: 'higher engagement on financing content',
    icon: 'BarChart3',
    color: 'purple',
    sort_order: 3,
    data: {
      categories: [
        { name: 'Financing', avgViews: 1240, avgTimeOnPage: 4.2 },
        { name: 'Compliance', avgViews: 890, avgTimeOnPage: 3.8 },
        { name: 'Board Governance', avgViews: 650, avgTimeOnPage: 2.9 },
        { name: 'Reserve Studies', avgViews: 780, avgTimeOnPage: 3.5 },
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== HOA Website Content Seeder ===');
  console.log(`API: ${API_URL}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log('');

  // 1. Push internal articles
  console.log(`--- Pushing ${internalArticles.length} internal articles ---`);
  try {
    const result = await postWebhook('/api/v1/articles/webhook/push', { articles: internalArticles });
    console.log(`  Result: ${JSON.stringify(result)}`);
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
  }

  // 2. Push external articles
  console.log(`\n--- Pushing ${externalArticles.length} external articles ---`);
  try {
    const result = await postWebhook('/api/v1/articles/webhook/push', { articles: externalArticles });
    console.log(`  Result: ${JSON.stringify(result)}`);
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
  }

  // 3. Push SEO insights
  console.log(`\n--- Pushing ${seoInsights.length} SEO insights ---`);
  try {
    const result = await postWebhook('/api/v1/articles/webhook/insights', { insights: seoInsights });
    console.log(`  Result: ${JSON.stringify(result)}`);
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
  }

  console.log('\n=== Seeding complete ===');
  console.log(`Total: ${internalArticles.length} internal + ${externalArticles.length} external + ${seoInsights.length} insights`);

  if (DRY_RUN) {
    console.log('\nThis was a dry run. Re-run without --dry-run to push content.');
  } else {
    console.log(`\nVisit ${API_URL.replace('-api.onrender.com', '.com')}/SEOArticles to see your content!`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
