# Marketing Pivot Prompt — Data Rehab / Fractional CFO + AI Automation

Use this prompt with any LLM that has access to the OpenClaw repo.

---

## The Prompt

You are working inside an existing OpenClaw repo — a production Node.js/Express + React 19/Vite application with 114 agents, 88 schedules, and a SQLite + Azure SQL backend. This system is LIVE and running.

**This is NOT a greenfield build. Do NOT propose a rewrite. Do NOT expand scope into replatforming.**

### The Pivot

We are repositioning our external-facing brand from a fragmented multi-brand operation (Jake CFO, HOA Project Funding, Data Rehab as separate products) into a **unified offering**:

**Steve Pilcher — Fractional CFO + AI Automation + Data Cleanup**

The pitch: "I was a CFO for a 20-division construction company for 9 years. I got sick of the manual work, built AI agents that automate financial operations (AR monitoring, cash forecasting, month-end close), and now I bring the whole stack to companies like yours — the finance brain, the automations, and the data cleanup to make it all work."

**Entry points by audience:**
- **Construction companies** → $490 Spend Leak Finder (7 days, CFO + AI agents in your data)
- **SMBs with data chaos** → $4,997 Data Autopsy (2 systems, 5 workflows, 10 data objects, 100% credit if no 3x ROI path found)
- **HOA/Community associations** → Free consult with Steve, the CFO who built the tech
- **Property management** → Frozen for now (Owen brand stays dormant)

### What Already Changed (backend/outreach — DONE, do not redo)

These files have already been updated with the unified pitch. Read them for tone/messaging reference but DO NOT modify:

- `server/services/outreachDrafter.js` — PERSONAS object rewritten (4 personas, unified pitch)
- `server/services/tenacityCadenceEngine.js` — pilot offer hooks updated
- `server/services/leadDossierGenerator.js` — unified pain labels added
- `openclaw-skills/jake-outreach-agent/SOUL.md` — rewritten
- `openclaw-skills/data-rehab-outreach/SOUL.md` — rewritten
- `openclaw-skills/hoa-email-campaigns/SOUL.md` — rewritten
- `openclaw-skills/cfo-content-engine/SOUL.md` — rewritten

### What Needs to Change (your job)

The PUBLIC-FACING surfaces still reflect the old fragmented branding. Here is the complete inventory:

#### 1. Landing Pages (public, no auth required)

| File | Route | Current Brand | What to Do |
|------|-------|---------------|------------|
| `server/public/jake-cfo.html` | `/jake` | "Jake CFO Services" — construction data health check | **Reskin** to unified pitch: Steve Pilcher's fractional CFO + AI practice, entry via $490 Spend Leak Finder. Keep construction-specific pain points. |
| `server/public/data-audit.html` | `/audit` | "Free Data Health Audit" — generic data chaos | **Reskin** to Data Autopsy ($4,997) landing page. Position as entry point to the full CFO + automation stack. August West / Privium Data Services voice. |
| **MISSING** | `/` or `/home` | No public homepage exists | **Create** a unified landing page that presents Steve Pilcher and the full offering: fractional CFO + AI agents + data cleanup. Route to audience-specific entry points. |

#### 2. Login Page & App Chrome

| File | Component | Current Brand | What to Do |
|------|-----------|---------------|------------|
| `src/pages/LoginPage.jsx` | Login screen | "ClawOps — AI-Powered Operations Console" | **Keep as-is.** This is the internal ops dashboard, not customer-facing. ClawOps branding is fine here. |
| `src/components/layout/Sidebar.jsx` | Sidebar nav | "ClawOps CONSOLE v2" | **Keep.** Internal. |
| `src/components/layout/Header.jsx` | Header bar | "ClawOps Console" | **Keep.** Internal. |
| `index.html` | Page title/meta | "ClawOps Console" | **Keep.** Internal dashboard. |

#### 3. Email Templates & Sender Identities

| File | What | Current Brand | What to Do |
|------|------|---------------|------------|
| `server/services/sendgrid.js` — `wrapInBrandedShell()` | HTML email wrapper | "HOA Project Funding" header + footer on ALL emails | **Update**: Create persona-aware branded shell. Jake emails get a "Pilcher Financial" or neutral header. HOA emails keep HOA branding. Data Rehab emails get Privium Data Services branding. |
| `server/services/sendgrid.js` — `SENDER_IDENTITIES` | From addresses | 5 separate identities | **Keep.** Sender domains stay (jakecfo.com, getdatarehab.com, hoaprojectfunding.com). They're authenticated in SendGrid. |
| `server/services/mgmtEmailTemplate.js` | HOA mgmt company emails | "Empire Capital / HOA Project Funding" | **Update**: Add Steve's CFO credibility line. Keep HOA-specific pitch but mention the tech stack behind it. |
| `server/services/fenceEmailTemplate.js` | Terrapin fence/fire emails | "Terrapin Station Community Services" | **Keep for now.** Separate vertical, not part of the CFO pivot. |

