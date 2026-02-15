# Quick Start Guide - HOA Agent Fleet Phase 1

## 🚀 Get Started in 5 Minutes

### Step 1: Install Dependencies

```bash
npm install
```

This installs the 6 new packages we added:
- `redis` - Distributed state management
- `multer` - File upload handling
- `pdf-parse` - PDF extraction
- `tesseract.js` - OCR processing
- `playwright` - Browser automation
- `prom-client` - Prometheus metrics

---

### Step 2: Start Redis

```bash
# Start Redis in the background
docker-compose up -d redis

# Verify it's running
docker ps
# You should see: openclaw-redis

# Test connection
docker exec -it openclaw-redis redis-cli ping
# Expected output: PONG
```

**Optional**: Start Redis Commander (Web UI)
```bash
# Uncomment the redis-commander service in docker-compose.yml first
docker-compose up -d redis redis-commander

# Open browser to http://localhost:8081
```

---

### Step 3: Start the Server

The server will automatically:
1. Apply the database schema (8 new tables)
2. Connect to Redis
3. Initialize the workflow engine

```bash
npm run dev
```

You should see:
```
[Database] Schema applied successfully
[Database] Ready
[Redis] Main client connected
[Redis] Subscriber connected
[Redis] Publisher connected
[Redis] All clients connected successfully
Server running on http://localhost:3001
```

---

### Step 4: Test the Workflow Engine

Open a new terminal and test workflow creation:

```bash
# Start Node.js REPL
node

# In the REPL:
```

```javascript
// Load modules
const redisClient = require('./server/services/redisClient');
const { workflowEngine } = require('./server/services/agentOrchestrator');

// Connect to Redis
await redisClient.connect();

// Create a test workflow
const workflowId = await workflowEngine.startFundingWorkflow('test-lead-001', {
  loanAmount: 250000,
  hoaState: 'FL',
  hoaUnits: 120
});

console.log('✅ Workflow created:', workflowId);

// Check Redis state
const state = await redisClient.getWorkflowState(workflowId);
console.log('📊 Workflow state:', JSON.stringify(state, null, 2));

// Monitor all workflows
const workflows = await workflowEngine.monitorWorkflows();
console.log('📈 Active workflows:', workflows.length);
```

**Expected Output**:
```javascript
✅ Workflow created: a1b2c3d4-e5f6-7890-abcd-ef1234567890
📊 Workflow state: {
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "lead_id": "test-lead-001",
  "stage": "intake",
  "status": "in_progress",
  "progress": 0,
  "tasks": {
    "lending_research": { "status": "pending", "progress": 0 },
    "compliance_check": { "status": "pending", "progress": 0 },
    "document_prep": { "status": "pending", "progress": 0 }
  },
  "results": {
    "loan_options": [],
    "compliance_issues": [],
    "documents": []
  }
}
📈 Active workflows: 1
```

---

### Step 5: Verify Database

Check that the workflow was saved to SQLite:

```bash
# Using sqlite3 CLI (if installed)
sqlite3 data/clawops.db "SELECT id, lead_id, current_stage, status FROM funding_workflows;"

# Or using Node.js
node -e "const db = require('./server/db/connection'); console.log(db.all('SELECT * FROM funding_workflows'));"
```

---

## 🔍 Verify Everything Works

### Health Checks

**Redis Health**:
```bash
docker exec -it openclaw-redis redis-cli ping
# Expected: PONG
```

**Database Health**:
```bash
sqlite3 data/clawops.db "SELECT COUNT(*) as table_count FROM sqlite_master WHERE type='table';"
# Expected: 28 tables (20 existing + 8 new)
```

**Redis Connection from Node**:
```javascript
const redisClient = require('./server/services/redisClient');
await redisClient.connect();
const health = await redisClient.healthCheck();
console.log(health);
// Expected: { healthy: true, connected: true, message: 'Redis operational' }
```

---

## 🎯 What You Can Do Now

### 1. Create Workflows
```javascript
const { workflowEngine } = require('./server/services/agentOrchestrator');

const wfId = await workflowEngine.startFundingWorkflow('lead-123', {
  loanAmount: 300000,
  hoaState: 'CA'
});
```

