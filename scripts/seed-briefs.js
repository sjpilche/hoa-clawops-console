/**
 * Seed the 6 SEO content briefs as Content Writer schedules.
 * Replaces the generic "Weekly Blog Post" schedule with 6 specific brief schedules.
 *
 * Run with: node scripts/seed-briefs.js
 *
 * - Brief #1 starts ENABLED (Week 1)
 * - Briefs #2-6 start DISABLED — enable one per week in the Scheduler UI
 */

const { initDatabase, run, get, all } = require('../server/db/connection');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

initDatabase(path.join(__dirname, '../data/clawops.db'));

setTimeout(() => {
  // Find the Content Writer agent
  const agents = all('SELECT id, name, config FROM agents');
  let contentWriterAgent = null;

  agents.forEach(a => {
    try {
      const cfg = JSON.parse(a.config || '{}');
      if (cfg.openclaw_id === 'hoa-content-writer') {
        contentWriterAgent = a;
      }
    } catch (e) {}
  });

  if (!contentWriterAgent) {
    console.error('❌ hoa-content-writer agent not found in DB. Make sure agents are seeded first.');
    process.exit(1);
  }

  console.log(`✅ Found agent: ${contentWriterAgent.name} (${contentWriterAgent.id})`);

  // Remove the generic "Weekly Blog Post" schedule
  const existing = get('SELECT id FROM schedules WHERE name = ?', ['Weekly Blog Post']);
  if (existing) {
    run('DELETE FROM schedules WHERE name = ?', ['Weekly Blog Post']);
    console.log('🗑️  Removed generic "Weekly Blog Post" schedule');
  } else {
    console.log('⏭️  No "Weekly Blog Post" schedule to remove');
  }

  const briefs = [
    {
      name: 'Brief #1 — HOA Loan vs Special Assessment',
      description: 'Board decision guide: compare HOA loans vs special assessments. Primary keyword: hoa loan vs special assessment.',
      enabled: 1, // Week 1 — starts enabled
      message: `You are writing a complete SEO-optimized blog post / landing page for hoaprojectfunding.com.

URL SLUG: /hoa-loan-vs-special-assessment
TARGET KEYWORDS: hoa loan vs special assessment, HOA financing options, avoid special assessment, HOA loan alternative
SEARCH INTENT: Board members deciding between imposing a special assessment or financing a project with an HOA loan
WORD COUNT: 1,800–2,200 words
AUDIENCE: HOA board members, property managers comparing options
CTA: Free comparison worksheet download → lead capture
URGENCY HOOK: Boards facing large capital projects often default to special assessments — but there's a better way that protects property values

CONTENT OUTLINE:
- Opening: The board meeting where someone proposes a $2M special assessment
- Section 1: What is a special assessment? (pros, cons, owner impact)
- Section 2: What is an HOA loan? (how it works, who is the borrower, no personal guarantee)
- Section 3: Side-by-side comparison table (cost per unit, timeline, owner burden, property value impact)
- Section 4: When each option makes sense (decision framework)
- Section 5: How mortgage eligibility is affected (Fannie/Freddie scrutiny post-Surfside)
- Section 6: The hybrid approach — partial assessment + loan
- Primary CTA: Download the Board Decision Worksheet / Get Multiple Lender Options in 48–72 Hours
- Secondary CTA (mid-article): Free 15-minute consultation

VOICE & TONE: Write as a knowledgeable advisor to HOA board members, not a salesperson. Use plain language. Acknowledge the stress and complexity boards face. Be specific with numbers, timelines, and processes.

SEO REQUIREMENTS:
- Include primary keyword "hoa loan vs special assessment" in H1, first paragraph, and at least 2 H2s
- Use secondary keywords naturally throughout
- Write meta description (155 chars max) including primary keyword and clear value proposition
- Include FAQ schema markup section at end

COMPLIANCE CONTENT RULES:
- Cite specific statutes/regulations where relevant
- Include disclaimer: "This is educational content, not legal or financial advice."

OUTPUT FORMAT: Complete draft blog post in markdown, starting with: frontmatter (title, slug, meta_description, date), then full article body. End with a "FAQs" section (5 questions) formatted for schema markup.`,
    },
    {
      name: 'Brief #2 — HOA Roof Replacement Financing',
      description: 'HOA/condo boards facing expensive roof replacement looking for financing options.',
      enabled: 0, // Enable in Week 2
      message: `You are writing a complete SEO-optimized blog post / landing page for hoaprojectfunding.com.

URL SLUG: /hoa-roof-replacement-financing
TARGET KEYWORDS: HOA roof replacement financing, condo roof loan, HOA roof repair funding, community association roof financing
SEARCH INTENT: HOA/condo boards facing an expensive roof replacement and looking for financing
WORD COUNT: 1,500–1,800 words
AUDIENCE: Board members with an active or upcoming roof project
CTA: Get your roof project pre-qualified → intake form
URGENCY HOOK: Roof failures don't wait for reserve funds to catch up — and deferred maintenance hurts mortgage eligibility

CONTENT OUTLINE:
- Opening: Average HOA roof replacement costs ($150K–$1M+ depending on community size)
- Section 1: Why reserves rarely cover the full cost
- Section 2: Financing options (HOA loan, line of credit, special assessment, hybrid)
- Section 3: What lenders evaluate for roof projects (scope, contractor bids, reserve study, delinquency rates)
- Section 4: Timeline — from board vote to funded project
- Section 5: Documents you'll need (checklist: reserve study, contractor proposals, financial statements, board minutes)
- Primary CTA: Upload Your Project Details → Get Multiple Lender Bids
- Secondary CTA (mid-article): Free 15-minute consultation

VOICE & TONE: Write as a knowledgeable advisor to HOA board members, not a salesperson. Use plain language. Acknowledge the stress and complexity boards face. Be specific with numbers, timelines, and processes.

SEO REQUIREMENTS:
- Include primary keyword "HOA roof replacement financing" in H1, first paragraph, and at least 2 H2s
- Use secondary keywords naturally throughout
- Write meta description (155 chars max) including primary keyword and clear value proposition

COMPLIANCE CONTENT RULES:
- Include disclaimer: "This is educational content, not legal or financial advice."

OUTPUT FORMAT: Complete draft blog post in markdown, starting with: frontmatter (title, slug, meta_description, date), then full article body. End with a "FAQs" section (4 questions).`,
    },
    {
      name: 'Brief #3 — Florida SIRS Funding Guide',
      description: 'Florida condo boards needing to fund reserves per post-Surfside SIRS requirements.',
      enabled: 0, // Enable alongside Brief #1 for Day 1, or manually trigger via Run Now
      message: `You are writing a complete SEO-optimized blog post / landing page for hoaprojectfunding.com.

URL SLUG: /florida-sirs-funding-guide
TARGET KEYWORDS: Florida SIRS funding, structural integrity reserve study financing, Florida condo reserve requirements, SB 4D reserve funding
SEARCH INTENT: Florida condo boards needing to fund reserves per post-Surfside SIRS requirements
WORD COUNT: 2,000–2,500 words
AUDIENCE: Florida condo board members, property managers in FL
CTA: SIRS Compliance Readiness Assessment → lead capture
URGENCY HOOK: Florida law now restricts reserve waivers — boards that haven't planned for full funding face immediate budget pressure
COMPLIANCE DATE: Reserve restrictions affecting budgets adopted on/after Dec 31, 2024

CONTENT OUTLINE:
- Opening: What changed after Surfside and why every FL condo board needs a plan
- Section 1: SIRS requirements explained (what the law requires, which buildings, timelines)
- Section 2: The funding gap — why most associations are underfunded
- Section 3: Financing options to close the gap without shocking owners
- Section 4: What lenders need from FL condos (SIRS report, milestone inspection results, financials)
- Section 5: Step-by-step compliance + funding roadmap
- Section 6: Impact on mortgage eligibility (Fannie/Freddie condo project review)
- Primary CTA: Get Your SIRS Funding Plan Started → Free Pre-Qualification
- Secondary CTA (mid-article): Free SIRS compliance checklist download

VOICE & TONE: Write as a knowledgeable advisor to HOA board members, not a salesperson. Use plain language. Acknowledge the stress and complexity boards face. Be specific with numbers, timelines, and processes.

SEO REQUIREMENTS:
- Include primary keyword "Florida SIRS funding" in H1, first paragraph, and at least 2 H2s
- Use secondary keywords naturally throughout
- Write meta description (155 chars max) including primary keyword and clear value proposition

COMPLIANCE CONTENT RULES:
- Cite specific statute: "Florida Statute 718.112(2)(f)" for reserve requirements
- Reference SB 4D and its effective dates
- Note which buildings are covered (3+ stories, 3+ units, 30+ years old or 25+ years within 3 miles of coast)
- Include disclaimer: "This is educational content, not legal or financial advice. Consult a Florida-licensed attorney for guidance specific to your association."

OUTPUT FORMAT: Complete draft blog post in markdown, starting with: frontmatter (title, slug, meta_description, date), then full article body. End with a "FAQs" section (5 questions) formatted for schema markup.`,
    },
    {
      name: 'Brief #4 — Florida Milestone Inspection Funding',
      description: 'FL condo boards needing to fund milestone inspections and resulting repairs.',
      enabled: 0, // Enable in Week 4
      message: `You are writing a complete SEO-optimized blog post / landing page for hoaprojectfunding.com.

URL SLUG: /florida-milestone-inspection-funding
TARGET KEYWORDS: Florida milestone inspection funding, condo milestone inspection cost, Florida 553.899 financing, milestone inspection loan
SEARCH INTENT: FL condo boards needing to fund milestone inspections and resulting repairs
WORD COUNT: 1,500–1,800 words
AUDIENCE: Florida condo boards facing milestone inspection deadlines
CTA: Get milestone inspection repair financing → intake form
URGENCY HOOK: Milestone inspections often reveal costly structural repairs — the inspection is just the beginning

CONTENT OUTLINE:
- Opening: The inspection reveals $800K in structural repairs — now what?
- Section 1: Milestone inspection requirements (which buildings, when, Phase 1 vs Phase 2)
- Section 2: Common findings and their costs
- Section 3: Funding the repairs — loan vs assessment vs reserve draw
- Section 4: Lender requirements for post-inspection financing
- Section 5: Timeline from inspection findings to funded repairs
- Primary CTA: Upload Your Inspection Report → Get Funding Options
- Secondary CTA (mid-article): Free 15-minute consultation

VOICE & TONE: Write as a knowledgeable advisor to HOA board members, not a salesperson. Use plain language. Be specific with numbers, timelines, and processes.

SEO REQUIREMENTS:
- Include primary keyword "Florida milestone inspection funding" in H1, first paragraph, and at least 2 H2s
- Cite specific statute: "Florida Statute 553.899"
- Write meta description (155 chars max) including primary keyword

COMPLIANCE CONTENT RULES:
- Specify which buildings are covered (3+ stories, 30+ years old or 25 years within 3 miles of coast)
- Phase 1 vs Phase 2 inspection requirements
- Include disclaimer: "This is educational content, not legal or financial advice."

OUTPUT FORMAT: Complete draft blog post in markdown, starting with: frontmatter (title, slug, meta_description, date), then full article body. End with a "FAQs" section (4 questions).`,
    },
    {
      name: 'Brief #5 — California SB 326 Balcony Inspection Funding',
      description: 'CA condo boards needing to fund SB 326 inspections and resulting repairs.',
      enabled: 0, // Enable in Week 5
      message: `You are writing a complete SEO-optimized blog post / landing page for hoaprojectfunding.com.

URL SLUG: /california-sb-326-inspection-funding
TARGET KEYWORDS: SB 326 inspection funding, California balcony inspection financing, exterior elevated elements financing, SB 326 repair costs
SEARCH INTENT: CA condo boards needing to fund SB 326 inspections and resulting repairs
WORD COUNT: 1,800–2,200 words
AUDIENCE: California condo board members, HOA managers in CA
CTA: SB 326 Repair Financing Assessment → lead capture
URGENCY HOOK: SB 326 deadline has passed — associations without completed inspections face liability exposure

CONTENT OUTLINE:
- Opening: What SB 326 requires and why the clock is ticking
- Section 1: SB 326 vs SB 721 — which applies to your building
- Section 2: Inspection costs vs repair costs (the inspection is cheap, the repairs aren't)
- Section 3: Common repair findings (waterproofing, structural, railings) and cost ranges
- Section 4: Financing the repairs — options and what lenders evaluate
- Section 5: How to package your project for multiple lender bids
- Section 6: Connection to CA reserve study requirements (Civil Code §5550)
- Primary CTA: Get Your SB 326 Repair Project Funded → Pre-Qualify Now
- Secondary CTA (mid-article): Free SB 326 compliance checklist download

VOICE & TONE: Write as a knowledgeable advisor to HOA board members, not a salesperson. Use plain language. Acknowledge the stress and complexity boards face.

SEO REQUIREMENTS:
- Include primary keyword "SB 326 inspection funding" in H1, first paragraph, and at least 2 H2s
- Use secondary keywords naturally throughout
- Write meta description (155 chars max) including primary keyword

COMPLIANCE CONTENT RULES:
- Cite "California Civil Code §5551" (SB 326) vs "California Health & Safety Code §17973" (SB 721)
- Specify SB 326 applies to condominiums (common interest developments) with 3+ units
- SB 721 applies to non-HOA rental properties
- Original deadline: January 1, 2025 — inspections must be completed
- Include disclaimer: "This is educational content, not legal or financial advice. Consult a California-licensed attorney."

OUTPUT FORMAT: Complete draft blog post in markdown, starting with: frontmatter (title, slug, meta_description, date), then full article body. End with a "FAQs" section (5 questions) formatted for schema markup.`,
    },
    {
      name: 'Brief #6 — California Reserve Study Funding Gap',
      description: 'CA HOA/condo boards with a reserve study showing underfunding looking for solutions.',
      enabled: 0, // Enable in Week 6
      message: `You are writing a complete SEO-optimized blog post / landing page for hoaprojectfunding.com.

URL SLUG: /california-reserve-study-funding-gap
TARGET KEYWORDS: California HOA reserve study funding gap, CA reserve study financing, Civil Code 5550 funding, HOA underfunded reserves California
SEARCH INTENT: CA HOA/condo boards with a reserve study showing underfunding and looking for solutions
WORD COUNT: 1,500–1,800 words
AUDIENCE: California HOA board members dealing with reserve shortfalls
CTA: Reserve gap financing assessment → lead capture
URGENCY HOOK: California requires reserve studies every 3 years — underfunding gets harder to hide and affects unit resale

CONTENT OUTLINE:
- Opening: Your reserve study shows 45% funded — here's what that means
- Section 1: CA reserve study requirements (Civil Code §5550, 3-year cadence)
- Section 2: What "percent funded" actually means and why it matters
- Section 3: Options to close the gap (assessment increase, special assessment, loan, hybrid)
- Section 4: How financing preserves owner affordability and property values
- Section 5: What lenders look for in reserve-gap financing
- Primary CTA: Get Reserve Gap Financing Options → Compare Multiple Lenders
- Secondary CTA (mid-article): Free reserve gap analysis worksheet

VOICE & TONE: Write as a knowledgeable advisor to HOA board members, not a salesperson. Use plain language. Acknowledge the stress and complexity boards face. Be specific with numbers.

SEO REQUIREMENTS:
- Include primary keyword "California HOA reserve study funding gap" in H1, first paragraph, and at least 2 H2s
- Use secondary keywords naturally throughout
- Write meta description (155 chars max) including primary keyword

COMPLIANCE CONTENT RULES:
- Cite "California Civil Code §5550" for reserve study requirements
- Note the 3-year reserve study cadence requirement
- Note disclosure requirements to prospective buyers
- Include disclaimer: "This is educational content, not legal or financial advice."

OUTPUT FORMAT: Complete draft blog post in markdown, starting with: frontmatter (title, slug, meta_description, date), then full article body. End with a "FAQs" section (4 questions).`,
    },
  ];

  let created = 0;
  let skipped = 0;

  briefs.forEach(brief => {
    const existing = get('SELECT id FROM schedules WHERE name = ? AND agent_id = ?', [brief.name, contentWriterAgent.id]);
    if (existing) {
      console.log('⏭️  Already exists:', brief.name);
      skipped++;
      return;
    }

    const id = uuidv4();
    run(
      'INSERT INTO schedules (id, name, description, agent_id, agent_name, cron_expression, message, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, brief.name, brief.description, contentWriterAgent.id, contentWriterAgent.name, '0 9 * * 1', brief.message, brief.enabled]
    );
    const status = brief.enabled ? '✅ ENABLED' : '⏸️  disabled';
    console.log(`${status} Created: ${brief.name}`);
    created++;
  });

  console.log(`\nDone! Created: ${created}, Skipped: ${skipped}`);
  console.log('\n📋 Week 1 Action:');
  console.log('  1. Go to Scheduler in the UI');
  console.log('  2. Click "Run Now" on "Brief #1 — HOA Loan vs Special Assessment"');
  console.log('  3. Click "Run Now" on "Brief #3 — Florida SIRS Funding Guide"');
  console.log('  4. Each subsequent Monday: enable next brief, run it');
  process.exit(0);
}, 1500);
