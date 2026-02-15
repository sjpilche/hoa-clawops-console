# Blitz Mode - Implementation Plan

## 🎯 Goal
Create a "Blitz" feature that runs all 6 HOA agents sequentially with test prompts and displays their outputs for evaluation.

## 📋 Requirements

### Core Features
1. **Run All Agents** - Execute each agent once with appropriate test prompt
2. **Capture Output** - Store full response from each agent
3. **Real-Time Progress** - Show which agent is currently running
4. **Results Display** - Show all outputs in a readable format
5. **Error Handling** - Continue even if one agent fails
6. **Timing Metrics** - Track execution time per agent

### Agent Test Prompts
Each agent gets a realistic task:

| Agent | Test Prompt |
|-------|-------------|
| **HOA Content Writer** | "Write a 300-word blog post about why HOAs should build reserve funds gradually rather than using special assessments" |
| **HOA Social Media** | "Create 3 LinkedIn posts (each 150 words) about HOA reserve funding best practices" |
| **HOA Social Engagement** | "Review the top Reddit post in r/HOA about special assessments and draft a helpful, non-salesy response" |
| **HOA Email Campaigns** | "Create a 3-email drip campaign for HOA boards considering financing options" |
| **HOA CMS Publisher** | "Generate metadata and SEO tags for a blog post titled 'HOA Reserve Study Guide 2026'" |
| **HOA Networker** | "Scan the Lead Gen queue and provide a brief summary of the top 3 opportunities by relevance score" |

## 🏗️ Architecture

### Backend API
**File:** `server/routes/blitz.js`

```javascript
POST /api/blitz/run
  → Runs all agents sequentially
  → Returns blitz_run_id

GET /api/blitz/status/:runId
  → Returns current status and progress

GET /api/blitz/results/:runId
  → Returns all agent outputs
```

### Database Schema
**Add to:** `server/db/schema.sql`

```sql
CREATE TABLE IF NOT EXISTS blitz_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT DEFAULT 'running',
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  total_agents INTEGER DEFAULT 6,
  completed_agents INTEGER DEFAULT 0,
  failed_agents INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS blitz_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  blitz_run_id INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  output TEXT,
  status TEXT DEFAULT 'pending',
  started_at TEXT,
  completed_at TEXT,
  duration_ms INTEGER,
  error TEXT,
  FOREIGN KEY (blitz_run_id) REFERENCES blitz_runs(id)
);
```

### Frontend UI
**File:** `src/pages/BlitzPage.jsx`

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  🚀 Blitz Mode - Run All Agents                 │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │  [▶️ Start Blitz Run]  [📊 View History] │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  Progress: 3/6 agents completed                │
│  ████████░░░░░░░░ 50%                           │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │ ✅ HOA Content Writer (2.3s)             │  │
│  │    Output: [300 words generated...]      │  │
│  │    [View Full Output]                    │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │ ✅ HOA Social Media (3.1s)               │  │
│  │    Output: [3 LinkedIn posts...]         │  │
│  │    [View Full Output]                    │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │ ⏳ HOA Social Engagement (running...)    │  │
│  │    Started 5s ago...                     │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │ ⏸️ HOA Email Campaigns (pending...)      │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
└─────────────────────────────────────────────────┘
```

## 📝 Implementation Steps

### Phase 1: Database Schema (5 min)
1. Add blitz tables to schema.sql
2. Restart server to apply schema

### Phase 2: Backend API (15 min)
1. Create `server/routes/blitz.js`
2. Implement run logic with openclawBridge
3. Add status and results endpoints
4. Register routes in server/index.js

### Phase 3: Frontend UI (20 min)
1. Create `src/pages/BlitzPage.jsx`
2. Add real-time polling for status updates
3. Create result cards with expand/collapse
4. Add to navigation sidebar

### Phase 4: Testing (10 min)
1. Run blitz with all agents
2. Verify outputs captured
3. Check error handling
4. Test UI updates

**Total Time:** ~50 minutes

## 🔧 Technical Details

### Blitz Run Algorithm
```javascript
async function runBlitz(userId) {
  // 1. Create blitz run record
  const runId = await db.run('INSERT INTO blitz_runs ...');

  // 2. Get all active agents
  const agents = await db.all('SELECT * FROM agents WHERE status = "active"');

  // 3. For each agent, run sequentially
  for (const agent of agents) {
    const prompt = getTestPrompt(agent.name);

    // Create result record
    await db.run('INSERT INTO blitz_results (blitz_run_id, agent_id, prompt, status) VALUES (?, ?, ?, "running")',
      [runId, agent.id, prompt]);

    try {
      const startTime = Date.now();

      // Run agent via OpenClaw
      const result = await openclawBridge.runAgent(agent.id, {
        openclawId: agent.config.openclaw_id,
        message: prompt
      });

      const duration = Date.now() - startTime;

      // Update result
      await db.run('UPDATE blitz_results SET output = ?, status = "completed", duration_ms = ?, completed_at = datetime("now") WHERE blitz_run_id = ? AND agent_id = ?',
        [result.output, duration, runId, agent.id]);

      // Update run progress
      await db.run('UPDATE blitz_runs SET completed_agents = completed_agents + 1 WHERE id = ?', runId);

    } catch (error) {
      // Update with error
      await db.run('UPDATE blitz_results SET status = "failed", error = ?, completed_at = datetime("now") WHERE blitz_run_id = ? AND agent_id = ?',
        [error.message, runId, agent.id]);

      await db.run('UPDATE blitz_runs SET failed_agents = failed_agents + 1, completed_agents = completed_agents + 1 WHERE id = ?', runId);
    }
  }

  // 4. Mark run as completed
  await db.run('UPDATE blitz_runs SET status = "completed", completed_at = datetime("now") WHERE id = ?', runId);

  return runId;
}
```

### Real-Time Updates
Use polling (simple) or WebSocket (advanced):

**Polling (Recommended for v1):**
```javascript
// Frontend - poll every 2 seconds
useEffect(() => {
  const interval = setInterval(async () => {
    const status = await fetch(`/api/blitz/status/${runId}`);
    setBlitzStatus(status);
  }, 2000);

  return () => clearInterval(interval);
}, [runId]);
```

### Output Display
```javascript
// Truncate long outputs with "View Full" button
function OutputPreview({ output }) {
  const [expanded, setExpanded] = useState(false);
  const preview = output.slice(0, 200);

  return (
    <div>
      <pre className="text-sm">
        {expanded ? output : preview + '...'}
      </pre>
      <button onClick={() => setExpanded(!expanded)}>
        {expanded ? 'Collapse' : 'View Full Output'}
      </button>
    </div>
  );
}
```

## 🎨 UI Design

### Color Coding
- ✅ **Green** - Completed successfully
- ⏳ **Blue** - Currently running (animated)
- ⏸️ **Gray** - Pending (not started)
- ❌ **Red** - Failed with error

### Metrics Display
```
┌─────────────────────────────────────┐
│  Total Time: 18.7s                  │
│  Fastest: HOA CMS Publisher (1.2s)  │
│  Slowest: HOA Content Writer (4.3s) │
│  Success Rate: 6/6 (100%)           │
└─────────────────────────────────────┘
```

## 🚀 Navigation Integration

Add to sidebar between "Lead Gen" and "Audit Log":

```javascript
// src/lib/constants.js
{ path: '/blitz', label: 'Blitz Mode', icon: 'Zap' }
```

Icon: ⚡ Zap (from lucide-react)

## 🧪 Test Prompts (Detailed)

### HOA Content Writer
```
Write a 300-word blog post about why HOAs should build reserve funds gradually rather than using special assessments. Include:
- Benefits of steady contributions
- Risks of delaying maintenance
- Impact on property values
- Real example scenario
Target audience: HOA board members
Tone: Educational, professional
```

### HOA Social Media
```
Create 3 LinkedIn posts (each 150 words max) about HOA reserve funding best practices:

