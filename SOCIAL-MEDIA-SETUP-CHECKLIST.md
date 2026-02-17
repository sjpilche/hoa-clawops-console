# Social Media Integration - Quick Action Checklist

**Date:** February 15, 2026
**Estimated Total Time:** 3-4 hours for all platforms

---

## 📋 LinkedIn Setup (Priority: HIGH - 1-2 hours)

### Pre-Setup
- [ ] Have LinkedIn Business page (or create one)
- [ ] Prepare app logo (80x80px minimum)
- [ ] Prepare privacy policy URL

### Developer Account Setup
- [ ] Go to https://www.linkedin.com/developers/apps
- [ ] Click "Create app"
- [ ] Fill in app details (name, page, logo)
- [ ] Submit for "Marketing Developer Platform" approval (1-2 weeks)

### Get Credentials
- [ ] Copy Client ID from Auth tab
- [ ] Copy Client Secret from Auth tab
- [ ] Add redirect URLs (localhost + production)

### Add to .env.local
```env
LINKEDIN_CLIENT_ID=your_client_id
LINKEDIN_CLIENT_SECRET=your_client_secret
LINKEDIN_REDIRECT_URI=http://localhost:3001/api/auth/linkedin/callback
```

### Code Implementation
- [ ] Create `server/services/linkedinService.js`
- [ ] Create OAuth routes in `server/routes/auth.js`
- [ ] Test with `test-linkedin.js`

### Test
- [ ] Run OAuth flow to get access token
- [ ] Post test text update
- [ ] Post test link
- [ ] Verify posts appear on LinkedIn

**Status:** ⬜ Not Started | ⏳ In Progress | ✅ Complete

---

## 📋 Twitter/X Setup (Priority: MEDIUM - 30 minutes)

### Pre-Setup
- [ ] Have Twitter account (business account recommended)
- [ ] Prepare use case description for API access

### Developer Account Setup
- [ ] Go to https://developer.twitter.com/en/portal/dashboard
- [ ] Sign up for developer account
- [ ] Apply for "Elevated" access
- [ ] Wait for approval (instant to 24 hours)

### Create App
- [ ] Create new project: "ClawOps HOA Automation"
- [ ] Create app within project
- [ ] Copy API Key and API Secret
- [ ] Generate Access Token & Secret

### Add to .env.local
```env
TWITTER_API_KEY=your_api_key
TWITTER_API_SECRET=your_api_secret
TWITTER_ACCESS_TOKEN=your_access_token
TWITTER_ACCESS_SECRET=your_access_secret
```

### Code Implementation
- [ ] Install `twitter-api-v2` package
- [ ] Create `server/services/twitterService.js`
- [ ] Test with `test-twitter.js`

### Test
- [ ] Post test tweet
- [ ] Post test thread
- [ ] Search for tweets
- [ ] Verify posts appear on Twitter

**Status:** ⬜ Not Started | ⏳ In Progress | ✅ Complete

---

## 📋 Instagram Setup (Priority: MEDIUM - 30 minutes)

### Pre-Setup
- [ ] Have Instagram account
- [ ] Convert to Business account
- [ ] Connect to Facebook Page (same one from lead gen setup)

### Get Instagram Account ID
- [ ] Run curl command to get account details:
```bash
curl "https://graph.facebook.com/v22.0/me/accounts?access_token=YOUR_FACEBOOK_TOKEN"
```
- [ ] Find `instagram_business_account` object
- [ ] Copy Instagram Account ID

### Add to .env.local
```env
INSTAGRAM_ACCOUNT_ID=your_instagram_account_id
# Uses FACEBOOK_ACCESS_TOKEN from existing config
```

### Code Implementation
- [ ] Create `server/services/instagramService.js`
- [ ] Test with `test-instagram.js`

### Test
- [ ] Get account insights
- [ ] Post test photo (requires public image URL)
- [ ] Verify post appears on Instagram

**Status:** ⬜ Not Started | ⏳ In Progress | ✅ Complete

---

## 📋 YouTube Setup (Priority: LOW - 1 hour)

### Pre-Setup
- [ ] Have YouTube channel (create if needed)
- [ ] Have Google Cloud account

### Google Cloud Console Setup
- [ ] Go to https://console.cloud.google.com/
- [ ] Create new project: "ClawOps HOA Automation"
- [ ] Enable YouTube Data API v3
- [ ] Create OAuth 2.0 Client ID
- [ ] Add redirect URIs (localhost + production)
- [ ] Download JSON credentials

### Add to .env.local
```env
YOUTUBE_API_KEY=your_api_key
YOUTUBE_CLIENT_ID=your_client_id.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=your_client_secret
YOUTUBE_REDIRECT_URI=http://localhost:3001/api/auth/youtube/callback
```

### Code Implementation
- [ ] Install `googleapis` package
- [ ] Create `server/services/youtubeService.js`
- [ ] Create OAuth routes
- [ ] Test with `test-youtube.js`

### Test
- [ ] Get channel statistics
- [ ] Upload test video (optional)

**Status:** ⬜ Not Started | ⏳ In Progress | ✅ Complete

---

## 🎯 Quick Start: LinkedIn First (Recommended)

### Why Start with LinkedIn?
- **Highest ROI for B2B** - HOA boards and property managers are professionals
- **Less noisy** - More thoughtful, engaged audience
- **Longer content lifespan** - Posts visible for days, not minutes
- **Professional credibility** - Establishes authority

