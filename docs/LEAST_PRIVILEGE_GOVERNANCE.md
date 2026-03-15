# Least-Privilege Governance Model
**Date:** 2026-03-14
**Scope:** All 67 agents, all external service integrations, all handler capabilities
**Principle:** No agent should have access to capabilities it doesn't use. Every external-facing action requires a gate.

---

## 1. Permission Matrix by Agent

### Permission Classes

| Code | Meaning | Examples |
|------|---------|---------|
| **R** | Read only (DB reads, web search, file reads) | Search, scrape, score |
| **W** | Write to internal DB (clawops.db, hoa_leads.sqlite) | Insert leads, update status |
| **E** | External API call (non-destructive read) | Facebook lead fetch, Brave search |
| **X** | External write/send/post (destructive, visible to others) | Send email, post to Facebook, push to GitHub |
| **P** | Playwright browser automation | Web scraping via headless Chromium |
| **L** | LLM inference (GPT-4o or Ollama) | Generate text, score signals |
| **S** | Shell/process spawn (child_process) | OpenClaw bridge, yt-dlp |
| **F** | File system write (beyond DB) | Prototype scaffolding, CSV export |
| **D** | Discord webhook (notification) | Post alerts, embeds |

### Full Matrix

| Agent | R | W | E | X | P | L | S | F | D | Needs All? |
|-------|---|---|---|---|---|---|---|---|---|------------|
| **CORE / OPS** | | | | | | | | | | |
| `main` (Todd) | R | — | — | — | — | L | S | — | — | YES |
| `daily-debrief` | R | W | — | — | — | L | S | — | D | YES |
| `morning-digest` | R | — | — | — | — | — | — | — | D | YES |
| `pipeline-director` | R | W | — | — | — | — | — | — | D | YES |
| `pipeline-state-tracker` | R | W | — | — | — | — | — | — | D | YES |
| `urgency-scorer` | R | W | — | — | — | — | — | — | — | YES |
| `tenacity-cadence` | R | W | — | — | — | — | — | — | — | YES |
| `brain-distillation` | R | W | E | — | — | — | — | — | — | YES (Azure sync) |
| `ralph-qa` | R | W | — | — | — | — | — | — | — | YES |
| `idle-training` | R | W | — | — | — | L | — | — | — | YES |
| `database-backup` | R | — | — | — | — | — | S | F | — | YES |
| **JAKE/CFO PIPELINE** | | | | | | | | | | |
| `jake-lead-scout` | R | W | — | — | — | L | S | — | — | YES |
| `cfo-lead-scout` | R | W | — | — | P | — | — | — | — | YES |
| `jake-construction-discovery` | R | W | — | — | P | — | — | — | D | YES |
| `jake-contact-enricher` | R | W | — | — | P | L* | — | — | D | YES (*DOM extractor fallback) |
| `jake-outreach-agent` | R | W | — | — | — | L | S | — | D | **OVER** — has S but only needs L |
| `cfo-outreach-agent` | R | W | — | — | — | L | S | — | D | **OVER** — same |
| `jake-follow-up-agent` | R | W | — | — | — | L | S | — | D | **OVER** — same |
| `jake-reply-classifier` | R | W | — | — | — | — | — | — | — | YES |
| `jake-meeting-booker` | R | W | — | — | — | L | S | — | D | **OVER** — has S but only needs L |
| `jake-crm-sync` | R | — | E* | — | — | — | — | F | — | YES (*Google Sheets optional) |
| **HOA PIPELINE** | | | | | | | | | | |
| `hoa-discovery` | R | W | — | — | P | — | — | — | — | YES |
| `hoa-contact-finder` | R | W | — | — | P | — | — | — | — | YES |
| `hoa-contact-enricher` | R | W | — | — | P | — | — | — | — | YES |
| `hoa-outreach-drafter` | R | W | — | — | — | — | — | — | — | YES |
| `hoa-minutes-monitor` | R | W | — | — | P | L* | — | — | — | YES (*signal extraction) |
| `google-reviews-monitor` | R | W | — | — | P | — | — | — | — | YES |
| `hoa-facebook-poster` | R | — | — | **X** | — | L | S | — | — | **CRITICAL** — X = Facebook post |
| **MGMT RESEARCH** | | | | | | | | | | |
| `mgmt-portfolio-scraper` | R | W | — | — | P | — | — | — | — | YES |
| `mgmt-portfolio-mapper` | R | W | — | — | P | — | — | — | — | YES |
| `mgmt-contact-puller` | R | W | — | — | P | L* | — | — | — | YES |
| `mgmt-review-scanner` | R | W | — | — | P | — | — | — | — | YES |
| `mgmt-cai-scraper` | R | W | — | — | P | — | — | — | — | YES |
| **CONTENT** | | | | | | | | | | |
| `jake-content-engine` | R | W | — | — | — | L | S | — | D | **OVER** — has S |
| `cfo-content-engine` | R | W | — | — | — | L | S | — | D | **OVER** — same |
| `hoa-content-writer` | R | W | — | — | — | L | S | — | — | **OVER** — same |
| **OPPORTUNITY ENGINE** | | | | | | | | | | |
| `opportunity-scanner` | R | W | — | — | — | L | — | — | — | YES |
| `opportunity-scorer` | R | W | — | — | — | L | — | — | — | YES |
| `software-factory` | R | W | — | — | — | L | — | **F** | — | **RISK** — writes code to disk |
| `traction-monitor` | R | W | — | — | — | — | — | — | D | YES |
| **RSE** | | | | | | | | | | |
| `rse-channel-monitor` | R | W | — | — | — | — | — | — | — | YES |
| `rse-transcript-extractor` | R | W | — | — | — | — | **S** | — | — | **RISK** — spawns yt-dlp |
| `rse-signal-scorer` | R | W | — | — | — | L | — | — | D | YES |
| `rse-expert-librarian` | R | W | — | — | — | L | — | — | — | YES |
| `rse-feedback-loop` | R | W | — | — | — | — | — | — | — | YES |
| **EXTERNAL SENDS (X)** | | | | | | | | | | |
| `hoa-cms-publisher` | R | — | — | **X** | — | — | — | — | — | **CRITICAL** — pushes to GitHub repo |
| `sms-follow-up` (frozen) | — | — | — | **X** | — | — | — | — | — | FROZEN — would use Twilio |

