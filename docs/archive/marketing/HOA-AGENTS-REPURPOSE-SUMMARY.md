# HOA Agents Reorganization Summary

**Date**: 2026-02-13
**Status**: Agents repositioned, SOUL.md updates needed

---

## ✅ **Actions Completed**

### 1. **Moved to Active** (Ready to repurpose)
- ✅ `hoa-content-writer` → `/workspaces/hoa-content-writer/`
- ✅ `hoa-email-campaigns` → `/workspaces/hoa-email-campaigns/`

### 2. **Kept in Archive** (Paused for future)
- 🟨 `hoa-cms-publisher` → `/workspaces/_archive/hoa-cms-publisher/`
- 🟨 `hoa-social-media` → `/workspaces/_archive/hoa-social-media/`

### 3. **Moved to Cold Storage** (Deleted/dormant)
- 🟥 `hoa-social-engagement` → `/workspaces/_cold-storage/hoa-social-engagement/`

---

## 📝 **SOUL.md Updates Needed**

### **hoa-content-writer** → Outreach + Trigger-Specific Explainers

**Current Purpose**: SEO blog content writer (1200-1500 word posts)

**New Purpose**:
1. **Outreach Content** - Personalized emails for hot leads, seasonal campaigns, geographic targeting, re-engagement
2. **Trigger-Specific Explainers** - Short (300-600 word) focused pieces triggered by events or questions

**Key Changes**:
- **Output**: Change from long-form blog posts to:
  - Outreach emails (< 150 words)
  - Short explainers (300-600 words)
- **Triggers**:
  - Hot lead captured ($250K+ project)
  - Seasonal events (pre-storm, budget season)
  - Geographic events (weather, regulatory changes)
  - Re-engagement (30/60/90 day follow-ups)
- **Directory Structure**:
  - `outreach/YYYY-MM-DD-[type]-[hoa-slug].md`
  - `explainers/[topic-slug].md`

**Update Location**: `/home/sjpilche/projects/openclaw-v1/workspaces/hoa-content-writer/SOUL.md`
**Backup Created**: `/home/sjpilche/projects/openclaw-v1/workspaces/hoa-content-writer/SOUL.md.backup`

**Priority Topics for Explainers**:
- "Which HOA Financing Option is Right for Your $[X] Project?"
- "Emergency HOA Roof Repair: How to Get Funding in 48 Hours"
- "Can Our HOA Afford a Loan? Understanding Debt-to-Income Ratios"
- "Will Financing Increase Our HOA Fees? The Real Cost Breakdown"
- "Our Reserve Fund is Low - Can We Still Qualify for Financing?"

**Outreach Types**:
1. Hot Lead Follow-up (within 2 hours of form submission)
2. Seasonal Outreach (quarterly campaigns)
3. Geographic Targeting (event-triggered)
4. Re-engagement (30/60/90 day check-ins)

---

### **hoa-email-campaigns** → Follow-up + 2-Touch Sequences

**Current Purpose**: 6-email nurture sequences, weekly newsletters, re-engagement campaigns

**New Purpose**:
1. **Follow-up Sequences** - Post-contact 2-touch follow-ups for hot leads
2. **2-Touch Campaigns** - Simple two-email sequences for specific triggers

**Key Changes**:
- **Sequence Length**: Change from 6-email nurture to 2-email touches
- **Focus**: Immediate follow-up for hot leads, not long-term nurturing
- **Triggers**:
  - Form submission (hot lead)
  - Consultation booked
  - Document requested
  - Inbound call
- **Directory Structure**:
  - `follow-ups/[lead-id]-touch-1.md`
  - `follow-ups/[lead-id]-touch-2.md`
  - `sequences/[trigger-name]-touch-1.md`
  - `sequences/[trigger-name]-touch-2.md`

**Update Location**: `/home/sjpilche/projects/openclaw-v1/workspaces/hoa-email-campaigns/SOUL.md`

**2-Touch Sequence Structure**:

**Touch 1 (Day 0)**:
- Sent immediately after trigger
- Acknowledges contact/action
- Provides immediate value (document, guide, case study)
- Sets expectation for Touch 2
- Soft CTA (reply, schedule call)

**Touch 2 (Day 3-5)**:
- References Touch 1
- Addresses common objections/questions
- Provides social proof (testimonial, case study)
- Stronger CTA (schedule consultation, apply)
- Final value offer (limited-time resource)

**Example Sequences**:
1. Hot Lead Follow-up (Day 0 + Day 3)
2. Consultation Booked (Day -1 prep + Day +1 follow-up)
3. Document Downloaded (Day 0 + Day 5)
4. Inbound Call No Answer (Day 0 + Day 2)
5. Quote Sent (Day 1 + Day 7)

---

