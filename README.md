# ClawOps Console

> **AI agent operations platform for construction company marketing automation**
> Node.js 24 · React 19 · SQLite · OpenClaw CLI · GPT-4o · Playwright

---

## What Is This?

**ClawOps Console** is a self-hosted AI agent platform that runs two parallel marketing machines for construction industry businesses:

1. **Jake** — Construction finance software (CFO/Controller audience, SMB contractors $5M–$50M)
2. **HOA Project Funding** — HOA reserve loan brokering (hoaprojectfunding.com)

The platform automates the entire marketing funnel — discovery → enrichment → outreach → follow-up → close — using 50+ agents that run on a schedule with zero human touch required for routine work. Total operating cost: ~$20–25/month.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (minimum: OPENAI_API_KEY, JWT_SECRET, SENDGRID_API_KEY)
cp .env.example .env.local

# 3. Seed agents into DB
node scripts/seed-all-agents.js

# 4. Start everything
npm run dev
# → Backend:  http://localhost:3001
# → Frontend: http://localhost:5174
```

**Login:** `admin@clawops.local` / `changeme123`

**Kill stale node processes:**
```bash
powershell -Command "Get-Process node | Stop-Process -Force"
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite + Tailwind CSS v4 |
| State | Zustand v5 + TanStack Query v5 |
| Realtime | Socket.io 4.8 |
| Backend | Express 5.2 (Node.js 24) |
| Database | SQLite (sql.js) — single file, zero config |
| Auth | JWT + bcrypt |
| AI | OpenAI GPT-4o via OpenClaw CLI |
| Scraping | Playwright 1.58 (headless Chrome) |
| Email | SendGrid |
| Notifications | Discord Webhooks |
| Publishing | GitHub API → Netlify |

---

## Agent Fleet (50+ Agents)

Agents fall into two execution types:
- **LLM agents** — OpenClaw CLI → GPT-4o, ~$0.01–$0.03/run
- **Special handlers** — pure Node.js/Playwright, $0/run

### By Group

| Group | Count | Purpose |
|-------|-------|---------|
| Jake Marketing (Core Brand) | 7 | Content, outreach, social for Jake product |
| Jake Marketing (CFO Brand) | 7 | Same capabilities, Steve Pilcher voice |
| Jake Pipeline | 8 | Discovery → enrichment → follow-up → CRM |
| Jake Intel | 3 | Competitor signals, pain monitors, LinkedIn |
| Jake Social | 2 | Twitter, SMS follow-up |
| HOA Marketing | 8 | Blog, CMS, social, Facebook, email campaigns |
| HOA Pipeline | 5 | Discovery → contact finding → enrichment → outreach |
| HOA Intel | 2 | Minutes monitor, Google reviews monitor |
| Management Research | 5 | Portfolio scraping, contact pulling, review scanning |
| Core | 3 | Chat router, daily debrief, morning digest |

**Full agent list:** [docs/MASTER_OVERVIEW.md](docs/MASTER_OVERVIEW.md)

---

## How It Works

### End-to-End Funnel
```
DISCOVERY     → Google Maps scraper finds GC companies or HOA communities
ENRICHMENT    → 5-step waterfall finds decision-maker email + phone ($0)
OUTREACH      → LLM agent writes personalized cold email
SEND          → Human approves → SendGrid sends
FOLLOW-UP     → 5+ day no reply → auto-draft follow-up
CLASSIFY      → Inbound reply → INTERESTED / NOT_NOW / BOUNCED ($0, instant)
BOOK MEETING  → Draft meeting confirmation for interested leads
CRM SYNC      → Export replied/interested leads to Google Sheets or CSV
```

### Content Pipeline
```
CONTENT ENGINE → Writes blog post or LinkedIn article (Mon AM)
CMS PUBLISHER  → GitHub push → Netlify auto-deploy
SOCIAL         → Converts to FB/LinkedIn/Twitter posts
REPURPOSER     → 1 piece → 5 derivatives
```

### Collective Brain (Cross-Agent Learning)
Agents share a 4-layer learning system so every run is smarter than the last:
- **Layer 1** — Observations (real-time signals from runs)
- **Layer 2** — Feedback (manual approve/reject in UI)
- **Layer 3** — Episodes (outcome snapshots with scores)
- **Layer 4** — Knowledge Base (nightly distillation at 2 AM)

Brain context is automatically prepended to every scheduled LLM run.

---

## Automatic Schedule (No Human Touch)

```
Mon 6:00 AM   jake-construction-discovery   Google Maps GC scraper
Mon 7:00 AM   jake-lead-scout               LLM national lead scout (60-market rotation)
Mon 8:00 AM   hoa-content-writer + enricher Blog post + contact enrichment
Mon 8:30 AM   hoa-cms-publisher             GitHub → Netlify deploy
Mon 9:00 AM   jake-content-engine           LinkedIn article
Mon/Wed/Fri 9 AM  tenacity-cadence          Adaptive cadence cycle (12-touch)
Daily 7 AM    morning-digest                Discord stats digest
Daily 10 AM   hoa-facebook-poster           Facebook page post
Daily 6 PM    daily-debrief                 War room report (M-F)
Wed/Fri 9 AM  jake-follow-up-agent          Follow-ups for no-reply leads
Daily 2 AM    brain-distillation            Nightly KB update
```

---

## Key Files

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Developer quick-reference — stack, commands, architecture rules |
| `server/index.js` | Entry point — ALL routes registered here |
| `server/routes/runs.js` | Confirmation gate + all 30+ SPECIAL_HANDLERS |
| `server/services/scheduleRunner.js` | Cron engine, 60s heartbeat, brain injection |
| `server/services/postProcessor.js` | Routes LLM output to right DB tables |
| `server/services/openclawBridge.js` | OpenClaw CLI spawner + output parser |
| `server/services/collectiveBrain.js` | 4-layer learning — Azure SQL + SQLite fallback |
| `server/db/schema.sql` | Full SQLite schema (40+ tables) |
| `openclaw-skills/{name}/SOUL.md` | Agent personality files |
| `scripts/seed-all-agents.js` | Seeds all agents to DB (idempotent) |
| `.env.local` | All secrets — never committed |

---

## Documentation

| Document | Description |
|----------|-------------|
| [docs/MASTER_OVERVIEW.md](docs/MASTER_OVERVIEW.md) | Full system reference — agents, pipelines, brain, architecture |
| [STATUS.md](STATUS.md) | Current system health and what's live |
| [CLAUDE.md](CLAUDE.md) | Developer quick-reference |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System diagrams |
| [docs/API-REFERENCE.md](docs/API-REFERENCE.md) | API endpoints |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common issues and fixes |
| [docs/jake-marketing-playbook.md](docs/jake-marketing-playbook.md) | Jake GTM playbook |
| [HOA-AGENT-FLEET-INDEX.md](HOA-AGENT-FLEET-INDEX.md) | HOA agent deep dive |
| [CHIEF_OF_STAFF_GUIDE.md](CHIEF_OF_STAFF_GUIDE.md) | Business operations guide |

---

## Security

- JWT + bcrypt auth with rate limiting
- CVSS 9.8 command injection patched (Feb 2026)
- 32+ Zod validation schemas (100% API coverage)
- All agent runs go through confirmation gate (manual) or spend cap guard (scheduled)
- Audit log table tracks every significant action

---

*ClawOps Console v2.1 — Jake Marketing + HOA Project Funding | March 2026*
