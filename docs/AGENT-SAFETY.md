# Agent Safety Model

## Core Principle

**Every agent action follows this flow:**

```
User Intent → Confirmation Gate → Execution → Audit Log
```

There is NO path from intent to execution without logging.

## Safety Layers

### 1. Confirmation Gates
Every agent run requires explicit user confirmation via a dialog.
Destructive actions (delete, write operations) require double confirmation.

### 2. Budget Enforcement
- Max tokens per run (hard stop, not warning)
- Max cost per run in USD (hard stop)
- Max duration per run in seconds (hard stop)
- Max concurrent agents (queue excess)
- Max runs per hour (rate limiting)

### 3. Domain Allowlist
Agents can ONLY navigate to pre-approved domains.
This prevents agents from accessing unauthorized systems.

### 4. Action Permissions
Each agent has a permission level: read-only, read-write, or form-submit.
This controls what the agent can do on target systems.

### 5. Kill Switch
Global emergency stop button — always visible in the header.
Kills ALL running agents immediately. Double-click to activate.

### 6. Credential Vault
Credentials are AES-256 encrypted at rest in SQLite.
Never displayed in the UI, never logged, never sent to chat.

### 7. Audit Trail
Every API call is logged in the audit_log table.
Records: who, what, when, where, outcome.
Append-only — audit records are never modified or deleted.

### 8. PII Detection
Logs and chat display mask detected PII (SSNs, account numbers).
Configurable via settings.

### 9. Data Retention
Auto-purge results older than configured retention period.
Default: 90 days.
