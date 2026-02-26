# Jake Marketing — Human Operator Playbook

## The Mission
Get 5 paying construction CFO clients. Every agent and every hour should push toward that number. This playbook tells you exactly what to do each day, when to trust the machines, and when to step in yourself.

---

## Weekly Rhythm

### Monday — Launch Week
**8:00 AM — Blitz Jake**
Open `http://localhost:5174/blitz`, select **Jake**, hit Run. This fires all 14 agents simultaneously — lead scout, content engine, outreach agent, social scheduler, analytics.

**8:30 AM — Review outputs in Jake Marketing**
Open `/jake-marketing`. You'll have:
- New leads from lead scout (check score — anything 70+ is priority)
- Content drafts (LinkedIn posts, blog articles) waiting for approval
- Outreach email drafts tied to specific leads

**9:00 AM — Human gate on content (15 min max)**
For each content piece, ask one question: *Would a frustrated construction CFO read this and think "finally, someone who gets it"?* Yes → Approve. No → trash it or edit the headline. Don't spend more than 2 minutes per piece.

**9:30 AM — Human gate on outreach (30 min)**
For each outreach draft:
1. Read it. Does it sound like Jake or like a salesperson?
2. Google the company — are they actually a GC? Do they look like they're running on QB or Excel?
3. If yes to both → Approve and send.
4. If no → skip, move on.

**Goal by end of Monday:** 5 outreach emails sent to real, verified targets.

---

### Tuesday–Thursday — Pipeline Work
**Daily (20 min)**
- Check `/jake-marketing` → Outreach tab → filter by "Replied"
- Any replies? That's your **only job today** — respond personally, not through the agents.
- A reply means a human is interested. Do NOT run agents on it. You pick up the phone or email back yourself.

**Content approval (10 min)**
Approve or trash whatever the scheduled agents generated overnight. Don't overthink it.

---

### Friday — Debrief + Calibrate (30 min)
Run the `daily-debrief` agent from `/agents` → gives you the war room summary: how many emails sent, leads added, content published, costs incurred.

