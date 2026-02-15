# HOA Project Funding - Content Pipeline Schedule

**Last Updated:** 2026-02-13

This document outlines the complete automated content pipeline for www.hoaprojectfunding.com. Every automated action ultimately drives qualified traffic to the intake form or free consult.

---

## Conversion Goals

All content, social posts, and email campaigns drive to:
1. **Primary:** Full loan application at www.hoaprojectfunding.com/#apply
2. **Secondary:** Free 15-minute consult at www.hoaprojectfunding.com/#consult

**NO lead magnets. NO email signup forms. NO intermediate steps.**

---

## Weekly Content Pipeline

### Monday 6:00 AM EST
**Agent:** `hoa-content-writer`
**Action:** Generate next blog post from content calendar

**What happens:**
- Agent picks the next unwritten topic from `content-calendar.md`
- Generates 1500-2000 word SEO-optimized blog post
- Includes two CTAs:
  - **Mid-article CTA:** Free consult at www.hoaprojectfunding.com/#consult
  - **End-of-article CTA:** Full application at www.hoaprojectfunding.com/#apply
- Saves post to `posts/drafts/` directory

**Manual step required:** Review blog post, edit if needed, move to `posts/approved/`

---

### Tuesday 8:00 AM EST
**Agent:** `hoa-cms-publisher`
**Action:** Upload approved posts to WordPress as drafts

**What happens:**
- Checks `posts/approved/` directory for new posts
- Uploads to WordPress via REST API as DRAFT status
- Inserts CTA blocks pointing to application form and free consult
- Notifies you via Telegram with draft link

**Manual step required:** Add featured image, final review, publish in WordPress admin

---

### Tuesday 9:00 AM EST
**Manual:** Publish blog post in WordPress

**What happens:**
- Add featured image
- Final review of formatting and CTAs
- Change status from Draft → Published
- Verify CTAs point to application and free consult

---

### Tuesday 10:00 AM EST
**Agent:** `hoa-social-media`
**Action:** Generate Facebook page post + LinkedIn post

**What happens:**
- Converts latest published blog post into two social posts:
  1. **Facebook Company Page Post:** Links to blog, clear CTA to application or free consult
  2. **LinkedIn Thought Leadership Post:** Professional tone targeting PMs/CAMs, links to blog
- Saves posts to `posts/` directory for review

**Manual step required:** Review posts, approve, schedule/publish to Facebook and LinkedIn

---

### Wednesday 12:00 PM EST
**Agent:** `hoa-social-media`
**Action:** Generate Facebook group discussion post

**What happens:**
- Creates Facebook group discussion post based on latest blog
- Value-first, asks question, sparks discussion
- NO direct link to website (builds credibility only)
- Saves post to `posts/` directory for review

**Manual step required:** Review post, approve, post to relevant Facebook groups

---

### First Tuesday of Month 10:00 AM EST
**Agent:** `hoa-email-campaigns`
**Action:** Generate and send monthly newsletter

**What happens:**
- Generates newsletter with:
  - Latest blog post highlight
  - One actionable board tip
  - Standing CTA to application or free consult at www.hoaprojectfunding.com
- Saves draft for review
- Sends to all contacts in ESP (SendGrid/Mailchimp)

**Manual step (optional):** Review draft before send, or trust automation

---

## Daily Automation

### Every Day 8:00 AM EST
**Agent:** `hoa-social-engagement`
**Action:** Monitor social platforms for new engagement

**What happens:**
- Checks LinkedIn and Facebook for:
  - Comments on company posts
  - Mentions in HOA/PM groups
  - Direct messages
- Scores each interaction using lead-scoring.json:
  - **HIGH-intent (score >= 10):** Drafts response with helpful answer + one-liner CTA
  - **MEDIUM-intent (score 5-9):** Drafts helpful response, NO CTA (builds credibility)
  - **LOW-intent (< 5):** Logs for tracking, no response needed
- Filters out homeowner complaints (only responds to decision-makers)
- Tags leads by state for geographic targeting
- Sends daily digest via Telegram with draft responses

**Manual step required:** Review draft responses, approve before posting

---

## Weekly Reports

### Monday 9:00 AM EST
**Agent:** `hoa-social-engagement`
**Action:** Generate weekly engagement metrics report

**What happens:**
- Collects metrics from past 7 days:
  - Total impressions (LinkedIn + Facebook)
  - Total engagements (likes, comments, shares, clicks)
  - Engagement rate by platform
  - High-intent leads identified
  - Medium-intent leads nurtured
  - Website clicks from social media
  - Application form submissions (if trackable)
- Saves to `metrics/weekly-YYYY-MM-DD.json`
- Sends summary via Telegram

**Manual review:** Check which content drives the most website clicks and conversions

---

### Friday 9:00 AM EST
**Agent:** `hoa-email-campaigns`
**Action:** Check for pending follow-up emails

**What happens:**
- Reviews active email sequences:
  - Application Abandonment (Days 1, 3, 7)
  - Post-Consult Follow-Up (Days 0, 5, 14, 30)
- Identifies any emails due in the next 24 hours
- Generates draft emails for review
- Sends notification via Telegram if action required

