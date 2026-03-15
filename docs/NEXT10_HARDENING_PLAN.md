# Next 10 Agent Hardening Plan
**Source of truth:** `docs/RATIONALIZATION_PLAN.md`, `docs/OPTIMIZATION_PRIORITY_MATRIX.md`
**Date:** 2026-03-14
**Scope:** MONITOR-tier agents + Todd (main) + Scout persona linkage

---

## The Next 10 (+ Todd/Scout)

| # | Agent | OptPri | Type | Key Risk |
|---|-------|--------|------|----------|
| H6 | `hoa-facebook-poster` | 9 | LLM via OpenClaw | Posts to Facebook — only agent that touches a public social API |
| H7 | `jake-meeting-booker` | 9 | LLM handler | Generates meeting emails for INTERESTED leads — high-stakes conversion moment |
| H8 | `jake-contact-enricher` | 7 | Special handler | Feeds the entire outreach pipeline — bad enrichment = bad emails sent to wrong people |
| H9 | `hoa-contact-enricher` | 6 | Special handler | Same risk for HOA pipeline, different data sources |
| H10 | `jake-content-engine` | 6 | LLM via OpenClaw | Produces content under Jake's name — published to blog and LinkedIn |
| H11 | `cfo-content-engine` | 6 | LLM via OpenClaw | Same risk, Steve Pilcher's professional voice |
| H12 | `pipeline-director` | 6 | Special handler | Autonomous dispatch — if logic is wrong, entire pipeline stalls or wastes runs |
| H13 | `hoa-discovery` | 5 | Special handler | Feeds HOA pipeline top-of-funnel — Playwright scraping can break silently |
| H14 | `hoa-contact-finder` | 5 | Special handler | Finds HOA board contacts — scraping ethics rules critical |
| H15 | `cfo-lead-scout` | 5 | Special handler | DB-based lead research — feeds CFO outreach pipeline |
| H16 | `main` (Todd) | 3 | Chat router | Routes all chat — persona/handler gap is the biggest confusion point in the system |

---

## Agent-by-Agent Assessment

### H6: `hoa-facebook-poster`

**SOUL:** 520 words. Minimal. Says "do NOT use exec or write" — good. But no content guard instructions, no banned-word list, no QA gate.