Answer these 3 questions yourself:
1. How many replies did we get this week? (Goal: 1 per 10 emails sent)
2. Which content piece got the most engagement if posted? (Feed that pillar back into next week's Blitz prompt)
3. Is there a pattern in who's NOT replying? (Too small? Wrong geography? Wrong ERP type?)

Adjust next Monday's Blitz prompt accordingly.

---

## The Lead Qualification Filter

The lead scout generates more leads than you can work. Use this filter — spend human time only on leads that pass all 3:

| Check | What to Look For |
|-------|-----------------|
| **Company size** | $5M–$75M revenue GC or sub. No custom home builders, no property management. |
| **Pain signal** | Any of: using QB or Business Central, 5+ years old, construction only (not diversified). Google them — look for chaos signals (slow website, old LinkedIn, no tech job postings). |
| **Contact exists** | A real name + title (CFO, Controller, Owner, VP Finance). No "info@" or generic contacts. |

If a lead passes all 3 → it gets a personalized outreach. If it fails any → archive it without guilt.

---

## The Outreach Review Checklist

Before you approve and send any outreach email the agent drafts:

- [ ] Does the opening reference their **specific situation** (company name, location, likely ERP)?
- [ ] Does it name one **concrete pain** they probably have right now?
- [ ] Is the CTA a **free health check** — not a demo, not a pitch?
- [ ] Is it under **200 words**?
- [ ] Does it sound like **Jake talking to a peer**, not a vendor talking to a prospect?
- [ ] No buzzwords: "AI-powered", "transform", "leverage", "cutting-edge"

Fail any box → rewrite that section yourself or discard. The agent is your first draft, not your final word.

---

## When a Prospect Replies

This is the moment everything was built for. The agents stop. You start.

**Reply protocol (within 2 hours):**

1. **Acknowledge the specific thing they said** — not a template. If they said "yeah our QB data is a mess," say "QB messes are exactly why we built this."

2. **Offer the free data health check** — 30 minutes, no pitch, just honest assessment of their data situation. Frame it: "I'll tell you what I actually see, whether that leads to working with us or not."

3. **Book the call** — Calendly or just propose a specific time slot. Remove all friction.

4. **Before the call** — Run the `jake-lead-scout` agent manually with their company name in the prompt. Let it surface anything publicly findable about their operation size, software stack, and financial health signals.

---

## The Free Data Health Check (Your Sales Call)

This is your actual product right now. Not the agents. Not the software. **This call.**

**Structure (30 minutes):**

- **Min 0–5:** "Tell me what your data situation looks like right now. Don't clean it up for me — I want to hear the honest version."
- **Min 5–20:** Ask about their stack (QB version, Excel usage, how they job cost, how they close month-end). Listen for the chaos signals.
- **Min 20–25:** "Here's what I see based on what you've described — these are the 3 places your data is probably costing you money right now."
- **Min 25–30:** "Here's what the fix looks like. We've done it. Takes about 3 weeks. First 10 we do at early-bird pricing because we're still building the case study library."

You're NOT selling software. You're selling the fact that you've already solved their exact problem and can prove it.

---

## The Pilot Close

When the call goes well and they ask "what does it cost?":

| Offer | Price | Timeline | What They Get |
|-------|-------|----------|--------------|
| Spend Leak Finder | $490–$2.5k | 7 days | Audit of where money is leaking through bad data — specific dollar amount found |
| Close Acceleration | $950–$5k | 10 days | Shorten their month-end close using clean data + automation |
| Get Paid Faster | $750–$3k | 14 days | AR cleanup + automated collections sequences |

**Lead with Spend Leak.** It has the lowest friction — you're finding money they don't know they're losing. The ROI is obvious and immediate. If they find $15k in unbilled retainage in 7 days, the $490 feels embarrassing to object to.

---

## What the Agents Do vs What You Do

| Task | Agent | Human |
|------|-------|-------|
| Find leads from DBPR license DB | cfo-lead-scout | Review & filter |
| Find leads from national SMB discovery | jake-lead-scout | Review & filter |
| Write LinkedIn posts | jake/cfo-content-engine | Approve/edit/post |
| Draft cold emails | jake/cfo-outreach-agent | Approve/personalize/send |
| Schedule social posts | jake/cfo-social-scheduler | Set up Postiz connection |
| Monitor reply rates | jake/cfo-analytics-monitor | Act on the data |
| Build case studies | jake/cfo-offer-proof-builder | Verify facts, approve |
| Pilot delivery | jake/cfo-pilot-deliverer | Own the relationship |
| **Respond to replies** | **Never** | **Always** |
| **Run health check calls** | **Never** | **Always** |
| **Close pilots** | **Never** | **Always** |

The agents are a force multiplier for top-of-funnel. Every human hour goes to the bottom of the funnel.

---

## Weekly Success Metrics (Track These, Nothing Else)

| Metric | Target | Why |
|--------|--------|-----|
| Outreach emails sent | 20/week | Volume enables the reply rate |
| Reply rate | 5–10% | Anything under 3% means voice or targeting is off |
| Health checks booked | 1–2/week | This is the real conversion event |
| Pilots closed | 1/month | Revenue. Nothing else matters. |

If reply rate drops below 3% for 2 consecutive weeks — stop sending and fix the email copy before sending more. Burning contacts with bad emails is worse than no emails.

---

## The First 30 Days — Sequenced

**Week 1:** Run Blitz, generate leads, send 20 cold emails manually (you review every one). No shortcuts yet.

**Week 2:** Run Blitz again, send 20 more. By now you have enough to see which subject lines are opening and which aren't. Adjust the agent prompts.

**Week 3:** If you have replies, you're on calls. If not, the email copy needs work — bring a real example to the Content Engine and ask it to rewrite around the specific company.

**Week 4:** If you have 1 pilot closed or in negotiation — the system is working, scale the Blitz to twice weekly. If not — the bottleneck is in the health check conversation, not the emails.

---

## The One Rule

**Never let the agents send anything you haven't read.** They draft. You decide. The day you let outreach go out unreviewed is the day you burn a real prospect with a generic email. The agents are fast and tireless. You are the judgment layer. Keep it that way until you have 10 pilots worth of proof that the copy converts.
