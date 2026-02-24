# ClawOps CLI — Full Command Reference

Run with `exec`: `node tools/clawops.js <command>`

| Command | What it does | Cost |
|---------|-------------|------|
| `run <agent> <msg>` | Trigger agent run via API | $0 (API call) |
| `stats` | Dashboard: runs, costs, leads, ROI | $0 |
| `leads hoa` | HOA lead count by state | $0 |
| `leads cfo` | CFO lead count by source/ERP | $0 |
| `status` | Last 10 runs | $0 |
| `status <id>` | Specific run details | $0 |
| `agents` | All registered agents | $0 |
| `email <to> <subj> <body>` | Send via Gmail SMTP | $0 |
| `facebook <post>` | Queue Facebook page post | $0 |
| `trader` | Trading positions + P&L | $0 |
| `content pending` | Queued content | $0 |
| `pipeline` | Full system health | $0 |
| `query "SELECT ..."` | Read-only SQL | $0 |

## Agent Quick Reference

| Agent | Trigger | Cost |
|-------|---------|------|
| hoa-discovery | `run hoa-discovery {"geo_target_id":"san-diego"}` | $0 |
| cfo-lead-scout | `run cfo-lead-scout {"county":"Sarasota"}` | $0 |
| hoa-content-writer | `run hoa-content-writer Write blog about X` | $0.10 |
| hoa-cms-publisher | `run hoa-cms-publisher publish latest` | $0 |
| cfo-content-engine | `run cfo-content-engine Write post about X` | $0.05 |
| cfo-outreach-agent | `run cfo-outreach-agent Draft emails for X` | $0.05 |

## Key Tables

- `hoa_communities` — HOA prospects from discovery
- `cfo_leads` — CFO contractor leads from DBPR
- `runs` — All agent executions with costs
- `content_queue` — Queued social/email content
- `agents` — Registered agent configs
- `chat_messages` — Conversation history
