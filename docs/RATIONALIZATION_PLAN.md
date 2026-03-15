# OpenClaw 2.0 — Agent Rationalization Plan
**Date:** 2026-03-14
**Principle:** Preserve what works. Clarify what's unclear. Freeze what's dormant. Merge nothing prematurely.

---

## 0. Actual Inventory (post-deep-scan)

The workspace contains **67 SOUL.md files** across `openclaw-skills/`. The audit identified 53 agents; the deep scan found 14 more that were undocumented:

| Agent | Discovery Status | Notes |
|-------|-----------------|-------|
| `owen-analytics-monitor` | NEW | 4th Owen agent (previously only 3 documented) |
| `owen-lead-scout` | NEW | 5th Owen agent |
| `dc-intel-owner-research` | NEW | DC Intel vertical — owner research |
| `dc-intel-research-queue` | NEW | DC Intel vertical — research queue |
| `polyclaw` | NEW | Prediction market intelligence — completely separate domain |
| `rse-build-spec-generator` | NEW | Revenue Signal Engine — spec generator |
| `rse-campaign-builder` | NEW | Revenue Signal Engine — campaign builder |
| `charlie` | Documented in agents/ | Engineering persona, not in openclaw-skills handler registry |
| `quill` | Documented in agents/ | Content persona, not in openclaw-skills handler registry |
| `ralph` | Documented in agents/ | QA persona — now has `ralphQA.js` service |
| `scout` | Documented in agents/ | Research persona, not in openclaw-skills handler registry |
| `todd` | Documented in agents/ | Chief of Staff persona, mapped to `main` agent |
| `hoa-contact-finder` | Listed in STATUS.md | Separate from hoa-contact-enricher |
| `hoa-special-assessment-monitor` | Listed in HOA Pipeline | No handler |

**Revised total: 67 SOUL.md files = 67 defined agent identities.**

---

## 1. Functional Clusters

### Cluster A: Lead Pipeline (Jake/CFO) — 11 agents
*Revenue-critical. Do not touch without testing.*

| Agent | Execution | Role | Keep? |
|-------|-----------|------|-------|
| `jake-lead-scout` | LLM handler | Find leads via web search | YES — core |
| `cfo-lead-scout` | Special handler | Find leads via DB research | YES — core |
| `jake-construction-discovery` | Special handler | Google Maps bulk scraping | YES — core |
| `jake-contact-enricher` | Special handler | Email/phone waterfall | YES — core |
| `jake-outreach-agent` | LLM via OpenClaw | Cold email drafting | YES — core |
| `cfo-outreach-agent` | LLM via OpenClaw | Cold email drafting (CFO voice) | YES — core |
| `jake-follow-up-agent` | LLM handler | Day-5 follow-up | YES — core |
| `jake-reply-classifier` | Special handler | Reply classification | YES — core |
| `jake-meeting-booker` | LLM handler | Meeting confirmation | YES — core |
| `jake-crm-sync` | Special handler | Sheets/CSV export | YES — core |
| `jake-case-study-builder` | SOUL only | Win → case study | KEEP — build when first pilot closes |

### Cluster B: HOA Pipeline — 10 agents
*Active revenue stream. Handlers exist for core path.*

| Agent | Execution | Role | Keep? |
|-------|-----------|------|-------|
| `hoa-discovery` | Special handler | Google Maps HOA scraping | YES — core |
| `hoa-contact-finder` | Special handler | HOA board member search | YES — core |
| `hoa-contact-enricher` | Special handler | Email waterfall for HOA | YES — core |
| `hoa-outreach-drafter` | Special handler | Cold outreach sequences | YES — core |
| `hoa-minutes-monitor` | Special handler | Meeting minutes signals | YES — core |
| `google-reviews-monitor` | Special handler | Reputation signals | YES — core |
| `hoa-special-assessment-monitor` | SOUL only | Special assessment tracking | KEEP — valuable concept, needs handler |
| `hoa-email-campaigns` | SOUL only | Nurture sequences | KEEP — build at 50+ NOT_NOW contacts |
| `hoa-cms-publisher` | SOUL only | GitHub → Netlify blog | KEEP — needed for content publishing |
| `hoa-website-publisher` | SOUL only | Website content updates | CLARIFY — overlaps with cms-publisher |

