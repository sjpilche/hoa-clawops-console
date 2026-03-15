# Founder Profile — Steve Pilcher
*OpenClaw Principal Operator Context File*
*Last updated: 2026-03-13*

---

## IDENTITY

**Name:** Steve Pilcher
**Role:** Founder, Principal Operator, Final Decision Authority
**Background:** Construction industry CFO and operator — finance, operations, ERP systems, business scaling
**Time Zone:** US Mountain Time
**Tone preference:** Concise, direct, no fluff, profit-focused, jokes are fine

---

## MISSION

Build a 24/7 autonomous AI-powered business system that discovers opportunities, automates research, generates leads, launches profitable tools, and scales revenue without Steve having to do repetitive work.

> "Is there a way to turn this insight into revenue? If yes — propose the model, identify the customer, estimate the price, outline how to test it fast."

This is the standing agent mandate. Every agent should apply it to every output.

---

## VALUES

- Speed over perfection
- Execution over theory
- Revenue over vanity metrics
- Leverage over labor
- Boring industries over hype
- Real customers over imaginary ones
- Compounding systems over one-time wins

---

## WORKING STYLE

- High daily engagement — Steve reviews outputs daily
- Rapid iteration — ships fast, adjusts fast
- Technically capable — can read and implement code, deploy systems
- Comfortable with Claude Code, Node.js, Python, SQL, APIs
- Expects agents to default to execution, not ask for permission to think
- Does not want academic summaries — wants actionable next steps

---

## AUTONOMY RULES

### Agents MAY act without asking:
- Research markets, industries, competitors
- Scan for leads, opportunities, inefficiencies
- Collect and score leads
- Draft outreach, content, summaries
- Propose business models and experiments
- Run scheduled tasks and pipelines
- Generate reports and recommendations

### Agents MUST escalate to Steve before:
- Spending money (any API cost outside normal ops)
- Sending external communications (emails, DMs, posts)
- Legal or compliance risks
- Strategic pivots or major architecture changes
- Committing to a new business model or customer segment

---

## TECHNICAL STACK

| Layer | Technology |
|-------|-----------|
| Agent Runtime | OpenClaw CLI v2026.3.x |
| Console | ClawOps Console (Node.js 24 + Express + React 19 + SQLite) |
| LLM Primary | GPT-4o (OpenAI) |
| LLM Local/Free | Ollama — llama3.2:3b at localhost:11434 |
| Scheduling | Custom cron runner (60s tick) — 41 active schedules |
| DB | SQLite (ClawOps) + Azure PostgreSQL (SP-CFO-Agents) |
| Frontend | Vite + React 19 + Tailwind CSS |
| Notifications | Discord webhooks |
| Email | SendGrid |
| Scraping | Playwright (pooled, circuit-breaker) |
| Source Control | Git |

---

## CURRENT PROJECTS

See `current_projects.md` for full detail.

**Active:**
1. ClawOps Console — AI agent operating system (this system)
2. Jake/CFO Marketing Automation — construction CFO SaaS outreach pipeline
3. HOA Project Funding Pipeline — deal sourcing + underwriting automation
4. Data Rehab / ERP Automation — construction data cleanup services
5. Owen CFO — content + thought leadership brand

**Exploring:**
- AI micro-SaaS for construction finance
- HOA capital financing tools
- Autonomous lead generation as a service

---

## RESOURCES AVAILABLE

- OpenClaw agent runtime with 53 configured agents
- Local Ollama inference (free, llama3.2:3b)
- Playwright scraping infrastructure
- SendGrid email (verified sender)
- Discord notification channel
- SQLite + Azure PostgreSQL databases
- GitHub (sjpilche) for publishing
- Netlify for static sites
- OpenAI API (GPT-4o) for high-stakes tasks

---

*Agents: treat this file as ground truth about who Steve is and what he's optimizing for. When in doubt, default to revenue, speed, and leverage.*
