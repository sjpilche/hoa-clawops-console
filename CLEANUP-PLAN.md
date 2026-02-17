# Documentation Cleanup Plan

**Date:** February 15, 2026
**Goal:** Organize 57 markdown files, archive 16 temporary files, remove artifacts

---

## Summary

**Current State:**
- 57 .md files in root (18,879 lines)
- 16 temporary files (`temp-*`, `tmp_*`)
- 2 malformed artifact files
- Multiple duplicate/overlapping guides

**Target State:**
- 5-10 essential .md files in root
- All others archived in `docs/archive/` with clear categorization
- Temporary files deleted or archived
- Single source of truth for each topic

---

## Phase 1: Create Archive Structure

Create these directories:

```bash
mkdir -p docs/archive/quickstart
mkdir -p docs/archive/marketing
mkdir -p docs/archive/lead-gen
mkdir -p docs/archive/features
mkdir -p docs/archive/setup
mkdir -p docs/archive/status
mkdir -p docs/archive/legacy
mkdir -p docs/archive/temp
```

---

## Phase 2: Archive Documentation Files

### Archive: Quick Start Guides → docs/archive/quickstart/

**Files to move:**
- `QUICK-START.md`
- `QUICKSTART.md`
- `HOW-TO-START.md` (MOST RECENT - use as base)
- `HOW-TO-RUN-AGENTS.md`
- `LEAD-GEN-QUICK-START.md`
- `MARKETING_TEAM_QUICK_START.md`

**Keep in root:**
- Create new consolidated `QUICK-START.md` (based on `HOW-TO-START.md`)

---

### Archive: Marketing Documentation → docs/archive/marketing/

**Files to move:**
- `MARKETING_ORCHESTRATION.md`
- `MARKETING_TEAM_ACTIVATED.md`
- `MARKETING_TEAM_QUICK_START.md` (already moved above)
- `MARKETING_TEAM_STATUS.md`
- `README_MARKETING_TEAM.md`
- `HOA-AGENTS-REPURPOSE-SUMMARY.md`
- `HOA-CONTENT-WRITER-STRATEGIC-SETUP.md`
- `.env.marketing.template`

**Keep in root:**
- Create new `MARKETING-GUIDE.md` (consolidated)

---

### Archive: Lead Generation → docs/archive/lead-gen/

**Files to move:**
- `LEAD-CAPTURE-SETUP-CHECKLIST.md`
- `LEAD_DATABASE_SETUP.md`
- `LEAD-GEN-COMPLETE.md`
- `LEAD-GEN-NETWORKER-INDEX.md`
- `LEAD-GEN-QUICK-START.md` (already moved to quickstart)
- `CONTACT_DATABASE_READY.md`
- `CONTACT_DATABASE_SETUP.md`

**Keep in root:**
- Create new `LEAD-GEN-GUIDE.md` (consolidated)

---

### Archive: Feature Documentation → docs/archive/features/

**Files to move:**
- `ACTIVATION_COMPLETE.md`
- `AUDIT_LOG_VIEWER_COMPLETE.md`
- `BLITZ-MODE-COMPLETE.md`
- `BLITZ-MODE-PLAN.md`
- `BLITZ-MODE-READY.md`
- `COST_DASHBOARD_COMPLETE.md`
- `FEATURE_GAPS_AND_TODO.md`
- `HIDDEN_FEATURES_EXPOSED.md`
- `PHASE-1-COMPLETE.md`
- `QUICK_WINS_COMPLETE.md`
- `SCHEDULE_API_COMPLETE.md`

**Keep in root:**
- None (all feature-specific docs go to archive)

---

### Archive: Setup Guides → docs/archive/setup/

**Files to move:**
- `FACEBOOK_SETUP_COMPLETE.md`
- `FACEBOOK_WEBHOOK_SETUP.md`
- `GITHUB_SETUP_INSTRUCTIONS.md`
- `REGISTRATION-CHECKLIST.md`
- `WEBHOOK_READY.md`
- `WORDPRESS-WEBHOOK-SETUP.md`
- `WHAT_WE_HAVE_AND_WHAT_YOU_NEED.md`

**Keep in root:**
- `THIRD_PARTY_INTEGRATIONS.md` (master integration list)

---

### Archive: Status/Progress → docs/archive/status/

**Files to move:**
- `SYSTEM-STATUS.md`
- `NEXT_STEPS.md`
- `WHAT_WE_BUILT_TODAY.md` (SESSION SUMMARY - IMPORTANT)

**Keep in root:**
- None (status docs are historical)

---

### Archive: Legacy/Architecture → docs/archive/legacy/

**Files to move:**
- `ARCHITECTURE-DEEP-DIVE.md`
- `HOA_OPENCLAW_AGENT_FLEET_ARCHITECTURE.md`
- `PROJECT-MASTER-INDEX.md` (will be replaced)

**Keep in root:**
- `PROJECT-STRUCTURE.md` (keep - essential reference)

---

### Archive: Temporary Files → docs/archive/temp/

**Files to move (or DELETE):**

