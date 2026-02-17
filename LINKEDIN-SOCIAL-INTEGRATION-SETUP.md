# LinkedIn & Social Media Integration Setup Guide

**Date:** February 15, 2026
**Purpose:** Set up LinkedIn, Twitter/X, Instagram, and other social platforms for automated posting and engagement

---

## 🎯 Integration Overview

This guide covers setting up:
1. **LinkedIn** - Professional networking, B2B lead generation
2. **Twitter/X** - Real-time engagement, trending topics
3. **Instagram** - Visual content, community building
4. **YouTube** - Video content, SEO
5. **TikTok** - Short-form video (optional)
6. **Reddit** - Community engagement (already mentioned in networker agent)

---

## 1. LinkedIn Integration

### Why LinkedIn?
- **B2B Lead Generation** - Connect with HOA board members, property managers
- **Thought Leadership** - Establish authority in HOA financing
- **Professional Network** - Build relationships with decision-makers
- **Content Distribution** - Share blog posts, case studies

### Setup Steps

#### Step 1: Create LinkedIn Developer App

1. Go to: https://www.linkedin.com/developers/apps
2. Click **"Create app"**
3. Fill in details:
   - **App name:** ClawOps - HOA Project Funding Automation
   - **LinkedIn Page:** Your company page (or create one)
   - **Privacy policy URL:** https://your-domain.com/privacy
   - **App logo:** Your company logo (80x80px minimum)
4. Click **"Create app"**

#### Step 2: Request API Access

**Products to Enable:**
1. **Sign In with LinkedIn** (instant access)
2. **Share on LinkedIn** (instant access)
3. **Marketing Developer Platform** (requires approval)
   - Use case: "Automated content sharing for HOA financing education"
   - Submit for review (1-2 weeks approval time)

#### Step 3: Get OAuth 2.0 Credentials

1. In your app, go to **"Auth"** tab
2. Copy:
   - **Client ID:** `78xxxxxxxxxxxxx`
   - **Client Secret:** `VxX...` (keep secret!)
3. Add **Redirect URLs:**
   - `http://localhost:3001/api/auth/linkedin/callback` (dev)
   - `https://hoa-clawops-console.onrender.com/api/auth/linkedin/callback` (prod)

#### Step 4: Get Access Token

**Option A: OAuth Flow (Recommended)**

Create endpoint in `server/routes/auth.js`:

```javascript
const axios = require('axios');

// LinkedIn OAuth - Step 1: Redirect user
router.get('/linkedin/authorize', (req, res) => {
  const authUrl = 'https://www.linkedin.com/oauth/v2/authorization';
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINKEDIN_CLIENT_ID,
    redirect_uri: process.env.LINKEDIN_REDIRECT_URI,
    scope: 'r_liteprofile r_emailaddress w_member_social' // Permissions
  });
  res.redirect(`${authUrl}?${params}`);
});

// LinkedIn OAuth - Step 2: Handle callback
router.get('/linkedin/callback', async (req, res) => {
  const { code } = req.query;

  try {
    // Exchange code for access token
    const tokenResponse = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', null, {
      params: {
        grant_type: 'authorization_code',
        code,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
        redirect_uri: process.env.LINKEDIN_REDIRECT_URI
      }
    });

    const accessToken = tokenResponse.data.access_token;

    // Store in database for future use
    // TODO: Save to user's social account settings

    res.send('LinkedIn connected successfully!');
  } catch (error) {
    res.status(500).send('Failed to connect LinkedIn');
  }
});
```

**Option B: Manual Token (Quick Testing)**

1. Go to: https://www.linkedin.com/developers/tools/oauth/token-generator
2. Select your app
3. Select scopes: `r_liteprofile`, `r_emailaddress`, `w_member_social`
4. Click **"Request access token"**
5. Copy token (expires in 60 days)

#### Step 5: Add to .env.local

```env
# LinkedIn Integration
LINKEDIN_CLIENT_ID=78xxxxxxxxxxxxx
LINKEDIN_CLIENT_SECRET=VxXxxxxxxxxxxxxxxxxxxxxx
LINKEDIN_REDIRECT_URI=http://localhost:3001/api/auth/linkedin/callback
LINKEDIN_ACCESS_TOKEN=AQV...  # From OAuth or manual generation
```

