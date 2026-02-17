# 🎁 Hidden Features - NOW EXPOSED!

## Overview

Your OpenClaw system has powerful features that were working behind the scenes. This document brings them into the light!

---

## 1. 💬 Chat Slash Commands

### Available Commands

Your chat interface supports **4 powerful slash commands** for agent control:

#### `/run <agent-name> <message>`
Execute an OpenClaw agent directly from chat.

**Examples:**
```
/run invoice-extractor Get latest invoices from Sage 300
/run job-reporter Pull job costs for project 12345
/run daily-digest Generate today's report
```

**Features:**
- ✅ Partial name matching (case-insensitive)
- ✅ Automatic audit logging
- ✅ Real-time status updates via WebSocket
- ✅ Creates run records in database
- ✅ Returns agent output directly in chat

#### `/list`
Show all configured agents with their status.

**Response includes:**
- Agent name
- Description
- Current status (idle/running/disabled)

#### `/stop <session-id>`
Stop a running agent session.

**Usage:**
```
/stop session-12345678-agent-uuid
```

#### `/help`
Display all available commands with examples.

---

## 2. 📧 Automatic Digest Email Watcher

### What It Does

The **DigestWatcher** service automatically monitors agent workspaces for digest files and emails them!

**Location:** [server/services/digestWatcher.js](server/services/digestWatcher.js)

### How It Works

1. **Checks every 30 seconds** for new digest files
2. **Finds** files matching pattern: `digest-YYYY-MM-DD.md`
3. **Reads** content from agent workspaces
4. **Emails** automatically to configured recipient
5. **Tracks** sent files to avoid duplicates

### Configuration

Set these environment variables in `.env.local`:

```env
# SMTP Configuration for Digest Emails
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=your-email@gmail.com

# Digest Watcher
DIGEST_RECIPIENT=steve.j.pilcher@gmail.com
DIGEST_WORKSPACE=/home/sjpilche/projects/openclaw-v1/workspaces
```

### Status

- ✅ **RUNNING** - Started automatically with server
- ✅ Watches: `/home/sjpilche/projects/openclaw-v1/workspaces`
- ✅ Recipient: `steve.j.pilcher@gmail.com`
- ✅ Check interval: 30 seconds

### View Logs

```bash
# Server logs show digest activity
[DigestWatcher] Starting digest file watcher...
[DigestWatcher] 📄 New digest found: /path/to/digest-2025-01-15.md
[DigestWatcher] ✅ Digest emailed successfully: digest-2025-01-15.md
```

---

## 3. 🔌 WebSocket Real-Time Events

### Active WebSocket Channels

Your system broadcasts real-time events that frontends can subscribe to:

#### Agent Status Events
```javascript
socket.on('agent:status', (data) => {
  // { status: 'running', agentName: 'Invoice Extractor', timestamp: '...' }
});
```

#### Agent Results
```javascript
socket.on('agent:result', (data) => {
  // { sessionId, agentId, result: '...', timestamp: '...' }
});
```

#### Agent Logs
```javascript
socket.on('agent:log', (data) => {
  // { log: 'Processing...', timestamp: '...' }
});
```

**Currently Used By:**
- Chat interface for real-time command execution
- Monitor page for agent status updates
- Results page for completion notifications

---

## 4. 🔐 Command Security Features

### Audit Logging

Every slash command is logged **before execution**:

```javascript
// Logged to audit_log table
{
  user_id: "user-uuid",
  action: "agent.run",
  resource: "agent:agent-uuid",
  details: { message: "...", command: "/run ..." },
  outcome: "pending" // Updated to "success" or "failure"
}
```

### Session Tracking

All command-triggered runs include:
- Unique session ID
- Trigger type: `'chat-command'`
- Start/end timestamps
- Duration in milliseconds
- Associated thread ID

---

## 5. 📊 Hidden Data You Can Access

### Digest Email History

Track sent digests by checking server logs:

```bash
grep "DigestWatcher" server.log
```

Or query the audit log:

