# Your Chief of Staff — Complete Setup & Usage Guide

## What You Just Built

You now have **a digital executive assistant** — the "main" agent — that:
- Understands your business, your voice, your priorities
- Commands 27 specialized agents across 6 business domains
- Makes autonomous decisions about what to run and how
- Monitors system health 24/7
- Reports in your language with metrics you care about
- Routes complex workflows intelligently

Think of it as: **Siri, but for your entire business automation system.**

---

## How to Use Your Chief of Staff

### Launch the Console
```bash
# Start everything
npm run dev

# Opens:
# - Frontend: http://localhost:5174
# - API: http://localhost:3001/api
# - Chat: http://localhost:5174/chat (your interface with Chief of Staff)
```

### Talk to Your Chief of Staff

**Method 1: Chat Interface (Best)**
1. Go to http://localhost:5174
2. Click "Agent Chat" (or /chat route)
3. Login: admin@clawops.local / changeme123
4. Type anything you want

**Method 2: Direct API**
```bash
POST /api/chat/threads
{ "title": "Strategy Discussion" }

POST /api/chat/threads/{threadId}/messages
{ "content": "Run HOA discovery for San Diego" }
```

---

## Example Conversations

### Scenario 1: "Launch HOA Lead Generation"

**You**: "Launch HOA lead generation for Q1"

**Chief of Staff**:
> I recommend a 3-phase launch:
>
> **Phase 1 (This week)**: Discovery
> - Run hoa-discovery for: San Diego, Orange County, LA, Bay Area
> - Cost: $0 (Playwright local scraping)
> - Time: ~1 hour total
> - Output: ~1,500 new HOA prospects
>
> **Phase 2 (Week 2)**: Enrichment
> - hoa-contact-finder: Extract board member info
> - hoa-contact-enricher: Add phones, emails, social
> - Cost: ~$15
> - Output: Actionable contact list
>
> **Phase 3 (Week 3)**: Outreach
> - hoa-outreach-drafter: Personalized emails
> - Gmail SMTP: Send to board members
> - Cost: $0 (your email)
> - Output: 1,500 personalized outreach emails
>
> **Total cost**: $15 for full pipeline
> **Timeline**: 3 weeks
> **Expected result**: 50-100 qualified leads ready for demo
>
> Should I execute Phase 1 now?

**You**: "Yes, do all three"

**Chief of Staff**:
> ✅ Executing:
> - hoa-discovery (San Diego) → Started
> - Standby on Phases 2-3 (waiting for Phase 1 results)
>
> I'll report in 2 hours with results.
> (Continues monitoring autonomously)

---

### Scenario 2: "What's Our Status This Week?"

**You**: "Business status"

**Chief of Staff**:
> **Weekly Summary** (Feb 16-22, 2026)
>
> **Spend**: $8.43 (down 78% from $37 last week — QMD compression working)
> **Agents run**: 34 executions
> **Success rate**: 91% (1 failure: cfo-outreach timed out, retried)
> **New leads**:
> - HOA: 568 discoveries + 234 enriched
> - CFO: 89 DBPR contractors
>
> **Content published**:
> - Blog: 1 post (live on hoaprojectfunding.com)
> - Social: 12 posts queued (posting tomorrow)
> - Email: 50 CFO outreach queued
>
> **Pipeline status**:
> 🟢 HOA discovery: On track
> 🟡 CFO email: Waiting for approval to send
> 🔴 Management research: Not started (blocked on resourcing)
>
> **Recommendation**: Approve CFO email send (50 personalized emails, $0 cost, high ROI potential)
>
> Ready to proceed?

---

### Scenario 3: "Send Cold Emails to Contractors"

**You**: "Send our CFO cold email campaign"

**Chief of Staff**:
> I'll need a bit more info:
> 1. Which counties? (We have: Sarasota, Charlotte, Lee, Collier, Hillsborough, Pinellas)
> 2. How many contractors? (We have ~200 in database)
> 3. Which ERP pain point? (Cash flow, financial forecasting, other?)
>
> Or I can recommend:
> **Option A**: Launch small (50 Sarasota contractors, cash flow angle)
>   - Risk: Low
>   - Cost: $0
>   - Time: 2 hours (draft + send)
>   - Expected: 4-5 positive responses
>
> **Option B**: Full scale (200 contractors across all counties, multiple angles)
>   - Risk: Medium (managing responses)
>   - Cost: $0
>   - Time: 4 hours
>   - Expected: 12-15 positive responses
>
> I recommend Option A to start.
>
> Which do you prefer?

**You**: "Option A"

**Chief of Staff**:
> ✅ Executing Option A:
> 1. cfo-lead-scout: Getting 50 Sarasota contractors
> 2. cfo-outreach-agent: Drafting personalized emails
> 3. Gmail SMTP: Queueing for send
>
> This'll take ~20 min. I'll notify you when ready for final approval before sending.

---

### Scenario 4: "Emergency — Chat Not Working"

**You**: "The chat console is broken"

