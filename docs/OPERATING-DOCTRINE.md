# OPENCLAW Operating Doctrine

An AI workforce that runs on discipline, not demo energy. This document defines what the system is for, how it behaves, and what earns a place in it.

## MISSION & VISION

Build a disciplined, autonomous AI workforce that operates 24/7 to find opportunities and generate measurable business value — while humans retain control of strategy, risk, and trust.

The goal is a trusted AI operating system that continuously turns information into action, action into outcomes, and outcomes into compounding business advantage.

## WHAT WINNING LOOKS LIKE

- Finds real opportunities faster than humans alone
- Completes high-value work with minimal supervision
- Improves speed, quality, and output across the business
- Stays inside risk, trust, and brand boundaries
- Produces results that can be measured

## FIVE OPERATING PRINCIPLES

### 1. Value over novelty
Agents are built because they create value — not because they're impressive. Every agent must save time, increase revenue, improve quality, reduce risk, or unlock a capability we don't currently have.

### 2. Autonomy with guardrails
Agents operate aggressively inside clear boundaries. The goal is reliable execution without avoidable damage — not maximum freedom.

### 3. Simplicity wins
A smaller number of clear, dependable agents beats a sprawling mess of overlapping roles. If two agents do nearly the same thing, merge them.

### 4. Measurable performance only
Every important agent has a scorecard. If we can't tell whether it's working, improving, or failing — it is not production-ready.

### 5. Humans own the top of the stack
Strategy, budget, legal risk, reputation, and external commitments belong to humans. Agents recommend, draft, monitor, escalate, and execute within limits. They do not get authority over critical decisions.

## AGENT DECISION FRAMEWORK

Run every agent through this filter at build time and regularly in production.

| Decision | Criteria |
|----------|----------|
| **BUILD** | Repetitive or time-sensitive work with clear inputs and outputs, measurable success, real tool access, and meaningful upside. |
| **KEEP** | Distinct role, consistent useful output, measurable time or quality improvement, understood failure modes, maintainable at low cost. |
| **CUT** | Heavy overlap, mostly noise or summaries, needs constant intervention, no one trusts or uses its output, simpler solution exists. |

## SCORECARD

Score each agent 1-5 on each dimension.

| # | Dimension | What to assess |
|---|-----------|---------------|
| 1 | Business value | Revenue, margin, speed, quality, or risk impact |
| 2 | Frequency | Problem occurs often enough to justify the agent |
| 3 | Autonomy potential | Does meaningful work without constant human input |
| 4 | Reliability | Good output with acceptable failure rates |
| 5 | Tool leverage | Uses tools, data, or memory to create real advantage |
| 6 | Maintenance burden | Easy enough to maintain relative to what it delivers |
| 7 | Trust & safety fit | Operates safely within defined guardrails |

| Score | Rating | Action |
|-------|--------|--------|
| 28-35 | Core agent | Prioritize, improve, rely on it |
| 21-27 | Useful | Keep it, tighten the role |
| 14-20 | Questionable | Merge, redesign, or narrow scope |
| 7-13 | Cut it | Remove from production |

## DEFAULT RULES

**Agents may do the following without approval:**
- Research, monitor, organize, draft, enrich, route, evaluate
- Execute bounded tasks within defined scope
- Escalate when confidence is low or risk is elevated

**The following require explicit human authorization:**
- Send external communications with real consequences
- Spend money or commit resources
- Make legal, tax, or compliance decisions
- Modify core systems
- Present a guess as a fact
- Keep running on a vague goal with no scorecard

## CHANGE CONTROL

Preserve working systems unless there is a clear, material benefit to changing them. Improve by simplification, not disruption. The burden of proof is on any change — not on the existing system.

## ARCHITECTURE DEFAULTS

When in doubt: fewer agents, clearer roles, stronger supervisors, more measurable outputs, tighter handoffs, limited permissions by default. Expand autonomy only after proof.

## THE STANDARD FOR EVERY AGENT

Every agent must be able to answer these clearly:

- What exact job do I own?
- What inputs do I use?
- What outputs do I produce?
- What tools am I allowed to use?
- What decisions can I make alone?
- What requires escalation?
- How do we know I'm worth keeping?

Blurry answers mean the agent is not ready for production.

---

OpenClaw is not a science project. It is an operating system for turning intent into execution — and it runs on agents that do real work, produce measurable output, and know exactly where their authority ends. Every agent earns the right to stay. None of them are guaranteed it.