### Cluster C: HOA Social — 4 agents
*Only 1 executes. Overbuilt for current needs.*

| Agent | Execution | Role | Keep? |
|-------|-----------|------|-------|
| `hoa-facebook-poster` | LLM via OpenClaw | Facebook posting | YES — only one that works |
| `hoa-social-media` | SOUL only | Multi-platform coordinator | FREEZE — activate when 2+ platforms |
| `hoa-social-engagement` | SOUL only | Comment/reply management | FREEZE — no engagement volume yet |
| `hoa-networker` | SOUL only | Community discovery | KEEP — useful next, Reddit/FB groups |

### Cluster D: Management Research — 5 agents
*All have handlers. Well-defined boundaries. No changes needed.*

| Agent | Execution | Keep? |
|-------|-----------|-------|
| `mgmt-portfolio-scraper` | Special handler | YES |
| `mgmt-portfolio-mapper` | Special handler | YES |
| `mgmt-contact-puller` | Special handler | YES |
| `mgmt-review-scanner` | Special handler | YES |
| `mgmt-cai-scraper` | Special handler | YES |

### Cluster E: Content Production — 5 agents
*Three execute, two are SOUL only.*

| Agent | Execution | Role | Keep? |
|-------|-----------|------|-------|
| `jake-content-engine` | LLM via OpenClaw | Blog/LinkedIn for Jake | YES — core |
| `cfo-content-engine` | LLM via OpenClaw | Blog/LinkedIn for CFO | YES — core |
| `hoa-content-writer` | LLM via OpenClaw | HOA vertical content | YES — core |
| `content-repurposer` | SOUL only | 1 blog → 5 derivatives | KEEP — useful, needs handler |
| `jake-case-study-builder` | SOUL only | (counted in Cluster A) | — |

### Cluster F: Signal & Intelligence — 5 agents
*Mix of active and SOUL-only. Valuable but inconsistent execution coverage.*

| Agent | Execution | Role | Keep? |
|-------|-----------|------|-------|
| `jake-pain-signal-monitor` | SOUL only | ERP pain signal scanning | KEEP — high value, needs handler |
| `competitor-intel` | SOUL only | Competitor monitoring | KEEP — high value, needs handler |
| `jake-hiring-signal-agent` | SOUL only | Hiring = ERP pain signal | CLARIFY — overlaps with pain-signal-monitor |
| `jake-permit-scanner` | Scaffolded | County permit signals | KEEP — handler exists, needs service |
| `bid-result-scraper` | Scaffolded | Procurement portal scraping | KEEP — handler exists, needs service |

### Cluster G: Operations & Orchestration — 10 agents
*All execute. Well-governed. The backbone.*

| Agent | Execution | Keep? |
|-------|-----------|-------|
| `main` (Todd) | Chat router | YES |
| `daily-debrief` | LLM handler | YES |
| `morning-digest` | Special handler | YES |
| `pipeline-director` | Special handler | YES |
| `pipeline-state-tracker` | Special handler | YES |
| `urgency-scorer` | Special handler | YES |
| `tenacity-cadence-engine` | Special handler | YES |
| `brain-distillation` | Special handler | YES |
| `idle-training` | Special handler | YES |
| `ralph-qa` | Special handler | YES — NEW |

### Cluster H: Opportunity Engine — 4 agents
*Full pipeline from signal to prototype. All execute.*

| Agent | Execution | Keep? |
|-------|-----------|-------|
| `opportunity-scanner` | Special handler | YES |
| `opportunity-scorer` | Special handler | YES |
| `software-factory` | Special handler | YES |
| `traction-monitor` | Special handler | YES |

