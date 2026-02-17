# Facebook Webhooks Setup Guide - Real-Time Lead Notifications

🎯 **Goal:** Get instant notifications when someone fills out your Facebook Lead Ad form

---

## ✅ What I Just Built

I've added **webhook endpoints** to your server that Facebook can call when a new lead comes in. Here's what's ready:

### Webhook Endpoints Created:
- **GET** `/api/facebook/webhook` - Verification endpoint (Facebook uses this to confirm your server)
- **POST** `/api/facebook/webhook` - Event receiver (Facebook calls this when new lead arrives)

### Your Webhook Verify Token:
```
275dbc1475d3c003cd378de4adf7be9e5a6ba3a29ca91a6b2cf329c2ad30d794
```
**Keep this safe!** You'll need it in step 3 below.

---

## 🚨 The Challenge: Your Server Must Be Publicly Accessible

Facebook cannot reach `localhost:3001` because it's only accessible from your computer.

You have **3 options**:

---

## Option 1: Use ngrok (Quick Testing - 5 minutes)

Perfect for **testing right now** without deploying anywhere.

### Step 1: Install ngrok
```bash
# Download from: https://ngrok.com/download
# Or via chocolatey (Windows):
choco install ngrok

# Or download and extract the exe
```

### Step 2: Start ngrok tunnel
```bash
# Make sure your server is running first:
npm run dev

# In a NEW terminal, run:
ngrok http 3001
```

You'll see output like:
```
Forwarding  https://a1b2-3c4d-5e6f.ngrok-free.app -> http://localhost:3001
```

### Step 3: Copy your ngrok URL
Your webhook URL will be:
```
https://a1b2-3c4d-5e6f.ngrok-free.app/api/facebook/webhook
```
(Replace with YOUR ngrok URL)

**⚠️ Important:**
- Free ngrok URLs change every time you restart
- Free tier has usage limits
- Use this for testing, not production