### 30-Minute Quick Start
1. **Create LinkedIn app** (10 min)
2. **Get OAuth credentials** (5 min)
3. **Add to .env.local** (2 min)
4. **Create linkedinService.js** (8 min - copy from guide)
5. **Test connection** (5 min)

---

## 📅 Suggested Implementation Schedule

### Week 1: LinkedIn
- **Monday:** Create developer app, submit for approval
- **While waiting for approval:** Build OAuth flow and service
- **Once approved:** Test and go live

### Week 2: Twitter
- **Monday:** Apply for Elevated access
- **Tuesday:** Create app, get credentials
- **Wednesday:** Implement service, test, go live

### Week 3: Instagram
- **Monday:** Convert account to Business, get Account ID
- **Tuesday:** Implement service, test, go live

### Week 4: YouTube (Optional)
- **Monday:** Set up Google Cloud project
- **Tuesday:** Enable API, create credentials
- **Wednesday:** Implement service, test

---

## 🧪 Testing Checklist

### LinkedIn
- [ ] OAuth flow works (get access token)
- [ ] Can post text updates
- [ ] Can post links with preview
- [ ] Can get profile information
- [ ] Posts appear on LinkedIn feed

### Twitter
- [ ] Can post single tweet
- [ ] Can post thread
- [ ] Can search tweets
- [ ] Can get mentions
- [ ] Tweets appear on timeline

### Instagram
- [ ] Can get account insights
- [ ] Can post photo (with public URL)
- [ ] Posts appear on Instagram feed

### YouTube
- [ ] Can get channel statistics
- [ ] Can upload video
- [ ] Videos appear on channel

---

## 🚨 Common Issues & Solutions

### LinkedIn
**Issue:** "Marketing Developer Platform access pending"
- **Solution:** Wait for approval (1-2 weeks), use basic posting in meantime

**Issue:** "Invalid redirect URI"
- **Solution:** Ensure exact match in app settings and code

### Twitter
**Issue:** "Forbidden - App is suspended"
- **Solution:** Check app status in developer portal, may need to verify email

**Issue:** "Rate limit exceeded"
- **Solution:** Implement rate limiting in code (450 tweets per 24 hours for free tier)

### Instagram
**Issue:** "Image URL not publicly accessible"
- **Solution:** Host images on public CDN or your server with public URL

### YouTube
**Issue:** "OAuth consent screen not configured"
- **Solution:** Configure consent screen in Google Cloud Console

---

## 💡 Pro Tips

### Content Strategy
- **LinkedIn:** Long-form, professional, thought leadership
- **Twitter:** Short, timely, conversational
- **Instagram:** Visual, inspirational, community-focused
- **YouTube:** Educational, how-to, detailed

### Posting Frequency
- **LinkedIn:** 2-3x per week
- **Twitter:** 1-2x per day
- **Instagram:** 3-5x per week
- **YouTube:** 1x per week

### Best Times to Post
- **LinkedIn:** Tuesday-Thursday, 9am-12pm
- **Twitter:** Weekdays, 9am, 12pm, 5pm
- **Instagram:** Weekdays, 11am-1pm
- **YouTube:** Weekends, afternoons

---

## 📊 Success Metrics

Track these for each platform:

### Engagement
- [ ] Likes/reactions per post
- [ ] Comments per post
- [ ] Shares/retweets per post
- [ ] Click-through rate on links

### Growth
- [ ] Follower growth rate
- [ ] Reach/impressions per post
- [ ] Profile views per week

### Lead Generation
- [ ] Leads attributed to each platform
- [ ] Cost per lead (time + ads if any)
- [ ] Conversion rate from social → qualified lead

---

## 🎓 Training Resources

### LinkedIn
- LinkedIn Marketing Solutions: https://business.linkedin.com/marketing-solutions
- LinkedIn API Docs: https://learn.microsoft.com/en-us/linkedin/

### Twitter
- Twitter Developer Portal: https://developer.twitter.com
- Best Practices: https://business.twitter.com/en/resources.html

### Instagram
- Instagram Business Guide: https://business.instagram.com/getting-started
- Instagram API Docs: https://developers.facebook.com/docs/instagram-api

### YouTube
- YouTube Creator Academy: https://creatoracademy.youtube.com
- YouTube API Docs: https://developers.google.com/youtube/v3

---

## ✅ Final Checklist Before Going Live

### Security
- [ ] All API keys in .env.local (not committed to git)
- [ ] .env.local in .gitignore
- [ ] OAuth flows use HTTPS in production
- [ ] Rate limiting implemented
- [ ] Error handling for API failures

### Content
- [ ] Content calendar planned (1-2 weeks ahead)
- [ ] First 10 posts drafted
- [ ] Images/media prepared
- [ ] Hashtag strategy defined

### Monitoring
- [ ] Analytics tracking set up
- [ ] Posting schedules configured
- [ ] Alert system for failed posts
- [ ] Weekly review process scheduled

---

## 🚀 Ready to Start?

**Recommended First Step:** Start with LinkedIn

1. Open [LINKEDIN-SOCIAL-INTEGRATION-SETUP.md](LINKEDIN-SOCIAL-INTEGRATION-SETUP.md)
2. Follow LinkedIn setup section (Step 1)
3. Create developer app (10 minutes)
4. Come back here and check off items as you complete them

**Questions?** Review the detailed guide or check platform-specific support links above.

---

**Last Updated:** February 15, 2026