**Gaps:**
- No content guard on posts before they hit Facebook API
- No Ralph QA review on social content
- No Brain observation when posts succeed/fail
- No output schema in `outputValidator.js`
- SOUL has no banned-word list (outreach agents have one, social doesn't)

**Changes:**
| File | Change |
|------|--------|
| `openclaw-skills/hoa-facebook-poster/SOUL.md` | Add banned-word list matching outreach agents. Add "never post without queue approval" reinforcement. |
| `server/services/outputValidator.js` | Add schema: check for post content, verify not empty, warn if too long (>500 chars for FB) |

### H7: `jake-meeting-booker`

**SOUL:** 440 words. Has JSON output format with `meeting_agenda`, `prep_question`, `research_used`. Good structure. No self-eval loop. No banned-word list beyond jargon.

**Gaps:**
- No content guard on meeting confirmation emails (these reach INTERESTED leads — highest-value contacts)
- No Ralph QA on meeting drafts (the handler inserts with `status='draft'` but no `qa_status`)
- No Brain observation beyond the existing `meeting_booked` signal (doesn't track QA results)
- Meeting-booker handler in runs.js doesn't set `qa_status` or run content guard

**Changes:**
| File | Change |
|------|--------|
| `server/routes/runs.js` (jake_meeting_booker) | After INSERT, run content guard + Ralph QA. Set `qa_status`. |
| `server/services/outputValidator.js` | Tighten schema: require `meeting_agenda` array (non-empty), require `[CALENDLY_URL]` literal in body_text |

### H8: `jake-contact-enricher`

**SOUL:** 280 words. Minimal — mostly describes the waterfall. Deterministic handler, $0. No LLM risk.

**Gaps:**
- No trending on enrichment success rate (hit rate could silently degrade if Google blocks scraping)
- Brain observations exist for successful enrichments but NOT for failures
- No Playwright health correlation (enricher depends on Playwright pool — if pool degrades, enricher fails silently)

**Changes:**
| File | Change |
|------|--------|
| `server/routes/runs.js` (jake_contact_enricher) | Add quality metrics to audit_log: hit_rate, method_distribution, failure_reasons. Discord alert if hit_rate < 15% (below 20% baseline). |

### H9: `hoa-contact-enricher`

**SOUL:** 2,980 words. Longest SOUL in the fleet. Very detailed waterfall, rate limiting, ethics rules. Excellent.

**Gaps:**
- Same trending gap as jake-enricher — no hit rate tracking over time
- Separate HOA DB (`hoa_leads.sqlite`) — health scorecard API doesn't reach this data

**Changes:**
| File | Change |
|------|--------|
| `server/routes/runs.js` (hoa_contact_enricher) | Same audit_log quality metrics as jake-enricher. |

### H10: `jake-content-engine`

**SOUL:** 1,540 words. Has mandatory 8-criteria self-evaluation loop. Excellent — matches cfo-content-engine's rigor.

**Gaps:**
- Self-evaluation scorecard in output is not parsed/stored server-side (same gap as cfo-outreach before we fixed it)
- Ralph QA fires on content via postProcessor but doesn't use a content-specific scoring rubric (uses outreach rubric)
- No Brain observation on content drafts

**Changes:**
| File | Change |
|------|--------|
| `server/services/postProcessor.js` | Parse self-eval scorecard from content engine output (same pattern as outreach). Add Brain `content_drafted` observation. |
| `server/services/ralphQA.js` | Content review already exists (`reviewSingleContent`). Verify it fires in postProcessor for content engines. |

### H11: `cfo-content-engine`

**SOUL:** 1,310 words. Same self-eval structure as jake-content. Includes Trust Envelope requirement.

**Gaps:** Same as jake-content-engine — self-eval not parsed, no Brain observation on draft.

**Changes:** Covered by same postProcessor changes as H10.

### H12: `pipeline-director`

**SOUL:** No dedicated SOUL.md in openclaw-skills (it's a special handler only). Behavior defined entirely in `pipelineDirector.js` service.

**Gaps:**
- No audit trail of dispatch decisions (what was dispatched, why, what was skipped)
- No dry-run mode for testing
- If dispatch logic has a bug, it silently queues wrong actions across the entire pipeline
- No Brain observation on dispatch cycle

**Changes:**
| File | Change |
|------|--------|
| `server/routes/runs.js` (pipeline_director) | Log dispatch plan to audit_log with full detail. Add Brain `pipeline_dispatched` observation. |

### H13: `hoa-discovery`

**SOUL:** 1,100 words. Detailed source list, dedup rules, priority scoring. Good.

**Gaps:**
- No discovery rate trending (are we finding fewer communities per run?)
- No Playwright failure tracking specific to discovery runs
- No Brain observation on discovery completion (jake-construction-discovery has them; hoa-discovery doesn't)

**Changes:**
| File | Change |
|------|--------|
| `server/routes/runs.js` (hoa_discovery) | Add Brain `market_insight` observation matching jake-construction-discovery pattern. Log discovery metrics to audit_log. |

### H14: `hoa-contact-finder`

**SOUL:** 2,210 words. Confidence scoring model, scraping ethics, detailed output. Good.

**Gaps:**
- Same as hoa-discovery — no trending, no Brain observations
- Confidence scores computed but not tracked over time

**Changes:**
| File | Change |
|------|--------|
| `server/routes/runs.js` (hoa_contact_scraper) | Add Brain observation on contacts found. Log confidence score distribution to audit_log. |

### H15: `cfo-lead-scout`

**SOUL:** 290 words. Minimal. Just a scoring rubric. Deterministic handler.

**Gaps:**
- No quality trending (same gap jake-lead-scout had before Step 5)
- No validation on inserted leads (jake-lead-scout has `validateLead()`, cfo-lead-scout may not)
- No Brain observations on scout results

**Changes:**
| File | Change |
|------|--------|
| `server/routes/runs.js` (cfo_lead_scout) | Add quality metrics to audit_log matching jake-lead-scout pattern. |

### H16: `main` (Todd)

**SOUL:** In `openclaw-skills/todd/SOUL.md` — defines Todd as wartime chief of staff. But the DB agent is named `main`, creating identity confusion.

**Gaps:**
- Todd's SOUL defines routing behavior, but `main` is just a chat router — no governance on what Todd routes
- Scout persona (`openclaw-skills/scout/SOUL.md`) is supposed to be the research voice, but no code connects Scout's personality to discovery agent responses
- No audit trail of chat routing decisions

**Changes:**
| File | Change |
|------|--------|
| `scripts/seed-all-agents.js` | Update `main` agent description to "Todd — Chief of Staff" so identity is clear in DB/UI |

---

## Implementation Order

### Step 1: Output validator + SOUL.md (ZERO RISK)
- outputValidator.js: add schemas for facebook-poster, meeting-booker
- hoa-facebook-poster/SOUL.md: add banned-word list

### Step 2: Meeting-booker handler governance (MED RISK)
- runs.js jake_meeting_booker: content guard + Ralph QA + qa_status

### Step 3: Content engine Brain observations + self-eval parsing (LOW RISK)
- postProcessor.js: content_drafted Brain obs, self-eval parsing for content engines

### Step 4: Enricher quality trending (LOW RISK)
- runs.js jake_contact_enricher + hoa_contact_enricher: audit_log metrics, Discord alert on degradation

### Step 5: Pipeline director audit trail (LOW RISK)
- runs.js pipeline_director: audit_log dispatch plan, Brain observation

### Step 6: Discovery + contact-finder Brain observations (LOW RISK)
- runs.js hoa_discovery + hoa_contact_scraper: Brain observations matching jake patterns

### Step 7: cfo-lead-scout trending + Todd identity fix (LOW RISK)
- runs.js cfo_lead_scout: quality metrics
- seed-all-agents.js: Todd identity clarification