### Cluster I: Revenue Signal Engine — 6 agents
*Newer pipeline. 4 have handlers, 2 are SOUL only.*

| Agent | Execution | Keep? |
|-------|-----------|-------|
| `rse-channel-monitor` | Special handler | YES |
| `rse-transcript-extractor` | Special handler | YES |
| `rse-signal-scorer` | Special handler | YES |
| `rse-expert-librarian` | Special handler | YES |
| `rse-feedback-loop` | Special handler | YES |
| `rse-build-spec-generator` | SOUL only | KEEP — next RSE step |
| `rse-campaign-builder` | SOUL only | KEEP — next RSE step |

### Cluster J: Social Distribution — 4 agents
*All SOUL only. No execution paths.*

| Agent | Execution | Keep? |
|-------|-----------|-------|
| `jake-social-scheduler` | SOUL only | FREEZE — no Twitter API configured |
| `jake-twitter-poster` | SOUL only | FREEZE — same reason |
| `linkedin-direct-poster` | SOUL only | KEEP — LinkedIn posting is high-value |
| `sms-follow-up` | SOUL only | FREEZE — no Twilio configured |

### Cluster K: Executive Personas — 5 agents
*The "personality layer" from the original agents/ directory.*

| Agent | Maps To | Keep? |
|-------|---------|-------|
| `todd` | `main` agent + pipeline orchestration | YES — but clarify: Todd = `main` in the DB |
| `charlie` | No handler | FREEZE — engineering persona without code execution |
| `quill` | No handler | FREEZE — content persona, `jake-content-engine` does this |
| `ralph` | `ralphQA.js` service | YES — now has real execution via ralph_qa handler |
| `scout` | No handler | FREEZE — research persona, actual agents do this work |

### Cluster L: Brand Experiments (Dormant) — 8 agents
*Zero execution. Zero cost. Review at Q2.*

| Agent | Keep? |
|-------|-------|
| `owen-content-engine` | FREEZE |
| `owen-outreach-agent` | FREEZE |
| `owen-social-scheduler` | FREEZE |
| `owen-analytics-monitor` | FREEZE |
| `owen-lead-scout` | FREEZE |
| `data-rehab-scout` | FREEZE |
| `data-rehab-content` | FREEZE |
| `data-rehab-outreach` | FREEZE |

### Cluster M: Vertical Experiments (Dormant) — 3 agents

| Agent | Keep? | Notes |
|-------|-------|-------|
| `dc-intel-owner-research` | FREEZE | DC Intel vertical — completely dormant |
| `dc-intel-research-queue` | FREEZE | DC Intel vertical — completely dormant |
| `polyclaw` | FREEZE | Prediction market — different domain entirely |

### Cluster N: Analytics & Proof (SOUL only) — 6 agents
*Mirror agents across Jake/CFO brands. None execute.*

| Agent | Keep? |
|-------|-------|
| `jake-analytics-monitor` | KEEP — useful when pipeline has volume |
| `cfo-analytics-monitor` | MERGE LATER — duplicate of jake-analytics-monitor with different brand tag |
| `jake-offer-proof-builder` | KEEP — needed for pilot delivery |
| `cfo-offer-proof-builder` | MERGE LATER — same logic, different brand |
| `jake-pilot-deliverer` | KEEP — needed for pilot delivery |
| `cfo-pilot-deliverer` | MERGE LATER — same logic, different brand |

---

## 2. Overlap Map

