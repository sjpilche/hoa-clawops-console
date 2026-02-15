# Validation Migration Guide

## Overview

This guide shows how to apply Zod validation schemas to all API endpoints using the new validation middleware.

**Status**: ✅ Auth routes completed, remaining routes pending

---

## What Was Created

### Validation Schemas (`server/schemas/`)
- ✅ `common.schema.js` - Shared schemas (UUID, email, password, enums)
- ✅ `auth.schema.js` - Login, register validation
- ✅ `agent.schema.js` - Agent CRUD validation
- ✅ `chat.schema.js` - Thread and message validation
- ✅ `run.schema.js` - Run history validation
- ✅ `settings.schema.js` - System settings validation
- ✅ `index.js` - Exports all schemas

### Validation Middleware (`server/middleware/validator.js`)
- ✅ `validateBody(schema)` - Validate request body
- ✅ `validateParams(schema)` - Validate route parameters
- ✅ `validateQuery(schema)` - Validate query parameters
- ✅ `validateMultiple({ body, params, query })` - Validate multiple targets

### Applied Validations
- ✅ **Auth Routes** (`server/routes/auth.js`)
  - POST `/api/auth/login` - loginSchema
  - POST `/api/auth/register` - registerSchema

---

## Migration Steps for Remaining Routes

### 1. Agents Routes (`server/routes/agents.js`)

#### Import validation
```javascript
const { validateBody, validateParams, validateQuery, validateMultiple } = require('../middleware/validator');
const {
  createAgentSchema,
  updateAgentSchema,
  runAgentSchema,
  agentIdParamSchema,
  listAgentsQuerySchema,
} = require('../schemas');
```

#### Apply validation to routes
```javascript
// GET /api/agents?status=running&permissions=read-only
router.get('/', validateQuery(listAgentsQuerySchema), (req, res, next) => {
  // Use req.validated.query for validated query params
});

// GET /api/agents/:id
router.get('/:id', validateParams(agentIdParamSchema), (req, res, next) => {
  // Use req.validated.params.id for validated ID
});

// POST /api/agents
router.post('/', validateBody(createAgentSchema), (req, res, next) => {
  // Use req.validated.body for validated data
  const { name, description, target_system, config, domains, permissions } = req.validated.body;
});

// PUT /api/agents/:id
router.put(
  '/:id',
  validateMultiple({
    params: agentIdParamSchema,
    body: updateAgentSchema,
  }),
  (req, res, next) => {
    // Use req.validated.params.id and req.validated.body
  }
);

// DELETE /api/agents/:id
router.delete('/:id', validateParams(agentIdParamSchema), (req, res, next) => {
  const agentId = req.validated.params.id;
});

// POST /api/agents/:id/run
router.post(
  '/:id/run',
  validateMultiple({
    params: agentIdParamSchema,
    body: runAgentSchema,
  }),
  async (req, res, next) => {
    const agentId = req.validated.params.id;
    const { message, sessionId, json } = req.validated.body;
  }
);
```

---

### 2. Chat Routes (`server/routes/chat.js`)

#### Import validation
```javascript
const { validateBody, validateParams, validateQuery, validateMultiple } = require('../middleware/validator');
const {
  createThreadSchema,
  threadIdParamSchema,
  createMessageSchema,
  listMessagesQuerySchema,
} = require('../schemas');
```

#### Apply validation to routes
```javascript
// GET /api/chat/threads
router.get('/threads', (req, res, next) => {
  // No validation needed (no params/query)
});

// POST /api/chat/threads
router.post('/threads', validateBody(createThreadSchema), (req, res, next) => {
  const { title } = req.validated.body;
});

// GET /api/chat/threads/:id
router.get(
  '/threads/:id',
  validateParams(threadIdParamSchema),
  (req, res, next) => {
    const threadId = req.validated.params.id;
  }
);

// POST /api/chat/threads/:id/messages
router.post(
  '/threads/:id/messages',
  validateMultiple({
    params: threadIdParamSchema,
    body: createMessageSchema,
  }),
  async (req, res, next) => {
    const threadId = req.validated.params.id;
    const { content, sender_type, msg_type, metadata } = req.validated.body;
  }
);
```

---

### 3. Runs Routes (`server/routes/runs.js`)

#### Import validation
```javascript
const { validateParams, validateQuery, validateMultiple } = require('../middleware/validator');
const {
  listRunsQuerySchema,
  runIdParamSchema,
  updateRunSchema,
} = require('../schemas');
```

#### Apply validation to routes
```javascript
// GET /api/runs?agent_id=xxx&status=running&limit=100
router.get('/', validateQuery(listRunsQuerySchema), (req, res, next) => {
  const { agent_id, status, limit, offset, start_date, end_date } = req.validated.query;
});

// GET /api/runs/:id
router.get('/:id', validateParams(runIdParamSchema), (req, res, next) => {
  const runId = req.validated.params.id;
});

// PUT /api/runs/:id (update run status/results)
router.put(
  '/:id',
  validateMultiple({
    params: runIdParamSchema,
    body: updateRunSchema,
  }),
  (req, res, next) => {
    const runId = req.validated.params.id;
    const { status, error, result, cost, tokens_used, duration_ms } = req.validated.body;
  }
);
```

