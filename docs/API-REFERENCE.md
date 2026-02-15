# API Reference

Base URL: `http://localhost:3001/api`

All endpoints except `/auth/login` and `/auth/register` require:
```
Authorization: Bearer <jwt-token>
```

## Authentication

### POST /auth/login
```json
Request:  { "email": "admin@clawops.local", "password": "changeme123" }
Response: { "token": "eyJhb...", "user": { "id", "email", "name", "role" } }
```

### GET /auth/me
Returns current user info. Used to verify token on page load.

### POST /auth/register
Create a new user (admin only).

## Agents

### GET /agents
List all agents. Response: `{ "agents": [...] }`

### GET /agents/:id
Get agent details + recent runs.

### POST /agents
Create agent. Body: `{ "name", "description", "target_system", "config", "domains", "permissions" }`

### PUT /agents/:id
Update agent. Partial updates supported.

### DELETE /agents/:id
Delete agent. Fails if agent is running.

### POST /agents/:id/run
Trigger agent run (Phase 3).

## Chat

### GET /chat/threads
List threads. ### POST /chat/threads
Create thread. ### GET /chat/threads/:id
Get thread messages. ### POST /chat/threads/:id/messages
Add message.

## Runs

### GET /runs
List recent runs. Query: `?limit=50`

### GET /runs/:id
Get run details.

## Settings

### GET /settings
Get all settings as key-value map.

### PUT /settings/:key
Update a setting. Body: `{ "value": "new-value" }`

## Health

### GET /health
No auth required. Returns server status.
