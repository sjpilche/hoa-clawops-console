# Tenacity Cadence Engine

The Tenacity Cadence Engine manages the multi-touch follow-up sequence for every active lead. Instead of one-shot outreach, it runs a structured 12-touch adaptive cadence across three channels, adjusting timing and tone based on Brain v2 feedback.

---

## What It Does

For every lead with `cadence_active=1`:
1. Checks if `next_touch_due <= now`
2. Computes the next touch: channel, tone, message type, wait days
3. Queues the appropriate run (outreach, follow-up, or SMS)
4. Updates `last_touch_number` and `next_touch_due` on the lead

**Cost:** $0/run — no LLM. Deterministic logic + DB reads/writes.

---

## The 12-Touch Sequence

| Touch # | Channel | Default Tone | Default Wait |
|---------|---------|-------------|-------------|
| 1 | Email | Warm | Day 0 (initial) |
| 2 | Email | Direct | +5 days |
| 3 | LinkedIn | Warm | +3 days |
| 4 | Email | Direct | +7 days |
| 5 | LinkedIn | Peer | +5 days |
| 6 | Email | Firm | +10 days |
| 7 | SMS | Brief | +7 days |
| 8 | Email | Value | +14 days |
| 9 | LinkedIn | Direct | +7 days |
| 10 | Email | Firm | +14 days |
| 11 | SMS | Final | +10 days |
| 12 | Email | Break-up | +21 days |

**Brain v2 adjustments:** The engine reads Layer 3 episodes to adjust timing and tone:
- High win rate for `direct` tone in this market → shift earlier touches to `direct`
- Fast replies historically (< 5 days) → compress wait times by 20%
- Slow market (> 14 days avg) → extend wait times by 30%

---

## Dual-Product Support

The cadence engine runs for both products:
- **Jake pipeline:** `cfo_leads` table, `product='jake'`
- **HOA pipeline:** `lg_engagement_queue` table, `product='hoa'`

Pass `{"product":"both"}` to run a full cycle for both.

---

## Database Schema

Migration: `server/db/migrations/032_cadence.sql`

**New table:** `cadence_touches`
```sql
lead_id, product, touch_number, channel, tone, message_type,
queued_at, sent_at, opened_at, replied_at, outcome
```

**New columns on `cfo_leads` and `lg_engagement_queue`:**
```sql
cadence_active     INTEGER DEFAULT 0    -- 1 = in cadence
last_touch_number  INTEGER DEFAULT 0    -- which touch last fired
next_touch_due     TEXT                 -- ISO date of next touch
```

---

## Triggering the Cadence

### Full cycle (all due leads)
```json
POST /api/runs/:id/confirm
Message: {"product":"both"}
```
Handler key: `tenacity_cadence`

### Single-lead inspection
```json
Message: {"lead_id": 123, "product": "jake"}
```
Returns next touch details without executing.

### Schedule
Fires automatically Monday, Wednesday, Friday at 9 AM via `scheduleRunner.js`.

---

## Activating / Deactivating

### Activate (when lead enters pipeline)
```sql
UPDATE cfo_leads SET cadence_active=1, next_touch_due=datetime('now') WHERE id=?
```
Or handled automatically by `jake_contact_enricher` when email is found.

### Deactivate (terminal outcomes)
`deactivateCadence(leadId, product)` is called automatically when:
- Reply classified as `INTERESTED` → lead is active, remove from cadence
- Reply classified as `UNSUBSCRIBE` → do not contact again
- Reply classified as `BOUNCED` → invalid address

Called from `jake_reply_classifier` handler in `runs.js`.

---

## Output Summary

Each cadence cycle run returns:
```
Cadence Cycle: 14 leads processed — 8 outreach queued, 4 follow-up queued, 2 SMS queued
  Skipped: 3 (cadence inactive), 1 (not yet due)
  Errors: 0
```

---

## Key File

`server/services/tenacityCadenceEngine.js`

Main methods:
- `runCadenceCycle(product)` — full cycle, queues runs for all due leads
- `computeCadenceForLead(leadId, product)` — single lead, returns next touch spec
- `deactivateCadence(leadId, product)` — marks lead inactive in cadence
- `getNextTouchSpec(touchNumber, brainContext)` — computes channel/tone/wait for touch N
