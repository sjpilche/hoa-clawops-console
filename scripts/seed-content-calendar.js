/**
 * @file seed-content-calendar.js
 * @description Seeds 12 weeks of SEO-targeted content topics for HOA and Jake pipelines.
 *
 * Run: node scripts/seed-content-calendar.js
 * Safe to re-run — skips dates that already have entries.
 *
 * Each week gets:
 *   Monday:  HOA blog post (informational, SEO-targeted)
 *   Tuesday: Jake blog post (commercial, SEO-targeted)
 *   Thursday: Social-only piece (LinkedIn, shorter, engagement-focused)
 */

const path = require('path');
const fs = require('fs');

// ── HOA Topics — Targeting property managers and board members ──────────────
const HOA_TOPICS = [
  {
    topic: 'How to Fund a $500K Roof Replacement Without a Special Assessment',
    keyword: 'hoa roof replacement funding',
    secondary: ['hoa reserve fund alternatives', 'special assessment alternatives', 'hoa capital projects'],
    pillar: 'reserve_fund', intent: 'informational',
  },
  {
    topic: '5 Warning Signs Your HOA Reserve Fund Is Dangerously Low',
    keyword: 'hoa reserve fund requirements',
    secondary: ['hoa reserve study', 'underfunded hoa reserves', 'florida hoa reserve requirements'],
    pillar: 'reserve_fund', intent: 'informational',
  },
  {
    topic: 'Special Assessments Are Killing HOA Property Values — Here\'s the Alternative',
    keyword: 'hoa special assessment alternatives',
    secondary: ['hoa special assessment financing', 'avoid special assessment', 'hoa loan options'],
    pillar: 'special_assessment', intent: 'commercial',
  },
  {
    topic: 'The Complete Guide to HOA Project Funding in Florida (2026)',
    keyword: 'hoa project funding florida',
    secondary: ['florida hoa funding', 'hoa construction financing florida', 'condo reserve funding florida'],
    pillar: 'reserve_fund', intent: 'informational',
  },
  {
    topic: 'How Self-Managed HOAs Can Finance Major Repairs',
    keyword: 'self managed hoa funding',
    secondary: ['small hoa financing', 'hoa without management company', 'diy hoa capital projects'],
    pillar: 'reserve_fund', intent: 'informational',
  },
  {
    topic: 'HOA Reserve Study: What It Costs, Why It Matters, and How to Use It',
    keyword: 'hoa reserve study cost',
    secondary: ['reserve study requirements', 'how to read reserve study', 'hoa reserve study guide'],
    pillar: 'reserve_fund', intent: 'informational',
  },
  {
    topic: 'Florida SB 4-D Compliance: What Every Condo Board Needs to Know',
    keyword: 'florida sb 4d hoa compliance',
    secondary: ['florida condo inspection requirements', 'milestone inspection florida', 'sirs compliance'],
    pillar: 'special_assessment', intent: 'informational',
  },
  {
    topic: 'HOA Deferred Maintenance: The Hidden Cost That\'s Destroying Your Property Value',
    keyword: 'hoa deferred maintenance cost',
    secondary: ['hoa maintenance backlog', 'deferred maintenance consequences', 'hoa property value maintenance'],
    pillar: 'special_assessment', intent: 'informational',
  },
  {
    topic: 'How to Convince Your HOA Board to Fund That Project They\'ve Been Putting Off',
    keyword: 'hoa board approve capital project',
    secondary: ['hoa board proposal', 'convince hoa board', 'hoa capital improvement proposal'],
    pillar: 'reserve_fund', intent: 'informational',
  },
  {
    topic: '7 Creative Ways HOAs Are Funding Pool Renovations and Common Area Upgrades',
    keyword: 'hoa pool renovation funding',
    secondary: ['hoa common area upgrade financing', 'hoa amenity improvement funding'],
    pillar: 'reserve_fund', intent: 'informational',
  },
  {
    topic: 'HOA Loan vs Special Assessment: Which Is Better for Your Community?',
    keyword: 'hoa loan vs special assessment',
    secondary: ['hoa financing options comparison', 'hoa loan pros cons', 'special assessment pros cons'],
    pillar: 'special_assessment', intent: 'commercial',
  },
  {
    topic: 'The Real Cost of Ignoring Your HOA\'s Infrastructure: A Board Member\'s Guide',
    keyword: 'hoa infrastructure maintenance cost',
    secondary: ['hoa building maintenance', 'condo structural maintenance', 'hoa capital planning'],
    pillar: 'special_assessment', intent: 'informational',
  },
];