#### 4. Public API Endpoints

| File | Endpoint | Current | What to Do |
|------|----------|---------|------------|
| `server/index.js` | `POST /api/jake/public-intake` | Jake landing form handler | **Update** to tag leads with `source: 'unified_landing'` and route to cfo_leads with the new positioning |
| `server/index.js` | `POST /api/data-audit/public` | Data audit form handler | **Update** to tag as Data Autopsy leads, route to cfo_leads with `product: 'data_rehab'` |
| `server/routes/leadCapture.js` | `POST /api/capture/lead` | Generic lead capture | **Keep.** Already product-aware via UTM params. |

#### 5. SEO / Metadata / Assets

| File | What | What to Do |
|------|------|------------|
| `public/favicon.svg` | ClawOps "C" logo | **Keep.** Internal dashboard. |
| `package.json` | name: "clawops-console" | **Keep.** Internal. |
| `.env.marketing.template` | WordPress = hoaprojectfunding.com, keywords = "HOA financing" | **Update**: Add Data Rehab and unified CFO keywords. Multi-site config if needed. |

### Brand Conflict Map

| Surface | Old Message | New Message | Risk if Not Changed |
|---------|-------------|-------------|-------------------|
| Jake landing page | "Stop Losing Money to Messy Construction Data" (niche product) | "A Real CFO + AI Agents in Your Data for 7 Days — $490" (entry to full practice) | Prospects see a niche consultancy, not a tech-enabled CFO practice. Undersells the offering. |
| Data audit page | "Free Data Health Audit" (generic, no pricing, no brand) | "$4,997 Data Autopsy — 2 systems, 5 workflows, 100% credit guarantee" (Privium Data Services) | Free audit attracts tire-kickers. Paid Autopsy attracts buyers. |
| Email wrapper | HOA Project Funding on ALL emails (including Jake/Data Rehab) | Persona-aware branding per email domain | Jake leads get HOA branding — confusing and off-brand. Damages trust. |
| Mgmt email template | "Empire Capital is a tech-enabled HOA financing platform" | "Steve Pilcher built the technology stack that modernizes community operations — and the CFO practice behind it" | Legacy positioning that doesn't mention AI or automation. Misses the new value prop. |
| No public homepage | N/A | Unified landing: Steve Pilcher's practice, three entry points | No front door to the business. Every brand is an island. |

### Implementation Priority (do these in order)

1. **Email branded shell** — every outgoing email carries branding. Highest volume, highest impact. Make it persona-aware.
2. **Jake landing page reskin** — construction is the primary pipeline. Update headline, pitch, CTA to unified offering.
3. **Data audit → Data Autopsy page** — paid entry point. Add pricing, guarantee, Privium branding.
4. **Create unified homepage** — simple: Steve's story, three audience entry points, one trust narrative.
5. **Mgmt email template** — add Steve's credibility, mention the tech stack.
6. **Marketing env template** — update keywords, add multi-brand config.

### Voice & Tone Reference

Read these files for the approved voice:
- `server/services/outreachDrafter.js` lines 304-321 (PERSONAS) — the LLM system prompts
- `openclaw-skills/cfo-content-engine/SOUL.md` — Steve Pilcher's content voice (most authoritative)
- `openclaw-skills/data-rehab-outreach/SOUL.md` — August West / Privium voice

**Universal rules (all brands):**
- Never use: "revolutionary", "AI-powered", "game-changing", "transform", "leverage", "synergy"
- Lead with specific pain, pivot to the full stack
- Peer-to-peer tone, not vendor-to-prospect
- Real numbers (5-7% MAPE, $490, $4,997, 7 days, 20 divisions)
- The Trust Envelope: "I'm sharing this because [real reason]. If it doesn't work for your situation, I'd rather you know that upfront."

### Constraints

- Do NOT modify any files listed in "What Already Changed"
- Do NOT touch internal dashboard components (Sidebar, Header, login page, nav)
- Do NOT change sender email domains — they're DNS-authenticated in SendGrid
- Do NOT add new npm dependencies without justification
- Do NOT create new database tables — use existing `cfo_leads`, `cfo_outreach_sequences`, `audit_log`
- Keep all existing routes functional — add new ones alongside, don't replace
- Owen brand stays FROZEN — do not create Owen marketing surfaces

### Output Expected

For each file you modify or create:
1. The exact file path
2. What changed and why
3. Before/after for key copy (headlines, CTAs, meta descriptions)
4. Any new routes that need registration in `server/index.js`