Post 1: Why reserve studies matter
Post 2: How to increase reserves without shocking owners
Post 3: Common reserve fund mistakes to avoid

Format: Each post should have a hook, body, and CTA
Tone: Professional but conversational
Include 3 relevant hashtags per post
```

### HOA Social Engagement
```
You found this Reddit post in r/HOA:

Title: "Board wants to drain our reserves to avoid raising fees"
Content: "Our 80-unit condo has $150K in reserves. The board proposed using $100K for pool renovation to avoid a $1,200/unit assessment. Is this legal? Feels wrong."

Task: Draft a helpful, informative response (200 words max). Be empathetic, provide factual guidance about reserve fund best practices, and mention HOA Project Funding only if highly relevant. Focus on helping first.
```

### HOA Email Campaigns
```
Create a 3-email drip campaign for HOA boards considering financing options:

Email 1 (Day 1): Subject + Body - Introduction to HOA financing vs assessments
Email 2 (Day 3): Subject + Body - How HOA loans work (rates, terms, qualification)
Email 3 (Day 7): Subject + Body - Case study + CTA to schedule consultation

Requirements:
- Each email 200-250 words
- Professional tone
- Clear value proposition
- Soft CTAs (not pushy)
```

### HOA CMS Publisher
```
Generate metadata and SEO tags for a blog post titled "HOA Reserve Study Guide 2026"

Required fields:
- Meta description (155 characters max)
- Focus keyword
- 5 secondary keywords
- URL slug
- 3 internal link suggestions (to other HOA topics)
- Featured image description for alt text
- Category and 5 tags

Format as JSON for easy parsing.
```

### HOA Networker
```
Review the current Lead Gen queue (http://localhost:3001/api/lead-gen/networker/queue) and provide:

1. Total opportunities in queue
2. Summary of top 3 by relevance score (platform, topic, score)
3. Recommendation on which to prioritize today
4. Any patterns noticed (common pain points, platforms with most activity)

Keep response under 250 words.
```

## 📊 Success Metrics

After implementation, we should see:
- ✅ All 6 agents execute successfully
- ✅ Total run time: 15-30 seconds (depending on API speed)
- ✅ Clean, readable output for each agent
- ✅ Real-time progress updates in UI
- ✅ Easy to compare agent quality

## 🔄 Future Enhancements

### V2 Features (Optional)
1. **Parallel Execution** - Run agents concurrently (faster but less stable)
2. **Custom Prompts** - Let user edit prompts before running
3. **Scheduling** - Run blitz daily/weekly automatically
4. **Comparisons** - Compare outputs from multiple runs
5. **Export** - Download all outputs as PDF/CSV
6. **Rating System** - Let user rate each output (1-5 stars)
7. **A/B Testing** - Run same prompt with different models

---

## 🎯 Implementation Order

1. ✅ Database schema
2. ✅ Backend API routes
3. ✅ Test backend with curl
4. ✅ Frontend UI page
5. ✅ Navigation integration
6. ✅ End-to-end test
7. ✅ Polish and UX improvements

**Let's build it!** 🚀