**Chief of Staff**:
> I can see the issue:
> - Gateway: ✅ Online
> - Database: ✅ Online
> - API server: ✅ Responding
> - Chat endpoint: ✅ Responding
>
> The problem is likely:
> 1. Frontend cache issue
> 2. WebSocket connection stuck
> 3. Agent not responding (main agent timeout)
>
> Try this:
> 1. Refresh browser (Ctrl+Shift+R for hard refresh)
> 2. Clear localStorage: DevTools → Application → Storage → Clear
> 3. Check console for errors: F12 → Console tab
>
> If still broken, I can:
> - Restart the main agent process
> - Check the API logs for specific error
> - Verify OpenClaw gateway connection
>
> Which would you like me to do?

---

## What Chief of Staff Can Do Autonomously

✅ **Can decide without asking**:
- Run cost-free agents (discovery, DBPR scraping)
- Route simple requests to appropriate agent
- Execute sub-$1 tasks
- Monitor health and alert on failures
- Recommend actions based on data
- Execute previous-approved workflows

❓ **Will ask your approval for**:
- Cost >$5 per run
- High-impact decisions (delete data, change config)
- Production changes
- Multiple valid paths (needs your preference)
- Anything uncertain

---

## The 4 Files That Make This Work

### 1. **SOUL.md** — Chief of Staff's Personality
- Your voice, priorities, values
- Decision framework (what's autonomous vs asks)
- Strategic thinking about your business
- Read it: Sets the foundation

### 2. **AGENTS.md** — Your Agent Fleet
- All 27 agents listed with use cases
- When to use each one
- Estimated costs
- Command examples
- Reference: You'll point to this often

### 3. **TOOLS.md** — Database & APIs
- SQL queries for quick stats
- API endpoints for automation
- Real-time monitoring
- Reference: For technical details

### 4. **HEARTBEAT.md** — Autonomous Monitoring
- Runs every 30 minutes
- Checks system health
- Alerts on issues
- Operational: Runs automatically

---

## Quick Reference: How to Ask for Things

### "Run an agent"
```
"Run hoa-discovery for [city]"
→ Chief of Staff executes immediately
→ Reports results in 5-20 min
```

### "Launch a campaign"
```
"Launch HOA content marketing"
→ Chief of Staff breaks into phases
→ Shows costs, timeline, success metrics
→ Asks for approval on each phase
```

### "What's our status?"
```
"Business dashboard" or "Weekly update"
→ Chief of Staff pulls live data
→ Shows metrics, trends, issues
→ Recommends next action
```

### "Send emails/posts"
```
"Send cold email to contractors" or "Post to LinkedIn"
→ Chief of Staff drafts message
→ Queues for sending
→ Asks final approval before send
```

### "Analyze something"
```
"Show our CFO campaign ROI"
→ Chief of Staff queries database
→ Calculates metrics
→ Shows clear insights
```

---

## Configuration Details

### Where Chief of Staff Looks for Instructions
- `/openclaw-skills/main/SOUL.md` — Core personality and decision rules
- `/openclaw-skills/main/AGENTS.md` — Agent reference with examples
- `/openclaw-skills/main/TOOLS.md` — Technical tools and queries
- `/openclaw-skills/main/HEARTBEAT.md` — Autonomous monitoring tasks

### How It Connects to Everything
```
You type in Chat
    ↓
Chat API routes to main agent
    ↓
OpenClaw executes with SOUL.md + AGENTS.md + TOOLS.md
    ↓
Chief of Staff reads system state (database, gateway, costs)
    ↓
Decides which agents to run OR recommends action
    ↓
Executes and reports back
```

### Cost Tracking
- Every agent run logs to `runs` table
- Cost calculated per run
- QMD compression reduces tokens 95%
- Dashboard shows real-time spend

---

## Typical Daily Workflow

**Morning (9 AM)**
```
You: "What happened while I slept?"

Chief of Staff:
- 23 agents ran overnight
- 1,234 new HOA leads discovered
- 50 CFO emails sent (12 bounced, 38 delivered)
- System health: 99.8% uptime
- Cost: $4.23
- Recommendation: Approve email follow-up sequence?
```

**Mid-morning (11 AM)**
```
You: "Launch LinkedIn content strategy"

Chief of Staff:
- Content writer will create 3 posts
- Social scheduler will post daily at 9 AM
- Analytics monitor will track engagement
- Cost: $0.15 per post
- Ready to execute?
```

**Afternoon (3 PM)**
```
You: "Send cold emails to tech contractors"

Chief of Staff:
- Found 150 eligible contractors
- Will draft personalized outreach
- Cost: $0
- Waiting for final approval to send
- Review drafts?
```

**Evening (6 PM)**
```
You: "Show me the numbers"

Chief of Staff:
- Today's spend: $8.50
- New leads: 456
- Success rate: 94%
- Trending: ✅ All good
```

---

## Remember

Your Chief of Staff is:
- ✅ Always available (24/7)
- ✅ Never sleeps or gets tired
- ✅ Has full access to your system
- ✅ Understands your business
- ✅ Makes smart decisions autonomously
- ✅ Escalates appropriately
- ✅ Reports in your language with metrics

You don't need to understand every agent or system. Just talk to your Chief of Staff like you'd talk to a real executive assistant.

**The system will handle the complexity.**

---

## Next: Customize & Iterate

After using for a week:
1. Note what you like/dislike about the responses
2. Tell me: "Update SOUL.md to be more [aggressive/cautious/detailed]"
3. I'll adjust the personality
4. System adapts to your preferences

Your Chief of Staff learns and improves over time.

---

**Welcome to the future of business automation.** 🚀