// ── Jake Topics — Targeting construction company CFOs and controllers ───────
const JAKE_TOPICS = [
  {
    topic: 'Why Your Construction Company\'s QuickBooks Setup Is Costing You $50K a Year',
    keyword: 'construction company quickbooks problems',
    secondary: ['construction accounting quickbooks', 'quickbooks for contractors', 'construction erp vs quickbooks'],
    pillar: 'cost_control', intent: 'commercial',
  },
  {
    topic: 'The Construction CFO\'s Guide to Real-Time Job Costing',
    keyword: 'construction job costing software',
    secondary: ['real time job costing', 'construction project cost tracking', 'job cost reporting'],
    pillar: 'cost_control', intent: 'informational',
  },
  {
    topic: 'How Mid-Size GCs Are Solving the AR Backlog Problem Without Hiring',
    keyword: 'construction accounts receivable management',
    secondary: ['construction ar automation', 'contractor payment collection', 'construction cash flow'],
    pillar: 'cash_flow', intent: 'commercial',
  },
  {
    topic: '5 Signs Your Construction Company Has Outgrown Its ERP (And What to Do About It)',
    keyword: 'construction erp migration',
    secondary: ['when to switch erp construction', 'vista vs sage construction', 'construction accounting software comparison'],
    pillar: 'cost_control', intent: 'commercial',
  },
  {
    topic: 'WIP Schedule Nightmares: How to Fix Your Over/Under Billing Problem',
    keyword: 'construction wip schedule',
    secondary: ['wip report construction', 'over under billing construction', 'percentage completion accounting'],
    pillar: 'cost_control', intent: 'informational',
  },
  {
    topic: 'The Hidden Cost of Manual Data Entry in Construction Finance',
    keyword: 'construction accounting automation',
    secondary: ['construction data entry errors', 'manual process construction finance', 'construction ai accounting'],
    pillar: 'cost_control', intent: 'commercial',
  },
  {
    topic: 'Cash Flow Management for General Contractors: A Practical Framework',
    keyword: 'construction cash flow management',
    secondary: ['gc cash flow forecasting', 'contractor cash flow tips', 'construction working capital'],
    pillar: 'cash_flow', intent: 'informational',
  },
  {
    topic: 'How to Survive a Slow-Pay Client Without Destroying Your GC\'s Cash Position',
    keyword: 'construction slow pay solutions',
    secondary: ['contractor payment terms', 'construction retainage management', 'construction lien rights'],
    pillar: 'cash_flow', intent: 'informational',
  },
  {
    topic: 'Retainage Management: The $100K Problem Most GCs Ignore',
    keyword: 'construction retainage management',
    secondary: ['retainage tracking', 'retainage collection', 'construction retainage accounting'],
    pillar: 'cash_flow', intent: 'informational',
  },
  {
    topic: 'Construction Financial Reporting: What Your Bank Actually Wants to See',
    keyword: 'construction financial reporting',
    secondary: ['construction loan reporting', 'gc financial statements', 'contractor financial reporting requirements'],
    pillar: 'trust_envelope', intent: 'informational',
  },
  {
    topic: 'Excel Is Not an ERP: A Construction CFO\'s Case for Real Software',
    keyword: 'construction company using excel',
    secondary: ['excel vs erp construction', 'construction spreadsheet problems', 'contractor accounting software'],
    pillar: 'cost_control', intent: 'commercial',
  },
  {
    topic: 'The Construction CFO\'s Year-End Checklist (2026 Tax Planning)',
    keyword: 'construction company year end checklist',
    secondary: ['contractor tax planning', 'construction accounting year end', 'gc tax strategy'],
    pillar: 'trust_envelope', intent: 'informational',
  },
];

