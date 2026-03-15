# Quill — Sample Tasks

---

## Sample Task 1: Jake CFO Cold Email (Single Lead)
**Input message:**
```json
{
  "task": "cold_email",
  "lead_id": 201,
  "voice": "jake",
  "sequence_position": 1
}
```
*(Lead 201: Gulf Coast General Contractors LLC | Dave Morales, Owner | Tampa, FL | ERP: QuickBooks)*

**Expected output:**
```
COLD EMAIL DRAFT
Lead: Gulf Coast General Contractors LLC | Dave Morales, Owner
Voice: Jake CFO
Subject: Gulf Coast — your QuickBooks is costing you money
---
Dave —

You're running construction projects on QuickBooks.

That means your AR aging is wrong. Your job costing is a guess. And you find out you're
over-budget on a job after it's done.

We fixed this for ourselves. Built a dashboard that tells you exactly where every dollar
is on every active job — updated daily, no data entry.

20 minutes to show you what it looks like?

— Jake
---
Word count: 68
Personalization hook: Company name + ERP type (QuickBooks, confirmed from lead record) + Tampa, FL market
CTA: 20-minute demo
Saved to cfo_outreach_sequences: sequence_id 1047 (status: draft, sequence_position: 1)
Status: DRAFT — PENDING RALPH QA
```

**Notes:**
This is what a good Jake CFO email looks like — 68 words, pain in sentence 3, direct CTA in sentence 5. No "I hope this finds you well." No "I wanted to reach out." The company name is in the subject line. The ERP type is in the body. A bad run produces 200 words starting with "As a construction CFO with 20 years of experience..."

---

## Sample Task 2: Batch Cold Email (6 Leads)
**Input message:**
```json
{
  "task": "cold_email_batch",
  "lead_ids": [201, 202, 203, 204, 205, 206],
  "voice": "jake"
}
```

**Expected output:**
```
BATCH COLD EMAIL DRAFT
Requested: 6 | Drafted: 6 | Failed: 0
Voice: Jake CFO | Sequence position: 1

DRAFTS:
1. Lead 201 — Gulf Coast General Contractors (Dave Morales)
   Subject: "Gulf Coast — your QuickBooks is costing you money"
   Word count: 68 | Sequence ID: 1047

2. Lead 202 — Bayshore Construction Group (Lynn Petrova, Office Manager)
   Subject: "Bayshore — office manager shouldn't be doing CFO work"
   Word count: 72 | Sequence ID: 1048
   Note: Contact is Office Manager, not Owner — angle adjusted to "you're doing two jobs"

3. Lead 203 — Coastal Build Partners (Mike Harman, Controller)
   Subject: "Coastal Build — your controller is flying blind"
   Word count: 65 | Sequence ID: 1049
   Note: Contact has CFO-level title — angle shifted to peer-to-peer

4. Lead 204 — Suncoast Builders (Rick Suncoast — pattern guess email, confidence 0.62)
   Subject: "Suncoast Builders — QuickBooks for a $4M GC"
   Word count: 71 | Sequence ID: 1050
   FLAG: Email is pattern-guessed (rick@suncoastbuilders.net). Recommend Ralph flag
         this for Steve's approval before including in send batch.

5. Lead 205 — Hillsborough Contractors (Maria Torres, Controller)
   Subject: "Hillsborough — job costing that's actually accurate"
   Word count: 69 | Sequence ID: 1051

6. Lead 206 — Tampa Bay Renovation (Joe Renaud, Owner)
   Subject: "Tampa Bay Renovation — stop finding out you're over budget after the job"
   Word count: 74 | Sequence ID: 1052

ALL 6 DRAFTS SAVED — Status: DRAFT — PENDING RALPH QA
BATCH FLAG: Lead 204 has low-confidence email — Ralph should verify before approving for send.
```

**Notes:**
Batch output should show variation across drafts — not 6 identical emails with the company name swapped. The contact title matters: an email to a Controller is peer-to-peer; an email to an Office Manager acknowledges they're doing CFO work they shouldn't have to. Quill should flag low-confidence emails in the batch output, not bury them.

---

## Sample Task 3: Owen CFO Blog Post
**Input message:**
```json
{
  "task": "blog_post",
  "topic": "Why construction companies are the last industry to adopt real-time financial dashboards",
  "keyword": "construction financial dashboard",
  "voice": "owen",
  "word_count_target": 900
}
```

