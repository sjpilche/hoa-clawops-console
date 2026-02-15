# Server — Backend for Frontend (BFF)

## What Is This?

This is a thin Express.js server that sits between the React frontend and OpenClaw.
It does NOT contain business logic — it's an orchestration and safety layer.

## Why Do We Need This?

1. **Security**: The frontend can't talk to OpenClaw directly (API keys, credentials)
2. **Safety**: Every agent action goes through audit logging and confirmation here
3. **State**: Chat history, run history, agent configs are stored in SQLite here
4. **WebSockets**: Real-time agent status updates are broadcast from here

## Architecture

```
React Frontend  →  Express BFF  →  OpenClaw
     ↕                  ↕
  Browser          SQLite DB
```

## Key Files

- `index.js` — Server entry point, middleware stack, route mounting
- `services/openclawBridge.js` — THE integration layer with OpenClaw
- `db/schema.sql` — Database schema (all tables)
- `db/connection.js` — SQLite connection and helper functions
- `middleware/auditLogger.js` — Logs every API call (safety requirement)