| Overlap | Agents | Severity | Resolution |
|---------|--------|----------|------------|
| Jake/CFO analytics | `jake-analytics-monitor` + `cfo-analytics-monitor` | LOW | Both SOUL only. When building, make ONE handler with brand param. |
| Jake/CFO offer-proof | `jake-offer-proof-builder` + `cfo-offer-proof-builder` | LOW | Same — one handler, brand param. |
| Jake/CFO pilot | `jake-pilot-deliverer` + `cfo-pilot-deliverer` | LOW | Same — one handler, brand param. |
| HOA social cluster | 4 agents, 1 executes | MED | Documented in CLUSTER_BOUNDARIES.md. Freeze 2, keep 2. |
| HOA web publishing | `hoa-cms-publisher` + `hoa-website-publisher` | MED | Unclear boundary. Recommend: cms-publisher = blog, website-publisher = landing pages. |
| Pain signals | `jake-pain-signal-monitor` + `jake-hiring-signal-agent` | LOW | hiring-signal is a subset of pain-signal. When building, make pain-signal-monitor the handler and have hiring be one of its signal sources. |
| Executive personas vs real agents | charlie/quill/scout overlap with actual working agents | MED | See Governance Model below. |
| Todd persona vs main agent | `todd` SOUL.md vs `main` agent in DB | LOW | Todd IS main. Document this. |

---

## 3. Agents That Should Remain Distinct

These agents have genuinely different logic, different data sources, or different output formats. Do NOT merge them even if their names sound similar.

| Agent A | Agent B | Why Distinct |
|---------|---------|-------------|
| `jake-lead-scout` | `cfo-lead-scout` | Different search strategies. jake uses web_search rotation; cfo uses DB-based research. Different handlers. |
| `jake-outreach-agent` | `cfo-outreach-agent` | Different SOUL.md voice. Same handler path but different personality = different output. |
| `jake-contact-enricher` | `hoa-contact-enricher` | Different data sources (GC websites vs HOA portals), different enrichment waterfall. |
| `hoa-outreach-drafter` | `hoa-email-campaigns` | Cold vs nurture. Different triggers, different sequence types. |
| `hoa-networker` | `hoa-social-engagement` | Proactive community finding vs reactive comment management. |
| `opportunity-scanner` | `rse-channel-monitor` | Different signal domains. opp-scanner = Reddit/HN/forums. rse = YouTube/podcasts. |
| `hoa-minutes-monitor` | `google-reviews-monitor` | Different data sources (HOA portals vs Google Maps), different signal types. |
| `pipeline-director` | `pipeline-state-tracker` | Tracker computes state. Director dispatches actions. Tracker feeds director. Sequential dependency. |

---

## 4. Agents That Need Clearer Boundaries

| Agent(s) | Issue | Recommended Fix |
|----------|-------|-----------------|
| `hoa-cms-publisher` vs `hoa-website-publisher` | Both claim to publish HOA content. Unclear which does what. | Define: cms-publisher = blog posts to GitHub/Netlify. website-publisher = landing page updates. Add to CLUSTER_BOUNDARIES.md. |
| `jake-pain-signal-monitor` vs `jake-hiring-signal-agent` | hiring-signal is one type of pain signal. Why separate agents? | When building handlers: make pain-signal-monitor the umbrella agent. hiring-signal becomes a scanner source within it (like `indeedScanner.js` is a source for opportunity-scanner). |
| `charlie` vs actual engineering agents | Charlie is a "personality" from agents/. Actual work is done by `software-factory`, `idle-training`, etc. Who does Steve talk to? | Document: Charlie is the PERSONA. software-factory/idle-training are the HANDS. When Steve says "Charlie, build X" in chat, Todd routes to the appropriate handler. Charlie's SOUL.md becomes the voice for engineering-domain chat responses. |
| `quill` vs content engines | Same issue. Quill is a persona. jake-content-engine is the handler. | Same resolution. Quill is the voice. Content engines are the execution. |
| `todd` vs `main` | Todd's SOUL.md is in `openclaw-skills/todd/`. The DB agent is named `main`. | Add alias in seed script: main.description = "Todd — Chief of Staff". Reference in CLAUDE.md. |

---

## 5. Agents That May Be Merged Later

**Do NOT merge these now.** Merge only when building the handler, and only if the logic is truly identical.

