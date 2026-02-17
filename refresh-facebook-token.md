# Refresh Facebook Access Token

Your Facebook access token has expired. Here's how to get a new one:

## Quick Method (Recommended):

1. **Go to Facebook Graph API Explorer:**
   https://developers.facebook.com/tools/explorer/

2. **Select your app** from the dropdown (top right)
   - App: "ClawOps HOA Lead Gen" (or your app name)

3. **Click "Generate Access Token"**

4. **Select these permissions:**
   - ✅ pages_show_list
   - ✅ pages_read_engagement
   - ✅ pages_manage_posts
   - ✅ leads_retrieval
   - ✅ pages_manage_metadata
   - ✅ instagram_basic
   - ✅ instagram_content_publish
   - ✅ pages_read_user_content

5. **Click "Generate Access Token"** and authorize

6. **Copy the access token** (the long string)

7. **Convert to Long-Lived Token (60 days):**
   - Click the "ℹ️" icon next to the access token
   - Click "Open in Access Token Tool"
   - Click "Extend Access Token"
   - Copy the NEW long-lived token

8. **Paste the long-lived token here** and I'll update your .env.local file

---

## Alternative Method (Manual):

Visit this URL (replace the placeholders):
```
https://graph.facebook.com/v22.0/oauth/access_token?grant_type=fb_exchange_token&client_id=YOUR_APP_ID&client_secret=YOUR_APP_SECRET&fb_exchange_token=YOUR_SHORT_LIVED_TOKEN
```

Replace:
- `YOUR_APP_ID` = 10123882325794480
- `YOUR_APP_SECRET` = (from Facebook App Dashboard > Settings > Basic)
- `YOUR_SHORT_LIVED_TOKEN` = (from Graph API Explorer)

---

Once you have the new long-lived token, paste it here!
