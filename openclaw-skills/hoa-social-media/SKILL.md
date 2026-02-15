# HOA Social Media Marketing Skill

Automated social media content generation for HOA Project Funding (www.hoaprojectfunding.com).

## Overview

This skill transforms blog posts into platform-specific social media content that drives traffic to www.hoaprojectfunding.com and converts visitors to fill out the loan application or book a free consult.

**Business Model**: HOA loan brokerage connecting boards with lenders for capital projects

**Conversion Goals**:
1. **Primary**: Full loan application form
2. **Secondary**: Free 15-minute consult

**NO lead magnet. NO downloads. NO email signup.**

## What It Does

### 1. Blog-to-Social Conversion
Converts published blog posts into platform-optimized content:

- **Facebook Company Page**: 100-150 word post with blog link and clear CTA to application/consult
- **Facebook Group Discussion**: 80-120 word value-first post with NO link (builds credibility)
- **LinkedIn**: 150-200 word professional post targeting property managers/CAMs with blog link

### 2. Platform Strategy

**Facebook (PRIMARY)**:
- Two content types per blog:
  1. Company page post → drives traffic to blog → conversion
  2. Group discussion post → builds trust → indirect conversion
- Target: HOA board members in Facebook groups
- Schedule: Company page (Tue 10 AM), Group post (Wed 12 PM)

**LinkedIn (SECONDARY)**:
- One post per blog
- Target: Property managers, CAMs, attorneys
- Professional thought leadership tone
- Schedule: Thursday 9 AM ET

**Twitter/X**: REMOVED (HOA board members not active there)

### 3. Smart Scheduling