| Candidates | Merge Into | When | Condition |
|-----------|-----------|------|-----------|
| `jake-analytics-monitor` + `cfo-analytics-monitor` | Single `analytics-monitor` handler with brand param | When building analytics handler | Confirmed same metrics, same queries, only brand filter differs |
| `jake-offer-proof-builder` + `cfo-offer-proof-builder` | Single `offer-proof-builder` handler with brand param | When building proof builder | Confirmed same proof format, only voice differs |
| `jake-pilot-deliverer` + `cfo-pilot-deliverer` | Single `pilot-deliverer` handler with brand param | When building pilot flow | Confirmed same onboarding steps |
| `jake-social-scheduler` + `cfo-social-scheduler` | Single social scheduler with brand routing | When Twitter/LinkedIn APIs activated | Confirmed same posting logic |
| `jake-hiring-signal-agent` → `jake-pain-signal-monitor` | hiring becomes a scanner source | When building pain signal handler | Confirmed hiring is just one signal type |

---

## 6. Agents That Should Be Frozen or Deprecated

### Freeze (keep SOUL.md, do not schedule, do not build handlers)

| Agent | Reason |
|-------|--------|
| `owen-content-engine` | Dormant experiment. $0 cost. Review Q2 2026. |
| `owen-outreach-agent` | Same |
| `owen-social-scheduler` | Same |
| `owen-analytics-monitor` | Same |
| `owen-lead-scout` | Same |
| `data-rehab-scout` | Same |
| `data-rehab-content` | Same |
| `data-rehab-outreach` | Same |
| `dc-intel-owner-research` | Undocumented vertical. Unclear if Steve still wants this. |
| `dc-intel-research-queue` | Same |
| `polyclaw` | Prediction market domain. Completely separate from core business. |
| `charlie` | Persona only. Engineering work done by actual handlers. |
| `scout` | Persona only. Research work done by actual handlers. |
| `quill` | Persona only. Content work done by actual handlers. |
| `hoa-social-media` | No execution path. Activate only when multi-platform needed. |
| `hoa-social-engagement` | No execution path. No engagement volume to justify. |
| `jake-social-scheduler` | No Twitter API configured. |
| `jake-twitter-poster` | Same. |
| `sms-follow-up` | No Twilio configured. |

**Total frozen: 19 agents. $0 cost. Zero risk.**

### Deprecate (remove from seed script, keep SOUL.md as archive)

| Agent | Reason |
|-------|--------|
| None recommended at this time. | All SOUL.md files represent design investment. Archival is the right move at Q2 if dormant agents haven't activated. |

---

## 7. Governance Model for the Portfolio

### Tier 1: Revenue Pipeline (strictest governance)
**Agents:** jake-lead-scout, jake-contact-enricher, jake-outreach-agent, jake-reply-classifier, jake-meeting-booker, cfo-lead-scout, cfo-outreach-agent, hoa-outreach-drafter, hoa-contact-enricher

| Control | Implementation | Status |
|---------|---------------|--------|
| Input validation | `validateLead()` on all DB inserts | DONE |
| Output schema validation | `outputValidator.js` with per-agent schemas | DONE |
| Content guard | Competitor mentions, false claims, spam | DONE |
| Ralph QA gate | 5-dimension scoring, auto-review on draft creation | DONE |
| Steve confirmation gate | All runs require `/confirm` — no auto-send | EXISTING |
| Brain feedback loop | Reply classifier feeds Layer 2+3, distillation to L4 | EXISTING |
| Cost cap | $5/day circuit breaker | DONE |
| success_rate tracking | Recomputed on every completion/failure | DONE |

### Tier 2: Operational Backbone (moderate governance)
**Agents:** pipeline-director, pipeline-state-tracker, urgency-scorer, tenacity-cadence, brain-distillation, morning-digest, daily-debrief, idle-training, ralph-qa

| Control | Implementation | Status |
|---------|---------------|--------|
| Schedule drift alerting | Audit log + Discord alert on >65min drift | DONE |
| Discord rate limiting | 30 msg/hour global + per-agent | DONE |
| Health scorecard | Per-agent score via `/api/health/agents` | DONE |
| Stall detection | Pipeline state tracker flags >48h stalls | EXISTING |
| Budget cap on dispatch | Pipeline director: max 20 actions, 5 LLM per cycle | EXISTING |

