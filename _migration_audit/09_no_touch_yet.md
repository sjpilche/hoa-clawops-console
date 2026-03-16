# 09 — No Touch Yet

Files, folders, systems, and patterns that should NOT be changed, renamed, moved, deleted, or "cleaned up" before migration. Each item includes WHY.

---

## DO NOT MODIFY

### Database Files
| File | Why |
|------|-----|
| `data/clawops.db` | Contains ALL agent state: 7,484+ leads, run history, brain fallback, cadence state, enrichment attempts. Corruption = catastrophic data loss. |
| `services/trader-service/data/trader-brain.sqlite` | Trading brain with learned patterns. Small file but irreplaceable learning state. |
| `hoa_leads.sqlite` | Legacy database — may contain unique lead data not present in clawops.db. Cost of keeping: 1.3 MB. Cost of losing: unknown. |

### Core Logic Files
| File | Why |
|------|-----|
| `server/routes/runs.js` | Contains ALL 41 SPECIAL_HANDLERS. Every handler registration, every dispatch path. Modifying this risks breaking every agent simultaneously. |
| `server/services/collectiveBrain.js` | 4-layer brain with Azure SQL + SQLite fallback logic. One of the most complex files in the system. Any "cleanup" could break cross-agent learning. |
| `server/services/scheduleRunner.js` | 60s heartbeat for 59 schedules. Spend cap logic, duplicate run prevention, lazy handler loading. Change here = change all agent scheduling. |
| `server/services/openclawBridge.js` | LLM agent execution + founder mandate injection. Every LLM agent passes through here. |
| `server/services/postProcessor.js` | Routes LLM output to database tables by agent name pattern. Changing routing logic silently breaks content/outreach storage. |
| `server/services/pipelineDirector.js` | Dispatches to 20+ agents. Hardcoded agent name references. Changing names here without matching seed scripts = silent dispatch failures. |

### Agent Definitions
| File/Directory | Why |
|----------------|-----|
| `scripts/seed-all-agents.js` | Canonical fleet definition (66 agents). Agent names, handlers, groups, descriptions. Changing names here breaks UUID generation, schedule references, postProcessor routing. |
| `scripts/seed-all-schedules.js` | All 59 schedule definitions. Cron expressions, agent references, handler mappings. |
| `openclaw-skills/*/SOUL.md` | Agent personality and instructions. Some SOUL files reference other agents by name. Changing a SOUL file changes agent behavior in production. |
| `founder/agent_mandate.md` | Injected into EVERY LLM agent. Changing this changes all agent behavior simultaneously. |

### Configuration
| File | Why |
|------|-----|
| `.env.local` | 179 lines of secrets. Modify only the machine-specific values (OPENCLAW_PATH) AFTER migration is verified. Do NOT rotate API keys until new machine is confirmed working. |
| `services/trader-service/.env.trader` | Trader service secrets. Same rule. |
| `ecosystem.config.cjs` | PM2 config. Only change the ROOT path AFTER copying to new machine. Do NOT change on current machine. |

---

## DO NOT RENAME

### Agent Names
**Every agent name** in `seed-all-agents.js` generates a deterministic UUID via MD5 hash. Renaming breaks:
1. UUID generation (new hash = new agent record)
2. Schedule references (schedule points to old name)
3. postProcessor routing (pattern-matches agent name)
4. Run history (old runs reference old agent ID)
5. Brain observations (tagged by agent name)
6. SOUL.md file paths (folder = agent name)
7. Pipeline director dispatch targets

### Agent Folders
`openclaw-skills/<agent-name>/` — folder name must match agent name in seed script.

### Handler Names
`special_handler` values in seed-all-agents.js must match `SPECIAL_HANDLERS` keys in runs.js exactly.

---

## DO NOT DELETE

| Item | Why |
|------|-----|
| `backups/` directory | Contains historical DB snapshots. May be needed for disaster recovery. |
| `hoa_leads.sqlite` | Legacy data — cost of keeping is 1.3 MB. |
| Owen/Data Rehab agents | Frozen (enabled=false) but may be reactivated. They share infrastructure with Jake agents. |
| `org/` directory | Agent org chart referenced by dream-team-nightly and documentation. |
| `founder/` directory | 6 files injected into every agent run. |
| `docs/` directory | Reference documentation. May be needed for onboarding on new machine. |
| `memory/` directory | Claude Code conversation memory. Useful for future sessions. |
| `server/db/migrations/` | ALL 34 migration files must be preserved. Missing one breaks schema initialization. |
| `scripts/` directory | 80+ scripts — many look unused but some are called by handlers or used for debugging. |
| `.env.example` | Template for recreating .env.local on new machine. |

---

## DO NOT CONSOLIDATE

### "Duplicate-looking" agents
The 6 ghost CFO agents were already cut in the 2026-03-14 audit (removed from seed-all-agents.js). The remaining agents that look similar (jake-content-engine vs owen-content-engine) are intentionally separate — different SOUL.md, different voice, different target market.

### Service files
Some service files look similar (jakeConstructionDiscovery.js vs googleMapsDiscovery.js). They serve different pipelines with different geo-targets and different output formats. Do NOT merge them.

### Route files
48 route files. Some look like they overlap. They don't — each serves a different UI page or API consumer.

---

## DO NOT RESTRUCTURE

### server/services/ directory
93 files, flat structure. It looks messy. It's not — every file is loaded by name in runs.js SPECIAL_HANDLERS or imported by other services. Moving files into subdirectories breaks all `require()` paths.

### server/routes/ directory
48 files, flat structure. Same reason — server/index.js requires each by exact path.

### openclaw-skills/ directory
66+ directories, flat structure. OpenClaw CLI expects this structure. Nesting agents in subdirectories breaks skill resolution.

---

## Summary Rule

**If you're not sure whether something is safe to change: don't change it.**

In a 66-agent system, "messy" often means "quietly load-bearing." The correct time to clean up is AFTER migration is verified and the system is running on the new machine for at least a week.
