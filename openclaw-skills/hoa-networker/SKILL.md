# HOA Networker - Technical Implementation

## Agent Configuration

**Agent ID**: `hoa-networker`
**Agent Name**: HOA Networker
**Type**: Community Engagement Specialist
**Domain**: Lead Generation
**Model**: Claude Sonnet 4.5 (default)

## Capabilities

- Web Search (for scanning communities)
- Web Fetch (for reading posts/threads)
- Database Read/Write (engagement queue, community tracking)
- API Calls (posting responses, updating metrics)
- Scheduled Execution (cron-based scanning)

## Core Responsibilities

1. **Community Monitoring**: Scan target platforms for HOA financing discussions
2. **Opportunity Identification**: Score relevance of posts/threads (1-100)
3. **Response Drafting**: Generate helpful, customized responses using templates
4. **Queue Management**: Save opportunities for human review
5. **Engagement Tracking**: Monitor likes, replies, clicks on posted responses
6. **Lead Detection**: Flag high-value opportunities for immediate attention
7. **Intelligence Gathering**: Feed trending topics to other agents

## Technical Architecture

### Input Sources

**Reddit API** (PRAW):
```python
import praw

reddit = praw.Reddit(
    client_id=os.getenv('REDDIT_CLIENT_ID'),
    client_secret=os.getenv('REDDIT_CLIENT_SECRET'),
    user_agent='HOA Project Funding Networker v1.0'
)

# Scan subreddit
subreddit = reddit.subreddit('HOA')
for submission in subreddit.new(limit=50):
    # Score relevance
    # Generate response
    # Queue for review
```

**Facebook Graph API**:
```javascript
// Requires Page Access Token
const response = await fetch(
  `https://graph.facebook.com/v18.0/${groupId}/feed?access_token=${accessToken}`
);
```

**LinkedIn API**:
```javascript
// Requires OAuth
const posts = await linkedIn.getPosts({
  group: 'community-associations',
  since: new Date(Date.now() - 3600000) // last hour
});
```

**Web Scraping** (BiggerPockets, Quora):
```javascript
// Using Playwright for dynamic content
const { chromium } = require('playwright');

async function scrapeBiggerPockets() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://www.biggerpockets.com/forums/51-hoa-community-association-issues');

  const posts = await page.$$eval('.topic-title', elements =>
    elements.map(el => ({
      title: el.textContent,
      url: el.href,
      timestamp: el.dataset.timestamp
    }))
  );

  return posts;
}
```

### Database Schema

**Table**: `lg_engagement_queue`

```sql
CREATE TABLE IF NOT EXISTS lg_engagement_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Platform & Community
  platform TEXT NOT NULL,
  community TEXT,
  post_url TEXT NOT NULL,
  post_title TEXT,
  post_summary TEXT,
  post_author TEXT,
  post_age_hours INTEGER,

  -- Relevance & Template
  relevance_score INTEGER,
  recommended_template TEXT,

  -- Draft Response
  draft_response TEXT NOT NULL,
  includes_link BOOLEAN DEFAULT 0,
  link_url TEXT,

  -- Status & Approval
  status TEXT DEFAULT 'pending_review',
  approved_at DATETIME,
  posted_at DATETIME,

  -- Engagement Tracking
  engagement_likes INTEGER DEFAULT 0,
  engagement_replies INTEGER DEFAULT 0,
  engagement_clicks INTEGER DEFAULT 0,

  -- Metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  notes TEXT
);
```

**Table**: `lg_community_accounts`

```sql
CREATE TABLE IF NOT EXISTS lg_community_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Community Info
  platform TEXT NOT NULL,
  community_name TEXT NOT NULL,
  community_url TEXT,
  member_count INTEGER,

  -- Our Status
  our_status TEXT DEFAULT 'discovered',
  joined_at DATETIME,

  -- Performance Metrics
  posts_made INTEGER DEFAULT 0,
  avg_engagement REAL DEFAULT 0,
  last_scanned DATETIME,

  -- Community Rules
  rules_notes TEXT,
  is_active BOOLEAN DEFAULT 1,

  -- Metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### API Endpoints

**File**: `server/routes/lead-gen.js`