### Tier 3: Research & Discovery (light governance)
**Agents:** jake-construction-discovery, hoa-discovery, mgmt-*, google-reviews-monitor, hoa-minutes-monitor, opportunity-scanner, rse-*

| Control | Implementation | Status |
|---------|---------------|--------|
| Brain observation requirement | All discovery agents write Layer 1 observations | EXISTING |
| Dedup on insert | Company name case-insensitive dedup | EXISTING |
| Playwright circuit breaker | 3 fails/5min → 10min pause | EXISTING |
| Scanner rate limits | Per-scanner backoff (recommended but not yet built) | TODO |

### Tier 4: Content Production (Ralph QA required)
**Agents:** jake-content-engine, cfo-content-engine, hoa-content-writer, content-repurposer, hoa-facebook-poster

| Control | Implementation | Status |
|---------|---------------|--------|
| Ralph QA on all drafts | Auto-review in postProcessor | DONE |
| Content guard | Banned phrases, tone violations | DONE |
| Output schema validation | Content schema checks | DONE |
| Status: flagged prevents approval | High-severity flags block send | DONE |

### Tier 5: Frozen/Experimental (no governance needed — they don't run)
**Agents:** All 19 frozen agents from Section 6.

| Control | Implementation |
|---------|---------------|
| Not seeded to DB | Remove from `seed-all-agents.js` schedules |
| SOUL.md preserved | Files remain in `openclaw-skills/` |
| Quarterly review | Check at Q2 2026 planning |

---

## 8. Lowest-Risk Changes First

### Phase 1: Documentation Only (zero code changes)
1. Add `todd` alias clarification to CLAUDE.md: "Todd = the `main` agent in the database"
2. Add `charlie/quill/scout` persona documentation to `agents/coordination_protocol.md`: these are voices, not execution agents
3. Update `seed-all-agents.js` comments to mark frozen agents
4. Add `dc-intel-*` and `polyclaw` to CLUSTER_BOUNDARIES.md as Cluster M (Vertical Experiments)

### Phase 2: Seed Script Cleanup (low risk)
5. Remove frozen agents from schedule table (keep in agents table, just disable schedules)
6. Add `owen-analytics-monitor`, `owen-lead-scout` to dormant inventory
7. Ensure all active agents have correct `special_handler` or `openclaw_id` in config

### Phase 3: Boundary Clarification (medium risk — SOUL.md edits)
8. Rewrite `hoa-cms-publisher` SOUL.md first line to clarify: "blog posts via GitHub → Netlify"
9. Rewrite `hoa-website-publisher` SOUL.md first line to clarify: "landing page and static content updates"
10. Add "you are a scanner source for pain-signal-monitor" note to `jake-hiring-signal-agent` SOUL.md
11. Add "when building this handler, use brand param not separate agents" note to all Jake/CFO mirror agents

### Phase 4: Future Handler Consolidation (when building)
12. When building analytics-monitor handler: single handler, `source_agent` param
13. When building offer-proof-builder handler: single handler, `source_agent` param
14. When building pain-signal-monitor handler: incorporate hiring-signal as one scanner source
15. When building social scheduler: single handler, platform routing

---

## Summary

| Category | Count | Action |
|----------|-------|--------|
| Active and governed | 34 | Protect. Monitor via health scorecard. |
| SOUL only, valuable | 12 | Keep. Build handlers when needed. |
| Scaffolded (handler exists, no service) | 2 | Keep. Build service files when priority rises. |
| Frozen (dormant, no execution, $0 cost) | 19 | Keep SOUL.md. Remove from schedules. Review Q2 2026. |
| **Total** | **67** | **0 deleted. 0 merged. 19 frozen. 48 active or ready.** |

*This plan reduces confusion without reducing capability. The 19 frozen agents cost nothing. The 48 remaining agents have clear boundaries, governance tiers, and documented relationships. No agent was harmed in the making of this rationalization.*