### Frozen Agents (19) — No Runtime Permissions
All Owen (5), Data Rehab (3), DC Intel (2), Polyclaw (1), executive personas (3), social-only (4), SMS (1).
These have SOUL.md files but no handler, no service, no execution path. Permission level: **NONE**.

---

## 2. Over-Permissioned Agents

| Agent | Has | Needs | Excess | Risk |
|-------|-----|-------|--------|------|
| `jake-outreach-agent` | R,W,L,S,D | R,W,L,D | **S** (shell spawn) | LLM agents run via OpenClaw bridge which uses child_process. The agent itself doesn't need shell — the bridge does. But the bridge gives the agent's SOUL.md indirect access to any tool OpenClaw exposes. |
| `cfo-outreach-agent` | same | same | **S** | Same issue |
| `jake-follow-up-agent` | same | same | **S** | Same |
| `jake-meeting-booker` | same | same | **S** | Same |
| `jake-content-engine` | R,W,L,S,D | R,W,L,D | **S** | Same |
| `cfo-content-engine` | same | same | **S** | Same |
| `hoa-content-writer` | R,W,L,S | R,W,L | **S** | Same |
| `software-factory` | R,W,L,F | R,W,L | **F** (file write) | Writes prototype code to `data/prototypes/`. If LLM generates malicious code, it's saved to disk. |
| `rse-transcript-extractor` | R,W,S | R,W | **S** (spawns yt-dlp) | External binary execution. If yt-dlp is compromised, shell access is exposed. |
| `hoa-facebook-poster` | R,L,S,X | R,X | **L,S** | Only needs to call the publish API endpoint. Has LLM + shell access via OpenClaw bridge. |

