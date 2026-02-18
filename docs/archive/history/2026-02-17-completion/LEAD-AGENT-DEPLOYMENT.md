# Lead Monitoring Agent - Deployment Guide

## Prerequisites

✅ Azure SQL Database configured (empcapmaster2)
✅ Facebook App with Lead Ads permissions
✅ SMTP/Email credentials (Gmail)
✅ Render account (or similar Node.js host)
✅ Node.js 18+ installed locally

## Step-by-Step Deployment

### Step 1: Initialize Database Schema

1. **Connect to Azure SQL Database:**

```bash
# Using Azure Data Studio or SSMS
Server: empirecapital.database.windows.net
Database: empcapmaster2
User: CloudSA1f77fc9b
Password: [from .env.local]
```

2. **Run Schema Script:**

```sql
-- Copy and execute: database/lead-agent-schema.sql
-- This creates all tables, procedures, and views
```

3. **Verify Schema:**

```sql
SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_NAME IN ('raw_leads', 'leads', 'ingestion_state', 'notification_log', 'errors_deadletter', 'agent_activity_log');

-- Should return 6 tables
```

### Step 2: Configure Environment Variables

Add to your `.env.local`:

```bash
# Lead Agent Configuration
FACEBOOK_APP_SECRET=<your_app_secret>  # Get from Facebook Developer Console > Settings > Basic
LEAD_ALERT_EMAIL=<your_email>  # Where to send instant notifications
LEAD_DIGEST_EMAIL=<your_email>  # Where to send daily digest
```

### Step 3: Integrate Agent into Server

1. **Update `server/index.js` to auto-start agent:**

```javascript
// Add near top with other requires
const leadAgent = require('./agents/leadMonitoringAgent');

// Add after Express app setup
app.use('/api/lead-agent', require('./routes/leadAgent'));

// Add after server starts
server.on('listening', async () => {
  console.log(`Server running on port ${PORT}`);

  // Auto-start lead monitoring agent
  try {
    await leadAgent.start();
    console.log('✅ Lead Monitoring Agent started');
  } catch (error) {
    console.error('❌ Failed to start Lead Monitoring Agent:', error);
  }
});

// Add graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await leadAgent.stop();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
```

### Step 4: Test Locally

1. **Start server:**

```bash
npm run dev
```

2. **Check health:**

```bash
curl http://localhost:3001/api/lead-agent/health
```

Expected response:
```json
{
  "status": "healthy",
  "agent": {
    "name": "LeadMonitoringAgent",
    "version": "1.0.0",
    "isRunning": true,
    "uptime": "0h 2m"
  }
}
```

3. **Check stats:**

```bash
curl http://localhost:3001/api/lead-agent/stats
```

4. **Test polling manually:**

```bash
curl -X POST http://localhost:3001/api/lead-agent/reconcile
```

### Step 5: Deploy to Render

1. **Update Render Environment Variables:**

Go to Render Dashboard → Your Service → Environment

Add:
```
FACEBOOK_APP_SECRET=<value>
LEAD_ALERT_EMAIL=<value>
LEAD_DIGEST_EMAIL=<value>
```

2. **Deploy:**

```bash
git add .
git commit -m "Add production-grade lead monitoring agent"
git push origin main
```

Render will auto-deploy.

3. **Verify deployment:**

```bash
curl https://hoa-clawops-console.onrender.com/api/lead-agent/health
```

### Step 6: Configure Facebook Webhooks

1. **Go to Facebook Developer Console:**
   - Your App → Webhooks → leadgen

2. **Subscribe to Page:**
   - Click "Add Subscription"
   - Page ID: `1001233166403710`
   - Webhook URL: `https://hoa-clawops-console.onrender.com/api/lead-agent/webhook`
   - Verify Token: (from FACEBOOK_WEBHOOK_VERIFY_TOKEN in .env.local)
   - Fields: Select `leadgen`

3. **Test webhook:**
   - Facebook will send a GET request to verify
   - Should return 200 OK

4. **Submit test lead:**
   - Go to your Facebook Lead Ad form
   - Submit a test lead
   - Check logs in Render for webhook event

### Step 7: Verify End-to-End

1. **Submit a real test lead** via Facebook Lead Ad

2. **Check webhook received:**
```bash
curl https://hoa-clawops-console.onrender.com/api/lead-agent/stats/ingestion
```

3. **Check lead in database:**
```sql
SELECT TOP 1 * FROM leads ORDER BY created_at DESC;
```

4. **Check email notification** in your inbox

5. **Verify audit trail:**
```sql
SELECT TOP 10 * FROM agent_activity_log ORDER BY created_at DESC;
```

---

## Monitoring & Operations

### Daily Checklist

**Morning (9 AM):**
- [ ] Check daily digest email
- [ ] Review failed events: `GET /api/lead-agent/failed-events`
- [ ] Verify health: `GET /api/lead-agent/health`

**Weekly:**
- [ ] Review stats: `GET /api/lead-agent/stats`
- [ ] Check notification delivery rate
- [ ] Verify no dead letter queue buildup

### Alerts to Watch For

🚨 **Critical:**
- Health check fails (status 503)
- No leads received in 24h (if campaign is active)
- Database connection errors
- Email delivery failures > 10%

⚠️ **Warning:**
- Polling fallback being used (means webhooks down)
- Duplicate rate > 5%
- Error count > 10/day
- Queue size > 100

### Common Operations