**Expected output:**
```
BLOG POST DRAFT
Title: Construction Is the Last Industry Flying Blind — Here's Why That's About to Change
Keyword target: construction financial dashboard
Voice: Owen CFO
Word count: 912
---

[INTRO]
I've reviewed the books of 40-plus construction companies over the last decade. The pattern is almost universal: real-time financial visibility is treated as a luxury for large GCs, not a baseline operating requirement for everyone else.

That's wrong. And the tools to fix it have existed for years.

## Why Construction Fell Behind Every Other Industry

[H2 SECTION — ~200 words]
Manufacturing companies have had real-time dashboards since the early 2010s.
Retail has had them since the inventory management wars of the 2000s.
Construction? Most companies are still running monthly closes on QuickBooks...

## The Three Numbers Every GC Should Know Every Morning

[H2 SECTION — ~200 words]
Job cost variance. AR aging. Cash position through week's end.
These aren't sophisticated metrics — they're the minimum...

## What Changes When the Numbers Are Live

[H2 SECTION — ~200 words]
The most common thing I hear after a GC implements a real-time dashboard is not
"we made better strategic decisions." It's "we stopped getting surprised."...

## The Setup Is Simpler Than You Think

[H2 SECTION — ~200 words]
Most GC owners assume real-time dashboards require an ERP migration.
They don't. We built ours on top of existing QuickBooks data...

[CTA]
If you want to see what this looks like for a GC your size, we do a 20-minute walkthrough
with no pitch deck. Just your numbers, live.
→ [Schedule a walkthrough]

---
H2s: 4
CTA: Schedule a walkthrough
Source notes: "40-plus construction companies" — based on Jake/Owen CFO engagement history. Verify with Steve before publishing.
Saved to cfo_content_pieces: content_id 44 (status: draft, channel: blog)
Status: DRAFT — PENDING RALPH QA
```

**Notes:**
Owen CFO blog posts open with an observation from experience, not a rhetorical question or a statistic. They build authority by showing familiarity with the industry, not by citing generic data. The draft shows the full H2 structure — Ralph can verify word distribution across sections. The source note is honest.

---

## Sample Task 4: Follow-Up Email (Touch 2)
**Input message:**
```json
{
  "task": "follow_up",
  "lead_id": 202,
  "days_since_last_touch": 7,
  "original_subject": "Bayshore — office manager shouldn't be doing CFO work",
  "touch_number": 2
}
```
*(Lead 202: Bayshore Construction Group | Lynn Petrova, Office Manager | St. Pete, FL)*

**Expected output:**
```
FOLLOW-UP DRAFT
Lead: Bayshore Construction Group | Lynn Petrova, Office Manager
Touch: 2 of 3
Original send: 7 days ago | Original subject: "Bayshore — office manager shouldn't be doing CFO work"
Voice: Jake CFO
---
Lynn —

Sent you something last week about the CFO workload that falls on office managers at construction companies.

Didn't want to assume you saw it, so I'm sending one more.

New angle worth sharing: we helped a $5M GC in the same position as Bayshore cut their
month-end close from 12 days to 3. The owner and office manager were both doing it.
Now neither of them is.

Worth 20 minutes?

— Jake
---
Word count: 79
New value added: Specific result (12 days → 3 day close) not in first email
CTA: 20-minute ask (same as touch 1 — consistent)
No apology for following up: correct
Saved to cfo_outreach_sequences: sequence_id 1061 (status: draft, sequence_position: 2)
Status: DRAFT — PENDING RALPH QA
```

**Notes:**
Touch 2 must add something new — a result, a case point, a different angle. Repeating touch 1 word-for-word with "just following up" is what destroys deals. Quill should never apologize for following up ("sorry to bother you again") — it signals weakness. The word count is still under 100.

---

## Sample Task 5: Meeting Booking Email
**Input message:**
```json
{
  "task": "meeting_booking",
  "lead_id": 147,
  "reply_text": "This is exactly what we need. When can we talk?",
  "calendly_url": "https://calendly.com/jake-cfo/30min"
}
```
*(Lead 147: Apex Roofing | Dan Mercer, Owner | Austin, TX)*

**Expected output:**
```
MEETING BOOKING DRAFT
Lead: Apex Roofing | Dan Mercer, Owner | Austin, TX
Trigger: Lead replied — "This is exactly what we need. When can we talk?"
Voice: Jake CFO (warm close, not a hard pitch)
---
Subject: Let's talk — Apex Roofing

Dan —

Great to hear from you.

Here's a link to grab 30 minutes whenever it works for you:
https://calendly.com/jake-cfo/30min

I'll come prepared with a quick look at what a dashboard typically surfaces for a GC
your size — no slides, just the actual numbers.

Talk soon.

— Jake
---
Word count: 58
Tone: Warm but not gushing — meets the energy of the reply
Calendly URL: inserted (not placeholder)
No oversell in reply: correct — lead is already interested
Saved to cfo_outreach_sequences: sequence_id 1072 (status: draft, sequence_position: 3)
Status: DRAFT — PENDING RALPH QA
```

**Notes:**
Meeting booking emails should be short. The lead said yes — Quill's job is to not un-sell them. 58 words. One link. The "I'll come prepared with..." line does important work: it sets an expectation that the meeting has substance. A bad meeting booking email has 3 paragraphs about how excited Jake is to connect.
