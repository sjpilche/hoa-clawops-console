# ClawOps Console - Quick Start Guide

**Welcome to ClawOps Console!** This guide will get you up and running in 5 minutes.

---

## 🎯 What is ClawOps Console?

ClawOps Console is a **chat-centric command center** for managing autonomous browser agents. Instead of clicking through UIs, you command agents via chat:

```
You: /run ap-invoice-extractor
Bot: 🚀 Starting AP Invoice Extractor...
Bot: ✅ Extracted 47 invoices | 2m 14s | $0.23 cost
```

**Current Use Case:** HOA Project Funding - Complete marketing automation (lead gen, content, social media)

---

## 📋 Prerequisites

Before you start, make sure you have:

- **Node.js 18+** installed ([download here](https://nodejs.org))
- **npm** (comes with Node.js)
- **Windows, macOS, or Linux**

**Optional but recommended:**
- Git for version control
- SQLite browser for database inspection

---

## 🚀 Installation

### Step 1: Install Dependencies

Open terminal in the project directory and run:

```bash
npm install
```

This will install all required packages (~1,047 packages, takes 2-3 minutes).

---

### Step 2: Configure Environment

Copy the example environment file:

```bash
cp .env.example .env.local
```

**Edit `.env.local`** and set these required values:

```env
# Required: Change the default admin password
DEFAULT_ADMIN_PASSWORD=YourSecurePasswordHere123!

# Required: OpenAI API key (for agent intelligence)
OPENAI_API_KEY=sk-proj-your-actual-key-here

# Optional: Change server ports if needed
SERVER_PORT=3001
VITE_DEV_PORT=5173
```

**⚠️ Security Note:** Never commit `.env.local` to Git (it's already in `.gitignore`).

---

### Step 3: Initialize Database

The database will be created automatically on first run. To verify setup:

```bash
# Check if database exists
ls data/clawops.db

# If not, the server will create it on first start
```

---

## 🎮 Starting the Application

### Option 1: Windows Batch Script (Easiest)

Double-click:
```
START-CLAWOPS.bat
```

Then in a new terminal, double-click:
```
START-DASHBOARD.bat
```

### Option 2: Command Line (All Platforms)

**Terminal 1 - Start Backend:**
```bash
npm run server
```

**Terminal 2 - Start Frontend:**
```bash
npm run dev
```

### Option 3: Docker (Advanced)

```bash
docker-compose up
```

---

## 🌐 Accessing the Application

### Local Development

- **Frontend:** http://localhost:5173
- **API:** http://localhost:3001/api
- **Health Check:** http://localhost:3001/health

### Production (Render)

- **Live App:** https://hoa-clawops-console.onrender.com

---

## 🔐 First Login

1. Open **http://localhost:5173** in your browser
2. You'll see the login screen
3. Enter default credentials:
   - **Email:** `admin@clawops.local`
   - **Password:** (the one you set in `.env.local`)
4. Click **Login**

**✅ Success!** You should see the ClawOps Console dashboard.

---

## 🧭 Navigating the Interface

After login, you'll see the sidebar with these sections:

### Core Features
- **📊 Dashboard** - Overview of all agents and recent activity
- **🤖 Agents** - Manage your agent fleet (7 marketing agents)
- **💬 Chat** - Chat interface for commanding agents
- **📅 Scheduler** - Schedule automated agent runs
- **📈 Monitor** - Real-time agent execution monitoring

### Lead Generation
- **👥 Lead Gen** - Community engagement dashboard
- **📇 Contacts** - Contact/lead management

### Operations
- **📋 Audit Log** - Security and activity logs
- **💰 Costs** - Cost tracking and budget monitoring
- **⚙️ Settings** - Configuration and preferences

---

## 🚀 Running Your First Agent

### Method 1: Via Chat Interface

1. Click **Chat** in the sidebar
2. Type: `/run hoa-content-writer`
3. Press **Enter**
4. Watch the agent execute in real-time!

### Method 2: Via Agent Management

1. Click **Agents** in the sidebar
2. Find **HOA Content Writer**
3. Click **Run** button
4. Monitor progress in real-time

### Method 3: Via API

```bash
curl -X POST http://localhost:3001/api/agents/hoa-content-writer/run \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

---

## 🎯 Key Features to Explore

### 1. **Agent Fleet** (7 Marketing Agents)

Located in `openclaw-skills/` directory:

- **hoa-content-writer** - Generate blog posts and articles
- **hoa-email-campaigns** - Email marketing automation
- **hoa-social-media** - Social media posting
- **hoa-cms-publisher** - WordPress publishing
- **hoa-networker** - Lead generation and outreach
- **hoa-social-engagement** - Community engagement
- **hoa-website-publisher** - Website content management

### 2. **Facebook Lead Ads Integration**

Real-time lead capture from Facebook (< 2 seconds):

1. Go to **Lead Gen** in sidebar
2. View captured leads from Facebook
3. Leads are automatically stored in database

**Webhook URL:** https://hoa-clawops-console.onrender.com/api/facebook/webhook

### 3. **Cost Tracking**

Monitor agent execution costs:

1. Click **Costs** in sidebar
2. View per-agent, per-run, and time-based breakdowns
3. Set budget limits in Settings

### 4. **Audit Logging**

Track all user actions and agent executions:

1. Click **Audit Log** in sidebar
2. Filter by user, action, or time range
3. Export for compliance

### 5. **Scheduled Runs**

Automate agent execution:

1. Click **Scheduler** in sidebar
2. Create new schedule (daily, weekly, monthly)
3. Set time, recurrence, and agent parameters

---

## 🛠️ Configuration

### Environment Variables

Key settings in `.env.local`:

```env
# Server Configuration
SERVER_PORT=3001
VITE_DEV_PORT=5173
NODE_ENV=development

# Database
DB_PATH=./data/clawops.db

# Authentication
JWT_SECRET=<128-char auto-generated token>
JWT_EXPIRY=24h
DEFAULT_ADMIN_EMAIL=admin@clawops.local
DEFAULT_ADMIN_PASSWORD=<your secure password>

# OpenClaw Configuration
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
OPENCLAW_MODE=shell
OPENCLAW_PATH=/path/to/openclaw-v1

# Agent Limits
MAX_CONCURRENT_AGENTS=3
MAX_COST_PER_RUN=5.00
MAX_DURATION_PER_RUN=300
MAX_TOKENS_PER_RUN=100000
MAX_RUNS_PER_HOUR=20

# OpenAI API
OPENAI_API_KEY=sk-proj-your-key-here

# Email (SMTP) - Gmail
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=<app password>

# Facebook Lead Ads
FACEBOOK_APP_ID=<your app id>
FACEBOOK_PAGE_ID=<your page id>
FACEBOOK_ACCESS_TOKEN=<your access token>
FACEBOOK_WEBHOOK_VERIFY_TOKEN=<random 64-char token>

# Azure SQL Server (Optional)
AZURE_SQL_SERVER=your-server.database.windows.net
AZURE_SQL_DATABASE=your-database
AZURE_SQL_USER=your-username
AZURE_SQL_PASSWORD=your-password

# WordPress Webhook (Optional)
HOA_WEBHOOK_SECRET=<random 64-char token>
HOA_WEBHOOK_API_URL=https://your-wordpress-site.com/api
```

### Agent Configuration

Each agent has a `soul.json` file in `openclaw-skills/<agent-name>/`:

```json
{
  "name": "HOA Content Writer",
  "persona": "Professional content strategist...",
  "capabilities": ["blog_posts", "seo_optimization"],
  "max_cost": 1.00,
  "timeout": 300
}
```

Edit these files to customize agent behavior.

---

## 🧪 Testing Your Setup

### 1. Health Check

```bash
curl http://localhost:3001/health
```

Expected response:
```json
{"status": "healthy"}
```

### 2. Database Check

```bash
sqlite3 data/clawops.db "SELECT COUNT(*) FROM users;"
```

Should return at least 1 (the admin user).

### 3. Facebook Webhook Test

```bash
curl http://localhost:3001/api/facebook/webhook?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=test123
```

Should return: `test123`

### 4. Agent Execution Test

Run the test script:

```bash
node test-facebook.js
```

---

## 🐛 Troubleshooting

### Issue: "Port already in use"

**Solution:** Change ports in `.env.local`:
```env
SERVER_PORT=3002
VITE_DEV_PORT=5174
```

### Issue: "Database file not found"

**Solution:** Create the data directory:
```bash
mkdir -p data
```

Then restart the server (it will create the database automatically).

### Issue: "Cannot connect to API"

**Check:**
1. Backend server is running (port 3001)
2. Frontend is pointing to correct API URL
3. No firewall blocking the ports

```bash
# Test API connectivity
curl http://localhost:3001/api/health
```

### Issue: "Authentication failed"

**Solutions:**
1. Check JWT_SECRET is set in `.env.local`
2. Clear browser cookies/localStorage
3. Restart the server
4. Try creating a new user

### Issue: "Facebook webhook verification failed"

**Check:**
1. FACEBOOK_WEBHOOK_VERIFY_TOKEN matches in Facebook Developer Console
2. Webhook URL is correct (https://your-domain.com/api/facebook/webhook)
3. Render service is running (not sleeping)

---

## 📚 Next Steps

### For Lead Generation:
- **[Lead Gen Guide](docs/archive/lead-gen/)** - Setup Facebook Lead Ads, lead scoring, CRM integration
- **[Facebook Integration](docs/FACEBOOK-INTEGRATION.md)** - Complete technical documentation

### For Marketing Automation:
- **[Marketing Guide](docs/archive/marketing/)** - Email campaigns, social media, content strategy
- **[Agent Configuration](openclaw-skills/)** - Customize agent personas and capabilities

### For Development:
- **[Project Structure](PROJECT-STRUCTURE.md)** - Directory structure and architecture
- **[API Reference](docs/API-REFERENCE.md)** - Complete API documentation
- **[Testing Guide](TESTING-GUIDE.md)** - Unit, integration, and E2E testing

### For Security:
- **[Security Guide](docs/AGENT-SAFETY.md)** - Agent safety and security best practices
- **[Secret Rotation](docs/SECRET-ROTATION.md)** - How to rotate API keys and tokens
- **[Backup & Restore](docs/BACKUP-RESTORE.md)** - Database backup procedures

---

## 📞 Support & Resources

### Documentation
- **[Project Inventory](PROJECT-INVENTORY.md)** - Complete project overview
- **[Audit Report](PROJECT-AUDIT-REPORT.md)** - Security and health status
- **[Roadmap](ROADMAP.md)** - Future development plans

### External Resources
- **Production App:** https://hoa-clawops-console.onrender.com
- **GitHub Repository:** https://github.com/sjpilche/hoa-clawops-console
- **Facebook Developer Console:** https://developers.facebook.com
- **Render Dashboard:** https://dashboard.render.com

### Getting Help
- Check **[Troubleshooting Guide](docs/TROUBLESHOOTING.md)**
- Review **[Audit Logs](http://localhost:5173/audit-logs)** for errors
- Check server logs in terminal
- Inspect database: `sqlite3 data/clawops.db`

---

## 🎉 You're All Set!

**Congratulations!** You now have a production-ready agent automation platform.

### Quick Commands Summary:

```bash
# Start backend
npm run server

# Start frontend
npm run dev

# Run tests
npm test

# Check health
curl http://localhost:3001/health

# Access app
open http://localhost:5173
```

---

**Ready to automate? Start with the Lead Gen dashboard or run your first agent!** 🚀