#### Step 6: Create LinkedIn Service

Create `server/services/linkedinService.js`:

```javascript
const axios = require('axios');

class LinkedInService {
  constructor() {
    this.baseUrl = 'https://api.linkedin.com/v2';
    this.accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
  }

  // Post text update
  async postTextUpdate(text) {
    try {
      // Get user's LinkedIn ID
      const profile = await this.getProfile();
      const author = `urn:li:person:${profile.id}`;

      const response = await axios.post(
        `${this.baseUrl}/ugcPosts`,
        {
          author,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: { text },
              shareMediaCategory: 'NONE'
            }
          },
          visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('[LinkedIn] Post failed:', error.response?.data || error.message);
      throw error;
    }
  }

  // Post with link
  async postLink(text, url, title, description) {
    try {
      const profile = await this.getProfile();
      const author = `urn:li:person:${profile.id}`;

      const response = await axios.post(
        `${this.baseUrl}/ugcPosts`,
        {
          author,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: { text },
              shareMediaCategory: 'ARTICLE',
              media: [{
                status: 'READY',
                originalUrl: url,
                title: { text: title },
                description: { text: description }
              }]
            }
          },
          visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('[LinkedIn] Link post failed:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get user profile
  async getProfile() {
    const response = await axios.get(
      `${this.baseUrl}/me`,
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      }
    );
    return response.data;
  }

  // Get post analytics
  async getPostStats(postId) {
    const response = await axios.get(
      `${this.baseUrl}/socialActions/${postId}`,
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      }
    );
    return response.data;
  }
}

module.exports = new LinkedInService();
```

#### Step 7: Test Integration

Create `test-linkedin.js`:

```javascript
const linkedinService = require('./server/services/linkedinService');

async function testLinkedIn() {
  try {
    console.log('Testing LinkedIn integration...');

    // Test 1: Get profile
    console.log('\n1. Getting profile...');
    const profile = await linkedinService.getProfile();
    console.log('✅ Profile:', profile.localizedFirstName, profile.localizedLastName);

    // Test 2: Post text update
    console.log('\n2. Posting text update...');
    const post = await linkedinService.postTextUpdate(
      '🏘️ Did you know? Special assessments don\'t have to be a burden. Learn how HOA boards can secure emergency funding without straining homeowners. #HOA #PropertyManagement'
    );
    console.log('✅ Post created:', post.id);

    // Test 3: Post link
    console.log('\n3. Posting article link...');
    const linkPost = await linkedinService.postLink(
      'New blog post: How to navigate HOA special assessments 👇',
      'https://hoaprojectfunding.com/blog/special-assessments-guide',
      'Complete Guide to HOA Special Assessments',
      'Learn strategies for handling unexpected HOA expenses without financial strain.'
    );
    console.log('✅ Link post created:', linkPost.id);

    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testLinkedIn();
```

Run test:
```bash
node test-linkedin.js
```

---

## 2. Twitter/X Integration

### Why Twitter/X?
- **Real-Time Engagement** - Respond to trending HOA topics
- **Quick Updates** - Share bite-sized content
- **Virality Potential** - Amplify reach through retweets

### Setup Steps

#### Step 1: Create Twitter Developer Account

1. Go to: https://developer.twitter.com/en/portal/dashboard
2. Click **"Sign up"** (or login)
3. Apply for **"Elevated"** access (free, required for posting)
4. Use case: "Automated content sharing for HOA education"
5. Wait for approval (usually instant to 24 hours)

#### Step 2: Create App

1. In Developer Portal, click **"Create Project"**
2. Project name: "ClawOps HOA Automation"
3. Create App within project
4. App name: "HOA Project Funding Bot"

#### Step 3: Get API Keys

1. Go to app **"Keys and tokens"** tab
2. Copy:
   - **API Key:** `xxxxx...`
   - **API Key Secret:** `xxxxx...`
3. Generate **Access Token & Secret:**
   - Click **"Generate"** under "Access Token and Secret"
   - Copy both (needed for posting)

#### Step 4: Add to .env.local