**Go to:** [Option 4 - Configure Facebook](#option-4-configure-facebook-webhooks-all-deployment-methods)

---

## Option 2: Deploy to Render (Free, Production-Ready - 30 minutes)

Best for **permanent hosting** without paying.

### Step 1: Create Render account
1. Go to: https://render.com
2. Sign up (free)
3. Connect your GitHub account

### Step 2: Push code to GitHub
```bash
# If not already a git repo:
git init
git add .
git commit -m "Add Facebook webhook support"

# Create repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### Step 3: Create Web Service on Render
1. Dashboard → **New +** → **Web Service**
2. Connect your GitHub repo
3. Settings:
   - **Name:** `hoa-clawops-console` (or whatever you want)
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm run dev:server`
   - **Plan:** Free

### Step 4: Add Environment Variables
In Render dashboard → Environment:

Copy ALL variables from your `.env.local` file, including:
```
FACEBOOK_APP_ID=10123882325794480
FACEBOOK_PAGE_ID=1001233166403710
FACEBOOK_ACCESS_TOKEN=EAAiYWGHE1a4...
FACEBOOK_WEBHOOK_VERIFY_TOKEN=275dbc1475d3c003cd378de4adf7be9e5a6ba3a29ca91a6b2cf329c2ad30d794
```

### Step 5: Deploy
Click **Create Web Service**

Your public URL will be:
```
https://hoa-clawops-console.onrender.com
```

Your webhook URL:
```
https://hoa-clawops-console.onrender.com/api/facebook/webhook
```

**Go to:** [Option 4 - Configure Facebook](#option-4-configure-facebook-webhooks-all-deployment-methods)

---

## Option 3: Deploy to Railway (Simple, $5/month - 15 minutes)

Easiest deployment with custom domains.

### Step 1: Create Railway account
1. Go to: https://railway.app
2. Sign up with GitHub

### Step 2: New Project
1. Dashboard → **New Project**
2. Deploy from GitHub repo
3. Select your repo

### Step 3: Add Environment Variables
Settings → Variables → **Raw Editor**

Paste ALL your `.env.local` contents

### Step 4: Deploy
Railway auto-deploys on push

Your URL:
```
https://your-project.up.railway.app
```

Webhook URL:
```
https://your-project.up.railway.app/api/facebook/webhook
```

**Go to:** [Option 4 - Configure Facebook](#option-4-configure-facebook-webhooks-all-deployment-methods)

---

## Option 4: Configure Facebook Webhooks (All Deployment Methods)

**Prerequisites:**
- ✅ Server running publicly (via ngrok, Render, or Railway)
- ✅ You have your webhook URL (from option 1, 2, or 3)
- ✅ You have your verify token: `275dbc1475d3c003cd378de4adf7be9e5a6ba3a29ca91a6b2cf329c2ad30d794`

---

### Step 1: Go to Facebook App Dashboard

https://developers.facebook.com/apps/10123882325794480/webhooks/

### Step 2: Add Webhook Subscription

1. Click **Add Subscription** dropdown
2. Select **Page**

### Step 3: Configure Webhook

Fill in the form:

**Callback URL:**
```
https://YOUR-PUBLIC-URL/api/facebook/webhook
```

Examples:
- ngrok: `https://a1b2-3c4d-5e6f.ngrok-free.app/api/facebook/webhook`
- Render: `https://hoa-clawops-console.onrender.com/api/facebook/webhook`
- Railway: `https://your-project.up.railway.app/api/facebook/webhook`

**Verify Token:**
```
275dbc1475d3c003cd378de4adf7be9e5a6ba3a29ca91a6b2cf329c2ad30d794
```

**Fields to Subscribe:**
- ✅ Check `leadgen` (this is the important one!)

### Step 4: Verify and Save

Click **Verify and Save**

**What happens:**
1. Facebook sends GET request to your webhook URL
2. Your server receives it and checks the verify token
3. If token matches, responds with challenge
4. Facebook confirms webhook is valid
5. ✅ Done!

**If verification fails:**
- Check your server logs for errors
- Verify your webhook URL is correct and publicly accessible
- Verify token matches exactly
- Make sure server is running

---

## Step 5: Subscribe to Your Page

After webhook is verified:

1. In the Webhooks section, find your **Page subscription**
2. Click **Add Subscriptions**
3. Check **leadgen** checkbox
4. Click **Save**

---

## ✅ Testing Your Webhook

### Test 1: Manual Test Lead

1. Go to your Facebook Page
2. Find your Lead Ad or create a test lead form
3. Fill it out yourself (use test data)
4. Submit

### Test 2: Check Server Logs

You should see:
```
[Facebook Webhook] Event received
[Facebook Webhook] Processing event: leadgen
[Facebook Webhook] New lead detected!
  Lead ID: 123456789
  Form ID: 987654321
[FacebookLeadService] Processing webhook lead: 123456789
[FacebookLeadService] ✅ Webhook lead 123456789 stored successfully
```

### Test 3: Check Database

```bash
sqlite3 data/clawops.db "SELECT * FROM leads ORDER BY created_at DESC LIMIT 1"
```

You should see your test lead!

---

## 🎯 What Happens Now (Workflow)

```
1. Someone fills out Facebook Lead Ad
        ↓
2. Facebook instantly calls YOUR webhook
        ↓
3. Your server receives notification
        ↓
4. Server fetches full lead data from Facebook
        ↓
5. Lead is parsed and stored in database
        ↓
6. Lead is ready for processing (email, CRM sync, etc.)
```

**Total time:** < 2 seconds from form submission to database!

---

## 🔧 Troubleshooting

### "Webhook verification failed"

**Check:**
1. Is your server publicly accessible? Test: `curl https://YOUR-URL/api/facebook/webhook?hub.mode=subscribe&hub.verify_token=275dbc1475d3c003cd378de4adf7be9e5a6ba3a29ca91a6b2cf329c2ad30d794&hub.challenge=test`
   - Should return: `test`
2. Is `FACEBOOK_WEBHOOK_VERIFY_TOKEN` in your environment variables?
3. Did you copy the token exactly (no extra spaces)?

### "No webhook events received"

**Check:**
1. Did you subscribe to the `leadgen` field?
2. Did you add page subscription (not just app subscription)?
3. Is your page connected to the app?
4. Check server logs - are events coming in but failing?

### "Server not receiving events"

**Check:**
1. Is server actually running? `curl https://YOUR-URL/api/health`
2. Check deployment logs (Render/Railway dashboard)
3. Is webhook URL still correct? (ngrok URLs change on restart)

---

## 📊 Monitoring Webhooks

### Check Webhook Status

Facebook Developer Dashboard → Webhooks:
- Shows recent deliveries
- Shows success/failure rate
- Shows error messages

### View Server Logs

**Local (ngrok):**
```bash
# Check terminal where npm run dev is running
```

**Render:**
Dashboard → Logs

**Railway:**
Dashboard → Deployments → View Logs

---

## 🔄 Polling vs Webhooks Comparison

| Feature | Polling (Old) | Webhooks (New) |
|---------|---------------|----------------|
| **Latency** | 5 minutes | < 2 seconds |
| **API Calls** | Every 5 min | Only when lead arrives |
| **Reliability** | Miss leads if server down | Facebook retries |
| **Setup** | Easy | Requires public URL |
| **Best For** | Development | Production |

---

## 💡 Next Steps After Webhooks Work

Once webhooks are receiving leads, you can:

1. **Stop polling** (no longer needed):
   ```bash
   POST /api/facebook/polling/stop
   ```

2. **Add auto-responder** - Email leads immediately
3. **Add CRM sync** - Push to Salesforce/HubSpot
4. **Add lead scoring** - Auto-score leads 0-100
5. **Add notifications** - Slack/SMS when hot lead comes in

Want me to set any of these up?

---

## 🆘 Need Help?

**Tell me where you're stuck:**

- "I'm using ngrok but verification fails"
- "I deployed to Render but no events come through"
- "Webhook verified but leads not storing"
- "I want to use a different deployment option"

---

## 📋 Quick Reference

**Your webhook verify token:**
```
275dbc1475d3c003cd378de4adf7be9e5a6ba3a29ca91a6b2cf329c2ad30d794
```

**Webhook endpoint:**
```
/api/facebook/webhook
```

**Facebook webhooks dashboard:**
```
https://developers.facebook.com/apps/10123882325794480/webhooks/
```

**Test webhook locally:**
```bash
curl -X POST http://localhost:3001/api/facebook/webhook \
  -H "Content-Type: application/json" \
  -d '{"object":"page","entry":[{"changes":[{"field":"leadgen","value":{"leadgen_id":"123"}}]}]}'
```

---

**Ready to set up webhooks? Tell me which option you want to use (ngrok, Render, or Railway) and I'll guide you through it!** 🚀
