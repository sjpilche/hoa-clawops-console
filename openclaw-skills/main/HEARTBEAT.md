# HEARTBEAT.md

## Autonomous Health Monitoring for ClawOps Console

This agent runs recurring health checks every 30 minutes to verify all critical systems are online and responsive.

---

## Tasks

### Every 30 Minutes: System Health Check

```yaml
task: "Check if all critical services are online"
frequency: "0 */30 * * * *"  # Every 30 minutes
actions:
  - name: "Verify OpenClaw Gateway"
    command: |
      Check if port 18789 is listening:
      - If listening: Gateway is online ✓
      - If not listening: Alert: "Gateway offline — run `openclaw gateway start`"

  - name: "Verify Database"
    command: |
      Query SQLite database:
      - SELECT COUNT(*) FROM agents;
      - If query succeeds: Database online ✓
      - If query fails: Alert: "Database error — check permissions"

  - name: "Verify Trader Service"
    command: |
      Check if port 3002 is listening:
      - If listening: Trader online ✓
      - If not listening: Alert: "Trader offline — run `npm run dev:trader`"

  - name: "Count Agents Online"
    command: |
      Query: SELECT COUNT(*) FROM agents WHERE status='active';
      - Report: "X/27 agents active"
```

### Every 2 Hours: Agent Activity Summary

```yaml
task: "Generate summary of agent activity in last 2 hours"
frequency: "0 */2 * * * *"  # Every 2 hours
actions:
  - name: "Count recent runs"
    command: |
      SELECT COUNT(*) FROM runs
      WHERE created_at > datetime('now', '-2 hours')
      AND status IN ('completed', 'failed');

  - name: "Calculate costs"
    command: |
      SELECT SUM(cost_usd) FROM runs
      WHERE created_at > datetime('now', '-2 hours');

  - name: "Report"
    command: |
      Output summary:
      - Runs in last 2h: X
      - Total cost: $Y
      - Avg cost per run: $Z
      - Status: [Green/Yellow/Red] based on error rate
```

### Daily at 6:00 AM: Full System Report

```yaml
task: "Generate comprehensive system health report"
frequency: "0 6 * * *"  # Daily at 6 AM
actions:
  - name: "Agent status"
    command: |
      SELECT name, status, COUNT(*) as runs,
             AVG(CASE WHEN status='completed' THEN 1 ELSE 0 END) as success_rate
      FROM agents a
      LEFT JOIN runs r ON a.id = r.agent_id
      WHERE r.created_at > datetime('now', '-7 days')
      GROUP BY a.name
      ORDER BY runs DESC;

  - name: "Cost trends"
    command: |
      For each of last 7 days:
      - Total cost
      - Agent count running
      - Average run duration

  - name: "Alerts"
    command: |
      Check for:
      - Agents with >50% failure rate → Alert
      - Costs 20% above average → Alert
      - Any service offline → Critical alert
      - Agent rate limit warnings → Warning
```

---

## Configuration

- **Check interval**: 30 minutes (default — adjustable)
- **Alert destination**: Console logs (can extend to Slack/email via POST hooks)
- **Data retention**: Keep last 7 days of run history for trend analysis
- **Thresholds**:
  - Success rate threshold: 70%
  - Daily cost threshold: $10 (triggers warning)
  - Agent response timeout: 60 seconds

---

## Example Output

```
[HEARTBEAT] 2026-02-20T14:30:00Z
✓ OpenClaw Gateway: Online (port 18789)
✓ Database: Online (27 agents, 450 runs total)
✓ Trader Service: Online (port 3002, $100K equity)
✓ Agents: 8/27 active

[SUMMARY] Last 2 hours:
  - Runs: 12 completed, 1 failed
  - Cost: $0.31 (avg $0.024/run)
  - Uptime: 98.3%

[STATUS] All systems nominal ✓
```

---

## Extending HEARTBEAT.md

To add custom monitoring:

1. Add a new task block with `task`, `frequency`, and `actions`
2. Use standard OpenClaw syntax (shell commands, SQL queries, API calls)
3. For alerts, use: `Alert: "message"` (will be caught by logging system)
4. For structured output, use JSON format in `actions[].command`

Example:

```yaml
task: "Monitor specific agent performance"
frequency: "0 */6 * * *"  # Every 6 hours
actions:
  - name: "Check hoa-content-writer"
    command: |
      SELECT COUNT(*) as runs,
             AVG(CAST(json_extract(result_data, '$.tokensUsed') AS FLOAT)) as avg_tokens
      FROM runs
      WHERE agent_id = (SELECT id FROM agents WHERE name = 'hoa-content-writer')
      AND created_at > datetime('now', '-6 hours');
```