**Temporary Markdown:**
- `temp-content-calendar.md`
- `temp-content-writer-soul.md`
- `temp-email-campaigns-soul.md`
- `temp-funnel-strategy.md`
- `temp-keyword-targets.md`
- `temp-strategic-soul.md`
- `tmp_soul_updated.md`
- `tmp_tools.md`

**Temporary Scripts:**
- `tmp_check.js`
- `tmp_debug.js`
- `tmp_send_digest.js`
- `tmp_setup_agents.js`
- `tmp_test_email.js`
- `tmp_update_agent.js`

**Miscellaneous:**
- `stevetesting` (22KB)
- `READTHISforclaudeplan` (46KB)

**Recommendation:** DELETE these files (archive if unsure)

---

## Phase 3: Delete Malformed Files

**Files to DELETE:**
- `C:UsersSPilcherAppDataLocalTemptoken.txt` (artifact from Windows path)
- `openclaw_id:` (incomplete/corrupted filename)

```bash
rm -f "C:UsersSPilcherAppDataLocalTemptoken.txt"
rm -f "openclaw_id:"
```

---

## Phase 4: Keep Essential Files in Root

**Essential Documentation (10 files in root):**

1. `README.md` - **Main navigation hub** (UPDATE to include links to all guides)
2. `QUICK-START.md` - **NEW consolidated quick start**
3. `PROJECT-STRUCTURE.md` - Directory structure reference
4. `ROADMAP.md` - Development roadmap
5. `THIRD_PARTY_INTEGRATIONS.md` - Integration master list
6. `MARKETING-GUIDE.md` - **NEW consolidated marketing guide**
7. `LEAD-GEN-GUIDE.md` - **NEW consolidated lead gen guide**
8. `PROJECT-AUDIT-REPORT.md` - **THIS report** (latest audit)
9. `CLEANUP-PLAN.md` - **This cleanup plan**
10. `TESTING-GUIDE.md` - Testing reference

**Essential Configuration:**
- `.env.example`
- `.env.local`
- `.gitignore`
- `package.json`
- `vite.config.js`
- `eslint.config.js`
- `docker-compose.yml`

**Essential Tests:**
- `test-facebook.js`
- `test-webhook-local.js`

**Essential Scripts:**
- All `*.bat` files (Windows batch scripts)

---

## Phase 5: Create Consolidated Guides

### 1. Update README.md (Navigation Hub)

Should include:
- Project overview
- Quick links to all guides
- Technology stack
- Key URLs (production, GitHub, webhooks)
- Quick start link
- Documentation index

---

### 2. Create QUICK-START.md

**Based on:** `HOW-TO-START.md` (most recent)

**Sections:**
1. Prerequisites
2. Installation
3. Configuration (`.env.local` setup)
4. Starting the application
5. First login
6. Running your first agent
7. Troubleshooting
8. Next steps (links to feature guides)

---

### 3. Create MARKETING-GUIDE.md

**Consolidate from:**
- `MARKETING_ORCHESTRATION.md`
- `MARKETING_TEAM_ACTIVATED.md`
- `MARKETING_TEAM_STATUS.md`
- `README_MARKETING_TEAM.md`

**Sections:**
1. Overview (marketing automation capabilities)
2. Agent fleet (7 marketing agents)
3. Configuration (`.env.marketing.template`)
4. Running marketing campaigns
5. Content strategy
6. Email automation
7. Social media posting
8. WordPress publishing
9. Monitoring & analytics

---

### 4. Create LEAD-GEN-GUIDE.md

**Consolidate from:**
- `LEAD-CAPTURE-SETUP-CHECKLIST.md`
- `LEAD_DATABASE_SETUP.md`
- `LEAD-GEN-COMPLETE.md`
- `WHAT_WE_BUILT_TODAY.md` (Facebook integration section)

**Sections:**
1. Overview (lead generation system)
2. Facebook Lead Ads setup
3. Database schema (leads table)
4. Webhook configuration
5. Lead capture flow
6. Lead management features (planned)
7. Lead scoring (to be implemented)
8. CRM integration (planned)
9. Analytics & reporting

---

## Execution Commands

### Option 1: Manual Cleanup (Recommended for Review)

