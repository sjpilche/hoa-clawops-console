# HOA Project Funding — Active Agent Fleet

> **Status**: 6 Agents Live & Verified ✅
> **Last Updated**: February 2026
> **Purpose**: Complete reference for the HOA Project Funding automation agent fleet running in ClawOps Console

---

## 🚀 The Content Pipeline

These 6 agents work as an automated pipeline to generate leads for **hoaprojectfunding.com**:

```
[1] Content Writer → [2] CMS Publisher → [3] Social Media
                                              ↓
                                    [4] Social Engagement
                                    [5] Networker (Reddit/FB/LinkedIn)
                                    [6] Email Campaigns
```

---

## 🤖 Active Agents (All 6 Verified Working)

### 1. HOA Content Writer
- **OpenClaw ID**: `hoa-content-writer`
- **Job**: Researches trending HOA topics, writes SEO-optimized blog posts targeting HOA board members and property managers
- **Output**: Markdown blog posts in the approved content directory
- **Runs**: Weekly (Mondays at 9 AM)
- **Task**: "Research trending HOA financing topics and write one complete SEO-optimized blog post targeting HOA board members. Focus on topics like special assessments, reserve funding, or capital improvement projects."
- **Soul**: `openclaw-skills/hoa-content-writer/SOUL.md`

---

### 2. HOA CMS Publisher
- **OpenClaw ID**: `hoa-cms-publisher`
- **Job**: Takes approved blog posts from the content writer, validates formatting, commits to Git, and pushes to Netlify to trigger a deploy on hoaprojectfunding.com
- **Output**: Live published blog posts on the website
- **Runs**: Weekly (Mondays at 11 AM — after Content Writer)
- **Task**: "Check the approved content directory for new blog posts. Validate frontmatter, publish to the website via Git commit, and confirm the Netlify deploy succeeded."
- **Soul**: `openclaw-skills/hoa-cms-publisher/SOUL.md`

---

### 3. HOA Social Media
- **OpenClaw ID**: `hoa-social-media`
- **Job**: Takes published blog posts and creates platform-specific social posts for Facebook (company page + group posts) and LinkedIn to drive traffic back to the site
- **Output**: Draft social posts for Facebook and LinkedIn
- **Runs**: Weekly (Mondays at 1 PM — after CMS Publisher)
- **Task**: "Find the most recently published blog post on hoaprojectfunding.com. Create a Facebook company page post, a Facebook group discussion post, and a LinkedIn post based on the content. Tone: helpful and educational, never salesy."
- **Soul**: `openclaw-skills/hoa-social-media/SOUL.md`

---

### 4. HOA Social Engagement
- **OpenClaw ID**: `hoa-social-engagement`
- **Job**: Monitors LinkedIn and Facebook daily for comments on company posts, brand mentions, and direct messages. Scores leads, drafts responses, and flags high-intent board members for follow-up. NEVER auto-posts — all responses require human approval.
- **Output**: Draft replies in Engagement Queue, daily digest via Telegram
- **Runs**: Daily (weekdays at 8 AM)
- **Task**: "Monitor LinkedIn and Facebook for comments, mentions, and messages on HOA Project Funding posts. Score each interaction by lead quality. Draft professional responses to decision-makers (board members, property managers, CAMs). Flag any high-intent leads immediately."
- **Soul**: `openclaw-skills/hoa-social-engagement/SOUL.md`

---

### 5. HOA Networker
- **OpenClaw ID**: `hoa-networker`
- **Job**: Scans Reddit (r/HOA, r/condoassociation, r/realestate), Facebook groups, LinkedIn, BiggerPockets, and Quora for HOA boards discussing capital projects, special assessments, and financing challenges. Drafts genuinely helpful replies — never auto-posts.
- **Output**: Draft responses queued in the Engagement Queue for review
- **Runs**: Daily (9 AM and 3 PM)
- **Task**: "Scan Reddit r/HOA, r/condoassociation, Facebook HOA groups, LinkedIn property management groups, and BiggerPockets for posts mentioning: special assessment, reserve study, roof replacement, SIRS, SB 326, underfunded reserves, or capital improvement. Draft 2-3 genuinely helpful responses that position HOA Project Funding as a trusted resource. Add to engagement queue for approval."
- **Soul**: `openclaw-skills/hoa-networker/SOUL.md`

---

