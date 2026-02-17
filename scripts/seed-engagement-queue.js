/**
 * Seed Engagement Queue with Demo Data
 *
 * Populates the lg_engagement_queue table with realistic HOA posts
 * so you can test the approval workflow immediately.
 *
 * Usage: node scripts/seed-engagement-queue.js
 */

const { run, all } = require('../server/db/connection');
const { initDatabase } = require('../server/db/connection');
const { v4: uuidv4 } = require('uuid');

// Sample posts that the HOA Networker might find
const samplePosts = [
  {
    platform: 'reddit',
    post_url: 'https://reddit.com/r/HOA/comments/sample1',
    post_title: 'Our HOA is facing a $800K roof replacement - can\'t afford special assessment',
    post_body: 'We\'re a 120-unit condo in Miami. Our reserve study came back showing we need a full roof replacement ($800K) but our reserves only have $200K. The board is talking about hitting everyone with a $5,000 special assessment. Half our owners are on fixed income. Is there any other option? This is going to destroy people financially.',
    author_name: 'concerned_board_member',
    detected_signals: JSON.stringify(['special_assessment', 'reserve_study', 'florida_sirs', 'emergency', 'large_project']),
    relevance_score: 95,
    draft_response: `I completely understand the stress your board is facing. An $800K funding gap is significant, and special assessments of that size can indeed be devastating for owners on fixed income.

Many HOAs don't realize they have a third option between draining reserves and hitting owners with special assessments: **HOA-level project financing**. The association can borrow the funds directly (not the individual owners), and pay it back over 10-15 years from regular monthly assessments.

Here's how the math might work for your situation:
- Borrow: $600K (covers the gap)
- Term: 10 years at ~7-8%
- Monthly increase per unit: ~$60-70/month (vs. $5,000 special assessment)

This is especially relevant in Florida right now with SIRS deadlines creating urgency. The loan sits at the association level, doesn't affect individual credit scores, and new buyers inherit the obligation when they purchase.

I work in HOA project financing and would be happy to send you a breakdown specific to your situation—no obligation. Feel free to DM me if you'd like to explore this option for your board.`,
    status: 'pending_review'
  },
  {
    platform: 'facebook',
    post_url: 'https://facebook.com/groups/hoa-boards/posts/sample2',
    post_title: 'California SB 326 compliance - $400K balcony repair',
    post_body: 'Our HOA just got the structural inspection report back (SB 326 requirement) and we need $400K in balcony repairs. We have until next year to complete it. Our reserves are underfunded. Board is debating between special assessment or taking out a loan. Anyone dealt with this?',
    author_name: 'Linda Martinez',
    detected_signals: JSON.stringify(['california_sb326', 'reserve_study', 'balcony_repair', 'structural']),
    relevance_score: 88,
    draft_response: `SB 326 balcony inspections are catching a lot of California HOAs off guard right now. You're definitely not alone in facing this.

The good news: HOA-level financing is often the better path for compliance deadlines like SB 326 because it:
1. **Preserves reserves** for other emergencies
2. **Spreads the cost** over time instead of hitting owners all at once
3. **Faster approval** than trying to collect a large special assessment

For a $400K project, you're likely looking at monthly assessment increases of around $40-50 per unit (assuming 100-150 units, 10-year term). Compare that to a $2,500-4,000 per-unit special assessment.

The loan sits at the HOA level (not individual owners), and the deadline pressure actually helps with lender approval since it's a compliance-driven project.

I work with HOAs on exactly this type of SB 326 funding. Happy to send you a quick breakdown of what the numbers might look like for your community—no cost, no obligation. DM me if you'd like that.`,
    status: 'pending_review'
  },
  {
    platform: 'reddit',
    post_url: 'https://reddit.com/r/Condo/comments/sample3',
    post_title: 'Reserve study shows we\'re 60% underfunded',
    post_body: 'Just got our first reserve study done. Turns out we need $1.2M in our reserves but only have $480K. Major projects coming up: new HVAC system, parking lot repaving, building painting. What do other condos do in this situation?',
    author_name: 'hoa_treasurer_TX',
    detected_signals: JSON.stringify(['reserve_study', 'underfunded', 'large_project']),
    relevance_score: 82,
    draft_response: `Reserve study sticker shock is really common, especially for newer HOAs or those that haven't been consistently funding reserves.

The typical approaches HOAs take when facing this gap:

1. **Gradual catch-up**: Increase monthly assessments to slowly close the gap (takes years)
2. **Special assessments**: Hit everyone with a one-time payment when projects come due (painful)
3. **Project financing**: Borrow for major projects, pay back over time (smooths the impact)

For a $720K shortfall with multiple projects on the horizon, many boards use a hybrid approach:
- Finance the HVAC system (~$300K?) since it's urgent
- Use existing reserves for parking lot
- Gradually increase assessments for long-term reserve health

The loan approach spreads the cost over 10-15 years, so instead of a $2,000-3,000 per-unit special assessment, owners see a $35-50/month increase in their dues.

I work in HOA project financing and can show you what the numbers might look like for your specific situation. Feel free to DM if you'd like a breakdown—no cost to explore the options.`,
    status: 'pending_review'
  },
  {
    platform: 'facebook',
    post_url: 'https://facebook.com/groups/self-managed-hoa/posts/sample4',
    post_title: 'Emergency plumbing repair - need $150K fast',
    post_body: 'Main water line broke. Plumber says we need full replacement ASAP or we risk flooding the whole building. Quote is $150K. We\'re a small self-managed HOA (40 units) and our reserves only have $60K. What are our options for getting this fixed quickly?',
    author_name: 'James Wilson',
    detected_signals: JSON.stringify(['emergency', 'plumbing', 'small_hoa']),
    relevance_score: 90,
    draft_response: `Emergency situations like this are exactly why HOA emergency funding options exist. When you can't wait to collect special assessments and reserves won't cover it, you have two main paths:

**Option 1: Emergency Special Assessment**
- Pros: No debt, no interest
- Cons: Collecting $2,250 per unit quickly is hard; some owners may not be able to pay immediately

**Option 2: HOA Emergency Loan**
- Pros: Funds available in 2-3 weeks; spreads cost over time
- Cons: Interest cost (but often worth it for emergencies)

For a $150K emergency repair in a 40-unit building:
- Loan payment: ~$1,700/month (10-year term)
- Per-unit increase: ~$42/month
- vs. $2,250 per-unit special assessment

Emergency repairs like critical plumbing often get expedited approval from lenders because the alternative (building damage) is much worse.

I work in HOA project financing and can get you a quick quote for emergency funding—usually 48-72 hours for initial approval. DM me if you want to explore this option while your board evaluates all choices.`,
    status: 'pending_review'
  },
  {
    platform: 'linkedin',
    post_url: 'https://linkedin.com/posts/sample5',
    post_title: 'How do CAMs typically advise boards on large capital projects?',
    post_body: 'I\'m a property manager with 6 HOA clients. Two of them are facing major roofing projects in the next 18 months ($500K+ each). What\'s the best practice for advising boards on financing these projects? Special assessments seem to create a lot of owner pushback.',
    author_name: 'Sarah Chen, CAM',
    detected_signals: JSON.stringify(['property_manager', 'capital_project', 'roofing']),
    relevance_score: 75,
    draft_response: `Great question, Sarah. Owner pushback on special assessments is nearly universal, especially for $500K+ projects.

Most experienced CAMs present boards with a three-option framework:

**Option 1: Full Special Assessment**
- One-time payment
- No interest costs
- Immediate owner resistance + potential payment defaults

**Option 2: Phased Special Assessments**
- Spread over 2-3 years
- Less sticker shock
- Still significant cash flow impact on owners

**Option 3: HOA-Level Project Financing**
- Loan at association level
- Minimal monthly increase (~$50-75/unit for $500K over 10 years)
- Preserves reserves for other needs
- Professional lenders that specialize in HOA projects

In my experience, boards that see all three options side-by-side usually choose #3 for large projects, especially when you show them the per-unit monthly impact vs. the special assessment amount.

I work with property managers on HOA project financing—happy to provide you with a sample analysis you can use with your boards. No cost for the educational materials. DM me if you'd like that.`,
    status: 'pending_review'
  },
  {
    platform: 'reddit',
    post_url: 'https://reddit.com/r/RealEstate/comments/sample6',
    post_title: 'Just bought a condo - got hit with $8K special assessment 2 months later',
    post_body: 'I bought my first condo 2 months ago in Florida. Just got a letter from the HOA saying they need to do an emergency structural repair (SIRS inspection found issues) and everyone has to pay $8,000. This is more than my down payment! Is this legal? Can I fight this?',
    author_name: 'first_time_buyer_2026',
    detected_signals: JSON.stringify(['special_assessment', 'florida_sirs', 'structural']),
    relevance_score: 70,
    draft_response: `Unfortunately, yes, this is legal (assuming it was properly approved by the board and noticed to owners). The SIRS inspection requirement in Florida has caught many condo owners off guard.

While you likely can't fight the assessment itself, you can ask your board to consider **alternative financing options**. Many HOAs don't realize they can:

1. **Borrow at the association level** instead of hitting all owners with a special assessment
2. **Spread the cost** over 10-15 years via monthly assessment increases
3. **Preserve owner cash flow** instead of requiring large lump-sum payments

For an $8,000 per-unit assessment, if the HOA has ~100 units, that's $800K total. Financed over 10 years:
- Monthly increase per unit: ~$75-85/month
- vs. $8,000 due immediately

Not all boards know this option exists. You might suggest it at the next board meeting or owner forum. Some owners may prefer to pay their $8K upfront and avoid interest, but others (especially those who can't afford the lump sum) would benefit from the monthly option.

I work in HOA project financing and can provide educational materials your board can review. Feel free to DM if you'd like me to send those resources (no cost).`,
    status: 'pending_review'
  },
  {
    platform: 'facebook',
    post_url: 'https://facebook.com/groups/hoa-california/posts/sample7',
    post_title: 'Elevator modernization quote came back at $320K',
    post_body: 'Our 4-story condo building needs elevator modernization to meet new California requirements. Got quotes around $320K. We have 60 units. Board is split between special assessment ($5,300/unit) or taking out a loan. What have other buildings done?',
    author_name: 'Maria Gonzalez',
    detected_signals: JSON.stringify(['elevator', 'california', 'modernization', 'large_project']),
    relevance_score: 85,
    draft_response: `Elevator modernization projects are tricky because they're both expensive AND mandatory for compliance—you can't just defer them.

Here's what I've seen work well for other California HOAs:

**Special Assessment Approach:**
- Pro: No debt, no interest
- Con: $5,300 per unit is a lot upfront; typically see 20-30% of owners request payment plans anyway

**Financing Approach:**
- Pro: Immediate compliance, manageable monthly impact
- Con: Interest costs over time

For your situation ($320K, 60 units), the financing math would be:
- 10-year loan: ~$50-55/month per unit increase
- 15-year loan: ~$40-45/month per unit increase
- vs. $5,300 per-unit special assessment

Many boards I work with opt for financing on compliance-driven projects like this because:
1. You need to do it anyway (not optional)
2. Spreading the cost is more predictable for owners
3. Preserves reserves for other unexpected needs

I work in HOA project financing and can send you a detailed breakdown showing both options side-by-side—makes it easier for your board to compare. DM me if you'd like that analysis (no obligation).`,
    status: 'pending_review'
  },
  {
    platform: 'biggerpockets',
    post_url: 'https://biggerpockets.com/forums/sample8',
    post_title: 'Investing in condos with upcoming special assessments?',
    post_body: 'Looking at buying a condo as an investment property. HOA disclosed they\'re planning a $600K exterior painting project next year (200 units = $3K/unit assessment). Should I factor this into my offer price or just walk away?',
    author_name: 'investor_mike',
    detected_signals: JSON.stringify(['special_assessment', 'investor', 'exterior_painting']),
    relevance_score: 65,
    draft_response: `Smart of you to ask about this upfront. Special assessments can kill your cash flow projections quickly.

A few things to consider:

1. **Negotiate the purchase price** down by the assessment amount ($3K)
2. **Ask if the HOA has considered financing** instead of special assessment
3. **Check if they've gotten multiple quotes** ($600K for painting 200 units seems high—should be $400-500K)

If the HOA financed the $600K over 10 years instead of special assessment:
- Monthly increase: ~$30-35/unit
- vs. $3,000 one-time hit

From an investor perspective, the monthly increase is actually better for you because:
- It's a known, predictable expense (you can pass it to tenants gradually)
- You don't need to come up with $3K cash right away
- Future buyers inherit the payment (it's baked into the HOA dues)

You might suggest to the board that they explore project financing—many HOAs don't know it's an option. If they switch to financing, you could offer closer to full price knowing you won't get hit with the special assessment.

I work in HOA project financing and can provide educational materials the HOA board can review. DM me if you'd like those resources.`,
    status: 'pending_review'
  }
];