```javascript
// GET /api/lead-gen/networker/queue
// List engagement opportunities with filters
router.get('/networker/queue', async (req, res) => {
  const { status, platform, min_relevance, limit = 50 } = req.query;
  // Returns filtered opportunities
});

// GET /api/lead-gen/networker/queue/:id
// Get single opportunity details
router.get('/networker/queue/:id', async (req, res) => {
  // Returns single opportunity
});

// PATCH /api/lead-gen/networker/queue/:id
// Approve, reject, or edit a draft
router.patch('/networker/queue/:id', async (req, res) => {
  const { action, draft_response, notes } = req.body;
  // action: 'approve', 'reject', 'edit'
});

// POST /api/lead-gen/networker/queue/:id/post
// Post approved response to platform
router.post('/networker/queue/:id/post', async (req, res) => {
  // Triggers agent to post response
});

// GET /api/lead-gen/networker/communities
// List tracked communities
router.get('/networker/communities', async (req, res) => {
  // Returns communities with stats
});

// GET /api/lead-gen/networker/stats
// Dashboard metrics
router.get('/networker/stats', async (req, res) => {
  // Returns aggregated stats
});
```

## Prompt Flow

### 1. Scanning Prompt

```
You are the HOA Networker. Scan r/HOA for the last 50 posts.

For each post, evaluate:
1. Is it about HOA financing, special assessments, capital projects, or reserve funding?
2. Does it show pain, confusion, or a funding decision?
3. Can you provide genuinely helpful advice?

For qualifying posts (relevance >50), extract:
- Post title
- Post summary (2-3 sentences)
- Post author
- Post URL
- Post age (hours)
- Relevance score (1-100)

Return as JSON array.
```

### 2. Response Generation Prompt

```
You are the HOA Networker. A Reddit user posted this question:

**Title**: {post_title}
**Content**: {post_content}
**Subreddit**: r/HOA
**Author**: {post_author}

Generate a helpful response following these guidelines:
1. Answer the actual question first
2. Show empathy and acknowledge frustration
3. Provide multiple options (not just HOA Project Funding)
4. Use Template 1 (Special Assessment Distress) as a guide but CUSTOMIZE
5. Only include link if genuinely helpful (loan calculator, resource page)
6. Add "Disclosure: I work with HOA Project Funding" if including link
7. Keep under 400 words
8. Use bullet points and structure for readability

Return:
{
  "draft_response": "Your response text here",
  "includes_link": true/false,
  "link_url": "https://..." (if applicable),
  "recommended_template": "template_name"
}
```

### 3. Engagement Tracking Prompt

```
You are the HOA Networker. Check engagement for posted response:

**Platform**: Reddit
**Post URL**: {post_url}
**Response URL**: {response_url}
**Posted**: {posted_at}

Using web_fetch, retrieve:
- Upvotes/likes count
- Number of replies to your response
- Any follow-up questions from original poster
- Signs of high engagement (users asking for contact, thanking profusely)

Return:
{
  "engagement_likes": 47,
  "engagement_replies": 12,
  "hot_lead_signals": ["Original poster replied asking about timeline", "User asked for direct contact"],
  "sentiment": "positive" | "neutral" | "negative"
}
```

### 4. Hot Lead Detection Prompt

```
You are the HOA Networker. Evaluate if this is a hot lead:

**Post Details**:
- Relevance Score: {relevance_score}
- Dollar Amount Mentioned: {amount}
- Urgency Keywords: {urgency_keywords}
- Author Role: {author_role}
- Platform: {platform}

**Engagement Details**:
- Clicked Link: {clicked_link}
- Time to Click: {time_to_click_minutes} minutes
- Follow-up Question: {follow_up_question}
- Engagement Type: {engagement_type}

Evaluate if this meets hot lead criteria:
1. High-value post (relevance >80, amount >$500K, decision-maker identified)
2. Strong engagement (clicked link, asked follow-up, requested contact)
3. Platform credibility (LinkedIn, property manager title)

Return:
{
  "is_hot_lead": true/false,
  "hot_lead_score": 0-100,
  "alert_message": "Formatted alert text for Telegram"
}
```

## Scheduled Tasks

**File**: `openclaw-skills/hoa-networker/schedule.json`