**Manual step (if needed):** Review and approve follow-up emails before scheduled send

---

## Complete Weekly Schedule (At a Glance)

| Day       | Time      | Agent                  | Action                                                |
|-----------|-----------|------------------------|-------------------------------------------------------|
| Monday    | 6:00 AM   | hoa-content-writer     | Generate blog post from content calendar              |
| Monday    | 9:00 AM   | hoa-social-engagement  | Weekly engagement metrics report                      |
| Tuesday   | 8:00 AM   | hoa-cms-publisher      | Upload approved posts to WordPress as drafts          |
| Tuesday   | 9:00 AM   | **[MANUAL]**           | Add featured image, publish blog post                 |
| Tuesday   | 10:00 AM  | hoa-social-media       | Generate Facebook page post + LinkedIn post           |
| Wednesday | 12:00 PM  | hoa-social-media       | Generate Facebook group discussion post               |
| Friday    | 9:00 AM   | hoa-email-campaigns    | Check for pending follow-up emails                    |
| Daily     | 8:00 AM   | hoa-social-engagement  | Monitor platforms, draft responses for high-intent leads |
| 1st Tue   | 10:00 AM  | hoa-email-campaigns    | Generate and send monthly newsletter                  |

---

## Conversion Tracking

**Primary KPIs:**
1. Website traffic from blog + social media
2. Application form submissions (www.hoaprojectfunding.com/#apply)
3. Free consult bookings (www.hoaprojectfunding.com/#consult)

**Secondary KPIs:**
4. High-intent leads identified via social engagement
5. Email open rates and click-through rates
6. Blog post views and time on page

**Vanity metrics (track but don't optimize for):**
- Social media likes, shares, followers
- Email list size
- Blog post word count

---

## Agent Dependencies

**Content Flow:**
```
hoa-content-writer (Mon 6 AM)
    ↓
[Manual Review + Approval]
    ↓
hoa-cms-publisher (Tue 8 AM)
    ↓
[Manual Publish in WordPress]
    ↓
hoa-social-media (Tue 10 AM) → Facebook Page + LinkedIn
    ↓
hoa-social-media (Wed 12 PM) → Facebook Group Discussion
```

**Engagement Flow:**
```
hoa-social-media posts → Social platforms
    ↓
hoa-social-engagement (Daily 8 AM) → Monitor interactions
    ↓
[Manual Review + Approve Responses]
    ↓
Post approved responses → Engage high-intent leads
    ↓
Lead converts → Application or Free Consult
```

**Email Flow:**
```
Application form (abandoned) → Webhook trigger
    ↓
hoa-email-campaigns → Application Abandonment sequence (Days 1, 3, 7)
    ↓
Lead completes application OR books consult

Free consult (completed) → Manual trigger
    ↓
hoa-email-campaigns → Post-Consult sequence (Days 0, 5, 14, 30)
    ↓
Lead submits application OR moves to monthly newsletter

Monthly Newsletter (1st Tue) → All contacts
    ↓
Blog clicks → Website traffic → Application or Consult
```

---

## Manual Steps Required

**Critical manual steps (cannot be automated):**
1. **Monday AM:** Review blog post drafts, edit if needed, move to `approved/`
2. **Tuesday 9 AM:** Add featured image to WordPress post, final review, publish
3. **Tuesday/Wednesday:** Review and approve social media posts before publishing
4. **Daily:** Review and approve draft responses to social media leads
5. **As needed:** Trigger Post-Consult email sequence after free consultations

**Optional manual review:**
- Email newsletter before send (First Tuesday)
- Follow-up email sequences (Friday check)
- Weekly metrics report (Monday)

---

## Cron Job Setup

To configure all cron jobs, run:

```bash
cd /home/sjpilche/projects/openclaw-v1
bash scripts/setup-all-crons.sh
```

This script configures all agents with the schedule documented above.

To view active cron jobs:
```bash
openclaw cron list
```

To remove all cron jobs (if you need to reset):
```bash
openclaw cron list --json | jq -r '.[].id' | xargs -I {} openclaw cron remove --id {}
```

---

## Notes

- **Timezone:** All times are US Eastern Time (America/New_York)
- **Holidays:** Cron jobs run on holidays unless manually paused
- **Failures:** If a cron job fails, you'll receive a Telegram notification
- **Testing:** Run agents manually first to test before enabling cron automation

---

## Migration from Old Schedule

**Old schedule (DEPRECATED):**
- 3x/week blog publishing (Mon/Wed/Fri)
- References to HOAReserveWise tool
- Lead magnet CTAs
- Email signup forms

**New schedule (CURRENT):**
- 1x/week blog publishing (Monday generation → Tuesday publish)
- All CTAs point to application form or free consult
- NO lead magnets, NO email signups
- Focus on quality over quantity

**Why the change:**
- Higher quality, in-depth blog posts (1500-2000 words vs shorter posts)
- More time for manual review and optimization
- Direct conversion path (no intermediate steps)
- Better alignment with business model (loan brokerage, not SaaS tool)

---

**Questions or issues?** Check individual agent SOUL.md and SKILL.md files for detailed documentation.
