# GitHub Setup Instructions

Your code is committed locally! Now let's push it to GitHub.

## Step 1: Create GitHub Repository

1. Go to: https://github.com/new
2. Fill in:
   - **Repository name:** `hoa-clawops-console` (or whatever you prefer)
   - **Description:** `Agent automation platform with Facebook Lead Generation integration`
   - **Visibility:** Choose **Private** (recommended - contains sensitive config)
   - **DO NOT** initialize with README, .gitignore, or license (we already have these)
3. Click **Create repository**

## Step 2: Connect and Push

After creating the repo, GitHub will show you commands. Use these:

```bash
cd "c:\Users\SPilcher\OpenClaw2.0 for linux - Copy"

# Add the GitHub remote (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/hoa-clawops-console.git

# Rename branch to main (if it's master)
git branch -M main

# Push to GitHub
git push -u origin main
```

**Example with actual username:**
```bash
git remote add origin https://github.com/SPilcher/hoa-clawops-console.git
git branch -M main
git push -u origin main
```

## Step 3: Verify

Visit your repository:
```
https://github.com/YOUR_USERNAME/hoa-clawops-console
```

You should see all your code!

## Step 4: Deploy to Render

Now you can deploy:

1. Go to: https://dashboard.render.com
2. Click **New +** → **Web Service**
3. Click **Connect GitHub**
4. Select your `hoa-clawops-console` repository
5. Configure:
   - **Name:** `hoa-clawops-backend`
   - **Build Command:** `npm install`
   - **Start Command:** `node server/index.js`
   - **Plan:** Free
6. Add all environment variables from `.env.local`
7. Click **Create Web Service**

## Important Notes

### ✅ What's Safe in Git
- All code
- Documentation
- Configuration templates (`.env.example`)

### ⚠️ What's NOT in Git (Protected)
- `.env.local` - Your actual secrets
- `data/` folder - Your database
- `node_modules/` - Dependencies

These are automatically excluded by `.gitignore`.

### Security Reminder
- Repository is set to **Private** ✅
- Secrets are in `.env.local` (not committed) ✅
- Never commit API keys or passwords ✅

## Troubleshooting

### "remote origin already exists"
```bash
git remote remove origin
git remote add origin https://github.com/YOUR_USERNAME/hoa-clawops-console.git
```

### "Authentication failed"
If using HTTPS, you need a Personal Access Token:
1. Go to: https://github.com/settings/tokens
2. Generate new token (classic)
3. Select scopes: `repo`
4. Use token as password when pushing

### "Permission denied"
Make sure you're logged into the correct GitHub account.

---

## Next Steps After Push

Once code is on GitHub:

1. **Deploy to Render** (see FACEBOOK_WEBHOOK_SETUP.md)
2. **Configure Facebook webhooks**
3. **Test real-time lead capture**

---

**Ready? Create your GitHub repo and run the commands above!** 🚀