```env
# Twitter/X Integration
TWITTER_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxx
TWITTER_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWITTER_ACCESS_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWITTER_ACCESS_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWITTER_BEARER_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### Step 5: Create Twitter Service

Install Twitter SDK:
```bash
npm install twitter-api-v2
```

Create `server/services/twitterService.js`:

```javascript
const { TwitterApi } = require('twitter-api-v2');

class TwitterService {
  constructor() {
    this.client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_ACCESS_SECRET,
    });
  }

  // Post tweet
  async tweet(text) {
    try {
      const tweet = await this.client.v2.tweet(text);
      console.log('[Twitter] Tweet posted:', tweet.data.id);
      return tweet.data;
    } catch (error) {
      console.error('[Twitter] Tweet failed:', error);
      throw error;
    }
  }

  // Post thread
  async tweetThread(tweets) {
    try {
      let previousTweetId = null;
      const postedTweets = [];

      for (const text of tweets) {
        const tweet = await this.client.v2.tweet({
          text,
          reply: previousTweetId ? { in_reply_to_tweet_id: previousTweetId } : undefined
        });

        postedTweets.push(tweet.data);
        previousTweetId = tweet.data.id;
      }

      console.log(`[Twitter] Thread posted: ${postedTweets.length} tweets`);
      return postedTweets;
    } catch (error) {
      console.error('[Twitter] Thread failed:', error);
      throw error;
    }
  }

  // Search tweets
  async searchTweets(query, maxResults = 10) {
    try {
      const tweets = await this.client.v2.search(query, {
        max_results: maxResults,
        'tweet.fields': ['created_at', 'public_metrics']
      });

      return tweets.data.data || [];
    } catch (error) {
      console.error('[Twitter] Search failed:', error);
      throw error;
    }
  }

  // Get mentions
  async getMentions() {
    try {
      const mentions = await this.client.v2.userMentionTimeline('me');
      return mentions.data.data || [];
    } catch (error) {
      console.error('[Twitter] Get mentions failed:', error);
      throw error;
    }
  }
}

module.exports = new TwitterService();
```

#### Step 6: Test Integration

```javascript
const twitterService = require('./server/services/twitterService');

