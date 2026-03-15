# API Reference

**Base URL:** `http://localhost:3001/api`

All endpoints except `/auth/login` require:
```
Authorization: Bearer <jwt-token>
```

---

## Authentication

### POST /auth/login
```json
Request:  { "email": "admin@clawops.local", "password": "changeme123" }
Response: { "token": "eyJhb...", "user": { "id", "email", "name", "role" } }
```

### GET /auth/me
Returns current user from token. Used to verify token on page load.

### POST /auth/register
Create a new user (admin only).
```json
Request: { "email", "password", "name" }
```

---

## Agents

### GET /agents
List all agents.
```json
Response: { "agents": [{ "id", "name", "description", "status", "config", "total_runs", "last_run_at" }] }
```

### GET /agents/:id
Get agent details + recent runs.

### POST /agents
Create agent.
```json
Request: { "name", "description", "config": { "openclaw_id", "special_handler", "default_params" } }
```

### PUT /agents/:id
Update agent. Partial updates supported.

### DELETE /agents/:id
Delete agent. Fails if agent is currently running.

### POST /agents/:id/run
Create a pending run for the agent (triggers confirmation gate in UI).
```json
Request:  { "message": "run message or JSON params" }
Response: { "run": { "id", "status": "pending" } }
```

---

## Runs

### GET /runs
List recent runs. Query params: `?limit=50&offset=0&agent_id=&status=&start_date=&end_date=`
```json
Response: { "runs": [{ "id", "agent_id", "agent_name", "status", "trigger", "cost_usd", "duration_ms", "created_at" }] }
```

### GET /runs/:id
Get full run details including `result_data`.

### GET /runs/:id/status
Poll run status (lightweight).
```json
Response: { "id", "status", "started_at", "completed_at", "duration_ms", "error_msg" }
```

### POST /runs/:id/confirm
**Critical endpoint.** Confirms a pending run and executes it.

Flow:
1. Fetches pending run from DB
2. Routes to `SPECIAL_HANDLER` (if agent has one) OR OpenClaw CLI
3. Streams logs via Socket.io `run:log` events during execution
4. On completion: emits `run:completed`, sends Discord notification

```json
Response (success):
{
  "success": true,
  "run": {
    "id": "uuid",
    "status": "completed",
    "outputText": "Jake Lead Scout: 6 new leads inserted...",
    "cost_usd": 0.024,
    "duration_ms": 12450
  }
}
```

Special handler agents return extra fields (e.g., `leadsInserted`, `region`, `stats`).

### POST /runs/:id/cancel
Cancel a pending run.
```json
Response: { "message": "Run cancelled", "id", "status": "cancelled" }
```

---

## Schedules

### GET /schedules
List all schedules.
```json
Response: { "schedules": [{ "id", "agent_id", "cron_expr", "enabled", "last_run_at", "next_run_at" }] }
```

### POST /schedules
Create a schedule.
```json
Request: { "agent_id", "cron_expr": "0 7 * * 1", "enabled": true, "message": "optional override message" }
```

### PUT /schedules/:id
Update schedule (enable/disable, change cron, update message).

### DELETE /schedules/:id
Delete schedule.

---

## Leads (CFO Leads — Jake + CFO pipeline)

### GET /leads
List leads. Query: `?status=new&source_agent=jake&limit=50`
```json
Response: { "leads": [{ "id", "company_name", "contact_name", "contact_email", "status", "pilot_fit_score", "urgency_score", "pipeline_stage" }] }
```

### GET /leads/:id
Full lead detail including outreach sequences, dossier, brain episodes.

### PUT /leads/:id
Update lead (status, notes, etc).

### DELETE /leads/:id
Hard delete lead.

---

## Content

### GET /content
List content pieces. Query: `?status=draft&source_agent=jake&type=blog`
```json
Response: { "content": [{ "id", "title", "content_type", "status", "source_agent", "created_at" }] }
```

### GET /content/:id
Full content piece.

### PUT /content/:id
Update content (status, body, etc).

---

## Outreach

### GET /outreach
List outreach sequences. Query: `?status=draft&source_agent=jake`

### PUT /outreach/:id
Update sequence (approve, mark sent, etc).
```json
Request: { "status": "approved" }
```

---

## Discovery

### GET /discovery/hoa
List discovered HOA communities.

### GET /discovery/construction
List discovered construction companies (GC leads from Google Maps).

---

## Brain (Collective Intelligence)

### GET /brain/stats
```json
Response: {
  "observations_total": 142,
  "observations_7d": 38,
  "feedback_total": 67,
  "feedback_approved": 54,
  "feedback_rejected": 13,
  "episodes_total": 29,
  "episodes_avg_score": 0.71,
  "kb_total": 12,
  "kb_total_uses": 88
}
```

### GET /brain/context-preview
Returns brain context that would be prepended to next LLM run.
Used by chat UI to inject context before Ollama/OpenAI calls.

### POST /brain/feedback
Record manual feedback on an agent output.
```json
Request: { "agent_name", "output_type", "output_id", "signal": "approved|rejected", "notes" }
```