```json
{
  "schedules": [
    {
      "id": "lg-networker-reddit",
      "name": "Reddit Scan",
      "cron": "0 */2 * * *",
      "agent_id": "hoa-networker",
      "prompt": "Scan r/HOA, r/condoassociation, r/realestate for engagement opportunities. Return top 10 by relevance.",
      "enabled": true
    },
    {
      "id": "lg-networker-facebook",
      "name": "Facebook Groups Scan",
      "cron": "0 6,10,14,18,22 * * *",
      "agent_id": "hoa-networker",
      "prompt": "Scan Facebook HOA groups for engagement opportunities. Return top 10 by relevance.",
      "enabled": true
    },
    {
      "id": "lg-networker-linkedin",
      "name": "LinkedIn Scan",
      "cron": "0 8,16 * * 1-5",
      "agent_id": "hoa-networker",
      "prompt": "Scan LinkedIn CAI groups for engagement opportunities. Return top 10 by relevance.",
      "enabled": true
    },
    {
      "id": "lg-networker-forums",
      "name": "Forums Scan",
      "cron": "0 9 * * *",
      "agent_id": "hoa-networker",
      "prompt": "Scan BiggerPockets and Quora for HOA financing questions. Return top 10 by relevance.",
      "enabled": true
    },
    {
      "id": "lg-networker-post",
      "name": "Post Approved Responses",
      "cron": "*/30 * * * *",
      "agent_id": "hoa-networker",
      "prompt": "Check for approved responses in queue. Post to platforms and update status.",
      "enabled": true
    },
    {
      "id": "lg-networker-track",
      "name": "Engagement Tracking",
      "cron": "0 20 * * *",
      "agent_id": "hoa-networker",
      "prompt": "Update engagement metrics for all posted responses. Check for hot leads.",
      "enabled": true
    }
  ]
}
```

## Agent Execution Flow

### Phase 1: Scan & Identify

```javascript
async function scanCommunity(platform, community) {
  // 1. Fetch recent posts
  const posts = await fetchPosts(platform, community);

  // 2. Filter by keywords
  const relevant = posts.filter(post =>
    matchesKeywords(post, HOA_KEYWORDS)
  );

  // 3. Score relevance (Claude API)
  const scored = await Promise.all(
    relevant.map(post => scoreRelevance(post))
  );

  // 4. Filter by threshold
  const qualified = scored.filter(s => s.relevance_score >= 50);

  // 5. Return top opportunities
  return qualified
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, 10);
}
```

### Phase 2: Generate Response