**Root cause:** All LLM agents inherit shell spawn capability because they run through `openclawBridge.js` which uses `child_process.spawn()`. The tool policy (`openclaw-tool-policy.json`) blocks `exec` at the OpenClaw level, but the bridge itself IS a shell spawn. This is architectural — not fixable without replacing the bridge.

**Mitigation:** The tool policy is the correct layer. It blocks `exec`, `browser`, `write`, `edit` at the OpenClaw agent level. The bridge spawn is a necessary transport mechanism, not a permission grant to the agent.

---

## 3. High-Risk Permission Clusters

### Cluster X: External Sends (3 agents)

| Agent | What It Can Send | Current Gate |
|-------|-----------------|-------------|
| `hoa-facebook-poster` | Facebook page posts | OpenClaw confirmation gate (runs.js `/confirm`) |
| `hoa-cms-publisher` | GitHub repo push → Netlify deploy | Special handler `github_publisher` — no separate confirmation |
| `sms-follow-up` | Twilio SMS to phone numbers | FROZEN — no handler exists |

**These are the only agents that can make Steve visible to the outside world without his explicit action.** Email sending (SendGrid) is NOT directly accessible to any agent — it requires a separate manual send step from the content queue UI.

**Gap:** `hoa-cms-publisher` uses the `github_publisher` special handler which pushes directly to GitHub. There is no content guard or Ralph QA on blog posts before publish. If a content engine produces garbage, the publisher will push it live.

### Cluster P: Playwright Scrapers (10 agents)

| Agent | What It Scrapes |
|-------|----------------|
| `jake-construction-discovery` | Google Maps |
| `jake-contact-enricher` | Company websites, LinkedIn, Bing |
| `cfo-lead-scout` | DBPR license portal |
| `hoa-discovery` | Google Maps |
| `hoa-contact-finder` | HOA directories, SOS databases |
| `hoa-contact-enricher` | HOA websites, management portals |
| `hoa-minutes-monitor` | HOA meeting minutes portals |
| `google-reviews-monitor` | Google Maps reviews |
| `mgmt-portfolio-scraper` | Management company websites |
| `mgmt-contact-puller` | Management company contact pages |

**Risk:** Playwright pool is shared. If one agent triggers an anti-bot block on a domain, the circuit breaker pauses ALL agents for that domain.

**Existing mitigation:** Circuit breaker (3 fails/5min → 10min pause), auto-restart every 20 pages, human-like delays.

### Cluster S: Shell Spawn (8 files)

| File | What It Spawns | Necessary? |
|------|---------------|------------|
| `openclawBridge.js` | `openclaw agent --local --json` | YES — this IS the LLM execution path |
| `extensionSync.js` | `wsl bash -c "openclaw extensions list"` | YES — extension discovery |
| `domainManager.js` | `wsl bash -c "..."` | YES — domain management |
| `openclawAgentTrigger.js` | `wsl.exe` with agent args | YES — alternative trigger path |
| `health.js` | `wsl --version`, `df`, `wmic` | YES — system health checks |
| `openclaw.js` (route) | `openclaw` CLI commands | YES — admin route |
| `runs.js` (database_backup) | `node scripts/backup-database.js` | YES — backup execution |
| `rseTranscriptService.js` | `execFile('yt-dlp')` | REVIEW — external binary |

**None of these are gratuitous.** Each spawn has a specific purpose. The risk is in the transport layer, not in agent over-permission.

---

## 4. Recommended Default Policy

### For All Agents (baseline)

```json
{
  "default_permissions": {
    "db_read": true,
    "db_write": false,
    "external_api_read": false,
    "external_api_write": false,
    "playwright": false,
    "llm_inference": false,
    "shell_spawn": false,
    "file_write": false,
    "discord_notify": false
  },
  "confirmation_required": {
    "email_send": "always",
    "social_post": "always",
    "github_push": "always",
    "sms_send": "always",
    "db_delete": "always",
    "schema_change": "always"
  },
  "cost_gates": {
    "daily_cap_usd": 5.00,
    "per_run_cap_usd": 1.00,
    "llm_runs_per_hour": 20
  },
  "rate_limits": {
    "discord_per_hour": 30,
    "playwright_pages_per_hour": 100,
    "enrichment_per_hour": 50
  }
}
```