## 🔄 **Integration with Lead Capture**

The repurposed agents now work together:

```
Lead Form Submitted (hoaprojectfunding.com)
         ↓
Backend scores lead (Hot/Warm/General)
         ↓
[IF HOT LEAD - $250K+, immediate timeline]
         ↓
1. hoa-content-writer: Draft personalized outreach email
   → Save to: outreach/YYYY-MM-DD-hot-lead-[hoa-slug].md
   → Telegram notification sent for approval
         ↓
2. hoa-email-campaigns: Create 2-touch follow-up sequence
   → Touch 1 (Day 0): Value-first email with guide/resource
   → Touch 2 (Day 3): Social proof + consultation CTA
   → Save to: follow-ups/[lead-id]-touch-1.md, touch-2.md
   → Telegram notification sent for approval
         ↓
Manual Review & Approval
         ↓
Send via ESP (SendGrid) or manually
```

---

## 📋 **Next Steps**

### Immediate (Do Now):
1. ✅ Update `hoa-content-writer/SOUL.md` with outreach + explainer instructions
2. ✅ Update `hoa-email-campaigns/SOUL.md` with follow-up + 2-touch instructions
3. ✅ Create directory structure:
   ```bash
   mkdir -p /home/sjpilche/projects/openclaw-v1/workspaces/hoa-content-writer/outreach
   mkdir -p /home/sjpilche/projects/openclaw-v1/workspaces/hoa-content-writer/explainers
   mkdir -p /home/sjpilche/projects/openclaw-v1/workspaces/hoa-email-campaigns/follow-ups
   mkdir -p /home/sjpilche/projects/openclaw-v1/workspaces/hoa-email-campaigns/sequences
   ```

### Testing (After SOUL.md updates):
4. Test hot lead trigger:
   ```bash
   wsl.exe bash -c "cd /home/sjpilche/projects/openclaw-v1 && \
     npx openclaw agent --agent hoa-content-writer --local \
     --message 'Draft hot lead outreach for Riverside Commons HOA - \$275K pool renovation, immediate timeline, low reserves'"
   ```

5. Test 2-touch sequence:
   ```bash
   wsl.exe bash -c "cd /home/sjpilche/projects/openclaw-v1 && \
     npx openclaw agent --agent hoa-email-campaigns --local \
     --message 'Create 2-touch follow-up sequence for hot lead: Riverside Commons HOA, \$275K pool project'"
   ```

### Integration (After testing):
6. Connect to ClawOps backend:
   - Add trigger in `server/lib/followUpDrafter.js` to call OpenClaw agents
   - When hot lead scored, trigger both agents automatically
   - Drafts saved to workspaces for review

7. Schedule daily check:
   ```bash
   wsl.exe bash -c "cd /home/sjpilche/projects/openclaw-v1 && \
     npx openclaw cron add \
       --agent hoa-content-writer \
       --cron '0 9 * * *' \
       --message 'Check for new hot leads in CRM and draft outreach for any uncontacted leads from last 24 hours' \
       --tz 'America/New_York' \
       --name 'Daily Hot Lead Outreach Check'"
   ```

---

## 🗂️ **File Locations**

**Active Agents**:
- `/home/sjpilche/projects/openclaw-v1/workspaces/hoa-content-writer/`
- `/home/sjpilche/projects/openclaw-v1/workspaces/hoa-email-campaigns/`

**Paused (Archive)**:
- `/home/sjpilche/projects/openclaw-v1/workspaces/_archive/hoa-cms-publisher/`
- `/home/sjpilche/projects/openclaw-v1/workspaces/_archive/hoa-social-media/`

**Cold Storage**:
- `/home/sjpilche/projects/openclaw-v1/workspaces/_cold-storage/hoa-social-engagement/`

**Lead Capture Backend**:
- `/c/Users/SPilcher/OpenClaw2.0 for linux/server/lib/followUpDrafter.js`
- `/c/Users/SPilcher/OpenClaw2.0 for linux/server/data/leads/hot-leads.json`

---

## 🎯 **Success Metrics**

**hoa-content-writer (Outreach & Explainers)**:
- Hot lead outreach drafted within 2 hours of form submission
- Outreach personalization score > 80% (uses HOA name, project, amount)
- Explainer library grows to 15 core topics in 30 days
- Response rate to outreach > 20%

**hoa-email-campaigns (Follow-up & 2-Touch)**:
- 2-touch sequences created for all hot leads
- Touch 1 sent within 4 hours of trigger
- Touch 2 sent 3-5 days after Touch 1
- Sequence open rate > 40%
- Consultation booking rate > 15%

---

**Status**: Agents repositioned. SOUL.md updates needed to complete repurposing.
**Next**: Update SOUL.md files with new instructions, test agents, integrate with lead capture backend.