**Force reconciliation (backfill missed leads):**
```bash
curl -X POST https://hoa-clawops-console.onrender.com/api/lead-agent/reconcile
```

**Reprocess failed event:**
```bash
curl -X POST https://hoa-clawops-console.onrender.com/api/lead-agent/reprocess/123
```

**Get recent leads:**
```bash
curl https://hoa-clawops-console.onrender.com/api/lead-agent/leads/recent?limit=10
```

**Restart agent:**
```bash
curl -X POST https://hoa-clawops-console.onrender.com/api/lead-agent/stop
curl -X POST https://hoa-clawops-console.onrender.com/api/lead-agent/start
```

---

## Emergency Procedures

### Scenario: Agent Crashed

1. Check Render logs for error
2. Restart service in Render dashboard
3. Run reconciliation: `POST /api/lead-agent/reconcile`
4. Verify no leads lost: Check `errors_deadletter` table

### Scenario: Database Down

1. Leads queue in memory (up to 1000)
2. Once DB back up, restart agent
3. Queued leads will be processed
4. Run reconciliation to backfill any gaps

### Scenario: Facebook Token Expired

1. Generate new token in Facebook Developer Console
2. Update `FACEBOOK_ACCESS_TOKEN` in Render environment
3. Restart service
4. Run reconciliation

### Scenario: Email Not Sending

1. Check SMTP credentials
2. Verify Gmail App Password still valid
3. Check notification_log table for failures
4. Leads still being saved (notifications can be resent)

### Scenario: Webhook Not Receiving

1. Check Facebook webhook subscription active
2. Verify callback URL is public and accessible
3. Check Render service is running
4. Polling will capture missed leads every 5 minutes

---

## Performance Tuning

### If Handling > 1000 Leads/Day

1. **Add Redis for queue:**
   - Replace in-memory queue with Redis
   - Prevents data loss on crash

2. **Increase polling interval:**
   - `FACEBOOK_LEAD_POLL_INTERVAL=600000` (10 min)

3. **Batch notifications:**
   - Group leads into hourly batches instead of instant

4. **Add worker processes:**
   - Scale horizontally in Render

### Database Optimization

```sql
-- Archive old leads (keep raw_leads, archive leads)
-- Run monthly
INSERT INTO leads_archive
SELECT * FROM leads
WHERE created_at < DATEADD(month, -3, GETUTCDATE());

DELETE FROM leads
WHERE created_at < DATEADD(month, -3, GETUTCDATE());

-- Clean dead letter queue
DELETE FROM errors_deadletter
WHERE created_at < DATEADD(day, -30, GETUTCDATE())
AND reprocessed = 1;
```

---

## Metrics & KPIs

Track these over time:

| Metric | Target | Alert If |
|--------|--------|----------|
| Webhook success rate | > 95% | < 90% |
| Polling finds gaps | < 5% | > 20% |
| Duplicate rate | < 2% | > 10% |
| Notification delivery | > 98% | < 95% |
| Average latency | < 5s | > 30s |
| Error rate | < 0.1% | > 1% |

---

## Security Checklist

- [ ] FACEBOOK_APP_SECRET is set (for webhook signature validation)
- [ ] Webhook signature validation is enabled
- [ ] All tokens in environment variables (not code)
- [ ] HTTPS only for webhook endpoint
- [ ] Database uses encrypted connection
- [ ] Email uses TLS
- [ ] No sensitive data in logs
- [ ] Regular token rotation (60 days)

---

## Troubleshooting

### No leads being ingested

```bash
# 1. Check health
curl /api/lead-agent/health

# 2. Check Facebook token
curl /api/lead-agent/health/facebook

# 3. Check database
curl /api/lead-agent/health/db

# 4. Check stats
curl /api/lead-agent/stats

# 5. Manual reconciliation
curl -X POST /api/lead-agent/reconcile
```

### Webhook not working

```sql
-- Check if webhooks are being received
SELECT COUNT(*) FROM raw_leads WHERE source = 'webhook';

-- If 0, webhooks not configured or failing signature validation
-- Check errors_deadletter for signature failures
SELECT * FROM errors_deadletter WHERE error_type = 'invalid_signature';
```

### Notifications not sending

```sql
-- Check notification log
SELECT status, COUNT(*) FROM notification_log GROUP BY status;

-- Check failed notifications
SELECT * FROM notification_log WHERE status = 'failed';
```

---

## Success Criteria

After deployment, you should see:

✅ Agent health returns 200
✅ Polling runs every 5 minutes (check logs)
✅ Test lead submitted → appears in database within 10 seconds
✅ Email notification received within 30 seconds
✅ Daily digest arrives at 8 AM
✅ Audit trail in agent_activity_log
✅ Zero errors in errors_deadletter

---

## Support & Maintenance

**Documentation:**
- Architecture: `LEAD-AGENT-ARCHITECTURE.md`
- Database Schema: `database/lead-agent-schema.sql`
- Agent Code: `server/agents/leadMonitoringAgent.js`
- API Routes: `server/routes/leadAgent.js`

**Monitoring URLs:**
- Health: `/api/lead-agent/health`
- Stats: `/api/lead-agent/stats`
- Recent Leads: `/api/lead-agent/leads/recent`
- Failed Events: `/api/lead-agent/failed-events`

**Contact:**
- Check Render logs first
- Review errors_deadletter table
- Check Facebook webhook delivery logs
- Verify email in spam folder