### GET /brain/knowledge-base
List Layer 4 KB entries (distilled best practices).

---

## Chat

### GET /chat/threads
List all chat threads.

### POST /chat/threads
Create new thread.
```json
Request: { "title": "New Conversation" }
Response: { "thread": { "id", "title", "created_at" } }
```

### GET /chat/threads/:id
Get thread with all messages.

### POST /chat/threads/:id/messages
Send a message. The server routes to the `main` agent and returns the response.
```json
Request:  { "content": "How many leads did we get this week?" }
Response: { "message": { "id", "content", "sender_type": "agent", "created_at" } }
```

---

## Blitz

### GET /blitz
List blitz runs (all-agent runs).

### POST /blitz
Start a new blitz run.
```json
Request: { "domain": "jake|hoa|all", "message": "optional override" }
Response: { "blitz_run_id": 42, "status": "running" }
```

### GET /blitz/:id
Get blitz run status + per-agent results.

---

## Discord

### GET /discord/status
Check Discord webhook connectivity.

### POST /discord/test
Send a test embed to the configured Discord channel.

---

## Health

### GET /health
No auth required. Basic server health check.
```json
Response: { "status": "ok", "uptime": 3600, "db": "connected" }
```

### GET /health/playwright
Playwright browser pool health.
```json
Response: {
  "status": "healthy|degraded|circuit_open",
  "pages_served": 142,
  "browser_restarts": 3,
  "circuit_open": false
}
```

---

## Settings

### GET /settings
Get all settings as key-value map.
```json
Response: {
  "max_concurrent_agents": "3",
  "max_cost_per_run": "5.00",
  "max_runs_per_hour": "20"
}
```

### PUT /settings/:key
Update a setting.
```json
Request:  { "value": "10.00" }
Response: { "key": "max_cost_per_run", "value": "10.00" }
```

---

## WebSocket Events (Socket.io)

Connect to `http://localhost:3001` with Socket.io client.

| Event | Direction | Payload |
|-------|-----------|---------|
| `run:log` | Server → Client | `{ runId, line, timestamp }` — streaming log line during execution |
| `run:completed` | Server → Client | `{ runId, agentId, status, cost, duration }` |
| `run:failed` | Server → Client | `{ runId, agentId, error, isTimeout }` |
| `agent:status` | Server → Client | `{ agentId, status }` — idle/running/error |
| `schedule:fired` | Server → Client | `{ scheduleId, agentId, runId }` |

---

## Special Handler Agents

These agents bypass OpenClaw CLI and run deterministic Node.js code. Registered in `server/routes/runs.js` `SPECIAL_HANDLERS` object.

| Handler Key | Agent | Message Format | Cost |
|-------------|-------|---------------|------|
| `jake_construction_discovery` | jake-construction-discovery | `{"region":"Tampa Bay, FL","limit":100}` | $0 |
| `jake_contact_enricher` | jake-contact-enricher | `{"limit":20,"status_filter":"pending"}` | $0 |
| `jake_lead_scout` | jake-lead-scout | `{"region":"Denver, CO"}` or empty for rotation | ~$0.025 |
| `jake_follow_up` | jake-follow-up-agent | `{"limit":10}` | ~$0.01/lead |
| `jake_reply_classifier` | jake-reply-classifier | `{"lead_id":123,"reply_text":"..."}` | $0 |
| `jake_meeting_booker` | jake-meeting-booker | `{"lead_id":123,"reply_text":"..."}` | ~$0.01 |
| `jake_crm_sync` | jake-crm-sync | `{}` | $0 |
| `hoa_discovery` | hoa-discovery | `{"geoTargetId":"south-florida"}` | $0 |
| `hoa_contact_scraper` | hoa-contact-scraper | `{"city":"Tampa","state":"FL"}` | $0 |
| `hoa_contact_enricher` | hoa-contact-enricher | `{"limit":10,"tier":"HOT"}` | $0 |
| `hoa_outreach_drafter` | hoa-outreach-drafter | `{"limit":10,"tier":"HOT"}` | $0 |
| `hoa_minutes_monitor` | hoa-minutes-monitor | `{"limit":20,"priority_min":5}` | $0 |
| `google_reviews_monitor` | google-reviews-monitor | `{"limit":10}` | $0 |
| `urgency_scorer` | urgency-scorer | `{"limit":300,"product":"both"}` | $0 |
| `lead_dossier_generator` | lead-dossier-generator | `{"batch":true,"limit":50}` or `{"lead_id":123}` | $0 |
| `pipeline_state_tracker` | pipeline-state-tracker | `{"product":"both"}` | $0 |
| `pipeline_director` | pipeline-director | `{}` | $0 |
| `tenacity_cadence` | tenacity-cadence | `{"product":"both"}` or `{"lead_id":123}` | $0 |
| `brain_distillation` | brain-distillation | `{}` | $0 |
| `daily_debrief` | daily-debrief | `{}` | ~$0.01 |
| `morning_digest` | morning-digest | `{}` | $0 |
| `github_publisher` | github-publisher | Post markdown content | $0 |

---

*Last updated: March 2026*