This is the **deny-by-default** baseline. Every agent gets `db_read` only. Everything else must be explicitly granted.

### Permission Tiers

| Tier | Grants | Agents |
|------|--------|--------|
| **Tier 0: Read Only** | `db_read` | All 19 frozen agents, `jake-reply-classifier`, `urgency-scorer` (these also get `db_write` by exception) |
| **Tier 1: Internal Writer** | `db_read`, `db_write` | `pipeline-director`, `pipeline-state-tracker`, `tenacity-cadence`, `brain-distillation`, `ralph-qa`, `lead-dossier-generator`, `morning-digest`, `traction-monitor`, `rse-channel-monitor`, `rse-feedback-loop` |
| **Tier 2: Scraper** | Tier 1 + `playwright` | All `mgmt-*`, `hoa-discovery`, `hoa-contact-finder/enricher`, `jake-construction-discovery`, `jake-contact-enricher`, `cfo-lead-scout`, `hoa-minutes-monitor`, `google-reviews-monitor` |
| **Tier 3: LLM Agent** | Tier 1 + `llm_inference`, `shell_spawn`, `discord_notify` | `jake-outreach-agent`, `cfo-outreach-agent`, `jake-follow-up-agent`, `jake-meeting-booker`, `jake-content-engine`, `cfo-content-engine`, `hoa-content-writer`, `daily-debrief`, `main` |
| **Tier 4: External Send** | Tier 3 + `external_api_write` | `hoa-facebook-poster`, `hoa-cms-publisher` |
| **Tier 5: System** | All permissions | `database-backup`, `idle-training`, `rse-transcript-extractor` |

---

## 5. Exceptions That Should Remain

| Agent | Exception | Justification |
|-------|-----------|---------------|
| `jake-contact-enricher` | Playwright + LLM (DOM extractor fallback) | Step 5 of enrichment waterfall uses LLM to extract contacts from unstructured page text. Without this, hit rate drops ~5%. Worth the LLM cost ($0). |
| `hoa-minutes-monitor` | Playwright + LLM | Extracts capital signals from meeting minutes text. Needs LLM to classify signals. |
| `mgmt-contact-puller` | Playwright + LLM | Uses LLM to extract contact names/roles from unstructured management company websites. |
| `software-factory` | File write (`data/prototypes/`) | Must write prototype files to disk. This is its core function. Mitigate with: Ralph QA before deploy, directory sandboxed to `data/prototypes/` only. |
| `rse-transcript-extractor` | Shell spawn (yt-dlp) | Must execute yt-dlp binary to pull YouTube transcripts. Mitigate with: `execFile` (not `exec`), fixed argument format, no user-controlled input in command. |
| `openclawBridge.js` | Shell spawn for all LLM agents | This IS the execution transport. Cannot remove without replacing OpenClaw. Tool policy is the correct mitigation layer. |
| `jake-crm-sync` | Google Sheets API (external write) | Optional — falls back to CSV. Only writes to Steve's own spreadsheet. Low risk. |
| `brain-distillation` | Azure SQL (external write) | Syncs KB entries to Azure. This is the persistence layer for institutional memory. |

---

## 6. Approval-Gated Action Set

Every action below MUST require explicit Steve approval (via `/confirm` endpoint or UI button). No agent may execute these autonomously.

| Action | Current Gate | Status |
|--------|-------------|--------|
| **Send email via SendGrid** | Manual send from content queue UI | ENFORCED — no agent has direct SendGrid access |
| **Post to Facebook** | `/confirm` gate in runs.js | ENFORCED — `hoa-facebook-poster` requires run confirmation |
| **Push to GitHub/Netlify** | `github_publisher` special handler via `/confirm` | ENFORCED — but no content guard before push |
| **Send SMS via Twilio** | FROZEN — no handler exists | N/A |
| **Post to LinkedIn** | FROZEN — no handler exists | N/A |
| **Post to Twitter** | FROZEN — no handler exists | N/A |
| **Approve outreach draft for send** | Manual status change in UI (`draft` → `approved`) | ENFORCED |
| **Override Ralph QA failure** | `/api/qa/:id/override` requires auth | ENFORCED |
| **Exceed daily cost cap** | `daily_cost_cap` setting in runs.js | ENFORCED ($5/day default) |
| **Deploy prototype to production** | No auto-deploy exists | ENFORCED by absence |
| **Modify agent SOUL.md** | `openclawBridge.js` has `fs.writeFileSync` for SOUL.md | **GAP** — should require confirmation |
| **Delete leads or contacts** | No delete endpoint exists for agents | ENFORCED by absence |
| **Modify schedules** | API route requires auth | ENFORCED |