```bash
# Navigate to project root
cd "c:\Users\SPilcher\OpenClaw2.0 for linux - Copy"

# Create archive directories
mkdir -p docs/archive/{quickstart,marketing,lead-gen,features,setup,status,legacy,temp}

# Move files (example for quickstart)
mv QUICK-START.md docs/archive/quickstart/
mv QUICKSTART.md docs/archive/quickstart/
mv HOW-TO-RUN-AGENTS.md docs/archive/quickstart/
mv LEAD-GEN-QUICK-START.md docs/archive/quickstart/
mv MARKETING_TEAM_QUICK_START.md docs/archive/quickstart/

# Move marketing files
mv MARKETING_ORCHESTRATION.md docs/archive/marketing/
mv MARKETING_TEAM_ACTIVATED.md docs/archive/marketing/
mv MARKETING_TEAM_STATUS.md docs/archive/marketing/
mv README_MARKETING_TEAM.md docs/archive/marketing/
mv HOA-AGENTS-REPURPOSE-SUMMARY.md docs/archive/marketing/
mv HOA-CONTENT-WRITER-STRATEGIC-SETUP.md docs/archive/marketing/
mv .env.marketing.template docs/archive/marketing/

# Move lead-gen files
mv LEAD-CAPTURE-SETUP-CHECKLIST.md docs/archive/lead-gen/
mv LEAD_DATABASE_SETUP.md docs/archive/lead-gen/
mv LEAD-GEN-COMPLETE.md docs/archive/lead-gen/
mv LEAD-GEN-NETWORKER-INDEX.md docs/archive/lead-gen/
mv CONTACT_DATABASE_READY.md docs/archive/lead-gen/
mv CONTACT_DATABASE_SETUP.md docs/archive/lead-gen/

# Move feature files
mv ACTIVATION_COMPLETE.md docs/archive/features/
mv AUDIT_LOG_VIEWER_COMPLETE.md docs/archive/features/
mv BLITZ-MODE-COMPLETE.md docs/archive/features/
mv BLITZ-MODE-PLAN.md docs/archive/features/
mv BLITZ-MODE-READY.md docs/archive/features/
mv COST_DASHBOARD_COMPLETE.md docs/archive/features/
mv FEATURE_GAPS_AND_TODO.md docs/archive/features/
mv HIDDEN_FEATURES_EXPOSED.md docs/archive/features/
mv PHASE-1-COMPLETE.md docs/archive/features/
mv QUICK_WINS_COMPLETE.md docs/archive/features/
mv SCHEDULE_API_COMPLETE.md docs/archive/features/

# Move setup files
mv FACEBOOK_SETUP_COMPLETE.md docs/archive/setup/
mv FACEBOOK_WEBHOOK_SETUP.md docs/archive/setup/
mv GITHUB_SETUP_INSTRUCTIONS.md docs/archive/setup/
mv REGISTRATION-CHECKLIST.md docs/archive/setup/
mv WEBHOOK_READY.md docs/archive/setup/
mv WORDPRESS-WEBHOOK-SETUP.md docs/archive/setup/
mv WHAT_WE_HAVE_AND_WHAT_YOU_NEED.md docs/archive/setup/

# Move status files
mv SYSTEM-STATUS.md docs/archive/status/
mv NEXT_STEPS.md docs/archive/status/
mv WHAT_WE_BUILT_TODAY.md docs/archive/status/

# Move legacy files
mv ARCHITECTURE-DEEP-DIVE.md docs/archive/legacy/
mv HOA_OPENCLAW_AGENT_FLEET_ARCHITECTURE.md docs/archive/legacy/
mv PROJECT-MASTER-INDEX.md docs/archive/legacy/

# Move temporary files to archive (or delete)
mv temp-*.md docs/archive/temp/
mv tmp_*.md docs/archive/temp/
mv tmp_*.js docs/archive/temp/
mv stevetesting docs/archive/temp/
mv READTHISforclaudeplan docs/archive/temp/

# Delete malformed files
rm -f "C:UsersSPilcherAppDataLocalTemptoken.txt"
rm -f "openclaw_id:"
```

---

### Option 2: Automated Cleanup Script

I can create a Node.js script to automate this cleanup with:
- Dry-run mode (preview changes)
- Backup before moving
- Logging of all actions
- Rollback capability

Would you like me to create this automated script?

---

## Post-Cleanup Validation

After cleanup, verify:

1. **Root directory has only 10-15 .md files:**
   ```bash
   ls -la *.md | wc -l
   ```

2. **Archive directories are populated:**
   ```bash
   find docs/archive -type f -name "*.md" | wc -l
   ```

3. **No temporary files in root:**
   ```bash
   ls -la temp-* tmp_* 2>/dev/null | wc -l
   ```

4. **Git status clean (all archived files tracked):**
   ```bash
   git status
   ```

5. **Create archive index:**
   ```bash
   # List all archived files
   find docs/archive -type f -name "*.md" > docs/archive/INDEX.txt
   ```

---

## Expected Results

**Before Cleanup:**
- Root directory: 91 files (57 .md files)
- Cluttered, confusing, hard to navigate

**After Cleanup:**
- Root directory: ~40 files (10-15 .md files)
- Clear structure
- Single source of truth for each topic
- All history preserved in `docs/archive/`

**Documentation Reduction:** 57 MD files → 10 essential guides (82% reduction)

---

## Rollback Plan

If you need to undo the cleanup:

```bash
# Restore all files from archive
cp -r docs/archive/* .

# Or restore specific category
cp -r docs/archive/quickstart/* .
cp -r docs/archive/marketing/* .
```

---

## Next Steps After Cleanup

1. Create consolidated guides (QUICK-START.md, MARKETING-GUIDE.md, LEAD-GEN-GUIDE.md)
2. Update README.md as navigation hub
3. Commit cleanup to Git
4. Update PROJECT-MASTER-INDEX.md
5. Review and rotate exposed credentials

---

**Ready to execute?** Let me know if you want:
1. Manual cleanup (you run commands)
2. Automated script (I create it)
3. Step-by-step assistance (we do it together)