### 6. HOA Email Campaigns
- **OpenClaw ID**: `hoa-email-campaigns`
- **Job**: Manages email sequences for leads — follows up on application abandonment (3-email sequence), nurtures post-consultation contacts, and sends a monthly newsletter. Contacts come only from partial form submissions and past consultations.
- **Output**: Email drafts for the 3 sequences (abandonment, nurture, newsletter)
- **Runs**: Weekly (Fridays at 9 AM)
- **Task**: "Review the contact list for any incomplete application submissions or post-consultation contacts that need follow-up. Draft the appropriate email from the abandonment sequence, nurture sequence, or monthly newsletter. Use a helpful, low-pressure tone. Primary CTA: complete the loan application. Secondary CTA: free 15-minute consult."
- **Soul**: `openclaw-skills/hoa-email-campaigns/SOUL.md`

---

## 📅 Weekly Schedule At a Glance

| Time | Agent | Task |
|------|-------|------|
| Mon 9 AM | Content Writer | Write weekly blog post |
| Mon 11 AM | CMS Publisher | Publish approved posts to site |
| Mon 1 PM | Social Media | Create social posts from new blog |
| Daily 8 AM (M-F) | Social Engagement | Monitor brand mentions, draft replies |
| Daily 9 AM | Networker | Scan communities, draft responses |
| Daily 3 PM | Networker | Second community scan |
| Fri 9 AM | Email Campaigns | Review contacts, send follow-up sequences |

---

## 🔒 Human-in-the-Loop Rules

All agents follow a **draft-then-approve** model:
- ✅ Agents **research, write, and draft** automatically
- ✅ All drafted responses appear in the **Engagement Queue** (`/engagement-queue`) for review
- ❌ **Nothing is posted automatically** without your approval
- The CMS Publisher is the only agent that publishes directly — only to the company website via Git

---

## 🎯 Conversion Goals

All agents drive toward two conversion actions on hoaprojectfunding.com:
1. **Primary**: Full loan application form (`/#apply`)
2. **Secondary**: Free 15-minute consult (`/#consult`)

There is no email list, no lead magnet, no downloads — only direct conversion.

---

## 📁 Key Files

| File | Purpose |
|------|---------|
| `openclaw-skills/hoa-content-writer/SOUL.md` | Content Writer personality + full process |
| `openclaw-skills/hoa-cms-publisher/SOUL.md` | CMS Publisher process + Git workflow |
| `openclaw-skills/hoa-social-media/SOUL.md` | Social Media platform strategy |
| `openclaw-skills/hoa-social-engagement/SOUL.md` | Engagement monitoring + lead scoring |
| `openclaw-skills/hoa-networker/SOUL.md` | Community engagement rules + platforms |
| `openclaw-skills/hoa-email-campaigns/SOUL.md` | Email sequences + contact management |
| `community-setup-guide.md` | Reddit/Facebook group joining guide |
| `REDDIT-SETUP.md` | Reddit API credentials setup |
| `THIRD_PARTY_INTEGRATIONS.md` | All platform integrations (Facebook, LinkedIn, etc.) |

---

## 📊 Verified Performance (Feb 16, 2026)

| Agent | Runs | Avg Cost | Avg Duration |
|-------|------|----------|--------------|
| HOA Content Writer | 3 | $0.018 | ~40 sec |
| HOA CMS Publisher | 3 | $0.022 | ~30 sec |
| HOA Email Campaigns | 1 | $0.021 | ~53 sec |
| HOA Networker | 1 | $0.021 | ~66 sec |
| HOA Social Engagement | 1 | $0.022 | ~78 sec |
| HOA Social Media | 1 | $0.024 | ~91 sec |

**Average cost per agent run**: ~$0.022 (~$0.15/day running on schedule)

---

## 🔮 Future Agents (Not Yet Built)

The original architecture planned 16 agents for a full HOA funding workflow engine (lending research, compliance, document processing). These are on hold pending business need:

- **Lending Specialists** (6): Credit unions, banks, marketplace, specialty, bonds, rates
- **Compliance Specialists** (3): State regs (FL/CA/TX), documents, deadlines
- **Document Specialists** (3): PDF extraction, OCR, package builder
- **Coordinators** (3): Lending, compliance, document coordinators
- **Commander** (1): Master orchestrator

See `docs/archive/legacy/HOA_OPENCLAW_AGENT_FLEET_ARCHITECTURE.md` for the full vision.
