# ClawOps Console

> **Multi-tenant campaign management platform for HOA lead generation & marketing automation**
> Built with React + Express + OpenClaw + OpenAI GPT-4o

## What Is This?

**ClawOps Console** is an enterprise-grade platform for orchestrating autonomous AI agents that discover, score, enrich, and convert HOA community leads. Each campaign runs in complete table-level isolation, enabling multiple "completely different products in full different ecosystems" under one platform.

### Key Capabilities
- **🔍 Discovery:** Scrape Google Maps, public records, and directories to find HOA communities
- **📊 Scoring:** Analyze meeting minutes and Google reviews to identify hot leads
- **🔗 Enrichment:** Scrape websites and public records for contact data
- **✉️ Outreach:** Generate personalized email/LinkedIn templates
- **📝 Content:** Automated blog writing + GitHub → Netlify publishing
- **📱 Social:** Facebook posting, engagement monitoring, content queue management

## Tech Stack

| Layer        | Technology              | Why                                  |
| ------------ | ----------------------- | ------------------------------------ |
| Frontend     | React 18 + Vite         | Fast, familiar, battle-tested        |
| Styling      | Tailwind CSS + shadcn   | Same stack as HOA Project Intake     |
| State        | Zustand                 | Simple state, zero boilerplate       |
| Data Fetch   | TanStack Query v5       | Caching, retries, real-time sync     |
| Routing      | React Router v6         | Standard React routing               |
| Forms        | React Hook Form + Zod   | Validated forms with type safety     |
| WebSockets   | Socket.io               | Real-time agent status + logs        |
| Charts       | Recharts                | Agent performance visualization      |
| Backend      | Express (Node.js)       | Thin BFF proxy layer                 |
| Database     | SQLite (sql.js)         | Local-first, zero config             |
| Auth         | JWT + bcrypt            | Simple local auth                    |

## 🚀 Quick Start (5 Minutes)

### Prerequisites
- **Node.js 18+** ([download](https://nodejs.org))
- **OpenAI API Key** (get from [platform.openai.com](https://platform.openai.com))

### Installation

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local and add your OPENAI_API_KEY

# 3. Start the console
npm run dev
```

This starts:
- **Backend API:** http://localhost:3001
- **Frontend UI:** http://localhost:5174
- **Trader Service:** http://localhost:3002 (optional)

### Login
Open http://localhost:5174 and login with:
- **Email:** admin@clawops.local
- **Password:** changeme123

### First Steps
1. **View agents:** Click "Agents" in sidebar (12 pre-configured agents ready)
2. **Run an agent manually:** `node scripts/run-hoa-discovery.js`
3. **View status:** Check [STATUS.md](STATUS.md) for system health
4. **See docs:** Browse [docs/](docs/) for detailed guides

## 🏗️ Architecture

### Tech Stack
| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | React 19 + Vite + Tailwind | Fast, modern UI |
| **Backend** | Express 5 + Node.js | API server |
| **Database** | SQLite | Local-first, zero config |
| **AI** | OpenAI GPT-4o | Agent intelligence (~$0.025/run) |
| **Auth** | JWT + bcrypt | Local authentication |
| **Real-time** | Socket.io | Agent status updates |

### Multi-Tenant Architecture
Each campaign gets **isolated database tables**:
```
Campaign: hoa-fl-lead-gen
├── hoa_fl_lead_gen_leads
├── hoa_fl_lead_gen_runs
├── hoa_fl_lead_gen_content_queue
└── hoa_fl_lead_gen_hoa_contacts

Campaign: saas-outreach
├── saas_outreach_leads
├── saas_outreach_runs
└── ... (separate ecosystem)
```

**Benefit:** Complete data isolation — impossible to accidentally query wrong campaign.

### Agent Fleet (12 Active)

#### Marketing Team (7 agents)
1. ✅ **hoa-content-writer** — SEO blog posts
2. ✅ **hoa-cms-publisher** — GitHub → Netlify deployment
3. ✅ **hoa-social-media** — Social post generation
4. ✅ **hoa-social-engagement** — Comment automation
5. ✅ **hoa-networker** — LinkedIn outreach
6. ✅ **hoa-email-campaigns** — Email sequences
7. ✅ **hoa-facebook-poster** — Content queue publishing

#### Lead Gen Pipeline (5 agents)
1. ✅ **hoa-discovery** — Google Maps scraping
2. ✅ **hoa-minutes-monitor** — Meeting minutes analysis
3. ✅ **google-reviews-monitor** — Sentiment scoring
4. ✅ **hoa-contact-enricher** — Web scraping for contacts
5. ✅ **hoa-outreach-drafter** — Personalized templates

**See:** [HOA-AGENT-FLEET-INDEX.md](HOA-AGENT-FLEET-INDEX.md) for full details.

---

## 📊 Current Status

**Version:** 1.0 (Production Ready)
**Security Score:** 85/100 (95/100 with HTTPS)
**Test Coverage:** 21/22 tests passing (95%)
**Monthly Cost:** $20-25 (OpenAI + Apify)

✅ All 12 agents operational
✅ Table-level campaign isolation complete
✅ Security hardening complete (CVSS 9.8 vulnerabilities fixed)
✅ Automated blog publishing pipeline live
✅ Facebook integration working

**See:** [STATUS.md](STATUS.md) for detailed system health.

---

## 📚 Documentation

| File | Description |
|------|-------------|
| [STATUS.md](STATUS.md) | Current system health & metrics |
| [ROADMAP.md](ROADMAP.md) | Future development plans |
| [HOA-AGENT-FLEET-INDEX.md](HOA-AGENT-FLEET-INDEX.md) | Complete agent reference |
| [HOA-LEADS-CONSOLE-GUIDE.md](HOA-LEADS-CONSOLE-GUIDE.md) | Lead gen workflow guide |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Technical deep dive |
| [docs/API-REFERENCE.md](docs/API-REFERENCE.md) | API endpoints |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common issues |

---

## 🔒 Security

**Recent Fixes (Feb 2026):**
- ✅ CVSS 9.8 command injection vulnerability patched
- ✅ CVSS 9.1 weak JWT secret replaced (128-char cryptographic)
- ✅ 32+ Zod validation schemas (100% API coverage)
- ✅ 17/17 security tests passing

**See:** `docs/archive/history/2026-02-17-completion/SECURITY-PHASE1-COMPLETE.md` for details.