```sql
SELECT * FROM audit_log
WHERE action LIKE '%digest%'
ORDER BY timestamp DESC;
```

### Slash Command History

```sql
SELECT * FROM audit_log
WHERE action = 'agent.run'
  AND details LIKE '%"command":"/run%'
ORDER BY timestamp DESC
LIMIT 50;
```

### Chat-Triggered Runs

```sql
SELECT r.*, a.name as agent_name
FROM runs r
JOIN agents a ON r.agent_id = a.id
WHERE r.trigger = 'chat-command'
ORDER BY r.started_at DESC;
```

---

## 6. 🎨 UI Enhancements to Expose Features

### Recommended Additions

#### Chat Help Button
Add a "?" button in chat UI that shows slash commands:

```jsx
<button onClick={() => sendMessage('/help')}>
  <HelpCircle /> Commands
</button>
```

#### Digest History Page
Create a page to view sent digests:

```javascript
// Endpoint: GET /api/digests
// Returns: List of sent digest emails with dates
```

#### Command Autocomplete
Add autocomplete for slash commands in chat input:

```javascript
const commands = ['/run', '/list', '/stop', '/help'];
// Show dropdown when user types '/'
```

---

## 7. 📝 Slash Command Implementation

### Command Handler Flow

From [server/services/commandHandler.js](server/services/commandHandler.js):

```javascript
1. isCommand() - Detects if message starts with '/'
2. parseCommand() - Parses command and arguments
3. executeCommand() - Executes and returns messages
4. Audit logging - Logs before and after execution
5. WebSocket broadcast - Sends real-time status
6. Database updates - Creates run records
```

### Used By

- **Chat routes** ([server/routes/chat.js](server/routes/chat.js))
- Integrated via `commandHandler.isCommand()` and `commandHandler.executeCommand()`
- Returns system messages to chat thread

---

## 8. 🚀 Quick Start Guide

### Enable Slash Commands in Chat UI

1. **Current State:** Commands work but aren't documented in UI
2. **Recommended:** Add a help panel or tooltip

Example implementation:

```jsx
// In ChatPage.jsx
const [showCommandHelp, setShowCommandHelp] = useState(false);

<div className="chat-input">
  <button onClick={() => setShowCommandHelp(!showCommandHelp)}>
    <Slash size={18} /> Commands
  </button>

  {showCommandHelp && (
    <CommandHelpPanel commands={[
      { cmd: '/run <agent> <task>', desc: 'Execute an agent' },
      { cmd: '/list', desc: 'Show all agents' },
      { cmd: '/stop <session>', desc: 'Stop running agent' },
      { cmd: '/help', desc: 'Show help' }
    ]} />
  )}
</div>
```

### View Digest History

Add this to settings or a new "Digests" page:

```javascript
// Show recent digests from server logs
fetch('/api/digests/history')
  .then(res => res.json())
  .then(data => setDigests(data.digests));
```

---

## ✅ Summary

**Hidden features now documented:**

1. **✅ Slash Commands** - /run, /list, /stop, /help (fully working)
2. **✅ Digest Watcher** - Auto-emails digest files (running 24/7)
3. **✅ WebSocket Events** - Real-time agent status (active)
4. **✅ Command Security** - Full audit logging (enabled)
5. **✅ Session Tracking** - All command runs tracked (database)

**Recommended Next Steps:**

1. Add slash command documentation to Chat UI
2. Create Digest History page
3. Add command autocomplete to chat input
4. Show WebSocket connection status in UI
5. Add "Recent Commands" widget to dashboard

---

## 📚 Files Reference

- [server/services/commandHandler.js](server/services/commandHandler.js) - Slash command logic
- [server/services/digestWatcher.js](server/services/digestWatcher.js) - Email watcher
- [server/websocket/socketServer.js](server/websocket/socketServer.js) - WebSocket setup
- [server/index.js](server/index.js:238-239) - Watcher startup

---

**Your hidden features are now exposed and ready to use!** 🎉