Per [platform-strategy.md](file:///C:/Users/SPilcher/OpenClaw2.0%20for%20linux/openclaw-skills/hoa-social-media/platform-strategy.md):
- **Facebook Company Page**: Tuesday 10:00 AM ET (day after blog publishes)
- **Facebook Group**: Wednesday 12:00 PM ET (mid-week engagement)
- **LinkedIn**: Thursday 9:00 AM ET (professional networking day)

## How to Use

### Convert Blog Post to Social Content

```bash
# From latest blog post
openclaw agent --agent hoa-social-media --local \
  --message "Convert the latest blog post into a Facebook page post with site CTA, a Facebook group discussion post, and a LinkedIn thought leadership post per platform-strategy.md. All CTAs point to the full application or free consult at www.hoaprojectfunding.com."

# From specific post
openclaw agent --agent hoa-social-media --local \
  --message "Convert blog post '2026-03-15-hoa-roof-financing.md' to Facebook and LinkedIn content"
```

### Create Only Facebook Group Post (No Link)

```bash
# Value-first group post with NO sales pitch
openclaw agent --agent hoa-social-media --local \
  --message "Create a Facebook group discussion post from the latest blog. NO LINK. Ask a question to spark discussion."
```

## Output Structure

### Directory Layout
```
workspaces/hoa-social-media/
├── platform-strategy.md              # Platform strategy (read first!)
├── posts/
│   ├── 2026-03-15-roof-financing-facebook-page.md
│   ├── 2026-03-15-roof-financing-facebook-group.md
│   ├── 2026-03-15-roof-financing-linkedin.md
│   └── ...
└── batches/
    └── 2026-03-15-roof-financing-all.json  # Combined batch
```

### Batch JSON Format

```json
{
  "source": "2026-03-15-hoa-roof-financing.md",
  "date": "2026-03-15",
  "topic": "HOA Roof Replacement Financing",
  "platforms": {
    "facebook_page": {
      "file": "posts/2026-03-15-roof-financing-facebook-page.md",
      "schedule": "2026-03-16T10:00:00-05:00",
      "purpose": "Drive blog traffic, CTA to application/consult",
      "cta_type": "free_consult"
    },
    "facebook_group": {
      "file": "posts/2026-03-15-roof-financing-facebook-group.md",
      "schedule": "2026-03-17T12:00:00-05:00",
      "purpose": "Build credibility, spark discussion, NO LINK"
    },
    "linkedin": {
      "file": "posts/2026-03-15-roof-financing-linkedin.md",
      "schedule": "2026-03-18T09:00:00-05:00",
      "audience": "Property managers, CAMs, attorneys",
      "cta_type": "help_boards_compare"
    }
  }
}
```

## Content Templates

### Facebook Company Page Template
```
[Empathetic opening - acknowledge the challenge]

[Main insight - explain value in 2-3 sentences]

👉 [Link to blog post: www.hoaprojectfunding.com/blog/[slug]/]

[Strong CTA to application or free consult]

#HOAboard #CommunityAssociation #HOAmanagement #PropertyManagement #HOA
```

**CTA Options** (rotate):
- "Have a project coming up? Get competitive loan options in days, not months → www.hoaprojectfunding.com"
- "Free 15-minute consult for boards exploring financing → www.hoaprojectfunding.com"
- "Compare loan options for your capital project → Apply at www.hoaprojectfunding.com"

### Facebook Group Discussion Template
```
[Question or scenario that invites discussion]

[Share helpful insight - be genuinely useful]

[Ask follow-up question to encourage comments]

[NO LINK - only mention "we wrote about this" naturally if relevant]

#HOAboard #CommunityAssociation #HOAmanagement
```

**Rules**:
- NO direct link to your site
- NO "check out our services"
- Provide value FIRST
- Goal: Build trust so people visit on their own

### LinkedIn Template (PM/CAM Audience)
```
[Professional hook - question from PM perspective]

[Context - challenge PMs/CAMs face with boards]

[Value - 3-4 actionable bullet points]
• Insight 1
• Insight 2
• Insight 3

[CTA for PM/CAM audience + blog link]

👉 [Link: www.hoaprojectfunding.com/blog/[slug]/]

[CTA: Help boards compare financing]

#HOA #CommunityAssociation #PropertyManagement #HOAFinancing #CapitalImprovement
```

**LinkedIn CTA** (PM angle):
- "We help your boards compare financing options so they can move on projects faster."
- "Show your boards competitive loan options → www.hoaprojectfunding.com"

## Hashtag Strategy

### Facebook (Company Page & Groups)
- `#HOAboard` - Board members specifically
- `#CommunityAssociation` - Community professionals
- `#HOAmanagement` - HOA managers
- `#PropertyManagement` - PM companies
- `#HOA` - Broad audience

**Use 3-5 per post**

### LinkedIn (Always Include These 5)
- `#HOA`
- `#CommunityAssociation`
- `#PropertyManagement`
- `#HOAFinancing`
- `#CapitalImprovement`

## Scheduling Strategy

Per [platform-strategy.md](file:///C:/Users/SPilcher/OpenClaw2.0%20for%20linux/openclaw-skills/hoa-social-media/platform-strategy.md):

**Blog publishes Monday** → Social conversion Tuesday:

```
Tuesday 10:00 AM ET
↓
Facebook Company Page Post
→ Blog link + CTA to application/consult

Wednesday 12:00 PM ET
↓
Facebook Group Discussion Post
→ NO LINK, build credibility

Thursday 9:00 AM ET
↓
LinkedIn Post (PM/CAM audience)
→ Blog link + help boards CTA
```

## Automation

### Weekly Blog-to-Social Conversion

Run every Tuesday morning after Monday blog publish:

```bash
openclaw cron add \
  --agent hoa-social-media \
  --cron "0 10 * * 2" \
  --message "Convert the latest blog post into a Facebook page post with site CTA, a Facebook group discussion post, and a LinkedIn thought leadership post per platform-strategy.md. All CTAs point to the full application or free consult at www.hoaprojectfunding.com." \
  --tz "America/New_York" \
  --name "HOA Social - Convert Latest Blog"
```

## Content Quality Standards

**Every post must have**:
- ✅ Platform-appropriate length
- ✅ Clear value (educates or helps)
- ✅ CTA to application OR free consult (Facebook page, LinkedIn)
- ✅ NO LINK in Facebook group posts
- ✅ Relevant hashtags (3-5 per platform)
- ✅ Tone matches platform and audience

**Avoid**:
- ❌ Lead magnets, downloads, email signups
- ❌ Sales-heavy language in Facebook groups
- ❌ Generic content (customize per platform)
- ❌ Over-promotional tone

## Examples

### Blog Post → Social Conversion

**Blog**: "5 HOA Roof Replacement Financing Options That Avoid Special Assessments"

---

**Facebook Company Page** (Drives traffic):
```
Facing a roof replacement but worried about special assessments? You're not alone. 😰

Many HOA boards struggle with the same question: how do we fund a $300K project without burdening homeowners?

The good news: there are financing options that spread costs over 10-15 years while keeping monthly assessments predictable.

👉 Read: 5 HOA Roof Replacement Financing Options That Avoid Special Assessments
www.hoaprojectfunding.com/blog/hoa-roof-replacement-financing/

**Have a project coming up?** Get competitive loan options in days, not months → www.hoaprojectfunding.com

#HOAboard #CommunityAssociation #HOAmanagement #PropertyManagement #HOA
```

---

**Facebook Group Discussion** (Builds credibility, NO LINK):
```
Question for HOA board members: How did your community handle funding a large capital project without hitting homeowners with a special assessment?

We're seeing more boards explore financing options that spread costs over time instead of lump-sum bills. Some use reserve fund loans, others go with assessment-backed bonds.

Curious what's worked (or hasn't worked) for your community. What did your board consider?

#HOAboard #CommunityAssociation #HOAmanagement
```

---

**LinkedIn** (Property manager audience):
```
Property managers: How do you advise boards when they're facing a major capital expense?

The "default" answer used to be special assessments. But that approach creates board tension, resident pushback, and delays projects your properties need.

Here's what forward-thinking CAMs are recommending instead:
• Reserve fund loans that preserve cash flow while funding urgent repairs
• Assessment-backed bonds that spread costs over 10-15 years
• Lines of credit for phased projects (roofs, siding, paving)
• Manufacturer financing bundled with installation (HVAC, windows)

Each option protects homeowners from surprise bills while ensuring quality repairs happen on schedule.

We help your boards compare financing options so they can move on projects faster.

👉 Read the full breakdown: www.hoaprojectfunding.com/blog/hoa-roof-replacement-financing/

Free consult at www.hoaprojectfunding.com

#HOA #CommunityAssociation #PropertyManagement #HOAFinancing #CapitalImprovement
```

## Key Performance Indicators

**Primary Metric**: Website clicks from social → Application fills OR Consult bookings

**Track**:
- Facebook → www.hoaprojectfunding.com traffic
- LinkedIn → www.hoaprojectfunding.com traffic
- Application form submissions (attributed to social)
- Free consult bookings (attributed to social)

**DON'T track**:
- Likes, shares, reactions (vanity metrics)
- Email signups (we don't have them)
- Downloads (we don't have them)

## Troubleshooting

**Facebook group posts getting removed**:
- Ensure NO direct links in group posts
- Provide value first, never pitch
- Participate in other discussions (not just your posts)

**Low engagement on LinkedIn**:
- Check hashtags (all 5 required hashtags present?)
- Verify targeting PMs/CAMs (not just HOA boards)
- Use professional, peer-to-peer tone

**Posts scheduled at wrong time**:
- Verify timezone: `America/New_York` (EST/EDT)
- Check platform-strategy.md for correct schedule

---

**Created for**: HOA Project Funding (www.hoaprojectfunding.com)
**Agent ID**: `hoa-social-media`
**Workspace**: `/workspaces/hoa-social-media`
**Platform Strategy**: See [platform-strategy.md](file:///C:/Users/SPilcher/OpenClaw2.0%20for%20linux/openclaw-skills/hoa-social-media/platform-strategy.md)
