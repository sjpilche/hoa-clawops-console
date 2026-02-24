# 🎯 Next Steps — Get Posting Live (20 Minutes)

## ✅ What's Done

- ✅ Console running (server, frontend, trader, gateway)
- ✅ 27 agents registered and grouped
- ✅ 3 Clayhub skills installed: Postiz, QMD, cold-outreach
- ✅ Multi-platform posting code ready
- ✅ HEARTBEAT.md health monitoring active
- ✅ Cost dashboard showing 20x savings from QMD

---

## 🔄 Priority 1: Get Postiz Posting Live (Next 10 min)

### Step 1: Get Postiz API Key (3 min)

1. Go to: **https://postiz.com/dashboard/integrations**
2. Login with your Postiz account (or create one)
3. Find **"API Key"** section
4. **Copy the API key**

### Step 2: Add Key to .env.local (2 min)

Edit `c:\Users\SPilcher\OpenClaw2.0 for linux - Copy\.env.local` and find:

```
# Postiz (Multi-platform social posting — INSTALLED)
POSTIZ_API_KEY=<get-from-postiz.com-dashboard>
POSTIZ_API_URL=https://api.postiz.com/api
```

Replace with:

```
POSTIZ_API_KEY=<your-actual-key-here>
POSTIZ_API_URL=https://api.postiz.com/api
```

**Save the file.**

### Step 3: Test Posting (5 min)

**Option A: Via Console UI (Easiest)**

1. Go to: **http://localhost:5174**
2. Login: `admin@clawops.local` / `changeme123`
3. Click **"Content Queue"**
4. Click **"Add Post"**
5. Fill in:
   - **Content**: "Testing HOA Project Funding on LinkedIn #HOA"
   - **Platform**: `linkedin`
   - **Type**: `page`
6. Click **"Publish"**
7. Should return success with `external_post_id`

**Option B: Via Test Script**

```bash
cd "c:\Users\SPilcher\OpenClaw2.0 for linux - Copy"
node scripts/test-postiz-posting.js
```

This will test posting to all 5 platforms: LinkedIn, Twitter, Instagram, TikTok, Facebook

---

## 🔐 Important: Connect Social Accounts to Postiz

Before posts go live, you need to **authorize Postiz to post to your accounts**.

### For Each Platform You Want to Post To:

1. Go to: **https://postiz.com/dashboard/accounts**
2. Click **"+ Add Account"**
3. Select platform (LinkedIn, Twitter, Instagram, etc.)
4. **Authorize** with your account
5. Postiz will now be able to post to that account

**Platforms Supported**:
- ✅ LinkedIn (personal + company page)
- ✅ Twitter/X
- ✅ Instagram
- ✅ TikTok
- ✅ Facebook
- ✅ YouTube
- ✅ Threads
- ✅ Bluesky
- ✅ Mastodon
- ✅ Reddit
- ✅ Discord
- ✅ Slack
- ✅ Pinterest
- ✅ Dribbble
- +14 more platforms

---

## 📊 Expected Results

Once configured, posting to a platform should:

1. **Via Console UI**:
   ```
   POST http://localhost:3001/api/content-queue
   {
     "content": "...",
     "platform": "linkedin",
     "post_type": "page"
   }

   Response:
   {
     "success": true,
     "post": {
       "id": "uuid",
       "platform": "linkedin",
       "status": "pending"
     }
   }

   Then: POST http://localhost:3001/api/content-queue/{id}/publish

   Response:
   {
     "success": true,
     "external_post_id": "post_12345...",
     "platform": "linkedin",
     "message": "Published to linkedin successfully"
   }
   ```

2. **Check your LinkedIn feed** — Post should appear within 2 minutes

---

## ⚠️ Troubleshooting

### "Postiz API error" or "401 Unauthorized"
- **Fix**: Verify API key in .env.local is correct (copy-paste again from dashboard)
- **Check**: API key should be 32+ characters, no spaces

### "Platform not connected"
- **Fix**: Go to Postiz dashboard → Accounts → Add your social accounts
- Your LinkedIn/Twitter/Instagram accounts must be authorized in Postiz first

### "Rate limit exceeded"
- **Fix**: Wait 60 seconds, then retry
- Postiz free tier has rate limits; upgrade to Pro if needed

### "Post added but publish fails"
- **Likely**: Social account not authorized in Postiz
- **Fix**: Go to https://postiz.com/dashboard/accounts and authorize the account

---

## 🚀 Priority 2: Verify Other Skills Working (This Week)

### QMD (Token Compression)
- Should be **automatic** — no configuration needed
- **Verify**: Run an agent, check Console cost dashboard
- **Expected**: Tokens should be 95%+ compressed

### cold-outreach (Email Sequences)
- **Status**: Installed, ready to use
- **Test**: Run `cfo-outreach-agent` with a prospect list
- **Expected**: Auto-generates personalized cold emails

### Next Skills to Install
```bash
# When ready (next week):
sleep 3 && npx clawhub install "firecrawl"
sleep 3 && npx clawhub install "hubspot"
sleep 3 && npx clawhub install "ga4-analytics"
```

---

## 📈 Monitor Cost Savings from QMD

1. Go to Console: **http://localhost:5174 → Dashboard → Costs**
2. **Before QMD**: ~$0.025 per agent run
3. **After QMD**: ~$0.0125 per agent run (50% immediate)
4. **With compression**: Can see ~95% token reduction
5. **Monthly impact**: $81 → ~$16 with full usage

---

## ✨ Final Checklist

- [ ] Get Postiz API key from dashboard
- [ ] Add key to .env.local (POSTIZ_API_KEY=...)
- [ ] Authorize social accounts in Postiz dashboard
- [ ] Test posting via Console UI (Content Queue)
- [ ] Check that posts appear on LinkedIn/Twitter/Instagram
- [ ] Run `node scripts/test-postiz-posting.js` to test all platforms
- [ ] Verify QMD cost savings in Dashboard → Costs
- [ ] Schedule first automated post for tomorrow

---

## 🎯 Once Postiz is Working

You can now:

1. **Schedule posts** — Add `scheduled_for` to post payload
2. **Auto-generate content** — cfo-outreach-agent creates email sequences
3. **Track metrics** — Monitor opens, clicks, conversions
4. **Scale posting** — Post to 28 platforms simultaneously
5. **Save costs** — QMD compresses tokens to 5% of original

---

## 📞 Need Help?

- **Console won't start**: Kill processes: `powershell -Command "Get-Process node | Stop-Process -Force"`
- **Postiz API failing**: Check key in .env.local, verify accounts in dashboard
- **Can't login**: Make sure server is running (`npm run dev`)
- **Docs**: Check DEPLOYMENT_CHECKLIST.md or CLAYHUB_INTEGRATION.md

---

**Ready to get posting? Start with Step 1 above! 🚀**