### NEW GATES NEEDED

| Action | Current State | Recommended Gate |
|--------|-------------|-----------------|
| `github_publisher` push | No content guard | Add Ralph QA content review before push |
| `openclawBridge` SOUL.md write | Unguarded `fs.writeFileSync` | Add confirmation check or remove dynamic SOUL write |
| `software-factory` file write | Writes to `data/prototypes/` | Add path validation: reject if path escapes `data/prototypes/` |
| `rse-transcript-extractor` yt-dlp | Spawns external binary | Validate URL format before passing to yt-dlp (must be youtube.com/youtu.be) |

---

## 7. Phased Rollout Plan

### Phase 1: Document and Declare (zero code changes)
**Risk: ZERO. Just documentation.**

1. Add `permission_tier` field to each agent's config in `seed-all-agents.js`
2. Create `server/config/permission-tiers.json` defining the 6 tiers
3. Add tier display to Agent Directory page
4. Update CLAUDE.md with permission model reference

### Phase 2: Gate the Gaps (4 targeted code changes)

5. **github_publisher**: Add Ralph QA content review before GitHub push
   - File: `server/routes/runs.js` (github_publisher handler)
   - Check: Run `ralphQA.reviewSingleContent()` on the content before pushing

6. **software-factory**: Add path validation on file writes
   - File: `server/services/softwareFactory.js`
   - Check: Reject if output path doesn't start with `data/prototypes/`

7. **rse-transcript-extractor**: Validate YouTube URL format
   - File: `server/services/rseTranscriptService.js`
   - Check: Reject URLs not matching `youtube.com/watch` or `youtu.be/`

8. **openclawBridge SOUL.md write**: Add audit log entry when SOUL.md is modified
   - File: `server/services/openclawBridge.js`
   - Check: Log to `audit_log` with action `soul_modified`, include agent name and diff size

### Phase 3: Enforce Tiers at Runtime (medium risk)

9. Add `checkPermission(agentName, action)` function to runs.js
10. Before each handler executes, verify the agent's tier allows the action
11. Log permission denials to `audit_log`
12. Start in **audit mode** (log but don't block) for 2 weeks
13. After 2 weeks with zero false positives, switch to **enforce mode**

### Phase 4: Per-Agent Tool Policy (when needed)

14. Extend `openclaw-tool-policy.json` to support per-agent overrides
15. Only needed if an agent's OpenClaw-level tools need restricting beyond the global deny list
16. Current global policy (deny exec/browser/write/edit, allow read/web_search/web_fetch) is sufficient for now

---

## Summary

| Metric | Value |
|--------|-------|
| Agents with external send capability | **3** (facebook-poster, cms-publisher, crm-sync) |
| Agents with shell spawn | **8 files** (all via OpenClaw bridge or system tools) |
| Agents with file write | **2** (software-factory, crm-sync CSV) |
| Over-permissioned agents | **7** (LLM agents with unnecessary shell access via bridge — architectural, not fixable without bridge replacement) |
| New gates needed | **4** (github push QA, factory path validation, yt-dlp URL validation, SOUL.md write audit) |
| Frozen agents with zero permissions | **19** |
| Confirmation-gated actions | **12** (all external sends, deploys, overrides, cost exceedances) |

*The system is already well-gated for a 50+ agent workspace. The existing confirmation gate (`/confirm`) covers the most dangerous path. The 4 new gates close the remaining gaps. The permission tier model provides a framework for future agents without requiring per-agent policy files.*
