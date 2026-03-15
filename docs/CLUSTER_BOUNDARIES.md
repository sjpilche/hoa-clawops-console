# Agent Cluster Boundaries
*Operational documentation for overlapping agent groups. Read this before modifying any agent in these clusters.*

Last updated: 2026-03-14

---

## Cluster 1: Jake vs CFO Brand Agents

### The Relationship
Jake and CFO are two **brands** running on the **same codebase** targeting the **same DB tables**.

| Aspect | Jake Brand | CFO Brand |
|--------|-----------|-----------|
| Target persona | GC owners, construction execs | CFOs, Controllers, VP Finance |
| Voice/tone | Blue-collar, been-in-the-trenches | Professional, data-driven |
| DB column | `source_agent = 'jake'` | `source_agent = 'cfo'` |
| Lead table | `cfo_leads` (shared) | `cfo_leads` (shared) |
| Outreach table | `cfo_outreach_sequences` (shared) | `cfo_outreach_sequences` (shared) |
| Content table | `cfo_content_pieces` (shared) | `cfo_content_pieces` (shared) |

### Agent Mapping
| Role | Jake Agent | CFO Agent | Same Code? |
|------|-----------|-----------|------------|
| Lead Scout | `jake-lead-scout` | `cfo-lead-scout` | Different SOUL.md, different handler |
| Outreach | `jake-outreach-agent` | `cfo-outreach-agent` | Different SOUL.md, same postProcessor path |
| Content | `jake-content-engine` | `cfo-content-engine` | Different SOUL.md, same postProcessor path |
| Follow-up | `jake-follow-up-agent` | (none) | Jake only |
| Reply classifier | `jake-reply-classifier` | (shared) | Handles both via `source_agent` field |
| Meeting booker | `jake-meeting-booker` | (shared) | Handles both |

### Rules
1. **Do NOT merge** Jake and CFO agents. The brand separation is intentional.
2. Dedup is handled by the shared `cfo_leads` table — company names are checked case-insensitively regardless of source.
3. Brain context (Layer 4 KB) is shared across both brands. What works for Jake informs CFO outreach and vice versa.
4. The `source_agent` column determines which brand is displayed in the UI and which SOUL.md voice is used.
5. Pipeline Director respects a 70/30 Jake/HOA split. CFO brand leads are included in the Jake allocation.

### When to Create CFO-Specific Agents
Only if the CFO persona needs fundamentally different logic (not just different tone). Different tone = same handler, different SOUL.md.

---

## Cluster 2: HOA Social Agents

### The Problem
Four agents cover HOA social media, but only one (`hoa-facebook-poster`) has an actual execution path.

| Agent | Has SOUL.md | Has Handler | Has Service | Can Execute |
|-------|------------|-------------|-------------|-------------|
| `hoa-facebook-poster` | Yes | Via OpenClaw | Yes | YES |
| `hoa-social-media` | Yes | No | No | NO |
| `hoa-social-engagement` | Yes | No | No | NO |
| `hoa-networker` | Yes | No | No | NO |

### Intended Boundaries (from SOUL.md files)
| Agent | Intended Role |
|-------|---------------|
| `hoa-facebook-poster` | Post content to Facebook pages/groups. Scheduled daily. |
| `hoa-social-media` | Coordinator — adapts content for each platform, decides what to post where |
| `hoa-social-engagement` | Respond to comments, engage in conversations on existing posts |
| `hoa-networker` | Find and join relevant communities (Reddit, Facebook groups, forums), post helpful answers |

### Recommended Architecture (when building these out)
```
hoa-social-media (coordinator)
    |-- hoa-facebook-poster (Facebook execution)
    |-- [future] hoa-linkedin-poster (LinkedIn execution)
    |-- [future] hoa-reddit-poster (Reddit execution)

hoa-social-engagement (separate — responds to inbound)

hoa-networker (separate — community discovery and organic engagement)
```

### Rules
1. `hoa-facebook-poster` is the only one that touches external APIs. Protect it.
2. `hoa-social-media` should become the coordinator when multi-platform posting is needed.
3. `hoa-social-engagement` and `hoa-networker` are distinct: engagement = reactive (respond to comments), networker = proactive (find communities, post answers).
4. Do not build service files for all four at once. Prioritize: facebook-poster (done) > networker > social-media coordinator > engagement.

---

## Cluster 3: HOA Outreach

### The Problem
Two agents cover HOA outreach with unclear boundaries.

| Agent | Has Handler | Purpose |
|-------|-------------|---------|
| `hoa-outreach-drafter` | Yes (special handler) | Cold outreach to new leads |
| `hoa-email-campaigns` | No (SOUL Only) | Nurture sequences for existing contacts |

### Defined Boundaries
| Aspect | `hoa-outreach-drafter` | `hoa-email-campaigns` |
|--------|----------------------|----------------------|
| Target | New HOA leads (HOT/WARM tier) | Existing contacts who said NOT_NOW |
| Trigger | Pipeline Director dispatches after enrichment | Tenacity Cadence Engine at touch 4+ |
| Content | Personalized 3-email sequences (initial + 2 follow-ups) | Newsletter/nurture content (monthly) |
| Table | `cfo_outreach_sequences` (sequence_type = 'cold') | `cfo_outreach_sequences` (sequence_type = 'nurture') |
| Status | Active | SOUL Only — build when nurture volume warrants |

### Rules
1. `hoa-outreach-drafter` handles all cold outreach. Do not duplicate.
2. `hoa-email-campaigns` is for nurture/newsletter content. Do not build until there are 50+ NOT_NOW HOA contacts to nurture.
3. Both write to the same `cfo_outreach_sequences` table but with different `sequence_type` values.

---

## Cluster 4: Owen + Data Rehab (Dormant Experiments)

### Status
Both are revenue experiments with full SOUL.md personality files but no execution path.

| Group | Agents | SOUL.md | Handler | Service | Last Run |
|-------|--------|---------|---------|---------|----------|
| Owen | owen-content-engine, owen-outreach-agent, owen-social-scheduler | Yes (3) | No | No | Never |
| Data Rehab | data-rehab-scout, data-rehab-content, data-rehab-outreach | Yes (3) | No | No | Never |

### Decision: KEEP, Do Not Schedule, Review at Q2 2026
- **Cost when idle:** $0. Zero risk.
- **Investment preserved:** SOUL.md files represent design thinking about each persona.
- **Activation path:** When Steve decides to test one, build a single handler (e.g., `owen_content_engine`) and schedule a single weekly run to evaluate.
- **Kill criteria:** If not activated by Q2 2026 planning, archive SOUL.md files to `openclaw-skills/_archived/`.

---

*This document is the single source of truth for agent cluster boundaries. Update it before adding, merging, or removing agents in any cluster.*