```javascript
async function generateResponse(opportunity) {
  // 1. Select template based on post content
  const template = selectTemplate(opportunity);

  // 2. Construct prompt with full context
  const prompt = buildResponsePrompt(opportunity, template);

  // 3. Call Claude API
  const response = await claudeAPI.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: prompt
    }]
  });

  // 4. Parse response
  const { draft_response, includes_link, link_url } = JSON.parse(response.content[0].text);

  // 5. Add UTM tracking if link included
  if (includes_link && link_url) {
    link_url = addUTMParams(link_url, opportunity);
  }

  // 6. Save to queue
  await db.run(`
    INSERT INTO lg_engagement_queue (
      platform, community, post_url, post_title, post_summary,
      relevance_score, recommended_template, draft_response,
      includes_link, link_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    opportunity.platform,
    opportunity.community,
    opportunity.post_url,
    opportunity.post_title,
    opportunity.post_summary,
    opportunity.relevance_score,
    template,
    draft_response,
    includes_link ? 1 : 0,
    link_url
  ]);
}
```

### Phase 3: Post Response

```javascript
async function postResponse(opportunityId) {
  // 1. Get opportunity from database
  const opp = await db.get(
    'SELECT * FROM lg_engagement_queue WHERE id = ? AND status = "approved"',
    [opportunityId]
  );

  if (!opp) return;

  // 2. Post to platform
  let success = false;

  switch (opp.platform) {
    case 'reddit':
      success = await postToReddit(opp);
      break;
    case 'facebook':
      success = await postToFacebook(opp);
      break;
    case 'linkedin':
      success = await postToLinkedIn(opp);
      break;
    // ... other platforms
  }

  // 3. Update status
  if (success) {
    await db.run(
      `UPDATE lg_engagement_queue
       SET status = 'posted', posted_at = datetime('now')
       WHERE id = ?`,
      [opportunityId]
    );
  }
}
```

### Phase 4: Track Engagement

```javascript
async function trackEngagement() {
  // 1. Get all posted responses from last 30 days
  const posted = await db.all(`
    SELECT * FROM lg_engagement_queue
    WHERE status = 'posted'
    AND posted_at >= datetime('now', '-30 days')
  `);

  // 2. For each, fetch current engagement
  for (const opp of posted) {
    const metrics = await fetchEngagementMetrics(opp.platform, opp.post_url);

    // 3. Update database
    await db.run(`
      UPDATE lg_engagement_queue
      SET
        engagement_likes = ?,
        engagement_replies = ?,
        engagement_clicks = ?
      WHERE id = ?
    `, [
      metrics.likes,
      metrics.replies,
      metrics.clicks,
      opp.id
    ]);

    // 4. Check for hot lead
    if (isHotLead(opp, metrics)) {
      await sendHotLeadAlert(opp, metrics);
    }
  }
}
```

## Integration Points

### With Other Agents

**Content Writer**:
```javascript
// When trending topic detected
await db.run(`
  INSERT INTO content_queue (topic, source, priority)
  VALUES (?, 'hoa-networker-trending', 'high')
`, ['Special assessment payment plan options']);
```

**Social Media**:
```javascript
// When topic gains traction
await db.run(`
  INSERT INTO social_queue (topic, angle, platform)
  VALUES (?, ?, 'twitter,linkedin')
`, ['Emergency HOA roof repairs', 'Financing alternatives to special assessments']);
```

**Email Campaigns**:
```javascript
// When lead engages
await db.run(`
  INSERT INTO contacts (name, platform, source, segment)
  VALUES (?, ?, 'hoa-networker', 'warm-lead')
`, [author_name, 'reddit']);
```

**Telegram Alerts**:
```javascript
// Hot lead detected
await sendTelegramMessage(`
🔥 HOT LEAD ALERT

Platform: ${opp.platform}
Post: "${opp.post_title}"
Author: ${opp.post_author}
Engagement: Clicked link, asked follow-up
Relevance: ${opp.relevance_score}%

${opp.post_url}
`);
```

## Environment Variables

```env
# Reddit API
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_client_secret
REDDIT_USERNAME=hoa_project_funding
REDDIT_PASSWORD=your_password

# Facebook API
FACEBOOK_PAGE_ACCESS_TOKEN=your_token
FACEBOOK_PAGE_ID=your_page_id

# LinkedIn API
LINKEDIN_CLIENT_ID=your_client_id
LINKEDIN_CLIENT_SECRET=your_client_secret
LINKEDIN_ACCESS_TOKEN=your_token

# Claude API
ANTHROPIC_API_KEY=your_api_key

# Telegram Alerts
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

## Testing

### Unit Tests

```javascript
// test/hoa-networker.test.js

describe('HOA Networker', () => {
  test('scores relevance correctly', async () => {
    const post = {
      title: 'Our HOA announced $15K special assessment',
      content: 'Need advice on HOA financing options...'
    };

    const score = await scoreRelevance(post);
    expect(score).toBeGreaterThan(80);
  });

  test('selects appropriate template', () => {
    const post = { keywords: ['special assessment', 'emergency'] };
    const template = selectTemplate(post);
    expect(template).toBe('special_assessment_distress');
  });

  test('adds UTM parameters correctly', () => {
    const url = 'https://www.hoaprojectfunding.com/calculator';
    const opportunity = { platform: 'reddit', id: 123 };
    const tracked = addUTMParams(url, opportunity);

    expect(tracked).toContain('utm_source=reddit');
    expect(tracked).toContain('utm_campaign=networker');
  });
});
```

### Integration Tests

```javascript
describe('Full Workflow', () => {
  test('scan → draft → approve → post → track', async () => {
    // 1. Scan Reddit
    const opportunities = await scanCommunity('reddit', 'HOA');
    expect(opportunities.length).toBeGreaterThan(0);

    // 2. Generate response for top opportunity
    await generateResponse(opportunities[0]);
    const queued = await db.get('SELECT * FROM lg_engagement_queue WHERE post_url = ?', [opportunities[0].post_url]);
    expect(queued.status).toBe('pending_review');

    // 3. Approve
    await db.run('UPDATE lg_engagement_queue SET status = "approved" WHERE id = ?', [queued.id]);

    // 4. Post (mock)
    await postResponse(queued.id);
    const posted = await db.get('SELECT * FROM lg_engagement_queue WHERE id = ?', [queued.id]);
    expect(posted.status).toBe('posted');

    // 5. Track engagement (mock)
    await trackEngagement();
    const tracked = await db.get('SELECT * FROM lg_engagement_queue WHERE id = ?', [queued.id]);
    expect(tracked.engagement_likes).toBeGreaterThanOrEqual(0);
  });
});
```