---

### 4. Settings Routes (`server/routes/settings.js`)

#### Import validation
```javascript
const { validateBody, validateParams } = require('../middleware/validator');
const {
  updateSettingsSchema,
  settingKeyParamSchema,
  updateSettingSchema,
} = require('../schemas');
```

#### Apply validation to routes
```javascript
// GET /api/settings
router.get('/', (req, res, next) => {
  // No validation needed
});

// PUT /api/settings (bulk update)
router.put('/', validateBody(updateSettingsSchema), (req, res, next) => {
  const {
    max_concurrent_agents,
    max_cost_per_run,
    max_duration_per_run,
    // ... all other settings
  } = req.validated.body;
});

// GET /api/settings/:key
router.get('/:key', validateParams(settingKeyParamSchema), (req, res, next) => {
  const key = req.validated.params.key;
});

// POST /api/settings/:key
router.post(
  '/:key',
  validateMultiple({
    params: settingKeyParamSchema,
    body: updateSettingSchema,
  }),
  (req, res, next) => {
    const key = req.validated.params.key;
    const { value } = req.validated.body;
  }
);
```

---

## Benefits of Validation

### 1. Security
- ✅ Prevents SQL injection via validated UUIDs
- ✅ Blocks XSS via string length limits
- ✅ Prevents DoS via size limits (10KB messages, 100 agents/page)
- ✅ Type coercion prevents type confusion attacks

### 2. Data Integrity
- ✅ Email format validation
- ✅ UUID format validation
- ✅ Enum validation (status, permissions, roles)
- ✅ Numeric range validation (costs, durations, tokens)

### 3. Developer Experience
- ✅ Clear error messages with field names
- ✅ Auto-complete in IDEs (TypeScript-like)
- ✅ Centralized validation logic
- ✅ Easy to test and maintain

### 4. API Documentation
- ✅ Schemas serve as living documentation
- ✅ Clear parameter requirements
- ✅ Type information for clients

---

## Testing Validation

### Test valid input
```javascript
// Should succeed
POST /api/agents
{
  "name": "Invoice Extractor",
  "permissions": "read-only",
  "domains": ["example.com", "*.example.com"]
}
```

### Test invalid input
```javascript
// Should fail with 400 - name too long
POST /api/agents
{
  "name": "A".repeat(101), // Exceeds 100 char limit
  "permissions": "read-only"
}

// Should fail with 400 - invalid email
POST /api/auth/login
{
  "email": "notanemail",
  "password": "test123"
}

// Should fail with 400 - weak password
POST /api/auth/register
{
  "email": "test@example.com",
  "password": "weak" // Too short, no numbers
}

// Should fail with 400 - invalid UUID
GET /api/agents/not-a-uuid

// Should fail with 400 - invalid status
GET /api/runs?status=invalid_status
```

---

## Error Response Format

When validation fails, the API returns:

```json
{
  "error": "name: Agent name must not exceed 100 characters",
  "code": "VALIDATION_ERROR",
  "status": 400,
  "metadata": [
    {
      "field": "name",
      "message": "Agent name must not exceed 100 characters",
      "code": "too_big"
    }
  ]
}
```

---

## Next Steps

1. **Apply validation to remaining routes** (agents, chat, runs, settings)
2. **Write unit tests** for validation schemas
3. **Write integration tests** for validated endpoints
4. **Update API documentation** with validation rules

---

## Common Patterns

### Validate body only
```javascript
router.post('/endpoint', validateBody(schema), handler);
```

### Validate params only
```javascript
router.get('/endpoint/:id', validateParams(idParamSchema), handler);
```

### Validate query only
```javascript
router.get('/endpoint', validateQuery(querySchema), handler);
```

### Validate multiple targets
```javascript
router.put(
  '/endpoint/:id',
  validateMultiple({ params: idParamSchema, body: updateSchema }),
  handler
);
```

### Access validated data
```javascript
const { field1, field2 } = req.validated.body;
const { id } = req.validated.params;
const { limit, offset } = req.validated.query;
```

---

## Troubleshooting

### "req.validated is undefined"
- Ensure validation middleware is applied before the route handler
- Check that the schema is imported correctly

### "Validation passes but data is wrong"
- Check the schema definition - ensure correct types and constraints
- Verify you're using `req.validated` instead of `req.body`

### "Validation fails for valid data"
- Check for typos in field names
- Verify enum values match exactly (case-sensitive)
- Check min/max constraints are appropriate

---

## Migration Checklist

- [x] Create common schemas
- [x] Create auth schemas
- [x] Create agent schemas
- [x] Create chat schemas
- [x] Create run schemas
- [x] Create settings schemas
- [x] Create validation middleware
- [x] Apply to auth routes
- [ ] Apply to agent routes
- [ ] Apply to chat routes
- [ ] Apply to run routes
- [ ] Apply to settings routes
- [ ] Apply to results routes (if exists)
- [ ] Write validation tests
- [ ] Update API documentation
