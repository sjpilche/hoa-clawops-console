# Lead Monitoring Agent - Production Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    FACEBOOK LEAD ADS                             │
│  ┌──────────────┐              ┌──────────────┐                │
│  │  Webhook     │              │  Graph API   │                │
│  │  (Primary)   │              │  (Fallback)  │                │
│  └──────┬───────┘              └──────┬───────┘                │
└─────────┼──────────────────────────────┼──────────────────────┘
          │                              │
          │ Real-time                    │ Polling
          │                              │ (every 5 min)
          ▼                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              LEAD MONITORING AGENT (Node.js/Express)             │
│                                                                   │
│  ┌──────────────────────┐     ┌──────────────────────┐          │
│  │  Webhook Handler     │     │  Polling Service     │          │
│  │  - Signature verify  │     │  - Incremental fetch │          │
│  │  - Queue to DB       │     │  - Gap detection     │          │
│  │  - Immediate ack     │     │  - Auto-reconcile    │          │
│  └──────────┬───────────┘     └──────────┬───────────┘          │
│             │                            │                       │
│             └────────────┬───────────────┘                       │
│                          ▼                                       │
│              ┌──────────────────────┐                            │
│              │  Ingestion Pipeline  │                            │
│              │  - Validate          │                            │
│              │  - Deduplicate       │                            │
│              │  - Transform         │                            │
│              │  - Store             │                            │
│              │  - Notify            │                            │
│              └──────────┬───────────┘                            │
└─────────────────────────┼──────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Azure SQL   │  │  SMTP Email  │  │  Audit Log   │
│  - raw_leads │  │  - Instant   │  │  - Actions   │
│  - leads     │  │  - Digest    │  │  - Errors    │
│  - state     │  │  - Failures  │  │  - Recovery  │
└──────────────┘  └──────────────┘  └──────────────┘
```

## Data Flow

### Primary Path (Webhook):
1. Facebook sends POST to `/webhook/facebook/leads`
2. Signature validated (HMAC SHA-256)
3. Lead queued to in-memory buffer
4. HTTP 200 returned immediately (< 100ms)
5. Background worker processes queue
6. Lead stored in database (transactional)
7. Notification sent
8. Audit logged

### Fallback Path (Polling):
1. Cron job runs every 5 minutes
2. Fetch leads since last checkpoint
3. Detect any gaps (missing lead IDs)
4. Process new leads through same pipeline
5. Update checkpoint timestamp
6. Log reconciliation stats

### Idempotency Strategy:
- Primary key: `facebook_lead_id` (unique constraint)
- Upsert on conflict (INSERT ... ON CONFLICT DO NOTHING)
- Idempotent notifications (check notification_log first)
- Dedupe window: 7 days

## Failure Scenarios

| Scenario | Detection | Recovery |
|----------|-----------|----------|
| Webhook down | Polling finds gap | Backfill via API |
| Database down | Queue in memory + retry | Exponential backoff |
| Email fails | Logged to retry queue | Retry 3x, then DLQ |
| Server restart | Load checkpoint on boot | Resume from last success |
| Duplicate webhooks | Database constraint | Silent ignore (logged) |
| Malformed payload | Schema validation | Log to dead letter queue |
| Token expired | API 401 response | Alert admin, halt |
| Network timeout | HTTP client timeout | Retry with backoff |

## Guarantees

✅ **At-least-once ingestion**: Webhook + polling redundancy
✅ **Exactly-once storage**: Database unique constraints
✅ **Zero data loss**: Every lead captured or logged as failure
✅ **Audit trail**: Every action logged with timestamp
✅ **Recovery**: Automatic reconciliation after downtime
✅ **Visibility**: Health checks + stats endpoints
✅ **Alerting**: Instant notifications + daily digests

## Performance Targets

- Webhook response time: < 100ms
- Lead processing latency: < 5 seconds (p99)
- Notification latency: < 30 seconds
- Polling interval: 5 minutes
- Reconciliation window: 24 hours
- Retry attempts: 3x with exponential backoff
- Dead letter retention: 30 days

## Monitoring & Observability

### Health Checks:
- `/health` - System status (200 if healthy)
- `/health/db` - Database connectivity
- `/health/facebook` - API token validity
- `/health/email` - SMTP connection

### Metrics:
- `/stats` - Lead counts, success rate, errors
- `/stats/ingestion` - Webhook vs polling breakdown
- `/stats/notifications` - Email delivery stats

### Operations:
- `/admin/last-leads?limit=10` - Recent leads
- `/admin/failed-events` - Dead letter queue
- `/admin/reprocess/:id` - Manual retry
- `/admin/reconcile` - Force full reconciliation

## Security

1. **Webhook Validation**: HMAC-SHA256 signature verification
2. **Environment Secrets**: All tokens in .env (not in code)
3. **Input Validation**: JSON schema validation on all inputs
4. **SQL Injection**: Parameterized queries only
5. **Rate Limiting**: 100 req/min per IP
6. **HTTPS Only**: TLS 1.2+ required
7. **Token Rotation**: Support for rolling updates

## Deployment Architecture (Render)

```
┌────────────────────────────────────────────┐
│  Render Web Service (always-on)            │
│  - Node.js 18+                             │
│  - PM2 process manager                     │
│  - Auto-restart on crash                   │
│  - Environment variables                   │
│  - Health check: /health (every 30s)       │
└────────────────────────────────────────────┘
           │
           ├─── Azure SQL (external)
           ├─── SMTP (Gmail)
           └─── Facebook Graph API
```

## Operational Runbook

### Startup Sequence:
1. Load environment variables
2. Test database connection
3. Create tables if not exist
4. Load last checkpoint from DB
5. Start webhook server
6. Start polling service
7. Log "Agent Ready" + stats

### Shutdown Sequence:
1. Stop accepting webhooks (503)
2. Drain in-memory queue (30s timeout)
3. Save checkpoint to DB
4. Close database pool
5. Log shutdown stats

### Daily Operations:
- **Morning**: Check digest email for overnight leads
- **Weekly**: Review `/admin/failed-events` for patterns
- **Monthly**: Verify reconciliation accuracy

### Emergency Procedures:
- **Token Expired**: Update FACEBOOK_ACCESS_TOKEN in Render env
- **Database Down**: Leads queue in memory (max 1000), then reject
- **Email Down**: Leads still saved, notifications queued for retry
- **Complete Outage**: Polling will backfill up to 24 hours on recovery

## Scalability

Current design handles:
- **Leads/day**: 10,000
- **Webhook throughput**: 100/second (burst)
- **Database size**: 1M+ leads
- **Notification rate**: 1 per second

To scale beyond:
1. Add Redis for queue (replace in-memory)
2. Add worker processes (horizontal scaling)
3. Partition database by date
4. Use batch email API