## Monitoring & Alerts

### Metrics to Track

- **Opportunities found per day** (should be 10-20)
- **Approval rate** (% of opportunities approved)
- **Post success rate** (% of approved responses successfully posted)
- **Engagement rate** (avg likes + replies per post)
- **Click-through rate** (% of posts with clicks)
- **Hot lead rate** (% of posts flagged as hot leads)

### Dashboard Queries

```sql
-- Pending review count
SELECT COUNT(*) FROM lg_engagement_queue WHERE status = 'pending_review';

-- Posted today
SELECT COUNT(*) FROM lg_engagement_queue
WHERE status = 'posted' AND DATE(posted_at) = DATE('now');

-- Total clicks
SELECT SUM(engagement_clicks) FROM lg_engagement_queue WHERE engagement_clicks > 0;

-- Top communities
SELECT platform, community, COUNT(*) as posts, SUM(engagement_clicks) as clicks
FROM lg_engagement_queue
WHERE status = 'posted'
GROUP BY platform, community
ORDER BY clicks DESC
LIMIT 10;
```

## Deployment

### Local Development

```bash
# 1. Install dependencies
npm install praw playwright

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local with your API keys

# 3. Run migration
npm run migrate

# 4. Start server
npm run dev

# 5. Test agent
npx openclaw agent --agent hoa-networker --local \
  --message "Scan r/HOA for top 5 engagement opportunities"

# 6. View results
open http://localhost:5173/lead-gen
```

### Production Setup

```bash
# 1. Setup platform API accounts
# - Reddit: Create app at https://www.reddit.com/prefs/apps
# - Facebook: Create page access token
# - LinkedIn: Setup OAuth app

# 2. Deploy to production
npm run build
npm run start:prod

# 3. Enable cron schedules
# Schedules run automatically via OpenClaw scheduler

# 4. Monitor logs
tail -f logs/hoa-networker.log
```

## Error Handling

### Common Issues

**Rate Limiting**:
```javascript
if (error.status === 429) {
  const retryAfter = error.headers['retry-after'] || 60;
  console.log(`Rate limited. Retrying in ${retryAfter}s`);
  await sleep(retryAfter * 1000);
  return retry(operation);
}
```

**API Authentication Failure**:
```javascript
if (error.status === 401) {
  console.error('Authentication failed. Check API credentials.');
  await sendTelegramAlert('🚨 HOA Networker: API auth failed');
  return null;
}
```

**Post Failure**:
```javascript
if (!postSuccess) {
  await db.run(`
    UPDATE lg_engagement_queue
    SET status = 'error', notes = ?
    WHERE id = ?
  `, [error.message, opportunityId]);

  // Alert for manual intervention
  await sendTelegramAlert(`❌ Failed to post response: ${error.message}`);
}
```

## Performance Optimization

### Caching

```javascript
// Cache community data for 1 hour
const CACHE_TTL = 3600;
const communityCache = new Map();

async function getCommunityData(platform, name) {
  const cacheKey = `${platform}:${name}`;
  const cached = communityCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL * 1000) {
    return cached.data;
  }

  const data = await fetchCommunityData(platform, name);
  communityCache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}
```

### Batch Processing

```javascript
// Process opportunities in batches
async function generateResponsesBatch(opportunities) {
  const BATCH_SIZE = 5;

  for (let i = 0; i < opportunities.length; i += BATCH_SIZE) {
    const batch = opportunities.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(opp => generateResponse(opp)));

    // Rate limiting between batches
    if (i + BATCH_SIZE < opportunities.length) {
      await sleep(2000);
    }
  }
}
```

---

**Status**: Ready for implementation
**Estimated Setup Time**: 2-3 hours (excluding manual community joining)
**Maintenance**: 30 minutes daily (review queue, approve responses)