// ── Social-Only Pieces (shorter, engagement-focused) ────────────────────────
const SOCIAL_TOPICS = [
  { topic: 'Poll: What\'s the biggest financial headache for your HOA board?', product: 'hoa', pillar: 'reserve_fund' },
  { topic: '3 questions every GC should ask their controller this week', product: 'jake', pillar: 'cost_control' },
  { topic: 'Hot take: Special assessments are a failure of planning, not a funding tool', product: 'hoa', pillar: 'special_assessment' },
  { topic: 'The one metric every construction CFO should check daily (and most don\'t)', product: 'jake', pillar: 'cash_flow' },
  { topic: 'Story: How one HOA board funded a $1.2M project without raising dues', product: 'hoa', pillar: 'reserve_fund' },
  { topic: 'Unpopular opinion: Job costing spreadsheets work fine under $5M revenue', product: 'jake', pillar: 'cost_control' },
  { topic: 'Before and after: What happens when an HOA actually funds its reserves', product: 'hoa', pillar: 'reserve_fund' },
  { topic: 'The worst financial advice I\'ve seen given to a GC (thread)', product: 'jake', pillar: 'trust_envelope' },
  { topic: 'Quick guide: How to read your HOA\'s reserve study in 5 minutes', product: 'hoa', pillar: 'reserve_fund' },
  { topic: 'What I learned running finances for 3 construction companies simultaneously', product: 'jake', pillar: 'cost_control' },
  { topic: 'Your HOA\'s deferred maintenance list is a ticking time bomb — here\'s why', product: 'hoa', pillar: 'special_assessment' },
  { topic: 'Why the best construction CFOs track cash flow weekly, not monthly', product: 'jake', pillar: 'cash_flow' },
];

async function main() {
  const envPath = path.resolve(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath });

  const { initDatabase, get, run: dbRun } = require('../server/db/connection');
  await initDatabase();

  // Start from next Monday
  const today = new Date();
  const daysUntilMonday = (8 - today.getDay()) % 7 || 7;
  const startDate = new Date(today);
  startDate.setDate(today.getDate() + daysUntilMonday);

  let created = 0;
  let skipped = 0;

  for (let week = 0; week < 12; week++) {
    const monday = new Date(startDate);
    monday.setDate(startDate.getDate() + (week * 7));

    const tuesday = new Date(monday);
    tuesday.setDate(monday.getDate() + 1);

    const thursday = new Date(monday);
    thursday.setDate(monday.getDate() + 3);

    const fmt = (d) => d.toISOString().slice(0, 10);

    // Monday: HOA blog
    const hoa = HOA_TOPICS[week % HOA_TOPICS.length];
    const existing1 = get('SELECT id FROM content_calendar WHERE scheduled_date = ? AND product = ?', [fmt(monday), 'hoa']);
    if (!existing1) {
      dbRun(`INSERT INTO content_calendar (scheduled_date, product, channel, pillar, topic, target_keyword, secondary_keywords, search_intent, assigned_agent)
        VALUES (?, 'hoa', 'blog', ?, ?, ?, ?, ?, 'hoa-content-writer')`,
        [fmt(monday), hoa.pillar, hoa.topic, hoa.keyword, JSON.stringify(hoa.secondary), hoa.intent]);
      created++;
    } else skipped++;

    // Tuesday: Jake blog
    const jake = JAKE_TOPICS[week % JAKE_TOPICS.length];
    const existing2 = get('SELECT id FROM content_calendar WHERE scheduled_date = ? AND product = ?', [fmt(tuesday), 'jake']);
    if (!existing2) {
      dbRun(`INSERT INTO content_calendar (scheduled_date, product, channel, pillar, topic, target_keyword, secondary_keywords, search_intent, assigned_agent)
        VALUES (?, 'jake', 'blog', ?, ?, ?, ?, ?, 'jake-content-engine')`,
        [fmt(tuesday), jake.pillar, jake.topic, jake.keyword, JSON.stringify(jake.secondary), jake.intent]);
      created++;
    } else skipped++;

    // Thursday: Social piece
    const social = SOCIAL_TOPICS[week % SOCIAL_TOPICS.length];
    const existing3 = get('SELECT id FROM content_calendar WHERE scheduled_date = ? AND channel = ?', [fmt(thursday), 'social']);
    if (!existing3) {
      dbRun(`INSERT INTO content_calendar (scheduled_date, product, channel, pillar, topic, assigned_agent)
        VALUES (?, ?, 'social', ?, ?, ?)`,
        [fmt(thursday), social.product, social.pillar, social.topic,
          social.product === 'hoa' ? 'hoa-social-media' : 'jake-social-scheduler']);
      created++;
    } else skipped++;

    console.log(`  Week ${week + 1}: ${fmt(monday)} HOA | ${fmt(tuesday)} Jake | ${fmt(thursday)} Social`);
  }

  console.log(`\nDone: ${created} entries created, ${skipped} skipped (already exist)`);
  console.log(`Total calendar entries: ${get('SELECT COUNT(*) as n FROM content_calendar')?.n || 0}`);
}

main().catch(err => { console.error(err); process.exit(1); });
