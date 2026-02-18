# Reddit API Setup Guide

To enable automated Reddit scanning, you need to create a Reddit app and get API credentials.

## Step 1: Create a Reddit Account (if you don't have one)

1. Go to https://reddit.com
2. Click "Sign Up"
3. Create an account with a professional username (e.g., "HOA_Finance_Helper")
4. **Important**: Don't use an obvious business name to avoid being flagged

## Step 2: Create a Reddit App

1. Go to https://www.reddit.com/prefs/apps
2. Scroll to the bottom and click **"Create App"** or **"Create Another App"**
3. Fill out the form:
   - **Name**: "HOA Networker Scanner" (or any name)
   - **App Type**: Select **"script"** (important!)
   - **Description**: "Monitors HOA communities for engagement opportunities"
   - **About URL**: Leave blank
   - **Redirect URI**: `http://localhost:8080` (doesn't matter for scripts, but required)
4. Click **"Create app"**

## Step 3: Get Your Credentials

After creating the app, you'll see:

```
personal use script
[THIS IS YOUR CLIENT ID] ← 14-character string under "personal use script"

secret
[THIS IS YOUR CLIENT SECRET] ← Longer string next to "secret"
```

## Step 4: Add Credentials to .env.local

Open `.env.local` and add these lines:

```bash
# Reddit API Credentials
REDDIT_CLIENT_ID=your_client_id_here
REDDIT_CLIENT_SECRET=your_client_secret_here
REDDIT_USERNAME=your_reddit_username
REDDIT_PASSWORD=your_reddit_password
REDDIT_USER_AGENT=HOANetworker/1.0 by /u/your_username
```

**Example** (with fake credentials):
```bash
REDDIT_CLIENT_ID=abc123XYZ456_q
REDDIT_CLIENT_SECRET=xyz789ABC123-longerstringhere
REDDIT_USERNAME=HOA_Finance_Helper
REDDIT_PASSWORD=your_actual_password
REDDIT_USER_AGENT=HOANetworker/1.0 by /u/HOA_Finance_Helper
```

## Step 5: Build Karma Before Scanning

**IMPORTANT**: New Reddit accounts need karma before they can post or even heavily comment.

Before enabling the scanner, do this manually:

1. **Subscribe to target subreddits**:
   - r/HOA
   - r/Condo
   - r/RealEstate
   - r/PersonalFinance

2. **Build karma** (need ~50 karma minimum):
   - Comment helpfully on r/AskReddit (5-10 comments)
   - Comment on r/technology or r/news (5-10 comments)
   - **Do NOT post in r/HOA yet** - wait until you have karma

3. **Wait 1-2 weeks** before posting anything promotional

## Step 6: Enable Reddit Scanner

Once you have:
- ✅ Reddit API credentials in `.env.local`
- ✅ 50+ karma points
- ✅ Account is 1+ weeks old

The scanner is ready to use! It will:
- Monitor r/HOA, r/Condo, r/RealEstate, r/PersonalFinance
- Look for posts with keywords: "special assessment", "reserve study", "SIRS", "SB 326", etc.
- Score posts 0-100 based on relevance
- Add high-scoring posts (70+) to your Engagement Queue
- Run every 2 hours automatically

## Step 7: Test the Scanner

Run manually to test:

```bash
node scripts/test-reddit-scanner.js
```

This will:
1. Connect to Reddit API
2. Scan the last 25 posts from each subreddit
3. Show you what it found
4. Add qualifying posts to your queue

## Rate Limits

Reddit API limits:
- **60 requests per minute** (per client ID)
- Our scanner uses ~4 requests per scan (4 subreddits)
- Running every 2 hours = well within limits

## Troubleshooting

### "Invalid credentials" error
- Double-check your CLIENT_ID and CLIENT_SECRET
- Make sure there are no extra spaces in `.env.local`
- Verify your Reddit password is correct

### "403 Forbidden" error
- Your account may be too new (needs to be 1+ weeks old)
- You may need more karma (aim for 50+)

### "429 Too Many Requests" error
- You're hitting rate limits
- Increase scan interval from 2 hours to 4 hours

### No posts found
- Make sure you subscribed to the subreddits
- Check that keywords match the types of posts you want
- Try lowering the relevance score threshold (currently 70)

## Reddit Rules to Follow

**CRITICAL**: Reddit is very strict about self-promotion. Follow these rules:

✅ **DO**:
- Disclose: "I work in HOA financing"
- Answer the question FIRST, pitch second
- Provide genuine value (numbers, examples, case studies)
- Only respond to posts where you have real expertise

❌ **DON'T**:
- Post the same response multiple times
- Include direct sales links in first response
- Reply to every single post (max 2-3 per day)
- Use the exact same template response everywhere

**Rule of Thumb**: If 90% of your comments are helpful and only 10% mention your business, you're fine.

## Next Steps

Once Reddit is working:
1. Test it for 1 week with manual approval
2. Review which subreddits perform best
3. Adjust keywords based on what you're seeing
4. Consider adding more niche subreddits (e.g., r/FlAHousing for Florida)
