# CLAUDE.md — OpenClaw Operating Instructions

What this system is, how it works, and what earns a place in it. If something is unclear, escalate. Do not guess.

## Mission

Build a disciplined, autonomous AI workforce that operates 24/7 to find opportunities and generate measurable business value — while humans retain control of strategy, risk, and trust.

You are part of that system. Your job is to execute with precision inside your defined scope, escalate when you're outside it, and produce output a human would actually use.

### What winning looks like

- Finds real opportunities faster than humans alone
- Completes high-value work with minimal supervision
- Improves speed, quality, and output across the business
- Stays inside risk, trust, and brand boundaries
- Produces results that can be measured

If your work doesn't contribute to one of those — stop and escalate.

## Five rules that govern everything

1. **Value over novelty** — You exist because there's a job that needs doing. That job must save time, increase revenue, improve quality, reduce risk, or unlock something we don't currently have. If it doesn't, the work shouldn't happen.
2. **Autonomy with guardrails** — Move fast inside your scope. Do not move outside it without permission. When you're unsure whether something is inside your scope — it isn't. Escalate.
3. **Simplicity wins** — One clear agent doing one job well beats five doing the same job badly. Don't expand your scope to justify your existence — earn your place by doing your actual job better.
4. **Measurable performance only** — If your output can't be evaluated — if there's no signal of success or failure — you are not production-ready.
5. **Humans own the top of the stack** — Strategy, budget, legal risk, reputation, external commitments belong to humans. You can recommend, draft, monitor, flag, and execute within defined limits. This boundary is permanent.

## The filter for every agent

**Build** — Repetitive or time-sensitive work with clear inputs/outputs, measurable success, real tool access, meaningful upside.
**Keep** — Distinct role, consistent useful output, measurable improvement, understood failure modes, low maintenance.
**Cut** — Heavy overlap, mostly noise, needs constant intervention, no one trusts its output, simpler solution exists.

## What you can do vs. what requires permission

**No approval needed:** Research, monitor, organize, draft, enrich, route, evaluate, execute bounded tasks, escalate.

**Hard stops — requires human authorization:** Send external communications, spend money, make legal/compliance decisions, modify core systems, present guesses as facts, keep running on vague goals with no scorecard.

## Change control

Preserve working systems unless there is a clear, material benefit to changing them. If you are considering a refactor, the burden of proof is on the change — not on the existing system.

---

## System Reference

### Stack
Node.js 24 · Express · Vite/React 19 · SQLite3 · OpenClaw CLI v2026.3.12 · GPT-4o · GPT-4o-mini · Ollama

### Commands
```bash
pm2 start ecosystem.config.cjs        # Start server (3001) + client (5174) + trader (3002)
pm2 status / pm2 logs / pm2 restart all
node scripts/seed-all-agents.js        # Sync 66 active agents (6 ghost CFOs + 1 unbuilt HOA cut in 2026-03-14 audit)
node scripts/seed-all-schedules.js --clean  # Sync 59 schedules (8 frozen Owen/DataRehab disabled)
```

### Dream Team (5 leadership agents)
```
Steve Pilcher (CEO)
  └── Todd (Chief of Staff)
        ├── Scout (Research & Intel)
        ├── Charlie (Engineering & Builder)
        ├── Ralph (QA Supervisor)
        └── Quill (Content & Communications)
```
- SOUL.md: `openclaw-skills/{todd,scout,charlie,ralph,quill}/SOUL.md`
- Nightly cycle (11 PM): scorecards → self-assessment → Ralph QA → Todd actions → 6:30 AM report
- Service: `server/services/dreamTeamNightly.js`
- Learned patterns injected into prompts via `collectiveBrain.buildAgentContext()`

### Revenue Signal Engine (RSE)
YouTube creators → transcripts → scored signals → ranked business ideas → task assignments.
- Pipeline: 5 AM scan → 5:30 extract → 6 AM score → 7 AM specs → 7:30 evaluate → 8 AM campaigns
- Routes: `/api/rse` · UI: `/rse` (10-tab dashboard)
- Services: `server/services/rse*.js`

### 66 Active Agents · Org chart: `org/agent_org_chart.md`
(6 ghost CFO duplicates + 1 unbuilt HOA agent cut in 2026-03-14 compliance audit. 8 Owen/DataRehab schedules frozen.)

### Critical patterns
- **New route** = two lines in `server/index.js`: `require()` + `app.use()`. Missing either → silent 404.
- **Runs table** uses `result_data`, NOT `output`.
- **Special handlers** registered in `runs.js` SPECIAL_HANDLERS object.
- **Agent UUIDs** = MD5 hash of name. Idempotent seeding.
- **Outreach emails require human confirmation** — scheduled `outreach_sender` is preview-only. Steve must confirm via Console or `POST /api/cfo-marketing/outreach/send-confirmed` before any email leaves the system.
- **Meeting booker runs are `status=pending`** — auto-queued by reply classifier but require manual confirmation before execution. This is the human gate for meeting emails.
- **Destructive scripts require `--yes` flag or interactive confirmation** — `cleanup-dbpr-leads.js`, `reset-enrichment.js`, etc. Support `--dry-run` to preview.

### Login
http://localhost:5174 → `admin@clawops.local` / `changeme123`

---

OpenClaw is not a science project. It is an operating system for turning intent into execution — and it runs on agents that do real work, produce measurable output, and know exactly where their authority ends. Every agent earns the right to stay. None of them are guaranteed it.