### 2. Use Task Queues
```javascript
const { taskQueue } = require('./server/services/agentOrchestrator');

// Push task
await taskQueue.push('lending-tasks', {
  workflow_id: wfId,
  task_type: 'scrape_lender',
  platform: 'creditunion.com'
});

// Pop task (blocking)
const task = await taskQueue.pop('lending-tasks', 30);
console.log(task);

// Check queue length
const length = await taskQueue.getLength('lending-tasks');
console.log('Queue length:', length);
```

### 3. Pub/Sub Messaging
```javascript
const redisClient = require('./server/services/redisClient');

// Subscribe to channel
await redisClient.subscribe('hoa-funding:coordinator-tasks', (message) => {
  console.log('Received:', message);
});

// Publish message
await redisClient.publish('hoa-funding:coordinator-tasks', {
  workflow_id: wfId,
  task_type: 'orchestrate_workflow'
});
```

### 4. Agent Coordination
```javascript
const { agentCoordinator } = require('./server/services/agentOrchestrator');

// Get available agents
const agents = await agentCoordinator.getAvailableAgents('lending');
console.log('Available agents:', agents);

// Assign task to agent
const agentId = await agentCoordinator.assignTask('lending', {
  task_type: 'scrape_lender'
});

// Release agent
await agentCoordinator.releaseAgent(agentId, true);
```

---

## 📊 View Live Data

### Redis Commander (Optional)
1. Uncomment `redis-commander` service in `docker-compose.yml`
2. Run: `docker-compose up -d redis-commander`
3. Open: http://localhost:8081
4. Explore:
   - `workflow:*` keys - Workflow states
   - `queue:*` keys - Task queues
   - `agent:*` keys - Agent heartbeats

### Database Browser
```bash
# View all workflows
sqlite3 data/clawops.db "SELECT * FROM funding_workflows;"

# View all tables
sqlite3 data/clawops.db ".tables"

# View schema for specific table
sqlite3 data/clawops.db ".schema lending_products"
```

---

## 🛠️ Troubleshooting

### Redis Won't Start
```bash
# Check if port 6379 is in use
netstat -an | grep 6379

# Stop existing Redis
docker-compose down

# Remove volumes and restart
docker-compose down -v
docker-compose up -d redis
```

### Database Schema Not Applied
```bash
# Manually apply schema
node -e "const db = require('./server/db/connection'); db.initDatabase().then(() => console.log('Done'));"
```

### Connection Errors
```javascript
// Check if Redis is running
const redisClient = require('./server/services/redisClient');
await redisClient.connect();
// If this fails, Redis is not running

// Check database
const db = require('./server/db/connection');
console.log(db.getDb()); // Should not throw
```

---

## 📚 Next Steps

### Ready for Phase 2?
See [PHASE-1-COMPLETE.md](PHASE-1-COMPLETE.md) for details on Phase 2: Document Processing

**Phase 2 Goals**:
- Build document upload API
- Implement PDF/OCR extraction
- Create 3 document specialist agents
- Achieve 85%+ extraction accuracy

---

## 🔗 Useful Commands

```bash
# Development
npm run dev              # Start server + client
npm run dev:server       # Server only
npm run dev:client       # Client only

# Docker
docker-compose up -d redis           # Start Redis
docker-compose logs -f redis         # View Redis logs
docker-compose down                  # Stop all services
docker-compose ps                    # List running services

# Database
sqlite3 data/clawops.db              # Open database
sqlite3 data/clawops.db ".tables"    # List tables
sqlite3 data/clawops.db ".schema"    # View schema

# Redis
docker exec -it openclaw-redis redis-cli    # Open Redis CLI
docker exec -it openclaw-redis redis-cli KEYS "*"  # List all keys
```

---

## 💡 Tips

1. **Keep Redis running** - The workflow engine needs it for state management
2. **Check logs** - Server logs show workflow events in real-time
3. **Use Redis Commander** - Great for debugging workflow states
4. **Test incrementally** - Create one workflow at a time to verify each component

---

**Status**: ✅ Phase 1 Complete - Ready for Phase 2!