async function testTwitter() {
  try {
    console.log('Testing Twitter integration...');

    // Post single tweet
    const tweet = await twitterService.tweet(
      '🏘️ HOA special assessments don\'t have to be scary! Learn how boards can secure funding without burdening homeowners. #HOA #PropertyManagement'
    );
    console.log('✅ Tweet posted:', tweet.id);

    // Post thread
    const thread = await twitterService.tweetThread([
      '🧵 Thread: 5 Ways to Handle HOA Emergency Repairs Without Special Assessments',
      '1️⃣ Establish a robust reserve fund - Aim for 70% funded reserves to handle unexpected expenses',
      '2️⃣ Explore short-term financing - Bridge loans can spread costs over time',
      '3️⃣ Prioritize preventive maintenance - Catching issues early saves money',
      '4️⃣ Consider grant programs - Some states offer HOA infrastructure grants',
      '5️⃣ Work with specialized lenders - HOA-focused financing has better terms'
    ]);
    console.log('✅ Thread posted:', thread.length, 'tweets');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testTwitter();
```

---

## 3. Instagram Integration (via Meta Graph API)

### Why Instagram?
- **Visual Storytelling** - Before/after project photos
- **Community Building** - Engage HOA homeowners
- **Brand Awareness** - Reach property managers

### Setup Steps

#### Step 1: Convert to Business Account

1. Open Instagram app
2. Go to **Settings → Account → Switch to Professional Account**
3. Choose **"Business"**
4. Connect to Facebook Page (required for API access)

#### Step 2: Use Facebook Graph API

Instagram uses the **same Facebook App** from your lead generation setup!

**Configuration:**
```env
# Instagram (uses same Facebook app)
INSTAGRAM_ACCOUNT_ID=17841400000000000  # Get from Facebook Graph API
# Uses FACEBOOK_ACCESS_TOKEN from existing config
```

#### Step 3: Get Instagram Account ID

```bash
curl "https://graph.facebook.com/v22.0/me/accounts?access_token=YOUR_FACEBOOK_TOKEN"
```

Look for `instagram_business_account` in response.

#### Step 4: Create Instagram Service

Create `server/services/instagramService.js`:

```javascript
const axios = require('axios');

class InstagramService {
  constructor() {
    this.baseUrl = 'https://graph.facebook.com/v22.0';
    this.accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
    this.accountId = process.env.INSTAGRAM_ACCOUNT_ID;
  }

  // Post photo (requires image URL - must be publicly accessible)
  async postPhoto(imageUrl, caption) {
    try {
      // Step 1: Create media container
      const container = await axios.post(
        `${this.baseUrl}/${this.accountId}/media`,
        null,
        {
          params: {
            image_url: imageUrl,
            caption,
            access_token: this.accessToken
          }
        }
      );

      const creationId = container.data.id;

      // Step 2: Publish container
      const published = await axios.post(
        `${this.baseUrl}/${this.accountId}/media_publish`,
        null,
        {
          params: {
            creation_id: creationId,
            access_token: this.accessToken
          }
        }
      );

      console.log('[Instagram] Photo posted:', published.data.id);
      return published.data;
    } catch (error) {
      console.error('[Instagram] Post failed:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get insights
  async getInsights() {
    try {
      const response = await axios.get(
        `${this.baseUrl}/${this.accountId}/insights`,
        {
          params: {
            metric: 'impressions,reach,follower_count',
            period: 'day',
            access_token: this.accessToken
          }
        }
      );

      return response.data.data;
    } catch (error) {
      console.error('[Instagram] Insights failed:', error.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = new InstagramService();
```

**Note:** Instagram requires images to be hosted at publicly accessible URLs. Upload to your server or use a CDN first.

---

## 4. YouTube Integration

### Why YouTube?
- **Video Content** - How-to guides, case studies
- **SEO Benefits** - YouTube is 2nd largest search engine
- **Long-Form Content** - Deep-dive educational content

### Setup Steps

#### Step 1: Enable YouTube Data API

1. Go to: https://console.cloud.google.com/
2. Create new project: "ClawOps HOA Automation"
3. Enable **YouTube Data API v3**
4. Create credentials:
   - **API Key** (for read-only)
   - **OAuth 2.0 Client ID** (for uploading videos)

#### Step 2: Get OAuth Credentials

1. In Google Cloud Console → **Credentials**
2. Create **OAuth 2.0 Client ID**
3. Application type: **Web application**
4. Authorized redirect URIs:
   - `http://localhost:3001/api/auth/youtube/callback`
   - `https://hoa-clawops-console.onrender.com/api/auth/youtube/callback`
5. Download JSON credentials

#### Step 3: Add to .env.local

```env
# YouTube Integration
YOUTUBE_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
YOUTUBE_CLIENT_ID=xxxxx.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxx
YOUTUBE_REDIRECT_URI=http://localhost:3001/api/auth/youtube/callback
```

#### Step 4: Create YouTube Service

Install Google APIs:
```bash
npm install googleapis
```

Create `server/services/youtubeService.js`:

```javascript
const { google } = require('googleapis');

class YouTubeService {
  constructor() {
    this.youtube = google.youtube('v3');
    this.oauth2Client = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET,
      process.env.YOUTUBE_REDIRECT_URI
    );
  }

  // Upload video
  async uploadVideo(filePath, title, description, tags) {
    try {
      const response = await this.youtube.videos.insert({
        auth: this.oauth2Client,
        part: 'snippet,status',
        requestBody: {
          snippet: {
            title,
            description,
            tags,
            categoryId: '27' // Education
          },
          status: {
            privacyStatus: 'public'
          }
        },
        media: {
          body: fs.createReadStream(filePath)
        }
      });

      console.log('[YouTube] Video uploaded:', response.data.id);
      return response.data;
    } catch (error) {
      console.error('[YouTube] Upload failed:', error);
      throw error;
    }
  }

  // Get channel statistics
  async getChannelStats() {
    try {
      const response = await this.youtube.channels.list({
        auth: this.oauth2Client,
        part: 'statistics',
        mine: true
      });

      return response.data.items[0].statistics;
    } catch (error) {
      console.error('[YouTube] Get stats failed:', error);
      throw error;
    }
  }
}

module.exports = new YouTubeService();
```

---

## 5. Complete .env.local Configuration

Add all social media credentials to your `.env.local`:

```env
# ============================================
# SOCIAL MEDIA INTEGRATIONS
# ============================================

# LinkedIn
LINKEDIN_CLIENT_ID=78xxxxxxxxxxxxx
LINKEDIN_CLIENT_SECRET=VxXxxxxxxxxxxxxxxxxxxxxx
LINKEDIN_REDIRECT_URI=http://localhost:3001/api/auth/linkedin/callback
LINKEDIN_ACCESS_TOKEN=AQV...  # Get via OAuth

# Twitter/X
TWITTER_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxx
TWITTER_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWITTER_ACCESS_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWITTER_ACCESS_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWITTER_BEARER_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Instagram (uses Facebook app)
INSTAGRAM_ACCOUNT_ID=17841400000000000

# YouTube
YOUTUBE_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
YOUTUBE_CLIENT_ID=xxxxx.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxx
YOUTUBE_REDIRECT_URI=http://localhost:3001/api/auth/youtube/callback

# TikTok (Optional)
TIKTOK_CLIENT_KEY=xxxxxxxxxxxxxxxxxx
TIKTOK_CLIENT_SECRET=xxxxxxxxxxxxxxxxxx

# Reddit (for community engagement - already configured in networker agent)
REDDIT_CLIENT_ID=xxxxxxxxxxxxxxxxxx
REDDIT_CLIENT_SECRET=xxxxxxxxxxxxxxxxxx
REDDIT_USERNAME=your_bot_username
REDDIT_PASSWORD=your_bot_password
```

---

## 6. Testing All Integrations

Create `test-all-social.js`:

```javascript
const linkedinService = require('./server/services/linkedinService');
const twitterService = require('./server/services/twitterService');
const instagramService = require('./server/services/instagramService');
const youtubeService = require('./server/services/youtubeService');

async function testAllSocial() {
  console.log('🧪 Testing All Social Media Integrations...\n');

  // LinkedIn
  try {
    console.log('1️⃣ Testing LinkedIn...');
    const profile = await linkedinService.getProfile();
    console.log('✅ LinkedIn connected:', profile.localizedFirstName);
  } catch (error) {
    console.error('❌ LinkedIn failed:', error.message);
  }

  // Twitter
  try {
    console.log('\n2️⃣ Testing Twitter...');
    const tweet = await twitterService.tweet('Test tweet from ClawOps! 🏘️ #HOA');
    console.log('✅ Twitter connected:', tweet.id);
  } catch (error) {
    console.error('❌ Twitter failed:', error.message);
  }

  // Instagram
  try {
    console.log('\n3️⃣ Testing Instagram...');
    const insights = await instagramService.getInsights();
    console.log('✅ Instagram connected:', insights.length, 'metrics');
  } catch (error) {
    console.error('❌ Instagram failed:', error.message);
  }

  // YouTube
  try {
    console.log('\n4️⃣ Testing YouTube...');
    const stats = await youtubeService.getChannelStats();
    console.log('✅ YouTube connected:', stats.subscriberCount, 'subscribers');
  } catch (error) {
    console.error('❌ YouTube failed:', error.message);
  }

  console.log('\n✅ All tests complete!');
}

testAllSocial();
```

---

## 7. Integration Checklist

### Pre-Setup
- [ ] Create business accounts on all platforms (if not already)
- [ ] Verify account ownership (email, phone)
- [ ] Enable 2FA on all accounts (security)

### LinkedIn
- [ ] Create LinkedIn Developer App
- [ ] Request Marketing Developer Platform access
- [ ] Get OAuth 2.0 credentials
- [ ] Add to .env.local
- [ ] Create linkedinService.js
- [ ] Test connection

### Twitter/X
- [ ] Apply for Elevated access
- [ ] Create Twitter app
- [ ] Get API keys and access tokens
- [ ] Add to .env.local
- [ ] Install twitter-api-v2 package
- [ ] Create twitterService.js
- [ ] Test connection

### Instagram
- [ ] Convert to Business account
- [ ] Connect to Facebook Page
- [ ] Get Instagram Account ID
- [ ] Add to .env.local
- [ ] Create instagramService.js
- [ ] Test connection

### YouTube
- [ ] Enable YouTube Data API v3
- [ ] Create OAuth 2.0 credentials
- [ ] Download JSON credentials
- [ ] Add to .env.local
- [ ] Install googleapis package
- [ ] Create youtubeService.js
- [ ] Test connection

### Final Steps
- [ ] Run test-all-social.js
- [ ] Update THIRD_PARTY_INTEGRATIONS.md
- [ ] Configure posting schedules in agent configs
- [ ] Set up analytics tracking
- [ ] Create content calendar

---

## 8. Content Strategy

### LinkedIn (2-3 posts/week)
- **Monday:** Educational post (HOA financing tips)
- **Wednesday:** Case study or success story
- **Friday:** Thought leadership or industry news

### Twitter (1-2 tweets/day)
- **Morning:** Quick tip or industry news
- **Afternoon:** Engagement tweet (question, poll)
- **Evening:** Link to blog post or resource

### Instagram (3-5 posts/week)
- **Monday:** Motivational quote (HOA board members)
- **Wednesday:** Before/after project photos
- **Friday:** Educational carousel or infographic

### YouTube (1 video/week)
- **Weekly:** How-to video or case study

---

## 9. Automation with Agents

Once integrated, configure your agents to post automatically:

**Update `openclaw-skills/hoa-social-media/schedule.json`:**

```json
{
  "schedules": [
    {
      "name": "LinkedIn - Monday Morning Post",
      "cron": "0 9 * * 1",
      "platform": "linkedin",
      "action": "post_educational_content"
    },
    {
      "name": "Twitter - Daily Tips",
      "cron": "0 10 * * *",
      "platform": "twitter",
      "action": "post_daily_tip"
    },
    {
      "name": "Instagram - Wed/Fri Visual Content",
      "cron": "0 14 * * 3,5",
      "platform": "instagram",
      "action": "post_visual_content"
    }
  ]
}
```

---

## 10. Analytics & Monitoring

### Track These Metrics:
- **Engagement Rate:** Likes, comments, shares per post
- **Reach:** Impressions, unique viewers
- **Follower Growth:** Net new followers per week
- **Click-Through Rate:** Links clicked / impressions
- **Lead Generation:** Leads attributed to social media

### Create Dashboard:
Add social media analytics to your ClawOps Console dashboard.

---

## 11. Cost Summary

| Platform | Setup Cost | Monthly Cost | Notes |
|----------|------------|--------------|-------|
| LinkedIn | Free | Free | Marketing Platform requires approval |
| Twitter/X | Free | Free | Elevated access required |
| Instagram | Free | Free | Requires Facebook Business account |
| YouTube | Free | Free | Standard YouTube account |
| TikTok | Free | Free | Business account recommended |

**Total:** $0/month for all platforms! 🎉

---

## 12. Next Steps

1. **Start with LinkedIn** - Highest ROI for B2B
2. **Add Twitter** - Quick wins, easy setup
3. **Then Instagram** - Visual content takes more time
4. **YouTube later** - Requires video production

**Estimated Setup Time:**
- LinkedIn: 1-2 hours
- Twitter: 30 minutes
- Instagram: 30 minutes
- YouTube: 1 hour

**Total: 3-4 hours for all platforms**

---

## 13. Support & Resources

### LinkedIn
- Developer Docs: https://learn.microsoft.com/en-us/linkedin/
- API Reference: https://learn.microsoft.com/en-us/linkedin/shared/api-guide

### Twitter/X
- Developer Portal: https://developer.twitter.com
- API Docs: https://developer.twitter.com/en/docs

### Instagram
- Platform Docs: https://developers.facebook.com/docs/instagram-api
- Graph API Explorer: https://developers.facebook.com/tools/explorer

### YouTube
- API Docs: https://developers.google.com/youtube/v3
- Google Cloud Console: https://console.cloud.google.com

---

**Ready to get started?** Let me know which platform you want to set up first! 🚀

**Recommended Order:** LinkedIn → Twitter → Instagram → YouTube