async function seedEngagementQueue() {
  console.log('\n🌱 Seeding Engagement Queue with demo data...\n');

  try {
    // Initialize database
    await initDatabase();

    // Clear existing queue data (optional - comment out if you want to keep existing data)
    console.log('📝 Clearing existing queue data...');
    run('DELETE FROM lg_engagement_queue', []);

    // Insert sample posts
    console.log('📥 Inserting sample posts...\n');

    for (const post of samplePosts) {
      const id = uuidv4();
      const now = new Date().toISOString();

      run(`
        INSERT INTO lg_engagement_queue (
          platform,
          community,
          post_url,
          post_title,
          post_summary,
          post_author,
          post_age_hours,
          relevance_score,
          recommended_template,
          draft_response,
          status,
          created_at,
          notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        post.platform,
        post.platform === 'reddit' ? 'r/HOA' : post.platform === 'facebook' ? 'HOA Board Members' : 'LinkedIn',
        post.post_url,
        post.post_title,
        post.post_body.substring(0, 200) + '...', // post_summary (first 200 chars)
        post.author_name,
        Math.floor(Math.random() * 12) + 1, // Random age 1-12 hours
        post.relevance_score,
        'special_assessment', // recommended_template
        post.draft_response,
        post.status,
        now,
        post.detected_signals // Store detected signals in notes field
      ]);

      console.log(`✅ [${post.platform.toUpperCase()}] Score ${post.relevance_score}: ${post.post_title.substring(0, 60)}...`);
    }

    // Show summary
    console.log('\n📊 Summary:');
    const stats = all(`
      SELECT
        platform,
        COUNT(*) as count,
        AVG(relevance_score) as avg_score
      FROM lg_engagement_queue
      GROUP BY platform
      ORDER BY count DESC
    `);

    console.log('\nPosts by Platform:');
    stats.forEach(stat => {
      console.log(`   ${stat.platform}: ${stat.count} posts (avg score: ${Math.round(stat.avg_score)})`);
    });

    const total = all('SELECT COUNT(*) as total FROM lg_engagement_queue');
    console.log(`\n✨ Total: ${total[0].total} posts in queue`);

    console.log('\n🎉 Seeding complete!');
    console.log('\n📍 Next steps:');
    console.log('   1. Open http://localhost:5174/engagement-queue');
    console.log('   2. Review the drafted responses');
    console.log('   3. Test the approve/reject workflow\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

seedEngagementQueue();
