# How to Run Your HOA Agents

## ✅ Agents Registered

All 6 agents are now registered with OpenClaw:

1. **hoa-networker** - Lead Gen community engagement
2. **hoa-content-writer** - Blog posts and articles
3. **hoa-social-media** - Social media posts
4. **hoa-social-engagement** - Social monitoring
5. **hoa-email-campaigns** - Email sequences
6. **hoa-cms-publisher** - WordPress publishing

---

## 🚀 How to Run Agents

### Option 1: Via Dashboard (Recommended)

1. **Navigate to Agents Page**
   - Go to http://localhost:5174
   - Click "Agents" in the sidebar
   - You should see all 6 agents listed

2. **Click an Agent**
   - Click on "HOA Networker" (or any agent)
   - You'll see the agent detail page

3. **Run the Agent**
   - Look for a "Run" or "Execute" button
   - Enter a prompt/task
   - Click "Run"

---

### Option 2: Via OpenClaw Gateway (CLI)

**NOTE:** This requires the OpenClaw Gateway to be running.

```bash
# Start the Gateway (if not already running)
openclaw daemon start

# Run an agent via Gateway
openclaw agent --agent hoa-networker --message "Your task here"
```

**Example Tasks:**

```bash
# HOA Networker - Scan Reddit for opportunities
openclaw agent --agent hoa-networker --message "Scan r/HOA for posts about special assessments in the last 24 hours"

# Content Writer - Create a blog post
openclaw agent --agent hoa-content-writer --message "Write a 500-word blog post about HOA reserve studies"

# Social Media - Create posts
openclaw agent --agent hoa-social-media --message "Create 3 LinkedIn posts about HOA financing options"
```

---

### Option 3: Via API (Programmatic)

From your ClawOps Console backend, you can trigger agents programmatically:

```javascript
// In your server code
const { exec } = require('child_process');

function runAgent(agentId, message) {
  return new Promise((resolve, reject) => {
    exec(
      `openclaw agent --agent ${agentId} --message "${message}" --json`,
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve(JSON.parse(stdout));
        }
      }
    );
  });
}

// Usage
const result = await runAgent('hoa-networker', 'Scan Reddit for opportunities');
```

---

## 🔄 Automated Scheduling

### Create Schedules in Dashboard

1. Go to http://localhost:5174/schedule
2. Click "Add Schedule"
3. Configure:
   - **Name:** Reddit HOA Scan
   - **Cron:** `0 */2 * * *` (every 2 hours)
   - **Agent:** hoa-networker
   - **Prompt:** "Scan r/HOA for engagement opportunities"

### Schedule Templates

Templates available in `openclaw-skills/hoa-networker/schedule.json`:

| Schedule | Frequency | Purpose |
|----------|-----------|---------|
| Reddit Scan | Every 2 hours | Monitor r/HOA, r/condoassociation |
| Facebook Scan | 5x daily | Monitor Facebook groups |
| LinkedIn Scan | 2x weekdays | Monitor LinkedIn CAI groups |
| Post Approved | Every 30 min | Post approved responses |
| Track Engagement | Daily 8pm | Update metrics |

---

## 🧪 Testing Lead Gen Workflow

### End-to-End Test:

1. **Check Queue**
   ```bash
   curl http://localhost:3001/api/lead-gen/networker/queue
   ```

2. **Run Networker Agent**
   ```bash
   openclaw agent --agent hoa-networker --message "Review the top 3 opportunities in the Lead Gen queue and provide recommendations"
   ```

3. **Approve an Opportunity**
   - Go to http://localhost:5174/lead-gen
   - Click "Approve" on an opportunity

4. **Post Response**
   - Switch to "Approved" tab
   - Click "Post Now"

---

## ❌ Troubleshooting

### "No API key found for provider"

**Problem:** Agents are trying to run locally but don't have OpenAI API keys.

**Solution:** Run via Gateway instead:
```bash
# Don't use --local flag
openclaw agent --agent hoa-networker --message "task"
```

### "Agent not found"

**Problem:** Agent not registered.

**Solution:** List agents to verify:
```bash
openclaw agents list
```

### "Gateway not running"

**Problem:** OpenClaw Gateway daemon not started.

**Solution:**
```bash
openclaw daemon start
```

---

## 📊 Monitor Agent Performance

### View Agent Stats

```bash
# List all agents with stats
openclaw agents list

# View specific agent details
openclaw agent --agent hoa-networker --session-id test --message "status"
```

### Check Agent Logs

Agent sessions are stored in:
```
C:\Users\SPilcher\.openclaw\agents\<agent-id>\sessions\
```

---

## 🎯 Next Steps

1. **Start the Gateway:**
   ```bash
   openclaw daemon start
   ```

2. **Test an Agent:**
   ```bash
   openclaw agent --agent hoa-networker --message "Introduce yourself"
   ```

3. **Create Schedules:**
   - Navigate to http://localhost:5174/schedule
   - Add automated tasks

4. **Monitor Results:**
   - Navigate to http://localhost:5174/results
   - View agent execution logs

---

## 🔑 Key Differences

| Method | Requires Gateway | Uses API Keys | Best For |
|--------|------------------|---------------|----------|
| Dashboard | Yes | No (Gateway handles auth) | Manual tasks |
| CLI (Gateway) | Yes | No (Gateway handles auth) | Testing, automation |
| CLI (Local) | No | Yes (your own keys) | Development |
| API | Yes | No (Gateway handles auth) | Integration |

---

**Your agents are registered and ready to run!** 🚀

Start the Gateway with `openclaw daemon start` and test with the dashboard or CLI.
